// The situations a tip can wait for. A card names its rule by id (Card.tip.when); the rule reads the
// context and answers whether the situation holds right now. The tracks add theirs as they are written.
import { DEG, KN } from '../physics/consts';
import { closingFast } from './align';
import type { Ctx } from './context';

export type Rule = (c: Ctx) => boolean;

export const RULES: Record<string, Rule> = {
  /** A reverse order is being ignored because the rpm is still high. */
  'rev-blocked': c => c.revBlocked.some(Boolean),
  /** A pod is across the flow with the rpm up at speed: the blades are at their worst load. */
  'pods-across-flow': c => c.sog > 3 * KN && c.units.some(u => { const a = Math.abs(u.alpha); return a > 50 * DEG && a < 130 * DEG && Math.abs(u.rpm) > 0.5; }),
  /** The switchboard is short: the pods are being held back to feed the thrusters. */
  'power-limited': c => c.powerLimited,
  /** An end of the hull is closing the quay faster than the guideline for its distance. */
  'closing-fast': c => c.quay.some(q => closingFast(c.spec, q)),
};
