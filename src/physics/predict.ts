// Fast-time dynamic prediction (runs in a worker). Same model family as the ship,
// driven by the actual lever settings; optionally with an onboard-style mismatched model
// fed from sensor estimates. Produces the "current" track plus what-if alternatives.
import { DEG, ShipSpec } from './ship';
import { Command, Env, Model, ShipState, World, cloneState, mismatched, rk4, updateActuators, Wrench } from './sim';
import { ContactInfo, contactForces, Fender, Obstacle, Pt } from './contact';
import type { MooringLine } from './mooring';
import type { DepthField } from './harbour';
import { engines, fullAstern, helm, isHelmShip } from './pilot';

export type Alt = 'current' | 'port' | 'stbd' | 'crash' | 'coast';
export const ALT_LABEL: Record<Alt, string> = {
  current: 'As set', port: 'Pods 35° → port turn', stbd: 'Pods 35° → stbd turn', crash: 'Crash stop (pods swung)', coast: 'Stop rpm (coast)',
};

export interface PredictJob {
  id: number;
  shipId: string;
  onboard: boolean;
  state: ShipState; cmd: Command;
  wind: { V: number; from: number };
  current: [number, number] | null;     // uniform estimate, or null = use scenario field
  scenarioId: string; curKn: number; curSet: number; depth: number;
  lines: Pick<MooringLine, 'fair' | 'bollard' | 'L0' | 'state'>[];
  ext: Wrench;
  horizon: number; alts: Alt[];
}
export interface Pose { t: number; n: number; e: number; psi: number; u: number; v: number; r: number }
export interface Track { alt: Alt; poses: Pose[]; stopT: number | null; stopDist: number; dist: number; contactT: number | null; groundT: number | null }

export interface ScenarioWorld { obstacles: Obstacle[]; fenders: Fender[]; bollards: Pt[]; depthAt: DepthField; current: (kn: number, set: number) => (n: number, e: number) => [number, number] }

export function runPrediction(spec: ShipSpec, job: PredictJob, sw: ScenarioWorld): Track[] {
  const sp = job.onboard ? mismatched(spec) : spec;
  const model = new Model(sp, job.depth);
  const field = job.current ? ((): [number, number] => job.current!) : sw.current(job.curKn, job.curSet);
  const env: Env = { windSpeed: job.wind.V, windFrom: job.wind.from, gusts: false, current: field, depth: job.depth };
  const lines = job.lines.map(l => ({ ...l, kind: 'head', name: '', lead: 0, mode: 'brake', T: 0, peakT: 0 })) as MooringLine[];
  const world: World = { obstacles: [], fenders: [], contact: false, lines, bollards: sw.bollards, ext: job.ext, depthAt: sw.depthAt, squat: 0 };
  const probe: ContactInfo = { active: false, points: [], fenders: [] };
  const startsInContact = (() => { contactForces(job.state, sw.obstacles, sw.fenders, probe); return probe.active; })();
  const dt = job.horizon > 240 ? 1 : 0.5;
  return job.alts.map(alt => {
    const st = cloneState(job.state);
    world.aground = 0;
    const cmd: Command = { pods: job.cmd.pods.map(p => ({ ...p })), bt: job.cmd.bt, sbt: job.cmd.sbt, mode: job.cmd.mode };
    const rpm0 = Math.max(0.5, ...job.cmd.pods.map(p => Math.abs(p.rpm)));
    const shafts = isHelmShip(spec);
    if (shafts) {
      // what-ifs on the telegraph and the wheel: hard over with the engine as set, full astern, stop
      if (alt === 'port' || alt === 'stbd') helm(spec, cmd, (alt === 'port' ? -35 : 35) * DEG);
      if (alt === 'crash') engines(spec, cmd, fullAstern(spec));
      if (alt === 'coast') engines(spec, cmd, 0);
    } else {
      if (alt === 'port' || alt === 'stbd') cmd.pods.forEach(p => { p.alpha = (alt === 'port' ? 35 : -35) * DEG; p.rpm = rpm0; });
      if (alt === 'coast') cmd.pods.forEach(p => (p.rpm = 0));
    }
    const poses: Pose[] = [];
    let stopT: number | null = null, contactT: number | null = null, groundT: number | null = null, dist = 0, stopDist = 0;
    let lastN = st.n, lastE = st.e, nextRec = 0;
    const t0 = st.t;
    for (let t = 0; t <= job.horizon + 1e-9; t += dt) {
      if (t >= nextRec - 1e-9) {
        poses.push({ t, n: st.n, e: st.e, psi: st.psi, u: st.u, v: st.v, r: st.r });
        nextRec += 1;
        if (!startsInContact && Math.round(t) % 2 === 0) {
          contactForces(st, sw.obstacles, sw.fenders, probe);
          if (probe.active) { contactT = t; break; }
        }
        if ((world.aground ?? 0) > 0.05) { groundT = t; break; }
      }
      if (alt === 'crash' && !shafts) {
        // swing outboard through 180°, rpm eased during the sweep, then full
        st.pods.forEach((p, i) => {
          cmd.pods[i].alpha = (spec.pods[i].y < 0 ? -179.9 : 179.9) * DEG;
          cmd.pods[i].rpm = Math.abs(p.alpha) > 150 * DEG ? 1 : 0.3;
        });
      }
      updateActuators(sp, st, cmd, dt);
      rk4(model, st, env, job.wind, world, dt);
      dist += Math.hypot(st.n - lastN, st.e - lastE); lastN = st.n; lastE = st.e;
      if (stopT === null && (alt === 'crash' || alt === 'coast') && st.u <= 0.05) {
        stopT = t + dt; stopDist = dist;
        poses.push({ t: t + dt, n: st.n, e: st.e, psi: st.psi, u: st.u, v: st.v, r: st.r });
        break; // the officer takes the power off once she is stopped
      }
    }
    void t0;
    return { alt, poses, stopT, stopDist, dist, contactT, groundT };
  });
}
