// Chart rendering: ECDIS-style harbour, own ship at the sensed position, predictions,
// docking aids (quay distance lines), mooring lines, tugs.
import { DEG, KN, SHIP } from '../physics/ship';
import { HULL } from '../physics/contact';
import { nearestStructure } from '../physics/harbour';
import { LINE } from '../physics/mooring';
import type { Alt, Track } from '../physics/predict';
import { S, SPEEDS, full } from './state';

export const C: Record<string, string> = {};
export let podColors = ['#c00', '#0a0'];
export function readTheme() {
  const cs = getComputedStyle(document.documentElement);
  for (const k of ['water', 'water-2', 'grid', 'land', 'land-edge', 'shoal', 'ink', 'muted', 'own', 'hull', 'port', 'stbd', 'predict', 'warn', 'ok', 'rule', 'panel-solid', 'alt-crash', 'alt-coast'])
    C[k] = cs.getPropertyValue('--' + k).trim();
  C.fontNum = cs.getPropertyValue('--font-num');
  C.fontLabel = cs.getPropertyValue('--font-label');
  podColors = [C.port, C.stbd];
}
export const altColor = (a: Alt) => ({ current: C.predict, port: C.port, stbd: C.stbd, crash: C['alt-crash'], coast: C['alt-coast'] })[a];

export const cv = document.getElementById('map') as HTMLCanvasElement;
export const ctx = cv.getContext('2d')!;
export let W = 0, H = 0, DPR = 1;
export let dprCap = 2;
export function lowerDpr() { if (dprCap <= 1) return false; dprCap = Math.max(1, dprCap - 0.5); resizeCanvas(); return true; }
export function resizeCanvas() {
  DPR = Math.min(dprCap, devicePixelRatio || 1);
  W = cv.clientWidth; H = cv.clientHeight;
  cv.width = Math.round(W * DPR); cv.height = Math.round(H * DPR);
}
/** Layout read once per resize (not per frame): reading layout every frame stalls phones. */
export const LAY = { hudBottom: 0, chipsBottom: 0, trayTop: 0, padL: 16, padR: 16, overlayTray: false, split: null as null | 'top' | 'left', splitAt: 0 };
export function refreshLayout() {
  const hud = document.getElementById('hud')!, tray = document.querySelector('.tray') as HTMLElement;
  const chips = document.querySelector('.mapbtns') as HTMLElement;
  LAY.hudBottom = hud.getBoundingClientRect().bottom;
  document.getElementById('app')!.style.setProperty('--hudH', `${LAY.hudBottom}px`);
  document.getElementById('app')!.style.setProperty('--trayH', `${Math.max(0, innerHeight - tray.getBoundingClientRect().top)}px`);
  LAY.chipsBottom = chips.getBoundingClientRect().bottom;
  const tcs = getComputedStyle(tray);
  LAY.overlayTray = tcs.backgroundColor === 'rgba(0, 0, 0, 0)' || tcs.backgroundColor === 'transparent';
  const kids = [...tray.children].map(c => c.getBoundingClientRect().top);
  LAY.trayTop = LAY.overlayTray ? Math.min(...kids) : tray.getBoundingClientRect().top;
  LAY.padL = parseFloat(tcs.paddingLeft); LAY.padR = parseFloat(tcs.paddingRight);
}
export function chartCentre() {
  const bot = LAY.overlayTray ? H : LAY.trayTop;
  if (LAY.split === 'top') return [W / 2, (LAY.splitAt + bot) / 2] as const;
  if (LAY.split === 'left') return [(LAY.splitAt + W) / 2, (LAY.chipsBottom + bot) / 2] as const;
  return [W / 2, (LAY.chipsBottom + bot) / 2] as const;
}
let M = [1, 0, 0, 1, 0, 0];
export function setWorld() {
  const s = S.view.scale, th = S.view.rot, [ox, oy] = chartCentre();
  const a = s * Math.cos(th), c = -s * Math.sin(th), b = -s * Math.sin(th), d = -s * Math.cos(th);
  M = [a, b, c, d, ox - (a * S.view.cE + c * S.view.cN), oy - (b * S.view.cE + d * S.view.cN)];
  ctx.setTransform(M[0] * DPR, M[1] * DPR, M[2] * DPR, M[3] * DPR, M[4] * DPR, M[5] * DPR);
}
export const toScr = (n: number, e: number): [number, number] => [M[0] * e + M[2] * n + M[4], M[1] * e + M[3] * n + M[5]];
export function fromScr(x: number, y: number): [number, number] {
  const det = M[0] * M[3] - M[1] * M[2], dx = x - M[4], dy = y - M[5];
  return [(-M[1] * dx + M[0] * dy) / det, (M[3] * dx - M[2] * dy) / det];
}
const px = (p: number) => p / S.view.scale;
type Pose = { n: number; e: number; psi: number };
export function bodyTransform(p: Pose) {
  const s = Math.sin(p.psi), c = Math.cos(p.psi);
  ctx.transform(s, c, c, -s, p.e, p.n);
}
const bodyToWorld = (p: Pose, x: number, y: number): [number, number] =>
  [p.n + x * Math.cos(p.psi) - y * Math.sin(p.psi), p.e + x * Math.sin(p.psi) + y * Math.cos(p.psi)];

