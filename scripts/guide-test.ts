// Training-guide tests: the content rules, the sources and the claims register. Run: npm test
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { DEG, KN, SHIPS } from '../src/physics/ship';
import { Runtime } from '../src/physics/runtime';
import { makeState } from '../src/physics/sim';
import type { Env } from '../src/physics/sim';
import { SCENARIOS } from '../src/scenarios';
import { Coach, MIN_SHOW } from '../src/guide/coach';
import { guideCtx } from '../src/guide/context';
import type { Ctx } from '../src/guide/context';
import { RULES } from '../src/guide/rules';
import type { Rule } from '../src/guide/rules';
import { CONTENT } from '../src/guide/content';
import { renderClaims } from '../src/guide/dossier';
import { appliesTo, familyOf, trackOf } from '../src/guide/families';
import { CAP, lintContent, quantity } from '../src/guide/lint';
import type { LintEnv } from '../src/guide/lint';
import { SOURCES, SRC } from '../src/guide/sources';
import { fill, isToken, stripTokens, tokensIn } from '../src/guide/tokens';
import { FAMS } from '../src/guide/types';
import type { Card, Content, Exercise, Procedure, TipRule } from '../src/guide/types';

let pass = 0;
const test = (name: string, fn: () => void) => {
  try { fn(); pass++; console.log('  ok  ', name); }
  catch (e) { console.log('  FAIL', name, '\n       ', (e as Error).message); process.exitCode = 1; }
};
const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');

/** The registries the real content is checked against. Later steps add the rules, checks, proofs and metrics. */
const realEnv = (): LintEnv => ({ sources: SRC, ships: SHIPS, scenarios: SCENARIOS, rules: new Set(Object.keys(RULES)), checks: new Set(), proofs: new Set(), metrics: new Set() });
/** A small registry for the fixtures below. */
const fxEnv = (): LintEnv => ({ ...realEnv(), rules: new Set(['x']), checks: new Set(['c']), proofs: new Set(['p']), metrics: new Set(['m']) });

console.log('sources');
{
  test('every source has a unique id, a citation, a known kind and an https address', () => {
    const ids = new Set<string>();
    for (const s of SOURCES) {
      assert.ok(/^[a-z0-9-]+$/.test(s.id), s.id);
      assert.ok(!ids.has(s.id), `duplicate ${s.id}`);
      ids.add(s.id);
      assert.ok(s.cite.length > 20, `${s.id}: citation too short`);
      assert.ok(s.short.length >= 4 && s.short.length <= 30, `${s.id}: short name "${s.short}"`);
      assert.ok(['standard', 'paper', 'manual', 'guidance', 'incident', 'textbook', 'web'].includes(s.kind), s.id);
      if (s.url) assert.ok(s.url.startsWith('https://'), `${s.id}: ${s.url}`);
    }
  });
  test('docs/TRAINING.md lists exactly the sources in the registry', () => {
    const doc = read('../docs/TRAINING.md'), at = doc.indexOf('## Source register');
    const register = doc.slice(at, doc.indexOf('\n## ', at + 1));
    const listed = [...register.matchAll(/^\| `([a-z0-9-]+)` \|/gm)].map(m => m[1]).sort();
    assert.ok(at >= 0 && listed.length > 0, 'no source register found');
    assert.deepEqual(listed, SOURCES.map(s => s.id).sort());
  });
}

