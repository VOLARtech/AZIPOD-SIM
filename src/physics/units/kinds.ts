// What kind of propulsion unit a PodSpec is, and which way it pushes.
import type { PodSpec } from '../ship';

/** Azimuthing pod-type unit (Azipod or Z-drive): the original pod force model applies. */
export const isPod = (p: PodSpec) => !p.kind || p.kind === 'azipod' || p.kind === 'azimuth';
/** Direction the unit's thrust acts along, body axes (for wash and drawing). */
export function unitAxis(p: PodSpec, ps: { alpha: number }) {
  if (p.kind === 'shaft') return 0;
  if (p.kind === 'vsp') return ps.alpha;
  if (p.kind === 'waterjet') return -(ps.alpha + p.alphaOffset);     // the nozzle throws the jet the other way
  return ps.alpha + p.alphaOffset;
}
