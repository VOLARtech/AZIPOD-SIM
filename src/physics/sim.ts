// 3-DOF manoeuvring model (Fossen 2011 / MMG style), integrated over-ground:
//   (M_RB + M_A) ν̇ = τ − C_RB(ν)ν − C_A(ν_r)ν_r − D(ν_r) + M_A ν̇_c
// ν = [u v r] over ground in body axes, ν_r = ν − ν_c (water-relative),
// ν̇_c = [r v_c, −r u_c, 0] for an earth-fixed current seen from rotating axes.
import { DEG, Hydro, RHO, RHO_AIR, ShipSpec, deriveHydro, resistanceCt } from './ship';
import { Obstacle, Fender, contactForces, ContactInfo, Pt } from './contact';
import { MooringLine, lineForces } from './mooring';
import { DepthField, groundingForces } from './harbour';

export interface PodState { alpha: number; rpm: number }
export interface ShipState {
  t: number; n: number; e: number; psi: number;
  u: number; v: number; r: number;
  pods: PodState[]; bt: number;
}
export type LeverMode = 'twin' | 'indep';
export interface Command { pods: PodState[]; bt: number; mode?: LeverMode }

/** What the propulsion control system is doing to your orders. */
export interface ActStatus {
  revBlocked: boolean[];      // reverse order ignored: rpm too high
  rpmLimit: number[];         // current rpm ceiling per pod (power / berthing split)
  split: boolean[];           // athwartships pod power-reduced in berthing split
  podPower: number[]; btPower: number; avail: number; limited: boolean;
}
export function emptyStatus(n: number): ActStatus {
  return { revBlocked: Array(n).fill(false), rpmLimit: Array(n).fill(1), split: Array(n).fill(false), podPower: Array(n).fill(0), btPower: 0, avail: 0, limited: false };
}

export interface World {
  obstacles: Obstacle[]; fenders: Fender[];
  contact?: boolean;                          // false: skip hull contact (predictor)
  lines?: MooringLine[]; bollards?: Pt[];     // mooring lines (force evaluated inside RK4)
  lineT?: number[];                           // out: tensions at last evaluation
  ext?: Wrench;                               // body wrench held over the step (tugs, bank, wash)
  depthAt?: DepthField; squat?: number;       // grounding
  aground?: number;                           // out: max keel penetration [m]
}
export type CurrentField = (n: number, e: number) => [number, number]; // [vN, vE] m/s
export interface Env {
  windSpeed: number;  // m/s, mean
  windFrom: number;   // rad, true direction wind comes from
  gusts: boolean;
  current: CurrentField;
  depth: number;      // m (Infinity = deep)
}

export interface Wrench { X: number; Y: number; N: number }
export interface Breakdown {
  hull: Wrench; pods: (Wrench & { T: number; eff: number })[]; bt: Wrench & { eff: number };
  wind: Wrench & { relSpeed: number; relAngle: number }; contact: Wrench; current: [number, number];
}
const W = (): Wrench => ({ X: 0, Y: 0, N: 0 });
export function emptyBreakdown(nPods: number): Breakdown {
  return {
    hull: W(), pods: Array.from({ length: nPods }, () => ({ ...W(), T: 0, eff: 1 })),
    bt: { ...W(), eff: 1 }, wind: { ...W(), relSpeed: 0, relAngle: 0 }, contact: W(), current: [0, 0],
  };
}

export const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

/** Thrust of one pod for normalised rpm n and axial advance speed Va (linear K_T(J)). */
function podThrust(Tb: number, asternFrac: number, Vz: number, n: number, Va: number) {
  if (n >= 0) return Math.max(Tb * (n * n - n * Va / Vz), -0.1 * Tb * n * n);
  return -Tb * asternFrac * (n * n + 0.3 * -n * Va / Vz);
}

export class Model {
  h: Hydro;
  constructor(public spec: ShipSpec, depth: number) { this.h = deriveHydro(spec, depth); }
  setDepth(d: number) { this.h = deriveHydro(this.spec, d); }

