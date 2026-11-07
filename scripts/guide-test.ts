// Training-guide tests: the content rules, the sources and the claims register. Run: npm test
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { DEG, KN, SHIPS } from '../src/physics/ship';
import type { ShipSpec } from '../src/physics/ship';
import { DT, Runtime } from '../src/physics/runtime';
import { DpSystem, actuators, capability } from '../src/physics/dp';
import { engines, fullAstern, primeRunning } from '../src/physics/pilot';
import { buildPoster } from '../src/physics/poster';
import { runTrials } from '../src/physics/trials';
import { jetForce, jetJoystick } from '../src/physics/units/jet';
import { AIR_BRAKE_N, CAMSHAFT_T } from '../src/physics/units/shaft';
import { TUG_FADE, makeTugs, tugEff, updateTugs } from '../src/physics/mooring';
import { deckEdge } from '../src/physics/roll';
import { runValidation } from '../src/physics/validation';
import { joyLimits } from '../src/physics/allocation';
import { makeState, thrusterEff } from '../src/physics/sim';
import type { Command, Env } from '../src/physics/sim';
import { SCENARIOS, berthFor, fits } from '../src/scenarios';
import { closingFast, closingSpeed, guideSpeed } from '../src/guide/align';
import { ExRun, METRICS } from '../src/guide/exercises';
import { CHECKS, HOLD, Runner } from '../src/guide/procedures';
import { scriptedCrashAstern, scriptedJetStop, scriptedStop, withShip } from '../src/guide/proofs';
import { Coach, MIN_SHOW } from '../src/guide/coach';
import { guideCtx } from '../src/guide/context';
import type { Ctx } from '../src/guide/context';
import { RULES } from '../src/guide/rules';
import { dockingStick, ghostFromStick, pivotPoint, podGhost, tugOrders } from '../src/guide/vectors';
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
const realEnv = (): LintEnv => ({ sources: SRC, ships: SHIPS, scenarios: SCENARIOS, rules: new Set(Object.keys(RULES)), checks: new Set(Object.keys(CHECKS)), proofs: new Set(Object.keys(PROOF_TESTS)), metrics: new Set(Object.keys(METRICS)) });
/** A small registry for the fixtures below. */
const fxEnv = (): LintEnv => ({ sources: SRC, ships: SHIPS, scenarios: SCENARIOS, rules: new Set(['x']), checks: new Set(['c']), proofs: new Set(['p']), metrics: new Set(['m']) });

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
    scenario: 'trials', ship: 'spirit', objectives: ['Stop her.'], begin: 'order', end: 'stopped', limit: 600, metrics: ['m'], real: [], review: 'draft', ...over,
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
  catches('"published" resting on a web page', { cards: [card({ real: [{ text: 'x', src: ['marinesite-crash'], conf: 'published' }] })] }, /informal/);
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
  catches('an Azipod card that speaks to another family', { cards: [card({ fam: ['pod', 'jet'], ships: undefined })] }, /not an Azipod family/);
  test('cards for tugs and thrusters may speak to any ship, since every ship can be given tugs and many have thrusters', () => {
    for (const track of ['tugs', 'special'] as const) assert.deepEqual(lint({ cards: [card({ track })] }), []);
  });
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
    t, spec: sp, fam: 'pod', lever: 'twin', sog: 0, psi: 0, pos: { n: 0, e: 0 }, u: 0, v: 0, r: 0, bow: 0, stern: 0, wind: 0, ukc: Infinity,
    units: [], revBlocked: [], powerLimited: false, engine: [], dp: null, heel: null, tow: null, tugs: [], berth: null, quay: [], ...over,
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

console.log('azipod cards: what the notes on the model say');
{
  const TWIN = ['becancour', 'lady', 'spirit', 'paspaley-pearl'];
  /** A pod ship under way at `kn` with her pods turning for it. */
  const spin = (id: string, kn: number) => {
    const rt = mkRt(id, 0, kn), r0 = Math.min(1, kn / SHIPS[id].vmaxKn);
    rt.state.pods.forEach(p => (p.rpm = r0)); rt.cmd.pods.forEach(p => (p.rpm = r0));
    return rt;
  };
  /** Run with rpm orders [time, rpm] and read the speed [kn] at the probe times. */
  const run = (rt: Runtime, orders: [number, number][], probes: number[]) => {
    const u: number[] = []; let k = 0, p = 0;
    for (let t = 0; p < probes.length; t += DT) {
      while (k < orders.length && t >= orders[k][0] - DT / 2) { rt.cmd.pods.forEach(c => (c.rpm = orders[k][1])); k++; }
      if (t >= probes[p] - DT / 2) { u.push(rt.state.u / KN); p++; }
      rt.step(DT);
    }
    return u;
  };

  test('pod-reverse-order: above the limit the order is ignored and the pod holds its rpm', () => {
    const rt = spin('spirit', 10), r0 = rt.state.pods[0].rpm;
    run(rt, [[5, -0.3]], [60]);
    assert.ok(rt.status.revBlocked[0] && rt.status.revBlocked[1], 'not blocked');
    assert.ok(Math.abs(rt.state.pods[0].rpm - r0) < 0.01, `rpm ${rt.state.pods[0].rpm} vs ${r0}`);       // "does not go on to set the rpm to zero"
  });
  test('pod-zero-lever: zero rpm barely slows her, and a small astern order brakes her much more', () => {
    const a = run(spin('spirit', 10), [[5, 0]], [60, 160]);
    const b = run(spin('spirit', 10), [[5, 0], [60, -0.3]], [60, 160]);
    const dropZero = a[0] - a[1], dropAstern = b[0] - b[1];
    assert.ok(dropZero > 0 && dropAstern > 2 * dropZero, `zero ${dropZero.toFixed(2)} kn, astern ${dropAstern.toFixed(2)} kn in 100 s`);
  });
  test('pod-berth-pods: one pod along and one across holds the cross pod back (SPLIT)', () => {
    const rt = mkRt('spirit', 0, 0);
    rt.setLever('indep');
    rt.cmd.pods[0].alpha = 0; rt.cmd.pods[1].alpha = 90 * DEG; rt.cmd.pods.forEach(c => (c.rpm = 0.5));
    for (let i = 0; i < 20 * 60; i++) rt.step(DT);                    // 60 s: the pod has swung across
    assert.ok(rt.status.split[1] && !rt.status.split[0], JSON.stringify(rt.status.split));
    assert.ok(rt.status.rpmLimit[1] < 1 && rt.status.rpmLimit[0] === 1);
  });
  test('the pod ships\' reverse limit and astern cap are the memento\'s 50 and 150 rpm of 180', () => {
    for (const id of [...TWIN, 'icebreaker']) {
      assert.ok(Math.abs(SHIPS[id].revInterlock - 50 / 180) < 0.005, `${id} revInterlock ${SHIPS[id].revInterlock}`);
      assert.ok(Math.abs(SHIPS[id].asternMax - 150 / 180) < 0.005, `${id} asternMax ${SHIPS[id].asternMax}`);
    }
  });
  test('pod-stopping: four of the six published methods match to within a quarter, the two 90° "rpm kept" stops run far too long', () => {
    const v = runValidation(), by = Object.fromEntries(v.rows.map(r => [r.key, r.err]));
    for (const k of ['inertia', 'swing180', 'reverse', 'indirect']) assert.ok(Math.abs(by[k]) <= 0.25, `${k} ${(by[k] * 100).toFixed(0)} %`);
    for (const k of ['out90', 'in90']) assert.ok(by[k] >= 0.4, `${k} ${(by[k] * 100).toFixed(0)} %`);
  });
  test('the published stopping distances are the ones in Nowicki\'s Table 2', () => {
    assert.deepEqual(fill('{pub.inertia} {pub.out90} {pub.in90} {pub.swing180} {pub.reverse} {pub.indirect}', SHIPS.spirit), '11.2 4.0 3.8 2.7 4.4 3.7');
  });
}

