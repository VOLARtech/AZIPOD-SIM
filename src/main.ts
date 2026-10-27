import '@fontsource/barlow-condensed/latin-500.css';
import '@fontsource/barlow-condensed/latin-600.css';
import '@fontsource/barlow-condensed/latin-700.css';
import '@fontsource/barlow/latin-400.css';
import '@fontsource/barlow/latin-500.css';
import '@fontsource/ibm-plex-mono/latin-400.css';
import '@fontsource/ibm-plex-mono/latin-500.css';
import '@fontsource/ibm-plex-mono/latin-500-italic.css';
import './style.css';
import { initApp, persist, toast } from './app';
import type { View3D } from './view3d/view';
import { DEG, KN, SHIP, setShip } from './physics/ship';
import { buildHull, setHull } from './physics/contact';
import { makeState, wrap } from './physics/sim';
import { DT, LeverMode, Runtime } from './physics/runtime';
import { LINE, WinchMode } from './physics/mooring';
import type { Alt, PredictJob, Track } from './physics/predict';
import { SCENARIOS, Scenario, currentField, depthAt } from './scenarios';
import { ensureScenario } from './scenes/loaders';
import { loadEnc } from './ui/enc';
import { haptic, suspendAudio, uiTick, unlockAudio, updateAudio } from './ui/audio';
import { S, SPEEDS, ghostInterval } from './ui/state';
import * as D from './ui/draw';
import { renderModel, renderPoster, renderTrials, renderValidation, drawPosterPlots } from './ui/sheet';
import PredictWorker from './predict.worker?worker&inline';
import TrialsWorker from './trials.worker?worker&inline';

setHull(buildHull(SHIP.L, SHIP.B, SHIP.xg, SHIP.LOA));
const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const pad3 = (x: number) => String(Math.round(((x % 360) + 360) % 360)).padStart(3, '0');
const sgn = (x: number, d = 0) => (x >= 0 ? '+' : '−') + Math.abs(x).toFixed(d);

// ---------------------------------------------------------------- scenario
function applyEnv() {
  const rt = S.rt;
  rt.env.windSpeed = S.env.windKn * KN;
  rt.env.windFrom = S.env.windFrom * DEG;
  rt.env.gusts = S.env.gusts;
  rt.env.current = currentField(S.sc, S.env.curKn, S.env.curSet);
  syncEnvUI();
}

function loadScenario(sc: Scenario) {
  S.sc = sc;
  const shipChanged = setShip(sc.ship ?? 'becancour') !== S.rt?.spec;
  if (shipChanged) {
    setHull(buildHull(SHIP.L, SHIP.B, SHIP.xg, SHIP.LOA));
    sheetStarted = false;                 // pilot card, trials: recompute for this ship
  }
  const st = makeState(SHIP, sc.start.n, sc.start.e, sc.start.psi, sc.start.kn);
  const rpm0 = Math.min(1, sc.start.kn / SHIP.vmaxKn);
  st.pods.forEach(p => (p.rpm = rpm0));
  S.cmd = { pods: SHIP.pods.map(() => ({ alpha: 0, rpm: rpm0 })), bt: 0, mode: 'twin' };
  Object.assign(S.env, { windKn: sc.windKn, windFrom: sc.windFrom, curKn: sc.currentKn, curSet: sc.currentSet, gusts: sc.gusts });
  S.rt = new Runtime(SHIP, st, S.cmd,
    { windSpeed: 0, windFrom: 0, gusts: false, current: () => [0, 0], depth: sc.depth },
    { obstacles: sc.obstacles, fenders: sc.fenders, bollards: sc.bollards, depthAt: depthAt(sc), mooringSide: sc.mooringSide, tugSide: sc.tugSide, tugBP: sc.tugBP });
  S.rt.sensors.mode = S.sensMode;
  applyEnv();
  S.rt.sensors.reset();
  S.view.follow = true; S.view.cN = st.n; S.view.cE = st.e;
  S.view.scale = (Math.min(innerWidth, Math.max(300, innerHeight - 380)) / 520) * sc.zoom;
  S.pred.tracks = [];
  S.quay.forEach(q => { q.d = Infinity; q.rate = 0; });
  $('b-lines').hidden = !sc.mooringSide; $('b-tugs').hidden = !sc.tugSide;
  $('p-lines').hidden = $('p-tugs').hidden = true;
  ($('bt') as HTMLInputElement).value = '0';
  setLever('twin');
  buildLines(); buildTugs();
  D.initParticles();
  if (shipChanged) renderModel(S.rt.model.h);
  onScenarioLoaded();
  renderScenarioList();
  syncButtons();
}

let sheetStarted = false;
const postedData = new Set<string>();
/** Load a scenario, fetching its chart and depth data first if it has any. */
async function openScenario(sc: Scenario) {
  if (sc.needsData || sc.chart) {
    try {
      const [data] = await Promise.all([ensureScenario(sc), sc.chart ? loadEnc(sc.chart) : null]);
      if (data && !postedData.has(sc.id)) { pw.postMessage({ kind: 'data', id: sc.id, data }); postedData.add(sc.id); }
    } catch (err) { console.error(err); toast(`Could not load the chart for ${sc.name}.`); if (S.rt) return; sc = SCENARIOS.find(s => !s.needsData)!; }
  }
  loadScenario(sc);
}
let onScenarioLoaded = () => { v3?.build(); };

