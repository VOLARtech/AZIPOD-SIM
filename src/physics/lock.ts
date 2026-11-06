// A ship lock worked by a lock master: two rolling gates that run sideways into recesses in the walls, a
// chamber whose level is changed through valves, CEVNI entry signals, and the lock master on VHF.
//   Levelling: dη/dt = Q / (A_chamber − A_waterplane), Q = μ·A_v(t)·√(2g|ΔH|), the valves opening over a set time.
//   Forces on a ship in the chamber (PIANC WG155): the slope of the translatory wave, i = (dQ/dt)/(g·A_wet),
//   gives F = Δ·g·i along the chamber (away from a filling end, toward an emptying one); filling through the
//   gates, part of the jet's momentum ρQ²/A_open reaches her as she blocks the section (½·m of it); a ship
//   coming in with the far gate shut pushes the water ahead of her (piston: −½ρ·C·A_s·u|u|·(m/(1−m))², m the
//   blockage). Design aim (PIANC WG155): hawser forces ≤ 1 ‰ of the ship's weight.
// Values marked "config" are estimates for the IJmuiden Zeesluis, kept in its LockDef.
import type { Obstacle, Pt } from './contact';
import type { ShipSpec } from './ship';
import type { ShipState, Wrench } from './sim';

export interface LockDef {
  id: string; name: string; vhf: string;
  /** Chamber end centres: a, the outer (sea) end; b, the inner (canal) end. */
  a: Pt; b: Pt;
  width: number;               // between the walls [m]
  sill: number;                // sill and floor below datum [m]
  gateThick: number;           // gate thickness along the chamber [m]
  gateTravel: number;          // time for a gate to run open or shut [s] (config)
  recess: 1 | -1;              // the side (to the right of a → b: +1) the gates roll into
  valveArea: number; mu: number; valveTime: number;   // valves: area [m²], discharge coefficient, opening time [s] (config)
  outer: string; inner: string;                         // level zones beyond each end
  maxLength: number;           // usable length between the gates [m]
  /** Least charted depths below datum of the approaches beyond each end, and the highest the outer level
   *  rises (high water), for the lock master's draught check. */
  approach?: { outer: number; inner: number }; highWater?: number;
}
/** The water a ship of draught T has to pass on her way through: over the sill and in each approach, now
 *  (levels lo, li outside and inside) and at best (the outer level at high water). */
export function lockLimits(d: LockDef, lo: number, li: number) {
  const hw = d.highWater ?? lo, ap = d.approach;
  const out = [{ what: 'over the sill', now: d.sill + Math.min(lo, li), best: d.sill + Math.min(Math.max(lo, hw), li) }];
  if (ap) out.push({ what: 'in the outer harbour', now: ap.outer + lo, best: ap.outer + Math.max(lo, hw) }, { what: 'in the canal', now: ap.inner + li, best: ap.inner + li });
  return out;
}
/** Under-keel clearance a lock master asks for: 10 % of the draught, at least 1 m. */
export const lockUkc = (T: number) => Math.max(1, 0.1 * T);
export type Signal = 'red' | 'redgreen' | 'green';
export type Phase = 'idle' | 'preparing' | 'opening' | 'entering' | 'mooring' | 'closing' | 'levelling' | 'releasing' | 'leaving' | 'done';
export interface VhfLine { t: number; from: string; text: string }
interface Gate { pos: number; target: number; v: number; blocked: boolean }   // pos 0 shut … 1 open

const G = 9.81, RHO = 1025;

export class LockSim {
  readonly L: number; readonly u: Pt; readonly w: Pt;
  eta: number;                                 // chamber level [m above datum]
  gates: { a: Gate; b: Gate };
  phase: Phase = 'idle';
  from: 'a' | 'b' | null = null;               // the end the ship comes in by
  log: VhfLine[] = [];
  Q = 0; dQ = 0; valve = 0; force = { X: 0, Y: 0, N: 0, F: 0 };
  private hold = 0; private warned = new Set<string>(); private t = 0;

