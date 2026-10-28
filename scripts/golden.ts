// Golden regression: full-precision end states of scripted runs for every Azipod ship.
// Refactors of the propulsion code must reproduce these bit for bit.
//   npm run golden            compare against scripts/golden.json
//   npm run golden -- --update  rewrite the reference (only for deliberate physics changes)
import { readFileSync, writeFileSync } from 'node:fs';
import { DEG, KN, setShip } from '../src/physics/ship';
import { buildHull, setHull } from '../src/physics/contact';
import { Command, Env, makeState } from '../src/physics/sim';
import { Runtime } from '../src/physics/runtime';
import { runTrials } from '../src/physics/trials';
import { runValidation } from '../src/physics/validation';
import { runPrediction, PredictJob } from '../src/physics/predict';
import { SCENARIOS, currentField, depthAt, scenarioWorld } from '../src/scenarios';
import MIAMI_DATA from '../src/scenes/miami.physics.json';

const FILE = new URL('./golden.json', import.meta.url);
const AZIPOD_SHIPS = ['becancour', 'lady', 'spirit'];
SCENARIOS.find(s => s.id === 'miami-terminal-v')!.setData!(MIAMI_DATA as never);

const out: Record<string, number[]> = {};
const snap = (rt: Runtime) => {
  const s = rt.state;
  return [s.t, s.n, s.e, s.psi, s.u, s.v, s.r, ...s.pods.flatMap(p => [p.alpha, p.rpm]), s.bt,
    rt.sq, ...rt.lines.map(l => l.T), ...rt.tugs.map(t => t.F), rt.bank.Y, rt.wash.Y, rt.contactLog.length];
};

for (const id of AZIPOD_SHIPS) {
  const spec = setShip(id);
  setHull(buildHull(spec.L, spec.B, spec.xg, spec.LOA));
  for (const sc of SCENARIOS) {
    const env: Env = { windSpeed: sc.windKn * KN, windFrom: sc.windFrom * DEG, gusts: sc.gusts, current: currentField(sc, sc.currentKn, sc.currentSet), depth: sc.depth };
    const st = makeState(spec, sc.start.n, sc.start.e, sc.start.psi, sc.start.kn);
    const rpm0 = Math.min(1, sc.start.kn / spec.vmaxKn);
    st.pods.forEach(p => (p.rpm = rpm0));
    const cmd: Command = { pods: spec.pods.map(() => ({ alpha: 0, rpm: rpm0 })), bt: 0, mode: 'twin' };
    const rt = new Runtime(spec, st, cmd, env, { obstacles: sc.obstacles, fenders: sc.fenders, bollards: sc.bollards, depthAt: depthAt(sc), mooringSide: sc.mooringSide, tugSide: sc.tugSide, tugBP: sc.tugBP });
    // a scripted watch: steer, slow, reverse, bow thruster, tugs, joystick with holds, lines
    for (let i = 0; i < 6000; i++) {
      const t = i * 0.05;
      if (i === 200) cmd.pods.forEach(p => (p.alpha = -20 * DEG));
      if (i === 900) { cmd.mode = 'indep'; rt.setLever('indep'); cmd.pods[0].alpha = 90 * DEG; cmd.pods[1].rpm = 0.2; }
      if (i === 1500) { cmd.pods.forEach(p => (p.rpm = -0.6)); cmd.bt = 0.7; }
      if (i === 2100) rt.tugs.forEach((tg, k) => (tg.order = k ? 0.5 : -0.5));
      if (i === 2700) { rt.setLever('joy'); rt.joy = { x: 0.4, y: -0.2, r: 0.3 }; }
      if (i === 3300) { rt.joy = { x: 0, y: 0, r: 0 }; rt.setHdgHold(true); rt.setPosHold(true); }
      if (i === 4200) { rt.setLever('twin'); cmd.pods.forEach(p => { p.alpha = 30 * DEG; p.rpm = 0.3; }); cmd.bt = -0.4; }
      if (i === 4500 && rt.lines.length) for (let k = 0; k < rt.lines.length; k++) rt.passLine(k);
      void t;
      rt.step();
    }
    out[`run.${id}.${sc.id}`] = snap(rt);

    // predictor tracks from the end state
    const sw = scenarioWorld(sc.id);
    const job: PredictJob = {
      id: 1, shipId: id, onboard: true, state: { ...rt.state, pods: rt.state.pods.map(p => ({ ...p })) },
      cmd: { pods: rt.cmd.pods.map(p => ({ ...p })), bt: rt.cmd.bt, mode: rt.cmd.mode },
      wind: { V: env.windSpeed, from: env.windFrom }, current: null, scenarioId: sc.id, curKn: sc.currentKn, curSet: sc.currentSet,
      depth: isFinite(rt.depthHere) ? rt.depthHere : Infinity, lines: rt.lines.map(l => ({ fair: l.fair, bollard: l.bollard, L0: l.L0, state: l.state })),
      ext: { ...rt.world.ext! }, horizon: 120, alts: ['current', 'port', 'stbd', 'crash', 'coast'],
    };
    out[`pred.${id}.${sc.id}`] = runPrediction(spec, job, sw).flatMap(tr => { const p = tr.poses[tr.poses.length - 1]; return [p.n, p.e, p.psi, p.u, tr.dist, tr.stopT ?? -1]; });
  }
  for (const d of [Infinity, 1.2 * spec.T]) {
    const { rows, Vs } = runTrials(spec, d);
    out[`trials.${id}.${isFinite(d) ? 'shallow' : 'deep'}`] = [Vs, ...rows.map(r => parseFloat(r.value))];
  }
}
const v = runValidation();
out.validation = [v.serviceKn, v.approachRpm, ...v.rows.flatMap(r => [r.model, r.time, r.heading])];

if (process.argv.includes('--update')) {
  writeFileSync(FILE, JSON.stringify(out, null, 0).replace(/\],"/g, '],\n"') + '\n');
  console.log(`golden: wrote ${Object.keys(out).length} records`);
} else {
  const ref: Record<string, number[]> = JSON.parse(readFileSync(FILE, 'utf8'), (_k, x) => (x === null ? NaN : x));
  let bad = 0;
  for (const [k, a] of Object.entries(ref)) {
    const b = out[k];
    if (!b || b.length !== a.length || a.some((x, i) => !Object.is(x, b[i]) && !(Number.isNaN(x) && Number.isNaN(b[i])))) {
      bad++; console.log('  DIFF', k, b ? a.map((x, i) => x === b[i] ? '' : `[${i}] ${x} → ${b[i]}`).filter(Boolean).slice(0, 4).join(' ') : 'missing');
    }
  }
  console.log(bad ? `golden: ${bad} of ${Object.keys(ref).length} records changed` : `golden: all ${Object.keys(ref).length} records identical`);
  if (bad) process.exitCode = 1;
}