console.log('azipod tips and the closing-speed guideline');
{
  const sp = SHIPS.spirit;
  const base = (over: Partial<Ctx> = {}): Ctx => ({
    t: 0, spec: sp, fam: 'pod', lever: 'twin', sog: 0, psi: 0, pos: { n: 0, e: 0 }, u: 0, v: 0, r: 0, bow: 0, stern: 0, wind: 0, ukc: Infinity,
    units: [{ alpha: 0, rpm: 0, cmdAlpha: 0, cmdRpm: 0 }, { alpha: 0, rpm: 0, cmdAlpha: 0, cmdRpm: 0 }], revBlocked: [false, false], powerLimited: false, engine: [], dp: null, heel: null, tow: null, tugs: [],
    berth: null, quay: [], ...over,
  });
  test('the guideline is half the distance in cm/s, capped by the approach-speed limit and floored', () => {
    assert.ok(Math.abs(guideSpeed(sp, 10) - 0.05) < 1e-9);                 // 10 m: 5 cm/s
    assert.ok(Math.abs(guideSpeed(sp, 20) - 0.10) < 1e-9);
    assert.ok(guideSpeed(sp, 400) < 0.2 && guideSpeed(sp, 400) > 0.1);     // capped at the limit for her displacement (about 13 cm/s)
    assert.equal(guideSpeed(sp, 0.5), 0.02);                               // never below the floor
    assert.ok(guideSpeed(SHIPS.lady, 60) <= guideSpeed(SHIPS['paspaley-pearl'], 60));  // a heavier ship is held to a lower limit
  });
  test('closing too fast: only within range, only clearly over the guideline', () => {
    const q = (d: number, closing: number) => ({ d, closing, side: 1 as const, x: 0 });
    assert.ok(closingFast(sp, q(10, 0.2)));
    assert.ok(!closingFast(sp, q(10, 0.06)));
    assert.ok(!closingFast(sp, q(10, -0.3)), 'moving away');
    assert.ok(!closingFast(sp, q(90, 0.5)), 'out of range');
    assert.ok(!closingFast(sp, q(Infinity, 0)));
  });
  test('the closing speed comes from the estimated velocities: sideways at the end, rotation included', () => {
    const est = { n: 0, e: 0, psi: 90 * DEG, u: 0, v: 0.2, r: 0 };           // heading east, drifting to starboard (south) at 0.2 m/s
    const quayS = { n: -20, e: 0, pn: -16, pe: 0 };                             // a quay to the south, 4 m from a point amidships
    assert.ok(Math.abs(closingSpeed(est, quayS) - 0.2) < 1e-6);
    assert.ok(Math.abs(closingSpeed({ ...est, v: -0.2 }, quayS) + 0.2) < 1e-6);   // drifting away: negative
    // swinging the bow to starboard at 0.01 rad/s: a point 100 m forward moves 1 m/s to starboard, i.e. south
    const bow = { n: -20, e: 100, pn: -16, pe: 100 };
    assert.ok(Math.abs(closingSpeed({ ...est, v: 0, r: 0.01 }, bow) - 1.0) < 1e-6);
  });
  test('the tip rules read the situation', () => {
    assert.ok(RULES['rev-blocked'](base({ revBlocked: [true, false] })) && !RULES['rev-blocked'](base()));
    const across = base({ sog: 6 * KN, units: [{ alpha: 90 * DEG, rpm: 0.9, cmdAlpha: 90 * DEG, cmdRpm: 0.9 }, { alpha: 35 * DEG, rpm: 0.9, cmdAlpha: 35 * DEG, cmdRpm: 0.9 }] });
    assert.ok(RULES['pods-across-flow'](across));
    assert.ok(!RULES['pods-across-flow'](base({ ...across, sog: 1 * KN })), 'too slow to matter');
    assert.ok(!RULES['pods-across-flow'](base({ sog: 6 * KN, units: [{ alpha: 35 * DEG, rpm: 0.9, cmdAlpha: 0, cmdRpm: 0 }] })), 'ordinary steering');
    assert.ok(RULES['power-limited'](base({ powerLimited: true })) && !RULES['power-limited'](base()));
    assert.ok(RULES['closing-fast'](base({ quay: [{ d: 8, closing: 0.25, side: 1, x: 100 }, { d: 30, closing: 0, side: 1, x: -100 }] })) && !RULES['closing-fast'](base()));
  });
}

console.log('docking suggestion and pivot point');
{
  const sp = SHIPS.spirit, rt0 = mkRt('spirit', 90, 0), h = rt0.model.h;
  const masses = { surge: h.M[0], sway: h.M[4], yaw: h.M[8] }, lim = joyLimits(sp, 1);
  const base = (over: Partial<Ctx> = {}): Ctx => ({
    t: 0, spec: sp, fam: 'pod', lever: 'indep', sog: 0, psi: 90 * DEG, pos: { n: 0, e: 0 }, u: 0, v: 0, r: 0, bow: 0, stern: 0, wind: 0, ukc: Infinity,
    units: [], revBlocked: [], powerLimited: false, engine: [], dp: null, heel: null, tow: null, tugs: [], berth: { name: 'B', along: -30, off: 0, dpsi: 0, dist: 30 },
    quay: [{ d: 20, closing: 0.3, side: 1, x: 100 }, { d: 20, closing: 0.3, side: 1, x: -100 }], ...over,
  });
  const ends = (side: 1 | -1, bow: number, stern: number, d = 20) => [{ d, closing: bow, side, x: 100 }, { d, closing: stern, side, x: -100 }];

  test('closing too fast on both ends: push away from the quay, whichever side it is on', () => {
    assert.ok(dockingStick(base({ quay: ends(1, 0.3, 0.3) }), masses, lim)!.x < 0);       // quay to starboard: push to port
    assert.ok(dockingStick(base({ quay: ends(-1, 0.3, 0.3) }), masses, lim)!.x > 0);      // quay to port: push to starboard
  });
  test('both ends slower than the guideline: ask to close it', () => {
    assert.ok(dockingStick(base({ quay: ends(1, 0, 0) }), masses, lim)!.x > 0);
    assert.ok(dockingStick(base({ quay: ends(-1, 0, 0) }), masses, lim)!.x < 0);
  });
  test('the bow closing faster than the stern: turn the bow away from the quay', () => {
    assert.ok(dockingStick(base({ quay: ends(1, 0.3, 0.02) }), masses, lim)!.r < 0);      // quay to starboard: bow to port
    assert.ok(dockingStick(base({ quay: ends(-1, 0.3, 0.02) }), masses, lim)!.r > 0);
    assert.ok(dockingStick(base({ quay: ends(1, 0.02, 0.3) }), masses, lim)!.r > 0);      // the stern too fast: bow toward the quay
  });
  test('too fast along the berth: brake; within the limit: no surge order', () => {
    assert.ok(dockingStick(base({ u: 1.0, berth: { name: 'B', along: -5, off: 0, dpsi: 0, dist: 5 } }), masses, lim)!.y < 0);
    assert.equal(dockingStick(base({ u: 0.1, berth: { name: 'B', along: -30, off: 0, dpsi: 0, dist: 30 } }), masses, lim)!.y, 0);
  });
  test('no suggestion without a berth, out of range of a quay, or when she is across the berth', () => {
    assert.equal(dockingStick(base({ berth: null }), masses, lim), null);
    assert.equal(dockingStick(base({ quay: ends(1, 0.3, 0.3, 90) }), masses, lim), null);
    assert.equal(dockingStick(base({ quay: [{ d: Infinity, closing: 0, side: 1, x: 100 }] }), masses, lim), null);
    assert.equal(dockingStick(base({ berth: { name: 'B', along: -30, off: 0, dpsi: 90 * DEG, dist: 30 } }), masses, lim), null);
  });
  test('the stick stays within the stick\'s range', () => {
    const s = dockingStick(base({ u: 5, quay: ends(1, 3, -3) }), masses, lim)!;
    for (const v of [s.x, s.y, s.r]) assert.ok(v >= -1 && v <= 1);
  });
  test('the ghost is what the joystick allocator makes of the stick: the sideways force it gives is the one asked for', () => {
    const stick = dockingStick(base({ quay: ends(1, 0.3, 0.3) }), masses, lim)!;
    const g = ghostFromStick(sp, rt0.state, { ...stick, r: 0, y: 0 }, 1)!;
    const Tmax = sp.pods.map(p => p.Tb * (1 - sp.tded)), btMax = sp.bowThruster.Tmax;
    const Fy = g.units!.reduce((a, u, i) => a + Tmax[i] * u.rpm! ** 2 * Math.sin(u.alpha!), 0) + btMax * Math.sign(g.bt!) * g.bt! ** 2;
    assert.ok(Math.abs(Fy - stick.x * lim.Y) < 0.02 * Math.abs(stick.x * lim.Y), `Fy ${Fy} vs ${stick.x * lim.Y}`);
    assert.equal(ghostFromStick(SHIPS.kcs, rt0.state, stick, 1), null, 'only twin pods with a bow thruster');
    assert.equal(ghostFromStick(SHIPS.icebreaker, rt0.state, stick, 1), null);
  });

  /** A Spirit drifting onto a quay to starboard at 0.2 m/s from 20 m: does following the suggestion take the way off? */
  const drift = (follow: boolean) => {
    const spec = SHIPS.spirit, wallN = -(spec.B / 2 + 20), rt = mkRt('spirit', 90, 0);
    rt.state.v = 0.2; rt.setLever('indep');
    const berth = { n: wallN + spec.B / 2 + 0.1, e: 0, psi: 90, name: 'B' };
    const refs = [spec.L * 0.35 - spec.xg, -spec.L * 0.4 - spec.xg];
    let sum = 0, n = 0;
    for (let t = 0; t < 40; t += DT) {
      if (Math.abs(t % 1) < DT / 2) {
        const est = rt.sensors.out.est, c = Math.cos(est.psi), s = Math.sin(est.psi);
        const q = refs.map(x => { const pn = est.n + x * c - (spec.B / 2) * s, pe = est.e + x * s + (spec.B / 2) * c; return { d: Math.abs(wallN - pn), n: wallN, e: pe, pn, pe }; });
        const ctx = guideCtx(rt, berth, q);
        if (follow) {
          const g = podGhost(spec, rt.state, ctx, { surge: rt.model.h.M[0], sway: rt.model.h.M[4], yaw: rt.model.h.M[8] }, thrusterEff(rt.state.u));
          if (g) { g.units!.forEach((u, i) => { rt.cmd.pods[i].alpha = u.alpha!; rt.cmd.pods[i].rpm = u.rpm!; }); rt.cmd.bt = g.bt!; }
        }
        if (t >= 20) { sum += (ctx.quay[0].closing + ctx.quay[1].closing) / 2; n++; }
      }
      rt.step(DT);
    }
    return sum / n;
  };
  test('following the suggestion for 40 s takes at least a fifth off the closing speed of a ship drifting onto the quay', () => {
    const idle = drift(false), followed = drift(true);
    assert.ok(idle > 0.1 && followed < 0.8 * idle, `idle ${idle.toFixed(3)}, followed ${followed.toFixed(3)} m/s`);
  });

  test('the pivot point is where the sideways speed is zero, measured from the bow as the trials table does', () => {
    assert.equal(pivotPoint(sp, 0.1, 0.0001), null, 'not turning');
    assert.equal(pivotPoint(sp, 5, 0.01), null, 'far off the hull: a drift, not a pivot');
    const p = pivotPoint(sp, -0.5, 0.01)!;                         // v + r x = 0 at x = 50 m ahead of the CG
    assert.ok(Math.abs(p.x - 50) < 1e-9);
    assert.ok(Math.abs(p.fromBow - (sp.L / 2 - sp.xg - 50) / sp.L) < 1e-9);
  });
}

