// The situations a tip can wait for. A card names its rule by id (Card.tip.when); the rule reads the
// context and answers whether the situation holds right now. The tracks add theirs as they are written.
import { DEG, KN } from '../physics/consts';
import { TUG_FADE } from '../physics/mooring';
import { closingFast } from './align';
import type { Ctx } from './context';

export type Rule = (c: Ctx) => boolean;

/** Faster than this [m/s] the assist tugs keep too little of their pull to be worth asking (the tip warns, and the drill asks her to be slower). */
export const TUGS_SLOW = 0.65 * TUG_FADE;

export const RULES: Record<string, Rule> = {
  /** A reverse order is being ignored because the rpm is still high. */
  'rev-blocked': c => c.revBlocked.some(Boolean),
  /** A pod is across the flow with the rpm up at speed: the blades are at their worst load. */
  'pods-across-flow': c => c.sog > 3 * KN && c.units.some(u => { const a = Math.abs(u.alpha); return a > 50 * DEG && a < 130 * DEG && Math.abs(u.rpm) > 0.5; }),
  /** The switchboard is short: the pods are being held back to feed the thrusters. */
  'power-limited': c => c.powerLimited,
  /** An end of the hull is closing the quay faster than the guideline for its distance. */
  'closing-fast': c => c.quay.some(q => closingFast(c.spec, q)),
  /** The assist tugs are being asked to work while she is going too fast for them to keep their grip. */
  'tugs-too-fast': c => c.tugs.some(t => t.order !== 0) && Math.abs(c.u) > TUGS_SLOW,
  /** A direct-reversing engine has been ordered astern and is waiting for the shaft to slow before it can start. */
  'astern-waiting': c => c.engine.some(m => m.startsWith('WAITING')),
  /** An escorting tug is heeling toward the deck edge with the line still fast: the girting danger. */
  'girting-risk': c => !!c.heel && !!c.tow && !c.tow.released && !c.tow.parted && c.tow.T > 0 && Math.abs(c.heel.phi) > 0.6 * c.heel.edge,
};
