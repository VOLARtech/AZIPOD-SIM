// Control stations for ships that are not twin-Azipod: engine telegraph, CPP pitch levers,
// helm with rudder angle indicator, shaft gauges, thrusters. Every control follows the same
// rule as the Azipod levers: the handle is the order, the ink needle or bar is what the
// machinery is actually doing, dashed or hatched marks are limits.
import { DEG, SHIP, ShipSpec } from '../physics/ship';
import type { PodSpec } from '../physics/ship';
import { S } from './state';
import * as D from './draw';
import { uiTick } from './audio';

export interface Station {
  root: HTMLElement;
  draw(): void;
  update(): void;
  keys(keys: Set<string>, dt: number): void;
  keydown(k: string): boolean;
  resize(): void;
  zero(): void;
}

const shafts = () => SHIP.pods.map((p, i) => [p, i] as [PodSpec, number]).filter(([p]) => p.kind === 'shaft');
const sideCol = (p: PodSpec) => (p.y < -0.5 ? D.C.port : p.y > 0.5 ? D.C.stbd : D.C.ink);
const sideTag = (p: PodSpec) => (p.y < -0.5 ? 'PORT' : p.y > 0.5 ? 'STBD' : '');

abstract class Canvas {
  c: HTMLCanvasElement; g: CanvasRenderingContext2D; w = 0; h = 0;
  constructor(cls: string, label: string) {
    this.c = document.createElement('canvas'); this.c.className = cls; this.c.setAttribute('aria-label', label);
    this.g = this.c.getContext('2d')!;
  }
  resize() { this.w = this.c.clientWidth; this.h = this.c.clientHeight; this.c.width = Math.round(this.w * D.DPR); this.c.height = Math.round(this.h * D.DPR); }
  begin() { const g = this.g; g.setTransform(D.DPR, 0, 0, D.DPR, 0, 0); g.clearRect(0, 0, this.w, this.h); return g; }
  font(px: number, w = 600) { this.g.font = `${w} ${px}px ${D.C.fontLabel}`; }
  num(px: number) { this.g.font = `500 ${px}px ${D.C.fontNum}`; }
  abstract draw(): void;
}

// ---------------------------------------------------------------- engine telegraph
const AHEAD_NAMES = ['DEAD SLOW', 'SLOW', 'HALF', 'FULL', 'NAV FULL'];
const ASTERN_NAMES = ['DEAD SLOW', 'SLOW', 'HALF', 'FULL', 'EMERG'];
class Telegraph extends Canvas {
  steps: { v: number; name: string }[];
  constructor(public units: number[], tel: { ahead: number[]; astern: number[] }) {
    super('tel', 'Engine telegraph: ahead up, astern down');
    const a = tel.ahead.map((v, k) => ({ v, name: AHEAD_NAMES[k + AHEAD_NAMES.length - tel.ahead.length] ?? `AH ${k + 1}` }));
    const s = tel.astern.map((v, k) => ({ v: -v, name: ASTERN_NAMES[k] ?? `AS ${k + 1}` }));
    this.steps = [...a.reverse(), { v: 0, name: 'STOP' }, ...s];
    const ptr = (e: PointerEvent) => this.pick(e);
    this.c.addEventListener('pointerdown', e => { this.c.setPointerCapture(e.pointerId); ptr(e); });
    this.c.addEventListener('pointermove', e => { if (this.c.hasPointerCapture(e.pointerId)) ptr(e); });
  }
  get top() { return 14; }
  get bot() { return this.h - 14; }
  y(k: number) { return this.top + k * (this.bot - this.top) / (this.steps.length - 1); }
  index(v: number) { let b = 0; this.steps.forEach((s, k) => { if (Math.abs(s.v - v) < Math.abs(this.steps[b].v - v)) b = k; }); return b; }
  pick(e: PointerEvent) {
    const r = this.c.getBoundingClientRect(), y = e.clientY - r.top;
    const k = Math.max(0, Math.min(this.steps.length - 1, Math.round((y - this.top) / ((this.bot - this.top) / (this.steps.length - 1)))));
    this.set(k);
  }
  set(k: number) {
    const v = this.steps[k].v;
    if (this.index(S.cmd.pods[this.units[0]].rpm) !== k) uiTick(v === 0 ? 'detent' : 'step');
    for (const i of this.units) S.cmd.pods[i].rpm = v;
  }
  step(d: number) { this.set(Math.max(0, Math.min(this.steps.length - 1, this.index(S.cmd.pods[this.units[0]].rpm) + d))); }
  draw() {
    if (this.h < 60) return;
    const g = this.begin(), x = 26, i0 = this.units[0];
    const order = this.index(S.cmd.pods[i0].rpm);
    const eng = S.rt.state.pods[i0].eng, rpm = S.rt.state.pods[i0].rpm;
    const answer = !eng || eng.mode === 'stop' || eng.mode === 'wait' ? this.index(0) : this.index(rpm);
    const stop = this.index(0);
    g.fillStyle = D.C['panel-solid']; g.strokeStyle = D.C.rule; g.lineWidth = 1;
    g.beginPath(); g.roundRect(x - 6, this.top - 8, 12, this.bot - this.top + 16, 6); g.fill(); g.stroke();
    g.fillStyle = D.C.rule; g.fillRect(x - 2, this.y(stop), 4, this.bot - this.y(stop));          // astern half of the slot
    const fs = Math.max(9, Math.min(12, (this.bot - this.top) / this.steps.length * 0.8));
    this.steps.forEach((s, k) => {
      const yy = Math.round(this.y(k)) + 0.5, on = k === order, isStop = k === stop;
      g.strokeStyle = isStop ? D.C.ink : D.C.muted; g.lineWidth = isStop ? 1.6 : 1;
      g.beginPath(); g.moveTo(x + 9, yy); g.lineTo(x + (isStop ? 19 : 14), yy); g.stroke();
      this.font(on ? fs + 1 : fs, on ? 700 : 600); g.textBaseline = 'middle'; g.textAlign = 'left';
      g.fillStyle = on ? D.C.ink : s.v < 0 ? D.C.muted : D.C.muted;
      g.fillText(s.name, x + 23, yy);
    });
    this.font(9); g.fillStyle = D.C.muted; g.textAlign = 'center'; g.textBaseline = 'top'; g.fillText('AH', x, 0);
    g.textBaseline = 'bottom'; g.fillText('AS', x, this.h);
    // answer-back: where the engine actually is
    const ya = this.y(answer);
    g.fillStyle = D.C.ink; g.beginPath(); g.moveTo(x - 9, ya); g.lineTo(x - 18, ya - 6); g.lineTo(x - 18, ya + 6); g.closePath(); g.fill();
    // order handle
    const yo = this.y(order);
    g.fillStyle = D.C['panel-solid']; g.strokeStyle = S.cmd.pods[i0].rpm < 0 ? D.C.warn : D.C.own; g.lineWidth = 2.5;
    g.beginPath(); g.roundRect(x - 13, yo - 8, 26, 16, 3); g.fill(); g.stroke();
    g.beginPath(); g.moveTo(x - 7, yo); g.lineTo(x + 7, yo); g.lineWidth = 2; g.stroke();
  }
}

