// Headless sea trials against IMO MSC.137(76) manoeuvrability standards.
import { DEG, KN, ShipSpec } from './ship';
import { Command, Env, Model, ShipState, cloneState, holdCourse, makeState, rk4, updateActuators, wrap } from './sim';
import { engines, fullAstern, helm, isShaftShip, primeRunning } from './pilot';

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
  if (isShaftShip(spec)) return runShaftTrials(spec, depth);
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

// ---------------------------------------------------------------- shaft-and-rudder ships
// Same manoeuvres through the engine telegraph and the helm: the engine model (reversal,
// air starts, load programme) and the steering gear (2.3 °/s) are part of the result.
const shaftHold = (spec: ShipSpec, cmd: Command, st: ShipState, psiRef: number) =>
  helm(spec, cmd, Math.max(-0.17, Math.min(0.17, 1.5 * wrap(psiRef - st.psi) - 40 * st.r)));

export function runShaftTrials(spec: ShipSpec, depth = Infinity): { rows: TrialResult[]; Vs: number } {
  const model = new Model(spec, depth);
  const env = calm(depth);
  const L = spec.L, rows: TrialResult[] = [];
  const mk = (f: number, u: number) => {
    const st = makeState(spec, 0, 0, 0, u); primeRunning(spec, st, f);
    const cmd: Command = { pods: spec.pods.map(() => ({ alpha: 0, rpm: 0 })), bt: 0 };
    engines(spec, cmd, f);
    return { st, cmd };
  };
  // 1. speed trial at navigation full
  let { st, cmd } = mk(1, spec.vmaxKn);
  run(model, st, cmd, env, 1500, s => { shaftHold(spec, cmd, s, 0); });
  st.psi = 0; st.r = 0; st.v = 0; st.pods.forEach(p => (p.alpha = 0));
  const Vs = st.u;
  rows.push({ key: 'vmax', label: 'Service speed, navigation full', value: `${(Vs / KN).toFixed(1)} kn`, note: `${(st.pods[0].rpm * spec.pods[0].shaft!.engine.n * 60).toFixed(0)} rpm` });
  const approach = cloneState(st);
  const fresh = () => { const s = cloneState(approach); const c: Command = { pods: spec.pods.map(() => ({ alpha: 0, rpm: 0 })), bt: 0 }; engines(spec, c, 1); return { s, c }; };

  // 2. turning circles, rudder 35° to starboard and to port
  const turn = (dir: 1 | -1) => {
    const { s, c } = fresh(); helm(spec, c, dir * 35 * DEG);
    const psi0 = s.psi, n0 = s.n, e0 = s.e;
    let dpsi = 0, last = s.psi, adv = NaN, trans = NaN, tact = NaN, t90 = NaN, rS = 0, uS = 0, vS = 0;
    const t0 = s.t;
    run(model, s, c, env, 3000, x => {
      dpsi += wrap(x.psi - last); last = x.psi;
      const dn = x.n - n0, de = x.e - e0;
      const along = dn * Math.cos(psi0) + de * Math.sin(psi0), across = -dn * Math.sin(psi0) + de * Math.cos(psi0);
      if (isNaN(adv) && Math.abs(dpsi) >= Math.PI / 2) { adv = along; trans = Math.abs(across); t90 = x.t - t0; }
      if (isNaN(tact) && Math.abs(dpsi) >= Math.PI) tact = Math.abs(across);
      if (Math.abs(dpsi) >= 2.5 * Math.PI) { rS = x.r; uS = x.u; vS = x.v; return true; }
    });
    return { adv, trans, tact, t90, rS, uS, vS };
  };
  const ts = turn(1), tp = turn(-1);
  const Ust = Math.hypot(ts.uS, ts.vS);
  rows.push({ key: 'adv', label: 'Advance (rudder 35° stbd)', value: `${(ts.adv / L).toFixed(2)} L · ${ts.adv.toFixed(0)} m`, limit: '< 4.5 L', pass: ts.adv < 4.5 * L, note: `port ${(tp.adv / L).toFixed(2)} L` });
  rows.push({ key: 'tact', label: 'Tactical diameter', value: `${(ts.tact / L).toFixed(2)} L · ${ts.tact.toFixed(0)} m`, limit: '< 5.0 L', pass: ts.tact < 5 * L, note: `port ${(tp.tact / L).toFixed(2)} L` });
  rows.push({ key: 'trans', label: 'Transfer at 90°', value: `${(ts.trans / L).toFixed(2)} L`, note: `t₉₀ ${ts.t90.toFixed(0)} s` });
  rows.push({ key: 'dst', label: 'Steady turning diameter', value: `${(2 * Ust / Math.abs(ts.rS) / L).toFixed(2)} L`, note: `speed ${(Ust / KN).toFixed(1)} kn (−${(100 * (1 - Ust / Vs)).toFixed(0)} %)` });
  rows.push({ key: 'rot', label: 'Steady rate of turn', value: `${(Math.abs(ts.rS) / DEG * 60).toFixed(0)} °/min`, note: `drift β ${(Math.atan2(-ts.vS, ts.uS) / DEG).toFixed(1)}°` });
  const pivot = -ts.vS / ts.rS - (spec.mmg ? 0 : -spec.xg);
  rows.push({ key: 'pivot', label: 'Pivot point', value: `${((L / 2 - pivot) / L).toFixed(2)} L aft of FP` });

  // 3. initial turning: rudder 10°, distance run by 10° change of heading
  {
    const { s, c } = fresh(); helm(spec, c, 10 * DEG);
    let d = 0, pn = s.n, pe = s.e; const psi0 = s.psi;
    run(model, s, c, env, 600, x => { d += Math.hypot(x.n - pn, x.e - pe); pn = x.n; pe = x.e; if (Math.abs(wrap(x.psi - psi0)) >= 10 * DEG) return true; });
    rows.push({ key: 'init', label: 'Initial turning, 10° rudder', value: `${(d / L).toFixed(2)} L`, limit: '< 2.5 L', pass: d < 2.5 * L });
  }

  // 4. zig-zags
  const LV = L / Vs;
  for (const a of [10, 20]) {
    const { s, c } = fresh();
    let side = 1, hdg = 0, last = s.psi, ext = 0;
    const overs: number[] = [];
    helm(spec, c, a * DEG);
    run(model, s, c, env, 1500, x => {
      hdg += wrap(x.psi - last) / DEG; last = x.psi;
      ext = side < 0 ? Math.max(ext, hdg) : Math.min(ext, hdg);
      if (side > 0 && hdg >= a) { if (overs.length) overs.push(-a - ext); side = -1; ext = hdg; helm(spec, c, -a * DEG); }
      else if (side < 0 && hdg <= -a) { overs.push(ext - a); side = 1; ext = hdg; helm(spec, c, a * DEG); }
      return overs.length >= 2;
    });
    if (a === 10) {
      const lim1 = LV < 10 ? 10 : LV > 30 ? 20 : 5 + LV / 2, lim2 = LV < 10 ? 25 : LV > 30 ? 40 : 17.5 + 0.75 * LV;
      rows.push({ key: 'zz', label: '10/10 zig-zag, 1st overshoot', value: `${overs[0]?.toFixed(1)}°`, limit: `< ${lim1.toFixed(1)}°`, pass: overs[0] < lim1 });
      rows.push({ key: 'zz2', label: '10/10 zig-zag, 2nd overshoot', value: `${overs[1]?.toFixed(1)}°`, limit: `< ${lim2.toFixed(1)}°`, pass: overs[1] < lim2 });
    } else {
      rows.push({ key: 'zz20', label: '20/20 zig-zag, 1st overshoot', value: `${overs[0]?.toFixed(1)}°`, limit: '< 25.0°', pass: overs[0] < 25 });
    }
  }

  // 5. crash stops: telegraph to full astern from navigation full and from manoeuvring full
  const stop = (f0: number, label: string, key: string, graded: boolean) => {
    let s: ShipState, c: Command;
    if (f0 === 1) ({ s, c } = fresh());
    else { const m = mk(f0, Vs / KN * 0.7); s = m.st; c = m.cmd; run(model, s, c, env, 1200, x => { shaftHold(spec, c, x, 0); }); s.psi = 0; s.r = 0; s.v = 0; }
    engines(spec, c, fullAstern(spec)); helm(spec, c, 0);
    let path = 0, pn = s.n, pe = s.e, tS = NaN;
    const n0 = s.n, e0 = s.e, psi0 = s.psi, t0 = s.t, u0 = s.u;
    run(model, s, c, env, 2400, x => { path += Math.hypot(x.n - pn, x.e - pe); pn = x.n; pe = x.e; if (x.u <= 0) { tS = x.t - t0; return true; } });
    const head = (s.n - n0) * Math.cos(psi0) + (s.e - e0) * Math.sin(psi0), lat = -(s.n - n0) * Math.sin(psi0) + (s.e - e0) * Math.cos(psi0);
    rows.push({ key, label, value: `${(path / L).toFixed(2)} L track reach`, limit: graded ? '< 15 L' : undefined, pass: graded ? path < 15 * L : undefined,
      note: `${(u0 / KN).toFixed(1)} kn, ${(tS / 60).toFixed(1)} min, head reach ${(head / L).toFixed(2)} L, lateral ${lat >= 0 ? 'stbd' : 'port'} ${(Math.abs(lat) / L).toFixed(2)} L, heading ${(wrap(s.psi - psi0) / DEG).toFixed(0)}°` });
  };
  stop(1, 'Crash stop, full astern from sea speed', 'crash', true);
  stop(spec.pods[0].shaft!.prop.cpp ? 0.6 : spec.pods[0].shaft!.telegraph.ahead[3], 'Crash stop from manoeuvring full ahead', 'crash2', false);

  // 6. kick ahead: dead in the water, rudder hard over, half ahead for 40 s, then stop
  {
    const s = makeState(spec, 0, 0, 0, 0);
    const c: Command = { pods: spec.pods.map(() => ({ alpha: 0, rpm: 0 })), bt: 0 };
    const sh = spec.pods[0].shaft!;
    helm(spec, c, 35 * DEG); engines(spec, c, sh.prop.cpp ? 0.5 : sh.telegraph.ahead[2]);
    run(model, s, c, env, 40);
    const u1 = s.u; engines(spec, c, 0);
    run(model, s, c, env, 60);
    rows.push({ key: 'kick', label: 'Kick ahead: half ahead 40 s, hard over', value: `${(s.psi / DEG).toFixed(0)}° heading change`, note: `${(u1 / KN).toFixed(1)} kn after the kick, ${(Math.hypot(s.n, s.e)).toFixed(0)} m moved` });
  }
  // 7. starting air: consecutive starts, alternating ahead and astern
  {
    const e = spec.pods[0].shaft!.engine;
    if (e.air) {
      let p = e.air.pMax, k = 0;
      while (p >= e.air.pMin) { p -= k % 2 ? e.air.dpAstern : e.air.dpAhead; if (p >= 0) k++; }
      rows.push({ key: 'air', label: 'Starting air: starts from full receivers', value: `${k - 1} starts`, limit: '≥ 12', pass: k - 1 >= 12, note: `${e.air.pMax} → ${e.air.pMin} bar, refill ${e.air.refill} bar/min` });
    }
  }
  // 8. coast-down and dead-ship drift
  {
    const s = makeState(spec, 0, 0, 0, 6), c: Command = { pods: spec.pods.map(() => ({ alpha: 0, rpm: 0 })), bt: 0 };
    let cd = 0, cdT = 0;
    run(model, s, c, env, 2400, x => { cd = x.n; cdT = x.t; if (x.u <= 2 * KN) return true; });
    rows.push({ key: 'coast', label: 'Coast-down 6 → 2 kn, engine stopped', value: `${(cd / L).toFixed(1)} L · ${cd.toFixed(0)} m`, note: `${(cdT / 60).toFixed(1)} min` });
    const w = makeState(spec, 0, 0, 0, 0);
    run(model, w, c, env, 900, undefined, 30 * KN, 90 * DEG);
    rows.push({ key: 'wind', label: 'Dead-ship drift, 30 kn wind', value: `${(Math.hypot(w.u, w.v) / KN).toFixed(2)} kn`, note: `lies ${Math.abs(wrap(90 * DEG - w.psi) / DEG).toFixed(0)}° off the wind` });
  }
  return { rows, Vs };
}