  /** Accelerations [u̇ v̇ ṙ] (body, over ground). */
  accel(st: ShipState, env: Env, wind: { V: number; from: number }, obstacles: World | null,
        bd?: Breakdown, ci?: ContactInfo): [number, number, number] {
    const s = this.spec, h = this.h;
    const { u, v, r, psi } = st;
    const cps = Math.cos(psi), sps = Math.sin(psi);

    // Current at CG → body axes; relative velocities
    const [cN, cE] = env.current(st.n, st.e);
    const uc = cps * cN + sps * cE, vc = -sps * cN + cps * cE;
    const ur = u - uc, vr = v - vc;

    // Rigid-body Coriolis (−C_RB(ν)ν)
    let X = h.m * (v + h.xg * r) * r;
    let Y = -h.m * u * r;
    let N = -h.m * h.xg * u * r;
    // Added-mass Coriolis (−C_A(ν_r)ν_r), incl. Munk moment (Y_v̇ − X_u̇)·u_r·v_r
    X += -(h.Yvd * vr + h.Yrd * r) * r;
    Y += h.Xud * ur * r;
    N += (h.Yvd * vr + h.Yrd * r) * ur - h.Xud * ur * vr;
    // + M_A ν̇_c
    X += -h.Xud * r * vc;
    Y += h.Yvd * r * uc;
    N += h.Nvd * r * uc;

    // Hull: resistance + viscous lift (∝ forward speed) + strip cross-flow drag
    const Ct = resistanceCt(s, ur, h.hT);
    let Xh = -0.5 * RHO * h.S * Ct * Math.abs(ur) * ur - h.Xlin * ur * Math.exp(-ur * ur);
    let Yh = h.kYv * Math.abs(ur) * vr + h.kYr * ur * r - h.Ylin * vr;
    let Nh = h.kNv * ur * vr + h.kNr * Math.abs(ur) * r - h.Nlin * r;
    for (const sp of h.strips) {
      // local lateral current at strip (captures current shear across the hull)
      const pn = st.n + sp.x * cps, pe = st.e + sp.x * sps;
      const [lN, lE] = env.current(pn, pe);
      const vcl = -sps * lN + cps * lE;
      const vl = v - vcl + sp.x * r;
      const f = -h.cfK * Math.abs(vl) * vl * sp.dx;
      Yh += f; Nh += f * sp.x;
    }
    X += Xh; Y += Yh; N += Nh;
    if (bd) { bd.hull.X = Xh; bd.hull.Y = Yh; bd.hull.N = Nh; bd.current = [cN, cE]; }

    // Azipods: thrust along azimuth, strut normal force, hull & pod-pod interaction
    const np = s.pods.length;
    for (let i = 0; i < np; i++) {
      const p = s.pods[i], ps = st.pods[i];
      const pa = ps.alpha + p.alphaOffset;
      const ca = Math.cos(pa), sa = Math.sin(pa);
      const up = ur - p.y * r, vp = vr + p.x * r;
      const Va = (up * ca + vp * sa) * (1 - s.wake);
      let T = podThrust(p.Tb * p.thrustMul, p.asternFrac, s.Vzero, ps.rpm, Va);
      // Wash direction (opposite to thrust)
      const wx = -ca * (Math.sign(T) || 1);
      let eff = 1;
      // wash driven forward under the hull loses momentum (Coanda/friction)
      if (wx > 0) eff *= 1 - 0.22 * wx * wx;
      T *= eff;
      let Fx = T * (1 - s.tded) * ca, Fy = T * (1 - s.tded) * sa;
      const Adisk = Math.PI * p.D * p.D / 4;
      const wn = up * sa - vp * ca, wm = Math.hypot(up, vp);
      const wa = up * ca + vp * sa;                        // ship-relative motion along pod axis
      // Strut + pod body as a lifting surface / flat plate in cross-flow
      let Fn = 0.5 * RHO * p.strutArea * 1.2 * wm * wn;
      // Propeller ram (momentum) drag: water through the disk leaves along the shaft,
      // so its cross-flow momentum is destroyed. ṁ from actuator-disk theory.
      const Vax = Math.abs(wa) * (1 - s.wake);
      // Glauert oblique-flow actuator disk: mass flow uses the total velocity at the disk
      const Vp = Math.abs(wn);
      let vi = 0.5 * (-Vax + Math.sqrt(Vax * Vax + 2 * Math.abs(T) / (RHO * Adisk)));
      for (let it = 0; it < 3; it++) vi = Math.abs(T) / (2 * RHO * Adisk * Math.max(0.3, Math.hypot(Vax + vi, Vp)));
      const spin = 0.2 + 0.8 * Math.min(1, Math.abs(ps.rpm) / 0.15);
      const mdot = RHO * Adisk * Math.hypot(Vax + vi, Vp) * spin;
      Fn += mdot * wn * s.ramK;
      Fx += Fn * -sa; Fy += Fn * ca;
      // Axial: pod body drag; windmilling disk drag at zero rpm;
      // reversed propeller meeting oncoming flow brakes like a blocked disk (2nd quadrant)
      const idle = Math.max(0, 1 - Math.abs(ps.rpm) / 0.08);
      let Fa = -0.5 * RHO * (1.2 + 0.12 * Adisk * idle) * Math.abs(wa) * wa;
      if (ps.rpm < 0 && wa > 0) Fa -= 0.5 * RHO * Adisk * 0.9 * Math.min(1, -ps.rpm / 0.3) * Vax * Vax;
      Fx += Fa * ca; Fy += Fa * sa;
      const Np = p.x * Fy - p.y * Fx;
      X += Fx; Y += Fy; N += Np;
      if (bd) { const b = bd.pods[i]; b.X = Fx; b.Y = Fy; b.N = Np; b.T = T; b.eff = eff; }
    }
    // Downstream pod-pod wake interaction (applied as reduction of the hit pod)
    for (let i = 0; i < np; i++) for (let j = 0; j < np; j++) if (i !== j) {
      const p = s.pods[i], q = s.pods[j], ps = st.pods[i];
      if (Math.abs(ps.rpm) < 0.05) continue;
      const sg = ps.rpm >= 0 ? 1 : -1, pa = ps.alpha + p.alphaOffset;
      const wx = -Math.cos(pa) * sg, wy = -Math.sin(pa) * sg;
      const dx = q.x - p.x, dy = q.y - p.y, d = Math.hypot(dx, dy);
      const ang = Math.acos(Math.max(-1, Math.min(1, (dx * wx + dy * wy) / d)));
      const loss = 0.35 * Math.exp(-((ang / (14 * DEG)) ** 2)) * Math.min(1, ps.rpm * ps.rpm * 1.5);
      if (loss < 1e-3) continue;
      const qs = st.pods[j];
      const qa = qs.alpha + q.alphaOffset;
      const T = podThrust(q.Tb * q.thrustMul, q.asternFrac, s.Vzero, qs.rpm, 0) * (1 - s.tded) * loss;
      const Fx = -T * Math.cos(qa), Fy = -T * Math.sin(qa);
      X += Fx; Y += Fy; N += q.x * Fy - q.y * Fx;
      if (bd) { const b = bd.pods[j]; b.X += Fx; b.Y += Fy; b.N += q.x * Fy - q.y * Fx; b.eff *= 1 - loss; }
    }

    // Bow thruster: effectiveness collapses with forward speed
    {
      const bt = s.bowThruster;
      const eff = 1 / (1 + (ur / 1.6) ** 2);
      const Fy = bt.Tmax * st.bt * Math.abs(st.bt) * eff;
      Y += Fy; N += bt.x * Fy;
      if (bd) { bd.bt.X = 0; bd.bt.Y = Fy; bd.bt.N = bt.x * Fy; bd.bt.eff = eff; }
    }

    // Wind (Isherwood-type coefficients, apparent wind over ground velocity)
    if (wind.V > 0.01) {
      const wto = wind.from + Math.PI;
      const awx = wind.V * Math.cos(wto - psi) - u, awy = wind.V * Math.sin(wto - psi) - v;
      const Vrw = Math.hypot(awx, awy);
      const gam = Math.atan2(-awy, -awx); // direction apparent wind comes FROM, rel. bow (+stbd)
      const q = 0.5 * RHO_AIR * Vrw * Vrw, w = s.windage;
      const Xw = -w.cx * Math.cos(gam) * q * w.AF;
      const Yw = -w.cy * Math.sin(gam) * q * w.AL;
      const Nw = -w.cn * Math.sin(2 * gam) * q * w.AL * s.L + w.xw * Yw;
      X += Xw; Y += Yw; N += Nw;
      if (bd) { bd.wind.X = Xw; bd.wind.Y = Yw; bd.wind.N = Nw; bd.wind.relSpeed = Vrw; bd.wind.relAngle = gam; }
    } else if (bd) { bd.wind.X = bd.wind.Y = bd.wind.N = 0; bd.wind.relSpeed = 0; }

    // Contact (quays, fenders, banks)
    if (bd) { bd.contact.X = bd.contact.Y = bd.contact.N = 0; }
    if (obstacles) {
      const w = obstacles;
      if (w.contact !== false && (w.obstacles.length || w.fenders.length)) {
        const c = contactForces(st, w.obstacles, w.fenders, ci);
        X += c.X; Y += c.Y; N += c.N;
        if (bd) { bd.contact.X = c.X; bd.contact.Y = c.Y; bd.contact.N = c.N; }
      }
      if (w.lines && w.bollards) {
        const l = lineForces(st, w.lines, w.bollards, w.lineT);
        X += l.X; Y += l.Y; N += l.N;
      }
      if (w.ext) { X += w.ext.X; Y += w.ext.Y; N += w.ext.N; }
      if (w.depthAt) {
        const g = groundingForces(s, st, w.depthAt, w.squat ?? 0);
        X += g.X; Y += g.Y; N += g.N; w.aground = g.maxPen;
      }
    }

    const Mi = h.Minv;
    return [
      Mi[0] * X + Mi[1] * Y + Mi[2] * N,
      Mi[3] * X + Mi[4] * Y + Mi[5] * N,
      Mi[6] * X + Mi[7] * Y + Mi[8] * N,
    ];
  }
}