// ---------------------------------------------------------------- CPP pitch lever
/** Combinator: shaft speed scheduled with pitch (economy); off = constant speed for the shaft generators. */
let combinator = false;
const combinatorRpm = (pitch: number) => (combinator ? 0.72 + 0.28 * Math.min(1, Math.abs(pitch)) : 1);
/** Vertical lever: CPP pitch (shaft at constant speed) or, for electric drive, shaft rpm through zero. */
class PitchLever extends Canvas {
  constructor(public units: number[], public astern: number, public mode: 'pitch' | 'rpm' = 'pitch') {
    super('lev', mode === 'pitch' ? 'Pitch lever: ahead up, astern down' : 'Propulsion lever: ahead up, astern down');
    const ptr = (e: PointerEvent) => {
      const r = this.c.getBoundingClientRect(), H = r.height - 28;
      let v = (r.height / 2 - (e.clientY - r.top)) / (H / 2);
      v = Math.max(-this.astern, Math.min(1, v)); if (Math.abs(v) < 0.04) v = 0; v = Math.round(v * 100) / 100;
      const old = this.get();
      if (v === 0 && old !== 0) uiTick('detent'); else if (Math.floor(v * 10) !== Math.floor(old * 10)) uiTick('step');
      this.set(v);
    };
    this.c.addEventListener('pointerdown', e => { this.c.setPointerCapture(e.pointerId); ptr(e); });
    this.c.addEventListener('pointermove', e => { if (this.c.hasPointerCapture(e.pointerId)) ptr(e); });
  }
  get() { const c = S.cmd.pods[this.units[0]]; return this.mode === 'pitch' ? c.pitch ?? 0 : c.rpm; }
  set(v: number) { for (const i of this.units) { const c = S.cmd.pods[i]; if (this.mode === 'pitch') { c.pitch = v; c.rpm = combinatorRpm(v); } else c.rpm = v; } }
  y(v: number) { return 14 + (this.h - 28) / 2 * (1 - v); }
  draw() {
    if (this.h < 60) return;
    const g = this.begin(), x = this.w / 2 - 6, i = this.units[0], ps = S.rt.state.pods[i];
    const col = sideCol(SHIP.pods[i]);
    g.fillStyle = D.C.rule; g.fillRect(x - 3, this.y(1), 6, this.y(-1) - this.y(1));
    for (let k = -10; k <= 10; k += 2) {
      const yy = Math.round(this.y(k / 10)) + 0.5, big = k === 0;
      g.strokeStyle = big ? D.C.ink : D.C.muted; g.lineWidth = big ? 1.5 : 1;
      g.beginPath(); g.moveTo(x + 7, yy); g.lineTo(x + (big ? 16 : 12), yy); g.stroke();
    }
    this.font(9); g.fillStyle = D.C.muted; g.textAlign = 'left'; g.textBaseline = 'middle';
    for (const [v, t] of [[1, '100'], [0.5, '50'], [-0.5, '50'], [-1, '100']] as [number, string][]) g.fillText(t, x + 19, this.y(v));
    g.textAlign = 'center'; g.textBaseline = 'top'; g.fillText('AH', x, 0); g.textBaseline = 'bottom'; g.fillText('AS', x, this.h);
    // astern pitch limit and power-management cap
    g.strokeStyle = D.C.warn; g.setLineDash([3, 2]); g.lineWidth = 1.5;
    for (const v of [-this.astern, S.rt.status.rpmLimit[i] < 0.999 ? S.rt.status.rpmLimit[i] : NaN]) if (isFinite(v) && v > -1) { const yy = this.y(v); g.beginPath(); g.moveTo(x - 10, yy); g.lineTo(x + 10, yy); g.stroke(); }
    g.setLineDash([]);
    const a = this.mode === 'pitch' ? ps.pitch ?? 0 : ps.rpm, y0 = this.y(0);
    g.fillStyle = col; g.globalAlpha = 0.85; g.fillRect(x - 3, Math.min(y0, this.y(a)), 6, Math.abs(this.y(a) - y0)); g.globalAlpha = 1;
    const o = this.get(), yo = this.y(o);
    g.fillStyle = D.C['panel-solid']; g.strokeStyle = o < 0 ? D.C.warn : D.C.own; g.lineWidth = 2.5;
    g.beginPath(); g.roundRect(x - 13, yo - 7, 26, 14, 3); g.fill(); g.stroke();
  }
}

