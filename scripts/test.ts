// Sign-convention and behaviour regression tests. Run: npm test
import assert from 'node:assert/strict';
import { SHIP, DEG, KN } from '../src/physics/ship';
import { buildHull, setHull } from '../src/physics/contact';
import { Model, makeState, emptyBreakdown, Env, rk4 } from '../src/physics/sim';
import { Runtime } from '../src/physics/runtime';
import { SCENARIOS, currentField, depthAt, berthFor, fits } from '../src/scenarios';
import type { Scenario } from '../src/scenarios';
const OPEN = { obstacles: [], fenders: [], bollards: [], depthAt: () => Infinity };
const harbourOf = (sc: Scenario) => ({ obstacles: sc.obstacles, fenders: sc.fenders, bollards: sc.bollards, depthAt: depthAt(sc), mooringSide: sc.mooringSide, tugSide: sc.tugSide, tugBP: sc.tugBP });

setHull(buildHull(SHIP.L, SHIP.B, SHIP.xg, SHIP.LOA));
const calm: Env = { windSpeed: 0, windFrom: 0, gusts: false, current: () => [0, 0], depth: Infinity };
const model = new Model(SHIP, Infinity);
const still = { V: 0, from: 0 };
let pass = 0;
const test = (name: string, fn: () => void) => {
  try { fn(); pass++; console.log('  ok  ', name); }
  catch (e) { console.log('  FAIL', name, '\n       ', (e as Error).message); process.exitCode = 1; }
};
const forces = (st = makeState(SHIP, 0, 0, 0, 0), wind = still, env = calm) => {
  const bd = emptyBreakdown(2); model.accel(st, env, wind, null, bd); return bd;
};

console.log('signs');
test('pod at +30° pushes the stern to starboard, bow swings to port', () => {
  const st = makeState(SHIP, 0, 0, 0, 0);
  st.pods.forEach(p => { p.alpha = 30 * DEG; p.rpm = 1; });
  const bd = forces(st);
  assert.ok(bd.pods[0].Y > 0 && bd.pods[1].Y > 0, 'pod Y > 0');
  assert.ok(bd.pods[0].N + bd.pods[1].N < 0, 'yaw moment < 0');
});
test('pod at 0° rpm 1 drives the ship ahead', () => {
  const st = makeState(SHIP, 0, 0, 0, 0); st.pods.forEach(p => (p.rpm = 1));
  assert.ok(forces(st).pods[0].X > 300e3 * 0.8);
});
test('bow thruster +1 pushes bow to starboard', () => {
  const st = makeState(SHIP, 0, 0, 0, 0); st.bt = 1;
  const bd = forces(st); assert.ok(bd.bt.Y > 0 && bd.bt.N > 0);
});
test('bow thruster loses most effect at 5 kn', () => {
  const st = makeState(SHIP, 0, 0, 0, 5); st.bt = 1;
  assert.ok(forces(st).bt.eff < 0.35);
});
test('wind from starboard beam pushes the ship to port', () => {
  const bd = forces(makeState(SHIP, 0, 0, 0, 0), { V: 15, from: 90 * DEG });
  assert.ok(bd.wind.Y < 0, `Y=${bd.wind.Y}`);
});
test('head wind retards the ship', () => {
  assert.ok(forces(makeState(SHIP, 0, 0, 0, 0), { V: 15, from: 0 }).wind.X < 0);
});
test('Munk moment destabilises: drift to stbd at speed turns bow to port', () => {
  const st = makeState(SHIP, 0, 0, 0, 0); st.u = 5; st.v = 0.5;
  const h = model.h;
  const munk = (h.Yvd - h.Xud) * st.u * st.v;
  assert.ok(munk < 0);
  assert.ok(h.prime.NvD > 0, 'viscous remainder of N_v must oppose the Munk moment');
});
test('pods at −35° turn the ship to starboard', () => {
  const st = makeState(SHIP, 0, 0, 0, 12); st.pods.forEach(p => (p.rpm = 1));
  const rt = new Runtime(SHIP, st, { pods: [{ alpha: -35 * DEG, rpm: 1 }, { alpha: -35 * DEG, rpm: 1 }], bt: 0 }, calm, OPEN);
  for (let i = 0; i < 600; i++) rt.step();
  assert.ok(rt.state.r > 0 && rt.state.v < 0, 'r > 0, drifts to port');
});

console.log('behaviour');
test('dead ship carries way: 4 kn → still > 2.5 kn after 2 min', () => {
  const st = makeState(SHIP, 0, 0, 0, 4);
  const rt = new Runtime(SHIP, st, { pods: [{ alpha: 0, rpm: 0 }, { alpha: 0, rpm: 0 }], bt: 0 }, calm, OPEN);
  for (let i = 0; i < 2400; i++) rt.step();
  assert.ok(rt.state.u > 2.5 * KN, `u=${(rt.state.u / KN).toFixed(2)} kn`);
});
test('stopped ship is carried by a beam current (> 85 % of set after 10 min)', () => {
  const env: Env = { ...calm, current: () => [0.5, 0] };
  const rt = new Runtime(SHIP, makeState(SHIP, 0, 0, 90, 0), { pods: [{ alpha: 0, rpm: 0 }, { alpha: 0, rpm: 0 }], bt: 0 }, env, OPEN);
  for (let i = 0; i < 12000; i++) rt.step();
  const vN = Math.cos(rt.state.psi) * rt.state.u - Math.sin(rt.state.psi) * rt.state.v;
  assert.ok(vN > 0.425 && vN <= 0.5, `vN=${vN.toFixed(3)}`);
});

const quai = SCENARIOS.find(s => s.id === 'quai27')!;
const basin = SCENARIOS.find(s => s.id === 'swing')!;
const land = (vlat: number) => {
  const st = makeState(SHIP, -11.2, 40, 90, 0); st.v = -vlat; // port side to: −y is north, towards the quay
  const rt = new Runtime(SHIP, st, { pods: [{ alpha: 0, rpm: 0 }, { alpha: 0, rpm: 0 }], bt: 0 },
    { ...calm, current: currentField(quai, 0, 0), depth: 9 }, harbourOf(quai));
  for (let i = 0; i < 1200; i++) rt.step();
  return rt;
};
test('parallel landing at 0.15 m/s: fenders only, below rated deflection, rebound < 60 %', () => {
  const rt = land(0.15), ev = rt.contactLog[rt.contactLog.length - 1];
  assert.ok(ev && !ev.hard, 'no hull-on-concrete');
  assert.ok(ev.maxDefl < 1, `defl ${(ev.maxDefl * 100).toFixed(0)} %`);
  assert.ok(rt.state.v < 0.6 * 0.15, `rebound ${rt.state.v.toFixed(3)}`);
});
test('landing at 0.5 m/s overloads fenders or reaches the wall', () => {
  const ev = land(0.5).contactLog.slice(-1)[0];
  assert.ok(ev.maxDefl > 1 || ev.hard, `defl ${(ev.maxDefl * 100).toFixed(0)} %`);
});
test('bow into concrete at 2 m/s: restitution < 0.35, crush depth 0.5–3 m (≈20 MJ at 10–25 MN)', () => {
  const st = makeState(SHIP, 260, 0, 0, 0); st.u = 2;
  const rt = new Runtime(SHIP, st, { pods: [{ alpha: 0, rpm: 0 }, { alpha: 0, rpm: 0 }], bt: 0 },
    { ...calm, current: () => [0, 0], depth: 8 }, harbourOf(basin));
  let pen = 0;
  for (let i = 0; i < 800; i++) { rt.step(); pen = Math.max(pen, rt.state.n + SHIP.L / 2 + 4 - SHIP.xg - 330); }
  assert.ok(-rt.state.u < 0.35 * 2, `rebound ${rt.state.u.toFixed(2)} m/s`);
  assert.ok(pen > 0.5 && pen < 3, `crush ${pen.toFixed(2)} m`);
});
test('fender rated energy is in the SCN-1000 range (300–700 kJ)', () => {
  const E = quai.fenders[0].Er;
  assert.ok(E > 300e3 && E < 700e3, `${(E / 1e3).toFixed(0)} kJ`);
});

