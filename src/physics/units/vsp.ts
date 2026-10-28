// Voith Schneider (cycloidal) propeller: a vertical-axis rotor whose blade pitch varies
// cyclically. Moving one control point sets the thrust vector's direction and size directly,
// so thrust goes anywhere in a few seconds with no slewing (the "normal law", Schneider).
// Modelled as a thrust vector (x, y) that follows the order with a first-order lag, losing
// thrust with the inflow along it, plus cross-flow drag on the blade cage.
import { RHO } from '../consts';
import type { PodSpec } from '../ship';

/** Unit state: alpha = direction of the actual thrust vector, rpm = its size (blade eccentricity 0..1). */
export function stepVsp(p: PodSpec, ps: { alpha: number; rpm: number }, cmd: { alpha: number; rpm: number }, dt: number) {
  const k = Math.min(1, dt / p.vsp!.respT);
  const e = Math.max(0, Math.min(1, cmd.rpm));
  const ax = ps.rpm * Math.cos(ps.alpha), ay = ps.rpm * Math.sin(ps.alpha);
  const bx = e * Math.cos(cmd.alpha), by = e * Math.sin(cmd.alpha);
  const nx = ax + (bx - ax) * k, ny = ay + (by - ay) * k;
  ps.rpm = Math.hypot(nx, ny);
  if (ps.rpm > 1e-4) ps.alpha = Math.atan2(ny, nx);
}

/** Force of one VSP on the hull (body axes about the origin). Vz: inflow along the thrust that cancels it. */
export function vspForce(p: PodSpec, ps: { alpha: number; rpm: number }, ur: number, vr: number, r: number, Vz: number) {
  const ca = Math.cos(ps.alpha), sa = Math.sin(ps.alpha);
  const up = ur - p.y * r, vp = vr + p.x * r;
  const along = up * ca + vp * sa;                          // ship moving along the thrust direction
  const T = p.Tb * p.thrustMul * ps.rpm * Math.max(-0.15, 1 - along / Vz);
  let X = T * ca, Y = T * sa;
  // blade cage in cross-flow: drag against the local water velocity, whatever the thrust
  const V = Math.hypot(up, vp), q = 0.5 * RHO * p.strutArea * 1.0 * V;
  X -= q * up; Y -= q * vp;
  return { X, Y, N: p.x * Y - p.y * X, T };
}
