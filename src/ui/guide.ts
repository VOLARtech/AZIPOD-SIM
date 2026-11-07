// The training guide's screen: the COACH panel, the menu section and the Reference list. The content and
// the coach are in src/guide; this file only shows them, and does nothing at all while the guide is off.
import { S } from './state';
import { SHIP } from '../physics/ship';
import { toast } from '../app';
import { joyLimits } from '../physics/allocation';
import type { JoyInput } from '../physics/allocation';
import { thrusterEff } from '../physics/sim';
import { KN } from '../physics/consts';
import { CONTENT } from '../guide/content';
import { Coach } from '../guide/coach';
import { guideCtx } from '../guide/context';
import type { Ctx } from '../guide/context';
import { ExRun } from '../guide/exercises';
import { appliesTo, familyOf } from '../guide/families';
import { Runner } from '../guide/procedures';
import { RULES } from '../guide/rules';
import { SRC } from '../guide/sources';
import { fill } from '../guide/tokens';
import { dockingStick, ghostFromStick } from '../guide/vectors';
import type { Card, Claim, Conf, Exercise, Fam, Level, Procedure, Row } from '../guide/types';

const $ = (id: string) => document.getElementById(id)!;
const esc = (s: string) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

const FAM_NAME: Record<Fam, string> = {
  pod: 'Azipod ships', asd: 'ASD tugs', rotor: 'Rotor tugs', vsp: 'Voith tractor tugs',
  twostroke: 'Two-stroke telegraph ships', cpp: 'Pitch-lever and twin-screw ships', jet: 'Waterjet ships', dp: 'DP vessels',
};
const CONF: Record<Conf, string> = { measured: 'MEASURED', published: 'PUBLISHED', rule: 'RULE OF THUMB', derived: 'THIS MODEL' };
const CONF_TIP: Record<Conf, string> = {
  measured: 'Published trial or model-test data', published: 'A standard, manual, port rule, report or guidance',
  rule: 'A cited rule of thumb', derived: 'What this simulator\'s own model does',
};

const coach = new Coach(CONTENT.cards, RULES);

type View = 'none' | 'tip' | 'idle' | 'intro' | 'proc' | 'ex';
type Session = { kind: 'proc'; runner: Runner; proc: Procedure } | { kind: 'ex'; run: ExRun; ex: Exercise };
let view: View = 'none';
let session: Session | null = null;                                   // a drill or an exercise under way
let lastCtx: Ctx | null = null;
let shown = '';                                                       // what the panel shows now, so it is only redrawn when it changes
let pinned = false;           // the player opened or expanded the panel: it stays until they close it
let deferred = false;         // a tip is waiting for another panel to close
let lastT = NaN;
let stickS: JoyInput = { x: 0, y: 0, r: 0 }, haveStick = false;       // the docking stick, smoothed so the outlines don't jitter
let needIndep = false;                                                // a suggestion is waiting for INDEP mode
let hooks: { placePanels(): void; closeOthers(): void; openMenu(): void; startExercise(ex: Exercise): Promise<void> } =
  { placePanels() {}, closeOthers() {}, openMenu() {}, startExercise: async () => {} };

// ---------------------------------------------------------------- text
function claimHtml(c: Claim) {
  const src = c.src.map(id => {
    const s = SRC[id];
    return s?.url ? `<a href="${esc(s.url)}" target="_blank" rel="noopener" title="${esc(s.cite)}">${esc(s.short)}</a>` : `<span title="${esc(s?.cite ?? id)}">${esc(s?.short ?? id)}</span>`;
  }).join(', ');
  return `<li><span class="gc ${c.conf}" title="${CONF_TIP[c.conf]}">${CONF[c.conf]}</span>${esc(fill(c.text, SHIP))}${src ? ` <span class="gsrc">${src}</span>` : ''}</li>`;
}
const claimsHtml = (cs: Claim[]) => (cs.length ? `<h4>Real world</h4><ul>${cs.map(claimHtml).join('')}</ul>` : '');
/** The part of a card the Explain level adds: why, what the real world says, and how the model does it. */
function explainHtml(k: Card | Procedure) {
  const parts: string[] = [];
  if ('why' in k && k.why) parts.push(`<p>${esc(fill(k.why, SHIP))}</p>`);
  parts.push(claimsHtml(k.real));
  if (k.sim) parts.push(`<h4>In SHIPSHAPE</h4><p>${esc(fill(k.sim, SHIP))}</p>`);
  return `<div class="coach-more">${parts.join('')}</div>`;
}
const draftChip = (k: { review: string }) => (k.review === 'draft' ? '<span class="gc draft" title="Not yet reviewed by the captain">DRAFT</span>' : '');
function cardHtml(k: Card, level: Level, title = true) {
  return `${title ? `<p class="coach-title">${esc(k.title)}${level === 'explain' ? draftChip(k) : ''}</p>` : ''}<p class="coach-brief">${esc(fill(k.brief, SHIP))}</p>${level === 'explain' ? explainHtml(k) : ''}`;
}
const rowsHtml = (rows: Row[]) => `<div class="coach-rows">${rows.map(r =>
  `<div class="coach-row2"><span class="k">${esc(r.label)}</span><b>${esc(r.you)}</b>${r.ref ? `<span class="ref">${esc(r.ref)}</span>` : ''}</div>`).join('')}</div>`;