function hullPath() {
  ctx.beginPath();
  HULL.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.closePath();
}
function polyPath(poly: [number, number][]) {
  ctx.beginPath();
  poly.forEach(([n, e], i) => (i ? ctx.lineTo(e, n) : ctx.moveTo(e, n)));
  ctx.closePath();
}
function arrow(x0: number, y0: number, x1: number, y1: number, head: number) {
  const ang = Math.atan2(y1 - y0, x1 - x0);
  ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(x1, y1);
  ctx.lineTo(x1 - head * Math.cos(ang - 0.45), y1 - head * Math.sin(ang - 0.45));
  ctx.lineTo(x1 - head * Math.cos(ang + 0.45), y1 - head * Math.sin(ang + 0.45));
  ctx.closePath(); ctx.fill();
}

/** Pose the captain sees (sensor estimate), or truth in the instructor view. */
export function shownPose(): Pose & { u: number; v: number; r: number } {
  return S.rt.sensors.out.est;
}

// ---------------------------------------------------------------- chart
export function drawChart() {
  ctx.save(); ctx.setTransform(DPR, 0, 0, DPR, 0, 0); ctx.fillStyle = C.water; ctx.fillRect(0, 0, W, H); ctx.restore();
  const [n0, e0] = fromScr(0, 0), [n1, e1] = fromScr(W, H), [n2, e2] = fromScr(W, 0), [n3, e3] = fromScr(0, H);
  const nMin = Math.min(n0, n1, n2, n3), nMax = Math.max(n0, n1, n2, n3), eMin = Math.min(e0, e1, e2, e3), eMax = Math.max(e0, e1, e2, e3);
  // shoal areas (depth areas shallower than the charted base)
  for (const sh of S.sc.shoals) { polyPath(sh.poly); ctx.fillStyle = C.shoal; ctx.fill(); ctx.strokeStyle = C.muted; ctx.lineWidth = px(1); ctx.setLineDash([px(4), px(3)]); ctx.stroke(); ctx.setLineDash([]); }
  const step = S.view.scale > 1.5 ? 50 : S.view.scale > 0.4 ? 100 : 500;
  ctx.strokeStyle = C.grid; ctx.lineWidth = px(1);
  ctx.beginPath();
  for (let n = Math.floor(nMin / step) * step; n <= nMax; n += step) { ctx.moveTo(eMin, n); ctx.lineTo(eMax, n); }
  for (let e = Math.floor(eMin / step) * step; e <= eMax; e += step) { ctx.moveTo(e, nMin); ctx.lineTo(e, nMax); }
  ctx.stroke();
}

