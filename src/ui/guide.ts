// The training guide's screen: the COACH panel, the menu section and the Reference list. The content and
// the coach are in src/guide; this file only shows them, and does nothing at all while the guide is off.
import { S } from './state';
import { SHIP } from '../physics/ship';
import { toast } from '../app';
import { joyLimits } from '../physics/allocation';
import type { JoyInput } from '../physics/allocation';
import { thrusterEff } from '../physics/sim';
import { CONTENT } from '../guide/content';
import { Coach } from '../guide/coach';
import { guideCtx } from '../guide/context';
import type { Ctx } from '../guide/context';
import { appliesTo, familyOf } from '../guide/families';
import { RULES } from '../guide/rules';
import { SRC } from '../guide/sources';
import { fill } from '../guide/tokens';
import { dockingStick, ghostFromStick } from '../guide/vectors';
import type { Card, Claim, Conf, Fam, Level } from '../guide/types';

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

type View = 'none' | 'tip' | 'idle' | 'intro';
let view: View = 'none';
let pinned = false;           // the player opened or expanded the panel: it stays until they close it
let deferred = false;         // a tip is waiting for another panel to close
let lastT = NaN;
let stickS: JoyInput = { x: 0, y: 0, r: 0 }, haveStick = false;       // the docking stick, smoothed so the outlines don't jitter
let needIndep = false;                                                // a suggestion is waiting for INDEP mode
let hooks: { placePanels(): void; closeOthers(): void; openMenu(): void } = { placePanels() {}, closeOthers() {}, openMenu() {} };

// ---------------------------------------------------------------- text
function claimHtml(c: Claim) {
  const src = c.src.map(id => {
    const s = SRC[id];
    return s?.url ? `<a href="${esc(s.url)}" target="_blank" rel="noopener" title="${esc(s.cite)}">${esc(s.short)}</a>` : `<span title="${esc(s?.cite ?? id)}">${esc(s?.short ?? id)}</span>`;
  }).join(', ');
  return `<li><span class="gc ${c.conf}" title="${CONF_TIP[c.conf]}">${CONF[c.conf]}</span>${esc(fill(c.text, SHIP))}${src ? ` <span class="gsrc">${src}</span>` : ''}</li>`;
}
/** The part of a card the Explain level adds: why, what the real world says, and how the model does it. */
function explainHtml(k: Card) {
  const parts: string[] = [];
  if (k.why) parts.push(`<p>${esc(fill(k.why, SHIP))}</p>`);
  if (k.real.length) parts.push(`<h4>Real world</h4><ul>${k.real.map(claimHtml).join('')}</ul>`);
  if (k.sim) parts.push(`<h4>In SHIPSHAPE</h4><p>${esc(fill(k.sim, SHIP))}</p>`);
  return `<div class="coach-more">${parts.join('')}</div>`;
}
const draftChip = (k: Card) => (k.review === 'draft' ? '<span class="gc draft" title="Not yet reviewed by the captain">DRAFT</span>' : '');
function cardHtml(k: Card, level: Level, title = true) {
  return `${title ? `<p class="coach-title">${esc(k.title)}${level === 'explain' ? draftChip(k) : ''}</p>` : ''}<p class="coach-brief">${esc(fill(k.brief, SHIP))}</p>${level === 'explain' ? explainHtml(k) : ''}`;
}

// ---------------------------------------------------------------- the panel
const otherPanelOpen = () => ['p-lines', 'p-tugs', 'p-dmg', 'p-lock'].some(id => !$(id).hidden);
const panelOpen = () => !$('p-coach').hidden;

function render() {
  const g = S.guide, body = $('coach-body'), btns = $('coach-btns');
  const more = g.level === 'explain' ? 'LESS' : 'MORE';
  if (view === 'tip' && coach.current) {
    body.innerHTML = cardHtml(coach.current, g.level);
    btns.innerHTML = `<button class="cb" data-a="more">${more}</button><button class="cb" data-a="ok">GOT IT</button>`;
    $('coach-head').textContent = 'COACH · TIP';
  } else if (view === 'intro') {
    body.innerHTML = '<p class="coach-title">Training guide</p><p class="coach-brief">Tips, steps and suggestions built on published sources. Each says whether it is measured data, published guidance or what this simulator\'s model does. There is no single global standard for handling podded or azimuthing propulsion: your ship\'s manual and your company\'s procedures come first.</p>';
    btns.innerHTML = '<button class="cb" data-a="intro">GOT IT</button>';
    $('coach-head').textContent = 'COACH';
  } else {
    const n = CONTENT.cards.filter(k => appliesTo(k, SHIP)).length;
    body.innerHTML = `<p class="coach-title">Nothing to suggest right now</p><p class="coach-brief">${g.tips ? 'A tip appears here when the situation calls for one.' : 'Tips are off.'}${n ? ` The reference has ${n} card${n > 1 ? 's' : ''} for ${esc(FAM_NAME[familyOf(SHIP)].toLowerCase())}.` : ''}${needIndep ? ' Pod suggestions show in INDEP mode: tap LINKED to change.' : ''}</p>`;
    btns.innerHTML = `<button class="cb" data-a="more">${more}</button><button class="cb" data-a="ref">REFERENCE</button>`;
    $('coach-head').textContent = 'COACH';
  }
}
function openPanel() {
  hooks.closeOthers();
  render();
  $('p-coach').hidden = false;
  hooks.placePanels();
  $('b-coach').classList.add('on');
}
function closePanel() {
  $('p-coach').hidden = true; pinned = false; deferred = false;
  $('b-coach').classList.remove('on');
}

