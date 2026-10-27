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
  // the tanker terminal and the tug escort are written for their own ship types
  const other = SCENARIOS.filter(s => s.ship !== 'spirit' && !['terminal', 'escort'].includes(s.id)).map(s => s.id);
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

console.log(`\n${pass} passed${process.exitCode ? ', some failed' : ''}`);