export function drawStructures() {
  const rt = S.rt;
  for (const o of S.sc.obstacles) {
    polyPath(o.poly); ctx.fillStyle = C.land; ctx.fill();
    ctx.strokeStyle = C['land-edge']; ctx.lineWidth = px(1.5); ctx.stroke();
  }
  // fender units at their live compression
  const defl = new Map<number, number>();
  for (const f of rt.ci.fenders) defl.set(f.i, Math.max(defl.get(f.i) ?? 0, f.defl));
  S.sc.fenders.forEach((f, i) => {
    const d = Math.min(defl.get(i) ?? 0, f.height), over = d > f.dRated * f.height;
    const tN = -f.ne, tE = f.nn, hw = f.width / 2;
    const fn = f.n - f.nn * d, fe = f.e - f.ne * d, bn = f.n - f.nn * f.height, be = f.e - f.ne * f.height;
    ctx.beginPath();
    ctx.moveTo(fe + tE * hw, fn + tN * hw); ctx.lineTo(fe - tE * hw, fn - tN * hw);
    ctx.lineTo(be - tE * hw * 0.6, bn - tN * hw * 0.6); ctx.lineTo(be + tE * hw * 0.6, bn + tN * hw * 0.6);
    ctx.closePath(); ctx.fillStyle = over ? C.warn : d > 0 ? C.own : C.ink; ctx.fill();
  });
  ctx.strokeStyle = C['land-edge']; ctx.lineWidth = px(1.2);
  for (const [n, e] of S.sc.bollards) { ctx.beginPath(); ctx.arc(e, n, 0.9, 0, Math.PI * 2); ctx.stroke(); }
  if (S.sc.berth) {
    ctx.save(); bodyTransform({ ...S.sc.berth, psi: S.sc.berth.psi * DEG });
    hullPath(); ctx.setLineDash([px(6), px(5)]); ctx.strokeStyle = C.muted; ctx.lineWidth = px(1.3); ctx.stroke(); ctx.setLineDash([]);
    ctx.beginPath(); ctx.moveTo(-6, 0); ctx.lineTo(6, 0); ctx.moveTo(0, -6); ctx.lineTo(0, 6); ctx.stroke();
    ctx.restore();
  }
}

// ---------------------------------------------------------------- current streaks
type Part = { n: number; e: number; age: number };
let parts: Part[] = [];
const COARSE = matchMedia('(pointer: coarse)').matches;
export function initParticles() { parts = []; for (let i = 0; i < (COARSE ? 130 : 240); i++) parts.push(spawn(Math.random() * 6)); }
function spawn(age = 0): Part { const [n, e] = fromScr(Math.random() * W, Math.random() * H); return { n, e, age }; }
export function drawParticles(dtReal: number) {
  const k = dtReal * SPEEDS[S.speedIdx] * (S.paused ? 0 : 1) * 6;
  ctx.strokeStyle = C.muted; ctx.lineWidth = px(1); ctx.globalAlpha = full() ? 0.5 : 0.28;
  ctx.beginPath();
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i];
    const [cN, cE] = S.rt.env.current(p.n, p.e), sp = Math.hypot(cN, cE);
    p.age += dtReal;
    if (sp < 0.02 || p.age > 6) { parts[i] = spawn(); continue; }
    const len = 6 + sp * 14;
    ctx.moveTo(p.e, p.n); ctx.lineTo(p.e - cE / sp * len, p.n - cN / sp * len);
    p.n += cN * k; p.e += cE * k;
    const [x, y] = toScr(p.n, p.e);
    if (x < -20 || y < -20 || x > W + 20 || y > H + 20) parts[i] = spawn();
  }
  ctx.stroke(); ctx.globalAlpha = 1;
}

export function drawTrail() {
  const tr = S.rt.trail; if (tr.length < 2) return;
  ctx.strokeStyle = C.muted; ctx.lineWidth = px(1.2); ctx.setLineDash([px(2), px(5)]);
  ctx.beginPath(); tr.forEach(([n, e], i) => (i ? ctx.lineTo(e, n) : ctx.moveTo(e, n)));
  ctx.stroke(); ctx.setLineDash([]);
}

// ---------------------------------------------------------------- predictions
const REF = () => {
  const xb = SHIP.L / 2 + 4 - SHIP.xg, xs = -SHIP.L / 2 - 1 - SHIP.xg, h = SHIP.B / 2;
  return [[xb, 0, 1.6], [xs, 0, 1.6], [-SHIP.xg, -h, 0.9], [-SHIP.xg, h, 0.9]] as [number, number, number][];
};
export const ghostLabels: { n: number; e: number; text: string; color: string }[] = [];