// ---------------------------------------------------------------- shaft rpm gauge
class ShaftGauge extends Canvas {
  constructor(public i: number) { super('gauge', 'Shaft revolutions'); }
  draw() {
    if (this.w < 60) return;
    const g = this.begin(), p = SHIP.pods[this.i], e = p.shaft!.engine, ps = S.rt.state.pods[this.i];
    const cx = this.w / 2, R = Math.min(this.w / 2 - 10, this.h * 0.62), cy = R + 8, sweep = 120 * DEG;
    const nmax = e.n * 60, A = (v: number) => -sweep + (v + 1) / 2 * 2 * sweep;     // v: fraction −1..1
    const arc = (a0: number, a1: number, r: number) => { g.beginPath(); g.arc(cx, cy, r, a0 - Math.PI / 2, a1 - Math.PI / 2); };
    g.lineWidth = 7; g.strokeStyle = D.C.rule; arc(-sweep, sweep, R); g.stroke();
    // dead band (below minimum running speed) and barred range, both sides
    const hatch = (a0: number, a1: number, col: string) => { g.strokeStyle = col; g.globalAlpha = 0.55; g.setLineDash([2, 3]); arc(a0, a1, R); g.stroke(); g.setLineDash([]); g.globalAlpha = 1; };
    if (e.type === 'direct2s') hatch(A(-e.nMin), A(e.nMin), D.C.muted);
    if (e.barred) for (const s of [1, -1]) { const [a, b] = [A(s * e.barred[0]), A(s * e.barred[1])]; hatch(Math.min(a, b), Math.max(a, b), D.C.warn); g.lineWidth = 1.5; g.strokeStyle = D.C.warn; arc(Math.min(a, b), Math.max(a, b), R + 6); g.stroke(); g.lineWidth = 7; }
    const v = ps.rpm, z = A(0);
    g.strokeStyle = D.C.ink; g.lineWidth = 3; arc(Math.min(z, A(v)), Math.max(z, A(v)), R); g.stroke();
    g.lineWidth = 1;
    for (let k = -4; k <= 4; k++) { const a = A(k / 4) - Math.PI / 2; g.strokeStyle = D.C.muted; g.beginPath(); g.moveTo(cx + Math.cos(a) * (R - 6), cy + Math.sin(a) * (R - 6)); g.lineTo(cx + Math.cos(a) * (R - (k % 2 ? 10 : 14)), cy + Math.sin(a) * (R - (k % 2 ? 10 : 14))); g.stroke(); }
    const an = A(v) - Math.PI / 2;
    g.strokeStyle = D.C.ink; g.lineWidth = 2.5; g.lineCap = 'round'; g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + Math.cos(an) * (R - 4), cy + Math.sin(an) * (R - 4)); g.stroke();
    g.fillStyle = D.C.ink; g.beginPath(); g.arc(cx, cy, 3.5, 0, Math.PI * 2); g.fill();
    const tgt = ps.eng?.target ?? 0, ao = A(Math.max(-1, Math.min(1, ps.eng && ps.eng.mode === 'run' ? tgt : S.cmd.pods[this.i].rpm))) - Math.PI / 2;
    g.fillStyle = D.C.own; g.beginPath(); g.moveTo(cx + Math.cos(ao) * (R + 4), cy + Math.sin(ao) * (R + 4));
    g.lineTo(cx + Math.cos(ao - 0.07) * (R + 13), cy + Math.sin(ao - 0.07) * (R + 13)); g.lineTo(cx + Math.cos(ao + 0.07) * (R + 13), cy + Math.sin(ao + 0.07) * (R + 13)); g.closePath(); g.fill();
    this.num(Math.max(11, R * 0.3)); g.fillStyle = D.C.ink; g.textAlign = 'center'; g.textBaseline = 'alphabetic';
    g.fillText(`${v < -0.005 ? '−' : ''}${Math.abs(v * nmax).toFixed(0)}`, cx, cy + R * 0.42);
    this.font(9); g.fillStyle = D.C.muted; g.fillText(`${sideTag(p) ? sideTag(p) + ' · ' : ''}RPM`, cx, cy + R * 0.42 + 12);
  }
}

// ---------------------------------------------------------------- helm / rudder angle indicator
class Helm extends Canvas {
  max: number; lastTap = 0;
  constructor(public units: number[]) {
    super('helm', 'Helm: drag left for port rudder, right for starboard; double-tap for midships');
    this.max = SHIP.pods[units[0]].shaft!.rudder!.max;
    const ptr = (e: PointerEvent) => {
      const r = this.c.getBoundingClientRect(), { cx, cy } = this.geom(r.width, r.height);
      const a = Math.atan2(e.clientX - r.left - cx, cy - (e.clientY - r.top));
      const v = Math.max(-this.max, Math.min(this.max, a / (75 * DEG) * this.max));
      this.set(Math.round(v / DEG) * DEG);
    };
    this.c.addEventListener('pointerdown', e => {
      this.c.setPointerCapture(e.pointerId);
      const now = performance.now();
      if (now - this.lastTap < 300) { this.lastTap = 0; this.set(0); return; }
      this.lastTap = now; ptr(e);
    });
    this.c.addEventListener('pointermove', e => { if (this.c.hasPointerCapture(e.pointerId)) ptr(e); });
  }
  geom(w: number, h: number) { const R = Math.min(w / 2 - 22, h - 34); return { cx: w / 2, cy: R + 14, R }; }
  set(v: number) {
    const old = S.cmd.pods[this.units[0]].alpha;
    if (Math.round(old / DEG / 5) !== Math.round(v / DEG / 5)) uiTick(v === 0 ? 'detent' : 'step');
    for (const i of this.units) S.cmd.pods[i].alpha = v;
  }
  nudge(d: number) { this.set(Math.max(-this.max, Math.min(this.max, S.cmd.pods[this.units[0]].alpha + d))); }
  draw() {
    if (this.w < 80) return;
    const g = this.begin(), { cx, cy, R } = this.geom(this.w, this.h), sw = 75 * DEG, mx = this.max;
    const A = (d: number) => d / mx * sw - Math.PI / 2;
    g.lineWidth = 6; g.globalAlpha = 0.35;
    g.strokeStyle = D.C.port; g.beginPath(); g.arc(cx, cy, R, A(-mx), A(0)); g.stroke();
    g.strokeStyle = D.C.stbd; g.beginPath(); g.arc(cx, cy, R, A(0), A(mx)); g.stroke(); g.globalAlpha = 1;
    const stepDeg = mx > 50 * DEG ? 10 : 5;
    for (let d = -Math.round(mx / DEG); d <= Math.round(mx / DEG); d += stepDeg) {
      const a = A(d * DEG), major = d % (stepDeg * 2) === 0 || Math.abs(d) === Math.round(mx / DEG);
      g.strokeStyle = D.C.muted; g.lineWidth = major ? 1.5 : 1;
      g.beginPath(); g.moveTo(cx + Math.cos(a) * (R - 5), cy + Math.sin(a) * (R - 5)); g.lineTo(cx + Math.cos(a) * (R - (major ? 14 : 9)), cy + Math.sin(a) * (R - (major ? 14 : 9))); g.stroke();
      if (major && d) { this.num(9); g.fillStyle = d < 0 ? D.C.port : D.C.stbd; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(String(Math.abs(d)), cx + Math.cos(a) * (R + 12), cy + Math.sin(a) * (R + 12)); }
    }
    // actual rudder angle(s)
    this.units.forEach((i, k) => {
      const d = S.rt.state.pods[i].alpha, a = A(d);
      g.strokeStyle = this.units.length > 1 ? sideCol(SHIP.pods[i]) : D.C.ink; g.lineWidth = 2.5; g.lineCap = 'round';
      g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + Math.cos(a) * (R - 3 - k * 6), cy + Math.sin(a) * (R - 3 - k * 6)); g.stroke();
    });
    g.fillStyle = D.C.ink; g.beginPath(); g.arc(cx, cy, 4.5, 0, Math.PI * 2); g.fill();
    const o = S.cmd.pods[this.units[0]].alpha, ao = A(o);
    g.fillStyle = D.C.own; g.beginPath(); g.moveTo(cx + Math.cos(ao) * (R + 1), cy + Math.sin(ao) * (R + 1));
    g.lineTo(cx + Math.cos(ao - 0.06) * (R + 10), cy + Math.sin(ao - 0.06) * (R + 10)); g.lineTo(cx + Math.cos(ao + 0.06) * (R + 10), cy + Math.sin(ao + 0.06) * (R + 10)); g.closePath(); g.fill();
    const side = (v: number) => Math.abs(v) < 0.5 * DEG ? 'MID' : `${v < 0 ? 'P' : 'S'} ${Math.abs(v / DEG).toFixed(0)}°`;
    const act = S.rt.state.pods[this.units[0]].alpha;
    this.num(14); g.fillStyle = D.C.ink; g.textAlign = 'right'; g.textBaseline = 'alphabetic'; g.fillText(side(act), cx - 10, cy - 12);
    this.num(11); g.fillStyle = D.C.own; g.textAlign = 'left'; g.fillText(side(o), cx + 10, cy - 12);
    this.font(9); g.fillStyle = D.C.muted; g.textAlign = 'center';
    const rd = SHIP.pods[this.units[0]].shaft!.rudder!;
    g.fillText(`RUDDER · ${rd.type === 'conventional' ? '' : rd.type.toUpperCase() + ' · '}${(rd.rate / DEG).toFixed(1)} °/s`, cx, cy + 16);
  }
}