console.log('drills and exercises');
/** The scripted proof of every procedure: what its card says about the model, checked on every ship it speaks to. */
const PROOF_TESTS: Record<string, () => void> = {
  'pod-stop-turn-round': () => {
    for (const id of ['becancour', 'lady', 'spirit', 'paspaley-pearl']) {
      const swing = scriptedStop(SHIPS[id], 'swing180'), rev = scriptedStop(SHIPS[id], 'reverse'), ind = scriptedStop(SHIPS[id], 'indirect');
      for (const r of [swing, rev, ind]) assert.ok(r.stopped && !r.blocked, `${id}: ${JSON.stringify(r)}`);
      assert.ok(swing.reach > 1.2 && swing.reach < 3.5, `${id} swing ${swing.reach.toFixed(2)} L`);
      assert.ok(swing.reach < ind.reach && swing.reach < rev.reach, `${id}: the 180° turn is not the shortest (${swing.reach.toFixed(2)}, ${ind.reach.toFixed(2)}, ${rev.reach.toFixed(2)})`);
      assert.ok(Math.abs(swing.heading) < 5, `${id}: heading changed ${swing.heading.toFixed(1)}°`);
    }
  },
  'pod-stop-reverse': () => {
    for (const id of ['becancour', 'lady', 'spirit', 'paspaley-pearl']) {
      const rev = scriptedStop(SHIPS[id], 'reverse'), swing = scriptedStop(SHIPS[id], 'swing180'), direct = scriptedStop(SHIPS[id], 'reverse-direct', 0.65, 600);
      assert.ok(rev.stopped && !rev.blocked && rev.reach > 2 && rev.reach < 5, `${id} staged reversal ${JSON.stringify(rev)}`);
      assert.ok(rev.reach > swing.reach, `${id}: reversing should take more ship lengths than the 180° turn`);
      assert.ok(direct.blocked && !direct.stopped, `${id}: an astern order at once from speed should be ignored and she should run on (${JSON.stringify(direct)})`);
    }
  },
  'ts-crash-astern': () => {
    const ships = Object.values(SHIPS).filter(sp => familyOf(sp) === 'twostroke');
    assert.ok(ships.length >= 5, 'the direct-reversing fleet');
    for (const sp of ships) {
      const r = scriptedCrashAstern(sp);
      assert.ok(r.stopped, `${sp.id} did not stop: ${JSON.stringify(r)}`);
      assert.ok(Math.abs(r.startShaft - AIR_BRAKE_N) < 0.02, `${sp.id} started astern at ${r.startShaft.toFixed(3)} of full rpm, not ${AIR_BRAKE_N}`);
      assert.ok(r.startAt > 5 && r.startAt < 600, `${sp.id} started astern after ${r.startAt.toFixed(0)} s`);
      assert.ok(r.reach > 3 && r.reach < 15, `${sp.id}: track reach ${r.reach.toFixed(1)} L is not inside the IMO limit`);
      const wait = r.msgs.indexOf('WAITING · SHAFT TOO FAST'), start = r.msgs.indexOf('STARTING ASTERN');
      assert.ok(wait >= 0 && start > wait, `${sp.id}: ${r.msgs.join(' → ')}`);
    }
  },
  'jet-stop': () => {
    for (const sp of Object.values(SHIPS).filter(x => familyOf(x) === 'jet')) {
      const down = scriptedJetStop(sp, 'buckets'), coast = scriptedJetStop(sp, 'coast');
      assert.ok(down.stopped && down.reach < 2 && down.time < 30 && Math.abs(down.heading) < 5, `${sp.id} buckets: ${JSON.stringify(down)}`);
      assert.ok(!coast.stopped, `${sp.id}: with the buckets up and the engines idling she should still be running on after ${coast.time.toFixed(0)} s (${JSON.stringify(coast)})`);
    }
  },
  'tug-assist': () => {
    const sp = SHIPS.spirit;
    /** Two tugs on her port side push at half for a minute, with her making `kn`; then they are stopped for 20 s. */
    const push = (kn: number) => withShip(sp, () => {
      const st = makeState(sp, 0, 0, 90, kn), rpm = kn ? 0.2 : 0;
      st.pods.forEach(p => { p.rpm = rpm; });
      const rt = new Runtime(sp, st, { pods: sp.pods.map(() => ({ alpha: 0, rpm })), bt: 0 }, calm, OPEN);
      rt.tugs = makeTugs(sp.L, sp.xg, -1, 600e3);
      rt.tugs.forEach(t => { t.order = 0.5; });
      for (let t = 0; t < 60; t += DT) rt.step(DT);
      const v = st.v, r = st.r, F = rt.tugs.map(t => t.F);
      rt.tugs.forEach(t => { t.order = 0; });
      for (let t = 0; t < 20; t += DT) rt.step(DT);
      return { v, r, F, off: rt.tugs.every(t => Math.abs(t.F) < 1e3) };
    });
    const still = push(0), slow = push(2), fast = push(5), gone = push(8);
    assert.ok(still.v > 0.3 && Math.abs(still.r) < 0.2 * DEG, `at rest: ${still.v.toFixed(3)} m/s, ${(still.r / DEG).toFixed(3)}°/s`);
    assert.ok(still.F.every(f => f > 0.45 * 600e3), 'two tugs on the port side push her to starboard at about half their pull');
    assert.ok(slow.v < still.v && fast.v < slow.v && fast.v < 0.5 * still.v, `${still.v} ${slow.v} ${fast.v}`);
    assert.ok(Math.abs(gone.v) < 0.02 && gone.F.every(f => Math.abs(f) < 1e3), 'above the tugs\' speed they have no grip');
    assert.ok(still.off, 'the tugs should be off within twenty seconds of STOP');
  },
  'tug-release': () => {
    const sc = SCENARIOS.find(x => x.id === 'escort')!, sp = SHIPS['asd-tug'], edge = deckEdge(sp);
    /** The escort scenario with the tug left alone (idle drives): the line snatches her over a few minutes in. */
    const run = (release: boolean) => withShip(sp, () => {
      const rt = new Runtime(sp, makeState(sp, 0, 0, 0, sc.escort!.kn), { pods: sp.pods.map(() => ({ alpha: 0, rpm: 0 })), bt: 0 }, calm, OPEN);
      rt.attachEscort(sc.escort!, SHIPS.kvlcc2);
      let tRisk = NaN, peak = 0, after = NaN;
      for (let t = 0; t < 420; t += DT) {
        rt.step(DT);
        const c = guideCtx(rt);
        if (Number.isNaN(tRisk) && RULES['girting-risk'](c)) { tRisk = t; if (release) rt.escort!.line.mode = 'released'; }
        if (!Number.isNaN(tRisk)) {
          peak = Math.max(peak, Math.abs(c.heel!.phi));
          if (Number.isNaN(after) && t - tRisk >= 30) after = Math.abs(c.heel!.phi);
        }
      }
      return { tRisk, peak, after };
    });
    const held = run(false), released = run(true);
    assert.ok(!Number.isNaN(held.tRisk) && held.tRisk > 60 && held.tRisk < 400, `the danger should come a few minutes in (${held.tRisk} s)`);
    assert.ok(held.peak > 0.95 * edge, `held: peak heel ${(held.peak / DEG).toFixed(1)}° against a deck edge at ${(edge / DEG).toFixed(1)}°`);
    assert.ok(released.peak < 0.85 * edge && released.after < 0.25 * edge, `released: peak ${(released.peak / DEG).toFixed(1)}°, ${(released.after / DEG).toFixed(1)}° half a minute later`);
  },
};
{
  for (const [id, proof] of Object.entries(PROOF_TESTS)) test(`proof ${id}: what the card says about the model holds on every ship it speaks to`, proof);
  test('every procedure in the content has a proof, and every proof has a procedure', () => {
    assert.deepEqual(CONTENT.procedures.map(p => p.proof).sort(), Object.keys(PROOF_TESTS).sort());
  });

  const sp = SHIPS.spirit;
  const cx = (over: Partial<Ctx> = {}): Ctx => ({
    t: 0, spec: sp, fam: 'pod', lever: 'indep', sog: 6, psi: 0, pos: { n: 0, e: 0 }, u: 6, v: 0, r: 0, bow: 0, stern: 0, wind: 0, ukc: Infinity,
    units: [{ alpha: 0, rpm: 0.5, cmdAlpha: 0, cmdRpm: 0.5 }, { alpha: 0, rpm: 0.5, cmdAlpha: 0, cmdRpm: 0.5 }],
    revBlocked: [false, false], powerLimited: false, engine: [], dp: null, heel: null, tow: null, tugs: [], berth: null, quay: [], ...over,
  });
  const units = (alpha: number, rpm: number, cmdAlpha = alpha, cmdRpm = rpm) => [{ alpha, rpm, cmdAlpha, cmdRpm }, { alpha, rpm, cmdAlpha, cmdRpm }];
  const proc = CONTENT.procedures.find(p => p.id === 'pod-stop-turn-round')!;
  /** Feed the runner `secs` seconds of one situation. */
  const feed = (r: Runner, c: Ctx, secs = HOLD + 0.2) => { for (let t = 0; t < secs; t += 0.1) r.step({ ...c, t: c.t + t }, 0.1); };

  test('the runner starts at the first step and waits for the player to read it', () => {
    const r = new Runner(proc, cx());
    assert.equal(r.index, 0); assert.deepEqual(r.states.slice(0, 2), ['now', 'todo']);
    feed(r, cx());
    assert.equal(r.index, 0, 'a drill never starts itself');
    r.ack(); feed(r, cx());
    assert.equal(r.states[0], 'done'); assert.equal(r.index, 1);
  });
  test('the runner ticks a step off only once its situation has held for a moment', () => {
    const r = new Runner(proc, cx()); r.ack(); feed(r, cx());
    const round = cx({ units: units(0, 0.5, Math.PI, 0.5) });
    r.step(round, 0.1);
    assert.equal(r.index, 1, 'one tick is not enough');
    feed(r, round);
    assert.equal(r.states[1], 'done');
  });
  test('doing steps early or out of order is fine: the furthest step that holds counts and the ones before it are skipped', () => {
    const r = new Runner(proc, cx());
    feed(r, cx({ units: units(Math.PI, 0.9, Math.PI, 0.9) }));          // the pods are already round with the rpm up
    assert.deepEqual(r.states.slice(0, 4), ['skipped', 'skipped', 'skipped', 'done']);
    assert.equal(r.index, 4);
  });
  test('easing the rpm while the pods are ordered across is remembered', () => {
    const r = new Runner(proc, cx());
    r.step(cx({ units: units(0, 0.5, 90 * DEG, 0.2) }), 0.1);          // pods ordered across, rpm ordered well down
    assert.ok(r.memo.flags.eased);
    const r2 = new Runner(proc, cx());
    r2.step(cx({ units: units(0, 0.5, 90 * DEG, 0.5) }), 0.1);         // pods across with the rpm kept
    assert.ok(!r2.memo.flags.eased);
  });
  test('a tap on NEXT answers the step on the screen only: a later step that also asks to be read waits its turn', () => {
    const two = { ...proc, steps: [{ id: 'a', text: 'Read this.', check: 'ack' }, { id: 'b', text: 'Stop her.', check: 'stopped' }, { id: 'c', text: 'Read this too.', check: 'ack' }] };
    const r = new Runner(two, cx());
    r.ack(); feed(r, cx());
    assert.deepEqual(r.states, ['done', 'now', 'todo'], 'the second tap-step must not tick on the first tap');
    feed(r, cx({ sog: 0.1 }));
    assert.equal(r.index, 2);
    r.ack(); feed(r, cx({ sog: 0.1 }));
    assert.ok(r.finished && r.states.every(x => x === 'done'));
    const r2 = new Runner(two, cx());
    r2.skip(); r2.ack(); feed(r2, cx());
    assert.ok(!r2.memo.flags.ack, 'a tap on a step that does not ask to be read is ignored');
  });
  test('skip leaves a step undone, and the drill finishes after the last', () => {
    const r = new Runner(proc, cx());
    for (let i = 0; i < proc.steps.length; i++) r.skip();
    assert.ok(r.finished && r.states.every(s => s === 'skipped'));
  });
  test('the runner records the track covered and the heading change as she goes', () => {
    const r = new Runner(proc, cx());
    for (let i = 0; i < 50; i++) r.step(cx({ sog: 5, psi: 0.02 }), 0.1);
    assert.ok(Math.abs(r.path - 25) < 1e-6 && Math.abs(r.time - 5) < 1e-6 && Math.abs(r.heading - 0.02) < 1e-9);
  });
  test('the checks read the dials: reverse limit, astern and idle', () => {
    assert.ok(!CHECKS['rpm-below-limit'](cx(), { rpm0: 0.5, flags: {} }) && CHECKS['rpm-below-limit'](cx({ units: units(0, 0.2) }), { rpm0: 0.5, flags: {} }));
    assert.ok(CHECKS['astern-ordered'](cx({ units: units(0, 0.2, 0, -0.9) }), { rpm0: 0.5, flags: {} }));
    assert.ok(CHECKS['pods-idle'](cx({ units: units(0, 0, 0, 0) }), { rpm0: 0.5, flags: {} }) && !CHECKS['pods-idle'](cx(), { rpm0: 0.5, flags: {} }));
    assert.ok(CHECKS.stopped(cx({ sog: 0.1 }), { rpm0: 0, flags: {} }) && !CHECKS.stopped(cx(), { rpm0: 0, flags: {} }));
    assert.ok(CHECKS.stopped(cx({ sog: 3 * KN, u: 0.1 }), { rpm0: 0, flags: {} }), 'a ship sheering sideways with her way off is stopped as the IMO crash stop counts it');
    assert.ok(!CHECKS.stopped(cx({ sog: 3 * KN, u: 3 * KN }), { rpm0: 0, flags: {} }));
  });

  const stopEx = CONTENT.exercises.find(e => e.id === 'ex-pod-stop')!, landEx = CONTENT.exercises.find(e => e.id === 'ex-pod-alongside')!;
  const noContact = { contactLog: [] } as unknown as Runtime;
  test('a stopping exercise measures from the first order and ends when she has stopped', () => {
    const c0 = cx({ t: 0, sog: 6 });
    const run = new ExRun(stopEx, c0);
    for (let t = 0; t < 5; t += 0.5) run.update(cx({ t, sog: 6 }), noContact);
    assert.ok(!run.started, 'nothing ordered yet');
    for (let t = 5; t < 25; t += 0.5) run.update(cx({ t, sog: 5, pos: { n: (t - 5) * 5, e: 0 }, units: units(0, 0.5, Math.PI, 0.5) }), noContact);
    assert.ok(run.started && !run.finished);
    for (let t = 25; t < 60; t += 0.5) run.update(cx({ t, sog: 0.1, pos: { n: 100, e: 0 }, units: units(Math.PI, 0.5, Math.PI, 0) }), noContact);
    assert.ok(run.finished && !run.timedOut);
    const rows = run.rows(cx());
    assert.deepEqual(rows.map(r => r.label), ['Track reach', 'Time', 'Heading change', 'Off her track']);
    assert.ok(/^\d+\.\d L$/.test(rows[0].you), rows[0].you);
  });
  test('an exercise gives up when its time limit has run', () => {
    const run = new ExRun({ ...stopEx, limit: 30 }, cx({ t: 0 }));
    for (let t = 0; t < 60; t += 0.5) run.update(cx({ t, sog: 5, units: units(0, 0.5, 0, t > 1 ? 0.1 : 0.5) }), noContact);
    assert.ok(run.finished && run.timedOut);
  });
  test('an alongside exercise ends a few seconds after the first landing, and reports the landing', () => {
    const run = new ExRun(landEx, cx({ t: 0 }));
    const rt = { contactLog: [] as { t: number; vn: number; maxDefl: number }[] } as unknown as Runtime & { contactLog: { t: number; vn: number; maxDefl: number }[] };
    for (let t = 0; t < 20; t += 0.5) run.update(cx({ t, sog: 0.2 }), rt);
    assert.ok(!run.finished);
    rt.contactLog.unshift({ t: 20, vn: 0.07, maxDefl: 0.3 });
    for (let t = 20; t < 40; t += 0.5) run.update(cx({ t, sog: 0.05 }), rt);
    assert.ok(run.finished && !run.timedOut);
    const rows = Object.fromEntries(run.rows(cx()).map(r => [r.label, r.you]));
    assert.equal(rows['Landing speed'], '7 cm/s'); assert.equal(rows['Fender squeeze'], '30 % of rated');
  });
  test('the closing-speed metric is the worst ratio to the guideline within 30 m', () => {
    const acc = METRICS.closing(cx());
    const q = (d: number, closing: number) => ({ d, closing, side: 1 as const, x: 0 });
    acc.update(cx({ quay: [q(10, 0.1)] }), noContact, 1);              // guideline at 10 m is 0.05: twice
    acc.update(cx({ quay: [q(25, 0.01)] }), noContact, 1);
    acc.update(cx({ quay: [q(50, 5)] }), noContact, 1);                // beyond 30 m: ignored
    assert.equal(acc.row(cx()).you, '2.0× the guideline');
  });
  test('every exercise can be played with its ship: she fits the scenario\'s water, tugs and DP', () => {
    for (const e of CONTENT.exercises) {
      const sc = SCENARIOS.find(x => x.id === e.scenario)!, ship = SHIPS[e.ship];
      assert.ok(fits(sc, ship.T, sc.berthFace ? berthFor(sc, ship.B, 0) : sc.berth, !!ship.towPoints, ship.station === 'dp'), `${e.id}: ${ship.name} in ${sc.name}`);
    }
  });
}