console.log('control system');
import { updateActuators, emptyStatus, Command as Cmd } from '../src/physics/sim';
const act = (rpm0: number[], alpha0: number[], cmdP: { alpha: number; rpm: number }[], bt = 0, mode: 'twin' | 'indep' = 'twin', T = 10) => {
  const st = makeState(SHIP, 0, 0, 0, 0); st.pods.forEach((p, i) => { p.rpm = rpm0[i]; p.alpha = alpha0[i]; }); st.bt = bt;
  const c: Cmd = { pods: cmdP, bt, mode }, out = emptyStatus(2);
  for (let t = 0; t < T; t += 0.05) updateActuators(SHIP, st, c, 0.05, out);
  return { st, out };
};
test('reverse order ignored while rpm is above the interlock', () => {
  const { st, out } = act([1, 1], [0, 0], [{ alpha: 0, rpm: -1 }, { alpha: 0, rpm: -1 }]);
  assert.ok(st.pods[0].rpm > 0.9 && out.revBlocked[0]);
});
test('stop first, then astern: reaches the 83 % astern cap', () => {
  const st = act([0.2, 0.2], [0, 0], [{ alpha: 0, rpm: -1 }, { alpha: 0, rpm: -1 }], 0, 'twin', 60).st;
  assert.ok(Math.abs(st.pods[0].rpm + SHIP.asternMax) < 0.01, `rpm ${st.pods[0].rpm}`);
});
test('pod slew is 7.5°/s (stbd unit 5 % faster)', () => {
  const st = act([0, 0], [0, 0], [{ alpha: Math.PI, rpm: 0 }, { alpha: Math.PI, rpm: 0 }], 0, 'twin', 4).st;
  assert.ok(Math.abs(st.pods[0].alpha / DEG - 30) < 0.5 && st.pods[1].alpha > st.pods[0].alpha);
});
test('bow thruster at full limits pod rpm (shared switchboard)', () => {
  const { out } = act([0, 0], [0, 0], [{ alpha: 0, rpm: 1 }, { alpha: 0, rpm: 1 }], 1);
  assert.ok(out.rpmLimit[0] < 0.97 && out.limited);
});
test('berthing split: athwartships pod held to 70 % in independent mode', () => {
  const { st, out } = act([0, 0], [0, Math.PI / 2], [{ alpha: 0, rpm: 1 }, { alpha: Math.PI / 2, rpm: 1 }], 0, 'indep', 40);
  assert.ok(out.split[1] && st.pods[1].rpm <= 0.7 + 1e-6 && st.pods[0].rpm > 0.9);
});

console.log('harbour');
import { squat, bankEffect, washReflection } from '../src/physics/harbour';
test('squat at 8 kn, h/T 1.2 is 0.3–0.6 m (Barrass)', () => {
  const sq = squat(SHIP, 8 * KN, 1.2 * SHIP.T); assert.ok(sq > 0.3 && sq < 0.6, `${sq}`);
});
const wallPort = [{ poly: [[-500, -40], [500, -40], [500, -10.5 - 12], [-500, -10.5 - 12]] as [number, number][], k: 1, c: 1, mu: 0, unload: 1, kind: 'bank' as const }];
test('bank suction: wall to port draws the stern to port, bow sets to stbd', () => {
  const st = makeState(SHIP, 0, 0, 90, 8); // heading east; port side = north... rebuild wall to the north
  const wall = [{ ...wallPort[0], poly: [[22.5, -500], [22.5, 500], [60, 500], [60, -500]] as [number, number][] }];
  const b = bankEffect(SHIP, st, wall, 9);
  assert.ok(b.Y < 0 && b.N > 0, `Y=${b.Y.toFixed(0)} N=${b.N.toFixed(0)}`);
});
test('pod wash onto a wall to port pushes the stern to starboard', () => {
  const st = makeState(SHIP, 0, 0, 90, 0);
  st.pods.forEach(p => { p.alpha = 90 * DEG; p.rpm = 1; });  // pull to stbd, wash to port (north)
  const wall = [{ ...wallPort[0], poly: [[20, -500], [20, 500], [60, 500], [60, -500]] as [number, number][] }];
  const w = washReflection(SHIP, st, [300e3, 300e3], wall);
  assert.ok(w.Y > 0 && w.hits.length === 2, `Y=${w.Y.toFixed(0)}`);
});

console.log('mooring, tugs, joystick');
import { updateTugs, makeTugs } from '../src/physics/mooring';
test('stbd-side tug ordered to push moves the ship to port; switching to pull takes ~60 s', () => {
  const tugs = makeTugs(SHIP.L, SHIP.xg, 1); tugs[0].order = 1;
  for (let t = 0; t < 30; t += 0.1) updateTugs(tugs, 0, 0.1);
  assert.ok(tugs[0].F < -300e3, `F=${tugs[0].F}`);
  tugs[0].order = -1; for (let t = 0; t < 30; t += 0.1) updateTugs(tugs, 0, 0.1);
  assert.ok(Math.abs(tugs[0].F) < 50e3 && tugs[0].repos > 0, 'repositioning');
});
test('moored with 6 lines (breasts too) heaved tight then on brake, 30 kn offshore wind: holds within 2 m', () => {
  const st = makeState(SHIP, -10.6, 40, 90, 0);
  const rt = new Runtime(SHIP, st, { pods: [{ alpha: 0, rpm: 0 }, { alpha: 0, rpm: 0 }], bt: 0 },
    { ...calm, windSpeed: 30 * KN, windFrom: 0, current: currentField(quai, 0, 0), depth: 9 }, harbourOf(quai));
  rt.lines.forEach((_, i) => rt.passLine(i));
  rt.lines.forEach(l => (l.mode = 'heave'));
  for (let i = 0; i < 1200; i++) rt.step();      // heave tight
  rt.lines.forEach(l => (l.mode = 'brake'));
  for (let i = 0; i < 6000; i++) rt.step();
  const off = -(rt.state.n + 10.6);
  assert.ok(off < 2 && rt.lines.every(l => l.state === 'fast'), `off ${off.toFixed(2)} m, T ${rt.lines.map(l => (l.T / 9.81e3).toFixed(0)).join('/')} t`);
});
test('joystick pure sway with auto-heading: walks sideways, < 3° heading change', () => {
  const rt = new Runtime(SHIP, makeState(SHIP, 0, 0, 0, 0), { pods: [{ alpha: 0, rpm: 0 }, { alpha: 0, rpm: 0 }], bt: 0 }, calm, OPEN);
  rt.setLever('joy'); rt.setHdgHold(true); rt.joy = { x: 0.6, y: 0, r: 0 };
  for (let i = 0; i < 1800; i++) rt.step();
  assert.ok(rt.state.e > 5 && Math.abs(rt.state.psi / DEG) < 3 && Math.abs(rt.state.n) < 0.4 * rt.state.e, `e ${rt.state.e.toFixed(1)} n ${rt.state.n.toFixed(1)} hdg ${(rt.state.psi / DEG).toFixed(1)}`);
});
test('DP heading hold in 25 kn beam wind keeps heading within 3°', () => {
  const rt = new Runtime(SHIP, makeState(SHIP, 0, 0, 0, 0), { pods: [{ alpha: 0, rpm: 0 }, { alpha: 0, rpm: 0 }], bt: 0 }, { ...calm, windSpeed: 25 * KN, windFrom: 90 * DEG }, OPEN);
  rt.setLever('joy'); rt.setHdgHold(true); rt.setPosHold(true);
  let worst = 0;
  for (let i = 0; i < 8000; i++) { rt.step(); if (i > 2000) worst = Math.max(worst, Math.abs(rt.state.psi / DEG)); }
  assert.ok(worst < 3 && Math.hypot(rt.state.n, rt.state.e) < 15, `hdg err ${worst.toFixed(2)}°, pos err ${Math.hypot(rt.state.n, rt.state.e).toFixed(1)} m`);
});

console.log('predictor & validation');
import { runPrediction } from '../src/physics/predict';
import { scenarioWorld } from '../src/scenarios';
import { runValidation } from '../src/physics/validation';
test('ideal predictor matches the ship it predicts (60 s, calm, < 1 m)', () => {
  const st = makeState(SHIP, 0, 0, 0, 8); st.pods.forEach(p => (p.rpm = 0.5));
  const cmd = { pods: [{ alpha: -20 * DEG, rpm: 0.5 }, { alpha: -20 * DEG, rpm: 0.5 }], bt: 0 };
  const [tr] = runPrediction(SHIP, { id: 1, shipId: 'becancour', onboard: false, state: st, cmd, wind: { V: 0, from: 0 }, current: [0, 0], scenarioId: 'trials', curKn: 0, curSet: 0, depth: Infinity, lines: [], ext: { X: 0, Y: 0, N: 0 }, horizon: 60, alts: ['current'] }, scenarioWorld('trials'));
  const rt = new Runtime(SHIP, makeState(SHIP, 0, 0, 0, 8), cmd, calm, OPEN);
  rt.state.pods.forEach(p => (p.rpm = 0.5)); rt.sensors.mode = 'ideal';
  for (let i = 0; i < 1200; i++) rt.step();
  const p = tr.poses[60];
  const err = Math.hypot(p.n - rt.state.n, p.e - rt.state.e);
  assert.ok(err < 1, `err ${err.toFixed(2)} m`);
});
test('277 m validation: reversal methods within 15 %, pod swing within 30 % of model tests', () => {
  const v = runValidation(), by = Object.fromEntries(v.rows.map(r => [r.key, r]));
  for (const k of ['reverse', 'indirect']) assert.ok(Math.abs(by[k].err) < 0.15, `${k} ${(by[k].err * 100).toFixed(0)} %`);
  assert.ok(Math.abs(by.swing180.err) < 0.3, `swing ${(by.swing180.err * 100).toFixed(0)} %`);
});

