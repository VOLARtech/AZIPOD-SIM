// MMG standard-method hull forces (Yasukawa & Yoshimura 2015) for ships with published
// captive-test derivatives. Valid at manoeuvring speed and moderate drift / yaw rate; the
// returned weight w fades it out at low speed, large drift, sternway and very tight turns,
// where the low-speed cross-flow model takes over.
import { RHO } from '../consts';
import type { Hydro, ShipSpec } from '../ship';

const smooth = (x: number, a: number, b: number) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

/** Hull force and moment about midship (the body origin of MMG ships). */
export function mmgHull(s: ShipSpec, h: Hydro, ur: number, vr: number, r: number, out: { X: number; Y: number; N: number; w: number }) {
  const c = s.mmg!;
  const U = Math.hypot(ur, vr);
  if (U < 0.3 || ur < 0.3) { out.w = 0; return out; }
  const v = vr / U, rp = r * s.L / U;
  out.w = smooth(ur, 0.6, 1.8) * (1 - smooth(Math.abs(v), 0.55, 0.85)) * (1 - smooth(Math.abs(rp), 0.9, 1.4));
  if (out.w === 0) return out;
  const q = 0.5 * RHO * s.L * s.T * U * U;
  // shallow water: sway damping grows fastest, the (destabilising) N_v next, yaw damping least
  const fv = h.fsh, fnv = h.fsh ** 0.8, fnr = h.fsh ** 0.6;
  out.X = q * (-c.R0 * h.rShallow + c.Xvv * v * v + c.Xvr * v * rp + c.Xrr * rp * rp + c.Xvvvv * v ** 4);
  out.Y = q * (fv * (c.Yv * v + c.Yvvv * v ** 3 + c.Yvvr * v * v * rp) + c.Yr * rp + c.Yvrr * v * rp * rp + c.Yrrr * rp ** 3);
  out.N = q * s.L * (fnv * (c.Nv * v + c.Nvvv * v ** 3 + c.Nvvr * v * v * rp) + fnr * (c.Nr * rp + c.Nvrr * v * rp * rp + c.Nrrr * rp ** 3));
  return out;
}