export function drawPredictions() {
  ghostLabels.length = 0;
  if (S.pred.mode === 0) return;
  const tracks = S.pred.tracks;
  const cur = tracks.find(t => t.alt === 'current');
  // what-if fan: CG track + end ghost + outcome marker
  if (S.pred.mode === 2) for (const t of tracks) {
    if (t.alt === 'current' || !S.pred.alts.has(t.alt) || t.poses.length < 2) continue;
    const col = altColor(t.alt);
    ctx.strokeStyle = col; ctx.lineWidth = px(1.6); ctx.setLineDash([px(7), px(4)]); ctx.globalAlpha = 0.85;
    ctx.beginPath(); t.poses.forEach((p, i) => (i ? ctx.lineTo(p.e, p.n) : ctx.moveTo(p.e, p.n))); ctx.stroke();
    ctx.setLineDash([]);
    const end = t.poses[t.poses.length - 1];
    ctx.save(); bodyTransform(end); hullPath(); ctx.lineWidth = px(1.2); ctx.globalAlpha = 0.6; ctx.stroke(); ctx.restore();
    ctx.globalAlpha = 1;
    if (t.stopT !== null) {
      const p = t.poses[Math.min(t.poses.length - 1, Math.round(t.stopT))];
      ctx.fillStyle = col; ctx.beginPath(); ctx.arc(p.e, p.n, px(4), 0, Math.PI * 2); ctx.fill();
    }
  }
  if (!cur || cur.poses.length < 2) return;
  // current settings: tracks from bow, stern and both shoulders
  ctx.strokeStyle = C.predict;
  for (const [x, y, w] of REF().filter(r => full() || r[1] === 0)) {
    ctx.lineWidth = px(w); ctx.globalAlpha = w > 1 ? 0.95 : 0.55;
    ctx.beginPath();
    cur.poses.forEach((p, i) => { const [n, e] = bodyToWorld(p, x, y); i ? ctx.lineTo(e, n) : ctx.moveTo(e, n); });
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  // time-stepped ghost hulls
  const iv = S.pred.interval;
  for (let k = 1; k <= S.pred.count; k++) {
    const t = k * iv;
    if (t >= cur.poses.length) break;
    const p = cur.poses[t];
    ctx.save(); bodyTransform(p); hullPath();
    ctx.lineWidth = px(k === 1 ? 1.6 : 1.2); ctx.globalAlpha = 1 - (k - 1) * 0.13; ctx.stroke(); ctx.restore();
    if (full()) ghostLabels.push({ n: p.n, e: p.e, text: `+${t} s`, color: C.predict });
  }
  ctx.globalAlpha = 1;
  const stopAt = cur.contactT ?? cur.groundT;
  if (stopAt !== null) {
    const p = cur.poses[cur.poses.length - 1];
    ctx.save(); bodyTransform(p); hullPath(); ctx.strokeStyle = C.warn; ctx.lineWidth = px(2); ctx.setLineDash([px(5), px(3)]); ctx.stroke(); ctx.restore();
    ghostLabels.push({ n: p.n, e: p.e, text: `${cur.contactT !== null ? 'CONTACT' : 'AGROUND'} ${stopAt.toFixed(0)} s`, color: C.warn });
  }
}

/** Static prediction: today's SOG and ROT held constant → circular arc (the classic ECDIS/PPU predictor). */
export function drawStaticArc() {
  if (!S.pred.staticArc || S.pred.mode === 0) return;
  const r = S.rt.sensors.out, est = r.est;
  const [bn, be] = bodyToWorld(est, SHIP.bridgeX, 0);
  let n = bn, e = be, cog = r.cog;
  ctx.strokeStyle = C.predict; ctx.lineWidth = px(1.4); ctx.setLineDash([px(1.5), px(4)]);
  ctx.beginPath(); ctx.moveTo(e, n);
  for (let t = 0; t < S.pred.horizon; t += 2) { n += r.sog * Math.cos(cog) * 2; e += r.sog * Math.sin(cog) * 2; cog += r.rot * 2; ctx.lineTo(e, n); }
  ctx.stroke(); ctx.setLineDash([]);
  ghostLabels.push({ n, e, text: 'ROT arc', color: C.predict });
}

// ---------------------------------------------------------------- lines, tugs, ship
export function drawLines() {
  const rt = S.rt, est = shownPose();
  for (const l of rt.lines) {
    if (l.state !== 'fast') continue;
    const [fn, fe] = bodyToWorld(est, l.fair[0], l.fair[1]), [bn, be] = S.sc.bollards[l.bollard];
    const k = l.T / LINE.MBL;
    ctx.strokeStyle = k > 0.8 ? C.warn : k > 0.3 ? C.own : C.ink;
    ctx.lineWidth = px(k > 0.01 ? 1.8 : 1.2);
    ctx.setLineDash(k > 0.005 ? [] : [px(3), px(3)]);
    ctx.beginPath(); ctx.moveTo(fe, fn); ctx.lineTo(be, bn); ctx.stroke(); ctx.setLineDash([]);
  }
}

export function drawTugs() {
  const rt = S.rt, est = shownPose();
  for (const t of rt.tugs) {
    const pushing = t.F * t.side < -1e3, pulling = t.F * t.side > 1e3;
    const off = pulling ? 45 : SHIP.B / 2 + 6;
    ctx.save(); bodyTransform(est); ctx.translate(t.x, t.side * off);
    if (pulling) { ctx.strokeStyle = C.ink; ctx.lineWidth = px(1); ctx.beginPath(); ctx.moveTo(0, -t.side * 6); ctx.lineTo(0, -t.side * (off - SHIP.B / 2)); ctx.stroke(); }
    ctx.rotate(t.side > 0 ? Math.PI / 2 : -Math.PI / 2); // tug's bow toward the ship
    if (pulling) ctx.rotate(Math.PI);
    ctx.beginPath(); ctx.moveTo(14, 0); ctx.lineTo(6, 5); ctx.lineTo(-14, 5); ctx.lineTo(-14, -5); ctx.lineTo(6, -5); ctx.closePath();
    ctx.fillStyle = C.hull; ctx.fill(); ctx.strokeStyle = t.repos > 0 ? C.muted : C.ink; ctx.lineWidth = px(1.4); ctx.stroke();
    ctx.restore();
    if (Math.abs(t.F) > 5e3) {
      ctx.save(); bodyTransform(est);
      ctx.strokeStyle = ctx.fillStyle = C.ink; ctx.lineWidth = px(2);
      const Fs = SHIP.L * 0.25 / t.Fmax, y0 = -Math.sign(t.F) * (SHIP.B / 2 + 2);
      arrow(t.x, y0, t.x, y0 + t.F * Fs, Math.max(4, px(9)));
      void pushing;
      ctx.restore();
    }
  }
}

export function drawShip() {
  const rt = S.rt, bd = rt.bd, st = rt.state, est = shownPose();
  if (S.disp.truth) { ctx.save(); bodyTransform(st); hullPath(); ctx.strokeStyle = C.muted; ctx.lineWidth = px(1); ctx.setLineDash([px(2), px(2)]); ctx.stroke(); ctx.restore(); }
  ctx.save(); bodyTransform(est);
  hullPath(); ctx.fillStyle = C.hull; ctx.fill(); ctx.strokeStyle = C.own; ctx.lineWidth = px(2); ctx.stroke();
  { const d0 = SHIP.look.decks[0], hw = SHIP.B / 2 - d0.inset - 1.5; ctx.fillStyle = C.own; ctx.globalAlpha = 0.16; ctx.fillRect(d0.x0 * 0.85, -hw * 0.75, (d0.x1 - d0.x0) * 0.85, hw * 1.5); ctx.globalAlpha = 1; }
  ctx.strokeStyle = C.own; ctx.lineWidth = px(1);
  ctx.strokeRect(SHIP.bridgeX - 4, -SHIP.B / 2 + 0.5, 8, SHIP.B - 1);            // bridge / conning position
  ctx.beginPath(); ctx.arc(SHIP.bridgeX, 0, px(3), 0, Math.PI * 2); ctx.stroke(); // CCRP
  ctx.beginPath(); ctx.moveTo(-SHIP.L / 2 - SHIP.xg, 0); ctx.lineTo(SHIP.L / 2 + 4 - SHIP.xg, 0);
  ctx.setLineDash([px(4), px(4)]); ctx.stroke(); ctx.setLineDash([]);
  // fairleads
  if (full()) for (const l of rt.lines) { ctx.fillStyle = C.muted; ctx.fillRect(l.fair[0] - 0.8, l.fair[1] - 0.8, 1.6, 1.6); }
  const btx = SHIP.bowThruster.x;
  ctx.strokeStyle = C.muted; ctx.strokeRect(btx - 1.5, -7, 3, 14);
  const Fs = 32 / 400e3;
  if (full() && Math.abs(bd.bt.Y) > 2e3) {
    ctx.strokeStyle = ctx.fillStyle = C.own; ctx.lineWidth = px(2.4);
    const y0 = Math.sign(bd.bt.Y) * 11; arrow(btx, y0, btx, y0 + bd.bt.Y * Fs, Math.max(4, px(9)));
  }
  SHIP.pods.forEach((p, i) => {
    const ps = st.pods[i], b = bd.pods[i];
    ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(ps.alpha + p.alphaOffset);
    const T = b.T, wl = Math.min(90, Math.abs(T) / 400e3 * 60);
    if (wl > 2) {
      const sg = T >= 0 ? -1 : 1;
      ctx.fillStyle = podColors[i]; ctx.globalAlpha = 0.16;
      ctx.beginPath(); ctx.moveTo(sg * 3, -2.2); ctx.lineTo(sg * (3 + wl), -2.2 - wl * 0.18); ctx.lineTo(sg * (3 + wl), 2.2 + wl * 0.18); ctx.lineTo(sg * 3, 2.2); ctx.closePath(); ctx.fill();
      ctx.globalAlpha = 1;
    }
    ctx.fillStyle = podColors[i];
    ctx.beginPath(); ctx.ellipse(0, 0, 4.2, 1.7, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillRect(3.4, -2.6, 0.8, 5.2);
    ctx.restore();
    if (full() && Math.hypot(b.X, b.Y) > 5e3) { ctx.strokeStyle = ctx.fillStyle = podColors[i]; ctx.lineWidth = px(2.4); arrow(p.x, p.y, p.x + b.X * Fs, p.y + b.Y * Fs, Math.max(4, px(9))); }
  });
  if (full() && Math.hypot(bd.wind.X, bd.wind.Y) > 8e3) {
    ctx.strokeStyle = ctx.fillStyle = C.muted; ctx.lineWidth = px(1.6);
    arrow(SHIP.windage.xw, 0, SHIP.windage.xw + bd.wind.X * Fs, bd.wind.Y * Fs, Math.max(3, px(8)));
  }
  ctx.restore();
  // wash striking a wall
  ctx.strokeStyle = C.own; ctx.lineWidth = px(1.2);
  if (full()) for (const h of rt.wash.hits) { ctx.globalAlpha = Math.min(0.9, h.f / 60e3); ctx.beginPath(); ctx.arc(h.e, h.n, 4 + h.f / 20e3, 0, Math.PI * 2); ctx.stroke(); }
  ctx.globalAlpha = 1;
  if (rt.ci.active) { ctx.fillStyle = C.warn; for (const p of rt.ci.points) { ctx.beginPath(); ctx.arc(p.e, p.n, px(5), 0, Math.PI * 2); ctx.fill(); } }
  // heading line and speed vector from the CCRP (ECDIS convention)
  const r = rt.sensors.out;
  const [cn, ce] = bodyToWorld(est, SHIP.bridgeX, 0);
  ctx.strokeStyle = C.ink; ctx.lineWidth = px(1);
  ctx.beginPath(); ctx.moveTo(ce, cn); ctx.lineTo(ce + Math.sin(est.psi) * SHIP.L * 1.5, cn + Math.cos(est.psi) * SHIP.L * 1.5); ctx.stroke();
  if (r.sog > 0.05) {
    const T = S.disp.vecMin * 60;
    ctx.strokeStyle = ctx.fillStyle = C.ink; ctx.lineWidth = px(2);
    arrow(ce, cn, ce + Math.sin(r.cog) * r.sog * T, cn + Math.cos(r.cog) * r.sog * T, px(9));
  }
}

/** Distance from bow and stern shoulders to the nearest structure, with closing speed. */
export function updateQuayLines(dt: number) {
  const est = shownPose();
  const refs = [SHIP.L * 0.35 - SHIP.xg, -SHIP.L * 0.4 - SHIP.xg];
  refs.forEach((x, k) => {
    let best: { d: number; n: number; e: number; pn: number; pe: number } | null = null;
    for (const side of [-1, 1]) {
      const [pn, pe] = bodyToWorld(est, x, side * SHIP.B / 2);
      const r = nearestStructure(pn, pe, S.sc.obstacles, 300);
      if (!r) continue;
      let d = r[2];
      const fendered = S.sc.obstacles.some(o => o.kind === 'fendered' && o.bbox && r[0] >= o.bbox[0] - 0.1 && r[0] <= o.bbox[2] + 0.1 && r[1] >= o.bbox[1] - 0.1 && r[1] <= o.bbox[3] + 0.1);
      if (fendered) d -= S.sc.fenders[0]?.height ?? 1.0; // to the fender face
      if (!best || d < best.d) best = { d, n: r[0], e: r[1], pn, pe };
    }
    const q = S.quay[k];
    if (!best) { q.d = Infinity; return; }
    if (isFinite(q.d) && dt > 0) { const raw = (best.d - q.d) / dt; q.rate += (raw - q.rate) * Math.min(1, dt / 1.5); }
    else q.rate = 0;
    Object.assign(q, best);
  });
}
export function drawQuayLines() {
  for (const q of S.quay) {
    if (!isFinite(q.d) || q.d > (full() ? 250 : 60)) continue;
    ctx.strokeStyle = C.ink; ctx.lineWidth = px(1); ctx.setLineDash([px(3), px(3)]);
    ctx.beginPath(); ctx.moveTo(q.pe, q.pn); ctx.lineTo(q.e, q.n); ctx.stroke(); ctx.setLineDash([]);
  }
}

// ---------------------------------------------------------------- screen overlay
export function latFmt(v: number) {
  const u = S.disp.unit;
  return u === 'cm' ? (Math.abs(v) * 100).toFixed(0) : u === 'kn' ? (Math.abs(v) / KN).toFixed(2) : Math.abs(v).toFixed(2);
}
export const latUnit = () => ({ cm: 'cm/s', ms: 'm/s', kn: 'kn' })[S.disp.unit];

export function drawOverlay() {
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  const est = shownPose();
  ctx.font = `500 11px ${C.fontNum}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const tag = (x: number, y: number, txt: string, col: string) => {
    const w = ctx.measureText(txt).width + 8;
    ctx.fillStyle = C['panel-solid']; ctx.globalAlpha = 0.85; ctx.fillRect(x - w / 2, y - 8, w, 16); ctx.globalAlpha = 1;
    ctx.fillStyle = col; ctx.fillText(txt, x, y);
  };
  // forward and aft side speed: the two numbers a docking officer watches
  for (const [x, lab] of [[SHIP.L * 0.42 - SHIP.xg, 'FWD'], [-SHIP.L * 0.42 - SHIP.xg, 'AFT']] as [number, string][]) {
    const lat = est.v + est.r * x;
    const moving = Math.abs(lat) > 0.005, side = lat >= 0 ? 1 : -1;
    const [ax, ay] = toScr(...bodyToWorld(est, x, side * SHIP.B / 2));
    const [bx, by] = toScr(...bodyToWorld(est, x, side * (SHIP.B / 2 + 1)));
    const ux = (bx - ax) / (Math.hypot(bx - ax, by - ay) || 1), uy = (by - ay) / (Math.hypot(bx - ax, by - ay) || 1);
    const col = !moving ? C.ink : lat < 0 ? C.port : C.stbd;
    const len = moving ? Math.min(64, 14 + Math.abs(lat) * 160) : 0;
    const x0 = ax + ux * 6, y0 = ay + uy * 6, x1 = x0 + ux * len, y1 = y0 + uy * len;
    if (moving) {
      ctx.strokeStyle = ctx.fillStyle = col; ctx.lineWidth = 4; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
      const ang = Math.atan2(uy, ux);
      ctx.beginPath(); ctx.moveTo(x1 + ux * 6, y1 + uy * 6);
      ctx.lineTo(x1 - 8 * Math.cos(ang - 0.6), y1 - 8 * Math.sin(ang - 0.6)); ctx.lineTo(x1 - 8 * Math.cos(ang + 0.6), y1 - 8 * Math.sin(ang + 0.6));
      ctx.closePath(); ctx.fill(); ctx.lineCap = 'butt';
    }
    ctx.font = `600 14px ${C.fontNum}`;
    const txt = `${lab} ${latFmt(lat)}`, tw = ctx.measureText(txt).width + 10;
    const lx = x1 + ux * (tw / 2 + 10), ly = y1 + uy * 16;
    ctx.fillStyle = C['panel-solid']; ctx.globalAlpha = 0.9; ctx.fillRect(lx - tw / 2, ly - 10, tw, 20); ctx.globalAlpha = 1;
    ctx.fillStyle = col; ctx.fillText(txt, lx, ly);
  }
  ctx.font = `500 11px ${C.fontNum}`;
  const placed: [number, number][] = [];
  for (const g of ghostLabels) {
    const [x, y] = toScr(g.n, g.e);
    if (placed.some(([px2, py2]) => Math.abs(px2 - x) < 50 && Math.abs(py2 - y) < 18)) continue; // keep labels legible when ghosts bunch up
    placed.push([x, y]); tag(x, y, g.text, g.color);
  }
  // quay distances
  for (const [k, q] of S.quay.entries()) {
    if (!isFinite(q.d) || q.d > (full() ? 250 : 60)) continue;  // clean: only once you are close in
    const [x0, y0] = toScr(q.pn, q.pe), [x1, y1] = toScr(q.n, q.e);
    const closing = q.rate < -0.005;
    const txt = full() ? `${k ? 'AFT' : 'FWD'} ${q.d.toFixed(1)} m ${closing ? '▾' : q.rate > 0.005 ? '▴' : ''}${latFmt(q.rate)}` : `${q.d.toFixed(1)} m`;
    tag((x0 + x1) / 2, (y0 + y1) / 2, txt, closing && q.d < 15 && -q.rate > 0.15 ? C.warn : C.muted);
  }
  // shoal soundings
  ctx.font = `italic 500 12px ${C.fontNum}`;
  for (const sh of S.sc.shoals) {
    if (!sh.label) continue;
    const cn = sh.poly.reduce((a, p) => a + p[0], 0) / sh.poly.length, ce = sh.poly.reduce((a, p) => a + p[1], 0) / sh.poly.length;
    const [x, y] = toScr(cn, ce); ctx.fillStyle = C.ink; ctx.fillText(sh.label, x, y);
  }
  // scale bar + north arrow
  const trayTop = LAY.trayTop;
  const target = 110 / S.view.scale;
  const nice = [10, 20, 25, 50, 100, 200, 250, 500, 1000].find(v => v >= target * 0.6) ?? 1000;
  const L = nice * S.view.scale, x0 = LAY.split === 'left' ? LAY.splitAt + 12 : LAY.padL, y0 = trayTop - 14;
  ctx.font = `500 11px ${C.fontNum}`;
  ctx.strokeStyle = ctx.fillStyle = C.ink; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(x0, y0 - 4); ctx.lineTo(x0, y0); ctx.lineTo(x0 + L, y0); ctx.lineTo(x0 + L, y0 - 4); ctx.stroke();
  ctx.textAlign = 'left'; ctx.textBaseline = 'bottom';
  ctx.fillText(`${nice} m`, x0 + 4, y0 - 4);
  ctx.fillText(`${(nice / SHIP.L).toFixed(2)} L`, x0 + L + 6, y0 + 2);
  const nx = W - 14 - LAY.padR, ny = trayTop - 30;
  ctx.save(); ctx.translate(nx, ny); ctx.rotate(-S.view.rot);
  ctx.beginPath(); ctx.moveTo(0, -12); ctx.lineTo(5, 7); ctx.lineTo(0, 3); ctx.lineTo(-5, 7); ctx.closePath(); ctx.fill();
  ctx.restore();
  ctx.textAlign = 'center'; ctx.textBaseline = 'top'; ctx.fillText('N', nx, ny + 10);
}

export const ALT_SHORT: Record<Alt, string> = { current: 'AS SET', port: 'TURN PORT', stbd: 'TURN STBD', crash: 'CRASH STOP', coast: 'STOP RPM' };
export function trackOutcome(t: Track): { text: string; bad: boolean } {
  if (t.contactT !== null) return { text: `contact in ${t.contactT.toFixed(0)} s`, bad: true };
  if (t.groundT !== null) return { text: `aground in ${t.groundT.toFixed(0)} s`, bad: true };
  if (t.stopT !== null) return { text: `stops ${(t.stopDist / SHIP.L).toFixed(1)} L · ${t.stopT.toFixed(0)} s`, bad: false };
  const p = t.poses[t.poses.length - 1];
  return { text: `clear · ${(Math.hypot(p.u, p.v) / KN).toFixed(1)} kn at ${p.t.toFixed(0)} s`, bad: false };
}