// ---------------------------------------------------------------- 3D view (lazy)
let v3: View3D | null = null, v3Loading = false;
(globalThis as unknown as { __azb: unknown }).__azb = { S, D, get v3() { return v3; }, tick(ms: number) { capT += ms; frame(capT); } };   // console / test handle
const CAMS: [typeof S.disp.cam, string][] = [['bridge', 'BRIDGE'], ['port', 'PORT WING'], ['stbd', 'STBD WING'], ['chase', 'CHASE']];
function timeOfDay(): 'day' | 'dusk' | 'night' {
  const p = S.disp.palette;
  if (p !== 'auto') return p;
  const t = document.documentElement.getAttribute('data-theme');
  if (t) return t === 'dark' ? 'night' : 'day';
  return matchMedia('(prefers-color-scheme: dark)').matches ? 'night' : 'day';
}
function layout3d() {
  const pane = $('v3d'), mode = S.disp.view;
  pane.hidden = mode === '2d';
  $('map').style.visibility = mode === '3d' ? 'hidden' : '';
  D.LAY.split = null;
  pane.className = '';
  if (mode === '2d') return;
  let bot = D.LAY.overlayTray ? innerHeight : D.LAY.trayTop;
  if (bot < innerHeight * 0.3) bot = innerHeight;          // tray hidden (kiosk / capture)
  const portrait = innerHeight > innerWidth * 1.05;
  let x = 0, y = 0, w = innerWidth, h = Math.round(bot);
  if (mode === 'split' && portrait) {
    y = D.LAY.chipsBottom + 4; h = Math.round((bot - y) * 0.52);
    D.LAY.split = 'top'; D.LAY.splitAt = y + h; pane.className = 'split-top';
  } else if (mode === 'split') {
    y = D.LAY.hudBottom; h = bot - y; w = Math.round(innerWidth * 0.5);
    D.LAY.split = 'left'; D.LAY.splitAt = w; pane.className = 'split-left';
  }
  Object.assign(pane.style, { left: `${x}px`, top: `${y}px`, width: `${w}px`, height: `${h}px` });
  v3?.resize(w, h);
}
$('b-cam').onclick = () => {
  const i = CAMS.findIndex(c => c[0] === S.disp.cam);
  S.disp.cam = CAMS[(i + 1) % CAMS.length][0];
  if (v3) v3.cam = S.disp.cam;
  syncButtons();
};
async function ensure3d() {
  if (v3 || v3Loading) return;
  v3Loading = true; $('v3d-tag').textContent = 'LOADING 3D…';
  try {
    const m = await import('./view3d/view');
    const v = await m.createView($<HTMLCanvasElement>('c3d'));
    v.cam = S.disp.cam;
    v3 = v; v.build(); layout3d();
    $('v3d-tag').textContent = v.backend;
  } catch (err) {
    console.error(err);
    S.disp.view = '2d'; layout3d(); syncButtons();
    toast(`3D view could not start on this device (${(err as Error).message || err}). Staying on the chart.`);
  } finally { v3Loading = false; }
}
function set3d(mode: typeof S.disp.view) {
  S.disp.view = mode;
  if (mode !== '2d') ensure3d();
  layout3d(); syncButtons();
  requestAnimationFrame(() => { D.refreshLayout(); layout3d(); placePanels(); });
}
// look around: drag; zoom (binoculars) with wheel or pinch
{
  const c = $('c3d'), pts = new Map<number, [number, number]>();
  let pinch0 = 0;
  c.addEventListener('pointerdown', e => { c.setPointerCapture(e.pointerId); pts.set(e.pointerId, [e.clientX, e.clientY]); pinch0 = 0; });
  c.addEventListener('pointermove', e => {
    const p = pts.get(e.pointerId); if (!p || !v3) return;
    if (pts.size === 2) {
      const [a, b] = [...pts.values()], d0 = Math.hypot(a[0] - b[0], a[1] - b[1]);
      pts.set(e.pointerId, [e.clientX, e.clientY]);
      const [a2, b2] = [...pts.values()], d1 = Math.hypot(a2[0] - b2[0], a2[1] - b2[1]);
      if (pinch0 && d0 > 0) v3.zoomBy(d1 / d0);
      pinch0 = d1; return;
    }
    v3.drag(e.clientX - p[0], e.clientY - p[1], c.clientHeight);
    pts.set(e.pointerId, [e.clientX, e.clientY]);
  });
  const up = (e: PointerEvent) => { pts.delete(e.pointerId); pinch0 = 0; };
  c.addEventListener('pointerup', up); c.addEventListener('pointercancel', up);
  c.addEventListener('wheel', e => { e.preventDefault(); v3?.zoomBy(Math.exp(-e.deltaY * 0.0015)); }, { passive: false });
  c.addEventListener('dblclick', () => v3?.resetLook());
}

// ---------------------------------------------------------------- predictor worker
const pw = new PredictWorker();
pw.onmessage = (e: MessageEvent<{ id: number; tracks: Track[] }>) => {
  S.pred.pending = false;
  if (e.data.id === S.pred.jobId) S.pred.tracks = e.data.tracks;
};
function requestPrediction(now: number) {
  if (S.pred.mode === 0 || S.pred.pending || now - S.pred.lastSend < 250) return;
  const rt = S.rt, r = rt.sensors.out;
  S.pred.interval = ghostInterval(r.sog / KN);
  S.pred.horizon = S.pred.interval * S.pred.count;
  const onboard = S.pred.source === 'onboard';
  const base = onboard ? { ...rt.state, ...r.est } : rt.state;
  const alts: Alt[] = ['current', ...(S.pred.mode === 2 ? [...S.pred.alts] : [])];
  const job: PredictJob = {
    id: ++S.pred.jobId, shipId: SHIP.id, onboard,
    state: { ...base, pods: rt.state.pods.map(p => ({ ...p })) },
    cmd: { pods: rt.cmd.pods.map(p => ({ ...p })), bt: rt.cmd.bt, mode: rt.cmd.mode },
    wind: onboard ? { V: r.windTrueSpeed, from: r.windTrueFrom } : { V: rt.env.windSpeed, from: rt.env.windFrom },
    current: onboard ? r.curEst : null,
    scenarioId: S.sc.id, curKn: S.env.curKn, curSet: S.env.curSet,
    depth: isFinite(rt.depthHere) ? rt.depthHere : Infinity,
    lines: rt.lines.map(l => ({ fair: l.fair, bollard: l.bollard, L0: l.L0, state: l.state })),
    ext: { ...rt.world.ext! },
    horizon: S.pred.horizon, alts,
  };
  S.pred.pending = true; S.pred.lastSend = now;
  pw.postMessage(job);
}

// ---------------------------------------------------------------- HUD
function setLat(id: string, v: number) {
  const el = $(id);
  el.textContent = (v < -0.005 ? '◂ ' : v > 0.005 ? '▸ ' : '') + D.latFmt(v);
  el.className = 'val ' + (v < -0.005 ? 'port' : v > 0.005 ? 'stbd' : '');
}
function updateHud() {
  const rt = S.rt, r = rt.sensors.out, est = r.est;
  $('r-hdg').textContent = (((r.hdg / DEG) % 360 + 360) % 360).toFixed(1).padStart(5, '0');
  $('r-sog').textContent = (r.sog / KN).toFixed(1);
  $('r-stw').textContent = (r.stw / KN).toFixed(1);
  $('r-cog').textContent = r.sog > 0.1 ? pad3(r.cog / DEG) : '---';
  $('r-rot').textContent = sgn(r.rot / DEG * 60);
  setLat('r-bow', est.v + est.r * (SHIP.L * 0.42 - SHIP.xg));
  setLat('r-stern', est.v + est.r * (-SHIP.L * 0.42 - SHIP.xg));
  $('r-long').textContent = (est.u < 0 ? '−' : '+') + D.latFmt(est.u);
  document.querySelectorAll('.u-lat').forEach(el => (el.textContent = D.latUnit()));
  const ukc = rt.ukc;
  const ukcEl = $('r-ukc');
  ukcEl.textContent = isFinite(ukc) ? ukc.toFixed(1) : '—';
  ukcEl.className = 'val' + (isFinite(ukc) && ukc < 0.5 ? ' port' : '');
  $('r-wind').textContent = r.windTrueSpeed > 0.5 ? `WIND ${pad3(r.windTrueFrom / DEG)}° ${(r.windTrueSpeed / KN).toFixed(0)} kn · REL ${sgn(r.windRelAngle / DEG)}°` : 'WIND calm';
  const cs = Math.hypot(r.curEst[0], r.curEst[1]);
  $('r-cur').textContent = cs > 0.03 ? `CURRENT est ${pad3(Math.atan2(r.curEst[1], r.curEst[0]) / DEG)}° ${(cs / KN).toFixed(1)} kn` : 'CURRENT est nil';
  const d = rt.depthHere;
  $('r-depth').textContent = isFinite(d) ? `DEPTH ${d.toFixed(1)} m · SQUAT ${rt.sq.toFixed(2)} m` : 'DEPTH deep';
  const st = rt.status, used = st.podPower.reduce((a, b) => a + b, 0) + st.btPower;
  $('r-pwr').textContent = `PWR ${(used / 1e6).toFixed(1)}/${(st.avail / 1e6).toFixed(1)} MW${st.limited ? ' LIM' : ''}`;
  const t = Math.floor(rt.state.t);
  $('r-time').textContent = `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')} ${SPEEDS[S.speedIdx]}×${S.paused ? ' PAUSED' : ''}`;
  updateFlag();
  updateTray();
  updateLegend();
}

