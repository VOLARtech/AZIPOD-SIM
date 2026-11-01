// Ship damage: what hard contact, grounding and collision do to the hull and the propulsion, and what
// follows: flooding, sinkage, trim and list, a slower and heavier ship, units that lose thrust, and a ship
// that can be lost.
//
// Impact. Every hard contact point (quay, bank, a fender crushed past its limit, another ship) and every
// grounded keel point absorbs energy: the contact force times the speed it closes at (or slides at, on the
// bottom). It is summed per hull zone (five sections along the hull, each port, starboard and bottom).
// Below a rupture energy the plating only dents. Above it the hull is breached, and the hole grows with
// the energy beyond it, after Minorsky's linear relation between collision energy and the volume of
// steel destroyed (Minorsky 1959, 47.2 MJ per m³). The rupture energy grows with the size of the hull
// structure (scantlings grow with the ship) as displacement^(2/3): a calibration, not a single-source
// value, set so a large ship hitting concrete square on at around 1.5 kn holes her, and a yacht at about 3 kn.
//
// Flooding. Water comes in through each hole as through an orifice (discharge coefficient 0.6) under the
// head from the waterline to the hole (a third of the draught down for the side, the keel for the bottom),
// less the water already inside. It fills that section's compartment (permeability 0.85) while the bilge
// pumps take some out. Its weight sinks the ship (over the waterplane), trims her (over the longitudinal
// metacentric height) and, from a side hole, lists her (over GM, reduced by the free surface) until
// cross-flooding spreads it across the section (time constant 3 minutes).
//
// Consequences. Draught and trim feed the grounding check and the under-keel clearance. The extra
// displacement and the holes add resistance. A hit at the stern or bow damages the propulsors or bow
// thruster there (thrust lost). The ship is lost if she capsizes (list past 25°, or GM gone) or her deck goes under.
import { G, RHO, ShipSpec } from './ship';
import type { ShipState } from './sim';

export type Side = -1 | 0 | 1;                 // port, bottom, starboard
export interface Zone { section: number; side: Side; E: number; dent: boolean; hole: number; y: number }   // y: where across the hull it was hit (energy-weighted)
export interface Compartment { name: string; x: number; len: number; V: number; W: number; asym: number }
export interface DamageEvent { t: number; text: string; level: 'info' | 'warn' | 'heavy' }
export const SECTIONS = ['BOW', 'FORWARD', 'MIDSHIPS', 'AFT', 'STERN'] as const;
/** Section edges as fractions of L from the stern (x = −L/2) to the bow. */
const EDGES = [1, 0.8, 0.6, 0.35, 0.15, 0];

/** A contact or grounding point this step, in body axes. */
export interface Hit { x: number; y: number; dE: number; bottom: boolean; with: string }

export class Damage {
  zones: Zone[] = [];
  comp: Compartment[] = [];
  /** Thrust left on each propulsion unit and the bow thruster, 0..1. */
  health: number[]; btHealth = 1;
  sink = 0; trim = 0; list = 0;              // m; rad, + bow down; rad, + starboard down
  GMeff = 0; inflow = 0; pumping = 0;
  lost: '' | 'capsized' | 'foundered' = '';
  events: DamageEvent[] = [];
  private deckUnder = 0;
  /** Resting on the bottom: she cannot settle any further, so she cannot founder (but can still capsize). */
  aground = false;
  readonly Ebreach: number; readonly disp: number;
  constructor(public spec: ShipSpec) {
    const s = spec, L = s.L;
    this.disp = RHO * L * s.B * s.T * s.Cb;                                     // kg
    this.Ebreach = Math.max(0.4e6, 4e6 * Math.pow(this.disp / 1e7, 2 / 3));     // J (Δ in 10 000 t)
    for (let k = 0; k < 5; k++) for (const side of [-1, 0, 1] as Side[]) this.zones.push({ section: k, side, E: 0, dent: false, hole: 0, y: 0 });
    for (let k = 0; k < 5; k++) {
      const x0 = (EDGES[k + 1] - 0.5) * L - s.xg, x1 = (EDGES[k] - 0.5) * L - s.xg, len = x1 - x0;   // body x is about the CG
      const fb = s.look.freeboard;
      this.comp.push({ name: SECTIONS[k], x: (x0 + x1) / 2, len, V: len * s.B * (s.T + fb) * s.Cb * 0.85, W: 0, asym: 0 });
    }
    this.health = s.pods.map(() => 1);
    this.GMeff = this.GM0;
  }
  get GM0() { return this.spec.roll?.GM ?? Math.min(3, 0.08 * this.spec.B); }
  get any() { return this.zones.some(z => z.dent) || this.health.some(h => h < 1) || this.btHealth < 1; }
  get water() { return this.comp.reduce((a, c) => a + c.W, 0); }
  get holes() { return this.zones.reduce((a, z) => a + z.hole, 0); }
  sectionOf(x: number) { const f = (x + this.spec.xg) / this.spec.L + 0.5; for (let k = 0; k < 5; k++) if (f >= EDGES[k + 1]) return k; return 4; }
  /** Extra draught at a body-x from flooding: sinkage plus trim. */
  draughtAt(x: number) { return this.sink + x * Math.tan(this.trim); }
  private log(t: number, text: string, level: DamageEvent['level']) { this.events.unshift({ t, text, level }); this.events.length = Math.min(this.events.length, 12); }

