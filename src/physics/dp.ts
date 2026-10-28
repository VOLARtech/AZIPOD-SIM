// Dynamic positioning for ships with more than two units: a general thrust allocator over every
// azimuth, tunnel thruster and CPP shaft the ship has, a PID position and heading controller with
// wind feed-forward, three position references with median voting, faults for training, and the
// capability plot (intact and after the worst single failure).
//
// Allocation (Fossen 2011, ch. 12; Johansen & Fossen 2013): an azimuth gives a free force vector
// (Fx, Fy), a tunnel thruster a side force, a shaft a fore-and-aft force. The weighted least-norm
// solution f = W⁻¹Bᵀ(BW⁻¹Bᵀ)⁻¹τ is found, then any unit that is saturated, or pointing into one of
// its forbidden sectors (where its wash would hit another unit or the hull), is pinned to the nearest
// allowed vector and the rest re-solved for what is left: an active-set iteration that converges in
// a few passes for a handful of units.
import { DEG, RHO, RHO_AIR, ShipSpec, wrapAngle } from './ship';
import type { Command, ShipState } from './sim';
import type { Est } from './allocation';
import { propThrust } from './units/shaft';

export interface Actuator {
  kind: 'azi' | 'tunnel' | 'shaft';
  unit: number;                      // pod index, or −1 bow thruster, −2 stern thruster
  label: string;
  x: number; y: number;
  Tmax: number;                      // ahead / maximum thrust [N]
  Tast: number;                      // astern thrust limit (tunnels and shafts) [N]
  forbid: [number, number][];        // forbidden thrust directions (azimuths), radians, a0 < a1
}

/** Every unit that can push the ship, from her particulars. */
export function actuators(spec: ShipSpec): Actuator[] {
  const out: Actuator[] = [];
  spec.pods.forEach((p, i) => {
    if (p.kind === 'shaft') {
      const pr = p.shaft!.prop, n = p.shaft!.engine.n;
      const T = propThrust(pr, n, 0, 1) * (1 - pr.tP), Ta = -propThrust(pr, n, 0, pr.cpp ? -pr.cpp.asternPitch : 1) * (1 - pr.tP);
      out.push({ kind: 'shaft', unit: i, label: p.label, x: p.x, y: p.y, Tmax: T, Tast: pr.cpp ? Ta : 0.6 * T, forbid: [] });
    } else if (p.kind === 'waterjet') return;
    else out.push({ kind: 'azi', unit: i, label: p.label, x: p.x, y: p.y, Tmax: p.Tb * (1 - spec.tded), Tast: 0, forbid: p.dpForbid ?? [] });
  });
  if (spec.bowThruster.Tmax > 0) out.push({ kind: 'tunnel', unit: -1, label: 'BOW', x: spec.bowThruster.x, y: 0, Tmax: spec.bowThruster.Tmax, Tast: spec.bowThruster.Tmax, forbid: [] });
  if (spec.sternThruster) out.push({ kind: 'tunnel', unit: -2, label: 'STERN', x: spec.sternThruster.x, y: 0, Tmax: spec.sternThruster.Tmax, Tast: spec.sternThruster.Tmax, forbid: [] });
  return out;
}

export interface Allocation { f: [number, number][]; achieved: [number, number, number]; residual: number; util: number[] }

const inForbid = (a: number, z: [number, number][]) => z.find(([a0, a1]) => wrapAngle(a - a0) >= 0 && wrapAngle(a - a0) <= wrapAngle(a1 - a0));

/**
 * Thrust allocation: τ = [X, Y, N] (body, about the origin) → a force per actuator.
 * avail[k] false: the unit is out (failed, or deselected). tunnelEff: tunnel effectiveness at this speed.
 */