/**
 * Propulsion control system: rate limits, reversal interlock, astern cap,
 * shared electrical power and the berthing-split power reduction.
 */
export function updateActuators(spec: ShipSpec, st: ShipState, cmd: Command, dt: number, out?: ActStatus) {
  const n = st.pods.length;
  // bow thruster first: it takes its share of the switchboard
  const maxB = dt / spec.btRpmTime, db = cmd.bt - st.bt;
  st.bt += Math.max(-maxB, Math.min(maxB, db));
  const btP = spec.bowThruster.P * Math.abs(st.bt) ** 3;
  const podPmax = spec.pods.reduce((a, p) => a + p.P, 0);
  const budget = Math.max(0, spec.powerAvail - btP);
  const powerLim = Math.min(1, Math.cbrt(budget / podPmax));

  // berthing split (independent levers): one pod fore-and-aft, the other athwartships
  const lon = st.pods.map(p => Math.abs(Math.cos(p.alpha)) > 0.85);
  const ath = st.pods.map(p => Math.abs(Math.cos(p.alpha)) < 0.4);
  let limited = powerLim < 0.999;
  for (let i = 0; i < n; i++) {
    const p = st.pods[i], c = cmd.pods[i], ps = spec.pods[i];
    const da = wrap(c.alpha - p.alpha), maxA = spec.podSlew * ps.slewMul * dt;
    p.alpha = wrap(p.alpha + Math.max(-maxA, Math.min(maxA, da)));

    const split = cmd.mode === 'indep' && ath[i] && lon.some((l, j) => l && j !== i);
    const lim = Math.min(powerLim, split ? 0.7 : 1);
    let target = Math.max(-spec.asternMax, Math.min(1, c.rpm));
    target = Math.max(-lim * spec.asternMax, Math.min(lim, target));
    // a reverse order is ignored while the propeller turns fast the other way
    const blocked = target * p.rpm < 0 && Math.abs(p.rpm) > spec.revInterlock && c.rpm !== 0;
    if (blocked) target = Math.sign(p.rpm) * Math.min(Math.abs(p.rpm), lim);
    const maxR = dt / spec.podRpmTime, dr = target - p.rpm;
    p.rpm += Math.max(-maxR, Math.min(maxR, dr));
    if (out) {
      out.revBlocked[i] = blocked; out.rpmLimit[i] = lim; out.split[i] = split;
      out.podPower[i] = ps.P * Math.abs(p.rpm) ** 3;
      if (split) limited = true;
    }
  }
  if (out) { out.btPower = btP; out.avail = spec.powerAvail; out.limited = limited; }
}

