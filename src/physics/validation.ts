// Validation against published model tests: "Stopping of Ships Equipped with Azipods"
// (TransNav). 277.5 m × 43.2 m × 12.0 m, Cb 0.79, two pulling Azipods, approach ≈12 kn
// (≈65 % of service speed), slew 7.5°/s, 60 s propeller reversal, deep calm water.
// Track reach Sd/L reported for six stopping methods.
import { DEG, KN, ShipSpec, SHIP } from './ship';
import { Command, Env, Model, ShipState, cloneState, makeState, rk4, updateActuators } from './sim';

export const VAL277: ShipSpec = {
  ...SHIP,
  name: 'Validation hull 277 m',
  L: 277.5, B: 43.2, T: 12.0, Cb: 0.79, xg: 3,
  pods: [
    { label: 'PORT', x: -122, y: -11, Tb: 1.5e6, asternFrac: 0.75, strutArea: 60, D: 6.0, P: 14e6, slewMul: 1, thrustMul: 1, alphaOffset: 0 },
    { label: 'STBD', x: -122, y: 11, Tb: 1.5e6, asternFrac: 0.75, strutArea: 60, D: 6.0, P: 14e6, slewMul: 1, thrustMul: 1, alphaOffset: 0 },
  ],
  bowThruster: { x: 120, Tmax: 4e5, P: 3e6 },
  Vzero: 17,
  podSlew: 7.5 * DEG,
  podRpmTime: 30,           // 60 s full ahead → full astern
  asternMax: 1,             // model tests: astern rpm equal to ahead
  revInterlock: 1,          // test programme reversed directly
  powerAvail: 1e9,
};

export const PUBLISHED = [
  { key: 'inertia', label: 'Inertia stop, pods 90° outward', sd: 11.2 },
  { key: 'out90', label: 'Pods 90° outward, rpm kept', sd: 4.0 },
  { key: 'in90', label: 'Pods 90° inward, rpm kept', sd: 3.8 },
  { key: 'swing180', label: 'Pods turned 180°, rpm eased then full', sd: 2.7 },
  { key: 'reverse', label: 'Propellers reversed, full astern', sd: 4.4 },
  { key: 'indirect', label: 'Pods 30° outward, full astern', sd: 3.7 },
] as const;

const DT = 0.1;
/** "Stopped": speed below 0.5 kn (quadratic drag never reaches exactly zero). */
export const STOP = 0.5 * KN;
const calm: Env = { windSpeed: 0, windFrom: 0, gusts: false, current: () => [0, 0], depth: Infinity };

function steadySpeed(model: Model, spec: ShipSpec, rpm: number, u0: number) {
  const st = makeState(spec, 0, 0, 0, u0 / KN);
  st.pods.forEach(p => (p.rpm = rpm));
  const cmd: Command = { pods: spec.pods.map(() => ({ alpha: 0, rpm })), bt: 0 };
  for (let t = 0; t < 1500; t += DT) { updateActuators(spec, st, cmd, DT); rk4(model, st, calm, { V: 0, from: 0 }, null, DT); }
  return st;
}

export interface ValRow { key: string; label: string; published: number; model: number; err: number; time: number; heading: number }

export function runValidation(): { rows: ValRow[]; serviceKn: number; approachRpm: number; rankOk: boolean } {
  const spec = VAL277;
  const model = new Model(spec, Infinity);
  // calibrate: service speed 18.5 kn at full rpm (12 kn ≈ 65 % of service)
  const service = steadySpeed(model, spec, 1, 18 * KN).u;
  // approach rpm for 12 kn (secant search)
  let lo = 0.3, hi = 0.9;
  for (let i = 0; i < 12; i++) {
    const mid = (lo + hi) / 2;
    if (steadySpeed(model, spec, mid, 12 * KN).u > 12 * KN) hi = mid; else lo = mid;
  }
  const rpmA = (lo + hi) / 2;
  const approach = steadySpeed(model, spec, rpmA, 12 * KN);

  const out = (i: number) => (spec.pods[i].y < 0 ? -1 : 1); // outboard sign
  const plans: Record<string, (st: ShipState, cmd: Command) => void> = {
    inertia: (_s, c) => c.pods.forEach((p, i) => { p.alpha = out(i) * 90 * DEG; p.rpm = 0; }),
    out90: (_s, c) => c.pods.forEach((p, i) => { p.alpha = out(i) * 90 * DEG; p.rpm = rpmA; }),
    in90: (_s, c) => c.pods.forEach((p, i) => { p.alpha = -out(i) * 90 * DEG; p.rpm = rpmA; }),
    swing180: (s, c) => c.pods.forEach((p, i) => {
      p.alpha = out(i) * 179.9 * DEG;
      p.rpm = Math.abs(s.pods[i].alpha) > 160 * DEG ? 1 : 0.25 * rpmA;
    }),
    reverse: (_s, c) => c.pods.forEach(p => { p.alpha = 0; p.rpm = -1; }),
    indirect: (_s, c) => c.pods.forEach((p, i) => { p.alpha = out(i) * 30 * DEG; p.rpm = -1; }),
  };
  const rows: ValRow[] = PUBLISHED.map(pub => {
    const st = cloneState(approach);
    const cmd: Command = { pods: spec.pods.map(() => ({ alpha: 0, rpm: rpmA })), bt: 0 };
    let path = 0, pn = st.n, pe = st.e, t = 0;
    const psi0 = st.psi;
    for (; t < 3000; t += DT) {
      plans[pub.key](st, cmd);
      updateActuators(spec, st, cmd, DT);
      rk4(model, st, calm, { V: 0, from: 0 }, null, DT);
      path += Math.hypot(st.n - pn, st.e - pe); pn = st.n; pe = st.e;
      if (st.u <= STOP) break;
    }
    const sd = path / spec.L;
    return { key: pub.key, label: pub.label, published: pub.sd, model: sd, err: (sd - pub.sd) / pub.sd, time: t, heading: (st.psi - psi0) / DEG };
  });
  const order = (k: 'published' | 'model') => [...rows].sort((a, b) => a[k] - b[k]).map(r => r.key).join();
  // ranking among powered methods (inertia stop is trivially last)
  return { rows, serviceKn: service / KN, approachRpm: rpmA, rankOk: order('published') === order('model') };
}