function onButton(a: string) {
  const g = S.guide;
  if (a === 'more') { g.level = g.level === 'explain' ? 'brief' : 'explain'; pinned = true; syncMenu(); render(); hooks.placePanels(); }
  else if (a === 'ok') {
    const k = coach.current;
    if (k) g.seen.add(k.id);
    coach.dismiss(); view = 'none'; closePanel();
  } else if (a === 'intro') { g.seen.add('intro'); view = coach.current ? 'tip' : 'none'; closePanel(); }
  else if (a === 'ref') { hooks.openMenu(); const d = $('sec-guide') as HTMLDetailsElement; d.open = true; d.scrollIntoView({ block: 'start' }); }
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

/** Reference: every card that speaks to the ship in use, open for reading at the Explain level. */
export function renderReference() {
  const el = $('guide-ref');
  if (!S.guide.on) { el.innerHTML = ''; return; }
  const fam = familyOf(SHIP), cards = CONTENT.cards.filter(k => appliesTo(k, SHIP));
  el.innerHTML = `<h3 class="gref-h">Reference · ${esc(FAM_NAME[fam])} · ${esc(SHIP.name)}</h3>`
    + (cards.length ? cards.map(k => `<details><summary>${esc(k.title)}${draftChip(k)}</summary>${cardHtml(k, 'explain', false)}</details>`).join('')
      : '<p class="note">No reference cards for this ship yet.</p>');
}

/** Show or hide everything the guide adds, to match the settings. */
export function syncGuide() {
  const g = S.guide;
  $('b-coach').hidden = !g.on;
  if (!g.on) { if (panelOpen()) closePanel(); view = 'none'; coach.dismiss(); S.guide.ghost = null; haveStick = false; needIndep = false; }
  showBtGhost();
  syncMenu();
  renderReference();
}

/** A new scenario or ship: start the coach afresh. */
export function resetGuide() {
  coach.reset(); lastT = NaN; view = 'none'; if (panelOpen()) closePanel();
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
  if (needIndep !== was && view === 'idle' && panelOpen()) render();
}
function showBtGhost() {
  const el = $('bt-ghost'), b = S.guide.vectors ? S.guide.ghost?.bt : undefined;
  if (b === undefined) el.hidden = true;
  else { el.hidden = false; el.style.setProperty('--g', String((Math.max(-1, Math.min(1, b)) + 1) / 2)); }
}

/** Every slow tick (about 10 Hz): advance the coach and show or clear its tip. Does nothing while the guide is off. */
export function updateGuide() {
  const g = S.guide;
  if (!g.on || !S.rt) return;
  const rt = S.rt, t = rt.state.t, dt = Number.isFinite(lastT) ? Math.max(0, Math.min(2, t - lastT)) : 0;
  lastT = t;
  const before = coach.current?.id ?? null;
  const ctx = guideCtx(rt, S.berth.target, S.quay);
  updateGhost(dt, ctx);
  const card = coach.step(ctx, dt, { tips: g.tips, seen: g.seen });
  const now = card?.id ?? null;
  if (now !== before) {
    if (card) { view = 'tip'; if (otherPanelOpen()) deferred = true; else { openPanel(); } }
    else if (view === 'tip') { view = 'none'; deferred = false; if (!pinned) closePanel(); else render(); }
  } else if (card && view === 'tip' && !panelOpen()) {
    if (otherPanelOpen()) deferred = true;                                          // covered by another panel: wait
    else if (deferred) { deferred = false; openPanel(); }
    else { coach.dismiss(); view = 'none'; }                                         // the player closed it: leave it be
  }
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
  ($('g-steps') as HTMLInputElement).onchange = e => { g.steps = (e.target as HTMLInputElement).checked; syncMenu(); };
  ($('g-vec') as HTMLInputElement).onchange = e => { g.vectors = (e.target as HTMLInputElement).checked; if (!g.vectors) { g.ghost = null; haveStick = false; needIndep = false; } showBtGhost(); syncMenu(); };
  $('seg-glevel').querySelectorAll('button').forEach(b => ((b as HTMLButtonElement).onclick = () => { g.level = b.dataset.v as Level; syncMenu(); if (panelOpen()) render(); }));
  $('g-forget').onclick = () => { g.seen.clear(); coach.reset(); syncMenu(); toast('Every tip can show again.'); };
  $('coach-btns').addEventListener('click', e => { const a = (e.target as HTMLElement).closest('button')?.dataset.a; if (a) onButton(a); });
  $('b-coach').onclick = () => {
    if (panelOpen()) { if (view === 'tip') { coach.dismiss(); view = 'none'; } closePanel(); return; }
    pinned = true;
    view = coach.current ? 'tip' : !g.seen.has('intro') ? 'intro' : 'idle';
    openPanel();
  };
  syncGuide();
}