function updateFlag() {
  const rt = S.rt, st = rt.state, flag = $('r-flag');
  const show = (text: string, cls: string) => { flag.textContent = text; flag.className = 'flag ' + cls; flag.hidden = false; };
  const last = rt.contactLog[0];
  const alert = rt.alerts[0];
  if (last && st.t - last.t < 20) {
    const v = last.vn;
    let word: string, cls: string;
    if (last.hard) { word = 'Hull struck structure'; cls = 'heavy'; }
    else if (last.maxDefl > 1) { word = 'Fender overloaded'; cls = 'heavy'; }
    else if (v <= 0.1) { word = 'Landed gently'; cls = 'good'; }
    else if (v <= 0.2) { word = 'Firm landing'; cls = ''; }
    else { word = 'Heavy landing'; cls = 'heavy'; }
    const fend = last.fenders ? ` · fender ${(last.maxDefl * 100).toFixed(0)} %` : '';
    return show(`${word} · ${(v * 100).toFixed(0)} cm/s · ${(last.energy / 1e3).toFixed(0)} kJ${fend}`, cls);
  }
  if (alert && st.t - alert.t < 10) return show(alert.text, alert.cls);
  const cur = S.pred.tracks.find(t => t.alt === 'current');
  if (S.pred.mode && cur && !rt.ci.active) {
    if (cur.contactT !== null) return show(`Predicted contact in ${cur.contactT.toFixed(0)} s`, cur.contactT < 60 ? 'heavy' : '');
    if (cur.groundT !== null) return show(`Predicted grounding in ${cur.groundT.toFixed(0)} s`, 'heavy');
  }
  if (S.sc.berth) {
    const b = S.sc.berth, bp = b.psi * DEG, est = rt.sensors.out.est;
    const dn = est.n - b.n, de = est.e - b.e;
    const along = dn * Math.cos(bp) + de * Math.sin(bp), off = -dn * Math.sin(bp) + de * Math.cos(bp);
    if (Math.hypot(dn, de) < 400) return show(`BERTH ${along >= 0 ? 'past' : 'short'} ${Math.abs(along).toFixed(0)} m · off ${Math.abs(off).toFixed(1)} m · hdg ${sgn(wrap(est.psi - bp) / DEG, 1)}°`, '');
  }
  flag.hidden = true;
}

let legendOpen = !matchMedia('(max-width: 600px), (max-height: 520px)').matches;
let legendHtml = '';
function updateLegend() {
  const lg = $('legend'), rt = S.rt;
  const rows: string[] = [];
  const fx: string[] = [];
  if (Math.abs(rt.bank.Y) > 15e3) fx.push(`BANK ${(Math.abs(rt.bank.Y) / 9.81e3).toFixed(0)} t · stern to ${rt.bank.Y < 0 ? 'port' : 'stbd'}`);
  if (Math.hypot(rt.wash.X, rt.wash.Y) > 15e3) fx.push(`WASH OFF WALL ${(Math.hypot(rt.wash.X, rt.wash.Y) / 9.81e3).toFixed(0)} t`);
  if (rt.sq > 0.15) fx.push(`SQUAT ${rt.sq.toFixed(2)} m · UKC ${rt.ukc.toFixed(2)} m`);
  const shown = S.pred.mode ? S.pred.tracks.filter(t => t.alt === 'current' || (S.pred.mode === 2 && S.pred.alts.has(t.alt))) : [];
  const row = (t: Track) => { const o = D.trackOutcome(t); return `<div class="row"><span class="sw" style="background:${D.altColor(t.alt)}"></span><span class="nm">${D.ALT_SHORT[t.alt]}</span><span class="oc${o.bad ? ' bad' : ''}">${o.text}</span></div>`; };
  if (legendOpen) {
    if (S.pred.mode) { rows.push(`<div class="hd">PREDICTION · ${S.pred.count} × ${S.pred.interval} s · ${S.pred.source === 'onboard' ? 'ONBOARD' : 'IDEAL'} ▴</div>`); shown.forEach(t => rows.push(row(t))); }
    if (fx.length) rows.push(`<div class="hd">EFFECTS</div>` + fx.map(t => `<div class="row"><span class="oc">${t}</span></div>`).join(''));
  } else if (shown.length || fx.length) {
    // collapsed: the as-set track plus anything that ends badly
    const bad = shown.filter(t => t.alt !== 'current' && D.trackOutcome(t).bad).length;
    const cur = shown.find(t => t.alt === 'current');
    rows.push(`<div class="hd">PRED ${S.pred.interval} s${bad ? ` · ${bad} WHAT-IF ⚠` : ''}${fx.length ? ` · ${fx.length} EFFECT${fx.length > 1 ? 'S' : ''}` : ''} ▾</div>`);
    if (cur) rows.push(row(cur));
  }
  const html = rows.join('');
  if (html !== legendHtml) { legendHtml = html; lg.innerHTML = html; }
  lg.hidden = rows.length === 0 || (S.disp.detail === 'clean' && S.pred.mode !== 2);
  lg.setAttribute('aria-expanded', String(legendOpen));
  lg.style.bottom = `${innerHeight - D.LAY.trayTop + 36}px`;
}
$('legend').onclick = () => { legendOpen = !legendOpen; updateLegend(); };