console.log('families');
{
  const EXPECT: Record<string, string> = {
    becancour: 'pod', lady: 'pod', spirit: 'pod', 'paspaley-pearl': 'pod', icebreaker: 'pod',
    'asd-tug': 'asd', 'rotor-tug': 'rotor', 'vsp-tug': 'vsp',
    kvlcc2: 'twostroke', 'kvlcc2-ballast': 'twostroke', kcs: 'twostroke', panamax: 'twostroke', 'panamax-rotor': 'twostroke', ulcv: 'twostroke', lng: 'twostroke',
    ropax: 'cpp', 'cruise-shaft': 'cpp', frigate: 'cpp', superyacht: 'cpp', 'push-convoy': 'cpp', 'cb-baltic': 'cpp', 'cb-baltic-ballast': 'cpp',
    'hsc-cat': 'jet', psv: 'dp', ahts: 'dp',
  };
  test('every ship in the fleet belongs to the family her bridge station and units give her', () => {
    assert.deepEqual(Object.keys(EXPECT).sort(), Object.keys(SHIPS).sort());
    for (const [id, f] of Object.entries(EXPECT)) assert.equal(familyOf(SHIPS[id]), f, id);
  });
  test('every family has at least one ship, and every family belongs to one track', () => {
    for (const f of FAMS) assert.ok(Object.values(SHIPS).some(s => familyOf(s) === f), f);
    assert.deepEqual([...new Set(['pod', 'asd', 'vsp', 'rotor', 'twostroke', 'cpp', 'jet', 'dp'].map(f => trackOf(f as never)))].sort(), ['azipod', 'special', 'tugs']);
  });
  test('appliesTo respects the family and the ship list', () => {
    assert.ok(appliesTo({ fam: ['pod'] }, SHIPS.spirit));
    assert.ok(!appliesTo({ fam: ['pod'] }, SHIPS.kcs));
    assert.ok(appliesTo({ fam: ['pod'], ships: ['spirit'] }, SHIPS.spirit));
    assert.ok(!appliesTo({ fam: ['pod'], ships: ['spirit'] }, SHIPS.lady));
  });
}

console.log('tokens');
{
  test('tokens resolve to the ship\'s own particulars', () => {
    const sp = SHIPS.spirit, bc = SHIPS.becancour;
    assert.equal(fill('{rev}', sp), '28');
    assert.equal(fill('{astern}', sp), '83');
    assert.equal(fill('{slew}', sp), '6');
    assert.equal(fill('{slew}', bc), '7.5');
    assert.equal(fill('{rpmTime} s, {rpmReverse} s', sp), '30 s, 60 s');
    assert.equal(fill('{L}', sp), '261');
  });
  test('published stopping distances resolve from the validation table', () => {
    assert.equal(fill('{pub.swing180}', SHIPS.spirit), '2.7');
    assert.equal(fill('{pub.inertia}', SHIPS.spirit), '11.2');
    assert.ok(isToken('pub.out90') && !isToken('pub.nope') && !isToken('nope'));
  });
  test('tokensIn finds them and stripTokens removes them', () => {
    assert.deepEqual(tokensIn('a {rev} b {pub.in90}'), ['rev', 'pub.in90']);
    assert.equal(stripTokens('a {rev}% b'), 'a % b');
  });
  test('an unknown token is left as written, so a typo is visible', () => {
    assert.equal(fill('{nope} {rev}', SHIPS.spirit), '{nope} 28');
  });
  test('quantity() flags loose figures with units and lets tokens and angles through', () => {
    for (const t of ['about 30 s to full', 'hold 2.7 L', 'under 6 kn', 'keep 28 % rpm', 'within 60 m', '50 rpm', '12 t']) assert.ok(quantity(t), t);
    for (const t of ['{rpmTime} s to full', 'pods 90° outward', 'swing 180°', 'A.601(15) card', '{pub.swing180} L', 'two pods and 3 tugs']) assert.equal(quantity(t), null, t);
  });
}