console.log('lady-class + amsterdam');
import { LADY, SPIRIT, setShip, SHIP as ACTIVE } from '../src/physics/ship';
import { runTrials as trialsOf } from '../src/physics/trials';
import { contactForces } from '../src/physics/contact';
test('Lady-class: 100 % rpm gives 20–23 kn (published 20 kn service, 22 kn max)', () => {
  const { Vs } = trialsOf(LADY, Infinity);
  assert.ok(Vs / KN > 20 && Vs / KN < 23, `${(Vs / KN).toFixed(1)} kn`);
});
test('Amsterdam PTA: ship at the berth mark touches nothing; start position is clear and afloat', () => {
  setShip('spirit'); setHull(buildHull(ACTIVE.L, ACTIVE.B, ACTIVE.xg, ACTIVE.LOA));
  const ams = SCENARIOS.find(s => s.id === 'amsterdam-pta')!;
  const ci = { active: false, points: [], fenders: [] } as Parameters<typeof contactForces>[3] & object;
  const b = ams.berth!;
  contactForces(makeState(ACTIVE, b.n, b.e, b.psi, 0), ams.obstacles, ams.fenders, ci);
  assert.ok(!ci.active, 'berth pose in contact');
  contactForces(makeState(ACTIVE, ams.start.n, ams.start.e, ams.start.psi, 0), ams.obstacles, ams.fenders, ci);
  assert.ok(!ci.active, 'start pose in contact');
  assert.ok(depthAt(ams)(ams.start.n, ams.start.e) - ACTIVE.T > 2, 'start UKC');
});
test('Amsterdam PTA: 0.10 m/s parallel landing stays on the fenders, below rated deflection', () => {
  const ams = SCENARIOS.find(s => s.id === 'amsterdam-pta')!;
  const b = ams.berth!, c = Math.cos(b.psi * DEG), sn = Math.sin(b.psi * DEG);
  // 1.5 m off the berth mark, toward the north bank (port side), drifting to starboard
  const st = makeState(ACTIVE, b.n - 1.5 * -sn * -1 + 1.5 * (-sn) * 0, b.e, b.psi, 0);
  st.n = b.n + 1.5 * (-sn) * -1 * 0 + 1.5 * Math.cos(b.psi * DEG - Math.PI / 2); st.e = b.e + 1.5 * Math.sin(b.psi * DEG - Math.PI / 2);
  st.v = 0.10; void c;
  const rt = new Runtime(ACTIVE, st, { pods: [{ alpha: 0, rpm: 0 }, { alpha: 0, rpm: 0 }], bt: 0 },
    { ...calm, current: currentField(ams, 0, 0), depth: 10.5 }, harbourOf(ams));
  for (let i = 0; i < 1600; i++) rt.step();
  const ev = rt.contactLog[rt.contactLog.length - 1];
  setShip('becancour'); setHull(buildHull(ACTIVE.L, ACTIVE.B, ACTIVE.xg, ACTIVE.LOA));
  assert.ok(ev && !ev.hard && ev.maxDefl < 1, ev ? `hard ${ev.hard} defl ${(ev.maxDefl * 100).toFixed(0)} %` : 'no contact');
});

test('Spirit-class: 100 % rpm gives 21.5–24.5 kn (22 kn service, ~24 kn trials)', () => {
  const { Vs } = trialsOf(SPIRIT, Infinity);
  assert.ok(Vs / KN > 21.5 && Vs / KN < 24.5, `${(Vs / KN).toFixed(1)} kn`);
});
console.log('real chart: PortMiami (NOAA ENC)');
import MIAMI_DATA from '../src/scenes/miami.physics.json';
import MIAMI_CHART from '../src/scenes/miami.chart.json';
test('PortMiami chart: depth grid honours the charted soundings (within 0.6 m at 90 % of them)', () => {
  const mia = SCENARIOS.find(s => s.id === 'miami-terminal-v')!;
  mia.setData!(MIAMI_DATA as never);
  const d = depthAt(mia), tide = mia.tide ?? 0;
  const ok = (MIAMI_CHART.soundings as number[][]).filter(([n, e, z]) => Math.abs(d(n, e) - tide - z) < 0.6).length;
  assert.ok(ok / MIAMI_CHART.soundings.length > 0.9, `${ok}/${MIAMI_CHART.soundings.length}`);
});
test('PortMiami: keel over ≥ 9 m along the whole berth, start in the channel, both clear of structures', () => {
  setShip('spirit'); setHull(buildHull(ACTIVE.L, ACTIVE.B, ACTIVE.xg, ACTIVE.LOA));
  const mia = SCENARIOS.find(s => s.id === 'miami-terminal-v')!, d = depthAt(mia), b = mia.berth!;
  const c = Math.cos(b.psi * DEG), s = Math.sin(b.psi * DEG);
  for (let x = -135; x <= 135; x += 5) assert.ok(d(b.n + x * c, b.e + x * s) >= 9, `berth keel ${x} m: ${d(b.n + x * c, b.e + x * s).toFixed(1)} m`);
  assert.ok(d(mia.start.n, mia.start.e) >= 10, 'start depth');
  const ci = { active: false, points: [], fenders: [] } as Parameters<typeof contactForces>[3] & object;
  contactForces(makeState(ACTIVE, b.n, b.e, b.psi, 0), mia.obstacles, mia.fenders, ci);
  assert.ok(!ci.active, 'berth pose touches');
  contactForces(makeState(ACTIVE, mia.start.n, mia.start.e, mia.start.psi, 0), mia.obstacles, mia.fenders, ci);
  assert.ok(!ci.active, 'start pose touches');
});
test('PortMiami: steaming out of the channel onto the charted flats runs her aground', () => {
  const mia = SCENARIOS.find(s => s.id === 'miami-terminal-v')!;
  // from the start, head due north across the shallows toward the Venetian Islands at 6 kn
  const st = makeState(ACTIVE, mia.start.n, mia.start.e, 0, 6);
  st.pods.forEach(p => (p.rpm = 0.3));
  const rt = new Runtime(ACTIVE, st, { pods: [{ alpha: 0, rpm: 0.3 }, { alpha: 0, rpm: 0.3 }], bt: 0 }, { ...calm, depth: 12 }, harbourOf(mia));
  let aground = false;
  for (let i = 0; i < 20 * 240 && !aground; i++) { rt.step(); aground = (rt.world.aground ?? 0) > 0; }
  setShip('becancour'); setHull(buildHull(ACTIVE.L, ACTIVE.B, ACTIVE.xg, ACTIVE.LOA));
  assert.ok(aground, 'never touched bottom');
});

