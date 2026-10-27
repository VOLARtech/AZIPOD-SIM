// IMO A.601(15) pilot card / wheelhouse poster data, computed from the model.
import { DEG, KN, ShipSpec } from './ship';
import { Command, Env, Model, ShipState, cloneState, holdCourse, makeState, rk4, updateActuators, wrap } from './sim';
import { squat } from './harbour';

const DT = 0.2;
const calm = (depth = Infinity): Env => ({ windSpeed: 0, windFrom: 0, gusts: false, current: () => [0, 0], depth });

export interface Path { label: string; pts: [number, number][]; marks: { x: number; y: number; t: number; label: string }[] }
export interface Poster {
  speedTable: { rpm: number; kn: number }[];
  turning: { label: string; adv: number; tr: number; td: number; t90: number; t180: number; t360: number; vEnd: number }[];
  stopping: { label: string; track: number; head: number; side: number; time: number }[];
  thruster: { kn: number; eff: number }[];
  squatTable: { kn: number; hT: number; sq: number }[]; // hT field: 0 open water, 1 confined channel
  windDrift: { kn: number; drift: number }[];
  paths: { turn: Path[]; stop: Path[] };
  minSteerKn: number;
}

function steady(model: Model, spec: ShipSpec, rpm: number, env: Env, u0 = 8): ShipState {
  const st = makeState(spec, 0, 0, 0, u0);
  st.pods.forEach(p => (p.rpm = rpm));
  const cmd: Command = { pods: spec.pods.map(() => ({ alpha: 0, rpm })), bt: 0 };
  for (let t = 0; t < 1200; t += DT) { holdCourse(cmd, st, 0); updateActuators(spec, st, cmd, DT); rk4(model, st, env, { V: 0, from: 0 }, null, DT); }
  st.t = 0; st.n = 0; st.e = 0; st.psi = 0; st.r = 0; st.v = 0;
  return st;
}

function turning(model: Model, spec: ShipSpec, start: ShipState, env: Env, label: string) {
  const st = cloneState(start), cmd: Command = { pods: spec.pods.map(() => ({ alpha: -35 * DEG, rpm: st.pods[0].rpm })), bt: 0 };
  let dpsi = 0, last = st.psi;
  const out = { label, adv: NaN, tr: NaN, td: NaN, t90: NaN, t180: NaN, t360: NaN, vEnd: 0 };
  const path: Path = { label, pts: [[0, 0]], marks: [] };
  let rec = 0;
  for (let t = 0; t < 1200; t += DT) {
    updateActuators(spec, st, cmd, DT); rk4(model, st, env, { V: 0, from: 0 }, null, DT);
    dpsi += wrap(st.psi - last); last = st.psi;
    rec += DT; if (rec >= 2) { rec = 0; path.pts.push([st.e, st.n]); }
    const deg = dpsi / DEG;
    for (const [a, key] of [[90, 't90'], [180, 't180'], [360, 't360']] as const) {
      if (isNaN(out[key]) && deg >= a) {
        out[key] = st.t;
        path.marks.push({ x: st.e, y: st.n, t: st.t, label: `${a}°` });
        if (a === 90) { out.adv = st.n; out.tr = st.e; }
        if (a === 180) out.td = st.e;
      }
    }
    if (deg >= 360) { out.vEnd = st.u / KN; break; }
  }
  return { out, path };
}

function stopping(model: Model, spec: ShipSpec, start: ShipState, env: Env, label: string, swing: boolean) {
  const st = cloneState(start);
  const cmd: Command = { pods: spec.pods.map(() => ({ alpha: 0, rpm: 0 })), bt: 0 };
  let path = 0, pn = 0, pe = 0, rec = 0;
  const pts: [number, number][] = [[0, 0]], marks: Path['marks'] = [];
  for (let t = 0; t < 1500; t += DT) {
    if (swing) st.pods.forEach((p, i) => { cmd.pods[i].alpha = (spec.pods[i].y < 0 ? -179.9 : 179.9) * DEG; cmd.pods[i].rpm = Math.abs(p.alpha) > 150 * DEG ? 1 : 0.3; });
    else if (Math.abs(st.pods[0].rpm) <= spec.revInterlock) cmd.pods.forEach(p => (p.rpm = -1));
    updateActuators(spec, st, cmd, DT); rk4(model, st, env, { V: 0, from: 0 }, null, DT);
    path += Math.hypot(st.n - pn, st.e - pe); pn = st.n; pe = st.e;
    rec += DT; if (rec >= 2) { rec = 0; pts.push([st.e, st.n]); }
    if (st.u <= 0.25) break;
  }
  marks.push({ x: st.e, y: st.n, t: st.t, label: `${Math.round(st.t)} s` });
  return { out: { label, track: path, head: st.n, side: st.e, time: st.t }, path: { label, pts, marks } };
}

export function buildPoster(spec: ShipSpec): Poster {
  const deep = new Model(spec, Infinity);
  const shallowDepth = 1.2 * spec.T;
  const shallow = new Model(spec, shallowDepth);
  const speedTable = [0.2, 0.4, 0.6, 0.8, 1].map(rpm => ({ rpm, kn: steady(deep, spec, rpm, calm()).u / KN }));
  const full = steady(deep, spec, 1, calm(), 14);
  const half = steady(deep, spec, 0.5, calm());
  const halfShallow = steady(shallow, spec, 0.5, calm(shallowDepth));
  const t1 = turning(deep, spec, full, calm(), 'Full sea speed, deep');
  const t2 = turning(shallow, spec, halfShallow, calm(shallowDepth), `Half ahead, h/T 1.2`);
  const s1 = stopping(deep, spec, full, calm(), 'Full ahead → pods swung 180°', true);
  const s2 = stopping(deep, spec, full, calm(), 'Full ahead → full astern rpm', false);
  const s3 = stopping(deep, spec, half, calm(), 'Half ahead → pods swung 180°', true);
  const thruster = [0, 1, 2, 3, 4, 5, 6].map(kn => ({ kn, eff: 1 / (1 + (kn * KN / 1.6) ** 2) }));
  const squatTable: Poster['squatTable'] = [];
  for (const conf of [0, 1]) for (const kn of [4, 6, 8, 10, 12]) squatTable.push({ kn, hT: conf, sq: squat(spec, kn * KN, 1.2 * spec.T, conf) });
  // dead-ship drift in beam wind
  const windDrift = [10, 20, 30, 40].map(kn => {
    const st = makeState(spec, 0, 0, 0, 0);
    const cmd: Command = { pods: spec.pods.map(() => ({ alpha: 0, rpm: 0 })), bt: 0 };
    for (let t = 0; t < 600; t += 0.5) { updateActuators(spec, st, cmd, 0.5); rk4(deep, st, calm(), { V: kn * KN, from: 90 * DEG }, null, 0.5); }
    return { kn, drift: Math.hypot(st.u, st.v) / KN };
  });
  const minSteerKn = speedTable[0].kn; // dead-slow speed (20 % rpm)
  return {
    speedTable, turning: [t1.out, t2.out], stopping: [s1.out, s2.out, s3.out], thruster, squatTable, windDrift,
    paths: { turn: [t1.path, t2.path], stop: [s1.path, s2.path, s3.path] }, minSteerKn,
  };
}