// ---------------------------------------------------------------- tray: levers / joystick
class Dial {
  c: HTMLCanvasElement; g: CanvasRenderingContext2D; size = 120;
  dragging = false;
  constructor(public i: number) {
    this.c = $('dial-' + i) as HTMLCanvasElement;
    this.g = this.c.getContext('2d')!;
    this.c.addEventListener('pointerdown', e => {
      this.c.setPointerCapture(e.pointerId); this.dragging = true;
      if (S.rt.lever === 'joy') { if (this.i === 0) this.joyFrom(e); return; }
      this.fromEvent(e);
    });
    this.c.addEventListener('pointermove', e => {
      if (!this.c.hasPointerCapture(e.pointerId)) return;
      if (S.rt.lever === 'joy') { if (this.i === 0) this.joyFrom(e); return; }
      this.fromEvent(e);
    });
    const end = () => { this.dragging = false; if (S.rt.lever === 'joy' && this.i === 0) { S.rt.joy.x = 0; S.rt.joy.y = 0; } };
    this.c.addEventListener('pointerup', end); this.c.addEventListener('pointercancel', end);
  }
  resize() { this.size = this.c.clientWidth; this.c.width = this.c.height = Math.round(this.size * D.DPR); }
  geom(e: PointerEvent) {
    const r = this.c.getBoundingClientRect();
    return { dx: e.clientX - r.left - r.width / 2, dy: e.clientY - r.top - r.height / 2, R: r.width / 2 - 14 };
  }
  joyFrom(e: PointerEvent) {
    const { dx, dy, R } = this.geom(e);
    const k = Math.min(1, Math.hypot(dx, dy) / R) / (Math.hypot(dx, dy) / R || 1);
    S.rt.joy.x = Math.max(-1, Math.min(1, dx / R * k));
    S.rt.joy.y = Math.max(-1, Math.min(1, -dy / R * k));
  }
  /** Azimuth only: the dial sets where the pod points; rpm lives on its own lever. */
  fromEvent(e: PointerEvent) {
    const { dx, dy, R } = this.geom(e);
    if (Math.hypot(dx, dy) < R * 0.18) return;          // centre: no direction, ignore
    const a = wrap(Math.atan2(dx, -dy)), old = S.cmd.pods[this.i].alpha;
    const step = (x: number) => Math.floor(((x / DEG) + 360.0001) % 360 / 15);
    const sa = step(a), so = step(old);
    if (sa !== so) { const edge = Math.abs(sa - so) > 12 ? 0 : Math.max(sa, so); uiTick(edge % 6 === 0 ? 'cardinal' : 'step'); }   // 15° steps, 90° marks
    for (const j of S.rt.lever === 'twin' ? [0, 1] : [this.i]) S.cmd.pods[j].alpha = a;
  }
  draw() {
    const g = this.g, Sz = this.size, R = Sz / 2 - 14;
    if (R < 8) return;                                   // tray hidden / not laid out yet
    g.setTransform(D.DPR, 0, 0, D.DPR, 0, 0); g.clearRect(0, 0, Sz, Sz); g.translate(Sz / 2, Sz / 2);
    const joy = S.rt.lever === 'joy';
    if (joy && this.i === 0) return this.drawPad(R);
    if (joy && this.i === 1) return this.drawPodsIndicator(R);
    const col = D.podColors[this.i];
    this.ring(R);
    const ps = S.rt.state.pods[this.i];
    // actual: needle in the direction of pull (reversed rpm pulls the other way)
    const pull = ps.alpha + (ps.rpm < 0 ? Math.PI : 0), ra = (0.14 + 0.86 * Math.abs(ps.rpm)) * R;
    g.strokeStyle = col; g.lineWidth = 3; g.lineCap = 'round';
    g.beginPath(); g.moveTo(0, 0); g.lineTo(Math.sin(pull) * ra, -Math.cos(pull) * ra); g.stroke();
    // pod body orientation
    g.save(); g.rotate(ps.alpha); g.fillStyle = col; g.globalAlpha = 0.35; g.fillRect(-3, -R * 0.12, 6, R * 0.24); g.restore(); g.globalAlpha = 1;
    // ordered azimuth: handle on the rim (where the pod is told to point)
    const c = S.cmd.pods[this.i], rc = R * 0.86;
    const hx = Math.sin(c.alpha) * rc, hy = -Math.cos(c.alpha) * rc;
    g.fillStyle = D.C['panel-solid']; g.strokeStyle = col; g.lineWidth = 2;
    g.beginPath(); g.arc(hx, hy, 9, 0, Math.PI * 2); g.fill(); g.stroke();
    g.fillStyle = col; g.beginPath(); g.arc(hx, hy, 3.5, 0, Math.PI * 2); g.fill();
    this.extras(R);
  }
  /** Power arc outside the ticks and control-system warnings inside the dial. */
  extras(R: number) {
    const g = this.g, st = S.rt.status, i = this.i;
    const frac = Math.min(1, st.podPower[i] / SHIP.pods[i].P);
    const a0 = Math.PI * 0.75, span = Math.PI * 1.5;
    g.lineCap = 'butt'; g.lineWidth = 3;
    g.strokeStyle = D.C.rule; g.beginPath(); g.arc(0, 0, R + 12, a0, a0 + span); g.stroke();
    if (frac > 0.005) { g.strokeStyle = st.rpmLimit[i] < 0.999 ? D.C.warn : D.C.own; g.beginPath(); g.arc(0, 0, R + 12, a0, a0 + span * frac); g.stroke(); }
    const w = st.revBlocked[i] ? 'REV BLOCKED' : st.split[i] ? 'SPLIT 70%' : st.rpmLimit[i] < 0.999 ? 'PWR LIMIT' : '';
    if (w) {
      g.font = `600 ${Math.max(9, R * 0.17).toFixed(0)}px ${D.C.fontLabel}`; g.textAlign = 'center'; g.textBaseline = 'middle';
      const tw = g.measureText(w).width + 8;
      g.fillStyle = D.C['panel-solid']; g.fillRect(-tw / 2, R * 0.55 - 8, tw, 16);
      g.fillStyle = D.C.warn; g.fillText(w, 0, R * 0.55);
    }
  }
  ring(R: number) {
    const g = this.g;
    g.strokeStyle = D.C.rule; g.lineWidth = 1;
    for (const f of [0.14, 0.57, 1]) { g.beginPath(); g.arc(0, 0, R * f, 0, Math.PI * 2); g.stroke(); }
    for (let k = 0; k < 36; k++) {
      const a = k * 10 * DEG, big = k % 9 === 0, mid = k % 3 === 0;
      const r0 = R + 2, r1 = R + (big ? 9 : mid ? 6 : 3.5);
      g.strokeStyle = big ? D.C.ink : D.C.muted; g.lineWidth = big ? 1.5 : 1;
      g.beginPath(); g.moveTo(Math.sin(a) * r0, -Math.cos(a) * r0); g.lineTo(Math.sin(a) * r1, -Math.cos(a) * r1); g.stroke();
    }
    g.strokeStyle = D.C.rule; g.beginPath(); g.moveTo(0, -R * 0.35); g.lineTo(R * 0.12, -R * 0.15); g.lineTo(R * 0.12, R * 0.3); g.lineTo(-R * 0.12, R * 0.3); g.lineTo(-R * 0.12, -R * 0.15); g.closePath(); g.stroke();
  }
  drawPad(R: number) {
    const g = this.g, j = S.rt.joy;
    g.strokeStyle = D.C.rule; g.lineWidth = 1;
    g.beginPath(); g.arc(0, 0, R, 0, Math.PI * 2); g.stroke();
    g.beginPath(); g.moveTo(-R, 0); g.lineTo(R, 0); g.moveTo(0, -R); g.lineTo(0, R); g.stroke();
    g.fillStyle = D.C.muted; g.font = `600 10px ${D.C.fontLabel}`; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('AHEAD', 0, -R + 10); g.fillText('ASTERN', 0, R - 10); g.fillText('P', -R + 8, 0); g.fillText('S', R - 8, 0);
    const x = j.x * R, y = -j.y * R;
    g.fillStyle = D.C['panel-solid']; g.strokeStyle = D.C.own; g.lineWidth = 2;
    g.beginPath(); g.arc(x, y, 12, 0, Math.PI * 2); g.fill(); g.stroke();
    g.fillStyle = D.C.own; g.beginPath(); g.arc(x, y, 4, 0, Math.PI * 2); g.fill();
  }
  drawPodsIndicator(R: number) {
    const g = this.g;
    this.ring(R);
    S.rt.state.pods.forEach((ps, i) => {
      const pull = ps.alpha + (ps.rpm < 0 ? Math.PI : 0), ra = (0.14 + 0.86 * Math.abs(ps.rpm)) * R;
      g.strokeStyle = D.podColors[i]; g.lineWidth = 3; g.lineCap = 'round';
      const ox = (i ? 1 : -1) * 6;
      g.beginPath(); g.moveTo(ox, R * 0.2); g.lineTo(ox + Math.sin(pull) * ra, R * 0.2 - Math.cos(pull) * ra); g.stroke();
    });
    const bt = S.rt.state.bt;
    if (Math.abs(bt) > 0.02) { g.strokeStyle = D.C.own; g.lineWidth = 3; g.beginPath(); g.moveTo(0, -R * 0.3); g.lineTo(bt * R * 0.6, -R * 0.3); g.stroke(); }
  }
}