console.log('shaft + rudder ships (KVLCC2)');
import { SHIPS } from '../src/physics/ship';
import { runMmgValidation } from '../src/physics/validation-mmg';
import { engines, helm, primeRunning } from '../src/physics/pilot';
{
  const VL = SHIPS.kvlcc2, vm = new Model(VL, Infinity);
  const go = (u0: number, f0: number, set: (c: Cmd) => void, T: number, each?: (st: ReturnType<typeof makeState>, out: ReturnType<typeof emptyStatus>) => void) => {
    const st = makeState(VL, 0, 0, 0, u0); if (f0) primeRunning(VL, st, f0);
    const c: Cmd = { pods: [{ alpha: 0, rpm: 0 }], bt: 0 }; engines(VL, c, f0); set(c);
    const out = emptyStatus(1);
    for (let t = 0; t < T; t += 0.1) { updateActuators(VL, st, c, 0.1, out); rk4v(st); each?.(st, out); }
    return { st, out };
  };
  const rk4v = (st: ReturnType<typeof makeState>) => rk4(vm, st, calm, still, null, 0.1);
  test('rudder 35° to starboard turns her to starboard', () => {
    const { st } = go(VL.vmaxKn, 1, c => helm(VL, c, 35 * DEG), 120);
    assert.ok(st.r > 0 && st.psi > 0, `r=${st.r}`);
  });
  test('right-hand propeller, slow astern from rest: stern walks to port, bow swings to starboard', () => {
    const { st } = go(0, 0, c => engines(VL, c, -0.42), 180);
    assert.ok(st.u < 0, 'going astern');
    assert.ok(st.r > 0 && st.psi > 0, `r=${st.r} psi=${st.psi}`);
  });
  test('stopped engine at 10 kn: the propeller windmills ahead', () => {
    const { st } = go(10, 0, () => {}, 60);
    assert.ok(st.pods[0].rpm > 0.05 && st.pods[0].rpm < 0.4, `rpm ${st.pods[0].rpm}`);
  });
  test('full astern from 11 kn: engine stops, reverses on air, and the ship stops in 6–9 L', () => {
    let reversedAt = NaN, x = 0;
    const { st } = go(11.3, 0.72, c => engines(VL, c, -0.8), 1500, (s) => { if (isNaN(reversedAt) && s.pods[0].rpm < -0.15) reversedAt = s.t; if (s.u > 0) x = s.n; });
    assert.ok(reversedAt > 5 && reversedAt < 60, `reversed at ${reversedAt}s`);
    assert.ok(x / VL.L > 5 && x / VL.L < 9, `head reach ${(x / VL.L).toFixed(2)} L`);
    assert.ok(st.pods[0].eng!.starts >= 1);
  });
  test('engine never settles inside the barred speed range', () => {
    const { st } = go(9, 0.42, c => engines(VL, c, 0.5), 300);
    const n = st.pods[0].rpm, [lo, hi] = VL.pods[0].shaft!.engine.barred!;
    assert.ok(n < lo || n > hi, `rpm ${n}`);
  });
  test('starting air below the minimum receiver pressure: no start, the engine room says so', () => {
    const { out, st } = go(0, 0, c => engines(VL, c, 0.3), 0.2);
    st.pods[0].eng!.air = 11; st.pods[0].eng!.mode = 'stop'; st.pods[0].rpm = 0;
    const c: Cmd = { pods: [{ alpha: 0, rpm: 0.3 }], bt: 0 };
    updateActuators(VL, st, c, 0.1, out);
    assert.ok(out.msg[0] === 'NO STARTING AIR', out.msg[0]);
  });
  test('KVLCC2: simulator reproduces the published MMG model (turning, zig-zag) within 3 %', () => {
    const { rows } = runMmgValidation(VL);
    for (const r of rows) assert.ok(Math.abs(r.sim - r.ref) <= 0.03 * Math.abs(r.ref) + 0.3, `${r.label}: ${r.sim.toFixed(2)} vs ${r.ref.toFixed(2)}`);
  });
  test('KVLCC2 meets IMO MSC.137(76) in deep water (turning, initial turning, zig-zags, stopping)', () => {
    const { rows } = trialsOf(VL);
    for (const r of rows) if (r.pass === false) assert.fail(`${r.label}: ${r.value} (${r.limit})`);
  });
}

console.log('cargo ships');
for (const id of ['kcs', 'panamax', 'kvlcc2-ballast']) {
  test(`${SHIPS[id].name}: trials run, turning and zig-zag criteria of MSC.137 met`, () => {
    const { rows, Vs } = trialsOf(SHIPS[id]);
    assert.ok(Math.abs(Vs / KN - SHIPS[id].vmaxKn) < 1.2, `service speed ${(Vs / KN).toFixed(1)} vs ${SHIPS[id].vmaxKn} kn`);
    for (const r of rows) {
      assert.ok(!/NaN|undefined/.test(r.value), `${r.label}: ${r.value}`);
      if (r.pass === false && r.key !== 'crash') assert.fail(`${r.label}: ${r.value} (${r.limit})`);
    }
  });
}
test('the terminal berth lies off the fenders by half the beam, for any ship', () => {
  const t = SCENARIOS.find(s => s.id === 'terminal')!;
  for (const id of ['kvlcc2', 'kcs', 'becancour']) { const b = berthFor(t, SHIPS[id].B, 0)!; assert.ok(Math.abs(b.n - (-2 - SHIPS[id].B / 2 - 0.1)) < 1e-9 && b.psi === 90, `${id} ${b.n}`); }
  assert.ok(fits(t, SHIPS.kvlcc2.T, berthFor(t, SHIPS.kvlcc2.B, 0)) && !fits(SCENARIOS.find(s => s.id === 'quai27')!, SHIPS.kvlcc2.T));
});

console.log('twin screw · CPP · electric shafts');
{
  const env0: Env = calm;
  const sim = (id: string, set: (c: Cmd) => void, T: number, u0 = 0, f0 = 0) => {
    const sp = SHIPS[id], mm = new Model(sp, Infinity), st = makeState(sp, 0, 0, 0, u0); if (f0) primeRunning(sp, st, f0);
    const c: Cmd = { pods: sp.pods.map(() => ({ alpha: 0, rpm: 0 })), bt: 0, sbt: 0 }; engines(sp, c, f0); set(c);
    const out = emptyStatus(sp.pods.length);
    for (let t = 0; t < T; t += 0.1) { updateActuators(sp, st, c, 0.1, out); rk4(mm, st, env0, still, null, 0.1); }
    return { st, out };
  };
  test('twin CPP twisting (port astern, starboard ahead) turns her to port on the spot', () => {
    const { st } = sim('ropax', c => { c.pods[0].pitch = -0.5; c.pods[0].rpm = 1; c.pods[1].pitch = 0.5; c.pods[1].rpm = 1; }, 120);
    assert.ok(st.r < 0 && st.psi < -5 * DEG, `psi ${(st.psi / DEG).toFixed(1)}°`);
    assert.ok(Math.hypot(st.u, st.v) < 1.0, `drift ${Math.hypot(st.u, st.v).toFixed(2)} m/s`);
  });
  test('twin screw with outward-turning propellers turns alike to port and starboard', () => {
    const { rows } = trialsOf(SHIPS.ropax);
    const adv = rows.find(r => r.key === 'adv')!, a = parseFloat(adv.value), b = parseFloat(adv.note!.replace('port ', ''));
    assert.ok(Math.abs(a - b) < 0.05 * a, `${a} vs ${b}`);
  });
  test('CPP: speed rises steadily with pitch at constant shaft speed', () => {
    let last = -1;
    for (const f of [0.2, 0.5, 0.8, 1]) { const u = sim('ropax', () => {}, 900, SHIPS.ropax.vmaxKn * f, f).st.u; assert.ok(u > last + 0.5, `pitch ${f}: ${u}`); last = u; }
  });
  test('electric shafts reverse through zero in under a minute', () => {
    const { st } = sim('cruise-shaft', c => { c.pods.forEach(p => (p.rpm = -0.6)); }, 60, 8, 0.4);
    assert.ok(st.pods.every(p => p.rpm < -0.5), st.pods.map(p => p.rpm.toFixed(2)).join());
  });
  test('thrusters on a diesel ship are held to the generating power that is running', () => {
    const { out } = sim('ropax', c => { c.bt = 1; c.sbt = 1; }, 30);
    assert.ok(out.btPower <= SHIPS.ropax.powerAvail * 1.001, `${out.btPower}`);
  });
}