// ---------------------------------------------------------------- the panel
const otherPanelOpen = () => ['p-lines', 'p-tugs', 'p-dmg', 'p-lock'].some(id => !$(id).hidden);
const panelOpen = () => !$('p-coach').hidden;
const btn = (a: string, label: string, off = false) => `<button class="cb" data-a="${a}"${off ? ' disabled' : ''}>${label}</button>`;

function idleHtml() {
  const g = S.guide, fam = familyOf(SHIP), sog = lastCtx?.sog ?? 0;
  const n = CONTENT.cards.filter(k => appliesTo(k, SHIP)).length;
  let h = `<p class="coach-title">Nothing to suggest right now</p><p class="coach-brief">${g.tips ? 'A tip appears here when the situation calls for one.' : 'Tips are off.'}${n ? ` The reference has ${n} card${n > 1 ? 's' : ''} for ${esc(FAM_NAME[fam].toLowerCase())}.` : ''}${needIndep ? ' Pod suggestions show in INDEP mode: tap LINKED to change.' : ''}</p>`;
  if (!g.steps) return h + '<p class="hint">Steps are off: turn them on in the menu to start drills and exercises.</p>';
  const procs = CONTENT.procedures.filter(p => appliesTo(p, SHIP)), exs = CONTENT.exercises.filter(e => e.fam.includes(fam));
  if (procs.length) h += `<h4 class="coach-h">Drills</h4>` + procs.map(p => {
    const slow = !!p.minKn && sog < p.minKn * KN;
    return `<div class="coach-list"><span>${esc(p.title)}${slow ? `<small>needs ${p.minKn} kn or more</small>` : ''}</span>${btn('p:' + p.id, 'START', slow)}</div>`;
  }).join('');
  if (exs.length) h += `<h4 class="coach-h">Exercises</h4>` + exs.map(e => `<div class="coach-list"><span>${esc(e.title)}</span>${btn('e:' + e.id, 'START')}</div>`).join('');
  return h;
}

function procView(s: Extract<Session, { kind: 'proc' }>, level: Level) {
  const r = s.runner, p = s.proc, n = p.steps.length, i = r.index;
  if (r.finished) return { head: 'COACH · DRILL', body: `<p class="coach-title">${esc(p.title)}: done</p>${rowsHtml(r.rows(SHIP.L))}`, btns: btn('again', 'AGAIN') + btn('close', 'CLOSE') };
  const list = level === 'explain'
    ? `<ol class="coach-steps">${p.steps.map((st, k) => `<li class="ds-${r.states[k]}">${esc(fill(st.text, SHIP))}</li>`).join('')}</ol>${explainHtml(p)}` : '';
  return {
    head: `COACH · STEP ${i + 1} OF ${n}`,
    body: `<p class="coach-title">${esc(p.title)}${level === 'explain' ? draftChip(p) : ''}</p><p class="coach-brief">${esc(fill(r.current!.text, SHIP))}</p>${list}`,
    btns: btn('next', r.current!.check === 'ack' ? 'NEXT' : 'SKIP') + btn('stop', 'STOP') + btn('more', level === 'explain' ? 'LESS' : 'MORE'),
  };
}

