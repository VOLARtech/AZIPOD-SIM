// Training-guide tests: the content rules, the sources and the claims register. Run: npm test
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { SHIPS } from '../src/physics/ship';
import { SCENARIOS } from '../src/scenarios';
import { CONTENT } from '../src/guide/content';
import { renderClaims } from '../src/guide/dossier';
import { appliesTo, familyOf, trackOf } from '../src/guide/families';
import { CAP, lintContent, quantity } from '../src/guide/lint';
import type { LintEnv } from '../src/guide/lint';
import { SOURCES, SRC } from '../src/guide/sources';
import { fill, isToken, stripTokens, tokensIn } from '../src/guide/tokens';
import { FAMS } from '../src/guide/types';
import type { Card, Content, Exercise, Procedure } from '../src/guide/types';

let pass = 0;
const test = (name: string, fn: () => void) => {
  try { fn(); pass++; console.log('  ok  ', name); }
  catch (e) { console.log('  FAIL', name, '\n       ', (e as Error).message); process.exitCode = 1; }
};
const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');

/** The registries the real content is checked against. Later steps add the rules, checks, proofs and metrics. */
const realEnv = (): LintEnv => ({ sources: SRC, ships: SHIPS, scenarios: SCENARIOS, rules: new Set(), checks: new Set(), proofs: new Set(), metrics: new Set() });
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