console.log('tugs');
import { stepRoll, rollInit } from '../src/physics/roll';
{
  const env0: Env = calm;
  for (const [id, bpT] of [['asd-tug', 80], ['vsp-tug', 70], ['rotor-tug', 80]] as [string, number][]) {
    test(`${SHIPS[id].name}: bollard pull within 12 % of ${bpT} t`, () => {
      const sp = SHIPS[id], mm = new Model(sp, Infinity), st = makeState(sp, 0, 0, 0, 0);
      const c: Cmd = { pods: sp.pods.map(() => ({ alpha: 0, rpm: 1 })), bt: 0 };
      for (let t = 0; t < 30; t += 0.05) updateActuators(sp, st, c, 0.05);
      const bd = emptyBreakdown(sp.pods.length); mm.accel(st, env0, still, null, bd);
      const bp = bd.pods.reduce((a, b) => a + b.X, 0) / 9.81e3;
      assert.ok(Math.abs(bp - bpT) < 0.12 * bpT, `${bp.toFixed(1)} t`);
    });
  }
  test('Voith Schneider: thrust reverses ahead → astern in seconds, through zero, without slewing round', () => {
    const sp = SHIPS['vsp-tug'], st = makeState(sp, 0, 0, 0, 0); st.pods.forEach(p => { p.rpm = 1; p.alpha = 0; });
    const c: Cmd = { pods: sp.pods.map(() => ({ alpha: Math.PI, rpm: 1 })), bt: 0 };
    let minE = 1, side = 0;
    for (let t = 0; t < 8; t += 0.05) { updateActuators(sp, st, c, 0.05); minE = Math.min(minE, st.pods[0].rpm); side = Math.max(side, Math.abs(Math.sin(st.pods[0].alpha)) * st.pods[0].rpm); }
    assert.ok(Math.cos(st.pods[0].alpha) < -0.99 && st.pods[0].rpm > 0.9, 'astern at full');
    assert.ok(minE < 0.05 && side < 0.05, `passed through zero (min ${minE.toFixed(2)}, side ${side.toFixed(2)})`);
  });
  test('escort tug hull and skeg at 8 kn, 45° to the flow: side force 1.3–2 × bollard pull', () => {
    const sp = SHIPS['asd-tug'], mm = new Model(sp, Infinity), st = makeState(sp, 0, 0, 0, 0);
    st.u = -8 * KN * Math.cos(45 * DEG); st.v = -8 * KN * Math.sin(45 * DEG);
    const bd = emptyBreakdown(2); mm.accel(st, env0, still, null, bd);
    const bp = sp.pods.reduce((a, p) => a + p.Tb * (1 - sp.tded), 0), f = Math.hypot(bd.hull.X, bd.hull.Y) / bp;
    assert.ok(f > 1.3 && f < 2, `${f.toFixed(2)} × BP`);
  });
  test('tug roll: natural period 5–9 s; full bollard pull abeam at the winch, held by the hull, heels her 8–20°', () => {
    const sp = SHIPS['asd-tug'], rs = rollInit(), bd = emptyBreakdown(2);
    rs.phi = 5 * DEG; let t = 0, cross = [] as number[], last = rs.phi;
    for (; t < 30; t += 0.02) { stepRoll(sp, rs, bd, [], 0.02); if (last > 0 && rs.phi <= 0) cross.push(t); last = rs.phi; }
    const Tn = cross[1] - cross[0];
    assert.ok(Tn > 5 && Tn < 9, `T ${Tn.toFixed(1)} s`);
    const r2 = rollInit(), Y = 80 * 9.81e3, bh = emptyBreakdown(2);
    bh.hull.Y = -Y;                                           // girting: the hull resists the line's pull
    for (t = 0; t < 60; t += 0.02) stepRoll(sp, r2, bh, [{ Y, h: 4 }], 0.02);
    assert.ok(r2.phi > 8 * DEG && r2.phi < 20 * DEG, `${(r2.phi / DEG).toFixed(1)}°`);
  });
  test('escort: towed passively at 8 kn the line takes the tug\'s drag and stays well under its break load', () => {
    const sp = SHIPS['asd-tug'], sc = SCENARIOS.find(x => x.id === 'escort')!;
    const st = makeState(sp, 0, 0, 0, 8);
    const rt = new Runtime(sp, st, { pods: sp.pods.map(() => ({ alpha: 0, rpm: 0 })), bt: 0 }, calm, OPEN);
    rt.attachEscort(sc.escort!, SHIPS.kvlcc2);
    let peak = 0;
    for (let i = 0; i < 20 * 120; i++) { rt.step(); peak = Math.max(peak, rt.escort!.line.T); }
    assert.ok(peak > 2e4 && peak < rt.escort!.line.MBL * 0.6, `peak ${(peak / 9.81e3).toFixed(0)} t`);
    assert.ok(!rt.escort!.line.parted && !rt.capsized);
  });
}

console.log('every scenario sails the Spirit');
test('all built-in harbour scenarios use the Spirit-class ship (3D model, pods)', () => {
  // the tanker terminal, tug escort, fast-ferry harbour, DP run, river, ice and rotor-sail passages are written for their own ship types
  const other = SCENARIOS.filter(s => s.ship !== 'spirit' && !['terminal', 'escort', 'hsc', 'dp', 'river', 'ice', 'rotor'].includes(s.id)).map(s => s.id);
  assert.ok(!other.length, other.join(', '));
});
test('Quai 27, channel, swing basin, trials: start clear of structures with ≥ 2 m under the keel', () => {
  setShip('spirit'); setHull(buildHull(ACTIVE.L, ACTIVE.B, ACTIVE.xg, ACTIVE.LOA));
  const ci = { active: false, points: [], fenders: [] } as Parameters<typeof contactForces>[3] & object;
  for (const id of ['quai27', 'canal', 'swing', 'trials']) {
    const sc = SCENARIOS.find(s => s.id === id)!;
    contactForces(makeState(ACTIVE, sc.start.n, sc.start.e, sc.start.psi, 0), sc.obstacles, sc.fenders, ci);
    assert.ok(!ci.active, `${id}: start pose in contact`);
    assert.ok(depthAt(sc)(sc.start.n, sc.start.e) - ACTIVE.T >= 2, `${id}: start UKC`);
  }
  setShip('becancour'); setHull(buildHull(ACTIVE.L, ACTIVE.B, ACTIVE.xg, ACTIVE.LOA));
});
test('Quai 27: Spirit at the berth mark touches nothing and has ≥ 3 m under the keel', () => {
  setShip('spirit'); setHull(buildHull(ACTIVE.L, ACTIVE.B, ACTIVE.xg, ACTIVE.LOA));
  const ci = { active: false, points: [], fenders: [] } as Parameters<typeof contactForces>[3] & object;
  const b = quai.berth!;
  contactForces(makeState(ACTIVE, b.n, b.e, b.psi, 0), quai.obstacles, quai.fenders, ci);
  const ukc = depthAt(quai)(b.n, b.e) - ACTIVE.T;
  setShip('becancour'); setHull(buildHull(ACTIVE.L, ACTIVE.B, ACTIVE.xg, ACTIVE.LOA));
  assert.ok(!ci.active && ukc >= 3, `contact ${ci.active}, UKC ${ukc.toFixed(1)} m`);
});
test('Quai 27: Spirit parallel landing at 0.10 m/s stays on the fenders, below rated deflection', () => {
  setShip('spirit'); setHull(buildHull(ACTIVE.L, ACTIVE.B, ACTIVE.xg, ACTIVE.LOA));
  const b = quai.berth!, st = makeState(ACTIVE, b.n - 1.5, b.e, b.psi, 0); st.v = -0.10;
  const rt = new Runtime(ACTIVE, st, { pods: [{ alpha: 0, rpm: 0 }, { alpha: 0, rpm: 0 }], bt: 0 },
    { ...calm, current: currentField(quai, 0, 0), depth: quai.depth }, harbourOf(quai));
  for (let i = 0; i < 1600; i++) rt.step();
  const ev = rt.contactLog[rt.contactLog.length - 1];
  setShip('becancour'); setHull(buildHull(ACTIVE.L, ACTIVE.B, ACTIVE.xg, ACTIVE.LOA));
  assert.ok(ev && !ev.hard && ev.maxDefl < 1, ev ? `hard ${ev.hard} defl ${(ev.maxDefl * 100).toFixed(0)} %` : 'no contact');
});
test('Swing basin: the Spirit can pivot through 180° in the middle of the basin without touching', () => {
  setShip('spirit'); setHull(buildHull(ACTIVE.L, ACTIVE.B, ACTIVE.xg, ACTIVE.LOA));
  const ci = { active: false, points: [], fenders: [] } as Parameters<typeof contactForces>[3] & object;
  let hit = -1;
  for (let h = 0; h <= 180 && hit < 0; h += 10) { contactForces(makeState(ACTIVE, -275, 0, h, 0), basin.obstacles, basin.fenders, ci); if (ci.active) hit = h; }
  setShip('becancour'); setHull(buildHull(ACTIVE.L, ACTIVE.B, ACTIVE.xg, ACTIVE.LOA));
  assert.ok(hit < 0, `contact at heading ${hit}°`);
});
test('Channel: width ≈ 8 beams and h/T ≈ 1.36 for the Spirit', () => {
  const ch = SCENARIOS.find(s => s.id === 'canal')!;
  assert.ok(Math.abs(260 / SPIRIT.B - 8) < 0.2 && Math.abs(ch.depth / SPIRIT.T - 1.36) < 0.02);
});