function exView(s: Extract<Session, { kind: 'ex' }>, level: Level) {
  const { run, ex } = s, c = lastCtx;
  const rows = c ? run.rows(c) : [];
  if (run.finished) {
    return {
      head: 'COACH · DEBRIEF',
      body: `<p class="coach-title">${esc(ex.title)}${run.timedOut ? ': time ran out' : ''}</p>${rowsHtml(rows)}<p class="hint">No score: the references are published figures and this model's own limits. Judge it against them.</p>${level === 'explain' ? claimsHtml(ex.real) : ''}`,
      btns: btn('again', 'AGAIN') + btn('close', 'CLOSE') + btn('more', level === 'explain' ? 'LESS' : 'MORE'),
    };
  }
  const mm = (t: number) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
  return {
    head: 'COACH · EXERCISE',
    body: `<p class="coach-title">${esc(ex.title)}${level === 'explain' ? draftChip(ex) : ''}</p><ul class="coach-obj">${ex.objectives.map(o => `<li>${esc(fill(o, SHIP))}</li>`).join('')}</ul>`
      + `<p class="hint">${run.started ? `Measuring: ${mm(run.elapsed)}` : 'Measuring starts with your first order.'}</p>${run.started ? rowsHtml(rows) : ''}`,
    btns: btn('finish', 'FINISH') + btn('stop', 'STOP'),
  };
}

function render(force = false) {
  const g = S.guide, body = $('coach-body'), btns = $('coach-btns');
  const more = g.level === 'explain' ? 'LESS' : 'MORE';
  let head = 'COACH', html = '', bh = '';
  if (view === 'tip' && coach.current) { head = 'COACH · TIP'; html = cardHtml(coach.current, g.level); bh = btn('more', more) + btn('ok', 'GOT IT'); }
  else if (view === 'intro') {
    html = '<p class="coach-title">Training guide</p><p class="coach-brief">Tips, steps and suggestions built on published sources. Each says whether it is measured data, published guidance or what this simulator\'s model does. There is no single global standard for handling podded or azimuthing propulsion: your ship\'s manual and your company\'s procedures come first.</p>';
    bh = btn('intro', 'GOT IT');
  } else if (view === 'proc' && session?.kind === 'proc') { const v = procView(session, g.level); head = v.head; html = v.body; bh = v.btns; }
  else if (view === 'ex' && session?.kind === 'ex') { const v = exView(session, g.level); head = v.head; html = v.body; bh = v.btns; }
  else { html = idleHtml(); bh = btn('more', more) + btn('ref', 'REFERENCE'); }
  const key = head + '|' + html + '|' + bh;
  if (!force && key === shown) return;
  shown = key;
  $('coach-head').textContent = head;
  body.innerHTML = html; btns.innerHTML = bh;
}
function openPanel() {
  hooks.closeOthers();
  render(true);
  $('p-coach').hidden = false;
  hooks.placePanels();
  $('b-coach').classList.add('on');
}
function closePanel() {
  $('p-coach').hidden = true; pinned = false; deferred = false; shown = '';
  $('b-coach').classList.remove('on');
}
const endSession = () => { session = null; if (view === 'proc' || view === 'ex') view = 'idle'; };

function startProc(id: string) {
  const p = CONTENT.procedures.find(x => x.id === id), rt = S.rt;
  if (!p || !rt) return;
  const c = guideCtx(rt, S.berth.target, S.quay); lastCtx = c;
  session = { kind: 'proc', proc: p, runner: new Runner(p, c) };
  view = 'proc'; pinned = true; coach.dismiss(); openPanel();
}
async function startEx(id: string) {
  const ex = CONTENT.exercises.find(x => x.id === id);
  if (!ex) return;
  await hooks.startExercise(ex);                                      // loads her scenario and ship: this resets the guide
  const rt = S.rt, c = guideCtx(rt, S.berth.target, S.quay); lastCtx = c;
  session = { kind: 'ex', ex, run: new ExRun(ex, c) };
  view = 'ex'; pinned = true; coach.dismiss(); openPanel();
}

function onButton(a: string) {
  const g = S.guide;
  if (a === 'more') { g.level = g.level === 'explain' ? 'brief' : 'explain'; pinned = true; syncMenu(); render(true); hooks.placePanels(); }
  else if (a === 'ok') {
    const k = coach.current;
    if (k) g.seen.add(k.id);
    coach.dismiss(); view = 'none'; closePanel();
  } else if (a === 'intro') { g.seen.add('intro'); view = coach.current ? 'tip' : 'none'; closePanel(); }
  else if (a === 'ref') { hooks.openMenu(); const d = $('sec-guide') as HTMLDetailsElement; d.open = true; d.scrollIntoView({ block: 'start' }); }
  else if (a.startsWith('p:')) startProc(a.slice(2));
  else if (a.startsWith('e:')) void startEx(a.slice(2));
  else if (a === 'next' && session?.kind === 'proc') { if (session.runner.current?.check === 'ack') session.runner.ack(); else session.runner.skip(); render(); }
  else if (a === 'stop') { endSession(); render(true); }
  else if (a === 'close') { endSession(); view = 'none'; closePanel(); }
  else if (a === 'finish' && session?.kind === 'ex') { session.run.finished = true; render(true); }
  else if (a === 'again' && session) { const k = session.kind === 'proc' ? 'p:' + session.proc.id : 'e:' + session.ex.id; endSession(); onButton(k); }
}