// ---------------------------------------------------------------- the station
export function buildStation(host: HTMLElement): Station {
  host.innerHTML = '';
  const units = shafts();
  const cpp = units.some(([p]) => p.shaft!.prop.cpp);
  const telegraph = !cpp && units.some(([p]) => p.shaft!.engine.type === 'direct2s');
  const elec = !cpp && !telegraph;
  const ruddered = units.filter(([p]) => p.shaft!.rudder).map(([, i]) => i);
  const canvases: Canvas[] = [];
  const cell = (title: string, right = '', cls = '') => {
    const d = document.createElement('section'); d.className = 'cell ' + cls;
    d.innerHTML = `<div class="tag"><span>${title}</span><b>${right}</b></div>`;
    host.appendChild(d); return d;
  };
  let linked = true;
  const levers: (Telegraph | PitchLever)[] = [];
  // engines: telegraph (direct) or pitch lever (CPP) per shaft, linked by default
  const engCell = cell(cpp ? 'Pitch' : telegraph ? 'Telegraph' : 'Propulsion', units.length > 1 ? 'LINKED' : telegraph ? 'BRIDGE CONTROL' : '', 'eng');
  const engRow = document.createElement('div'); engRow.className = 'row'; engCell.appendChild(engRow);
  const linkB = engCell.querySelector('b')!;
  for (const [p, i] of units) {
    const w = cpp ? new PitchLever([i], p.shaft!.prop.cpp!.asternPitch) : elec ? new PitchLever([i], 1, 'rpm') : new Telegraph([i], p.shaft!.telegraph);
    if (units.length > 1) { const t = document.createElement('span'); t.className = 'unit-tag'; t.textContent = sideTag(p); t.style.color = sideCol(p); engRow.appendChild(t); }
    engRow.appendChild(w.c); levers.push(w); canvases.push(w);
  }
  const relink = () => {
    // each lever drives its own shaft, and the others too while linked
    levers.forEach((l, k) => (l.units = linked ? [units[k][1], ...units.filter((_, j) => j !== k).map(([, i]) => i)] : [units[k][1]]));
    linkB.textContent = units.length > 1 ? (linked ? 'LINKED' : 'SPLIT') : linkB.textContent;
  };
  relink();
  if (units.length > 1) { linkB.style.cursor = 'pointer'; linkB.onclick = () => { linked = !linked; relink(); }; }
  // shaft gauges
  const gCell = cell('Shaft', cpp ? 'GEARED DIESEL' : telegraph ? '2-STROKE · DIRECT' : 'ELECTRIC DRIVE', 'gauges');
  const gRow = document.createElement('div'); gRow.className = 'row'; gCell.appendChild(gRow);
  const gauges = units.map(([, i]) => new ShaftGauge(i));
  gauges.forEach(g => { gRow.appendChild(g.c); canvases.push(g); });
  // helm
  let helm: Helm | null = null;
  if (ruddered.length) {
    const hc = cell('Helm', ruddered.length > 1 ? `${ruddered.length} RUDDERS · LINKED` : 'FOLLOW-UP', 'helm');
    helm = new Helm(ruddered); hc.appendChild(helm.c); canvases.push(helm);
  }
  // engine room / status
  const sc = cell('Engine room', '', 'status');
  const stat = document.createElement('div'); stat.className = 'stat'; sc.appendChild(stat);
  // thrusters
  const thr: { el: HTMLInputElement; key: 'bt' | 'sbt' }[] = [];
  const tCell = (SHIP.bowThruster.Tmax > 0 || SHIP.sternThruster) ? cell('Thrusters', '', 'thr') : null;
  const addThr = (key: 'bt' | 'sbt', label: string) => {
    const w = document.createElement('div'); w.className = 'btwrap';
    w.innerHTML = `<label class="tag">${label} <span class="mono" data-k="${key}">0</span></label><input type="range" min="-100" max="100" step="1" value="0" aria-label="${label}" /><div class="btscale"><span>PORT</span><span>STBD</span></div>`;
    tCell!.appendChild(w);
    const el = w.querySelector('input')!;
    el.oninput = () => { S.cmd[key] = +el.value / 100; };
    el.ondblclick = () => { el.value = '0'; S.cmd[key] = 0; };
    thr.push({ el, key });
  };
  if (SHIP.bowThruster.Tmax > 0) addThr('bt', 'BOW');
  if (SHIP.sternThruster) addThr('sbt', 'STERN');
  // buttons
  const bc = cell('', '', 'btns');
  bc.innerHTML = `<button class="cb warn" data-a="stop">${cpp ? 'ZERO PITCH' : 'STOP'}</button><button class="cb" data-a="mid">MIDSHIPS</button>${cpp ? '<button class="cb" data-a="comb">CONST RPM</button>' : ''}`;
  const combB = bc.querySelector('[data-a=comb]') as HTMLButtonElement | null;
  if (combB) {
    combinator = false;
    combB.onclick = () => {
      combinator = !combinator; combB.textContent = combinator ? 'COMBINATOR' : 'CONST RPM'; combB.classList.toggle('on', combinator);
      for (const [p, i] of units) if (p.shaft!.prop.cpp) S.cmd.pods[i].rpm = combinatorRpm(S.cmd.pods[i].pitch ?? 0);
    };
  }
  const zeroEng = () => { for (const [p, i] of units) { if (p.shaft!.prop.cpp) S.cmd.pods[i].pitch = 0; else S.cmd.pods[i].rpm = 0; } uiTick('detent'); };
  const mid = () => { for (const i of ruddered) S.cmd.pods[i].alpha = 0; uiTick('detent'); };
  (bc.querySelector('[data-a=stop]') as HTMLButtonElement).onclick = zeroEng;
  (bc.querySelector('[data-a=mid]') as HTMLButtonElement).onclick = mid;

  let statHtml = '';
  return {
    root: host,
    draw() { for (const c of canvases) c.draw(); },
    update() {
      const rows: string[] = [];
      for (const [p, i] of units) {
        const e = p.shaft!.engine, es = S.rt.state.pods[i].eng, msg = S.rt.status.msg[i] || (es?.mode === 'run' ? 'RUNNING' : es?.mode === 'stop' ? 'STOPPED' : '');
        const warn = /FAIL|STALL|NO |BLOCK|BARRED/.test(msg);
        const tag = units.length > 1 ? `<span style="color:${sideCol(p)}">${sideTag(p)}</span> ` : '';
        rows.push(`<div class="k">${tag}${e.type === 'direct2s' ? 'MAIN ENGINE' : e.type === 'electric' ? 'PROPULSION MOTOR' : 'ENGINE'}</div><div class="v${warn ? ' warn' : ''}">${msg}</div>`);
        if (e.air && es) {
          const frac = Math.max(0, (es.air - e.air.pMin) / (e.air.pMax - e.air.pMin));
          const left = Math.max(0, Math.floor((es.air - e.air.pMin) / ((e.air.dpAhead + e.air.dpAstern) / 2)));
          rows.push(`<div class="k">START AIR</div><div class="v">${es.air.toFixed(1)} bar · ≈ ${left} starts<div class="meter"><i style="width:${(frac * 100).toFixed(0)}%"></i></div></div>`);
        }
        const P = S.rt.status.podPower[i];
        rows.push(`<div class="k">LOAD</div><div class="v">${(P / 1e6).toFixed(1)} MW · ${(100 * P / e.P).toFixed(0)} %${cpp ? ` · pitch ${((S.rt.state.pods[i].pitch ?? 0) * 100).toFixed(0)} %` : ''}</div>`);
      }
      const html = rows.join('');
      if (html !== statHtml) { statHtml = html; stat.innerHTML = html; }
      for (const t of thr) { const v = S.rt.state[t.key] ?? 0, el = host.querySelector(`[data-k=${t.key}]`); if (el) el.textContent = `${v < 0 ? 'P' : v > 0 ? 'S' : ''}${Math.round(Math.abs(v) * 100)}`; }
    },
    keys(keys, dt) {
      if (helm) { if (keys.has('a')) helm.nudge(-20 * DEG * dt); if (keys.has('d')) helm.nudge(20 * DEG * dt); }
      for (const t of thr) {
        const [l, r] = t.key === 'bt' ? ['q', 'e'] : ['z', 'c'];
        if (keys.has(l) || keys.has(r)) { S.cmd[t.key] = Math.max(-1, Math.min(1, (S.cmd[t.key] ?? 0) + (keys.has(r) ? 1 : -1) * 0.8 * dt)); t.el.value = String(Math.round((S.cmd[t.key] ?? 0) * 100)); }
      }
      if (!telegraph && (keys.has('w') || keys.has('s'))) for (const l of levers) {
        const lv = l as PitchLever;
        lv.set(Math.max(-lv.astern, Math.min(1, lv.get() + (keys.has('w') ? 0.4 : -0.4) * dt)));
      }
    },
    keydown(k) {
      if (telegraph && (k === 'w' || k === 's')) { (levers[0] as Telegraph).step(k === 'w' ? -1 : 1); return true; }
      if (k === 'x') { zeroEng(); return true; }
      if (k === 'm' && helm) { mid(); return true; }
      return false;
    },
    resize() { for (const c of canvases) c.resize(); },
    zero() { zeroEng(); mid(); for (const t of thr) { t.el.value = '0'; S.cmd[t.key] = 0; } },
  };
}

