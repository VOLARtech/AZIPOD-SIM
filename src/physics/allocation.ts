// Joystick / DP: desired surge force, sway force and yaw moment → pod azimuths, rpm and bow thruster.
// Weighted minimum-norm allocation with an inward pod bias (pods pull toward the centreline,
// wash goes outboard and clear of the other pod), so small orders change thrust, not azimuth.
import { ShipSpec, wrapAngle } from './ship';
import type { Command, ShipState } from './sim';

export interface JoyInput { x: number; y: number; r: number } // sway (+stbd), surge (+ahead), yaw (+bow to stbd), each −1..1
export interface DPState {
  hdgHold: boolean; posHold: boolean;
  psiRef: number; nRef: number; eRef: number;
}
export interface Est { n: number; e: number; psi: number; u: number; v: number; r: number }

export function joyLimits(spec: ShipSpec, btEff: number) {
  const podT = spec.pods.reduce((a, p) => a + p.Tb * (1 - spec.tded), 0);
  const bt = spec.bowThruster.Tmax * btEff;
  const xp = Math.abs(spec.pods[0].x), xb = spec.bowThruster.x;
  return {
    X: 0.85 * podT,
    Y: Math.max(20e3, 0.85 * Math.min(bt * (1 + xb / xp), podT * 0.5 * (1 + xp / xb))),
    N: 0.8 * (bt * xb + 0.4 * podT * xp),
  };
}

/** PD heading / position keeping on the *estimated* state, added to the stick. */
export function dpForces(spec: ShipSpec, m: number, Iz: number, est: Est, dp: DPState, lim: { X: number; Y: number; N: number }) {
  let X = 0, Y = 0, N = 0;
  if (dp.hdgHold) {
    const w = 0.06, z = 0.9;
    N = Iz * (w * w * wrapAngle(dp.psiRef - est.psi) - 2 * z * w * est.r);
  }
  if (dp.posHold) {
    const w = 0.045, z = 0.9;
    const dn = dp.nRef - est.n, de = dp.eRef - est.e, c = Math.cos(est.psi), s = Math.sin(est.psi);
    const ex = c * dn + s * de, ey = -s * dn + c * de;
    X = m * (w * w * ex - 2 * z * w * est.u);
    Y = m * 1.7 * (w * w * ey - 2 * z * w * est.v);
  }
  return { X: clamp(X / lim.X), Y: clamp(Y / lim.Y), N: clamp(N / lim.N) };
}
const clamp = (x: number) => Math.max(-1, Math.min(1, x));

/** Allocate normalised stick (−1..1 per axis) to a lever command. */
export function allocate(spec: ShipSpec, st: ShipState, joy: JoyInput, btEff: number, cmd: Command) {
  const lim = joyLimits(spec, btEff);
  const tau = [joy.y * lim.X, joy.x * lim.Y, joy.r * lim.N];
  const pods = spec.pods;
  // unknowns: Fx1 Fy1 Fx2 Fy2 Fb
  const B = [
    [1, 0, 1, 0, 0],
    [0, 1, 0, 1, 1],
    [-pods[0].y, pods[0].x, -pods[1].y, pods[1].x, spec.bowThruster.x],
  ];
  const wInv = [1, 1, 1, 1, Math.max(0.02, btEff * btEff) * 1.5]; // bow thruster expensive when ineffective
  // f = W⁻¹Bᵀ (B W⁻¹ Bᵀ)⁻¹ τ
  const A: number[][] = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) for (let k = 0; k < 5; k++) A[i][j] += B[i][k] * wInv[k] * B[j][k];
  const lam = solve3(A, tau);
  const f = [0, 1, 2, 3, 4].map(k => wInv[k] * (B[0][k] * lam[0] + B[1][k] * lam[1] + B[2][k] * lam[2]));
  // inward bias: each pod pulls toward the centreline; equal and opposite, so no net force
  const bias = 0.12 * pods[0].Tb;
  const vec = [[f[0], f[1] - Math.sign(pods[0].y) * bias], [f[2], f[3] - Math.sign(pods[1].y) * bias]];
  vec.forEach(([fx, fy], i) => {
    const mag = Math.hypot(fx, fy), Tmax = pods[i].Tb * (1 - spec.tded);
    cmd.pods[i].alpha = Math.atan2(fy, fx);
    cmd.pods[i].rpm = Math.min(1, Math.sqrt(mag / Tmax));
  });
  const btMax = spec.bowThruster.Tmax * Math.max(0.05, btEff);
  const b = Math.max(-1, Math.min(1, f[4] / btMax));
  cmd.bt = Math.sign(b) * Math.sqrt(Math.abs(b));
  void st;
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