const tmp = (st: ShipState): ShipState => ({ ...st, pods: st.pods });

/** One RK4 step of the rigid-body states; actuators held over the step. */
export function rk4(model: Model, st: ShipState, env: Env, wind: { V: number; from: number },
                    obstacles: World | null, dt: number) {
  const deriv = (s: ShipState) => {
    const c = Math.cos(s.psi), sn = Math.sin(s.psi);
    const a = model.accel(s, env, wind, obstacles);
    return [c * s.u - sn * s.v, sn * s.u + c * s.v, s.r, a[0], a[1], a[2]];
  };
  const add = (s: ShipState, k: number[], f: number): ShipState => {
    const o = tmp(s);
    o.n += k[0] * f; o.e += k[1] * f; o.psi += k[2] * f; o.u += k[3] * f; o.v += k[4] * f; o.r += k[5] * f;
    return o;
  };
  const k1 = deriv(st), k2 = deriv(add(st, k1, dt / 2)), k3 = deriv(add(st, k2, dt / 2)), k4 = deriv(add(st, k3, dt));
  st.n += dt / 6 * (k1[0] + 2 * k2[0] + 2 * k3[0] + k4[0]);
  st.e += dt / 6 * (k1[1] + 2 * k2[1] + 2 * k3[1] + k4[1]);
  st.psi = wrap(st.psi + dt / 6 * (k1[2] + 2 * k2[2] + 2 * k3[2] + k4[2]));
  st.u += dt / 6 * (k1[3] + 2 * k2[3] + 2 * k3[3] + k4[3]);
  st.v += dt / 6 * (k1[4] + 2 * k2[4] + 2 * k3[4] + k4[4]);
  st.r += dt / 6 * (k1[5] + 2 * k2[5] + 2 * k3[5] + k4[5]);
  st.t += dt;
}