// ---------------------------------------------------------------- the menu
function syncMenu() {
  const g = S.guide;
  ($('g-on') as HTMLInputElement).checked = g.on;
  for (const [id, v] of [['g-tips', g.tips], ['g-steps', g.steps], ['g-vec', g.vectors]] as [string, boolean][]) {
    const el = $(id) as HTMLInputElement; el.checked = v; el.disabled = !g.on;
  }
  $('seg-glevel').querySelectorAll('button').forEach(b => { (b as HTMLButtonElement).disabled = !g.on; b.setAttribute('aria-pressed', String(b.dataset.v === g.level)); });
  ($('g-forget') as HTMLButtonElement).disabled = !g.on || g.seen.size === 0;
}

/** Reference: every card, drill and exercise that speaks to the ship in use, open for reading at the Explain level. */
export function renderReference() {
  const el = $('guide-ref');
  if (!S.guide.on) { el.innerHTML = ''; return; }
  const fam = familyOf(SHIP), cards = CONTENT.cards.filter(k => appliesTo(k, SHIP));
  const procs = CONTENT.procedures.filter(p => appliesTo(p, SHIP)), exs = CONTENT.exercises.filter(e => e.fam.includes(fam));
  const drill = (p: Procedure) => `<details><summary>${esc(p.title)} · drill${draftChip(p)}</summary><p class="coach-brief">${esc(fill(p.brief, SHIP))}</p><ol class="coach-steps">${p.steps.map(st => `<li>${esc(fill(st.text, SHIP))}</li>`).join('')}</ol>${explainHtml(p)}<p class="hint">Start it from COACH.</p></details>`;
  const exercise = (e: Exercise) => `<details><summary>${esc(e.title)} · exercise${draftChip(e)}</summary><p class="coach-brief">${esc(fill(e.brief, SHIP))}</p><ul class="coach-obj">${e.objectives.map(o => `<li>${esc(fill(o, SHIP))}</li>`).join('')}</ul>${claimsHtml(e.real)}<p class="hint">Start it from COACH.</p></details>`;
  el.innerHTML = `<h3 class="gref-h">Reference · ${esc(FAM_NAME[fam])} · ${esc(SHIP.name)}</h3>`
    + (cards.length ? cards.map(k => `<details><summary>${esc(k.title)}${draftChip(k)}</summary>${cardHtml(k, 'explain', false)}</details>`).join('')
      : '<p class="note">No reference cards for this ship yet.</p>')
    + procs.map(drill).join('') + exs.map(exercise).join('');
}

/** Show or hide everything the guide adds, to match the settings. */
export function syncGuide() {
  const g = S.guide;
  $('b-coach').hidden = !g.on;
  if (!g.on) { if (panelOpen()) closePanel(); view = 'none'; session = null; coach.dismiss(); S.guide.ghost = null; haveStick = false; needIndep = false; }
  showBtGhost();
  syncMenu();
  renderReference();
}

/** A new scenario or ship: start the coach afresh. */
export function resetGuide() {
  coach.reset(); lastT = NaN; view = 'none'; session = null; lastCtx = null; if (panelOpen()) closePanel();
  renderReference();
}

/** The suggested pod settings for the docking stick, as outlines on the dials, levers and bow-thruster slider. */
function updateGhost(dt: number, c: Ctx) {
  const g = S.guide, rt = S.rt, was = needIndep;
  needIndep = false;
  if (!g.vectors || !rt.canJoy || rt.lever === 'joy') { g.ghost = null; haveStick = false; }
  else {
    const h = rt.model.h, st = rt.state, cur = rt.env.current(st.n, st.e);
    const btEff = thrusterEff(st.u - (Math.cos(st.psi) * cur[0] + Math.sin(st.psi) * cur[1]));
    const stick = dockingStick(c, { surge: h.M[0], sway: h.M[4], yaw: h.M[8] }, joyLimits(rt.spec, btEff));
    if (!stick) { g.ghost = null; haveStick = false; }
    else if (rt.lever !== 'indep') { g.ghost = null; haveStick = false; needIndep = true; }     // the two pods must be free to differ
    else {
      const k = haveStick ? Math.min(1, dt / 4) : 1;
      stickS = { x: stickS.x + (stick.x - stickS.x) * k, y: stickS.y + (stick.y - stickS.y) * k, r: stickS.r + (stick.r - stickS.r) * k };
      haveStick = true;
      g.ghost = ghostFromStick(rt.spec, st, stickS, btEff);
    }
  }
  showBtGhost();
  if (needIndep !== was && view === 'idle' && panelOpen()) render(true);
}
function showBtGhost() {
  const el = $('bt-ghost'), b = S.guide.vectors ? S.guide.ghost?.bt : undefined;
  if (b === undefined) el.hidden = true;
  else { el.hidden = false; el.style.setProperty('--g', String((Math.max(-1, Math.min(1, b)) + 1) / 2)); }
}

