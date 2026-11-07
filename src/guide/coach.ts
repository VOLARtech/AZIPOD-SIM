// The tip engine. Each card with a `tip` rule waits for its situation to hold for a while, is offered
// at most once per cooldown, and one tip is on show at a time: the most urgent, then the one that has
// held longest. A tip the player has marked as seen is never offered again until they ask to see them all.
import { appliesTo } from './families';
import type { Ctx } from './context';
import type { Rule } from './rules';
import type { Card } from './types';

/** A tip stays this long [s] once shown, even if its situation clears… */
export const MIN_SHOW = 8;
/** …and this long while the situation still holds. */
export const MAX_SHOW = 25;

export interface CoachOptions { tips: boolean; seen: ReadonlySet<string> }

export class Coach {
  private held = new Map<string, number>();
  private last = new Map<string, number>();
  private cur: { card: Card; since: number } | null = null;
  private mine = new Map<string, Card[]>();

  constructor(private cards: Card[], private rules: Record<string, Rule>) {}

  /** A new scenario or ship: forget what has been held and shown. */
  reset() { this.held.clear(); this.last.clear(); this.cur = null; this.mine.clear(); }

  /** The tip on show now, if any. */
  get current(): Card | null { return this.cur?.card ?? null; }

  /** The player closed the tip: it stays off until its cooldown has run. */
  dismiss() { this.cur = null; }

  private cardsFor(spec: Ctx['spec']): Card[] {
    let l = this.mine.get(spec.id);
    if (!l) this.mine.set(spec.id, (l = this.cards.filter(k => k.tip && appliesTo(k, spec))));
    return l;
  }

  /** Advance by `dt` simulated seconds with the situation `c`; returns the tip to show (or null). */
  step(c: Ctx, dt: number, o: CoachOptions): Card | null {
    if (!o.tips) { this.cur = null; return null; }
    let best: Card | null = null, bestHeld = -1;
    for (const k of this.cardsFor(c.spec)) {
      const r = k.tip!, rule = this.rules[r.when];
      const on = !!rule && rule(c);
      const h = on ? (this.held.get(k.id) ?? 0) + dt : 0;
      this.held.set(k.id, h);
      if (!on || h < r.hold || o.seen.has(k.id)) continue;
      const l = this.last.get(k.id);
      if (l !== undefined && c.t - l < r.cool && this.cur?.card.id !== k.id) continue;
      if (!best || r.prio > best.tip!.prio || (r.prio === best.tip!.prio && h > bestHeld)) { best = k; bestHeld = h; }
    }
    if (this.cur) {
      const age = c.t - this.cur.since, id = this.cur.card.id;
      const still = (this.held.get(id) ?? 0) > 0;
      const urgent = !!best && best.id !== id && best.tip!.prio > this.cur.card.tip!.prio;
      if (!urgent && !o.seen.has(id) && (age < MIN_SHOW || (still && age < MAX_SHOW))) return this.cur.card;
      this.cur = null;
    }
    if (best) { this.cur = { card: best, since: c.t }; this.last.set(best.id, c.t); }
    return this.cur?.card ?? null;
  }
}
