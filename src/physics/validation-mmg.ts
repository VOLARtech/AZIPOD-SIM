// KVLCC2: the simulator against an independent implementation of the published MMG
// standard method (mmgref.ts), same manoeuvres, same constant propeller revolutions.
// Turning circles ±35° and zig-zags 10/10, 20/20 from 15.5 kn.
import { DEG, KN, ShipSpec } from './ship';
import { Env, Model, makeState, rk4 } from './sim';
import { MmgShip, MmgState, mmgStep } from './mmgref';

const DT = 0.1;
export interface Manoeuvre { key: string; label: string; ref: number; sim: number; unit: string }
export interface Track2 { x: number[]; y: number[] }

type Stepper = { init(u: number): void; step(deltaCmd: number): void; pose(): { x: number; y: number; psi: number; u: number; v: number; r: number } };

function refStepper(ms: MmgShip, nP: number): Stepper {
  let st: MmgState;
  return {
    init(u) { st = { u, v: 0, r: 0, x: 0, y: 0, psi: 0, delta: 0 }; },
    step(d) { mmgStep(ms, st, nP, d, DT); },
    pose() { return { x: st.x, y: st.y, psi: st.psi, u: st.u, v: st.v, r: st.r }; },
  };
}
function simStepper(spec: ShipSpec, nP: number): Stepper {
  const model = new Model(spec, Infinity);
  const env: Env = { windSpeed: 0, windFrom: 0, gusts: false, current: () => [0, 0], depth: Infinity };
  const rd = spec.pods[0].shaft!.rudder!, rpm = nP / spec.pods[0].shaft!.engine.n;
  let st = makeState(spec, 0, 0, 0, 0);
  return {
    init(u) { st = makeState(spec, 0, 0, 0, 0); st.u = u; st.pods[0].rpm = rpm; },
    step(d) {
      const p = st.pods[0], mx = rd.rate * DT;
      p.alpha += Math.max(-mx, Math.min(mx, d - p.alpha));
      rk4(model, st, env, { V: 0, from: 0 }, null, DT);
    },
    pose() { return { x: st.n, y: st.e, psi: st.psi, u: st.u, v: st.v, r: st.r }; },
  };
}

function turning(s: Stepper, u0: number, delta: number) {
  s.init(u0);
  let adv = NaN, tact = NaN, t90 = NaN, last = 0, dpsi = 0, t = 0;
  const tr: Track2 = { x: [], y: [] };
  while (t < 1500) {
    s.step(delta); t += DT;
    const p = s.pose();
    dpsi += Math.atan2(Math.sin(p.psi - last), Math.cos(p.psi - last)); last = p.psi;
    if (Math.round(t / DT) % 50 === 0) { tr.x.push(p.y); tr.y.push(p.x); }
    if (isNaN(adv) && Math.abs(dpsi) >= Math.PI / 2) { adv = p.x; t90 = t; }
    if (isNaN(tact) && Math.abs(dpsi) >= Math.PI) { tact = Math.abs(p.y); }
    if (Math.abs(dpsi) >= 2.5 * Math.PI) break;
  }
  const p = s.pose();
  return { adv, tact, t90, rot: p.r / DEG * 60, U: Math.hypot(p.u, p.v) / KN, tr };
}

function zigzag(s: Stepper, u0: number, a: number) {
  // rudder a° to starboard; each time the heading change reaches ±a°, reverse it; record the overshoots
  s.init(u0);
  let side = 1, hdg = 0, last = 0, ext = 0, t = 0;
  const overs: number[] = [];
  while (t < 1500 && overs.length < 2) {
    s.step(side * a * DEG); t += DT;
    const p = s.pose();
    hdg += Math.atan2(Math.sin(p.psi - last), Math.cos(p.psi - last)) / DEG; last = p.psi;
    // after each reversal the heading keeps swinging the old way: track how far
    ext = side < 0 ? Math.max(ext, hdg) : Math.min(ext, hdg);
    if (side > 0 && hdg >= a) { if (overs.length) overs.push(-a - ext); side = -1; ext = hdg; }
    else if (side < 0 && hdg <= -a) { overs.push(ext - a); side = 1; ext = hdg; }
  }
  return overs;
}

/** Self-propulsion revolutions for speed u in the reference model (bisection). */
function selfProp(ms: MmgShip, u: number) {
  let lo = 0.3, hi = 4;
  for (let i = 0; i < 40; i++) {
    const n = (lo + hi) / 2, st: MmgState = { u, v: 0, r: 0, x: 0, y: 0, psi: 0, delta: 0 };
    mmgStep(ms, st, n, 0, 0.01);
    if (st.u > u) hi = n; else lo = n;
  }
  return (lo + hi) / 2;
}

export function runMmgValidation(spec: ShipSpec) {
  const sh = spec.pods[0].shaft!;
  const ms: MmgShip = { L: spec.L, B: spec.B, d: spec.T, vol: spec.Cb * spec.L * spec.B * spec.T, hull: spec.mmg!, prop: sh.prop, rud: sh.rudder! };
  const u0 = 15.5 * KN, nP = selfProp(ms, u0);
  const rows: Manoeuvre[] = [];
  const tracks: { ref: Track2; sim: Track2 }[] = [];
  for (const d of [35, -35]) {
    const a = turning(refStepper(ms, nP), u0, d * DEG), b = turning(simStepper(spec, nP), u0, d * DEG);
    const side = d > 0 ? 'stbd' : 'port';
    rows.push({ key: `adv${side}`, label: `Advance, 35° ${side}`, ref: a.adv / spec.L, sim: b.adv / spec.L, unit: 'L' });
    rows.push({ key: `tact${side}`, label: `Tactical diameter, 35° ${side}`, ref: a.tact / spec.L, sim: b.tact / spec.L, unit: 'L' });
    rows.push({ key: `rot${side}`, label: `Steady rate of turn, 35° ${side}`, ref: Math.abs(a.rot), sim: Math.abs(b.rot), unit: '°/min' });
    rows.push({ key: `U${side}`, label: `Speed in the turn, 35° ${side}`, ref: a.U, sim: b.U, unit: 'kn' });
    if (d > 0) tracks.push({ ref: a.tr, sim: b.tr });
  }
  for (const z of [10, 20]) {
    const a = zigzag(refStepper(ms, nP), u0, z), b = zigzag(simStepper(spec, nP), u0, z);
    rows.push({ key: `zz${z}a`, label: `${z}/${z} zig-zag, 1st overshoot`, ref: a[0], sim: b[0], unit: '°' });
    rows.push({ key: `zz${z}b`, label: `${z}/${z} zig-zag, 2nd overshoot`, ref: a[1], sim: b[1], unit: '°' });
  }
  return { rows, nP, tracks };
}