console.log('content rules');
{
  const card = (over: Partial<Card> = {}): Card => ({
    id: 'fx-card', track: 'azipod', fam: ['pod'], ships: ['spirit'],
    title: 'Take the rpm off first',
    brief: 'Reverse orders are ignored above {rev} % rpm: ease off, then swing the pod.',
    why: 'The order waits until the rpm has come down.',
    real: [{ text: 'Opposite-direction orders are ignored above a threshold rpm.', src: ['striga-impa'], conf: 'published' }],
    sim: 'Here the limit is {rev} % of full rpm.',
    tip: { when: 'x', hold: 3, cool: 60, prio: 2 },
    review: 'draft',
    ...over,
  });
  const proc = (over: Partial<Procedure> = {}): Procedure => ({
    id: 'fx-proc', track: 'azipod', fam: ['pod'], ships: ['spirit'], title: 'Crash stop', brief: 'Stop her in open water.',
    steps: [{ id: 's1', text: 'Take the rpm off.', check: 'c' }, { id: 's2', text: 'Swing the pods.', check: 'c' }],
    real: [{ text: 'Six stopping methods were model-tested.', src: ['nowicki-2014'], conf: 'measured' }],
    proof: 'p', review: 'draft', ...over,
  });
  const ex = (over: Partial<Exercise> = {}): Exercise => ({
    id: 'fx-ex', track: 'azipod', fam: ['pod'], title: 'Crash stop', brief: 'Stop in open water and compare.',
    scenario: 'trials', ship: 'spirit', objectives: ['Stop her.'], metrics: ['m'], real: [], review: 'draft', ...over,
  });
  const lint = (c: Partial<Content>, env = fxEnv()) => lintContent({ cards: [], procedures: [], exercises: [], ...c }, env);
  const catches = (what: string, c: Partial<Content>, re: RegExp, env = fxEnv()) =>
    test(`lint catches ${what}`, () => { const p = lint(c, env); assert.ok(p.some(m => re.test(m)), `wanted ${re}, got ${JSON.stringify(p)}`); });

  test('a well-formed card, procedure and exercise pass', () => {
    assert.deepEqual(lint({ cards: [card()], procedures: [proc()], exercises: [ex()] }), []);
  });
  catches('a statement with no source', { cards: [card({ real: [{ text: 'x', src: [], conf: 'published' }] })] }, /no source/);
  catches('a source that is not in the registry', { cards: [card({ real: [{ text: 'x', src: ['nope'], conf: 'published' }] })] }, /unknown source/);
  catches('"measured" resting on guidance', { cards: [card({ real: [{ text: 'x', src: ['striga-impa'], conf: 'measured' }] })] }, /cites no paper/);
  catches('"published" resting on a web page', { cards: [card({ real: [{ text: 'x', src: ['man-reversing'], conf: 'published' }] })] }, /informal/);
  catches('a derived claim with a loose figure', { cards: [card({ real: [{ text: 'It takes 30 s.', src: [], conf: 'derived' }] })] }, /use a \{token\}/);
  test('a derived claim needs no source', () => {
    assert.deepEqual(lint({ cards: [card({ real: [{ text: 'Takes {rpmTime} s here.', src: [], conf: 'derived' }] })] }), []);
  });
  catches('a loose figure in our own words', { cards: [card({ brief: 'Takes about 30 s to reach full rpm.' })] }, /bare number/);
  catches('an unknown token', { cards: [card({ brief: 'Limit {nope} here.' })] }, /unknown token/);
  catches('a brief that is too long', { cards: [card({ brief: 'x'.repeat(CAP.brief + 1) })] }, /characters/);
  catches('a title that is too long', { cards: [card({ title: 'x'.repeat(CAP.title + 1) })] }, /title is/);
  catches('an empty brief', { cards: [card({ brief: '' })] }, /brief is empty/);
  catches('a duplicate id', { cards: [card(), card()] }, /duplicate id/);
  catches('an id that is not lower-case words', { cards: [card({ id: 'Bad_Id' })] }, /lower-case/);
  catches('a ship outside the card\'s families', { cards: [card({ ships: ['kcs'] })] }, /is family "twostroke"/);
  catches('an unknown ship', { cards: [card({ ships: ['nope'] })] }, /unknown ship/);
  catches('a family in another track', { cards: [card({ track: 'tugs' })] }, /not in the tugs track/);
  catches('a card that speaks to no ship', { cards: [card({ ships: [] })] }, /no ship/);
  catches('a card with nothing real and nothing about the model', { cards: [card({ real: [], sim: undefined })] }, /neither/);
  catches('a tip rule that does not exist', { cards: [card({ tip: { when: 'nope', hold: 1, cool: 1, prio: 2 } })] }, /does not exist/);
  catches('a procedure with no steps', { procedures: [proc({ steps: [] })] }, /no steps/);
  catches('a step check that does not exist', { procedures: [proc({ steps: [{ id: 's1', text: 'Go.', check: 'nope' }] })] }, /unknown check/);
  catches('a procedure with no proof', { procedures: [proc({ proof: 'nope' })] }, /proof "nope"/);
  catches('an exercise in an unknown scenario', { exercises: [ex({ scenario: 'nope' })] }, /unknown scenario/);
  catches('an exercise with an unknown metric', { exercises: [ex({ metrics: ['nope'] })] }, /unknown metric/);
  catches('an exercise with a ship from another family', { exercises: [ex({ ship: 'kcs' })] }, /is family "twostroke"/);
  test('lint reads the filled-in length for each ship it speaks to', () => {
    const long = card({ brief: 'x'.repeat(CAP.brief - 1) + '{L}', ships: undefined });
    assert.ok(lint({ cards: [long] }).some(m => /characters for/.test(m)));
  });
}

