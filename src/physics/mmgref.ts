// Independent reference implementation of the MMG standard method (Yasukawa & Yoshimura 2015)
// in the paper's own form: midship origin, CG at xG, equations of motion
//   (m+mx)u̇ − (m+my)v r − xG m r² = X_H + X_R + X_P
//   (m+my)v̇ + (m+mx)u r + xG m ṙ   = Y_H + Y_R
//   (I_zG + xG²m + J_z)ṙ + xG m(v̇ + u r) = N_H + N_R
// Shares no force code with the simulator, so comparing the two checks the simulator's
// implementation (rudder inflow, flow straightening, wake, hull polynomials, frames).
import type { MmgHull, PropellerSpec, RudderSpec } from './ship';

const RHO = 1025;
export interface MmgShip { L: number; B: number; d: number; vol: number; hull: MmgHull; prop: PropellerSpec; rud: RudderSpec }
export interface MmgState { u: number; v: number; r: number; x: number; y: number; psi: number; delta: number }

export function mmgDeriv(s: MmgShip, st: MmgState, nP: number): [number, number, number] {
  const { L, d } = s, c = s.hull, p = s.prop, rd = s.rud;
  const m = RHO * s.vol, xG = c.xG;
  const mx = c.mx * 0.5 * RHO * L * L * d, my = c.my * 0.5 * RHO * L * L * d, Jz = c.Jz * 0.5 * RHO * L ** 4 * d;
  const IzG = m * ((c.kzz ?? 0.25) * L) ** 2;
  const { u, v, r, delta } = st;
  const U = Math.hypot(u, v), beta = Math.atan2(-v, u);
  const vp = v / U, rp = r * L / U;
  // hull
  const q = 0.5 * RHO * L * d * U * U;
  const XH = q * (-c.R0 + c.Xvv * vp * vp + c.Xvr * vp * rp + c.Xrr * rp * rp + c.Xvvvv * vp ** 4);
  const YH = q * (c.Yv * vp + c.Yr * rp + c.Yvvv * vp ** 3 + c.Yvvr * vp * vp * rp + c.Yvrr * vp * rp * rp + c.Yrrr * rp ** 3);
  const NH = q * L * (c.Nv * vp + c.Nr * rp + c.Nvvv * vp ** 3 + c.Nvvr * vp * vp * rp + c.Nvrr * vp * rp * rp + c.Nrrr * rp ** 3);
  // propeller (wake in manoeuvring: 1 − w_P = (1 − w_P0)[1 + (1 − e^(−C1|β_P|))(C2 − 1)])
  const xPn = p.xP / L, bP = beta - xPn * rp;
  const C2 = bP > 0 ? 1.6 : 1.1;
  const wf = (1 - p.wP0) * (1 + (1 - Math.exp(-2 * Math.abs(bP))) * (C2 - 1));
  const J = u * wf / (nP * p.D);
  const KT = p.k0 + p.k1 * J + p.k2 * J * J;
  const T = RHO * nP * nP * p.D ** 4 * KT;
  const XP = (1 - p.tP) * T;
  // rudder
  const eta = p.D / rd.H;
  const uR = rd.eps * u * wf * Math.sqrt(eta * (1 + rd.kappa * (Math.sqrt(1 + 8 * KT / (Math.PI * J * J)) - 1)) ** 2 + (1 - eta));
  const bR = beta - rd.lR * rp;
  const vR = U * (bR > 0 ? rd.gammaP : rd.gammaM) * bR;
  const aR = delta - Math.atan(vR / uR);
  const FN = 0.5 * RHO * rd.A * (uR * uR + vR * vR) * rd.fa * Math.sin(aR);
  const XR = -(1 - rd.tR) * FN * Math.sin(delta);
  const YR = -(1 + rd.aH) * FN * Math.cos(delta);
  const NR = -(rd.xR + rd.aH * rd.xH) * FN * Math.cos(delta);
  // equations of motion
  const X = XH + XR + XP + (m + my) * v * r + xG * m * r * r;
  const Y = YH + YR - (m + mx) * u * r;
  const N = NH + NR - xG * m * u * r;
  const du = X / (m + mx);
  // [m+my, xG m; xG m, Iz+xG²m+Jz] [v̇; ṙ] = [Y; N]
  const a11 = m + my, a12 = xG * m, a22 = IzG + xG * xG * m + Jz, det = a11 * a22 - a12 * a12;
  return [du, (Y * a22 - a12 * N) / det, (a11 * N - a12 * Y) / det];
}

/** RK4 step; the rudder moves at its rate toward deltaCmd (held over the step). */
export function mmgStep(s: MmgShip, st: MmgState, nP: number, deltaCmd: number, dt: number) {
  const dmax = s.rud.rate * dt;
  st.delta += Math.max(-dmax, Math.min(dmax, deltaCmd - st.delta));
  const f = (x: MmgState) => mmgDeriv(s, x, nP);
  const add = (x: MmgState, k: number[], h: number): MmgState => {
    const c = Math.cos(x.psi), sn = Math.sin(x.psi);
    return { ...x, u: x.u + k[0] * h, v: x.v + k[1] * h, r: x.r + k[2] * h,
      x: x.x + (x.u * c - x.v * sn) * h, y: x.y + (x.u * sn + x.v * c) * h, psi: x.psi + x.r * h };
  };
  const k1 = f(st), k2 = f(add(st, k1, dt / 2)), k3 = f(add(st, k2, dt / 2)), k4 = f(add(st, k3, dt));
  const kin = (x: MmgState) => [x.u * Math.cos(x.psi) - x.v * Math.sin(x.psi), x.u * Math.sin(x.psi) + x.v * Math.cos(x.psi), x.r];
  const s2 = add(st, k1, dt / 2), s3 = add(st, k2, dt / 2), s4 = add(st, k3, dt);
  const q1 = kin(st), q2 = kin(s2), q3 = kin(s3), q4 = kin(s4);
  st.x += dt / 6 * (q1[0] + 2 * q2[0] + 2 * q3[0] + q4[0]);
  st.y += dt / 6 * (q1[1] + 2 * q2[1] + 2 * q3[1] + q4[1]);
  st.psi += dt / 6 * (q1[2] + 2 * q2[2] + 2 * q3[2] + q4[2]);
  st.u += dt / 6 * (k1[0] + 2 * k2[0] + 2 * k3[0] + k4[0]);
  st.v += dt / 6 * (k1[1] + 2 * k2[1] + 2 * k3[1] + k4[1]);
  st.r += dt / 6 * (k1[2] + 2 * k2[2] + 2 * k3[2] + k4[2]);
}
