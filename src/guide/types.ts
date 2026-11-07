// Types for the optional training guide. The guide is data plus small pure functions: it reads the
// simulator's state and never changes the physics. The content itself is in ./content/*, the
// citations in ./sources.ts, and docs/TRAINING.md says how both are kept honest.

/**
 * How well a statement is established.
 *  - measured:  published trial or model-test data (needs a paper among its sources)
 *  - published: a standard, manual, port rule, incident report or pilot/manufacturer guidance
 *  - rule:      a cited textbook or web rule of thumb
 *  - derived:   computed from this simulator's own model; the only kind that may have no source
 */
export type Conf = 'measured' | 'published' | 'rule' | 'derived';

/** The propulsion families the guide speaks to (see families.ts). */
export type Fam = 'pod' | 'asd' | 'vsp' | 'rotor' | 'twostroke' | 'cpp' | 'jet' | 'dp';
/** The three parts of the guide. */
export type Track = 'azipod' | 'tugs' | 'special';
/** Brief: one line. Explain: why, the real-world note and its sources. */
export type Level = 'brief' | 'explain';
/** Only the user promotes a card from draft, after reading the claims register. */
export type Review = 'draft' | 'reviewed';

export type SourceKind = 'standard' | 'paper' | 'manual' | 'guidance' | 'incident' | 'textbook' | 'web';
export interface Source {
  id: string;
  /** Citation as shown in the Reference list. */
  cite: string;
  url?: string;
  kind: SourceKind;
}

/** One statement with its basis. `src` holds ids from sources.ts. */
export interface Claim { text: string; src: string[]; conf: Conf }

/** When the coach offers a card by itself. `when` is the id of a predicate in the coach's rule registry. */
export interface TipRule {
  when: string;
  /** The condition must hold this long [s] before the tip shows. */
  hold: number;
  /** Minimum gap before the same tip shows again [s]. */
  cool: number;
  /** 3 = safety, 2 = technique, 1 = background. */
  prio: 1 | 2 | 3;
}

/**
 * A piece of guidance. `brief`, `why` and `sim` are in our own words and may only carry numbers as
 * {tokens} (tokens.ts), so every figure shown is the ship's own particular or a published figure.
 * `real` holds what the real world says, with sources; `sim` says how this simulator models it.
 */
export interface Card {
  id: string;
  track: Track;
  fam: Fam[];
  /** Restrict to these ship ids (each must belong to one of `fam`). */
  ships?: string[];
  title: string;
  brief: string;
  why?: string;
  real: Claim[];
  sim?: string;
  tip?: TipRule;
  review: Review;
}

/** One step of a procedure. `check` is the id of a live check in the step runner (procedures.ts). */
export interface Step { id: string; text: string; why?: string; check: string }

/** A drill the player can run step by step. `proof` is the id of the scripted run that tests it. */
export interface Procedure {
  id: string;
  track: Track;
  fam: Fam[];
  ships?: string[];
  title: string;
  brief: string;
  steps: Step[];
  real: Claim[];
  sim?: string;
  proof: string;
  review: Review;
}

/** A guided practice: a scenario with objectives, ending in a debrief against references (no score). */
export interface Exercise {
  id: string;
  track: Track;
  fam: Fam[];
  title: string;
  brief: string;
  scenario: string;
  ship: string;
  env?: { windKn?: number; windFrom?: number; curKn?: number; curSet?: number };
  objectives: string[];
  /** Ids of the debrief metrics (exercises.ts). */
  metrics: string[];
  real: Claim[];
  review: Review;
}

export interface Content { cards: Card[]; procedures: Procedure[]; exercises: Exercise[] }

export const FAMS: readonly Fam[] = ['pod', 'asd', 'vsp', 'rotor', 'twostroke', 'cpp', 'jet', 'dp'];
export const TRACKS: readonly Track[] = ['azipod', 'tugs', 'special'];