console.log('tug cards: what the notes on the model say');
{
  test('tug-orders: the TUGS panel has TUG FWD and TUG AFT, each with a slider in quarters from full pull to full push', () => {
    assert.deepEqual(makeTugs(260, -4, -1).map(t => t.name), ['TUG FWD', 'TUG AFT']);
    assert.ok(/id="tg-\$\{i\}" min="-100" max="100" step="25"/.test(read('../src/main.ts')), 'the slider is not in quarters from −100 to 100');
  });
  test('tug-delay: a tug builds its pull in about twenty seconds and takes over a minute to swap from push to pull', () => {
    const tugs = makeTugs(200, 0, -1, 600e3), t = tugs[0];
    t.order = 1; let t90 = NaN, time = 0;
    for (; time < 200; time += 0.05) { updateTugs(tugs, 0, 0.05); if (Number.isNaN(t90) && Math.abs(t.F) >= 0.9 * t.Fmax) t90 = time; }
    assert.ok(t90 > 15 && t90 < 25, `90 % after ${t90.toFixed(1)} s`);
    t.order = -1; let swap = NaN;                                      // pushing on the port side is a force to starboard; pulling reverses it
    for (time = 0; time < 300; time += 0.05) { updateTugs(tugs, 0, 0.05); if (Number.isNaN(swap) && t.F < -1e3) swap = time; }
    assert.ok(swap > 55 && swap < 90, `pull began after ${swap.toFixed(0)} s`);
  });
  test('tug-speed: a tug\'s pull falls away as the ship speeds up and is gone above about six knots', () => {
    assert.equal(tugEff(0), 1);
    assert.ok(Math.abs(tugEff(TUG_FADE / 2) - 0.75) < 1e-9);
    assert.equal(tugEff(TUG_FADE * 1.01), 0);
    assert.ok(Math.abs(TUG_FADE / KN - 6) < 1e-9);
  });
  test('tug-coanda: the tug models have no wash effect between a tug and a ship', () => {
    for (const f of ['mooring', 'towline', 'escort']) assert.ok(!/coanda|wash/i.test(readFileSync(fileURLToPath(new URL(`../src/physics/${f}.ts`, import.meta.url)), 'utf8')), f);
  });
  test('tug-escort and tug-girting: the escort scenario is a tug on a line to a laden VLCC, the heel is tracked, and RELEASE lets the line go', () => {
    const sc = SCENARIOS.find(x => x.id === 'escort')!, sp = SHIPS['asd-tug'];
    assert.equal(sc.escort!.ship, 'kvlcc2'); assert.ok(sc.tugsOnly && sc.ship === 'asd-tug');
    const rt = new Runtime(sp, makeState(sp, 0, 0, 0, sc.escort!.kn), { pods: sp.pods.map(() => ({ alpha: 0, rpm: 0 })), bt: 0 }, calm, OPEN);
    rt.attachEscort(sc.escort!, SHIPS.kvlcc2);
    for (let i = 0; i < 20 * 60; i++) rt.step();
    const c = guideCtx(rt);
    assert.ok(c.heel && Math.abs(c.heel.edge - deckEdge(sp)) < 1e-12 && c.heel.edge > 0.2, 'heel is not tracked against the deck edge');
    assert.ok(c.tow && c.tow.T > 1e4 && !c.tow.released, `line ${c.tow?.T}`);
    rt.escort!.line.mode = 'released'; rt.step();
    assert.equal(rt.escort!.line.T, 0);
    assert.ok(guideCtx(rt).tow!.released);
  });
  test('tug-asd and tug-vsp: the ASD ships have azimuth drives and the Voith tractor has Voith Schneider units', () => {
    assert.ok(SHIPS['asd-tug'].pods.every(p => p.kind === 'azimuth') && SHIPS['rotor-tug'].pods.every(p => p.kind === 'azimuth'));
    assert.ok(SHIPS['vsp-tug'].pods.every(p => p.kind === 'vsp'));
  });

  const sp = SHIPS.spirit, rt0 = mkRt('spirit', 90, 0), h = rt0.model.h;
  const masses = { surge: h.M[0], sway: h.M[4], yaw: h.M[8] };
  const tugs = (side: 1 | -1, over: Partial<{ order: number; F: number }> = {}) => [
    { name: 'TUG FWD', order: 0, F: 0, Fmax: 600e3, side, x: 0.36 * sp.L - sp.xg, ...over },
    { name: 'TUG AFT', order: 0, F: 0, Fmax: 600e3, side, x: -0.36 * sp.L - sp.xg, ...over },
  ];
  const ctx = (over: Partial<Ctx> = {}): Ctx => ({
    t: 0, spec: sp, fam: 'pod', lever: 'twin', sog: 0, psi: 90 * DEG, pos: { n: 0, e: 0 }, u: 0, v: 0, r: 0, bow: 0, stern: 0, wind: 0, ukc: Infinity,
    units: [], revBlocked: [], powerLimited: false, engine: [], dp: null, heel: null, tow: null, tugs: tugs(-1), berth: { name: 'B', along: -30, off: 0, dpsi: 0, dist: 30 },
    quay: [{ d: 20, closing: 0, side: 1, x: 100 }, { d: 20, closing: 0, side: 1, x: -100 }], ...over,
  });

  test('tug orders: tugs on the far side push the ship onto the quay when both ends are slow, and pull her off when too fast', () => {
    const slow = tugOrders(ctx(), masses)!;                            // quay to starboard, tugs on the port side, nothing closing
    assert.ok(slow.every(t => t.order > 0), JSON.stringify(slow));
    const fast = tugOrders(ctx({ quay: [{ d: 20, closing: 0.3, side: 1, x: 100 }, { d: 20, closing: 0.3, side: 1, x: -100 }] }), masses)!;
    assert.ok(fast.every(t => t.order < 0), JSON.stringify(fast));
  });
  test('tug orders: a tug on the quay side pulls where the other would push', () => {
    const o = tugOrders(ctx({ tugs: tugs(1) }), masses)!;              // tugs on the starboard side, the quay too
    assert.ok(o.every(t => t.order < 0), JSON.stringify(o));
  });
  test('tug orders: the bow closing faster than the stern is answered by more push at the bow end', () => {
    const o = tugOrders(ctx({ quay: [{ d: 20, closing: 0.3, side: 1, x: 100 }, { d: 20, closing: 0.0, side: 1, x: -100 }] }), masses)!;
    assert.ok(o[0].F < o[1].F, `fwd ${o[0].F} aft ${o[1].F}`);          // the forward tug pulls the bow off harder than the aft tug does
  });
  test('tug orders: the two forces make the sway force and the yaw moment asked for, and the orders are in quarters', () => {
    const c = ctx({ quay: [{ d: 25, closing: 0.0, side: 1, x: 100 }, { d: 18, closing: 0.0, side: 1, x: -100 }] });
    const o = tugOrders(c, masses)!, [a, b] = c.tugs;
    for (const t of o) assert.ok(Math.abs(t.order * 4 - Math.round(t.order * 4)) < 1e-9 && Math.abs(t.order) <= 1);
    if (!o[0].cut) {
      const Y = o[0].F + o[1].F, N = a.x * o[0].F + b.x * o[1].F;
      assert.ok(Math.abs(Y) > 1e3 && Math.abs(N) > 1e3, 'a demand was expected');
    }
  });
  test('tug orders: none without a berth, without exactly two tugs, or when she is too fast for them to grip', () => {
    assert.equal(tugOrders(ctx({ berth: null }), masses), null);
    assert.equal(tugOrders(ctx({ tugs: [] }), masses), null);
    assert.equal(tugOrders(ctx({ tugs: tugs(-1).slice(0, 1) }), masses), null);
    assert.equal(tugOrders(ctx({ u: 7 * KN }), masses), null);
  });
  test('tug orders are cut together when a tug has too little to give, keeping the balance between them', () => {
    const weak = tugs(-1).map(t => ({ ...t, Fmax: 20e3 }));
    const o = tugOrders(ctx({ tugs: weak, quay: [{ d: 20, closing: 0.3, side: 1, x: 100 }, { d: 20, closing: 0.3, side: 1, x: -100 }] }), masses)!;
    assert.ok(o.every(t => t.cut) && o.every(t => Math.abs(t.order) <= 1));
    assert.ok(o.some(t => Math.abs(t.order) === 1), 'the stronger demand should reach full');
  });
  test('the assist-tug drill ticks through on a real run: slow, order, trim, stop', () => {
    const spirit = SHIPS.spirit;
    withShip(spirit, () => {
      const st = makeState(spirit, 0, 0, 90, 1);
      st.pods.forEach(p => { p.rpm = 0.2; });
      const rt = new Runtime(spirit, st, { pods: spirit.pods.map(() => ({ alpha: 0, rpm: 0.2 })), bt: 0 }, calm, OPEN);
      rt.tugs = makeTugs(spirit.L, spirit.xg, -1, 600e3);
      const run = new Runner(CONTENT.procedures.find(p => p.id === 'tug-assist')!, guideCtx(rt));
      const tick = (secs: number) => { for (let t = 0; t < secs; t += DT) { rt.step(DT); run.step(guideCtx(rt), DT); } };
      tick(1); assert.equal(run.index, 1, 'she is slow enough already');
      assert.ok(!run.states.includes('skipped'));
      rt.tugs[0].order = 0.5; tick(1); assert.equal(run.index, 1, 'one tug is not enough');
      rt.tugs[1].order = 0.5; tick(1); assert.equal(run.index, 2);
      run.ack(); tick(1); assert.equal(run.index, 3);
      rt.tugs.forEach(t => { t.order = 0; }); tick(1);
      assert.ok(run.finished && run.states.every(x => x === 'done'), run.states.join());
    });
  });
  test('the assist-tug drill does not finish by itself: tugs at STOP before they ever worked is not "eased"', () => {
    const spirit = SHIPS.spirit;
    withShip(spirit, () => {
      const rt = new Runtime(spirit, makeState(spirit, 0, 0, 90, 1), { pods: spirit.pods.map(() => ({ alpha: 0, rpm: 0 })), bt: 0 }, calm, OPEN);
      rt.tugs = makeTugs(spirit.L, spirit.xg, -1, 600e3);
      const run = new Runner(CONTENT.procedures.find(p => p.id === 'tug-assist')!, guideCtx(rt));
      for (let t = 0; t < 5; t += DT) { rt.step(DT); run.step(guideCtx(rt), DT); }
      assert.equal(run.index, 1);
      assert.ok(!run.finished);
    });
  });
  test('the release drill ticks through on a real run of the escort: read, danger, release, upright', () => {
    const sc = SCENARIOS.find(x => x.id === 'escort')!, sp = SHIPS['asd-tug'];
    withShip(sp, () => {
      const rt = new Runtime(sp, makeState(sp, 0, 0, 0, sc.escort!.kn), { pods: sp.pods.map(() => ({ alpha: 0, rpm: 0 })), bt: 0 }, calm, OPEN);
      rt.attachEscort(sc.escort!, SHIPS.kvlcc2);
      const run = new Runner(CONTENT.procedures.find(p => p.id === 'tug-release')!, guideCtx(rt));
      const tick = (secs: number, until: () => boolean) => { for (let t = 0; t < secs && !until(); t += DT) { rt.step(DT); run.step(guideCtx(rt), DT); } };
      tick(5, () => false); assert.equal(run.index, 0, 'a drill waits to be read');
      run.ack(); tick(400, () => run.index > 1);
      assert.equal(run.index, 2, 'the danger came and was seen');
      assert.ok(!run.states.includes('skipped'), run.states.join());
      rt.escort!.line.mode = 'released'; tick(60, () => run.finished);
      assert.ok(run.finished && run.states.every(x => x === 'done'), run.states.join());
    });
  });
  test('the tug tips: working at speed, and heeling toward the deck edge with the line fast', () => {
    assert.ok(RULES['tugs-too-fast'](ctx({ u: 5 * KN, tugs: tugs(-1, { order: 0.5 }) })));
    assert.ok(!RULES['tugs-too-fast'](ctx({ u: 5 * KN })), 'no order given');
    assert.ok(!RULES['tugs-too-fast'](ctx({ u: 2 * KN, tugs: tugs(-1, { order: 0.5 }) })));
    const edge = 0.3, tow = { T: 3e5, mbl: 1e6, released: false, parted: false, dev: 0 };
    assert.ok(RULES['girting-risk'](ctx({ heel: { phi: 0.2, edge }, tow })));
    assert.ok(RULES['girting-risk'](ctx({ heel: { phi: -0.2, edge }, tow })), 'either way');
    assert.ok(!RULES['girting-risk'](ctx({ heel: { phi: 0.1, edge }, tow })), 'not far enough over');
    assert.ok(!RULES['girting-risk'](ctx({ heel: { phi: 0.2, edge }, tow: { ...tow, released: true } })), 'the line is already away');
    assert.ok(!RULES['girting-risk'](ctx({ heel: null, tow: null })));
  });
  test('the tug exercises\' metrics read the heel, the line, the release and the swing', () => {
    const tow = (T: number, over = {}) => ({ T, mbl: 1e6, released: false, parted: false, dev: 0, ...over });
    const c = (heel: number, t: ReturnType<typeof tow>) => ctx({ heel: { phi: heel, edge: 0.3 }, tow: t });
    const run = (id: string, cs: Ctx[]) => { const a = METRICS[id](cs[0]); for (const x of cs) a.update(x, { contactLog: [] } as unknown as Runtime, 1); return a.row(cs[0]).you; };
    assert.equal(run('heel', [c(0.05, tow(1e5)), c(-0.15, tow(2e5)), c(0.1, tow(1e5))]), '9° (deck edge at 17°)');
    assert.equal(run('tension', [c(0, tow(1e5)), c(0, tow(4e5))]), `${(4e5 / 9.81e3).toFixed(0)} t (40 % of its breaking load)`);
    assert.equal(run('released', [c(0, tow(1e5)), c(0, tow(0, { released: true }))]), 'yes');
    assert.equal(run('released', [c(0, tow(1e5))]), 'no');
    assert.equal(run('swing', [c(0, tow(1e5, { dev: 0.1 })), c(0, tow(1e5, { dev: -0.2 }))]), '11° off her course');
    assert.equal(run('tugspeed', [ctx({ u: 3 * KN, tugs: tugs(-1, { F: 5e4 }) }), ctx({ u: 1 * KN, tugs: tugs(-1, { F: 5e4 }) }), ctx({ u: 5 * KN, tugs: tugs(-1) })]), '3.0 kn');
  });
  test('the tug checks read the tugs and the line', () => {
    const m = (flags: { tugsWorked?: boolean } = {}) => ({ rpm0: 0, flags });
    assert.ok(CHECKS['slow-for-tugs'](ctx({ u: 2 * KN }), m()) && !CHECKS['slow-for-tugs'](ctx({ u: 5 * KN }), m()));
    assert.ok(CHECKS['tugs-ordered'](ctx({ tugs: tugs(-1, { order: 0.5 }) }), m()) && !CHECKS['tugs-ordered'](ctx({ tugs: [{ ...tugs(-1)[0], order: 0.5 }, tugs(-1)[1]] }), m()) && !CHECKS['tugs-ordered'](ctx({ tugs: [] }), m()));
    assert.ok(!CHECKS['tugs-stopped'](ctx(), m()), 'tugs that never worked are not eased');
    assert.ok(CHECKS['tugs-stopped'](ctx(), m({ tugsWorked: true })) && !CHECKS['tugs-stopped'](ctx({ tugs: tugs(-1, { order: 0.25 }) }), m({ tugsWorked: true })));
    const tow = { T: 3e5, mbl: 1e6, released: false, parted: false, dev: 0 };
    assert.ok(CHECKS['girting-risk'](ctx({ heel: { phi: 0.2, edge: 0.3 }, tow }), m()) && !CHECKS['girting-risk'](ctx({ heel: { phi: 0.05, edge: 0.3 }, tow }), m()));
    assert.ok(CHECKS['line-released'](ctx({ tow: { ...tow, released: true } }), m()) && CHECKS['line-released'](ctx({ tow: { ...tow, parted: true } }), m()) && !CHECKS['line-released'](ctx({ tow }), m()));
    assert.ok(CHECKS.upright(ctx({ heel: { phi: 0.02, edge: 0.3 }, tow: { ...tow, released: true } }), m()));
    assert.ok(!CHECKS.upright(ctx({ heel: { phi: 0.02, edge: 0.3 }, tow }), m()), 'upright with the line still fast is not the end of the drill');
    assert.ok(!CHECKS.upright(ctx({ heel: { phi: 0.2, edge: 0.3 }, tow: { ...tow, released: true } }), m()));
  });
  test('a timed exercise runs for its time and ends without calling it a time-out', () => {
    const ex = CONTENT.exercises.find(e => e.id === 'ex-tug-escort')!;
    const run = new ExRun({ ...ex, limit: 20 }, ctx({ t: 0 }));
    for (let t = 0; t < 40; t += 0.5) run.update(ctx({ t }), { contactLog: [] } as unknown as Runtime);
    assert.ok(run.finished && !run.timedOut);
  });
}

