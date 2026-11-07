// The content rules, as code. `npm test` runs lintContent over everything the guide ships, so a
// statement without a source, a number that is not bound to the model or a published figure, a missing
// check or a ship the text does not fit all fail the build rather than reach a player.
import type { ShipSpec } from '../physics/ship';
import { appliesTo, familyOf, trackOf } from './families';
import { fill, isToken, stripTokens, tokensIn } from './tokens';
import { FAMS, TRACKS } from './types';
import type { Claim, Content, Source } from './types';

/** Longest text each field may have once filled in, so a card fits a phone panel. */
export const CAP = { title: 48, brief: 110, why: 320, sim: 320, step: 140, claim: 420 } as const;

/** What the content may refer to: the registries it is checked against. */
export interface LintEnv {
  sources: Record<string, Source>;
  ships: Record<string, ShipSpec>;
  scenarios: { id: string }[];
  /** Tip predicates, step checks, procedure proofs and debrief metrics. */
  rules: ReadonlySet<string>;
  checks: ReadonlySet<string>;
  proofs: ReadonlySet<string>;
  metrics: ReadonlySet<string>;
}

/** A number with a unit: such figures in our own words must be {tokens}. Angles in degrees are descriptive and allowed. */
const QUANT = /(?<![\w.])\d+(?:[.,]\d+)?\s?(?:%|kn\b|kt\b|knots?\b|m\/s\b|cm\/s\b|rpm\b|kN\b|MW\b|kW\b|tonnes?\b|t\b|s\b|sec\b|seconds?\b|min\b|minutes?\b|m\b|metres?\b|meters?\b|L\b)/;
export const quantity = (text: string) => stripTokens(text).match(QUANT)?.[0] ?? null;

const ID = /^[a-z0-9][a-z0-9-]*$/;
const PAPER = new Set(['paper']);
const PUBLISHED_KINDS = new Set(['standard', 'manual', 'guidance', 'incident', 'paper']);