export function allocateDP(acts: Actuator[], tau: [number, number, number], avail: boolean[], tunnelEff = 1): Allocation {
  // columns: azimuths give two, tunnels and shafts one
  type Col = { k: number; dir: 0 | 1 | 2 };            // 0: x, 1: y, 2: pinned direction (fixed vector)
  const f: [number, number][] = acts.map(() => [0, 0]);
  const fixed = acts.map((_, k) => !avail[k]);
  const capOf = (k: number) => (acts[k].kind === 'tunnel' ? acts[k].Tmax * tunnelEff : acts[k].Tmax);
  for (let pass = 0; pass < 8; pass++) {
    const cols: Col[] = [];
    acts.forEach((a, k) => {
      if (fixed[k]) return;
      if (a.kind === 'azi') cols.push({ k, dir: 0 }, { k, dir: 1 });
      else cols.push({ k, dir: a.kind === 'tunnel' ? 1 : 0 });
    });
    // what the pinned units already give
    let rx = tau[0], ry = tau[1], rn = tau[2];
    acts.forEach((a, k) => { if (fixed[k]) { const [fx, fy] = f[k]; rx -= fx; ry -= fy; rn -= a.x * fy - a.y * fx; } });
    if (!cols.length) break;
    // weights: cost ∝ 1/capacity² (big units carry more); tunnels slightly dearer (noise, power at speed)
    const A = [[0, 0, 0], [0, 0, 0], [0, 0, 0]], Bc: number[][] = [];
    const wInv = cols.map(c => { const cap = capOf(c.k); return cap * cap * (acts[c.k].kind === 'tunnel' ? 0.7 : 1); });
    cols.forEach((c, j) => {
      const a = acts[c.k], b = c.dir === 0 ? [1, 0, -a.y] : [0, 1, a.x];
      Bc.push(b);
      for (let r = 0; r < 3; r++) for (let s = 0; s < 3; s++) A[r][s] += b[r] * wInv[j] * b[s];
    });
    const sc = (A[0][0] + A[1][1] + A[2][2]) * 1e-9 + 1e-6;
    for (let r = 0; r < 3; r++) A[r][r] += sc;
    const lam = solve3(A, [rx, ry, rn]);
    const fr: [number, number][] = acts.map(() => [0, 0]);
    cols.forEach((c, j) => {
      const v = wInv[j] * (Bc[j][0] * lam[0] + Bc[j][1] * lam[1] + Bc[j][2] * lam[2]);
      fr[c.k][c.dir === 0 ? 0 : 1] += v;
    });
    let pinned = false;
    acts.forEach((a, k) => {
      if (fixed[k]) return;
      let [fx, fy] = fr[k];
      const cap = capOf(k);
      if (a.kind === 'azi') {
        const ang = Math.atan2(fy, fx), z = inForbid(ang, a.forbid);
        if (z && Math.hypot(fx, fy) > 1e-3 * cap) {
          // nearest edge of the sector; keep the component along it
          const e = Math.abs(wrapAngle(ang - z[0])) < Math.abs(wrapAngle(z[1] - ang)) ? z[0] : z[1];
          const along = Math.max(0, fx * Math.cos(e) + fy * Math.sin(e));
          fx = along * Math.cos(e); fy = along * Math.sin(e); pinned = fixed[k] = true;
        }
        const m = Math.hypot(fx, fy);
        if (m > cap) { fx *= cap / m; fy *= cap / m; pinned = fixed[k] = true; }
      } else {
        const v = a.kind === 'tunnel' ? fy : fx, lo = -a.Tast * (a.kind === 'tunnel' ? tunnelEff : 1);
        const cv = Math.max(lo, Math.min(cap, v));
        if (cv !== v) { pinned = fixed[k] = true; }
        if (a.kind === 'tunnel') fy = cv; else fx = cv;
      }
      f[k] = [fx, fy];
    });
    if (!pinned) break;
  }
  acts.forEach((_, k) => { if (!avail[k]) f[k] = [0, 0]; });
  let X = 0, Y = 0, N = 0;
  acts.forEach((a, k) => { X += f[k][0]; Y += f[k][1]; N += a.x * f[k][1] - a.y * f[k][0]; });
  const L = Math.max(1, ...acts.map(a => Math.hypot(a.x, a.y)));
  const residual = Math.hypot(tau[0] - X, tau[1] - Y, (tau[2] - N) / L) / Math.max(1, Math.hypot(tau[0], tau[1], tau[2] / L));
  const util = acts.map((a, k) => Math.hypot(f[k][0], f[k][1]) / Math.max(1, capOf(k)));
  return { f, achieved: [X, Y, N], residual, util };
}

