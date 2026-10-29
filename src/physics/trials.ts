// Headless sea trials against IMO MSC.137(76) manoeuvrability standards.
import { DEG, KN, ShipSpec } from './ship';
import { Command, Env, Model, ShipState, cloneState, holdCourse, makeState, rk4, steerSign, updateActuators, wrap } from './sim';
import { engines, fullAstern, helm, isJetShip, isShaftShip, primeRunning } from './pilot';
import { jetJoystick } from './units/jet';

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

/** IMO MSC.137(76) applies to ships of 100 m and over, and to every chemical tanker and gas carrier. */
export const imoApplies = (spec: ShipSpec) => spec.L >= 100 || spec.type === 'gas' || spec.type === 'chemical';
const IMO_KEYS = new Set(['adv', 'tact', 'init', 'zz', 'zz2', 'zz20', 'crash', 'crash2']);

export function runTrials(spec: ShipSpec, depth = Infinity): { rows: TrialResult[]; Vs: number } {
  const r = runAllTrials(spec, depth);
  if (!imoApplies(spec)) for (const row of r.rows) if (IMO_KEYS.has(row.key) && row.limit) {
    // shown for comparison, not graded: the standard does not cover her
    row.note = [row.note, `IMO ${row.limit.replace('< ', '<')} applies from 100 m`].filter(Boolean).join(' · ');
    row.limit = undefined; row.pass = undefined;
  }
  return r;
}
function runAllTrials(spec: ShipSpec, depth: number): { rows: TrialResult[]; Vs: number } {
  if (isShaftShip(spec)) return runShaftTrials(spec, depth);
  if (isJetShip(spec)) return runJetTrials(spec, depth);
  const model = new Model(spec, depth);
  const env = calm(depth);
  const L = spec.L, rows: TrialResult[] = [];
  const np = spec.pods.length;
  const zeros = Array(np).fill(0), full = Array(np).fill(1);

  // 1. Speed trial
  let st = makeState(spec, 0, 0, 0, 12);
  st.pods.forEach(p => (p.rpm = 1));
  const apc = cmdOf(zeros, full);
  run(model, st, apc, env, 1200, s => { holdCourse(apc, s, 0, spec); });
  st.psi = 0; st.r = 0; st.v = 0;
  const Vs = st.u;
  rows.push({ key: 'vmax', label: 'Service speed, 100 % rpm', value: `${(Vs / KN).toFixed(1)} kn` });
  const approach = cloneState(st);

  // 2. Turning circle, units 35° (aft units push the stern to port, forward units the bow to starboard)
  const steer = (deg: number) => spec.pods.map(p => deg * steerSign(p));
  const vsp = spec.pods.some(p => p.kind === 'vsp'), unitWord = vsp ? 'thrust' : 'pods';
  st = cloneState(approach);
  let psi0 = st.psi, n0 = st.n, e0 = st.e, dpsi = 0, last = st.psi;
  let adv = NaN, trans = NaN, tact = NaN, t90 = NaN; const tT0 = st.t;
  let rSteady = 0, uSteady = 0, vSteady = 0;
  // a Voith Schneider order is one vector: full ahead and full steering together saturate at 45°
  const hard = vsp ? 45 : 35;
  run(model, st, cmdOf(steer(-hard), full), env, 900, s => {
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
  rows.push({ key: 'adv', label: `Advance (${unitWord} ${hard}°)`, value: `${(adv / L).toFixed(2)} L · ${adv.toFixed(0)} m`, limit: '< 4.5 L', pass: adv < 4.5 * L });
  rows.push({ key: 'tact', label: 'Tactical diameter', value: `${(tact / L).toFixed(2)} L · ${tact.toFixed(0)} m`, limit: '< 5.0 L', pass: tact < 5 * L });
  rows.push({ key: 'trans', label: 'Transfer at 90°', value: `${(trans / L).toFixed(2)} L`, note: `t₉₀ ${t90.toFixed(0)} s` });
  rows.push({ key: 'dst', label: 'Steady turning diameter', value: `${(Dst / L).toFixed(2)} L`, note: `speed ${(Ust / KN).toFixed(1)} kn (${Ust <= Vs ? '−' : '+'}${Math.abs(100 * (1 - Ust / Vs)).toFixed(0)} %)` });
  rows.push({ key: 'rot', label: 'Steady rate of turn', value: `${(rSteady / DEG * 60).toFixed(0)} °/min`, note: `drift β ${(Math.atan2(-vSteady, uSteady) / DEG).toFixed(1)}°` });
  rows.push({ key: 'pivot', label: 'Pivot point', value: `${((L / 2 - spec.xg - pivot) / L).toFixed(2)} L aft of FP` });

  // 3. Zig-zag 10/10 (pods ±10°)
  st = cloneState(approach);
  let phase = 0, hdg = 0, lp = st.psi, ext = 0;
  const overs: number[] = [];
  const zz = cmdOf(steer(-10), full);
  const set = (deg: number) => steer(deg).forEach((a, i) => (zz.pods[i].alpha = a * DEG));
  run(model, st, zz, env, 900, s => {
    hdg += wrap(s.psi - lp) / DEG; lp = s.psi;
    if (phase === 0 && hdg >= 10) { phase = 1; ext = hdg; set(10); }
    else if (phase === 1) { ext = Math.max(ext, hdg); if (hdg <= -10) { overs.push(ext - 10); phase = 2; ext = hdg; set(-10); } }
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

  if (spec.asternMax <= 0 || vsp) {
    // Z-drives on non-reversing engines and Voith Schneider rotors have no astern rpm: they stop by turning the thrust
    rows.push({ key: 'crash2', label: 'Crash stop, rpm reversal', value: 'n/a', note: vsp ? 'cycloidal rotors reverse by pitch, not rpm' : 'the units turn to go astern; they do not reverse' });
  } else {
    st = cloneState(approach); path = 0; pn = st.n; pe = st.e; tStop = NaN; const tC1 = st.t;
    // reversal interlock: order stop first, then full astern once below the interlock rpm
    const rev = cmdOf(zeros, zeros);
    run(model, st, rev, env, 900, s => {
      if (Math.abs(s.pods[0].rpm) <= spec.revInterlock) rev.pods.forEach(p => (p.rpm = -1));
      path += Math.hypot(s.n - pn, s.e - pe); pn = s.n; pe = s.e;
      if (s.u <= 0) { tStop = s.t - tC1; return true; }
    });
    rows.push({ key: 'crash2', label: 'Crash stop, rpm reversal', value: `${(path / L).toFixed(2)} L track reach`, limit: '< 15 L', pass: path < 15 * L, note: `${tStop.toFixed(0)} s` });
  }

  // 5. Turn on the spot. With a bow thruster: pods athwartships pushing the stern to port, the thruster
  // the bow to starboard, balanced. Without one: the units make a couple on their own (forward units
  // across against the aft ones, or the two aft units one ahead and one astern).
  st = makeState(spec, 0, 0, 0, 0);
  let maxDrift = 0, spinCmd: Command, spinLabel: string;
  if (spec.bowThruster.Tmax > 0) {
    const podSum = spec.pods.reduce((a, p) => a + p.Tb, 0) * (1 - spec.tded);
    const rpmBal = Math.sqrt(spec.bowThruster.Tmax / podSum);
    spinCmd = cmdOf(Array(np).fill(-90), Array(np).fill(rpmBal), 1);
    spinLabel = `Turn on the spot (pods 90° @ ${(rpmBal * 100).toFixed(0)} %, BT 100 %)`;
  } else if (spec.pods.some(p => p.x > 0) && spec.pods.some(p => p.x < 0)) {
    const fwd = spec.pods.filter(p => p.x > 0).reduce((a, p) => a + p.Tb, 0), aft = spec.pods.filter(p => p.x < 0).reduce((a, p) => a + p.Tb, 0);
    const k = Math.min(fwd, aft);
    spinCmd = cmdOf(spec.pods.map(p => (p.x > 0 ? 90 : -90)), spec.pods.map(p => Math.sqrt(k / (p.x > 0 ? fwd : aft))));
    spinLabel = 'Turn on the spot (forward units across one way, aft the other)';
  } else {
    spinCmd = cmdOf(spec.pods.map(p => (p.y < 0 ? 0 : p.y > 0 ? 180 : 0)), spec.pods.map(p => (p.y === 0 ? 0 : 0.5)));
    spinLabel = 'Turn on the spot (port unit ahead, starboard astern, 50 %)';
  }
  run(model, st, spinCmd, env, 300, s => {
    if (s.t > 200) maxDrift = Math.max(maxDrift, Math.hypot(s.u, s.v));
  });
  rows.push({ key: 'spin', label: spinLabel, value: `${Math.abs(st.r / DEG * 60).toFixed(0)} °/min`, note: `residual CG speed ${maxDrift.toFixed(2)} m/s` });

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
  rows.push({ key: 'dst', label: 'Steady turning diameter', value: `${(2 * Ust / Math.abs(ts.rS) / L).toFixed(2)} L`, note: `speed ${(Ust / KN).toFixed(1)} kn (${Ust <= Vs ? '−' : '+'}${Math.abs(100 * (1 - Ust / Vs)).toFixed(0)} %)` });
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
    run(model, s, c, env, 7200, x => { cd = x.n; cdT = x.t; if (x.u <= 2 * KN) return true; });
    rows.push({ key: 'coast', label: 'Coast-down 6 → 2 kn, engine stopped', value: `${(cd / L).toFixed(1)} L · ${cd.toFixed(0)} m`, note: `${(cdT / 60).toFixed(0)} min` });
    const w = makeState(spec, 0, 0, 0, 0);
    run(model, w, c, env, 900, undefined, 30 * KN, 90 * DEG);
    rows.push({ key: 'wind', label: 'Dead-ship drift, 30 kn wind', value: `${(Math.hypot(w.u, w.v) / KN).toFixed(2)} kn`, note: `lies ${Math.abs(wrap(90 * DEG - w.psi) / DEG).toFixed(0)}° off the wind` });
  }
  return { rows, Vs };
}

// ---------------------------------------------------------------- waterjet craft
// High-speed craft are outside MSC.137(76) (it is written for conventional propulsion and steering),
// so the rows are reported, not graded. The HSC Code asks for the stopping and turning figures to be
// known to the crew, and limits the accelerations passengers may feel (Annex 3: 0.20 g lateral or
// fore-and-aft for safety level 1, where an elderly person holding on keeps their balance).
export function runJetTrials(spec: ShipSpec, depth = Infinity): { rows: TrialResult[]; Vs: number } {
  const model = new Model(spec, depth), env = calm(depth), L = spec.L, rows: TrialResult[] = [];
  const blank = (): Command => ({ pods: spec.pods.map(() => ({ alpha: 0, rpm: 0 })), bt: 0 });
  const steadyAt = (f: number) => {
    const st = makeState(spec, 0, 0, 0, spec.vmaxKn * f); primeRunning(spec, st, f);
    const c = blank(); engines(spec, c, f);
    run(model, st, c, env, 600, s => { shaftHold(spec, c, s, 0); });
    st.psi = 0; st.r = 0; st.v = 0; st.n = 0; st.e = 0; st.pods.forEach(p => (p.alpha = 0));
    return st;
  };
  const full = steadyAt(1), Vs = full.u;
  const pw = (st: ShipState) => spec.pods.reduce((a, p, i) => a + p.P * st.pods[i].rpm ** 3, 0) / 1e6;
  rows.push({ key: 'vmax', label: 'Service speed, full power', value: `${(Vs / KN).toFixed(1)} kn`, note: `${pw(full).toFixed(1)} MW, Fn ${(Vs / Math.sqrt(9.81 * L)).toFixed(2)}` });
  const sp = [0.55, 0.7, 0.85].map(f => { const s = steadyAt(f); return `${(s.u / KN).toFixed(1)} kn at ${pw(s).toFixed(1)} MW`; });
  rows.push({ key: 'power', label: 'Speed and power (resistance hump near Fn 0.5)', value: sp[2], note: sp.slice(0, 2).join(' · ') });
  const fresh = () => { const s = cloneState(full), c = blank(); engines(spec, c, 1); return { s, c }; };
  // turning at full power, nozzles hard over
  const turn = (dir: 1 | -1) => {
    const { s, c } = fresh(); helm(spec, c, dir * 30 * DEG);
    let dpsi = 0, last = s.psi, adv = NaN, tact = NaN, ayMax = 0, t180 = NaN, uS = 0, rS = 0;
    run(model, s, c, env, 900, x => {
      dpsi += wrap(x.psi - last); last = x.psi;
      ayMax = Math.max(ayMax, Math.abs(x.u * x.r) / 9.81);
      if (isNaN(adv) && Math.abs(dpsi) >= Math.PI / 2) adv = x.n;
      if (isNaN(tact) && Math.abs(dpsi) >= Math.PI) { tact = Math.abs(x.e); t180 = x.t - full.t; }
      if (Math.abs(dpsi) >= 2 * Math.PI) { uS = Math.hypot(x.u, x.v); rS = x.r; return true; }
    });
    return { adv, tact, ayMax, t180, uS, rS };
  };
  const ts = turn(1), tp = turn(-1);
  rows.push({ key: 'adv', label: 'Advance, nozzles 30° stbd, full power', value: `${(ts.adv / L).toFixed(2)} L · ${ts.adv.toFixed(0)} m`, note: `port ${(tp.adv / L).toFixed(2)} L` });
  rows.push({ key: 'tact', label: 'Tactical diameter', value: `${(ts.tact / L).toFixed(2)} L · ${ts.tact.toFixed(0)} m`, note: `port ${(tp.tact / L).toFixed(2)} L, 180° in ${ts.t180.toFixed(0)} s` });
  rows.push({ key: 'dst', label: 'Steady turn', value: `${(2 * ts.uS / Math.abs(ts.rS) / L).toFixed(2)} L diameter`, note: `${(ts.uS / KN).toFixed(1)} kn (−${(100 * (1 - ts.uS / Vs)).toFixed(0)} %), ${(Math.abs(ts.rS) / DEG).toFixed(1)} °/s` });
  rows.push({ key: 'ay', label: 'Lateral acceleration in the turn', value: `${ts.ayMax.toFixed(2)} g`, limit: '< 0.20 g', pass: ts.ayMax < 0.2, note: 'HSC Code Annex 3, safety level 1' });
  // zig-zag
  {
    const { s, c } = fresh(); let side = 1, hdg = 0, last = s.psi, ext = 0; const overs: number[] = [];
    helm(spec, c, 10 * DEG);
    run(model, s, c, env, 600, x => {
      hdg += wrap(x.psi - last) / DEG; last = x.psi;
      ext = side < 0 ? Math.max(ext, hdg) : Math.min(ext, hdg);
      if (side > 0 && hdg >= 10) { if (overs.length) overs.push(-10 - ext); side = -1; ext = hdg; helm(spec, c, -10 * DEG); }
      else if (side < 0 && hdg <= -10) { overs.push(ext - 10); side = 1; ext = hdg; helm(spec, c, 10 * DEG); }
      return overs.length >= 2;
    });
    rows.push({ key: 'zz', label: '10/10 zig-zag overshoots, full power', value: `${overs[0]?.toFixed(1)}° · ${overs[1]?.toFixed(1)}°` });
  }
  // crash stop: buckets down, astern power
  {
    const { s, c } = fresh(); engines(spec, c, fullAstern(spec)); helm(spec, c, 0);
    let path = 0, pn = s.n, pe = s.e, lu = s.u, ax = 0, tS = NaN; const t0 = s.t;
    run(model, s, c, env, 600, x => { path += Math.hypot(x.n - pn, x.e - pe); pn = x.n; pe = x.e; ax = Math.max(ax, (lu - x.u) / DT / 9.81); lu = x.u; if (x.u <= 0) { tS = x.t - t0; return true; } });
    rows.push({ key: 'crash', label: 'Crash stop, buckets down from full power', value: `${(path / L).toFixed(2)} L · ${path.toFixed(0)} m`, note: `${tS.toFixed(0)} s, heading ${(wrap(s.psi) / DEG).toFixed(0)}°` });
    rows.push({ key: 'decel', label: 'Peak deceleration in the crash stop', value: `${ax.toFixed(2)} g`, limit: '< 0.20 g', pass: ax < 0.2, note: 'passengers standing: ease the buckets in' });
  }
  // harbour: joystick sideways, and turning on the spot
  {
    const s = makeState(spec, 0, 0, 0, 0), c = blank();
    run(model, s, c, env, 120, () => { jetJoystick(spec, c, 0, 1, 0); });
    rows.push({ key: 'joy', label: 'Joystick, full sideways (bow thruster + jets)', value: `${(s.v / KN).toFixed(2)} kn sideways`, note: `heading drift ${(wrap(s.psi) / DEG).toFixed(0)}° in 2 min` });
    const y = makeState(spec, 0, 0, 0, 0), cy = blank();
    run(model, y, cy, env, 60, () => { jetJoystick(spec, cy, 0, 0, 1); });
    rows.push({ key: 'spin', label: 'Joystick, full turn on the spot', value: `${(Math.abs(y.r) / DEG * 60).toFixed(0)} °/min`, note: `drift ${(Math.hypot(y.u, y.v) / KN).toFixed(2)} kn` });
  }
  return { rows, Vs };
}