/** RPM lever, one per pod: ahead up, astern down, detent at zero. Linked pods move together. */
class RpmLever {
  c: HTMLCanvasElement; g: CanvasRenderingContext2D; w = 34; h = 120; lastTap = 0;
  constructor(public i: number) {
    this.c = $('rpm-' + i) as HTMLCanvasElement;
    this.g = this.c.getContext('2d')!;
    this.c.addEventListener('pointerdown', e => {
      if (S.rt.lever === 'joy') return;
      this.c.setPointerCapture(e.pointerId);
      const now = performance.now();
      if (now - this.lastTap < 300) { this.lastTap = 0; this.set(0); uiTick('detent'); return; }   // double tap: stop
      this.lastTap = now;
      this.fromEvent(e);
    });
    this.c.addEventListener('pointermove', e => { if (this.c.hasPointerCapture(e.pointerId) && S.rt.lever !== 'joy') this.fromEvent(e); });
  }
  resize() {
    this.w = this.c.clientWidth; this.h = this.c.clientHeight;
    this.c.width = Math.round(this.w * D.DPR); this.c.height = Math.round(this.h * D.DPR);
  }
  get pad() { return 10; }
  y(v: number) { const H = this.h - 2 * this.pad; return this.pad + H / 2 - v * H / 2; }
  fromEvent(e: PointerEvent) {
    const r = this.c.getBoundingClientRect(), H = r.height - 2 * this.pad;
    let v = Math.max(-1, Math.min(1, (r.height / 2 - (e.clientY - r.top)) / (H / 2)));
    if (Math.abs(v) < 0.05) v = 0;                      // zero detent
    v = Math.round(v * 100) / 100;
    const old = S.cmd.pods[this.i].rpm;
    if (v !== old) {
      if (v === 0) uiTick('detent');
      else if (Math.floor(v * 10) !== Math.floor(old * 10)) uiTick('step');   // every 10 %
    }
    this.set(v);
  }
  set(v: number) { for (const j of S.rt.lever === 'twin' ? [0, 1] : [this.i]) S.cmd.pods[j].rpm = v; }
  draw() {
    const g = this.g, w = this.w, joy = S.rt.lever === 'joy', col = D.podColors[this.i];
    if (w < 8 || this.h < 40) return;
    g.setTransform(D.DPR, 0, 0, D.DPR, 0, 0); g.clearRect(0, 0, w, this.h);
    const x0 = w / 2, y0 = this.y(0);
    // slot
    g.fillStyle = D.C.rule; g.fillRect(x0 - 3, this.y(1), 6, this.y(-1) - this.y(1));
    // scale: ticks every 25 %, zero heavy
    g.strokeStyle = D.C.muted; g.lineWidth = 1;
    for (let k = -4; k <= 4; k++) {
      const yy = Math.round(this.y(k / 4)) + 0.5, big = k === 0;
      g.strokeStyle = big ? D.C.ink : D.C.muted; g.lineWidth = big ? 1.5 : 1;
      g.beginPath(); g.moveTo(2, yy); g.lineTo(big ? 9 : 6, yy); g.moveTo(w - 2, yy); g.lineTo(w - (big ? 9 : 6), yy); g.stroke();
    }
    g.fillStyle = D.C.muted; g.font = `600 9px ${D.C.fontLabel}`; g.textAlign = 'center';
    g.textBaseline = 'top'; g.fillText('AH', x0, 0);
    g.textBaseline = 'bottom'; g.fillText('AS', x0, this.h);
    // control-system ceiling (power / berthing split / astern limit)
    const lim = S.rt.status.rpmLimit[this.i], am = SHIP.asternMax * lim;
    g.strokeStyle = D.C.warn; g.setLineDash([3, 2]); g.lineWidth = 1.5;
    for (const v of [lim < 0.999 ? lim : NaN, -am]) if (isFinite(v)) { const yy = this.y(v); g.beginPath(); g.moveTo(3, yy); g.lineTo(w - 3, yy); g.stroke(); }
    g.setLineDash([]);
    // actual rpm: bar from zero (lags the order: 30 s run-up, 60 s through a reversal)
    const a = S.rt.state.pods[this.i].rpm;
    g.fillStyle = col; g.globalAlpha = 0.85;
    g.fillRect(x0 - 3, Math.min(y0, this.y(a)), 6, Math.abs(this.y(a) - y0)); g.globalAlpha = 1;
    if (joy) return;
    // ordered rpm: handle
    const yc = this.y(S.cmd.pods[this.i].rpm), hw = Math.min(w - 4, 30);
    g.fillStyle = D.C['panel-solid']; g.strokeStyle = S.cmd.pods[this.i].rpm < 0 ? D.C.warn : col; g.lineWidth = 2;
    g.beginPath(); g.roundRect(x0 - hw / 2, yc - 7, hw, 14, 3); g.fill(); g.stroke();
    g.strokeStyle = g.fillStyle = col; g.beginPath(); g.moveTo(x0 - hw / 2 + 4, yc); g.lineTo(x0 + hw / 2 - 4, yc); g.lineWidth = 1.5; g.stroke();
  }
}
const dials = [new Dial(0), new Dial(1)];
const levers = [new RpmLever(0), new RpmLever(1)];

function updateTray() {
  const rt = S.rt, joy = rt.lever === 'joy';
  for (let i = 0; i < 2; i++) {
    const p = rt.state.pods[i], st = rt.status;
    if (joy) {
      $('pt-' + i).textContent = i ? 'PODS' : 'STICK';
      $('pr-' + i).textContent = i
        ? rt.state.pods.map(q => pad3(q.alpha / DEG)).join(' ')
        : `${sgn(rt.joy.y * 100)} ${sgn(rt.joy.x * 100)}`;
    } else {
      $('pt-' + i).textContent = i ? 'STBD' : 'PORT';
      $('pr-' + i).textContent = `${pad3(p.alpha / DEG)}° ${p.rpm < 0 ? 'R' : ''}${Math.round(Math.abs(p.rpm) * 100)}%`;
    }
    void st;
  }
  $('bt-val').textContent = joy ? sgn(rt.joy.r, 2) : `${Math.round(rt.state.bt * 100)}`;
}

