// Roll (heel) as a fourth degree of freedom, driven by the lateral forces the manoeuvring
// model already computes and the heights at which they act. Whatever lateral force is not
// balanced accelerates the ship at her CG, so the heeling moment is Σ F_y·(h − KG): a towline
// high on a tug pulling abeam heels her towards it (girting); the hull's lateral force deep
// under a turning ship heels her outward. Heel is reported and checked against the deck edge
// and the angle of vanishing stability; it does not feed back into the 3-DOF manoeuvring.
import { G, RHO } from './consts';
import type { ShipSpec } from './ship';
import type { Breakdown } from './sim';

export interface RollState { phi: number; p: number; maxPhi: number }
export const rollInit = (): RollState => ({ phi: 0, p: 0, maxPhi: 0 });

/** Righting lever: GM sin φ, fading to zero at the angle of vanishing stability. */
export function gz(spec: ShipSpec, phi: number) {
  const r = spec.roll!, a = Math.abs(phi);
  if (a >= r.vanish) return 0;
  return Math.sign(phi) * r.GM * Math.sin(a) * (1 - (a / r.vanish) ** 2) * (1 + 2.2 * (a / r.vanish));
}
/** Deck-edge immersion angle. */
export const deckEdge = (spec: ShipSpec) => Math.atan2(spec.look.freeboard, spec.B / 2);

/** Advance roll by dt given the force breakdown (hull, units, wind, contact) and extra lateral forces at heights. */
export function stepRoll(spec: ShipSpec, rs: RollState, bd: Breakdown, extra: { Y: number; h: number }[], dt: number) {
  const r = spec.roll!, T = spec.T, KG = r.KG;
  const m = RHO * spec.Cb * spec.L * spec.B * spec.T;
  let K = 0;
  const at = (Y: number, h: number) => { K += Y * (h - KG); };
  at(bd.hull.Y, 0.5 * T);                                   // hydrodynamic lateral force, mid-draught
  bd.pods.forEach(b => at(b.Y, 0.15 * T));                  // propulsors under the hull
  at(bd.bt.Y, 0.35 * T); if (bd.sbt) at(bd.sbt.Y, 0.35 * T);
  at(bd.wind.Y, T + r.zWind);
  at(bd.contact.Y, T + 0.5 * spec.look.freeboard);
  for (const e of extra) at(e.Y, T + e.h);
  const I = 1.2 * m * r.kxx * r.kxx, C = m * G * r.GM;
  const B = 2 * 0.08 * Math.sqrt(C * I);
  const acc = (K - B * rs.p - m * G * gz(spec, rs.phi)) / I;
  rs.p += acc * dt; rs.phi += rs.p * dt;
  rs.maxPhi = Math.max(rs.maxPhi, Math.abs(rs.phi));
  return K;
}