  constructor(readonly def: LockDef, readonly levels: (zone: string) => number, open: 'a' | 'b' | null = 'a') {
    const dn = def.b[0] - def.a[0], de = def.b[1] - def.a[1];
    this.L = Math.hypot(dn, de); this.u = [dn / this.L, de / this.L]; this.w = [-this.u[1], this.u[0]];
    this.gates = { a: { pos: open === 'a' ? 1 : 0, target: open === 'a' ? 1 : 0, v: 0, blocked: false }, b: { pos: open === 'b' ? 1 : 0, target: open === 'b' ? 1 : 0, v: 0, blocked: false } };
    this.eta = open === 'b' ? levels(def.inner) : levels(def.outer);
  }
  /** Along-chamber and across coordinates of a point (s from the outer end, w to the right of a → b). */
  local(n: number, e: number): [number, number] {
    const dn = n - this.def.a[0], de = e - this.def.a[1];
    return [dn * this.u[0] + de * this.u[1], dn * this.w[0] + de * this.w[1]];
  }
  inChamber(n: number, e: number) { const [s, w] = this.local(n, e); return s >= 0 && s <= this.L && Math.abs(w) <= this.def.width / 2; }
  /** Messages said so far (the log keeps the last 40). */
  said = 0;
  private say(text: string, from = this.def.name) { this.log.push({ t: this.t, from, text }); this.said++; if (this.log.length > 40) this.log.shift(); }
  private once(key: string, text: string) { if (!this.warned.has(key)) { this.warned.add(key); this.say(text); } }
  private lvl(end: 'a' | 'b') { return this.levels(end === 'a' ? this.def.outer : this.def.inner); }

  /** Can this ship pass now: null, or why not (and, for draught, whether the tide will let her). */
  verdict(sp: Pick<ShipSpec, 'LOA' | 'B' | 'T' | 'name'>): string | null {
    const d = this.def;
    if (sp.LOA > d.maxLength) return `${sp.name} is ${sp.LOA.toFixed(0)} m long; the chamber takes ${d.maxLength} m.`;
    if (sp.B > d.width - 2) return `${sp.name} is ${sp.B.toFixed(1)} m wide; the chamber is ${d.width} m between the walls.`;
    const ukc = lockUkc(sp.T), need = sp.T + ukc, lims = lockLimits(d, this.lvl('a'), this.lvl('b'));
    const never = lims.filter(l => need > l.best).sort((x, y) => x.best - y.best)[0];
    if (never) return `${sp.name} draws ${sp.T} m; ${never.what} there is ${never.best.toFixed(1)} m at best and she needs ${need.toFixed(1)} m with ${ukc.toFixed(1)} m under her keel. She cannot pass this lock.`;
    const wait = lims.filter(l => need > l.now).sort((x, y) => x.now - y.now)[0];
    if (wait) return `${sp.name} draws ${sp.T} m; ${wait.what} there is ${wait.now.toFixed(1)} m now. Wait for the tide: she needs ${need.toFixed(1)} m.`;
    return null;
  }

  /** The ship calls the lock on VHF. */
  call(sp: ShipSpec, st: ShipState) {
    this.say(`${this.def.name}, ${sp.name}, request a lockage.`, sp.name);
    if (this.phase !== 'idle' && this.phase !== 'done') { this.say(`${sp.name}, ${this.def.name}: lockage in progress, stand by.`); return; }
    const why = this.verdict(sp);
    if (why) { this.say(`${sp.name}, ${this.def.name}: negative. ${why}`); return; }
    const [s] = this.local(st.n, st.e);
    this.from = s < this.L / 2 ? 'a' : 'b';
    this.warned.clear();
    const lvl = this.lvl(this.from), ready = Math.abs(this.eta - lvl) < 0.05;
    const wall = this.def.recess > 0 ? 'south' : 'north';
    if (ready && this.gates[this.from].pos > 0.99) {
      this.phase = 'entering';
      this.say(`${sp.name}, ${this.def.name}: the ${this.from === 'a' ? 'sea' : 'canal'} gate is open, the light is green. Enter at no more than 2 knots and make fast on the ${wall} wall, two lines at least.`);
    } else if (ready) {
      this.phase = 'opening'; this.gates[this.from].target = 1;
      this.say(`${sp.name}, ${this.def.name}: opening the ${this.from === 'a' ? 'sea' : 'canal'} gate for you, about ${Math.round(this.def.gateTravel / 60)} minutes. Enter on the green light and make fast on the ${wall} wall.`);
    } else {
      this.phase = 'preparing'; this.gates.a.target = 0; this.gates.b.target = 0;
      this.say(`${sp.name}, ${this.def.name}: the chamber is at the other level; turning it round for you, about 20 minutes. Wait at the waiting berth.`);
    }
  }