  /** Take this step's hits, flood, settle. Returns alerts to raise. */
  step(dt: number, st: ShipState, hits: Hit[]): DamageEvent[] {
    const out: DamageEvent[] = [], s = this.spec, Eb = this.Ebreach, Edent = 0.08 * Eb;
    const side = (y: number, bottom: boolean): Side => (bottom ? 0 : y < 0 ? -1 : 1);
    for (const h of hits) {
      if (h.dE <= 0) continue;
      const k = this.sectionOf(h.x), sd = side(h.y, h.bottom), z = this.zones.find(q => q.section === k && q.side === sd)!;
      const before = z.E; z.y = (z.y * z.E + h.y * h.dE) / (z.E + h.dE); z.E += h.dE;
      const where = `${SECTIONS[k]} ${sd === 0 ? 'BOTTOM' : sd < 0 ? 'PORT' : 'STBD'}`;
      if (!z.dent && z.E > Edent) { z.dent = true; out.push({ t: st.t, text: `HULL DAMAGE · ${where} dented (${h.with})`, level: 'warn' }); }
      if (z.E > Eb) {
        // Minorsky: the energy past rupture tears out steel at 47.2 MJ/m³; ≈ 0.25 m of plating and frames smeared over the hole
        const A = Math.min(0.25 * this.comp[k].len * s.T, 0.05 + (z.E - Eb) / 47.2e6 / 0.25);
        if (before <= Eb) out.push({ t: st.t, text: `HULL BREACHED · ${where} · FLOODING`, level: 'heavy' });
        z.hole = Math.max(z.hole, A);
      }
      // propulsors and the bow thruster in the way of the hit
      // (a propeller or pod right where she struck, or a propeller strike on the bottom)
      s.pods.forEach((p, i) => {
        if (Math.abs(h.x - p.x) > Math.max(0.08 * s.L, 2 * p.D) || (sd !== 0 && Math.sign(p.y) !== 0 && Math.sign(p.y) !== sd && Math.abs(p.y) > s.B / 4)) return;
        const hNew = z.E > Eb ? 0.4 : z.E > (h.bottom ? 0.1 : 0.3) * Eb ? (h.bottom ? 0.7 : 0.85) : 1;
        if (hNew < this.health[i]) { this.health[i] = hNew; out.push({ t: st.t, text: `${p.label} ${p.kind === 'shaft' ? 'PROPELLER / RUDDER' : 'UNIT'} DAMAGED · ${Math.round(hNew * 100)} % thrust`, level: 'heavy' }); }
      });
      if (s.bowThruster.Tmax > 0 && Math.abs(h.x - s.bowThruster.x) < 0.06 * s.L) {
        const hNew = z.E > Eb ? 0.3 : z.E > 0.3 * Eb ? 0.8 : 1;
        if (hNew < this.btHealth) { this.btHealth = hNew; out.push({ t: st.t, text: `BOW THRUSTER DAMAGED · ${Math.round(hNew * 100)} %`, level: 'heavy' }); }
      }
    }
    this.flood(dt, st, out);
    for (const e of out) this.log(e.t, e.text, e.level);
    return out;
  }