function setLever(m: LeverMode) {
  S.rt.setLever(m);
  const joy = m === 'joy';
  $('b-mode').textContent = { twin: 'LINKED', indep: 'INDEP', joy: 'JOY' }[m];
  $('b-mode').setAttribute('aria-pressed', String(m === 'twin'));
  document.querySelectorAll<HTMLElement>('.joyonly').forEach(b => (b.hidden = !joy));
  $('bt-label').textContent = joy ? 'YAW' : 'BOW THRUSTER';
  btIn.value = '0';
  if (m === 'twin') { S.cmd.pods[1].alpha = S.cmd.pods[0].alpha; S.cmd.pods[1].rpm = S.cmd.pods[0].rpm; }
  if (!joy) S.cmd.bt = 0;
  syncButtons();
}
const btIn = $('bt') as HTMLInputElement;
btIn.oninput = () => {
  if (S.rt.lever === 'joy') S.rt.joy.r = +btIn.value / 100; else S.cmd.bt = +btIn.value / 100;
};
const btRelease = () => { if (S.rt.lever === 'joy') { btIn.value = '0'; S.rt.joy.r = 0; } };
btIn.addEventListener('pointerup', btRelease); btIn.addEventListener('change', btRelease);
btIn.ondblclick = () => { btIn.value = '0'; S.cmd.bt = 0; };
// ---------------------------------------------------------------- panels: lines & tugs
const MODES: [WinchMode, string][] = [['heave', 'HEAVE'], ['brake', 'BRAKE'], ['slack', 'SLACK'], ['auto', 'AUTO-T']];
let linesSig = '';
function buildLines() {
  const box = $('lines'), rt = S.rt;
  linesSig = rt.lines.map(l => l.state + l.mode).join();
  box.innerHTML = rt.lines.map((l, i) => `
    <div class="lrow"><span class="nm">${l.name}</span><span class="t" id="lt-${i}">${l.state.toUpperCase()}</span>
      <div class="btns">${l.state === 'fast'
        ? MODES.map(([m, lab]) => `<button data-l="${i}" data-m="${m}" aria-pressed="${l.mode === m}">${lab}</button>`).join('') + `<button data-l="${i}" data-m="go">LET GO</button>`
        : `<button data-l="${i}" data-m="pass">${l.state === 'parted' ? 'SEND NEW LINE' : 'SEND ASHORE'}</button>`}</div></div>`).join('');
  box.querySelectorAll<HTMLButtonElement>('button').forEach(b => b.onclick = () => {
    const i = +b.dataset.l!, m = b.dataset.m!;
    if (m === 'pass') S.rt.passLine(i); else if (m === 'go') S.rt.letGo(i); else S.rt.lines[i].mode = m as WinchMode;
    buildLines();
  });
}
function updateLinesPanel() {
  if ($('p-lines').hidden) return;
  const sig = S.rt.lines.map(l => l.state + l.mode).join();
  if (sig !== linesSig) buildLines();
  S.rt.lines.forEach((l, i) => {
    const el = document.getElementById('lt-' + i); if (!el) return;
    el.textContent = l.state === 'fast' ? `${(l.T / 9.81e3).toFixed(1)} t · peak ${(l.peakT / 9.81e3).toFixed(0)} t · ${l.L0.toFixed(0)} m` : l.state.toUpperCase();
    el.className = 't' + (l.T > 0.6 * LINE.MBL || l.state === 'parted' ? ' hi' : '');
  });
}
function buildTugs() {
  const box = $('tugs');
  $('tug-head').textContent = `TUGS · ${Math.round((S.rt.tugs[0]?.Fmax ?? 0) / 9.81e3)} t BOLLARD PULL`;
  box.innerHTML = S.rt.tugs.map((t, i) => `
    <div class="tugrow"><span class="tag">${t.name}</span>
      <input type="range" id="tg-${i}" min="-100" max="100" step="25" value="0" aria-label="${t.name} order: pull to push" />
      <span class="t" id="tt-${i}">idle</span></div>
    <div class="btscale"><span></span><span>PULL ← · → PUSH (${t.side > 0 ? 'toward port' : 'toward stbd'})</span><span></span></div>`).join('');
  S.rt.tugs.forEach((t, i) => { ($('tg-' + i) as HTMLInputElement).oninput = e => (t.order = +(e.target as HTMLInputElement).value / 100); });
}
function updateTugsPanel() {
  if ($('p-tugs').hidden) return;
  S.rt.tugs.forEach((t, i) => {
    const el = document.getElementById('tt-' + i); if (!el) return;
    el.textContent = t.repos > 0 ? `REPOS ${t.repos.toFixed(0)} s` : Math.abs(t.F) < 5e3 ? 'idle' : `${t.F * t.side < 0 ? 'PUSH' : 'PULL'} ${(Math.abs(t.F) / 9.81e3).toFixed(0)} t`;
  });
}
function placePanels() {
  for (const id of ['p-lines', 'p-tugs']) {
    const el = $(id);
    el.style.bottom = `${innerHeight - D.LAY.trayTop + 8}px`;
    el.style.maxHeight = `${Math.max(140, D.LAY.trayTop - D.LAY.chipsBottom - 16)}px`;
  }
}
document.querySelectorAll<HTMLButtonElement>('[data-close]').forEach(b => (b.onclick = () => ($(b.dataset.close!).hidden = true)));
$('b-lines').onclick = () => { const p = $('p-lines'); p.hidden = !p.hidden; $('p-tugs').hidden = true; buildLines(); placePanels(); };
$('b-tugs').onclick = () => { const p = $('p-tugs'); p.hidden = !p.hidden; $('p-lines').hidden = true; placePanels(); };

// ---------------------------------------------------------------- map gestures
const ptrs = new Map<number, { x: number; y: number }>();
let pinch0 = 0, scale0 = 1;
D.cv.addEventListener('pointerdown', e => {
  D.cv.setPointerCapture(e.pointerId); ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; pinch0 = Math.hypot(a.x - b.x, a.y - b.y); scale0 = S.view.scale; }
});
D.cv.addEventListener('pointermove', e => {
  const p = ptrs.get(e.pointerId); if (!p) return;
  if (ptrs.size === 1) {
    const [n0, e0] = D.fromScr(p.x, p.y), [n1, e1] = D.fromScr(e.clientX, e.clientY);
    S.view.cN -= n1 - n0; S.view.cE -= e1 - e0;
    if (Math.hypot(e.clientX - p.x, e.clientY - p.y) > 0.5 && S.view.follow) { S.view.follow = false; syncButtons(); }
  }
  p.x = e.clientX; p.y = e.clientY;
  if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; zoomTo(scale0 * Math.hypot(a.x - b.x, a.y - b.y) / pinch0); }
});
const up = (e: PointerEvent) => ptrs.delete(e.pointerId);
D.cv.addEventListener('pointerup', up); D.cv.addEventListener('pointercancel', up);
D.cv.addEventListener('wheel', e => { e.preventDefault(); zoomTo(S.view.scale * Math.exp(-e.deltaY * 0.0015)); }, { passive: false });
function zoomTo(s: number) { S.view.scale = Math.max(0.1, Math.min(8, s)); }

// ---------------------------------------------------------------- buttons & keys
function syncButtons() {
  const tog = (id: string, on: boolean) => { const b = $(id); b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on)); };
  $('b-pred').textContent = ['PRED OFF', 'PRED', 'PRED+IF'][S.pred.mode];
  tog('b-pred', S.pred.mode > 0); tog('b-follow', S.view.follow);
  $('b-view').textContent = S.view.headUp ? 'HEAD-UP' : 'N-UP';
  $('b-3d').textContent = ({ '2d': '2D', split: 'SPLIT', '3d': '3D' })[S.disp.view];
  $('b-3d').classList.toggle('on', S.disp.view !== '2d');
  $('b-cam').hidden = S.disp.view === '2d';
  $('b-cam').textContent = CAMS.find(c => c[0] === S.disp.cam)![1];
  $('b-pause').textContent = S.paused ? 'RUN' : 'PAUSE';
  $('b-speed').textContent = SPEEDS[S.speedIdx] + '×';
  $('b-hdg').setAttribute('aria-pressed', String(S.rt?.dp.hdgHold ?? false));
  $('b-pos').setAttribute('aria-pressed', String(S.rt?.dp.posHold ?? false));
}
$('b-pred').onclick = () => { S.pred.mode = ((S.pred.mode + 1) % 3) as 0 | 1 | 2; S.pred.tracks = []; syncButtons(); };
$('b-follow').onclick = () => { S.view.follow = !S.view.follow; syncButtons(); };
$('b-view').onclick = () => { S.view.headUp = !S.view.headUp; syncButtons(); };
$('b-3d').onclick = () => set3d(({ '2d': 'split', split: '3d', '3d': '2d' } as const)[S.disp.view]);
$('b-zin').onclick = () => zoomTo(S.view.scale * 1.4);
$('b-zout').onclick = () => zoomTo(S.view.scale / 1.4);
$('b-pause').onclick = () => { S.paused = !S.paused; syncButtons(); };
$('b-speed').onclick = () => { S.speedIdx = (S.speedIdx + 1) % SPEEDS.length; syncButtons(); };
$('b-mode').onclick = () => setLever(({ twin: 'indep', indep: 'joy', joy: 'twin' } as const)[S.rt.lever]);
$('b-hdg').onclick = () => { S.rt.setHdgHold(!S.rt.dp.hdgHold); syncButtons(); };
$('b-pos').onclick = () => { S.rt.setPosHold(!S.rt.dp.posHold); syncButtons(); };
$('b-zero').onclick = zeroAll;
function zeroAll() {
  S.cmd.pods.forEach(p => (p.rpm = 0)); S.cmd.bt = 0; btIn.value = '0';
  S.rt.joy = { x: 0, y: 0, r: 0 };
}
const hudEl = $('hud');
const toggleHud = () => { hudEl.setAttribute('aria-expanded', String(hudEl.getAttribute('aria-expanded') !== 'true')); requestAnimationFrame(() => { D.refreshLayout(); placePanels(); }); };
hudEl.onclick = toggleHud;
hudEl.onkeydown = e => { if (e.key === 'Enter') toggleHud(); };
let pausedBeforeSheet = false;
$('b-menu').onclick = () => { pausedBeforeSheet = S.paused; $('sheet').hidden = false; S.paused = true; syncButtons(); startSheetWork(); setTimeout(drawPosterPlots, 30); };
$('b-close').onclick = () => { $('sheet').hidden = true; S.paused = pausedBeforeSheet; syncButtons(); };

