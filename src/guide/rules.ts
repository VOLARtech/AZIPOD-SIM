// The situations a tip can wait for. A card names its rule by id (Card.tip.when); the rule reads the
// context and answers whether the situation holds right now. The tracks add theirs as they are written.
import type { Ctx } from './context';

export type Rule = (c: Ctx) => boolean;

export const RULES: Record<string, Rule> = {};