/** Every slow tick (about 10 Hz): advance the coach, the drill or the exercise and show or clear what they say. Does nothing while the guide is off. */
export function updateGuide() {
  const g = S.guide;
  if (!g.on || !S.rt) return;
  const rt = S.rt, t = rt.state.t, dt = Number.isFinite(lastT) ? Math.max(0, Math.min(2, t - lastT)) : 0;
  lastT = t;
  const ctx = guideCtx(rt, S.berth.target, S.quay);
  lastCtx = ctx;
  updateGhost(dt, ctx);
  if (session) {
    if (!g.steps) { endSession(); render(true); return; }
    if (session.kind === 'proc') session.runner.step(ctx, dt); else session.run.update(ctx, rt);
    if (panelOpen()) render();
    return;                                                           // no tips over a drill or an exercise
  }
  const before = coach.current?.id ?? null;
  const card = coach.step(ctx, dt, { tips: g.tips, seen: g.seen });
  const now = card?.id ?? null;
  if (now !== before) {
    if (card) { view = 'tip'; if (otherPanelOpen()) deferred = true; else { openPanel(); } }
    else if (view === 'tip') { view = 'none'; deferred = false; if (!pinned) closePanel(); else render(true); }
  } else if (card && view === 'tip' && !panelOpen()) {
    if (otherPanelOpen()) deferred = true;                                          // covered by another panel: wait
    else if (deferred) { deferred = false; openPanel(); }
    else { coach.dismiss(); view = 'none'; }                                         // the player closed it: leave it be
  } else if (view === 'idle' && panelOpen()) render();                                 // the drills' START buttons follow her speed
}

// ---------------------------------------------------------------- start-up
export function initGuide(h: typeof hooks) {
  hooks = h;
  const g = S.guide;
  ($('g-on') as HTMLInputElement).onchange = e => {
    g.on = (e.target as HTMLInputElement).checked;
    syncGuide();
    if (g.on && !g.seen.has('intro')) { view = 'intro'; pinned = true; openPanel(); }
  };
  ($('g-tips') as HTMLInputElement).onchange = e => { g.tips = (e.target as HTMLInputElement).checked; if (!g.tips) { coach.dismiss(); if (view === 'tip') { view = 'none'; closePanel(); } } syncMenu(); };
  ($('g-steps') as HTMLInputElement).onchange = e => { g.steps = (e.target as HTMLInputElement).checked; if (!g.steps && session) { endSession(); render(true); } syncMenu(); };
  ($('g-vec') as HTMLInputElement).onchange = e => { g.vectors = (e.target as HTMLInputElement).checked; if (!g.vectors) { g.ghost = null; haveStick = false; needIndep = false; } showBtGhost(); syncMenu(); };
  $('seg-glevel').querySelectorAll('button').forEach(b => ((b as HTMLButtonElement).onclick = () => { g.level = b.dataset.v as Level; syncMenu(); if (panelOpen()) render(true); }));
  $('g-forget').onclick = () => { g.seen.clear(); coach.reset(); syncMenu(); toast('Every tip can show again.'); };
  $('p-coach').addEventListener('click', e => { const a = (e.target as HTMLElement).closest('button')?.dataset.a; if (a) onButton(a); });      // the buttons in the list and the row below it
  $('b-coach').onclick = () => {
    if (panelOpen()) { if (view === 'tip') { coach.dismiss(); view = 'none'; } closePanel(); return; }
    pinned = true;
    view = session ? (session.kind === 'proc' ? 'proc' : 'ex') : coach.current ? 'tip' : !g.seen.has('intro') ? 'intro' : 'idle';
    openPanel();
  };
  syncGuide();
}