/** Initial lever settings for a ship starting at a given speed. */
export function initialOrders(spec: ShipSpec, kn: number) {
  return spec.pods.map(p => {
    if (p.kind !== 'shaft') return null;
    const sh = p.shaft!, f = Math.min(1, kn / spec.vmaxKn);
    if (sh.prop.cpp) return { rpm: 1, pitch: f };
    if (sh.engine.type !== 'direct2s') return { rpm: f };
    if (f <= 0) return { rpm: 0 };
    // nearest telegraph step
    return { rpm: sh.telegraph.ahead.reduce((b, v) => (Math.abs(v - f) < Math.abs(b - f) ? v : b), sh.telegraph.ahead[0]) };
  });
}

// ================================================================ tugs and azimuth ships
/** Combi-lever: drag to set the direction the unit pushes the ship; distance from the centre sets thrust. */
class CombiLever extends Canvas {
  constructor(public units: number[], public label: string) {
    super('combi', `${label} azimuth combi-lever: direction of thrust, distance from centre for power`);
    const ptr = (e: PointerEvent) => {
      const r = this.c.getBoundingClientRect(), R = Math.min(r.width, r.height) / 2 - 12;
      const dx = e.clientX - r.left - r.width / 2, dy = e.clientY - r.top - r.height / 2;
      const d = Math.hypot(dx, dy);
      let rpm = Math.min(1, d / R); if (rpm < 0.12) rpm = 0; rpm = Math.round(rpm * 50) / 50;
      const old = S.cmd.pods[this.units[0]];
      const a = d > 6 ? Math.atan2(dx, -dy) : old.alpha;
      if ((rpm === 0) !== (old.rpm === 0)) uiTick('detent');
      else if (Math.floor(a / DEG / 15) !== Math.floor(old.alpha / DEG / 15)) uiTick('step');
      for (const i of this.units) { S.cmd.pods[i].alpha = a; S.cmd.pods[i].rpm = rpm; }
    };
    this.c.addEventListener('pointerdown', e => { this.c.setPointerCapture(e.pointerId); ptr(e); });
    this.c.addEventListener('pointermove', e => { if (this.c.hasPointerCapture(e.pointerId)) ptr(e); });
  }
  draw() {
    if (this.w < 60) return;
    const g = this.begin(), cx = this.w / 2, cy = this.h / 2, R = Math.min(this.w, this.h) / 2 - 12;
    const i = this.units[0], ps = S.rt.state.pods[i], c = S.cmd.pods[i], col = sideCol(SHIP.pods[i]);
    g.fillStyle = D.C['panel-solid']; g.strokeStyle = D.C.rule; g.lineWidth = 1.5;
    g.beginPath(); g.arc(cx, cy, R, 0, Math.PI * 2); g.fill(); g.stroke();
    g.setLineDash([2, 3]); g.beginPath(); g.arc(cx, cy, R * 0.5, 0, Math.PI * 2); g.stroke(); g.setLineDash([]);
    for (let k = 0; k < 24; k++) {
      const a = k * 15 * DEG, big = k % 6 === 0;
      g.strokeStyle = big ? D.C.ink : D.C.muted; g.lineWidth = big ? 1.5 : 1;
      g.beginPath(); g.moveTo(cx + Math.sin(a) * R, cy - Math.cos(a) * R); g.lineTo(cx + Math.sin(a) * (R - (big ? 9 : 5)), cy - Math.cos(a) * (R - (big ? 9 : 5))); g.stroke();
    }
    // actual thrust: arrow along the unit's actual azimuth, length by rpm
    const L = R * 0.92 * Math.max(0.05, Math.abs(ps.rpm)), a = ps.alpha;
    const vx = cx + Math.sin(a) * L, vy = cy - Math.cos(a) * L;
    g.strokeStyle = g.fillStyle = col; g.lineWidth = 4; g.lineCap = 'round';
    g.beginPath(); g.moveTo(cx, cy); g.lineTo(vx, vy); g.stroke();
    g.beginPath(); g.moveTo(vx + Math.sin(a) * 6, vy - Math.cos(a) * 6); g.lineTo(vx + Math.sin(a + 2.5) * 8, vy - Math.cos(a + 2.5) * 8); g.lineTo(vx + Math.sin(a - 2.5) * 8, vy - Math.cos(a - 2.5) * 8); g.closePath(); g.fill();
    // order: handle on the ring for direction, dot for power
    const hx = cx + Math.sin(c.alpha) * R, hy = cy - Math.cos(c.alpha) * R;
    const mx = cx + Math.sin(c.alpha) * R * 0.92 * c.rpm, my = cy - Math.cos(c.alpha) * R * 0.92 * c.rpm;
    g.strokeStyle = D.C.own; g.lineWidth = 1; g.setLineDash([2, 3]); g.beginPath(); g.moveTo(cx, cy); g.lineTo(hx, hy); g.stroke(); g.setLineDash([]);
    g.lineWidth = 2; g.beginPath(); g.arc(mx, my, 4, 0, Math.PI * 2); g.stroke();
    g.fillStyle = D.C['panel-solid']; g.lineWidth = 2.5; g.beginPath(); g.arc(hx, hy, 8, 0, Math.PI * 2); g.fill(); g.stroke();
    this.num(11); g.fillStyle = D.C.ink; g.textAlign = 'center'; g.textBaseline = 'alphabetic';
    const deg = ((ps.alpha / DEG) % 360 + 360) % 360;
    g.fillText(`${String(Math.round(deg)).padStart(3, '0')}° ${Math.round(Math.abs(ps.rpm) * 100)}%`, cx, this.h - 1);
  }
}