const keys = new Set<string>();
addEventListener('keydown', e => {
  const tgt = e.target as HTMLElement;
  if (tgt.tagName === 'INPUT' && (tgt as HTMLInputElement).type !== 'range') return;
  const k = e.key.toLowerCase();
  if (k === ' ') { S.paused = !S.paused; syncButtons(); e.preventDefault(); return; }
  if (k.startsWith('arrow')) e.preventDefault();
  if (k === 'x') zeroAll();
  if (k === 'm') $('b-mode').click();
  if (k === 'p') $('b-pred').click();
  if (k === 'h') $('b-view').click();
  if (k === 'v') $('b-3d').click();
  if (k === 'c') $('b-cam').click();
  if (k === 'f') $('b-follow').click();
  if (k === '[') { S.speedIdx = Math.max(0, S.speedIdx - 1); syncButtons(); }
  if (k === ']') { S.speedIdx = Math.min(SPEEDS.length - 1, S.speedIdx + 1); syncButtons(); }
  if (k === 'escape' && !$('sheet').hidden) $('b-close').click();
  keys.add(k);
});
addEventListener('keyup', e => keys.delete(e.key.toLowerCase()));
function keyControl(dt: number) {
  const rt = S.rt;
  if (rt.lever === 'joy') {
    const ax = (a: string, b: string) => (keys.has(b) ? 1 : 0) - (keys.has(a) ? 1 : 0);
    const kx = ax('arrowleft', 'arrowright'), ky = ax('arrowdown', 'arrowup'), kr = ax('q', 'e');
    if (kx || ky || keys.has('arrowleft') || keys.has('arrowright') || keys.has('arrowup') || keys.has('arrowdown')) { rt.joy.x = kx; rt.joy.y = ky; }
    else if (!dials[0].dragging) { rt.joy.x = 0; rt.joy.y = 0; }
    if (kr) rt.joy.r = kr; else if (btIn.value === '0') rt.joy.r = 0;
    return;
  }
  const map: [string, string, string, string, number][] = [['a', 'd', 'w', 's', 0], ['j', 'l', 'i', 'k', 1]];
  for (const [l, r, u, d, i] of map) {
    for (const j of rt.lever === 'twin' ? [0, 1] : [i]) {
      const p = S.cmd.pods[j];
      if (keys.has(l)) p.alpha = wrap(p.alpha - 45 * DEG * dt);
      if (keys.has(r)) p.alpha = wrap(p.alpha + 45 * DEG * dt);
      if (keys.has(u)) p.rpm = Math.min(1, p.rpm + 0.4 * dt);
      if (keys.has(d)) p.rpm = Math.max(-1, p.rpm - 0.4 * dt);
    }
  }
  if (keys.has('q') || keys.has('e')) {
    S.cmd.bt = Math.max(-1, Math.min(1, S.cmd.bt + (keys.has('e') ? 1 : -1) * 0.8 * dt));
    btIn.value = String(Math.round(S.cmd.bt * 100));
  }
}