console.log('specialised cards: what the notes on the model say');
{
  const kv = SHIPS.kvlcc2, hsc = SHIPS['hsc-cat'], psv = SHIPS.psv;
  const ctxFor = (spec: ShipSpec, over: Partial<Ctx> = {}): Ctx => ({
    t: 0, spec, fam: familyOf(spec), lever: 'twin', sog: 0, psi: 0, pos: { n: 0, e: 0 }, u: 0, v: 0, r: 0, bow: 0, stern: 0, wind: 0, ukc: Infinity,
    units: spec.pods.map(() => ({ alpha: 0, rpm: 0, cmdAlpha: 0, cmdRpm: 0 })), revBlocked: [], powerLimited: false, engine: [], dp: null, heel: null, tow: null, tugs: [], berth: null, quay: [], ...over,
  });
  const memo = (flags: Record<string, boolean> = {}) => ({ rpm0: 0, flags });
  const noContact = { contactLog: [] } as unknown as Runtime;
  const mean = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length;

  test('tokens: the engine, jet and thruster figures are the model\'s own', () => {
    assert.equal(fill('{brakeN}', kv), String(Math.round(AIR_BRAKE_N * 100)));
    assert.equal(fill('{camshaft}', kv), String(CAMSHAFT_T));
    assert.equal(fill('{nozzle}', hsc), '30');
    assert.equal(fill('{thrKn}', kv), '4');
    assert.equal(fill('{thrLeft}', kv), String(Math.round(thrusterEff(4 * KN) * 100)));
    for (const t of ['brakeN', 'camshaft', 'nozzle', 'thrKn', 'thrLeft']) assert.ok(isToken(t), t);
  });

  const jetOut = { X: 0, Y: 0, N: 0, T: 0, Vj: 0, mdot: 0 };
  const jetX = (bucket: number, rpm = 0.8) => jetForce(hsc.pods[0], { alpha: 0, rpm, bucket }, 0, 0, 0, 0, 0, jetOut).X;
  test('jet-controls: the bucket runs from ahead through zero thrust to astern, and astern is the bucket, not the impeller turning the other way', () => {
    const ahead = jetX(1), zero = jetX(0), astern = jetX(-1);
    assert.ok(ahead > 0 && astern < 0 && Math.abs(zero) < 1e-6 * ahead, `${ahead} ${zero} ${astern}`);
    const cmd = { pods: hsc.pods.map(() => ({ alpha: 0, rpm: 0 })), bt: 0 } as Command;
    engines(hsc, cmd, fullAstern(hsc));
    assert.ok(cmd.pods.every(c => c.rpm > 0 && c.bucket === -1));
  });
  test('jet-controls: steering and ahead-astern are separate: the nozzle gives side force at every bucket position', () => {
    for (const bucket of [1, 0, -1]) {
      const y = jetForce(hsc.pods[0], { alpha: 20 * DEG, rpm: 0.8, bucket }, 0, 0, 0, 0, 0, jetOut).Y;
      assert.ok(Math.abs(y) > 0.2 * Math.abs(jetX(1)), `bucket ${bucket}: side force ${y}`);
    }
  });
  test('jet-astern: for the same power the full-astern bucket gives about six-tenths of the ahead thrust', () => {
    const ratio = -jetX(-1) / jetX(1);
    assert.ok(ratio > 0.55 && ratio < 0.68, `astern/ahead ${ratio.toFixed(3)}`);
  });
  test('jet-sideways: the fast ferry\'s joystick walks her sideways, with the bow thruster and the port and starboard jets run one ahead, one astern', () => {
    withShip(hsc, () => {
      const st = makeState(hsc, 0, 0, 0, 0), cmd = { pods: hsc.pods.map(() => ({ alpha: 0, rpm: 0, bucket: 1 })), bt: 0 } as Command;
      const rt = new Runtime(hsc, st, cmd, calm, OPEN);
      for (let t = 0; t < 30; t += DT) { jetJoystick(hsc, cmd, 0, 1, 0); rt.step(DT); }
      assert.ok(st.v > 0.5, `sway ${st.v.toFixed(2)} m/s`);
      assert.ok(Math.abs(st.u) < 0.3 && Math.abs(st.psi) < 10 * DEG, `u ${st.u.toFixed(2)} m/s, heading ${(st.psi / DEG).toFixed(1)}°`);
      assert.ok(cmd.bt > 0.9, `bow thruster ${cmd.bt}`);
      const side = (sgn: number) => mean(hsc.pods.map((p, i) => (Math.sign(p.y) === sgn ? cmd.pods[i].bucket! : NaN)).filter(Number.isFinite));
      assert.ok(Math.sign(side(-1)) !== Math.sign(side(1)), `port ${side(-1)}, starboard ${side(1)}`);
    });
  });

  test('ts-reverse: a stop or astern order cuts the fuel at once, with no load programme', () => {
    withShip(kv, () => {
      const st = makeState(kv, 0, 0, 0, 0.97 * kv.vmaxKn);
      primeRunning(kv, st, 1);
      const cmd = { pods: kv.pods.map(() => ({ alpha: 0, rpm: 1 })), bt: 0 };
      const rt = new Runtime(kv, st, cmd, calm, OPEN);
      for (let t = 0; t < 5; t += DT) rt.step(DT);
      assert.equal(st.pods[0].eng!.mode, 'run');
      engines(kv, cmd, 0);
      for (let t = 0; t < 1; t += DT) rt.step(DT);
      assert.equal(st.pods[0].eng!.mode, 'stop');
      assert.equal(st.pods[0].eng!.q, 0);
      assert.ok(st.pods[0].rpm > 0.5, 'the shaft should still be turning');
    });
  });
  test('ts-reverse: the camshaft change runs during the wait: at sea speed the shaft is the long part, at low speed the camshaft is', () => {
    const fast = scriptedCrashAstern(kv), slow = scriptedCrashAstern(kv, 600, 0.1);
    assert.ok(fast.startAt > CAMSHAFT_T + 2 && !fast.msgs.includes('REVERSING · CAMSHAFT'), `${fast.startAt} ${fast.msgs}`);
    assert.ok(slow.msgs.includes('REVERSING · CAMSHAFT') && Math.abs(slow.startAt - CAMSHAFT_T) < 1.5, `${slow.startAt} ${slow.msgs}`);
  });

  test('the tip and the drill checks read the engine room and the buckets', () => {
    assert.ok(RULES['astern-waiting'](ctxFor(kv, { engine: ['WAITING · SHAFT TOO FAST'] })) && !RULES['astern-waiting'](ctxFor(kv, { engine: ['STOP'] })) && !RULES['astern-waiting'](ctxFor(kv)));
    const ord = (cmdRpm: number, rpm = 0.9) => ctxFor(kv, { units: [{ alpha: 0, rpm, cmdAlpha: 0, cmdRpm }] });
    assert.ok(CHECKS['telegraph-astern'](ord(-0.8), memo()) && !CHECKS['telegraph-astern'](ord(0.8), memo()) && !CHECKS['telegraph-astern'](ord(0), memo()));
    assert.ok(CHECKS['astern-started'](ord(-0.8, -0.1), memo()) && !CHECKS['astern-started'](ord(-0.8), memo()));
    const r = new Runner(CONTENT.procedures.find(p => p.id === 'ts-crash-astern')!, ctxFor(kv));
    assert.ok(!CHECKS['engine-waiting'](ctxFor(kv), r.memo));
    r.step(ctxFor(kv, { engine: ['WAITING · SHAFT TOO FAST'] }), 0.1);
    assert.ok(r.memo.flags.waited && CHECKS['engine-waiting'](ctxFor(kv), r.memo), 'the wait is remembered');
    const jet = (bucket: number, rpm: number) => ctxFor(hsc, { units: hsc.pods.map(() => ({ alpha: 0, rpm, cmdAlpha: 0, cmdRpm: rpm, bucket, cmdBucket: bucket })) });
    assert.ok(CHECKS['buckets-down'](jet(-1, 0.3), memo()) && !CHECKS['buckets-down'](jet(1, 0.3), memo()));
    assert.ok(CHECKS['astern-throttle'](jet(-1, 0.8), memo()) && !CHECKS['astern-throttle'](jet(-1, 0.3), memo()));
    assert.ok(CHECKS['bucket-zero'](jet(0.1, 0.3), memo()) && !CHECKS['bucket-zero'](jet(1, 0.3), memo()) && !CHECKS['bucket-zero'](jet(-1, 0.8), memo()));
  });

  test('the crash-astern drill ticks through, step by step, on a real run of the VLCC', () => {
    withShip(kv, () => {
      const st = makeState(kv, 0, 0, 0, 0.97 * kv.vmaxKn);
      primeRunning(kv, st, 1);
      const cmd = { pods: kv.pods.map(() => ({ alpha: 0, rpm: 1 })), bt: 0 };
      const rt = new Runtime(kv, st, cmd, calm, OPEN);
      for (let t = 0; t < 5; t += DT) rt.step(DT);
      const run = new Runner(CONTENT.procedures.find(p => p.id === 'ts-crash-astern')!, guideCtx(rt));
      const tick = (secs: number, until?: () => boolean) => { for (let t = 0; t < secs && !(until && until()); t += DT) { rt.step(DT); run.step(guideCtx(rt), DT); } };
      tick(2); assert.equal(run.index, 0, 'a drill waits to be read');
      run.ack(); tick(1); assert.equal(run.index, 1);
      engines(kv, cmd, fullAstern(kv)); tick(5);
      assert.deepEqual(run.states.slice(0, 4), ['done', 'done', 'done', 'now'], `astern ordered, the engine room waiting for the shaft: ${run.states.join()}`);
      tick(60, () => run.index > 3); assert.equal(run.index, 4, 'the engine started astern');
      tick(1500, () => run.index > 4); assert.equal(run.index, 5, 'the way is off her');
      engines(kv, cmd, 0); tick(2);
      assert.ok(run.finished && run.states.every(x => x === 'done'), run.states.join());
      assert.ok(run.path / kv.L > 5 && run.path / kv.L < 15, `track reach ${(run.path / kv.L).toFixed(1)} L`);
    });
  });
  test('the waterjet stop drill ticks through, step by step, on a real run of the fast ferry', () => {
    withShip(hsc, () => {
      const st = makeState(hsc, 0, 0, 0, 0.7 * hsc.vmaxKn);
      primeRunning(hsc, st, 0.7);
      const cmd = { pods: hsc.pods.map(() => ({ alpha: 0, rpm: 0, bucket: 1 })), bt: 0 };
      engines(hsc, cmd, 0.7);
      const rt = new Runtime(hsc, st, cmd, calm, OPEN);
      for (let t = 0; t < 5; t += DT) rt.step(DT);
      const run = new Runner(CONTENT.procedures.find(p => p.id === 'jet-stop')!, guideCtx(rt));
      const tick = (secs: number, until?: () => boolean) => { for (let t = 0; t < secs && !(until && until()); t += DT) { rt.step(DT); run.step(guideCtx(rt), DT); } };
      run.ack(); tick(1); assert.equal(run.index, 1);
      cmd.pods.forEach(c => { c.rpm = 0.3; }); tick(1); assert.equal(run.index, 1, 'throttle back, buckets still up');
      cmd.pods.forEach(c => { c.bucket = -1; }); tick(1); assert.equal(run.index, 2, 'buckets down');
      cmd.pods.forEach(c => { c.rpm = 0.8; }); tick(1); assert.equal(run.index, 3, 'throttle up');
      run.ack(); tick(1); assert.equal(run.index, 4);
      tick(60, () => run.index > 4); assert.equal(run.index, 5, 'the way is off her');
      cmd.pods.forEach(c => { c.bucket = 0; c.rpm = 0.3; }); tick(2);
      assert.ok(run.finished && run.states.every(x => x === 'done'), run.states.join());
    });
  });

  test('dp-classes: the supply vessel and the anchor-handling tug are DP2, and the instructor can trip a unit, black out the board or drift both DGNSS together', () => {
    assert.ok(/DP2/.test(SHIPS.psv.name) && /DP2/.test(SHIPS.ahts.name));
    const d = new DpSystem(psv, [1e7, 1e7, 1e9]);
    d.fail(0);
    assert.deepEqual(d.avail().slice(0, 2), [false, true]);
    d.clearFaults(); d.blackout();
    assert.ok(d.avail().every(a => !a));
    d.clearFaults(); d.drift('common');
    assert.deepEqual(d.refs.filter(r => r.drift[0] !== 0 || r.drift[1] !== 0).map(r => r.name), ['DGNSS 1', 'DGNSS 2']);
  });
  test('dp-classes: the capability plot never holds more with a unit lost, and holds less in some direction', () => {
    const c = capability(psv);
    assert.ok(c.worst.every((w, i) => w <= c.intact[i] + 1e-9) && c.worst.some((w, i) => w < c.intact[i] - 1), 'worst is not below intact');
  });
  test('dp-classes: the consequence line names a unit whose loss the present demand would not survive, and is empty when she is idle in calm', () => {
    withShip(psv, () => {
      /** The unit the console named at the end of 90 s in auto position (the line comes and goes with the demand: the last name it showed). */
      const held = (windKn: number, from: number) => {
        const env: Env = { ...calm, windSpeed: windKn * KN, windFrom: from * DEG };
        const st = makeState(psv, 0, 0, 0, 0), rt = new Runtime(psv, st, { pods: psv.pods.map(() => ({ alpha: 0, rpm: 0 })), bt: 0 }, env, OPEN);
        rt.dps!.setMode('auto', rt.sensors.out.est);
        let named = '';
        for (let t = 0; t < 90; t += DT) { rt.step(DT); if (rt.dps!.consequence) named = rt.dps!.consequence; }
        return named;
      };
      assert.equal(held(0, 0), '');
      assert.ok(actuators(psv).map(a => a.label).includes(held(30, 90)), 'a gale on the beam should leave one unit she could not do without');
    });
  });
  test('ex-dp-hold: the scenario trips the port azimuth and then drifts both DGNSS together; the console stays near the set point while the truth walks off', () => {
    const sc = SCENARIOS.find(x => x.id === 'dp')!;
    assert.deepEqual(sc.dpScript!.map(x => x.kind), ['unit', 'common']);
    assert.ok(sc.dpScript![0].t < sc.dpScript![1].t);
    assert.equal(actuators(psv)[sc.dpScript![0].unit ?? 0].label, 'PORT AZ');
    withShip(psv, () => {
      const cu = sc.currentKn * KN, cs = sc.currentSet * DEG;
      const env: Env = { windSpeed: sc.windKn * KN, windFrom: sc.windFrom * DEG, gusts: false, current: () => [cu * Math.cos(cs), cu * Math.sin(cs)], depth: sc.depth };
      const st = makeState(psv, sc.start.n, sc.start.e, sc.start.psi, 0);
      const rt = new Runtime(psv, st, { pods: psv.pods.map(() => ({ alpha: 0, rpm: 0 })), bt: 0 }, env, OPEN);
      rt.dpScript = sc.dpScript!.map(x => ({ ...x }));
      rt.dps!.setMode('auto', rt.sensors.out.est);
      const err = METRICS.dperr(guideCtx(rt)), util = METRICS.dputil(guideCtx(rt)), lim = METRICS.dplimit(guideCtx(rt));
      for (let t = 0, k = 0; t < 600; t += DT, k++) {
        rt.step(DT);
        if (k % 10 === 0) for (const m of [err, util, lim]) m.update(guideCtx(rt), rt, 10 * DT);
      }
      const [truth, shown] = err.row(guideCtx(rt)).you.match(/[\d.]+/g)!.map(Number);
      assert.ok(shown < 12 && truth > 40, `${err.row(guideCtx(rt)).you}`);
      assert.equal(lim.row(guideCtx(rt)).you, '0 s', 'a class 2 ship should keep up with one unit lost');
      assert.ok(/^\d+ %$/.test(util.row(guideCtx(rt)).you));
    });
  });

  test('thruster-speed: the model leaves a tunnel thruster about half its push by 4 kn, and about half at any higher speed', () => {
    assert.equal(thrusterEff(0), 1);
    const e4 = thrusterEff(4 * KN);
    assert.ok(e4 > 0.5 && e4 < 0.56, `${e4}`);
    for (const k of [6, 10, 20]) assert.ok(Math.abs(thrusterEff(k * KN) - 0.5) < 0.01, `${k} kn`);
  });
  test('thruster-speed and thruster-stern: the bow and the stern thruster have the same fall-off, and the allocators plan with it', () => {
    const ro = SHIPS.ropax;
    withShip(ro, () => {
      const st = makeState(ro, 0, 0, 0, 8);
      st.bt = 1; st.sbt = 1;
      primeRunning(ro, st, 0.5);
      const rt = new Runtime(ro, st, { pods: ro.pods.map(() => ({ alpha: 0, rpm: 0, pitch: 0.5 })), bt: 1, sbt: 1 }, calm, OPEN);
      for (let t = 0; t < 3; t += DT) rt.step(DT);
      assert.ok(Math.abs(rt.bd.bt.eff - thrusterEff(st.u)) < 1e-3 && Math.abs(rt.bd.sbt!.eff - rt.bd.bt.eff) < 1e-9, `bow ${rt.bd.bt.eff}, stern ${rt.bd.sbt?.eff}`);
    });
    assert.ok((read('../src/physics/runtime.ts').match(/thrusterEff\(/g) ?? []).length >= 2, 'the joystick and DP allocators should plan with thrusterEff');
  });
  test('the thruster cards speak to exactly the ships that have those thrusters', () => {
    const bow = CONTENT.cards.find(c => c.id === 'thruster-speed')!, stern = CONTENT.cards.find(c => c.id === 'thruster-stern')!;
    for (const sp of Object.values(SHIPS)) {
      assert.equal(appliesTo(bow, sp), sp.bowThruster.Tmax > 0, `${sp.id} bow`);
      assert.equal(appliesTo(stern, sp), !!sp.sternThruster, `${sp.id} stern`);
    }
  });

  test('imo-trials: the Sea trials table grades a ship over 100 m against the limits the card quotes, and only shows them for a smaller ship', () => {
    const rows = (id: string) => Object.fromEntries(runTrials(SHIPS[id]).rows.map(r => [r.key, r]));
    const big = rows('kvlcc2');
    assert.deepEqual(['tact', 'adv', 'init', 'zz20', 'crash'].map(k => big[k].limit), ['< 5.0 L', '< 4.5 L', '< 2.5 L', '< 25.0°', '< 15 L']);
    assert.ok(big.zz.limit && /^< \d+\.\d°$/.test(big.zz.limit), 'the 10/10 limit depends on length over speed');
    const small = rows('paspaley-pearl');
    for (const k of ['tact', 'adv', 'crash']) assert.ok(small[k].limit === undefined && small[k].pass === undefined && /applies from 100 m/.test(small[k].note ?? ''), k);
    const quoted = CONTENT.cards.find(c => c.id === 'imo-trials')!.real.map(c => c.text).join(' ');
    for (const part of [/tactical diameter under 5 ship lengths/, /advance under 4\.5/, /under 25°/, /under 2\.5 ship lengths/, /under 15 ship lengths/]) assert.ok(part.test(quoted), String(part));
    assert.ok(buildPoster(SHIPS.kvlcc2), 'the poster data is computed from the model');
  });

  test('the specialised exercises\' metrics read the engine room, the DP console and the true position', () => {
    const a = METRICS.astern(ctxFor(kv));
    for (let t = 0; t < 30; t++) a.update(ctxFor(kv, { units: [{ alpha: 0, rpm: t < 12 ? 0.5 : -0.1, cmdAlpha: 0, cmdRpm: -0.8 }] }), noContact, 1);
    assert.equal(a.row(ctxFor(kv)).you, '13 s', 'the 13th second is the first with the shaft turning astern');
    assert.equal(METRICS.astern(ctxFor(kv)).row(ctxFor(kv)).you, 'not yet');
    const tn = METRICS.turned(ctxFor(kv, { psi: 0 }));
    tn.update(ctxFor(kv, { psi: -105 * DEG }), noContact, 1);
    assert.equal(tn.row(ctxFor(kv)).you, '−105°');
    const rr = METRICS.reachimo(ctxFor(kv));
    rr.update(ctxFor(kv, { sog: 5 }), noContact, 10);
    assert.equal(rr.row(ctxFor(kv)).you, `${(50 / kv.L).toFixed(1)} L`);

    const dpc = (mode: string, errM: number, u: number, limit = false) => ctxFor(psv, { dp: { mode, err: errM, util: u, limit, consequence: '' } });
    const rtAt = (n: number, e: number) => ({ dps: { sp: { n: 0, e: 0, psi: 0 } }, state: { n, e } }) as unknown as Runtime;
    const err = METRICS.dperr(dpc('auto', 0, 0)), util = METRICS.dputil(dpc('auto', 0, 0)), lim = METRICS.dplimit(dpc('auto', 0, 0));
    for (const m of [err, util, lim]) m.update(dpc('joy', 40, 0.9, true), rtAt(30, 40), 1);               // not holding yet: ignored
    assert.equal(err.row(dpc('auto', 0, 0)).you, '0.0 m in truth, 0.0 m on the console');
    for (const m of [err, util, lim]) { m.update(dpc('auto', 1.5, 0.2), rtAt(0, 3), 1); m.update(dpc('auto', 2.5, 0.6, true), rtAt(3, 4), 1); }
    assert.equal(err.row(dpc('auto', 0, 0)).you, '5.0 m in truth, 2.5 m on the console');
    assert.equal(util.row(dpc('auto', 0, 0)).you, '60 %');
    assert.equal(lim.row(dpc('auto', 0, 0)).you, '1 s');
  });
}

console.log('shipped content');
{
  test('everything the guide ships passes the content rules', () => {
    const p = lintContent(CONTENT, realEnv());
    assert.deepEqual(p, [], p.join('\n'));
  });
  test('every propulsion family has cards, every ship sees at least one, and every track has a drill and an exercise', () => {
    for (const f of FAMS) assert.ok(CONTENT.cards.filter(c => c.fam.includes(f)).length >= 2, `family ${f}`);
    for (const sp of Object.values(SHIPS)) assert.ok(CONTENT.cards.some(c => appliesTo(c, sp)), `${sp.id} has no card`);
    for (const t of ['azipod', 'tugs', 'special']) {
      assert.ok(CONTENT.procedures.some(p => p.track === t), `${t}: no drill`);
      assert.ok(CONTENT.exercises.some(e => e.track === t), `${t}: no exercise`);
    }
  });
  test('docs/TRAINING-CLAIMS.md is the register of what ships', () => {
    assert.equal(read('../docs/TRAINING-CLAIMS.md'), renderClaims(CONTENT, SOURCES), 'out of date: run npm run guide:dossier');
  });
}

console.log(`\n${pass} passed${process.exitCode ? ', some failed' : ''}`);
