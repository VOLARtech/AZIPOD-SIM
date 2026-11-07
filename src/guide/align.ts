// The closing-speed guideline for the last stretch of a berthing, shared by the chart overlay, the tip
// and the tests, so what is drawn, what is said and what is tested are one number.
import { approachSpeed, displacement } from '../physics/berths';
import type { ShipSpec } from '../physics/ship';
import type { Est } from '../physics/allocation';
import type { QuayPoint, QuayRead } from './context';

/** Ishihata (1988), 47 VLCC berthings: the approach speed in cm/s is conveniently half the distance to the berth in m, i.e. 0.005 m/s per metre. */
export const HALF_RULE = 0.005;
/** The guideline never asks for less than this [m/s]: below it a big ship cannot be held and the berth is made. */
export const FLOOR = 0.02;

/**
 * The sideways speed to close the berth at [m/s] with `d` metres to go to the fender face: the lower of the
 * published half-the-distance rule and this simulator's own approach-speed limit for her displacement.
 */
export function guideSpeed(spec: ShipSpec, d: number): number {
  return Math.max(FLOOR, Math.min(approachSpeed(displacement(spec)), HALF_RULE * Math.max(0, d)));
}

/**
 * How fast a hull point is closing the structure nearest to it [m/s, negative while opening], from the
 * sensor-estimated velocities (the Doppler log and the gyro), not by differencing noisy positions, so it
 * agrees with the FWD and AFT side speeds on the readouts.
 */
export function closingSpeed(est: Est, q: Pick<QuayPoint, 'n' | 'e' | 'pn' | 'pe'>): number {
  const dn = q.n - q.pn, de = q.e - q.pe, d = Math.hypot(dn, de);
  if (d < 1e-6) return 0;
  const on = q.pn - est.n, oe = q.pe - est.e;                                  // the hull point, from the CG
  const c = Math.cos(est.psi), s = Math.sin(est.psi);
  const vn = c * est.u - s * est.v - est.r * oe, ve = s * est.u + c * est.v + est.r * on;
  return (vn * dn + ve * de) / d;
}

/** An end of the hull is closing the quay clearly faster than the guideline for its distance. */
export function closingFast(spec: ShipSpec, q: QuayRead, k = 1.5): boolean {
  return Number.isFinite(q.d) && q.d > 0.5 && q.d < 60 && q.closing > k * guideSpeed(spec, q.d);
}