export function lintContent(c: Content, env: LintEnv): string[] {
  const out: string[] = [];
  const bad = (id: string, msg: string) => out.push(`${id}: ${msg}`);
  const seen = new Set<string>();

  const claims = (id: string, cs: Claim[], what = 'real') => {
    cs.forEach((cl, i) => {
      const at = `${what}[${i}]`;
      if (!cl.text.trim()) bad(id, `${at} is empty`);
      if (cl.text.length > CAP.claim) bad(id, `${at} is ${cl.text.length} characters (max ${CAP.claim})`);
      for (const t of tokensIn(cl.text)) if (!isToken(t)) bad(id, `${at} uses unknown token {${t}}`);
      if (!['measured', 'published', 'rule', 'derived'].includes(cl.conf)) bad(id, `${at} has no valid confidence`);
      if (cl.conf !== 'derived' && cl.src.length === 0) bad(id, `${at} (${cl.conf}) has no source: no source, no card`);
      const srcs = cl.src.map(s => env.sources[s]);
      cl.src.forEach((s, k) => { if (!srcs[k]) bad(id, `${at} cites unknown source "${s}"`); });
      const kinds = new Set(srcs.filter(Boolean).map(s => s.kind));
      if (cl.conf === 'measured' && ![...kinds].some(k => PAPER.has(k))) bad(id, `${at} is "measured" but cites no paper`);
      if (cl.conf === 'published' && ![...kinds].some(k => PUBLISHED_KINDS.has(k))) bad(id, `${at} is "published" but cites only informal sources`);
      if (cl.conf === 'derived') { const q = quantity(cl.text); if (q) bad(id, `${at} is derived from the model but states "${q}": use a {token}`); }
    });
  };

  /** Our own words: known tokens, no loose quantities, and the filled-in text fits for every ship it speaks to. */
  const words = (id: string, field: string, text: string | undefined, cap: number, ships: ShipSpec[], required = false) => {
    if (text === undefined || text === '') { if (required) bad(id, `${field} is empty`); return; }
    for (const t of tokensIn(text)) if (!isToken(t)) bad(id, `${field} uses unknown token {${t}}`);
    const q = quantity(text);
    if (q) bad(id, `${field} states "${q}" as a bare number: use a {token} bound to the ship or a published figure`);
    for (const s of ships) {
      const n = fill(text, s).length;
      if (n > cap) { bad(id, `${field} is ${n} characters for ${s.id} (max ${cap})`); break; }
    }
  };

  const base = (it: { id: string; track: string; fam: string[]; ships?: string[]; review: string; title: string; brief: string }) => {
    if (seen.has(it.id)) bad(it.id, 'duplicate id');
    seen.add(it.id);
    if (!ID.test(it.id)) bad(it.id, 'id must be lower-case words joined by hyphens');
    if (!TRACKS.includes(it.track as never)) bad(it.id, `unknown track "${it.track}"`);
    if (!it.fam.length) bad(it.id, 'no propulsion family');
    for (const f of it.fam) if (!FAMS.includes(f as never)) bad(it.id, `unknown family "${f}"`);
    for (const f of it.fam) if (FAMS.includes(f as never) && it.track !== 'tugs' && trackOf(f as never) !== it.track) bad(it.id, `family "${f}" is not in the ${it.track} track`);     // any ship can be given tugs
    for (const s of it.ships ?? []) {
      const sp = env.ships[s];
      if (!sp) bad(it.id, `unknown ship "${s}"`);
      else if (!it.fam.includes(familyOf(sp))) bad(it.id, `ship "${s}" is family "${familyOf(sp)}", not one of ${it.fam.join(', ')}`);
    }
    if (it.review !== 'draft' && it.review !== 'reviewed') bad(it.id, 'review must be draft or reviewed');
    if (!it.title.trim()) bad(it.id, 'title is empty');
    if (it.title.length > CAP.title) bad(it.id, `title is ${it.title.length} characters (max ${CAP.title})`);
    const ships = Object.values(env.ships).filter(s => appliesTo(it as never, s));
    if (!ships.length) bad(it.id, 'speaks to no ship in the fleet');
    words(it.id, 'brief', it.brief, CAP.brief, ships, true);
    return ships;
  };

  for (const k of c.cards) {
    const ships = base(k);
    words(k.id, 'why', k.why, CAP.why, ships);
    words(k.id, 'sim', k.sim, CAP.sim, ships);
    claims(k.id, k.real);
    if (!k.real.length && !k.sim) bad(k.id, 'has neither a real-world claim nor a note on the model');
    if (k.tip) {
      if (!env.rules.has(k.tip.when)) bad(k.id, `tip rule "${k.tip.when}" does not exist`);
      if (!(k.tip.hold >= 0) || !(k.tip.cool >= 0)) bad(k.id, 'tip hold and cool must be zero or more seconds');
      if (![1, 2, 3].includes(k.tip.prio)) bad(k.id, 'tip prio must be 1, 2 or 3');
    }
  }

  for (const p of c.procedures) {
    const ships = base(p);
    words(p.id, 'sim', p.sim, CAP.sim, ships);
    claims(p.id, p.real);
    if (!p.steps.length) bad(p.id, 'has no steps');
    if (!env.proofs.has(p.proof)) bad(p.id, `proof "${p.proof}" does not exist: every procedure is run headless in the tests`);
    const sid = new Set<string>();
    p.steps.forEach(s => {
      if (sid.has(s.id)) bad(p.id, `duplicate step id "${s.id}"`);
      sid.add(s.id);
      if (!env.checks.has(s.check)) bad(p.id, `step "${s.id}" uses unknown check "${s.check}"`);
      words(`${p.id}/${s.id}`, 'text', s.text, CAP.step, ships, true);
      words(`${p.id}/${s.id}`, 'why', s.why, CAP.why, ships);
    });
  }

  for (const e of c.exercises) {
    const ships = base(e);
    claims(e.id, e.real);
    const sp = env.ships[e.ship];
    if (!sp) bad(e.id, `unknown ship "${e.ship}"`);
    else if (!e.fam.includes(familyOf(sp))) bad(e.id, `ship "${e.ship}" is family "${familyOf(sp)}", not one of ${e.fam.join(', ')}`);
    if (!env.scenarios.some(s => s.id === e.scenario)) bad(e.id, `unknown scenario "${e.scenario}"`);
    if (!e.objectives.length) bad(e.id, 'has no objectives');
    if (!e.metrics.length) bad(e.id, 'has no debrief metrics');
    for (const m of e.metrics) if (!env.metrics.has(m)) bad(e.id, `unknown metric "${m}"`);
    for (const o of e.objectives) words(e.id, 'objective', o, CAP.brief, ships, true);
    for (const [k, v] of Object.entries(e.env ?? {})) if (!Number.isFinite(v)) bad(e.id, `env.${k} is not a number`);
  }

  return out;
}