/** Allocator forces → unit orders: azimuth and rpm, CPP pitch, tunnel thruster setting. */
export function toCommand(spec: ShipSpec, acts: Actuator[], al: Allocation, cmd: Command, st: ShipState, tunnelEff = 1) {
  acts.forEach((a, k) => {
    const [fx, fy] = al.f[k];
    if (a.kind === 'azi') {
      const c = cmd.pods[a.unit], m = Math.hypot(fx, fy);
      // small orders: keep the unit where it points and vary thrust (no azimuth hunting)
      if (m > 0.03 * a.Tmax) c.alpha = Math.atan2(fy, fx);
      const along = m > 0.03 * a.Tmax ? m : Math.max(0, fx * Math.cos(c.alpha) + fy * Math.sin(c.alpha));
      // thrust is reached only once the unit points that way
      const off = Math.abs(wrapAngle(c.alpha - st.pods[a.unit].alpha));
      c.rpm = Math.min(1, Math.sqrt(along / a.Tmax)) * (off > 60 * DEG ? 0.3 : 1);
    } else if (a.kind === 'shaft') {
      const c = cmd.pods[a.unit], pr = spec.pods[a.unit].shaft!.prop;
      if (pr.cpp) { c.rpm = 1; c.pitch = fx >= 0 ? Math.sqrt(fx / a.Tmax) : -pr.cpp.asternPitch * Math.sqrt(-fx / a.Tast); c.alpha = 0; }
      else { c.rpm = fx >= 0 ? Math.sqrt(fx / a.Tmax) : -Math.sqrt(-fx / a.Tast) * 0.8; c.alpha = 0; }
    } else {
      const cap = a.Tmax * Math.max(0.05, tunnelEff), v = Math.max(-1, Math.min(1, fy / cap));
      const s = Math.sign(v) * Math.sqrt(Math.abs(v));
      if (a.unit === -1) cmd.bt = s; else cmd.sbt = s;
    }
  });
}

/** Wind force on the ship from the windage model (as in the manoeuvring model, ship stationary). */
export function windLoad(spec: ShipSpec, psi: number, V: number, from: number): [number, number, number] {
  const gam = wrapAngle(from - psi);                        // direction the wind comes from, relative to the bow
  const q = 0.5 * RHO_AIR * V * V, w = spec.windage;
  const Xw = -w.cx * Math.cos(gam) * q * w.AF, Yw = -w.cy * Math.sin(gam) * q * w.AL;
  return [Xw, Yw, -w.cn * Math.sin(2 * gam) * q * w.AL * spec.L + w.xw * Yw];
}
/** Current force on a stationary ship (resistance fore and aft, cross-flow drag across). */
export function currentLoad(spec: ShipSpec, psi: number, V: number, setTo: number): [number, number, number] {
  const rel = wrapAngle(setTo - psi), uc = V * Math.cos(rel), vc = V * Math.sin(rel);
  const S = spec.L * (1.7 * spec.T + spec.Cb * spec.B);
  const X = 0.5 * RHO * S * 0.004 * Math.abs(uc) * uc;
  const Y = 0.5 * RHO * spec.L * spec.T * spec.Cd * Math.abs(vc) * vc;
  return [X, Y, 0.05 * spec.L * Y];
}