console.log('waterjet fast ferry');
import { bucketFrac, jetJoystick, jetSpeed, staticJet, jetForce, leverToJet, jetToLever } from '../src/physics/units/jet';
import { resistanceCt } from '../src/physics/ship';
{
  const HS = SHIPS['hsc-cat'], hm = new Model(HS, Infinity), J0 = HS.pods[0];
  const blank = (): Cmd => ({ pods: HS.pods.map(() => ({ alpha: 0, rpm: 0, bucket: 1 })), bt: 0 });
  const runJ = (st: ReturnType<typeof makeState>, c: Cmd, T: number, each?: () => void) => { for (let t = 0; t < T; t += 0.1) { each?.(); updateActuators(HS, st, c, 0.1); rk4(hm, st, calm, still, null, 0.1); } return st; };
  test('jet momentum: static thrust ρA V_j² with V_j from the pump power balance', () => {
    const P = 0.88 * J0.P, A = J0.jet!.Anoz, v = jetSpeed(J0.P, A, 0);
    assert.ok(Math.abs(0.5 * 1025 * A * v * v * v * 1.03 - P) < 1e-6 * P);
    assert.ok(Math.abs(staticJet(J0, 1) - 1025 * A * v * v) < 1);
  });
  test('bucket at zero-thrust position, nozzle midships: no surge force at rest', () => {
    const f = { X: 0, Y: 0, N: 0, T: 0, Vj: 0, mdot: 0 };
    jetForce(J0, { alpha: 0, rpm: 0.6, bucket: 0 }, 0, 0, 0, HS.wake, HS.tded, f);
    assert.ok(Math.abs(f.X) < 1e-6 * staticJet(J0, 0.6), `${f.X}`);
    assert.ok(bucketFrac(1) === 0 && bucketFrac(-1) === 1);
  });
  test('nozzles steer the stern the same way ahead, at bucket zero and astern', () => {
    for (const b of [1, 0, -1]) {
      const f = { X: 0, Y: 0, N: 0, T: 0, Vj: 0, mdot: 0 };
      jetForce(J0, { alpha: 20 * DEG, rpm: 0.7, bucket: b }, 0, 0, 0, HS.wake, HS.tded, f);
      assert.ok(f.N > 0, `bucket ${b}: N ${f.N.toFixed(0)}`);           // bow to starboard
    }
  });
  test('service speed 36 ± 1.5 kn on 26 MW, and a resistance hump near Fn 0.5', () => {
    const { Vs } = trialsOf(HS);
    assert.ok(Math.abs(Vs / KN - 36) < 1.5, `${(Vs / KN).toFixed(1)} kn`);
    let best = 0, at = 0;
    for (let Fn = 0.2; Fn <= 0.8; Fn += 0.01) { const c = resistanceCt(HS, Fn * Math.sqrt(9.81 * HS.L), Infinity); if (c > best) { best = c; at = Fn; } }
    assert.ok(at > 0.42 && at < 0.58, `peak Ct at Fn ${at.toFixed(2)}`);
  });
  test('HSC trials: turning 3–8 L tactical diameter, crash stop 1–4 L, turns alike both ways', () => {
    const { rows } = trialsOf(HS), v = (k: string) => parseFloat(rows.find(r => r.key === k)!.value);
    assert.ok(v('tact') > 3 && v('tact') < 8, `tact ${v('tact')}`);
    assert.ok(v('crash') > 1 && v('crash') < 4, `crash ${v('crash')}`);
    const t = rows.find(r => r.key === 'tact')!; assert.ok(Math.abs(v('tact') - parseFloat(t.note!.replace('port ', ''))) < 0.1);
    for (const r of rows) assert.ok(!/NaN|undefined/.test(r.value + (r.note ?? '')), `${r.label}: ${r.value}`);
  });
  test('pumps held below their cavitation limit at low speed, full power once she is moving', () => {
    const st = makeState(HS, 0, 0, 0, 0), c = blank(); c.pods.forEach(p => (p.rpm = 1));
    const out = emptyStatus(4);
    for (let t = 0; t < 20; t += 0.1) updateActuators(HS, st, c, 0.1, out);
    assert.ok(st.pods[0].rpm < 0.86 && out.msg[0] === 'CAVITATION LIMIT', `${st.pods[0].rpm} ${out.msg[0]}`);
    st.u = 22 * KN; for (let t = 0; t < 20; t += 0.1) updateActuators(HS, st, c, 0.1, out);
    assert.ok(st.pods[0].rpm > 0.99 && (out.msg[0] as string) === 'AHEAD');
  });
  test('joystick: full sideways walks her across without running ahead or swinging far', () => {
    const st = makeState(HS, 0, 0, 0, 0), c = blank();
    runJ(st, c, 120, () => jetJoystick(HS, c, 0, 1, 0));
    assert.ok(st.v > 1 * KN && Math.abs(st.u) < 0.5 * KN && Math.abs(st.psi) < 25 * DEG, `v ${(st.v / KN).toFixed(2)} u ${(st.u / KN).toFixed(2)} psi ${(st.psi / DEG).toFixed(0)}`);
    const y = makeState(HS, 0, 0, 0, 0), cy = blank();
    runJ(y, cy, 60, () => jetJoystick(HS, cy, 0, 0, -1));
    assert.ok(y.r < 0 && Math.hypot(y.u, y.v) < 0.5 * KN, 'turns to port on the spot');
  });
  test('waterjet lever: bucket band at the centre, impeller beyond, both ways; round trip', () => {
    const idle = J0.jet!.idle;
    for (const v of [-1, -0.6, -0.3, -0.1, 0, 0.15, 0.3, 0.5, 1]) assert.ok(Math.abs(jetToLever(leverToJet(v, idle).bucket, leverToJet(v, idle).rpm, idle) - v) < 1e-9, `${v}`);
    assert.ok(leverToJet(0, idle).bucket === 0 && leverToJet(1, idle).rpm === 1 && leverToJet(-1, idle).bucket === -1);
  });
  test('fast ferry harbour: start and berth have water for her, berth off the quay by half her beam', () => {
    const sc = SCENARIOS.find(x => x.id === 'hsc')!, b = berthFor(sc, HS.B, 0)!;
    assert.ok(fits(sc, HS.T, b) && Math.abs(b.n - (598.5 - HS.B / 2 - 0.1)) < 1e-9);
  });
}