// ---------------------------------------------------------------- sheet
function renderScenarioList() {
  const box = $('scenarios'); box.innerHTML = '';
  for (const s of SCENARIOS) {
    const b = document.createElement('button');
    b.className = s === S.sc ? 'cur' : '';
    b.innerHTML = `<b>${s.name}</b><span>${s.brief}</span>`;
    b.onclick = () => { openScenario(s).then(() => $('b-close').click()); };
    box.appendChild(b);
  }
}
const bindRange = (id: string, get: () => number, set: (v: number) => void, after = applyEnv) => {
  const el = $(id) as HTMLInputElement;
  el.oninput = () => { set(+el.value); after(); };
  return () => { el.value = String(get()); };
};
const syncers = [
  bindRange('s-ws', () => S.env.windKn, v => (S.env.windKn = v)),
  bindRange('s-wd', () => S.env.windFrom, v => (S.env.windFrom = v)),
  bindRange('s-cs', () => S.env.curKn, v => (S.env.curKn = v)),
  bindRange('s-cd', () => S.env.curSet, v => (S.env.curSet = v)),
  bindRange('s-gc', () => S.pred.count, v => (S.pred.count = v), syncEnvUI),
  bindRange('s-gi', () => S.pred.intervalIdx, v => (S.pred.intervalIdx = v), syncEnvUI),
  bindRange('s-vec', () => S.disp.vecMin, v => (S.disp.vecMin = v), syncEnvUI),
];
($('s-gu') as HTMLInputElement).onchange = e => { S.env.gusts = (e.target as HTMLInputElement).checked; applyEnv(); };
($('s-static') as HTMLInputElement).onchange = e => { S.pred.staticArc = (e.target as HTMLInputElement).checked; };
($('s-truth') as HTMLInputElement).onchange = e => { S.disp.truth = (e.target as HTMLInputElement).checked; };
// sound & haptics
const sndIn = $<HTMLInputElement>('s-sound'), volIn = $<HTMLInputElement>('s-vol'), hapIn = $<HTMLInputElement>('s-hap');
const canVibrate = 'vibrate' in navigator;
$('l-hap').hidden = !canVibrate; $('hap-note').hidden = canVibrate;
sndIn.onchange = () => { S.disp.sound = sndIn.checked; if (S.disp.sound) unlockAudio(); };
volIn.oninput = () => { S.disp.vol = +volIn.value / 100; $('o-vol').textContent = `${volIn.value} %`; };
hapIn.onchange = () => { S.disp.haptics = hapIn.checked; if (hapIn.checked) haptic(30, 0); };
const syncSound = () => { sndIn.checked = S.disp.sound; volIn.value = String(Math.round(S.disp.vol * 100)); $('o-vol').textContent = `${volIn.value} %`; hapIn.checked = S.disp.haptics && canVibrate; };
// browsers only start audio from a user gesture
addEventListener('pointerdown', unlockAudio, { capture: true });
addEventListener('keydown', unlockAudio, { capture: true });
const uiSyncs: (() => void)[] = [syncSound];
function seg(id: string, get: () => string, set: (v: string) => void) {
  const box = $(id);
  const sync = () => box.querySelectorAll<HTMLButtonElement>('button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.v === get())));
  box.querySelectorAll<HTMLButtonElement>('button').forEach(b => (b.onclick = () => { set(b.dataset.v!); sync(); }));
  sync(); uiSyncs.push(sync);
}
seg('seg-src', () => S.pred.source, v => (S.pred.source = v as 'ideal' | 'onboard'));
seg('seg-sens', () => S.sensMode, v => { S.sensMode = v as typeof S.sensMode; S.rt.sensors.mode = S.sensMode; });
seg('seg-detail', () => S.disp.detail, v => (S.disp.detail = v as 'clean' | 'full'));
seg('seg-unit', () => S.disp.unit, v => (S.disp.unit = v as typeof S.disp.unit));
seg('seg-pal', () => S.disp.palette, v => {
  S.disp.palette = v as typeof S.disp.palette;
  if (v === 'auto') document.documentElement.removeAttribute('data-palette'); else document.documentElement.setAttribute('data-palette', v);
  setTimeout(() => { D.readTheme(); drawPosterPlots(); }, 20);
});
const altBox = $('alts');
(['port', 'stbd', 'crash', 'coast'] as Alt[]).forEach(a => {
  const b = document.createElement('button');
  b.textContent = D.ALT_SHORT[a];
  const sync = () => b.setAttribute('aria-pressed', String(S.pred.alts.has(a)));
  b.onclick = () => { S.pred.alts.has(a) ? S.pred.alts.delete(a) : S.pred.alts.add(a); sync(); };
  sync(); uiSyncs.push(sync); altBox.appendChild(b);
});
function syncEnvUI() {
  syncers.forEach(f => f());
  ($('s-gu') as HTMLInputElement).checked = S.env.gusts;
  $('o-ws').textContent = `${S.env.windKn} kn (${(S.env.windKn * KN).toFixed(1)} m/s)`;
  $('o-wd').textContent = `${pad3(S.env.windFrom)}°`;
  $('o-cs').textContent = `${S.env.curKn.toFixed(1)} kn`;
  $('o-cd').textContent = `${pad3(S.env.curSet)}°`;
  $('o-gc').textContent = `${S.pred.count}`;
  $('o-gi').textContent = S.pred.intervalIdx ? `${S.pred.intervalIdx * 10} s` : 'auto (30 / 45 / 60 s by speed)';
  $('o-vec').textContent = `${S.disp.vecMin} min`;
}


function startSheetWork() {
  if (sheetStarted) return;
  sheetStarted = true;
  const w = new TrialsWorker();
  let got = 0;
  w.onmessage = (e: MessageEvent) => {
    const d = e.data;
    if (d.kind === 'poster') renderPoster(d.poster);
    if (d.kind === 'trials') renderTrials(d.deep, d.shallow, d.depth);
    if (d.kind === 'validation') renderValidation(d.v);
    if (++got === 3) w.terminate();
  };
  w.postMessage({ shipId: SHIP.id });
}

// ---------------------------------------------------------------- loop
let last = performance.now(), acc = 0, slowT = 0, drawT = 0, frameEma = 16, slowFor = 0;
// ?capture: no animation loop; a recorder advances time with __azb.tick(ms) and grabs each frame
const CAPTURE = new URLSearchParams(location.search).has('capture');
let capT = 0;
function frame(now: number) {
  if (!CAPTURE) requestAnimationFrame(frame);
  const dtReal = Math.min(0.1, (now - last) / 1000); last = now;
  keyControl(dtReal);
  if (!S.paused) {
    acc += dtReal * SPEEDS[S.speedIdx];
    let n = 0;
    while (acc >= DT && n < 200) { S.rt.step(DT); acc -= DT; n++; }
    if (n >= 200) acc = 0;
  }
  updateAudio(dtReal);
  // sheet open: nothing on the chart is visible, save the battery
  if (!$('sheet').hidden) return;
  // paused: redraw at ~12 fps (pan/zoom still responsive enough)
  drawT -= dtReal;
  if (S.paused && drawT > 0) return;
  drawT = 0.08;
  const t0 = performance.now();
  requestPrediction(now);
  const est = D.shownPose();
  if (S.view.follow) { S.view.cN = est.n; S.view.cE = est.e; }
  S.view.rot += wrap((S.view.headUp ? est.psi : 0) - S.view.rot) * Math.min(1, dtReal * 6);
  D.updateQuayLines(S.paused ? 0 : dtReal * SPEEDS[S.speedIdx]);

  if (S.disp.view !== '3d') {
    D.setWorld();
    D.drawChart();
    D.drawParticles(dtReal);
    D.drawStructures();
    D.drawChartMarks();
    D.drawTrail();
    D.drawPredictions();
    D.drawStaticArc();
    D.drawQuayLines();
    D.drawLines();
    D.drawTugs();
    D.drawShip();
    D.drawOverlay();
  }
  if (v3 && S.disp.view !== '2d') { v3.setTime(timeOfDay()); v3.render(); }
  for (const d of dials) d.draw();
  for (const l of levers) l.draw();
  slowT -= dtReal;
  if (slowT <= 0) { slowT = 0.1; updateHud(); updateLinesPanel(); updateTugsPanel(); }
  // adaptive resolution: if frames run long for 2 s, render at a lower pixel density
  frameEma += (performance.now() - t0 - frameEma) * 0.05;
  slowFor = frameEma > 14 ? slowFor + dtReal : 0;
  if (slowFor > 2) { slowFor = 0; if (D.lowerDpr()) for (const d of [...dials, ...levers]) d.resize(); }
}

// keep the screen on while the ship is moving
let wakeLock: { release(): Promise<void> } | null = null;
async function syncWakeLock() {
  const want = !S.paused && !document.hidden;
  try {
    const wl = (navigator as unknown as { wakeLock?: { request(t: string): Promise<{ release(): Promise<void> }> } }).wakeLock;
    if (want && !wakeLock && wl) wakeLock = await wl.request('screen');
    if (!want && wakeLock) { await wakeLock.release(); wakeLock = null; }
  } catch { wakeLock = null; }
}
setInterval(syncWakeLock, 2000);

function resize() { D.resizeCanvas(); for (const d of [...dials, ...levers]) d.resize(); D.refreshLayout(); layout3d(); placePanels(); }
const ro = new ResizeObserver(() => { D.refreshLayout(); layout3d(); placePanels(); for (const d of [...dials, ...levers]) d.resize(); });
for (const el of [$('hud'), document.querySelector('.tray')!, document.querySelector('.mapbtns')!, $('rpm-0'), $('rpm-1')]) ro.observe(el);
// no long-press menus or text selection on the controls
$('app').addEventListener('contextmenu', e => { if (!(e.target as HTMLElement).closest('.sheet')) e.preventDefault(); });
document.querySelectorAll('details.sec').forEach(d => d.addEventListener('toggle', () => setTimeout(drawPosterPlots, 20)));
addEventListener('orientationchange', () => setTimeout(resize, 250));
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => setTimeout(() => { D.readTheme(); drawPosterPlots(); }, 30));
new MutationObserver(() => setTimeout(() => { D.readTheme(); drawPosterPlots(); }, 30)).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
document.addEventListener('visibilitychange', () => { if (document.hidden) { last = performance.now(); suspendAudio(); } syncWakeLock(); });
addEventListener('resize', resize);
persist('azb-settings',
  () => ({ disp: { ...S.disp }, sens: S.sensMode, pred: { mode: S.pred.mode, count: S.pred.count, intervalIdx: S.pred.intervalIdx, source: S.pred.source, staticArc: S.pred.staticArc, alts: [...S.pred.alts] }, speedIdx: S.speedIdx }),
  v => {
    if (v.disp) Object.assign(S.disp, v.disp);
    if (v.sens) S.sensMode = v.sens;
    if (v.pred) { const { alts, ...rest } = v.pred; Object.assign(S.pred, rest); if (alts) S.pred.alts = new Set(alts); }
    if (typeof v.speedIdx === 'number') S.speedIdx = v.speedIdx;
    if (S.disp.palette !== 'auto') document.documentElement.setAttribute('data-palette', S.disp.palette);
  });
D.readTheme();
resize();
openScenario(SCENARIOS[0]).then(() => {
  uiSyncs.forEach(f => f());
  ($('s-static') as HTMLInputElement).checked = S.pred.staticArc;
  ($('s-truth') as HTMLInputElement).checked = S.disp.truth;
  renderModel(S.rt.model.h);
  syncEnvUI();
  if (!CAPTURE) requestAnimationFrame(t => { last = t; frame(t); }); else last = 0;
  if (S.disp.view !== '2d') set3d(S.disp.view);
});
syncWakeLock();
initApp(() => { last = performance.now(); });