// ---------------------------------------------------------------- position references
export type RefName = 'DGNSS 1' | 'DGNSS 2' | 'HPR';
export interface Ref { name: RefName; on: boolean; off: [number, number]; drift: [number, number]; rejected: boolean }

export type DpMode = 'joy' | 'hdg' | 'auto';
export interface DpFaults { units: boolean[]; blackout: number; restart: number[] }

/** The DP system: references, controller, allocator, consequence analysis. */
export class DpSystem {
  acts: Actuator[];
  mode: DpMode = 'joy';
  sp = { n: 0, e: 0, psi: 0 };                  // setpoint (CG)
  joy = { x: 0, y: 0, r: 0 };                   // surge, sway, yaw stick −1..1
  integ = [0, 0, 0];
  refs: Ref[] = (['DGNSS 1', 'DGNSS 2', 'HPR'] as RefName[]).map(name => ({ name, on: true, off: [0, 0], drift: [0, 0], rejected: false }));
  pos = { n: 0, e: 0 };                         // voted position
  last: Allocation | null = null;
  tau: [number, number, number] = [0, 0, 0];
  consequence = '';                             // worst single failure the current demand would not survive
  faults: DpFaults;
  private lim: [number, number, number];
  private conT = 0;
  msgs: string[] = [];
  constructor(public spec: ShipSpec, private m: [number, number, number]) {
    this.acts = actuators(spec);
    this.faults = { units: this.acts.map(() => false), blackout: 0, restart: [] };
    this.lim = axisLimits(this.acts);
  }
  // ---- faults (instructor, scenario script)
  fail(k: number) { this.faults.units[k] = true; this.msgs.push(`${this.acts[k].label} TRIPPED`); }
  blackout(T = 30) { this.faults.blackout = T; this.msgs.push('BLACKOUT · ALL THRUSTERS LOST'); }
  /** A reference drifting off at `rate` m/s toward `dir` (rad); 'common' drifts both DGNSS together. */
  drift(which: RefName | 'common', rate = 0.25, dir = 1.0) {
    const v: [number, number] = [rate * Math.cos(dir), rate * Math.sin(dir)];
    for (const r of this.refs) if (which === 'common' ? r.name !== 'HPR' : r.name === which) r.drift = [...v];
  }
  clearFaults() {
    this.faults.units = this.acts.map(() => false); this.faults.blackout = 0; this.faults.restart = [];
    for (const r of this.refs) { r.off = [0, 0]; r.drift = [0, 0]; r.rejected = false; }
  }
  avail() { return this.acts.map((_, k) => !this.faults.units[k] && this.faults.blackout <= 0 && !(this.faults.restart[k] > 0)); }
  hold(est: Est) { this.pos = { n: est.n, e: est.e }; this.sp = { n: est.n, e: est.e, psi: est.psi }; this.integ = [0, 0, 0]; }
  setMode(m: DpMode, est: Est) {
    if (m !== this.mode) { this.mode = m; this.sp.psi = est.psi; if (m === 'auto') this.hold(est); this.integ = [0, 0, 0]; }
  }
  /** Move the setpoint: dx ahead, dy to starboard [m] in ship axes, dpsi [rad]. */
  move(dx: number, dy: number, dpsi: number) {
    const c = Math.cos(this.sp.psi), s = Math.sin(this.sp.psi);
    this.sp.n += dx * c - dy * s; this.sp.e += dx * s + dy * c; this.sp.psi = wrapAngle(this.sp.psi + dpsi);
  }
  /** Median vote over the references in use; a reference more than 3 m from the median is rejected. */
  private vote(est: Est, truth: ShipState, dt: number) {
    for (const r of this.refs) { r.off[0] += r.drift[0] * dt; r.off[1] += r.drift[1] * dt; }
    const pts = this.refs.map(r => (r.name === 'HPR' ? [truth.n + r.off[0], truth.e + r.off[1]] : [est.n + r.off[0], est.e + r.off[1]]));
    const use = this.refs.map((r, k) => (r.on ? k : -1)).filter(k => k >= 0);
    if (!use.length) return null;
    const med = (ax: 0 | 1) => { const v = use.map(k => pts[k][ax]).sort((a, b) => a - b); return v.length % 2 ? v[(v.length - 1) / 2] : (v[v.length / 2 - 1] + v[v.length / 2]) / 2; };
    const mn = med(0), me = med(1);
    let n = 0, e = 0, c = 0;
    for (const k of use) {
      const bad = use.length >= 3 && Math.hypot(pts[k][0] - mn, pts[k][1] - me) > 3;
      if (bad && !this.refs[k].rejected) this.msgs.push(`${this.refs[k].name} REJECTED`);
      this.refs[k].rejected = bad;
      if (!bad) { n += pts[k][0]; e += pts[k][1]; c++; }
    }
    return { n: n / c, e: e / c };
  }
  /** One control step: returns the commanded body force [X, Y, N] and writes the unit orders. */
  update(st: ShipState, est: Est, wind: { V: number; from: number }, cmd: Command, tunnelEff: number, dt: number) {
    const f = this.faults;
    if (f.blackout > 0) {
      f.blackout -= dt;
      if (f.blackout <= 0) { f.restart = this.acts.map((_, k) => 8 + 6 * k); this.msgs.push('POWER RESTORED · THRUSTERS RESTARTING'); }
    }
    f.restart = f.restart.map(t => (t > 0 ? t - dt : 0));
    const p = this.vote(est, st, dt);
    if (p) this.pos = p;
    const psi = est.psi, c = Math.cos(psi), s = Math.sin(psi);
    const [m1, m2, m3] = this.m;
    // PID per axis in ship axes; natural periods 100 s (surge, sway) and 70 s (yaw), ζ = 0.9
    const wp = 2 * Math.PI / 100, wy = 2 * Math.PI / 70, z = 0.9;
    const dn = this.sp.n - this.pos.n, de = this.sp.e - this.pos.e;
    const ex = c * dn + s * de, ey = -s * dn + c * de, epsi = wrapAngle(this.sp.psi - psi);
    const ff = windLoad(this.spec, psi, wind.V, wind.from);
    let X = 0, Y = 0, N = 0;
    if (this.mode === 'auto') {
      this.integ[0] = clampAbs(this.integ[0] + ex * dt, 0.4 * this.lim[0] / (m1 * wp * wp * wp / 10));
      this.integ[1] = clampAbs(this.integ[1] + ey * dt, 0.4 * this.lim[1] / (m2 * wp * wp * wp / 10));
      X = m1 * (wp * wp * ex - 2 * z * wp * est.u + wp * wp * wp / 10 * this.integ[0]) - ff[0];
      Y = m2 * (wp * wp * ey - 2 * z * wp * est.v + wp * wp * wp / 10 * this.integ[1]) - ff[1];
    } else {
      X = this.joy.x * this.lim[0] * 0.6; Y = this.joy.y * this.lim[1] * 0.6;
    }
    if (this.mode === 'joy') {
      N = this.joy.r * this.lim[2] * 0.6;
      this.sp.psi = psi;
    } else {
      this.integ[2] = clampAbs(this.integ[2] + epsi * dt, 0.4 * this.lim[2] / (m3 * wy * wy * wy / 10));
      N = m3 * (wy * wy * epsi - 2 * z * wy * est.r + wy * wy * wy / 10 * this.integ[2]) - ff[2];
      if (Math.abs(this.joy.r) > 0.05) { N += this.joy.r * this.lim[2] * 0.5; this.sp.psi = psi; }
    }
    this.tau = [X, Y, N];
    const av = this.avail();
    const al = allocateDP(this.acts, this.tau, av, tunnelEff);
    this.last = al;
    toCommand(this.spec, this.acts, al, cmd, st, tunnelEff);
    // failed units: no order reaches them
    this.acts.forEach((a, k) => { if (!av[k]) { if (a.unit >= 0) { cmd.pods[a.unit].rpm = 0; if (cmd.pods[a.unit].pitch !== undefined) cmd.pods[a.unit].pitch = 0; } else if (a.unit === -1) cmd.bt = 0; else cmd.sbt = 0; } });
    // consequence analysis once a second: would the demand survive the loss of any one unit?
    this.conT -= dt;
    if (this.conT <= 0) {
      this.conT = 1;
      let worst = '';
      if (this.mode === 'auto') this.acts.forEach((a, k) => { if (!av[k]) return; const a2 = av.slice(); a2[k] = false; if (allocateDP(this.acts, this.tau, a2, tunnelEff).residual > 0.05) worst = a.label; });
      this.consequence = worst;
    }
    return { ex, ey, epsi };
  }
}