console.log('dynamic positioning');
import { actuators, allocateDP, capability, DpSystem } from '../src/physics/dp';
{
  const PS = SHIPS.psv, acts = actuators(PS), all = acts.map(() => true);
  const dpRun = (sp: typeof PS, env: Env, T: number, setup?: (rt: Runtime) => void, each?: (rt: Runtime) => void) => {
    const st = makeState(sp, 0, 0, 0, 0);
    const rt = new Runtime(sp, st, { pods: sp.pods.map(() => ({ alpha: 0, rpm: 0 })), bt: 0 }, env, OPEN);
    rt.dps!.setMode('auto', rt.sensors.out.est); setup?.(rt);
    for (let i = 0; i < T / 0.05; i++) { rt.step(); each?.(rt); }
    return rt;
  };
  const windy = (kn: number, from: number, cur = 0, set = 0): Env => ({ windSpeed: kn * KN, windFrom: from * DEG, gusts: false, current: () => [cur * KN * Math.cos(set * DEG), cur * KN * Math.sin(set * DEG)], depth: Infinity });
  test('allocator meets a feasible demand exactly, any mix of azimuths and tunnels', () => {
    for (const tau of [[2e5, 0, 0], [0, 1.5e5, 0], [0, 0, 5e6], [-1e5, 8e4, -3e6]] as [number, number, number][]) {
      const al = allocateDP(acts, tau, all);
      assert.ok(al.residual < 1e-3, `${tau}: residual ${al.residual}`);
      assert.ok(al.util.every(u => u <= 1 + 1e-9));
    }
  });
  test('allocator never points an azimuth into its forbidden sector', () => {
    for (let a = 0; a < 360; a += 15) {
      const al = allocateDP(acts, [3e5 * Math.cos(a * DEG), 3e5 * Math.sin(a * DEG), 0], all);
      acts.forEach((u, k) => { if (u.kind !== 'azi') return; const [fx, fy] = al.f[k]; if (Math.hypot(fx, fy) < 1) return; const ang = Math.atan2(fy, fx);
        for (const [a0, a1] of u.forbid) assert.ok(!(ang > a0 + 1e-6 && ang < a1 - 1e-6), `${u.label} at ${(ang / DEG).toFixed(0)}° for demand ${a}°`); });
    }
  });
  test('beyond capability: every unit saturates and the shortfall is reported, not hidden', () => {
    const al = allocateDP(acts, [0, 2e6, 0], all);
    assert.ok(al.residual > 0.3 && Math.max(...al.util) > 0.99);
  });
  test('capability plot: beam wind holds less than head wind; worst failure below intact everywhere', () => {
    const c = capability(PS);
    assert.ok(c.intact[9] < c.intact[0] && c.intact[9] > 25, `beam ${c.intact[9].toFixed(0)} head ${c.intact[0].toFixed(0)} kn`);
    assert.ok(c.worst.every((v, k) => v <= c.intact[k] + 1e-6) && c.worst[9] < c.intact[9]);
  });
  test('PSV on AUTO POS in 25 kn wind and 0.8 kn current: within 2 m and 2° of the setpoint', () => {
    let e = 0, h = 0;
    dpRun(PS, windy(25, 60, 0.8, 200), 600, undefined, rt => { if (rt.state.t > 200) { e = Math.max(e, Math.hypot(rt.state.n, rt.state.e)); h = Math.max(h, Math.abs(rt.state.psi)); } });
    assert.ok(e < 2 && h < 2 * DEG, `${e.toFixed(2)} m ${(h / DEG).toFixed(2)}°`);
  });
  test('AHTS on DP (CPP mains, tunnels, retractable azimuth) holds station too', () => {
    let e = 0;
    dpRun(SHIPS.ahts, windy(20, 300, 0.5, 90), 600, undefined, rt => { if (rt.state.t > 200) e = Math.max(e, Math.hypot(rt.state.n, rt.state.e)); });
    assert.ok(e < 3, `${e.toFixed(2)} m`);
  });
  test('one aft azimuth trips: the rest take the load and she stays within 5 m', () => {
    let e = 0;
    dpRun(PS, windy(20, 90), 600, rt => rt.dps!.fail(0), rt => { if (rt.state.t > 120) e = Math.max(e, Math.hypot(rt.state.n, rt.state.e)); });
    assert.ok(e < 5, `${e.toFixed(2)} m`);
  });
  test('blackout: she drifts off, thrusters restart one by one, DP brings her back', () => {
    let far = 0, back = Infinity;
    dpRun(PS, windy(20, 90), 400, rt => rt.dps!.blackout(30), rt => { const d = Math.hypot(rt.state.n, rt.state.e); if (rt.state.t < 80) far = Math.max(far, d); if (rt.state.t > 380) back = Math.min(back, d); });
    assert.ok(far > 3 && back < 2, `drifted ${far.toFixed(1)} m, back to ${back.toFixed(1)} m`);
  });
  test('one drifting DGNSS is outvoted and rejected; both drifting together drive her off', () => {
    const r1 = dpRun(PS, windy(10, 0), 300, rt => rt.dps!.drift('DGNSS 1', 0.3, 0));
    assert.ok(r1.dps!.refs[0].rejected && Math.hypot(r1.state.n, r1.state.e) < 2, 'single drift rejected');
    const r2 = dpRun(PS, windy(10, 0), 200, rt => rt.dps!.drift('common', 0.3, 0));
    assert.ok(r2.state.n < -20, `drive-off ${r2.state.n.toFixed(1)} m`);      // the references say north, she goes south
  });
  test('DP platform scenario: starts clear of the platform, scripted faults', () => {
    const sc = SCENARIOS.find(x => x.id === 'dp')!;
    assert.ok(sc.dpScript!.length === 2 && fits(sc, PS.T, sc.berth, false, true) && !fits(sc, PS.T, sc.berth, false, false));
    setShip('psv'); setHull(buildHull(ACTIVE.L, ACTIVE.B, ACTIVE.xg, ACTIVE.LOA));
    const ci = { active: false, points: [], fenders: [] } as Parameters<typeof contactForces>[3] & object;
    contactForces(makeState(ACTIVE, sc.start.n, sc.start.e, sc.start.psi, 0), sc.obstacles, sc.fenders, ci);
    setShip('becancour'); setHull(buildHull(ACTIVE.L, ACTIVE.B, ACTIVE.xg, ACTIVE.LOA));
    assert.ok(!ci.active);
  });
  void DpSystem;
}