  private flood(dt: number, st: ShipState, out: DamageEvent[]) {
    const s = this.spec, fb = s.look.freeboard, Hd = s.T + fb;
    let qin = 0;
    for (let k = 0; k < 5; k++) {
      const c = this.comp[k]; let q = 0, qs = 0;
      for (const z of this.zones) {
        if (z.section !== k || z.hole <= 0 || c.W >= c.V) continue;
        const head = (z.side === 0 ? s.T : s.T / 3) + this.draughtAt(c.x) - (c.W / c.V) * Hd;   // outside over inside
        if (head <= 0) continue;
        const qz = 0.6 * z.hole * Math.sqrt(2 * G * head);
        q += qz; qs += qz * Math.max(-1, Math.min(1, z.y / (s.B / 2)));   // a hole near the centreline floods both sides alike
      }
      // cross-flooding spreads the water across the section over a few minutes (time constant 3 min)
      c.asym *= Math.exp(-dt / 180);
      const dW = Math.min(c.V - c.W, q * dt);
      if (dW > 0) {
        // water in from one side lies there until it spreads across the section
        c.asym = (c.asym * c.W + (qs / (q || 1)) * dW) / (c.W + dW);
        c.W += dW;
      }
      qin += q;
    }
    // bilge and ballast pumps on the wettest compartment
    const Qp = 0.05 * s.L / 100, wet = this.comp.reduce((a, c) => (c.W > a.W ? c : a), this.comp[0]);
    this.pumping = wet.W > 0 ? Math.min(Qp, wet.W / dt) : 0;
    wet.W = Math.max(0, wet.W - this.pumping * dt);
    this.inflow = qin;
    // settle: sinkage over the waterplane, trim over GM_L, list over GM less the free surface
    const W = this.water * RHO, Awp = 0.85 * s.L * s.B, disp = this.disp + W;
    this.sink = this.water / Awp;
    const GML = 0.06 * s.L * s.L / s.T;
    this.trim = Math.atan(this.comp.reduce((a, c) => a + c.W * RHO * c.x, 0) / (disp * GML));
    const fs = this.comp.reduce((a, c) => a + (c.W > 0 && c.W < c.V ? 0.15 * c.len * s.B ** 3 / 12 : 0), 0) * RHO / disp;
    this.GMeff = this.GM0 - fs;
    const heel = this.comp.reduce((a, c) => a + c.W * RHO * c.asym * s.B / 4, 0);
    this.list = this.GMeff > 0.02 ? Math.atan(heel / (disp * this.GMeff)) : Math.sign(heel || 1) * 0.6;
    if (this.lost) return;
    // lost: capsize (list past 25°, or no stability left) or founder (deck under at an end for a minute)
    // deck at the ends: the sheer lifts the bow (about half as much again as the midship freeboard)
    const under = this.draughtAt(s.L / 2) > fb * 1.5 || this.draughtAt(-s.L / 2) > fb;
    this.deckUnder = under && !this.aground ? this.deckUnder + dt : 0;
    if (Math.abs(this.list) > 25 * Math.PI / 180 || (this.water > 0 && this.GMeff <= 0)) { this.lost = 'capsized'; out.push({ t: st.t, text: 'SHIP LOST · CAPSIZED', level: 'heavy' }); }
    else if (this.deckUnder > 60) { this.lost = 'foundered'; out.push({ t: st.t, text: 'SHIP LOST · FOUNDERED', level: 'heavy' }); }
  }

  /** Extra resistance from the added displacement and water through the holes (body X, N). */
  resistance(u: number) {
    const s = this.spec, Tsum = s.pods.reduce((a, p) => a + p.Tb, 0) * (1 - s.tded), V = s.vmaxKn * 0.514444;
    const R = Tsum * (u / V) ** 2;
    return -Math.sign(u) * (R * (Math.pow(1 + this.water * RHO / this.disp, 2 / 3) - 1) + 0.5 * RHO * 0.8 * this.holes * u * u);
  }
}
