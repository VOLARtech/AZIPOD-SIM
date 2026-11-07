// Which propulsion family a ship belongs to, and which part of the guide speaks to it.
import type { ShipSpec } from '../physics/ship';
import type { Fam, Track } from './types';

/**
 * The family follows the bridge station and the kinds of unit she carries:
 *  - pod:       Azipods (the twin-pod ships, and the icebreaker's three pods on the 'asd' station)
 *  - asd/rotor: azimuth tugs (the rotor tug has three drives)
 *  - vsp:       Voith Schneider tractor
 *  - twostroke: direct-reversing two-stroke on a telegraph
 *  - cpp:       pitch lever or shaft-speed lever (CPP, geared, electric and turbine twin screws)
 *  - jet:       waterjets
 *  - dp:        dynamic-positioning suites
 */
export function familyOf(spec: ShipSpec): Fam {
  const st = spec.station ?? 'azipod';
  if (st === 'dp') return 'dp';
  if (st === 'waterjet') return 'jet';
  if (st === 'vsp') return 'vsp';
  if (st === 'telegraph') return 'twostroke';
  if (st === 'cpp') return 'cpp';
  if (st === 'asd') {
    if (spec.pods.every(p => (p.kind ?? 'azipod') === 'azipod')) return 'pod';
    return spec.pods.length >= 3 ? 'rotor' : 'asd';
  }
  return 'pod';
}

export function trackOf(fam: Fam): Track {
  return fam === 'pod' ? 'azipod' : fam === 'asd' || fam === 'vsp' || fam === 'rotor' ? 'tugs' : 'special';
}

/** True when the card, procedure or exercise speaks to this ship. */
export function appliesTo(it: { fam: Fam[]; ships?: string[] }, spec: ShipSpec): boolean {
  return it.fam.includes(familyOf(spec)) && (!it.ships || it.ships.includes(spec.id));
}
