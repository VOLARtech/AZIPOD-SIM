// Headless sea trials against IMO MSC.137(76) manoeuvrability standards.
import { DEG, KN, ShipSpec } from './ship';
import { Command, Env, Model, ShipState, cloneState, holdCourse, makeState, rk4, updateActuators, wrap } from './sim';

const DT = 0.1;
const calm = (depth = Infinity): Env => ({ windSpeed: 0, windFrom: 0, gusts: false, current: () => [0, 0], depth });

function run(model: Model, st: ShipState, cmd: Command, env: Env, T: number,
             each?: (s: ShipState) => boolean | void, windV = 0, windFrom = 0) {
  const w = { V: windV, from: windFrom };
  for (let t = 0; t < T; t += DT) {
    updateActuators(model.spec, st, cmd, DT);
    rk4(model, st, env, w, null, DT);
    if (each && each(st)) break;
  }
  return st;
}
const cmdOf = (a: number[], rpm: number[], bt = 0): Command =>
  ({ pods: a.map((x, i) => ({ alpha: x * DEG, rpm: rpm[i] })), bt });

export interface TrialResult { key: string; label: string; value: string; limit?: string; pass?: boolean; note?: string }

export function runTrials(spec: ShipSpec, depth = Infinity): { rows: TrialResult[]; Vs: number } {
  const model = new Model(spec, depth);
  const env = calm(depth);
  const L = spec.L, rows: TrialResult[] = [];
  const np = spec.pods.length;
  const zeros = Array(np).fill(0), full = Array(np).fill(1);

  // 1. Speed trial
  let st = makeState(spec, 0, 0, 0, 12);
  st.pods.forEach(p => (p.rpm = 1));
  const apc = cmdOf(zeros, full);
  run(model, st, apc, env, 1200, s => { holdCourse(apc, s, 0); });
  st.psi = 0; st.r = 0; st.v = 0;
  const Vs = st.u;
  rows.push({ key: 'vmax', label: 'Service speed, 100 % rpm', value: `${(Vs / KN).toFixed(1)} kn` });
  const approach = cloneState(st);

  // 2. Turning circle, pods 35° (stern pushed to port → turn to starboard)
  st = cloneState(approach);
  let psi0 = st.psi, n0 = st.n, e0 = st.e, dpsi = 0, last = st.psi;
  let adv = NaN, trans = NaN, tact = NaN, t90 = NaN; const tT0 = st.t;
  let rSteady = 0, uSteady = 0, vSteady = 0;
  run(model, st, cmdOf(Array(np).fill(-35), full), env, 900, s => {
    dpsi += wrap(s.psi - last); last = s.psi;
    const dn = s.n - n0, de = s.e - e0;
    const along = dn * Math.cos(psi0) + de * Math.sin(psi0);
    const across = -dn * Math.sin(psi0) + de * Math.cos(psi0);
    if (isNaN(adv) && dpsi >= Math.PI / 2) { adv = along; trans = across; t90 = s.t - tT0; }
    if (isNaN(tact) && dpsi >= Math.PI) tact = across;
    if (dpsi >= 3 * Math.PI) { rSteady = s.r; uSteady = s.u; vSteady = s.v; return true; }
  });
  const Ust = Math.hypot(uSteady, vSteady);
  const Dst = 2 * Ust / Math.abs(rSteady);
  const pivot = -vSteady / rSteady; // x (rel CG) of zero lateral velocity
  rows.push({ key: 'adv', label: 'Advance (pods 35°)', value: `${(adv / L).toFixed(2)} L · ${adv.toFixed(0)} m`, limit: '< 4.5 L', pass: adv < 4.5 * L });
  rows.push({ key: 'tact', label: 'Tactical diameter', value: `${(tact / L).toFixed(2)} L · ${tact.toFixed(0)} m`, limit: '< 5.0 L', pass: tact < 5 * L });
  rows.push({ key: 'trans', label: 'Transfer at 90°', value: `${(trans / L).toFixed(2)} L`, note: `t₉₀ ${t90.toFixed(0)} s` });
  rows.push({ key: 'dst', label: 'Steady turning diameter', value: `${(Dst / L).toFixed(2)} L`, note: `speed ${(Ust / KN).toFixed(1)} kn (−${(100 * (1 - Ust / Vs)).toFixed(0)} %)` });
  rows.push({ key: 'rot', label: 'Steady rate of turn', value: `${(rSteady / DEG * 60).toFixed(0)} °/min`, note: `drift β ${(Math.atan2(-vSteady, uSteady) / DEG).toFixed(1)}°` });
  rows.push({ key: 'pivot', label: 'Pivot point', value: `${((L / 2 - spec.xg - pivot) / L).toFixed(2)} L aft of FP` });

  // 3. Zig-zag 10/10 (pods ±10°)
  st = cloneState(approach);
  let phase = 0, hdg = 0, lp = st.psi, ext = 0;
  const overs: number[] = [];
  const zz = cmdOf(Array(np).fill(-10), full);
  run(model, st, zz, env, 900, s => {
    hdg += wrap(s.psi - lp) / DEG; lp = s.psi;
    if (phase === 0 && hdg >= 10) { phase = 1; ext = hdg; zz.pods.forEach(p => (p.alpha = 10 * DEG)); }
    else if (phase === 1) { ext = Math.max(ext, hdg); if (hdg <= -10) { overs.push(ext - 10); phase = 2; ext = hdg; zz.pods.forEach(p => (p.alpha = -10 * DEG)); } }
    else if (phase === 2) { ext = Math.min(ext, hdg); if (hdg >= 10) { overs.push(-10 - ext); return true; } }
  });
  const LV = L / Vs;
  const lim1 = LV < 10 ? 10 : LV > 30 ? 20 : 5 + LV / 2;
  if (overs.length) rows.push({ key: 'zz', label: '10/10 zig-zag, 1st overshoot', value: `${overs[0].toFixed(1)}°`, limit: `< ${lim1.toFixed(1)}°`, pass: overs[0] < lim1, note: overs[1] !== undefined ? `2nd ${overs[1].toFixed(1)}°` : undefined });

  // 4. Crash stop: pods swung outboard through 180° at full rpm
  st = cloneState(approach);
  let path = 0, pn = st.n, pe = st.e, tStop = NaN, headReach = 0;
  const psiS = st.psi, nS = st.n, eS = st.e, tC0 = st.t;
  const crash = cmdOf(spec.pods.map(p => (p.y < 0 ? -179.9 : 179.9)), full);
  run(model, st, crash, env, 600, s => {
    path += Math.hypot(s.n - pn, s.e - pe); pn = s.n; pe = s.e;
    headReach = (s.n - nS) * Math.cos(psiS) + (s.e - eS) * Math.sin(psiS);
    if (s.u <= 0) { tStop = s.t - tC0; return true; }
  });
  rows.push({ key: 'crash', label: 'Crash stop, pods swung 180°', value: `${(path / L).toFixed(2)} L track reach`, limit: '< 15 L', pass: path < 15 * L, note: `${tStop.toFixed(0)} s, head reach ${(headReach / L).toFixed(2)} L, heading Δ ${(wrap(st.psi - psiS) / DEG).toFixed(0)}°` });

  st = cloneState(approach); path = 0; pn = st.n; pe = st.e; tStop = NaN; const tC1 = st.t;
  // reversal interlock: order stop first, then full astern once below the interlock rpm
  const rev = cmdOf(zeros, zeros);
  run(model, st, rev, env, 900, s => {
    if (Math.abs(s.pods[0].rpm) <= spec.revInterlock) rev.pods.forEach(p => (p.rpm = -1));
    path += Math.hypot(s.n - pn, s.e - pe); pn = s.n; pe = s.e;
    if (s.u <= 0) { tStop = s.t - tC1; return true; }
  });
  rows.push({ key: 'crash2', label: 'Crash stop, rpm reversal', value: `${(path / L).toFixed(2)} L track reach`, limit: '< 15 L', pass: path < 15 * L, note: `${tStop.toFixed(0)} s` });

  // 5. Turn on the spot: both pods push stern to port, bow thruster to stbd
  st = makeState(spec, 0, 0, 0, 0);
  let maxDrift = 0;
  const podSum = spec.pods.reduce((a, p) => a + p.Tb, 0) * (1 - spec.tded);
  const rpmBal = Math.sqrt(spec.bowThruster.Tmax / podSum);
  run(model, st, cmdOf(Array(np).fill(-90), Array(np).fill(rpmBal), 1), env, 300, s => {
    if (s.t > 200) maxDrift = Math.max(maxDrift, Math.hypot(s.u, s.v));
  });
  rows.push({ key: 'spin', label: `Turn on the spot (pods 90° @ ${(rpmBal * 100).toFixed(0)} %, BT 100 %)`, value: `${(st.r / DEG * 60).toFixed(0)} °/min`, note: `residual CG speed ${maxDrift.toFixed(2)} m/s` });

  // Coast-down: dead ship from 6 kn, how far until 2 kn (headway carried when stopping)
  st = makeState(spec, 0, 0, 0, 6);
  let cd = 0, cdT = 0;
  run(model, st, cmdOf(zeros, zeros), env, 1800, s => { cd = s.n; cdT = s.t; if (s.u <= 2 * KN) return true; });
  rows.push({ key: 'coast', label: 'Coast-down 6 → 2 kn, dead ship', value: `${(cd / L).toFixed(1)} L · ${cd.toFixed(0)} m`, note: `${(cdT / 60).toFixed(1)} min` });

  // 6. Wind drift: 30 kn beam wind, dead ship
  st = makeState(spec, 0, 0, 0, 0);
  run(model, st, cmdOf(zeros, zeros), env, 900, undefined, 30 * KN, 90 * DEG);
  rows.push({ key: 'wind', label: 'Dead-ship drift, 30 kn wind', value: `${(Math.hypot(st.u, st.v) / KN).toFixed(2)} kn`, note: `lies ${Math.abs(wrap(90 * DEG - st.psi) / DEG).toFixed(0)}° off the wind` });

  return { rows, Vs };
}