/** Voith Schneider pad: the thrust vector itself, ahead up, starboard right. */
class VspPad extends Canvas {
  constructor(public units: number[], public label: string) {
    super('vsppad', `${label} Voith Schneider pitch: drag the thrust vector`);
    const ptr = (e: PointerEvent) => {
      const r = this.c.getBoundingClientRect(), R = Math.min(r.width, r.height) / 2 - 12;
      let x = (e.clientX - r.left - r.width / 2) / R, y = -(e.clientY - r.top - r.height / 2) / R;
      const m = Math.hypot(x, y); if (m > 1) { x /= m; y /= m; }
      if (Math.abs(x) < 0.06) x = 0; if (Math.abs(y) < 0.06) y = 0;
      const rpm = Math.min(1, Math.hypot(x, y)), a = rpm > 0 ? Math.atan2(x, y) : S.cmd.pods[this.units[0]].alpha;
      if ((rpm === 0) !== (S.cmd.pods[this.units[0]].rpm === 0)) uiTick('detent');
      for (const i of this.units) { S.cmd.pods[i].alpha = a; S.cmd.pods[i].rpm = rpm; }
    };
    this.c.addEventListener('pointerdown', e => { this.c.setPointerCapture(e.pointerId); ptr(e); });
    this.c.addEventListener('pointermove', e => { if (this.c.hasPointerCapture(e.pointerId)) ptr(e); });
    this.c.addEventListener('dblclick', () => { for (const i of this.units) S.cmd.pods[i].rpm = 0; });
  }
  draw() {
    if (this.w < 60) return;
    const g = this.begin(), cx = this.w / 2, cy = this.h / 2, R = Math.min(this.w, this.h) / 2 - 12;
    const i = this.units[0], ps = S.rt.state.pods[i], c = S.cmd.pods[i];
    g.fillStyle = D.C['panel-solid']; g.strokeStyle = D.C.rule; g.lineWidth = 1.5;
    g.beginPath(); g.roundRect(cx - R, cy - R, 2 * R, 2 * R, 6); g.fill(); g.stroke();
    g.setLineDash([2, 3]); g.beginPath(); g.arc(cx, cy, R, 0, Math.PI * 2); g.stroke(); g.setLineDash([]);
    g.strokeStyle = D.C.muted; g.lineWidth = 1; g.beginPath(); g.moveTo(cx, cy - R); g.lineTo(cx, cy + R); g.moveTo(cx - R, cy); g.lineTo(cx + R, cy); g.stroke();
    this.font(9); g.fillStyle = D.C.muted; g.textAlign = 'left'; g.textBaseline = 'top'; g.fillText('AH', cx + 3, cy - R + 2); g.textBaseline = 'bottom'; g.fillText('AS', cx + 3, cy + R - 2);
    g.fillStyle = D.C.port; g.textBaseline = 'middle'; g.fillText('P', cx - R + 3, cy - 7); g.fillStyle = D.C.stbd; g.textAlign = 'right'; g.fillText('S', cx + R - 3, cy - 7);
    const px = cx + Math.sin(ps.alpha) * ps.rpm * R, py = cy - Math.cos(ps.alpha) * ps.rpm * R;
    g.strokeStyle = g.fillStyle = D.C.ink; g.lineWidth = 4; g.lineCap = 'round'; g.beginPath(); g.moveTo(cx, cy); g.lineTo(px, py); g.stroke();
    g.beginPath(); g.arc(px, py, 4, 0, Math.PI * 2); g.fill();
    const ox = cx + Math.sin(c.alpha) * c.rpm * R, oy = cy - Math.cos(c.alpha) * c.rpm * R;
    g.strokeStyle = D.C.own; g.lineWidth = 2.5; g.beginPath(); g.arc(ox, oy, 8, 0, Math.PI * 2); g.stroke();
    this.num(10.5); g.fillStyle = D.C.ink; g.textAlign = 'center'; g.textBaseline = 'alphabetic';
    g.fillText(`${Math.round(ps.rpm * 100)}% · ${String(Math.round(((ps.alpha / DEG) % 360 + 360) % 360)).padStart(3, '0')}°`, cx, this.h - 1);
  }
}