console.log('inland · naval · special ships · interaction · ice · rotor sails');
import { interaction } from '../src/physics/traffic';
import { lindqvist, IceState } from '../src/physics/ice';
import { rotorForce } from '../src/physics/sim';
import { Traffic } from '../src/physics/traffic';
import { helm as helmTo, engines as eng, primeRunning as prime } from '../src/physics/pilot';
{
  const SP = SHIPS.spirit, KC = SHIPS.kcs;
  const at = (n: number, e: number, psi: number, kn: number) => ({ n, e, psi: psi * DEG, u: kn * KN });
  test('passing ship abeam on the starboard side: she is drawn toward it, little yaw', () => {
    const f = interaction(SP, at(0, 0, 0, 8), KC, at(0, 60, 0, 10), 14);
    assert.ok(f.Y > 0 && Math.abs(f.N) < 0.2 * Math.abs(f.Y) * SP.L, `Y ${f.Y.toFixed(0)} N ${f.N.toFixed(0)}`);
  });
  test('another ship coming up on the starboard bow pushes the bow away; at the quarter it draws the bow in', () => {
    const fwd = interaction(SP, at(0, 0, 0, 8), KC, at(130, 60, 180, 10), 14), aft = interaction(SP, at(0, 0, 0, 8), KC, at(-130, 60, 180, 10), 14);
    assert.ok(fwd.N < 0 && aft.N > 0, `fwd ${fwd.N.toFixed(0)} aft ${aft.N.toFixed(0)}`);
  });
  test('interaction: grows in shallow water and with speed, falls off with the gap, nothing when crossing', () => {
    const deep = interaction(SP, at(0, 0, 0, 8), KC, at(0, 60, 0, 10), Infinity).Y, shallow = interaction(SP, at(0, 0, 0, 8), KC, at(0, 60, 0, 10), 10).Y;
    const far = interaction(SP, at(0, 0, 0, 8), KC, at(0, 160, 0, 10), 10).Y, fast = interaction(SP, at(0, 0, 0, 8), KC, at(0, 60, 0, 15), 10).Y;
    assert.ok(shallow > 1.2 * deep && far < 0.3 * shallow && fast > shallow);
    assert.ok(interaction(SP, at(0, 0, 0, 8), KC, at(0, 60, 90, 10), 10).Y === 0);
  });
  test('channel meeting and overtaking: the traffic runs, forces stay finite, no collision on a held course', () => {
    const sc = SCENARIOS.find(x => x.id === 'meet')!;
    setShip('spirit'); setHull(buildHull(ACTIVE.L, ACTIVE.B, ACTIVE.xg, ACTIVE.LOA));
    const st = makeState(SP, sc.start.n, sc.start.e, sc.start.psi, sc.start.kn); st.pods.forEach(p => (p.rpm = 7 / SP.vmaxKn));
    const rt = new Runtime(SP, st, { pods: SP.pods.map(() => ({ alpha: 0, rpm: 7 / SP.vmaxKn })), bt: 0 }, { ...calm, depth: sc.depth }, harbourOf(sc));
    rt.traffic = sc.traffic!.map(t => new Traffic(SHIPS[t.ship], t));
    let peak = 0;
    for (let i = 0; i < 20 * 900; i++) {
      // a helmsman holding 000° on the starboard side of the channel
      const a = Math.max(-0.35, Math.min(0.35, -1.5 * (0 - st.psi) - 40 * st.r - 0.004 * (45 - st.e)));
      rt.cmd.pods.forEach(p => (p.alpha = a));
      rt.step(); peak = Math.max(peak, Math.abs(rt.inter.Y));
    }
    setShip('becancour'); setHull(buildHull(ACTIVE.L, ACTIVE.B, ACTIVE.xg, ACTIVE.LOA));
    assert.ok(isFinite(peak) && peak > 5e4, `peak ${(peak / 1e3).toFixed(0)} kN`);
    assert.ok(!rt.alerts.some(a => /COLLISION/.test(a.text)), rt.alerts.map(a => a.text).join());
  });
  test('rotor sails: beam wind gives thrust ahead near spin ratio 3; head wind, they stop', () => {
    const R = SHIPS['panamax-rotor'], V = 12;
    const beam = rotorForce(R, 0, -V, V), head = rotorForce(R, -V, 0, V);   // air moving to port / aft relative to the ship
    const q = 0.5 * 1.225 * V * V * 5 * 30;
    assert.ok(beam.on && beam.X > 4 * 5 * q && beam.SR >= 2.5, `X ${(beam.X / 1e3).toFixed(0)} kN SR ${beam.SR}`);
    assert.ok(!head.on && head.X < 0);
  });
  test('rotor sails add speed in a beam wind on the same engine order', () => {
    const R = SHIPS['panamax-rotor'], m1 = new Model(R, Infinity), m0 = new Model(R, Infinity); m0.rotorsOn = false;
    const run = (m: Model) => { const st = makeState(R, 0, 0, 0, 11); prime(R, st, 0.55); const c: Cmd = { pods: R.pods.map(() => ({ alpha: 0, rpm: 0 })), bt: 0 }; eng(R, c, 0.55);
      for (let t = 0; t < 1200; t += 0.2) { helmTo(R, c, Math.max(-0.2, Math.min(0.2, -1.5 * st.psi - 40 * st.r))); updateActuators(R, st, c, 0.2); rk4(m, st, calm, { V: 25 * KN, from: 90 * DEG }, null, 0.2); } return st.u; };
    const on = run(m1), off = run(m0);
    assert.ok(on > off + 0.3 * KN, `${(on / KN).toFixed(2)} vs ${(off / KN).toFixed(2)} kn`);
  });
  test('push convoy: flanking rudders steer her going astern; the main rudders alone barely do', () => {
    const PC = SHIPS['push-convoy'];
    const noFlank: typeof PC = { ...PC, pods: PC.pods.map(p => ({ ...p, shaft: { ...p.shaft!, rudder: { ...p.shaft!.rudder!, flank: undefined } } })) };
    const yaw = (sp: typeof PC) => { const m = new Model(sp, 5), st = makeState(sp, 0, 0, 0, 0); const c: Cmd = { pods: sp.pods.map(() => ({ alpha: 0, rpm: 0 })), bt: 0 }; eng(sp, c, -0.6); helmTo(sp, c, 40 * DEG);
      for (let t = 0; t < 90; t += 0.1) { updateActuators(sp, st, c, 0.1); rk4(m, st, { ...calm, depth: 5 }, still, null, 0.1); } return st.psi; };
    const a = yaw(PC), b = yaw(noFlank);
    assert.ok(Math.abs(a) > 3 * Math.abs(b) && Math.abs(a) > 5 * DEG, `with ${(a / DEG).toFixed(1)}° without ${(b / DEG).toFixed(1)}°`);
  });
  test('push convoy stops on her reversing gearboxes in under 5 lengths', () => {
    const { rows } = trialsOf(SHIPS['push-convoy']);
    const c = parseFloat(rows.find(r => r.key === 'crash')!.value);
    assert.ok(c < 5, `${c} L`);
  });
  test('river flow follows the bend; the convoy starts in mid-river with water under her', () => {
    const sc = SCENARIOS.find(x => x.id === 'river')!, f = currentField(sc, 3, 0);
    const [a, b] = f(-1000, 0), [c, d] = f(700, 1500), [g, h] = f(Math.cos(-Math.PI / 4) * 700, 700 + Math.sin(-Math.PI / 4) * 700);
    assert.ok(a > 1.5 && Math.abs(b) < 1e-9 && d > 1.5 && Math.abs(c) < 1e-9 && g > 0.9 && h > 0.9, `${a} ${b} ${c} ${d} ${g} ${h}`);
    assert.ok(fits(sc, SHIPS['push-convoy'].T));
  });
  test('Lindqvist ice resistance: grows with thickness and speed; an icebreaker makes headway in 0.8 m at full power', () => {
    const IB = SHIPS.icebreaker;
    assert.ok(lindqvist(IB, 1.2, 2).R > lindqvist(IB, 0.8, 2).R && lindqvist(IB, 0.8, 3).R > lindqvist(IB, 0.8, 1).R);
    const sc = SCENARIOS.find(x => x.id === 'ice')!;
    const st = makeState(IB, 300, 0, 0, 3), rt = new Runtime(IB, st, { pods: IB.pods.map(() => ({ alpha: 0, rpm: 1 })), bt: 0 }, calm, OPEN);
    st.pods.forEach(p => (p.rpm = 1)); rt.ice = new IceState(sc.ice!.slice(1));
    for (let i = 0; i < 20 * 240; i++) rt.step();
    assert.ok(rt.ice.inIce && st.u > 4 * KN && st.u < 14 * KN, `${(st.u / KN).toFixed(1)} kn in 0.8 m`);
    // back down her own channel: much less resistance
    const R1 = rt.ice.R; st.psi = Math.PI; st.u = 3; st.n -= 200;
    rt.ice.force(IB, st); const R2 = rt.ice.R;
    assert.ok(rt.ice.brash && R2 < 0.3 * R1, `level ${(R1 / 1e3).toFixed(0)} kN, channel ${(R2 / 1e3).toFixed(0)} kN`);
  });
  test('icebreaker in 1.8 m level ice: 1.2–5 kn (the class is rated for 1.8 m at 3 kn)', () => {
    const IB = SHIPS.icebreaker, st = makeState(IB, 300, 0, 0, 3);
    const rt = new Runtime(IB, st, { pods: IB.pods.map(() => ({ alpha: 0, rpm: 1 })), bt: 0 }, calm, OPEN);
    st.pods.forEach(p => (p.rpm = 1)); rt.ice = new IceState([{ poly: [[0, -3000], [0, 3000], [9000, 3000], [9000, -3000]], h: 1.8 }]);
    for (let i = 0; i < 20 * 400; i++) rt.step();
    assert.ok(st.u > 1.2 * KN && st.u < 5 * KN, `${(st.u / KN).toFixed(1)} kn`);
  });
  test('ice: no push at rest, and turning in level ice is resisted', () => {
    const IB = SHIPS.icebreaker, ice = new IceState([{ poly: [[-1e4, -1e4], [-1e4, 1e4], [1e4, 1e4], [1e4, -1e4]], h: 0.8 }]);
    const rest = ice.force(IB, makeState(IB, 0, 0, 0, 0)); assert.ok(rest.X === 0 && rest.Y === 0 && rest.N === 0);
    const st = makeState(IB, 0, 0, 0, 2); st.r = 0.02; const f = ice.force(IB, st);
    assert.ok(f.X < 0 && f.N < 0);
  });
  for (const id of ['icebreaker', 'push-convoy', 'frigate', 'superyacht', 'panamax-rotor', 'psv', 'ahts']) {
    test(`${SHIPS[id].name}: trials speed within 1.5 kn of the rated ${SHIPS[id].vmaxKn} kn, no NaN`, () => {
      const { rows, Vs } = trialsOf(SHIPS[id]);
      assert.ok(Math.abs(Vs / KN - SHIPS[id].vmaxKn) < 1.5, `${(Vs / KN).toFixed(1)} kn`);
      for (const r of rows) assert.ok(!/NaN|undefined/.test(r.value), `${r.label}: ${r.value}`);
    });
  }
  test('new scenarios start their own ship clear of every structure with water under her', () => {
    for (const id of ['meet', 'river', 'ice', 'rotor']) {
      const sc = SCENARIOS.find(x => x.id === id)!, sp = SHIPS[sc.ship!];
      setShip(sp.id); setHull(buildHull(ACTIVE.L, ACTIVE.B, ACTIVE.xg, ACTIVE.LOA));
      const ci = { active: false, points: [], fenders: [] } as Parameters<typeof contactForces>[3] & object;
      contactForces(makeState(ACTIVE, sc.start.n, sc.start.e, sc.start.psi, 0), sc.obstacles, sc.fenders, ci);
      assert.ok(!ci.active && depthAt(sc)(sc.start.n, sc.start.e) > sp.T, id);
    }
    setShip('becancour'); setHull(buildHull(ACTIVE.L, ACTIVE.B, ACTIVE.xg, ACTIVE.LOA));
  });
}

console.log('harbour tugs');
import { tugEngaged } from '../src/physics/mooring';
test('harbour tugs stand by out of sight until called, and leave once stood down', () => {
  const tugs = makeTugs(200, 0, 1, 400e3);
  assert.ok(tugs.every(t => !tugEngaged(t)), 'idle tugs not shown');
  tugs[0].order = 0.5; updateTugs(tugs, 0, 0.05);
  assert.ok(tugEngaged(tugs[0]) && !tugEngaged(tugs[1]));
  tugs[0].order = 0; for (let t = 0; t < 60; t += 0.05) updateTugs(tugs, 0, 0.05);
  assert.ok(!tugEngaged(tugs[0]), 'stood down');
});

console.log(`\n${pass} passed${process.exitCode ? ', some failed' : ''}`);