console.log('context');
const calm: Env = { windSpeed: 0, windFrom: 0, gusts: false, current: () => [0, 0], depth: Infinity };
const OPEN = { obstacles: [], fenders: [], bollards: [], depthAt: () => Infinity };
const mkRt = (id: string, psiDeg: number, uKn: number) => {
  const spec = SHIPS[id];
  return new Runtime(spec, makeState(spec, 0, 0, psiDeg, uKn), { pods: spec.pods.map(() => ({ alpha: 0, rpm: 0 })), bt: 0 }, calm, OPEN);
};
{
  test('the context reads the bridge sensors and the dials', () => {
    const rt = mkRt('spirit', 90, 5), c = guideCtx(rt);
    assert.equal(c.fam, 'pod');
    assert.ok(Math.abs(c.sog - 5 * KN) < 0.2 && Math.abs(c.u - 5 * KN) < 0.2, `sog ${c.sog / KN}`);
    assert.ok(Math.abs(c.bow) < 0.2 && Math.abs(c.stern) < 0.2);
    assert.equal(c.units.length, 2);
    assert.equal(c.berth, null);
    assert.deepEqual(c.revBlocked, [false, false]);
  });
  test('the berth is read as metres short or past, off the line and the heading error', () => {
    const rt = mkRt('spirit', 90, 0);
    let b = guideCtx(rt, { n: 0, e: 100, psi: 90, name: 'B' }).berth!;
    assert.ok(Math.abs(b.along + 100) < 3 && Math.abs(b.off) < 3 && Math.abs(b.dpsi) < 0.05, JSON.stringify(b));
    b = guideCtx(rt, { n: 10, e: 100, psi: 90, name: 'B' }).berth!;
    assert.ok(Math.abs(b.off - 10) < 3, `off ${b.off}`);            // she lies to starboard of the line (south of it, heading east)
    b = guideCtx(rt, { n: 0, e: -50, psi: 90, name: 'B' }).berth!;
    assert.ok(b.along > 45 && b.along < 55, `past ${b.along}`);
    b = guideCtx(rt, { n: 0, e: 100, psi: 100, name: 'B' }).berth!;
    assert.ok(Math.abs(b.dpsi + 10 * DEG) < 0.05, `dpsi ${b.dpsi}`);
  });
  test('FWD and AFT sideways speeds follow the yaw rate about the CG', () => {
    const rt = mkRt('spirit', 0, 0);
    rt.state.r = 0.01;
    for (let i = 0; i < 200; i++) rt.sensors.step(rt.state, 0.05, [0, 0], { V: 0, from: 0 });      // let the rate gyro settle
    const c = guideCtx(rt);
    assert.ok(c.bow > 0 && c.stern < 0, `${c.bow} ${c.stern}`);        // bow swings to starboard, stern to port
  });
}