/** Heel indicator with the deck edge and the angle of vanishing stability. */
class HeelGauge extends Canvas {
  constructor() { super('heel', 'Heel'); }
  draw() {
    const rs = S.rt.roll; if (!rs || this.w < 60) return;
    const g = this.begin(), cx = this.w / 2, R = Math.min(this.w / 2 - 8, this.h - 26), cy = R + 6, sp = SHIP.roll!;
    const de = Math.atan2(SHIP.look.freeboard, SHIP.B / 2), sweep = 50 * DEG, A = (p: number) => p / sweep * 75 * DEG - Math.PI / 2;
    g.lineWidth = 6; g.strokeStyle = D.C.rule; g.beginPath(); g.arc(cx, cy, R, A(-sweep), A(sweep)); g.stroke();
    g.strokeStyle = D.C.warn;
    for (const s of [1, -1]) { const a0 = A(s * de), a1 = A(s * Math.min(sweep, sp.vanish)); g.beginPath(); g.arc(cx, cy, R, Math.min(a0, a1), Math.max(a0, a1)); g.stroke(); }
    const a = A(Math.max(-sweep, Math.min(sweep, rs.phi)));
    g.strokeStyle = D.C.ink; g.lineWidth = 2.5; g.lineCap = 'round'; g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + Math.cos(a) * (R - 4), cy + Math.sin(a) * (R - 4)); g.stroke();
    g.fillStyle = D.C.ink; g.beginPath(); g.arc(cx, cy, 4, 0, Math.PI * 2); g.fill();
    const deg = rs.phi / DEG;
    this.num(14); g.fillStyle = Math.abs(rs.phi) > de ? D.C.warn : D.C.ink; g.textAlign = 'center'; g.textBaseline = 'alphabetic';
    g.fillText(`${deg < -0.05 ? 'P' : deg > 0.05 ? 'S' : ''} ${Math.abs(deg).toFixed(1)}°`, cx, cy - R * 0.35);
    this.font(9); g.fillStyle = D.C.muted; g.fillText(`HEEL · DECK EDGE ${(de / DEG).toFixed(0)}°`, cx, cy + 14);
  }
}

/** Towline tension against the brake and the breaking load. */
class TowGauge extends Canvas {
  constructor() { super('towg', 'Towline tension'); }
  draw() {
    const esc = S.rt.escort; if (!esc || this.w < 60) return;
    const l = esc.line, g = this.begin(), cx = this.w / 2, R = Math.min(this.w / 2 - 10, this.h * 0.62), cy = R + 8, sw = 120 * DEG;
    const max = l.MBL, A = (t: number) => -sw + Math.min(1, t / max) * 2 * sw - Math.PI / 2;
    g.lineWidth = 7; g.strokeStyle = D.C.rule; g.beginPath(); g.arc(cx, cy, R, A(0), A(max)); g.stroke();
    g.strokeStyle = D.C.warn; g.beginPath(); g.arc(cx, cy, R, A(l.brake), A(max)); g.stroke();
    g.strokeStyle = D.C.ink; g.lineWidth = 3; g.beginPath(); g.arc(cx, cy, R, A(0), A(l.T)); g.stroke();
    const a = A(l.T); g.lineWidth = 2.5; g.lineCap = 'round'; g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + Math.cos(a) * (R - 4), cy + Math.sin(a) * (R - 4)); g.stroke();
    if (l.mode === 'render') { const ar = A(l.renderT); g.fillStyle = D.C.own; g.beginPath(); g.arc(cx + Math.cos(ar) * (R + 9), cy + Math.sin(ar) * (R + 9), 3.5, 0, Math.PI * 2); g.fill(); }
    this.num(15); g.fillStyle = l.parted ? D.C.warn : D.C.ink; g.textAlign = 'center'; g.textBaseline = 'alphabetic';
    g.fillText(l.parted ? 'PARTED' : l.mode === 'released' ? 'FREE' : `${(l.T / 9.81e3).toFixed(0)} t`, cx, cy + R * 0.42);
    this.font(9); g.fillStyle = D.C.muted; g.fillText(`TENSION · MBL ${(l.MBL / 9.81e3).toFixed(0)} t`, cx, cy + R * 0.42 + 13);
  }
}