export function cloneState(s: ShipState): ShipState {
  return { ...s, pods: s.pods.map(p => ({ ...p })) };
}

export function makeState(spec: ShipSpec, n: number, e: number, psiDeg: number, uKn = 0): ShipState {
  return {
    t: 0, n, e, psi: wrap(psiDeg * DEG), u: uKn * 0.514444, v: 0, r: 0,
    pods: spec.pods.map(() => ({ alpha: 0, rpm: 0 })), bt: 0,
  };
}

/** Copy of a ship spec with the deliberate errors an onboard predictor model carries. */
export function mismatched(spec: ShipSpec): ShipSpec {
  return {
    ...spec, Cd: spec.Cd * 1.12, formFactor: spec.formFactor * 0.96,
    windage: { ...spec.windage, AL: spec.windage.AL * 0.9, AF: spec.windage.AF * 0.9 },
    pods: spec.pods.map(p => ({ ...p, Tb: p.Tb * 0.97, thrustMul: 1, alphaOffset: 0, slewMul: 1 })),
  };
}

/** Gust model: Ornstein–Uhlenbeck on speed factor and direction. */
export class Gust {
  f = 0; d = 0;
  private seed = 12345;
  private rand() { this.seed = (this.seed * 1664525 + 1013904223) >>> 0; return this.seed / 4294967296; }
  private gauss() { const a = this.rand() || 1e-9, b = this.rand(); return Math.sqrt(-2 * Math.log(a)) * Math.cos(2 * Math.PI * b); }
  step(dt: number, on: boolean) {
    if (!on) { this.f *= 0.9; this.d *= 0.9; return; }
    const tauF = 12, sF = 0.17, tauD = 25, sD = 7 * DEG;
    this.f += -this.f / tauF * dt + sF * Math.sqrt(2 * dt / tauF) * this.gauss();
    this.d += -this.d / tauD * dt + sD * Math.sqrt(2 * dt / tauD) * this.gauss();
  }
}

/** Autopilot used for approach runs in trials: pods steer to hold a heading. */
export function holdCourse(cmd: Command, st: ShipState, psiRef: number) {
  const a = Math.max(-0.17, Math.min(0.17, -1.2 * wrap(psiRef - st.psi) + 25 * st.r));
  cmd.pods.forEach(p => (p.alpha = a));
}