console.log('coach');
{
  const sp = SHIPS.spirit;
  const tip = (id: string, when: string, o: Partial<TipRule> = {}, over: Partial<Card> = {}): Card => ({
    id, track: 'azipod', fam: ['pod'], title: id, brief: 'b', real: [], sim: 's', review: 'draft',
    tip: { when, hold: 2, cool: 60, prio: 2, ...o }, ...over,
  });
  const ctx = (t: number, over: Partial<Ctx> = {}): Ctx => ({
    t, spec: sp, fam: 'pod', lever: 'twin', sog: 0, u: 0, v: 0, r: 0, bow: 0, stern: 0, wind: 0, ukc: Infinity,
    units: [], revBlocked: [], berth: null, quay: [], ...over,
  });
  const fast: Rule = c => c.sog > 1, slow: Rule = c => c.sog < 0.5;
  const on = { tips: true, seen: new Set<string>() };

  test('a tip is offered only after its situation has held for its hold time', () => {
    const co = new Coach([tip('a', 'fast')], { fast });
    assert.equal(co.step(ctx(1, { sog: 2 }), 1, on), null);
    assert.equal(co.step(ctx(2, { sog: 2 }), 1, on)?.id, 'a');
  });
  test('a situation that comes and goes does not add up', () => {
    const co = new Coach([tip('a', 'fast')], { fast });
    co.step(ctx(1, { sog: 2 }), 1, on);
    co.step(ctx(2, { sog: 0 }), 1, on);
    assert.equal(co.step(ctx(3, { sog: 2 }), 1, on), null);
  });
  test('the most urgent tip wins, then the one that has held longest', () => {
    const co = new Coach([tip('lo', 'fast'), tip('hi', 'fast', { prio: 3 })], { fast });
    co.step(ctx(1, { sog: 2 }), 1, on);
    assert.equal(co.step(ctx(2, { sog: 2 }), 1, on)?.id, 'hi');
  });
  test('a tip stays up for its minimum time after the situation clears, then goes', () => {
    const co = new Coach([tip('a', 'fast')], { fast });
    co.step(ctx(1, { sog: 2 }), 1, on); co.step(ctx(2, { sog: 2 }), 1, on);
    assert.equal(co.step(ctx(3, { sog: 0 }), 1, on)?.id, 'a');
    assert.equal(co.step(ctx(2 + MIN_SHOW - 0.5, { sog: 0 }), 5, on)?.id, 'a');
    assert.equal(co.step(ctx(2 + MIN_SHOW, { sog: 0 }), 1, on), null);
  });
  test('after its cooldown a tip can come back, not before', () => {
    const co = new Coach([tip('a', 'fast', { cool: 60 })], { fast });
    co.step(ctx(1, { sog: 2 }), 1, on); co.step(ctx(2, { sog: 2 }), 1, on);        // shown at t = 2
    co.step(ctx(3, { sog: 0 }), 1, on); co.step(ctx(12, { sog: 0 }), 9, on);          // gone
    co.step(ctx(13, { sog: 2 }), 1, on);
    assert.equal(co.step(ctx(15, { sog: 2 }), 2, on), null, 'too soon');
    assert.equal(co.step(ctx(63, { sog: 2 }), 48, on)?.id, 'a');
  });
  test('a tip the player has seen is not offered again', () => {
    const co = new Coach([tip('a', 'fast')], { fast });
    const seen = { tips: true, seen: new Set(['a']) };
    co.step(ctx(1, { sog: 2 }), 1, seen);
    assert.equal(co.step(ctx(2, { sog: 2 }), 1, seen), null);
  });
  test('with tips off nothing is offered and nothing is on show', () => {
    const co = new Coach([tip('a', 'fast')], { fast });
    co.step(ctx(1, { sog: 2 }), 1, on); co.step(ctx(2, { sog: 2 }), 1, on);
    assert.equal(co.step(ctx(3, { sog: 2 }), 1, { tips: false, seen: new Set() }), null);
    assert.equal(co.current, null);
  });
  test('a more urgent tip pre-empts the one on show', () => {
    const co = new Coach([tip('calm', 'slow', { hold: 0 }), tip('alarm', 'fast', { prio: 3, hold: 0 })], { slow, fast });
    assert.equal(co.step(ctx(1, { sog: 0 }), 1, on)?.id, 'calm');
    assert.equal(co.step(ctx(2, { sog: 2 }), 1, on)?.id, 'alarm');
  });
  test('a tip for another ship, or with an unknown rule, never shows', () => {
    const co = new Coach([tip('a', 'fast', {}, { ships: ['lady'] }), tip('b', 'nope')], { fast });
    co.step(ctx(1, { sog: 2 }), 1, on);
    assert.equal(co.step(ctx(2, { sog: 2 }), 1, on), null);
  });
  test('dismissing a tip clears it and its cooldown keeps it off', () => {
    const co = new Coach([tip('a', 'fast', { hold: 0 })], { fast });
    assert.equal(co.step(ctx(1, { sog: 2 }), 1, on)?.id, 'a');
    co.dismiss();
    assert.equal(co.step(ctx(2, { sog: 2 }), 1, on), null);
  });
  test('reset forgets what was held and shown', () => {
    const co = new Coach([tip('a', 'fast', { hold: 0 })], { fast });
    co.step(ctx(1, { sog: 2 }), 1, on); co.reset();
    assert.equal(co.step(ctx(2, { sog: 2 }), 1, on)?.id, 'a');
  });
}

console.log('shipped content');
{
  test('everything the guide ships passes the content rules', () => {
    const p = lintContent(CONTENT, realEnv());
    assert.deepEqual(p, [], p.join('\n'));
  });
  test('docs/TRAINING-CLAIMS.md is the register of what ships', () => {
    assert.equal(read('../docs/TRAINING-CLAIMS.md'), renderClaims(CONTENT, SOURCES), 'out of date: run npm run guide:dossier');
  });
}

console.log(`\n${pass} passed${process.exitCode ? ', some failed' : ''}`);