/** Station for azimuth-thruster and Voith ships (tugs): one control per unit, towline and heel. */
export function buildTugStation(host: HTMLElement, vsp: boolean): Station {
  host.innerHTML = '';
  const canvases: Canvas[] = [];
  const cell = (title: string, right = '', cls = '') => {
    const d = document.createElement('section'); d.className = 'cell ' + cls;
    d.innerHTML = `<div class="tag"><span>${title}</span><b>${right}</b></div>`; host.appendChild(d); return d;
  };
  const units = SHIP.pods.map((p, i) => [p, i] as [PodSpec, number]);
  const ctl: (CombiLever | VspPad)[] = [];
  const uc = cell(vsp ? 'Voith Schneider' : 'Azimuth drives', units.length > 1 ? 'INDEPENDENT' : '', 'units');
  const row = document.createElement('div'); row.className = 'row'; uc.appendChild(row);
  for (const [p, i] of units) {
    const w = vsp ? new VspPad([i], p.label) : new CombiLever([i], p.label);
    const box = document.createElement('div'); box.className = 'unitbox';
    box.innerHTML = `<span class="unit-tag2" style="color:${sideCol(p)}">${p.label}</span>`;
    box.appendChild(w.c); row.appendChild(box); ctl.push(w); canvases.push(w);
  }
  let linked = false;
  const linkB = uc.querySelector('b')!;
  if (units.length > 1) {
    linkB.style.cursor = 'pointer';
    linkB.onclick = () => {
      linked = !linked; linkB.textContent = linked ? 'LINKED' : 'INDEPENDENT';
      ctl.forEach((c, k) => (c.units = linked ? [units[k][1], ...units.filter((_, j) => j !== k).map(([, i]) => i)] : [units[k][1]]));
    };
  }
  // heel
  const heel = SHIP.roll ? new HeelGauge() : null;
  if (heel) { const hc = cell('Stability', `GM ${SHIP.roll!.GM.toFixed(1)} m`, 'heelc'); hc.appendChild(heel.c); canvases.push(heel); }
  // towline
  const towg = new TowGauge();
  const tc = cell('Towline', SHIP.towPoints?.[S.sc.escort?.tugPoint ?? 0]?.name ?? '', 'tow');
  const trow = document.createElement('div'); trow.className = 'row'; tc.appendChild(trow);
  trow.appendChild(towg.c); canvases.push(towg);
  const tstat = document.createElement('div'); tstat.className = 'stat'; trow.appendChild(tstat);
  const tb = document.createElement('div'); tb.className = 'row wrap'; tc.appendChild(tb);
  const modes: [string, string][] = [['brake', 'BRAKE'], ['render', 'RENDER'], ['heave', 'HEAVE'], ['pay', 'PAY OUT'], ['released', 'RELEASE']];
  tb.innerHTML = modes.map(([m, t]) => `<button class="cb${m === 'released' ? ' warn' : ''}" data-m="${m}">${t}</button>`).join('');
  tb.querySelectorAll<HTMLButtonElement>('button').forEach(b => (b.onclick = () => { const l = S.rt.escort?.line; if (l && !l.parted && l.mode !== 'released') { l.mode = b.dataset.m as typeof l.mode; uiTick('detent'); } }));
  tc.hidden = !S.rt.escort;
  // buttons
  const bc = cell('', '', 'btns');
  bc.innerHTML = `<button class="cb warn" data-a="stop">ALL STOP</button>`;
  const stop = () => { for (const [, i] of units) S.cmd.pods[i].rpm = 0; uiTick('detent'); };
  (bc.querySelector('[data-a=stop]') as HTMLButtonElement).onclick = stop;
  let statHtml = '';
  const keyMap: [string, string, string, string][] = [['a', 'd', 'w', 's'], ['j', 'l', 'i', 'k'], ['z', 'c', 'r', 'f']];
  return {
    root: host,
    draw() { for (const c of canvases) c.draw(); },
    update() {
      const esc = S.rt.escort;
      if (esc) {
        const l = esc.line, st = esc.st, me = S.rt.state;
        // steering (across the ship) and braking (along) components of the line pull on the escorted ship
        const c = Math.cos(st.psi), s = Math.sin(st.psi);
        const tp = [me.n + l.fairTug[0] * Math.cos(me.psi), me.e + l.fairTug[0] * Math.sin(me.psi)];
        const fn = st.n + l.fairShip[0] * c, fe = st.e + l.fairShip[0] * s;
        const dn = tp[0] - fn, de = tp[1] - fe, d = Math.hypot(dn, de) || 1;
        const along = (dn * c + de * s) / d, across = (-dn * s + de * c) / d;
        const lead = Math.atan2(-(dn * Math.sin(me.psi) - de * Math.cos(me.psi)), -(dn * Math.cos(me.psi) + de * Math.sin(me.psi))) / DEG;
        const fl = esc.setup.failure;
        const html = `<div class="k">PAID OUT</div><div class="v">${l.L0.toFixed(0)} m · ${l.mode.toUpperCase()}</div>
          <div class="k">LEAD</div><div class="v">${Math.abs(lead).toFixed(0)}° ${lead >= 0 ? 'stbd' : 'port'} of bow</div>
          <div class="k">STEERING</div><div class="v">${(Math.abs(across) * l.T / 9.81e3).toFixed(0)} t ${across >= 0 ? 'stbd' : 'port'}</div>
          <div class="k">BRAKING</div><div class="v">${(Math.max(0, -along) * l.T / 9.81e3).toFixed(0)} t</div>
          <div class="k">SHIP</div><div class="v${esc.failed ? ' warn' : ''}">${(((st.psi / DEG) % 360 + 360) % 360).toFixed(0).padStart(3, '0')}° ${(Math.hypot(st.u, st.v) / 0.514444).toFixed(1)} kn${esc.failed && fl ? ' · ' + (fl.kind === 'rudder' ? 'RUDDER JAMMED' : 'ENGINE FAILED') : ''}</div>`;
        if (html !== statHtml) { statHtml = html; tstat.innerHTML = html; }
      }
    },
    keys(keys, dt) {
      units.forEach(([, i], k) => {
        const m = keyMap[k]; if (!m) return;
        const c = S.cmd.pods[i];
        if (keys.has(m[0])) c.alpha -= 60 * DEG * dt;
        if (keys.has(m[1])) c.alpha += 60 * DEG * dt;
        if (keys.has(m[2])) c.rpm = Math.min(1, c.rpm + 0.5 * dt);
        if (keys.has(m[3])) c.rpm = Math.max(0, c.rpm - 0.5 * dt);
        if (linked) for (const [, j] of units) if (j !== i) { S.cmd.pods[j].alpha = c.alpha; S.cmd.pods[j].rpm = c.rpm; }
      });
    },
    keydown(k) { if (k === 'x') { stop(); return true; } return false; },
    resize() { for (const c of canvases) c.resize(); },
    zero() { stop(); },
  };
}