  /** One step: gates, valves and level, the lock master's next move, and the forces on the ship. */
  step(dt: number, t: number, st: ShipState, sp: ShipSpec, linesFast: number) {
    this.t = t;
    const d = this.def, inside = this.inChamber(st.n, st.e), [s] = this.local(st.n, st.e);
    // gates: run toward their target, but never into a hull in their path
    for (const k of ['a', 'b'] as const) {
      const g = this.gates[k], dir = Math.sign(g.target - g.pos);
      g.blocked = dir < 0 && this.hullInGatePath(k, st, sp);
      if (g.blocked) { this.once(`block-${k}`, `${sp.name}, ${this.def.name}: your ${k === this.from ? 'stern' : 'bow'} is in the way of the ${k === 'a' ? 'sea' : 'canal'} gate. Gate stopped. Move clear.`); g.v = 0; continue; }
      g.v = dir / d.gateTravel; g.pos = Math.max(0, Math.min(1, g.pos + g.v * dt));
      if (Math.abs(g.pos - g.target) < 1e-9) g.v = 0;
    }
    // levelling: valves at the end being levelled to
    const lev = this.phase === 'levelling' || this.phase === 'preparing';
    const toEnd: 'a' | 'b' | null = this.phase === 'levelling' ? (this.from === 'a' ? 'b' : 'a') : this.phase === 'preparing' ? this.from : null;
    const Q0 = this.Q;
    if (lev && toEnd && this.gates.a.pos === 0 && this.gates.b.pos === 0) {
      this.valve = Math.min(1, this.valve + dt / d.valveTime);
      const dH = this.lvl(toEnd) - this.eta;
      const Awp = inside ? sp.L * sp.B * 0.9 : 0, Ac = this.L * d.width - Awp;
      this.Q = Math.sign(dH) * d.mu * d.valveArea * this.valve * Math.sqrt(2 * G * Math.abs(dH));
      this.eta += this.Q / Ac * dt;
      if (Math.abs(this.lvl(toEnd) - this.eta) < 0.02) {
        this.eta = this.lvl(toEnd); this.Q = 0; this.valve = 0;
        if (this.phase === 'preparing') { this.phase = 'opening'; this.gates[this.from!].target = 1; this.say(`${sp.name}, ${this.def.name}: chamber level with you. Opening the gate.`); }
        else { this.phase = 'releasing'; this.gates[toEnd].target = 1; this.say(`${sp.name}, ${this.def.name}: level. Opening the ${toEnd === 'a' ? 'sea' : 'canal'} gate. Single up and stand by.`); }
      }
    } else { this.Q = 0; this.valve = lev ? this.valve : 0; }
    this.dQ = dt > 0 ? (this.Q - Q0) / dt : 0;
    if (!lev) this.eta = this.gates.a.pos > 0 ? this.lvl('a') : this.gates.b.pos > 0 ? this.lvl('b') : this.eta;
    // the lock master
    const kn = Math.hypot(st.u, st.v) / 0.5144;
    if ((this.phase === 'entering' || this.phase === 'mooring') && (inside || (s > -60 && s < this.L + 60)) && kn > 2.2) this.once('speed', `${sp.name}, ${this.def.name}: too fast. 2 knots in the lock.`);
    switch (this.phase) {
      case 'opening': if (this.gates[this.from!].pos >= 1) { this.phase = 'entering'; this.say(`${sp.name}, ${this.def.name}: green light. Come in.`); } break;
      case 'entering':
        if (inside && this.whollyInside(st, sp)) { this.phase = 'mooring'; this.say(`${sp.name}, ${this.def.name}: you are in. Stop her and make fast, at least two lines.`); } break;
      case 'mooring':
        if (!this.whollyInside(st, sp)) break;
        if (kn < 0.3 && linesFast >= 2) { this.hold += dt; if (this.hold > 20) { this.hold = 0; this.phase = 'closing'; this.gates[this.from!].target = 0; this.say(`${sp.name}, ${this.def.name}: closing the ${this.from === 'a' ? 'sea' : 'canal'} gate behind you.`); } }
        else if (kn < 0.3 && linesFast < 2) { this.hold = 0; this.once('lines', `${sp.name}, ${this.def.name}: make fast at least two lines before we close.`); }
        break;
      case 'closing':
        if (this.gates[this.from!].pos <= 0) { this.phase = 'levelling'; this.valve = 0; this.say(`${sp.name}, ${this.def.name}: gate shut. Levelling now, about ${Math.round(this.levelTime() / 60)} minutes. Tend your lines.`); }
        break;
      case 'releasing': { const out = this.from === 'a' ? 'b' : 'a'; if (this.gates[out].pos >= 1) { this.phase = 'leaving'; this.say(`${sp.name}, ${this.def.name}: green light. Let go and proceed. Good trip.`); } break; }
      case 'leaving':
        if (linesFast > 0 && kn > 0.6) this.once('leave-lines', `${sp.name}, ${this.def.name}: you still have lines fast! Stop her.`);
        if (!inside && (s < -40 || s > this.L + 40)) { this.phase = 'done'; this.say(`${this.def.name}: ${sp.name} clear of the lock.`); }
        break;
    }
    this.force = this.forceOn(st, sp, inside);
  }
  /** About how long a levelling takes from here, for the VHF [s]. */
  levelTime() {
    const to = this.phase === 'preparing' ? this.from ?? 'a' : this.from === 'a' ? 'b' : 'a', H = Math.abs(this.lvl(to) - this.eta), A = this.L * this.def.width;
    return this.def.valveTime / 2 + 2 * A * Math.sqrt(H) / (this.def.mu * this.def.valveArea * Math.sqrt(2 * G));
  }
  private whollyInside(st: ShipState, sp: ShipSpec) {
    const c = Math.cos(st.psi), sn = Math.sin(st.psi);
    for (const x of [sp.LOA * 0.5, -sp.LOA * 0.5]) { const [s] = this.local(st.n + c * x, st.e + sn * x); if (s < this.def.gateThick + 2 || s > this.L - this.def.gateThick - 2) return false; }
    return this.inChamber(st.n, st.e);
  }
  private hullInGatePath(k: 'a' | 'b', st: ShipState, sp: ShipSpec) {
    const s0 = k === 'a' ? 0 : this.L - this.def.gateThick, s1 = s0 + this.def.gateThick, c = Math.cos(st.psi), sn = Math.sin(st.psi);
    for (let x = -sp.LOA / 2; x <= sp.LOA / 2; x += 5) for (const y of [-sp.B / 2, sp.B / 2]) {
      const [s, w] = this.local(st.n + c * x - sn * y, st.e + sn * x + c * y);
      if (s > s0 - 1 && s < s1 + 1 && Math.abs(w) < this.def.width / 2 + 1) return true;
    }
    return false;
  }
  /** The gates standing in the water, as moving obstacles (contact sees their velocity). */
  obstacles(): Obstacle[] {
    const out: Obstacle[] = [], d = this.def;
    for (const k of ['a', 'b'] as const) {
      const g = this.gates[k]; if (g.pos >= 1) continue;
      const s0 = k === 'a' ? 0 : this.L - d.gateThick, off = d.recess * g.pos * (d.width + 2);
      const P = (s: number, w: number): Pt => [d.a[0] + this.u[0] * s + this.w[0] * w, d.a[1] + this.u[1] * s + this.w[1] * w];
      const w0 = -d.width / 2 - 1 + off, w1 = d.width / 2 + 1 + off;
      const v = g.v * d.recess * (d.width + 2);
      out.push({ poly: [P(s0, w0), P(s0 + d.gateThick, w0), P(s0 + d.gateThick, w1), P(s0, w1)], k: 8e6, c: 2e6, mu: 0.3, unload: 0.04, kind: 'quay', name: 'lock gate', vel: [this.w[0] * v, this.w[1] * v] });
    }
    return out;
  }
  /** CEVNI signals at each end: red (no entry), red and green (get ready, the gate is opening), green. */
  signals(): { a: Signal; b: Signal } {
    const sig = (k: 'a' | 'b'): Signal => {
      const g = this.gates[k], mine = this.from === k, out = this.from && this.from !== k;
      if (g.pos >= 1 && ((mine && this.phase === 'entering') || (out && this.phase === 'leaving'))) return 'green';
      if (g.target === 1 && g.pos < 1 && (mine || out)) return 'redgreen';
      return 'red';
    };
    return { a: sig('a'), b: sig('b') };
  }
  /** The surge on a ship in the chamber while it levels, and the piston resistance coming in to a shut end. */
  private forceOn(st: ShipState, sp: ShipSpec, inside: boolean) {
    const d = this.def, none = { X: 0, Y: 0, N: 0, F: 0 };
    const [s] = this.local(st.n, st.e);
    if (!inside && !(s > -sp.LOA / 2 && s < this.L + sp.LOA / 2)) return none;
    const depth = d.sill + this.eta, As = sp.B * sp.T, Awet = Math.max(0.15 * d.width * depth, d.width * depth - As);
    let Fu = 0;
    if (inside && this.Q !== 0) {
      // the end the water comes in by (filling, Q > 0) or goes out by (emptying)
      const src = this.phase === 'levelling' ? (this.from === 'a' ? 'b' : 'a') : this.from ?? 'a', away = src === 'a' ? 1 : -1;
      const M = RHO * sp.L * sp.B * sp.T * sp.Cb, m = Math.min(0.85, As / (d.width * depth));
      // translatory wave: while the flow grows the surface slopes down away from where it comes in (or toward
      // where it goes out), and back as it eases off
      const slope = M * this.dQ / Awet;
      // filling through the gates: part of the jet's momentum ρQ²/A_open reaches the ship, as she blocks the section
      const jet = this.Q > 0 ? 0.5 * m * RHO * this.Q * this.Q / Math.max(1, d.valveArea * this.valve) : 0;
      Fu = away * (slope + jet);
    }
    // coming in with the far gate shut: the water she pushes has nowhere to go but past her
    const far = this.from === 'a' ? this.gates.b : this.gates.a;
    if ((this.phase === 'entering' || this.phase === 'mooring') && far.pos < 0.5 && (inside || Math.abs(s - (this.from === 'a' ? 0 : this.L)) < sp.LOA / 2)) {
      const c = Math.cos(st.psi), sn = Math.sin(st.psi), ug = (c * st.u - sn * st.v) * this.u[0] + (sn * st.u + c * st.v) * this.u[1];
      const m = Math.min(0.85, As / (d.width * depth));
      Fu += -0.5 * RHO * 0.3 * As * ug * Math.abs(ug) * (m / (1 - m)) ** 2;
    }
    // along the chamber → body frame
    const FN = Fu * this.u[0], FE = Fu * this.u[1], c = Math.cos(st.psi), sn = Math.sin(st.psi);
    return { X: c * FN + sn * FE, Y: -sn * FN + c * FE, N: 0, F: Fu };
  }
  /** What the predictor needs: level and gate positions now (they stay put over its horizon). */
  snapshot() { return { eta: this.eta, a: this.gates.a.pos, b: this.gates.b.pos }; }
}

/** The force in per mil of the ship's weight (PIANC's ≤ 1 ‰ for a moored ship). */
export const perMil = (F: number, sp: Pick<ShipSpec, 'L' | 'B' | 'T' | 'Cb'>) => Math.abs(F) / (RHO * sp.L * sp.B * sp.T * sp.Cb * G) * 1000;
export type { Wrench };