const clampAbs = (v: number, m: number) => Math.max(-m, Math.min(m, v));

/** Largest force the units can give along each axis alone. */
function axisLimits(acts: Actuator[]): [number, number, number] {
  const av = acts.map(() => true);
  const lim = (ax: 0 | 1 | 2) => {
    let lo = 0, hi = ax === 2 ? 4e8 : 4e6;
    for (let k = 0; k < 30; k++) { const m = (lo + hi) / 2, t: [number, number, number] = [0, 0, 0]; t[ax] = m; if (allocateDP(acts, t, av).residual < 0.01) lo = m; else hi = m; }
    return lo;
  };
  return [lim(0), lim(1), lim(2)];
}

/**
 * Capability plot: for each environment direction (wind, current and waves from the same side),
 * the strongest wind the units can hold her against, intact and with one unit lost. Current 1 kn
 * from the same direction; no wave drift (calm-water simulator).
 */
export function capability(spec: ShipSpec, acts = actuators(spec), dirs = 36, curKn = 1) {
  const probe = (avail: boolean[]) => Array.from({ length: dirs }, (_, k) => {
    const from = k * 2 * Math.PI / dirs;
    const cur = currentLoad(spec, 0, curKn * 0.514444, from + Math.PI);
    let lo = 0, hi = 36;                                  // search to 70 kn: beyond that the plot is off the scale
    for (let it = 0; it < 16; it++) {
      const V = (lo + hi) / 2, w = windLoad(spec, 0, V, from);
      const tau: [number, number, number] = [-(w[0] + cur[0]), -(w[1] + cur[1]), -(w[2] + cur[2])];
      if (allocateDP(acts, tau, avail).residual < 0.02) lo = V; else hi = V;
    }
    return lo / 0.514444;
  });
  const intact = probe(acts.map(() => true));
  // worst single failure: the lowest holding wind per direction over every unit lost
  let worst = intact.slice(), worstUnit = '';
  let minArea = Infinity;
  acts.forEach((a, k) => {
    const av = acts.map((_, j) => j !== k), r = probe(av);
    const area = r.reduce((s, v) => s + v * v, 0);
    if (area < minArea) { minArea = area; worst = r; worstUnit = a.label; }
  });
  return { intact, worst, worstUnit, dirs };
}

function solve3(A: number[][], b: number[]): number[] {
  const [[a, bb, c], [d, e, f], [g, h, i]] = A;
  const det = a * (e * i - f * h) - bb * (d * i - f * g) + c * (d * h - e * g);
  const inv = [
    [(e * i - f * h) / det, (c * h - bb * i) / det, (bb * f - c * e) / det],
    [(f * g - d * i) / det, (a * i - c * g) / det, (c * d - a * f) / det],
    [(d * h - e * g) / det, (bb * g - a * h) / det, (a * e - bb * d) / det],
  ];
  return inv.map(r => r[0] * b[0] + r[1] * b[1] + r[2] * b[2]);
}
