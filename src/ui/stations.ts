// Control stations for ships that are not twin-Azipod: engine telegraph, CPP pitch levers,
// helm with rudder angle indicator, shaft gauges, thrusters. Every control follows the same
// rule as the Azipod levers: the handle is the order, the ink needle or bar is what the
// machinery is actually doing, dashed or hatched marks are limits.
import { DEG, SHIP, ShipSpec } from '../physics/ship';
import type { PodSpec } from '../physics/ship';
import { S } from './state';
import * as D from './draw';
import { uiTick } from './audio';
import { BAND, jetJoystick, jetToLever, leverToJet } from '../physics/units/jet';
import { capability } from '../physics/dp';

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
  constructor(public units: number[], max?: number) {
    super('helm', 'Helm: drag left for port rudder, right for starboard; double-tap for midships');
    this.max = max ?? SHIP.pods[units[0]].shaft!.rudder!.max;
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
    const rd = SHIP.pods[this.units[0]].shaft?.rudder;
    g.fillText(rd ? `RUDDER · ${rd.type === 'conventional' ? '' : rd.type.toUpperCase() + ' · '}${(rd.rate / DEG).toFixed(1)} °/s` : `NOZZLES · ±${Math.round(this.max / DEG)}°`, cx, cy + 16);
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
  const eType = units[0][0].shaft!.engine.type;
  const gCell = cell('Shaft', cpp ? (eType === 'turbine' ? 'GAS TURBINE · CPP' : 'GEARED DIESEL') : telegraph ? '2-STROKE · DIRECT' : eType === 'electric' ? 'ELECTRIC DRIVE' : 'DIESEL · REVERSING GEAR', 'gauges');
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
  bc.innerHTML = `<button class="cb warn" data-a="stop">${cpp ? 'ZERO PITCH' : 'STOP'}</button><button class="cb" data-a="mid">MIDSHIPS</button>${cpp ? '<button class="cb" data-a="comb">CONST RPM</button>' : ''}${SHIP.rotors ? '<button class="cb on" data-a="rotor">ROTORS ON</button>' : ''}`;
  const rotB = bc.querySelector('[data-a=rotor]') as HTMLButtonElement | null;
  if (rotB) rotB.onclick = () => { const m = S.rt.model; m.rotorsOn = !m.rotorsOn; rotB.textContent = m.rotorsOn ? 'ROTORS ON' : 'ROTORS OFF'; rotB.classList.toggle('on', m.rotorsOn); uiTick('detent'); };
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
      if (SHIP.rotors) {
        const ro = S.rt.bd.rotor, on = S.rt.model.rotorsOn;
        rows.push(`<div class="k">ROTOR SAILS</div><div class="v">${!on ? 'STOPPED' : ro?.on ? `${(ro.X / 1e3).toFixed(0)} kN ahead · ${(Math.abs(ro.Y) / 1e3).toFixed(0)} kN ${ro.Y >= 0 ? 'to stbd' : 'to port'} · SR ${ro.SR.toFixed(1)}` : 'WIND TOO FAR AHEAD'}</div>`);
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
  return spec.pods.map((p): { rpm: number; pitch?: number; bucket?: number } | null => {
    if (p.kind === 'waterjet') {
      // impeller speed for a speed, through the resistance hump (fractions of full speed → rpm, from trials)
      const f = Math.min(1, kn / spec.vmaxKn), idle = p.jet!.idle;
      if (f <= 0) return { rpm: idle, bucket: 0 };
      const pts: [number, number][] = [[0, idle], [0.42, 0.4], [0.51, 0.55], [0.59, 0.7], [0.7, 0.85], [1, 1]];
      let k = 1; while (k < pts.length - 1 && pts[k][0] < f) k++;
      const [a, b] = [pts[k - 1], pts[k]];
      return { rpm: a[1] + (b[1] - a[1]) * (f - a[0]) / (b[0] - a[0]), bucket: 1 };
    }
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
  const uc = cell(vsp ? 'Voith Schneider' : units.every(([p]) => !p.kind || p.kind === 'azipod') ? 'Azipods' : 'Azimuth drives', units.length > 1 ? 'INDEPENDENT' : '', 'units');
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
  // ice
  const iceStat = document.createElement('div'); iceStat.className = 'stat';
  if (S.rt.ice) { const ic = cell('Ice', 'LEVEL ICE', 'status'); ic.appendChild(iceStat); }
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
      const ice = S.rt.ice;
      if (ice) {
        const html = `<div class="k">UNDER THE BOW</div><div class="v">${!ice.inIce ? 'OPEN WATER' : ice.brash ? `BROKEN CHANNEL (${ice.h.toFixed(1)} m sheet)` : `LEVEL ICE ${ice.h.toFixed(1)} m`}</div>
          <div class="k">ICE RESISTANCE</div><div class="v">${(ice.R / 1e3).toFixed(0)} kN</div>
          <div class="k">SPEED</div><div class="v">${(S.rt.state.u / 0.514444).toFixed(1)} kn</div>`;
        if (html !== iceStat.dataset.h) { iceStat.dataset.h = html; iceStat.innerHTML = html; }
      }
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

// ================================================================ waterjet craft
const jets = () => SHIP.pods.map((p, i) => [p, i] as [PodSpec, number]).filter(([p]) => p.kind === 'waterjet');

class JetLever extends Canvas {
  v = 0;
  constructor(public units: number[], public label: string) {
    super('lev', `${label} waterjet lever: ahead up, bucket zero at the centre, astern down`);
    const c = S.cmd.pods[units[0]]; this.v = jetToLever(c.bucket ?? 1, c.rpm, SHIP.pods[units[0]].jet!.idle);
    const ptr = (e: PointerEvent) => {
      const r = this.c.getBoundingClientRect(), H = r.height - 28;
      let v = (r.height / 2 - (e.clientY - r.top)) / (H / 2);
      v = Math.max(-1, Math.min(1, v)); if (Math.abs(v) < 0.04) v = 0; v = Math.round(v * 100) / 100;
      if ((v === 0 && this.v !== 0) || (Math.abs(v) >= BAND) !== (Math.abs(this.v) >= BAND)) uiTick('detent'); else if (Math.floor(v * 10) !== Math.floor(this.v * 10)) uiTick('step');
      this.set(v);
    };
    this.c.addEventListener('pointerdown', e => { this.c.setPointerCapture(e.pointerId); ptr(e); });
    this.c.addEventListener('pointermove', e => { if (this.c.hasPointerCapture(e.pointerId)) ptr(e); });
  }
  set(v: number) {
    this.v = v;
    for (const i of this.units) { const o = leverToJet(v, SHIP.pods[i].jet!.idle), c = S.cmd.pods[i]; c.bucket = o.bucket; c.rpm = o.rpm; }
  }
  y(v: number) { return 14 + (this.h - 28) / 2 * (1 - v); }
  draw() {
    if (this.h < 60) return;
    const g = this.begin(), x = this.w / 2 - 6, i = this.units[0], ps = S.rt.state.pods[i], idle = SHIP.pods[i].jet!.idle;
    g.fillStyle = D.C.rule; g.fillRect(x - 3, this.y(1), 6, this.y(-1) - this.y(1));
    // bucket band around zero, impeller band beyond
    g.fillStyle = D.C.muted; g.globalAlpha = 0.25; g.fillRect(x - 6, this.y(BAND), 12, this.y(-BAND) - this.y(BAND)); g.globalAlpha = 1;
    for (let k = -10; k <= 10; k += 2) {
      const yy = Math.round(this.y(k / 10)) + 0.5, big = k === 0;
      g.strokeStyle = big ? D.C.ink : D.C.muted; g.lineWidth = big ? 1.5 : 1;
      g.beginPath(); g.moveTo(x + 7, yy); g.lineTo(x + (big ? 16 : 12), yy); g.stroke();
    }
    this.font(8.5); g.fillStyle = D.C.muted; g.textAlign = 'left'; g.textBaseline = 'middle';
    g.fillText('BUCKET', x + 18, this.y(0) - 9); g.fillText('ZERO', x + 18, this.y(0) + 2);
    g.fillText('RPM', x + 18, this.y(0.75)); g.fillText('RPM', x + 18, this.y(-0.75));
    g.textAlign = 'center'; g.textBaseline = 'top'; g.fillText('AH', x, 0); g.textBaseline = 'bottom'; g.fillText('AS', x, this.h);
    // cavitation ceiling
    const lim = S.rt.status.rpmLimit[i];
    if (lim < 0.999) { const yy = this.y(jetToLever(1, Math.max(idle, lim), idle)); g.strokeStyle = D.C.warn; g.setLineDash([3, 2]); g.lineWidth = 1.5; g.beginPath(); g.moveTo(x - 10, yy); g.lineTo(x + 10, yy); g.stroke(); g.setLineDash([]); }
    const a = jetToLever(ps.bucket ?? 1, ps.rpm, idle), y0 = this.y(0);
    g.fillStyle = sideCol(SHIP.pods[i]); g.globalAlpha = 0.85; g.fillRect(x - 3, Math.min(y0, this.y(a)), 6, Math.abs(this.y(a) - y0)); g.globalAlpha = 1;
    const yo = this.y(this.v);
    g.fillStyle = D.C['panel-solid']; g.strokeStyle = this.v < 0 ? D.C.warn : D.C.own; g.lineWidth = 2.5;
    g.beginPath(); g.roundRect(x - 13, yo - 7, 26, 14, 3); g.fill(); g.stroke();
  }
}

/** One jet seen from above: nozzle angle, the bucket over it, impeller speed. */
class JetGauge extends Canvas {
  constructor(public i: number) { super('jetg', `${SHIP.pods[i].label} waterjet: nozzle, bucket and impeller`); }
  draw() {
    if (this.w < 40) return;
    const g = this.begin(), p = SHIP.pods[this.i], ps = S.rt.state.pods[this.i], c = S.cmd.pods[this.i];
    const cx = this.w / 2, top = 10, L = Math.min(this.h - 40, this.w * 1.4), col = sideCol(p);
    // duct
    g.fillStyle = D.C['panel-solid']; g.strokeStyle = D.C.rule; g.lineWidth = 1.5;
    g.beginPath(); g.roundRect(cx - 9, top, 18, L * 0.55, 4); g.fill(); g.stroke();
    // nozzle: turns about its pivot at the transom
    const py = top + L * 0.55, d = ps.alpha;
    g.save(); g.translate(cx, py); g.rotate(d);
    g.fillStyle = col; g.globalAlpha = 0.9; g.beginPath(); g.moveTo(-7, 0); g.lineTo(7, 0); g.lineTo(5, L * 0.28); g.lineTo(-5, L * 0.28); g.closePath(); g.fill(); g.globalAlpha = 1;
    // bucket: covers the nozzle exit as it comes down
    const b = ps.bucket ?? 1, cover = (1 - b) / 2;
    g.fillStyle = b < 0 ? D.C.warn : D.C.ink; g.globalAlpha = 0.2 + 0.8 * cover;
    g.fillRect(-9, L * 0.28 + 2, 18, 5 + 8 * cover); g.globalAlpha = 1;
    g.restore();
    // ordered nozzle angle
    g.strokeStyle = D.C.own; g.lineWidth = 1; g.setLineDash([2, 3]);
    g.beginPath(); g.moveTo(cx, py); g.lineTo(cx + Math.sin(-c.alpha) * L * 0.4, py + Math.cos(c.alpha) * L * 0.4); g.stroke(); g.setLineDash([]);
    this.num(10); g.fillStyle = D.C.ink; g.textAlign = 'center'; g.textBaseline = 'alphabetic';
    const deg = d / DEG;
    g.fillText(`${Math.abs(deg) < 0.5 ? 'MID' : (deg < 0 ? 'P' : 'S') + Math.abs(deg).toFixed(0) + '°'}`, cx, this.h - 15);
    g.fillText(`${Math.round(ps.rpm * 100)}% ${b > 0.95 ? 'AH' : b < -0.95 ? 'AS' : 'B' + Math.round(b * 100)}`, cx, this.h - 2);
  }
}

/** Joystick for the jets and bow thruster: drag for surge and sway, the twist bar for yaw. */
class JetJoy extends Canvas {
  fx = 0; fy = 0; nz = 0;
  constructor() {
    super('jjoy', 'Joystick: drag for ahead, astern and sideways; twist bar below turns her');
    const ptr = (e: PointerEvent) => {
      const r = this.c.getBoundingClientRect(), R = Math.min(r.width, r.height - 26) / 2 - 10, cx = r.width / 2, cy = R + 10;
      const ex = e.clientX - r.left, ey = e.clientY - r.top;
      if (ey > cy + R + 4) { this.nz = Math.max(-1, Math.min(1, (ex - cx) / R)); if (Math.abs(this.nz) < 0.06) this.nz = 0; return; }
      let x = (ex - cx) / R, y = -(ey - cy) / R; const m = Math.hypot(x, y); if (m > 1) { x /= m; y /= m; }
      if (Math.abs(x) < 0.06) x = 0; if (Math.abs(y) < 0.06) y = 0;
      if ((x === 0 && y === 0) !== (this.fx === 0 && this.fy === 0)) uiTick('detent');
      this.fx = y; this.fy = x;
    };
    this.c.addEventListener('pointerdown', e => { this.c.setPointerCapture(e.pointerId); ptr(e); });
    this.c.addEventListener('pointermove', e => { if (this.c.hasPointerCapture(e.pointerId)) ptr(e); });
    this.c.addEventListener('dblclick', () => { this.fx = this.fy = this.nz = 0; });
  }
  draw() {
    if (this.w < 60) return;
    const g = this.begin(), R = Math.min(this.w, this.h - 26) / 2 - 10, cx = this.w / 2, cy = R + 10;
    g.fillStyle = D.C['panel-solid']; g.strokeStyle = D.C.rule; g.lineWidth = 1.5;
    g.beginPath(); g.arc(cx, cy, R, 0, Math.PI * 2); g.fill(); g.stroke();
    g.strokeStyle = D.C.muted; g.lineWidth = 1; g.beginPath(); g.moveTo(cx, cy - R); g.lineTo(cx, cy + R); g.moveTo(cx - R, cy); g.lineTo(cx + R, cy); g.stroke();
    // what the ship is doing: speed over ground as a vector (1 kn per tenth of the radius)
    const st = S.rt.state, kx = Math.max(-1, Math.min(1, st.v / 0.514444 / 10)), ky = Math.max(-1, Math.min(1, st.u / 0.514444 / 10));
    g.strokeStyle = D.C.ink; g.lineWidth = 3; g.lineCap = 'round'; g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + kx * R, cy - ky * R); g.stroke();
    g.strokeStyle = D.C.own; g.lineWidth = 2.5; g.beginPath(); g.arc(cx + this.fy * R, cy - this.fx * R, 8, 0, Math.PI * 2); g.stroke();
    // twist bar
    const by = cy + R + 14;
    g.fillStyle = D.C.rule; g.fillRect(cx - R, by - 2, 2 * R, 4);
    g.fillStyle = D.C.own; g.beginPath(); g.roundRect(cx + this.nz * R - 6, by - 7, 12, 14, 3); g.fill();
    const rot = st.r / DEG * 60; g.fillStyle = D.C.ink; g.fillRect(cx, by + 5, Math.max(-R, Math.min(R, rot / 60 * R)), 3);
    this.font(8.5); g.fillStyle = D.C.muted; g.textAlign = 'left'; g.textBaseline = 'top'; g.fillText('AH', cx + 3, cy - R + 2);
    g.textAlign = 'center'; g.textBaseline = 'bottom'; g.fillText('TWIST', cx, by - 4);
  }
}

/** Waterjet craft: thrust levers per side, nozzle helm, jet indicators, joystick, comfort. */
export function buildJetStation(host: HTMLElement): Station {
  host.innerHTML = '';
  const canvases: Canvas[] = [];
  const cell = (title: string, right = '', cls = '') => {
    const d = document.createElement('section'); d.className = 'cell ' + cls;
    d.innerHTML = `<div class="tag"><span>${title}</span><b>${right}</b></div>`; host.appendChild(d); return d;
  };
  const units = jets(), all = units.map(([, i]) => i);
  const port = units.filter(([p]) => p.y < 0).map(([, i]) => i), stbd = units.filter(([p]) => p.y >= 0).map(([, i]) => i);
  let mode: 'transit' | 'joy' = 'transit', linked = true;
  // levers
  const lc = cell('Jets', 'LINKED', 'eng');
  const lrow = document.createElement('div'); lrow.className = 'row'; lc.appendChild(lrow);
  const levers = [new JetLever(port, 'Port'), new JetLever(stbd, 'Starboard')];
  levers.forEach((l, k) => { const t = document.createElement('span'); t.className = 'unit-tag'; t.textContent = k ? 'STBD' : 'PORT'; t.style.color = k ? D.C.stbd : D.C.port; lrow.appendChild(t); lrow.appendChild(l.c); canvases.push(l); });
  const linkB = lc.querySelector('b')!; linkB.style.cursor = 'pointer';
  const relink = () => { levers[0].units = linked ? all : port; levers[1].units = linked ? all : stbd; linkB.textContent = linked ? 'LINKED' : 'SPLIT'; };
  linkB.onclick = () => { linked = !linked; relink(); };
  relink();
  // jet indicators
  const gc = cell('Nozzles · buckets', `${units.length} × WATERJET`, 'jetc');
  const grow = document.createElement('div'); grow.className = 'row'; gc.appendChild(grow);
  for (const [, i] of units) { const gq = new JetGauge(i); grow.appendChild(gq.c); canvases.push(gq); }
  // helm and joystick share a cell
  const hc = cell('Helm', 'TRANSIT', 'helm');
  const helm = new Helm(all, SHIP.pods[all[0]].jet!.nozzleMax); hc.appendChild(helm.c); canvases.push(helm);
  const joy = new JetJoy(); joy.c.hidden = true; hc.appendChild(joy.c); canvases.push(joy);
  const modeB = hc.querySelector('b')!; modeB.style.cursor = 'pointer';
  const setMode = (m: typeof mode) => {
    mode = m; modeB.textContent = m === 'joy' ? 'JOYSTICK' : 'TRANSIT'; hc.querySelector('span')!.textContent = m === 'joy' ? 'Joystick' : 'Helm';
    helm.c.hidden = m === 'joy'; joy.c.hidden = m !== 'joy';
    if (m === 'joy') { joy.fx = joy.fy = joy.nz = 0; } else { for (const l of levers) l.set(0); S.cmd.bt = 0; helm.set(0); }
    requestAnimationFrame(() => { helm.resize(); joy.resize(); });
    uiTick('detent');
  };
  modeB.onclick = () => setMode(mode === 'joy' ? 'transit' : 'joy');
  // status: engines, cavitation, motions
  const sc = cell('Engines · comfort', '', 'status');
  const stat = document.createElement('div'); stat.className = 'stat'; sc.appendChild(stat);
  // bow thruster
  let btEl: HTMLInputElement | null = null;
  if (SHIP.bowThruster.Tmax > 0) {
    const tc = cell('Thrusters', '', 'thr');
    const w = document.createElement('div'); w.className = 'btwrap';
    w.innerHTML = `<label class="tag">BOW <span class="mono" data-k="bt">0</span></label><input type="range" min="-100" max="100" step="1" value="0" aria-label="Bow thruster" /><div class="btscale"><span>PORT</span><span>STBD</span></div>`;
    tc.appendChild(w); btEl = w.querySelector('input')!;
    btEl.oninput = () => { if (mode !== 'joy') S.cmd.bt = +btEl!.value / 100; };
  }
  const bc = cell('', '', 'btns');
  bc.innerHTML = '<button class="cb warn" data-a="zero">BUCKETS ZERO</button><button class="cb" data-a="mid">MIDSHIPS</button>';
  const zero = () => { for (const l of levers) l.set(0); joy.fx = joy.fy = joy.nz = 0; uiTick('detent'); };
  const mid = () => helm.set(0);
  (bc.querySelector('[data-a=zero]') as HTMLButtonElement).onclick = zero;
  (bc.querySelector('[data-a=mid]') as HTMLButtonElement).onclick = mid;
  let statHtml = '', lastU = S.rt.state.u, lastT = S.rt.state.t, ax = 0;
  return {
    root: host,
    draw() { for (const c of canvases) if (!c.c.hidden) c.draw(); },
    update() {
      if (mode === 'joy') jetJoystick(SHIP, S.cmd, joy.fx, joy.fy, joy.nz);
      const st = S.rt.state, dt = st.t - lastT;
      if (dt > 0.2) { ax = 0.8 * ax + 0.2 * (st.u - lastU) / dt; lastU = st.u; lastT = st.t; }
      const ay = st.u * st.r / 9.81, along = ax / 9.81, hard = Math.max(Math.abs(ay), Math.abs(along)) > 0.2;
      const P = S.rt.status.podPower.reduce((a, b, i) => a + (SHIP.pods[i].kind === 'waterjet' ? b : 0), 0);
      const cav = units.some(([, i]) => S.rt.status.msg[i] === 'CAVITATION LIMIT');
      const html = `<div class="k">POWER</div><div class="v">${(P / 1e6).toFixed(1)} / ${(units.reduce((a, [p]) => a + p.P, 0) / 1e6).toFixed(0)} MW</div>
        <div class="k">PUMPS</div><div class="v${cav ? ' warn' : ''}">${cav ? 'CAVITATION LIMIT · rpm held' : 'NORMAL'}</div>
        <div class="k">LATERAL</div><div class="v${Math.abs(ay) > 0.2 ? ' warn' : ''}">${Math.abs(ay).toFixed(2)} g<div class="meter"><i style="width:${Math.min(100, Math.abs(ay) / 0.3 * 100).toFixed(0)}%"></i></div></div>
        <div class="k">FORE-AFT</div><div class="v${Math.abs(along) > 0.2 ? ' warn' : ''}">${Math.abs(along).toFixed(2)} g${hard ? ' · PASSENGERS AT RISK' : ''}</div>`;
      if (html !== statHtml) { statHtml = html; stat.innerHTML = html; }
      if (btEl) { const el = host.querySelector('[data-k=bt]'); const v = st.bt; if (el) el.textContent = `${v < 0 ? 'P' : v > 0 ? 'S' : ''}${Math.round(Math.abs(v) * 100)}`; if (mode === 'joy') btEl.value = String(Math.round(S.cmd.bt * 100)); }
    },
    keys(keys, dt) {
      if (mode === 'joy') {
        const ax2 = (a: string, b: string, v: number) => (keys.has(a) ? Math.max(-1, v - 1.2 * dt) : keys.has(b) ? Math.min(1, v + 1.2 * dt) : v);
        joy.fx = ax2('s', 'w', joy.fx); joy.fy = ax2('a', 'd', joy.fy); joy.nz = ax2('q', 'e', joy.nz);
        return;
      }
      if (keys.has('a')) helm.nudge(-20 * DEG * dt); if (keys.has('d')) helm.nudge(20 * DEG * dt);
      if (keys.has('w') || keys.has('s')) for (const l of levers) l.set(Math.max(-1, Math.min(1, l.v + (keys.has('w') ? 0.35 : -0.35) * dt)));
      if (btEl && (keys.has('q') || keys.has('e'))) { S.cmd.bt = Math.max(-1, Math.min(1, S.cmd.bt + (keys.has('e') ? 1 : -1) * 0.8 * dt)); btEl.value = String(Math.round(S.cmd.bt * 100)); }
    },
    keydown(k) {
      if (k === 'x') { zero(); return true; }
      if (k === 'm' && mode !== 'joy') { mid(); return true; }
      if (k === 'j') { setMode(mode === 'joy' ? 'transit' : 'joy'); return true; }
      return false;
    },
    resize() { for (const c of canvases) c.resize(); },
    zero() { zero(); mid(); S.cmd.bt = 0; if (btEl) btEl.value = '0'; },
  };
}

// ================================================================ dynamic positioning
/** Position plot about the setpoint: alarm rings, the voted position, each reference, the heading error. */
class PosPlot extends Canvas {
  trail: [number, number][] = [];
  private t = 0;
  constructor() { super('posplot', 'DP position plot: setpoint at the centre, warning and alarm rings'); }
  draw() {
    const d = S.rt.dps; if (!d || this.w < 60) return;
    const g = this.begin(), cx = this.w / 2, cy = this.h / 2 - 6, R = Math.min(this.w, this.h - 16) / 2 - 6;
    const span = 10, k = R / span, sp = d.sp, psi = S.rt.sensors.out.est.psi;
    // ship-up plot: rotate north-east offsets into ship axes
    const toXY = (n: number, e: number) => { const dn = n - sp.n, de = e - sp.e, c = Math.cos(psi), s2 = Math.sin(psi); const ax = c * dn + s2 * de, ay = -s2 * dn + c * de; return [cx + ay * k, cy - ax * k] as const; };
    if (S.rt.state.t - this.t > 1) { this.t = S.rt.state.t; this.trail.push([d.pos.n, d.pos.e]); if (this.trail.length > 90) this.trail.shift(); }
    g.fillStyle = D.C['panel-solid']; g.beginPath(); g.arc(cx, cy, R, 0, Math.PI * 2); g.fill();
    for (const [r, col, dash] of [[2.5, D.C.muted, [2, 3]], [5, D.C.warn, [4, 3]], [10, D.C.rule, []]] as [number, string, number[]][]) {
      g.strokeStyle = col; g.lineWidth = 1.2; g.setLineDash(dash); g.beginPath(); g.arc(cx, cy, r * k, 0, Math.PI * 2); g.stroke();
    }
    g.setLineDash([]); g.strokeStyle = D.C.rule; g.lineWidth = 1; g.beginPath(); g.moveTo(cx - R, cy); g.lineTo(cx + R, cy); g.moveTo(cx, cy - R); g.lineTo(cx, cy + R); g.stroke();
    // trail
    g.strokeStyle = D.C.muted; g.lineWidth = 1.2; g.beginPath();
    this.trail.forEach(([n, e], i) => { const [x, y] = toXY(n, e); if (i) g.lineTo(x, y); else g.moveTo(x, y); }); g.stroke();
    // references
    const est = S.rt.sensors.out.est, st = S.rt.state;
    d.refs.forEach((r, i) => {
      const base = r.name === 'HPR' ? [st.n, st.e] : [est.n, est.e];
      const [x, y] = toXY(base[0] + r.off[0], base[1] + r.off[1]);
      g.fillStyle = !r.on ? D.C.rule : r.rejected ? D.C.warn : D.C.muted;
      this.font(9, 700); g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(['1', '2', 'H'][i], Math.max(6, Math.min(this.w - 6, x)), Math.max(6, Math.min(this.h - 6, y)));
    });
    // voted position and heading error
    const [px, py] = toXY(d.pos.n, d.pos.e), err = Math.hypot(d.pos.n - sp.n, d.pos.e - sp.e);
    const ep = Math.atan2(Math.sin(sp.psi - psi), Math.cos(sp.psi - psi));
    g.strokeStyle = g.fillStyle = err > 5 ? D.C.warn : D.C.own; g.lineWidth = 2.5;
    g.beginPath(); g.arc(Math.max(4, Math.min(this.w - 4, px)), Math.max(4, Math.min(this.h - 20, py)), 5, 0, Math.PI * 2); g.stroke();
    // heading: the setpoint mark on the rim, offset from the ship's head by the heading error
    const hx = cx + Math.sin(ep) * R, hy = cy - Math.cos(ep) * R;
    g.strokeStyle = D.C.ink; g.lineWidth = 2; g.beginPath(); g.moveTo(cx, cy - R + 2); g.lineTo(cx, cy - R + 12); g.stroke();
    g.fillStyle = D.C.own; g.beginPath(); g.arc(hx, hy, 3.5, 0, Math.PI * 2); g.fill();
    this.num(11); g.fillStyle = err > 5 ? D.C.warn : D.C.ink; g.textAlign = 'center'; g.textBaseline = 'alphabetic';
    g.fillText(`${err.toFixed(1)} m · ${(ep / DEG >= 0 ? '+' : '') + (ep / DEG).toFixed(1)}°`, cx, this.h - 1);
  }
}

/** One mini dial per thruster: forbidden sectors, actual thrust vector, order; tunnels and shafts as bars. */
class ThrusterPanel extends Canvas {
  constructor() { super('thrp', 'Thrusters: actual thrust, order and forbidden sectors'); }
  draw() {
    const d = S.rt.dps; if (!d || this.w < 60) return;
    const g = this.begin(), n = d.acts.length, cw = this.w / n, av = d.avail();
    d.acts.forEach((a, k) => {
      const cx = cw * (k + 0.5), cy = this.h / 2 - 6, R = Math.min(cw / 2 - 4, this.h / 2 - 16);
      const util = d.last?.util[k] ?? 0, out = !av[k];
      this.font(8.5, 700); g.fillStyle = out ? D.C.warn : D.C.muted; g.textAlign = 'center'; g.textBaseline = 'top';
      g.fillText(out ? (d.faults.blackout > 0 ? 'NO POWER' : (d.faults.restart[k] ?? 0) > 0 ? 'STARTING' : 'TRIPPED') : a.label, cx, 0);
      if (a.kind === 'azi') {
        g.fillStyle = D.C['panel-solid']; g.strokeStyle = D.C.rule; g.lineWidth = 1;
        g.beginPath(); g.arc(cx, cy + 4, R, 0, Math.PI * 2); g.fill(); g.stroke();
        g.fillStyle = D.C.warn; g.globalAlpha = 0.25;
        for (const [a0, a1] of a.forbid) { g.beginPath(); g.moveTo(cx, cy + 4); g.arc(cx, cy + 4, R, a0 - Math.PI / 2, a1 - Math.PI / 2); g.closePath(); g.fill(); }
        g.globalAlpha = 1;
        const ps = S.rt.state.pods[a.unit], c = S.cmd.pods[a.unit], L = R * Math.min(1, ps.rpm * ps.rpm);
        g.strokeStyle = out ? D.C.warn : D.C.ink; g.lineWidth = 3; g.lineCap = 'round';
        g.beginPath(); g.moveTo(cx, cy + 4); g.lineTo(cx + Math.sin(ps.alpha) * L, cy + 4 - Math.cos(ps.alpha) * L); g.stroke();
        g.fillStyle = D.C.own; g.beginPath(); g.arc(cx + Math.sin(c.alpha) * R, cy + 4 - Math.cos(c.alpha) * R, 3, 0, Math.PI * 2); g.fill();
      } else {
        const v = a.kind === 'tunnel' ? (a.unit === -1 ? S.rt.state.bt : S.rt.state.sbt ?? 0) : (S.rt.state.pods[a.unit].pitch ?? S.rt.state.pods[a.unit].rpm);
        const horiz = a.kind === 'tunnel', len = R * 1.7;
        g.fillStyle = D.C.rule;
        if (horiz) g.fillRect(cx - len / 2, cy + 2, len, 5); else g.fillRect(cx - 2.5, cy + 4 - len / 2, 5, len);
        g.fillStyle = out ? D.C.warn : D.C.ink;
        if (horiz) g.fillRect(cx, cy + 1, v * len / 2, 7); else g.fillRect(cx - 3.5, cy + 4, 7, -v * len / 2);
      }
      this.num(9.5); g.fillStyle = D.C.ink; g.textAlign = 'center'; g.textBaseline = 'alphabetic';
      g.fillText(`${Math.round(util * 100)}%`, cx, this.h - 1);
    });
  }
}

/** Capability plot: the wind she can hold, by direction off the bow, intact and after the worst single failure. */
class CapPlot extends Canvas {
  cap: ReturnType<typeof capability> | null = null;
  constructor() { super('capplot', 'DP capability: wind speed held by direction, intact and after the worst failure'); }
  draw() {
    if (!this.cap || this.w < 60) return;
    const g = this.begin(), cx = this.w / 2, cy = this.h / 2 - 6, R = Math.min(this.w, this.h - 16) / 2 - 8, vmax = 70;
    g.strokeStyle = D.C.rule; g.lineWidth = 1;
    for (const v of [20, 40, 60]) { g.beginPath(); g.arc(cx, cy, v / vmax * R, 0, Math.PI * 2); g.stroke(); }
    // hull outline at the centre
    g.fillStyle = D.C.muted; g.beginPath(); g.ellipse(cx, cy, R * 0.07, R * 0.22, 0, 0, Math.PI * 2); g.fill();
    const curve = (v: number[], col: string, dash: number[]) => {
      g.strokeStyle = col; g.lineWidth = 2; g.setLineDash(dash); g.beginPath();
      v.forEach((kn, i) => { const a = i * 2 * Math.PI / v.length, r = Math.min(vmax, kn) / vmax * R; const x = cx + Math.sin(a) * r, y = cy - Math.cos(a) * r; if (i) g.lineTo(x, y); else g.moveTo(x, y); });
      g.closePath(); g.stroke(); g.setLineDash([]);
    };
    curve(this.cap.intact, D.C.ink, []);
    curve(this.cap.worst, D.C.warn, [4, 3]);
    // the wind now, relative to the bow
    const w = S.rt.env.windSpeed / 0.514444, rel = S.rt.env.windFrom - S.rt.state.psi, rw = Math.min(vmax, w) / vmax * R;
    g.fillStyle = D.C.own; g.beginPath(); g.arc(cx + Math.sin(rel) * rw, cy - Math.cos(rel) * rw, 4.5, 0, Math.PI * 2); g.fill();
    this.font(8.5); g.fillStyle = D.C.muted; g.textAlign = 'center'; g.textBaseline = 'alphabetic';
    g.fillText(`kn · 1 kn current · worst: ${this.cap.worstUnit}`, cx, this.h - 1);
  }
}

/** DP console: modes, joystick, position plot, thrusters, capability, references, instructor faults. */
export function buildDpStation(host: HTMLElement): Station {
  host.innerHTML = '';
  const canvases: Canvas[] = [];
  const cell = (title: string, right = '', cls = '') => {
    const d = document.createElement('section'); d.className = 'cell ' + cls;
    d.innerHTML = `<div class="tag"><span>${title}</span><b>${right}</b></div>`; host.appendChild(d); return d;
  };
  const dps = () => S.rt.dps!;
  // modes and setpoint
  const mc = cell('DP mode', '', 'dpmode');
  mc.insertAdjacentHTML('beforeend', `<div class="row wrap">${[['joy', 'JOYSTICK'], ['hdg', 'AUTO HDG'], ['auto', 'AUTO POS']].map(([m, t]) => `<button class="cb" data-m="${m}">${t}</button>`).join('')}</div>
    <div class="row wrap sp">${[['f', '▲ 5 m'], ['a', '▼ 5 m'], ['p', '◀ 5 m'], ['s', '▶ 5 m'], ['l', '↺ 5°'], ['r', '↻ 5°']].map(([k, t]) => `<button class="cb" data-sp="${k}">${t}</button>`).join('')}</div>`);
  const modeBtns = [...mc.querySelectorAll<HTMLButtonElement>('[data-m]')];
  const setMode = (m: 'joy' | 'hdg' | 'auto') => { dps().setMode(m, S.rt.sensors.out.est); uiTick('detent'); };
  modeBtns.forEach(b => (b.onclick = () => setMode(b.dataset.m as 'joy')));
  const move = (k: string) => { const d = dps(); if (k === 'f') d.move(5, 0, 0); if (k === 'a') d.move(-5, 0, 0); if (k === 'p') d.move(0, -5, 0); if (k === 's') d.move(0, 5, 0); if (k === 'l') d.move(0, 0, -5 * DEG); if (k === 'r') d.move(0, 0, 5 * DEG); uiTick('step'); };
  mc.querySelectorAll<HTMLButtonElement>('[data-sp]').forEach(b => (b.onclick = () => move(b.dataset.sp!)));
  // joystick
  const jc = cell('Joystick', '', 'dpjoy');
  const joy = new JetJoy(); jc.appendChild(joy.c); canvases.push(joy);
  // position plot
  const pc = cell('Position', 'SETPOINT', 'dppos');
  const pos = new PosPlot(); pc.appendChild(pos.c); canvases.push(pos);
  // thrusters
  const tc = cell('Thrusters', `${dps().acts.length} UNITS`, 'dpthr');
  const thr = new ThrusterPanel(); tc.appendChild(thr.c); canvases.push(thr);
  // capability
  const cc = cell('Capability', 'INTACT · WORST', 'dpcap');
  const cap = new CapPlot(); cc.appendChild(cap.c); canvases.push(cap);
  setTimeout(() => { cap.cap = capability(SHIP, dps().acts); }, 30);
  // references, alarms, instructor
  const rc = cell('References · alarms', '', 'status dpref');
  const stat = document.createElement('div'); stat.className = 'stat'; rc.appendChild(stat);
  const refRow = document.createElement('div'); refRow.className = 'row wrap'; rc.appendChild(refRow);
  refRow.innerHTML = dps().refs.map((r, i) => `<button class="cb" data-r="${i}">${r.name}</button>`).join('');
  refRow.querySelectorAll<HTMLButtonElement>('[data-r]').forEach(b => (b.onclick = () => { const r = dps().refs[+b.dataset.r!]; r.on = !r.on; uiTick('detent'); }));
  const ic = cell('Instructor', 'FAULTS', 'dpins');
  ic.insertAdjacentHTML('beforeend', `<div class="row wrap">${dps().acts.map((a, k) => `<button class="cb" data-f="${k}">TRIP ${a.label}</button>`).join('')}
    <button class="cb warn" data-x="blackout">BLACKOUT</button><button class="cb" data-x="d1">DGNSS 1 DRIFT</button><button class="cb" data-x="common">COMMON DRIFT</button><button class="cb" data-x="reset">RESET</button></div>`);
  ic.querySelectorAll<HTMLButtonElement>('[data-f]').forEach(b => (b.onclick = () => dps().fail(+b.dataset.f!)));
  ic.querySelectorAll<HTMLButtonElement>('[data-x]').forEach(b => (b.onclick = () => {
    const d = dps(), x = b.dataset.x;
    if (x === 'blackout') d.blackout(); else if (x === 'd1') d.drift('DGNSS 1'); else if (x === 'common') d.drift('common', 0.25, S.rt.state.psi);   // the references say she moves ahead: DP drives her astern else d.clearFaults();
  }));
  let statHtml = '';
  return {
    root: host,
    draw() { for (const c of canvases) c.draw(); },
    update() {
      const d = dps();
      d.joy = { x: joy.fx, y: joy.fy, r: joy.nz };
      modeBtns.forEach(b => b.classList.toggle('on', b.dataset.m === d.mode));
      refRow.querySelectorAll<HTMLButtonElement>('[data-r]').forEach((b, i) => { const r = d.refs[i]; b.classList.toggle('on', r.on && !r.rejected); b.classList.toggle('warn', r.rejected); });
      const err = Math.hypot(d.pos.n - d.sp.n, d.pos.e - d.sp.e), al = d.last;
      const P = S.rt.status.podPower.reduce((a, b) => a + b, 0) + S.rt.status.btPower;
      const lim = al && al.residual > 0.05;
      const html = `<div class="k">POSITION</div><div class="v${err > 5 ? ' warn' : ''}">${err.toFixed(1)} m off ${d.mode === 'auto' ? '' : '(not held)'}</div>
        <div class="k">THRUST</div><div class="v${lim ? ' warn' : ''}">${lim ? 'LIMIT · cannot hold' : 'OK'} · ${(Math.max(0, ...(al?.util ?? [0])) * 100).toFixed(0)} % max</div>
        <div class="k">POWER</div><div class="v">${(P / 1e6).toFixed(1)} / ${(SHIP.powerAvail / 1e6).toFixed(1)} MW</div>
        <div class="k">CONSEQUENCE</div><div class="v${d.consequence ? ' warn' : ''}">${d.consequence ? `loss of ${d.consequence} would exceed capability` : 'OK'}</div>`;
      if (html !== statHtml) { statHtml = html; stat.innerHTML = html; }
    },
    keys(keys, dt) {
      const ax = (a: string, b: string, v: number) => (keys.has(a) ? Math.max(-1, v - 1.2 * dt) : keys.has(b) ? Math.min(1, v + 1.2 * dt) : v * Math.max(0, 1 - 3 * dt));
      joy.fx = ax('s', 'w', joy.fx); joy.fy = ax('a', 'd', joy.fy); joy.nz = ax('q', 'e', joy.nz);
    },
    keydown(k) {
      const map: Record<string, string> = { i: 'f', k: 'a', j: 'p', l: 's', u: 'l', o: 'r' };
      if (map[k]) { move(map[k]); return true; }
      if (k === '1') { setMode('joy'); return true; } if (k === '2') { setMode('hdg'); return true; } if (k === '3') { setMode('auto'); return true; }
      if (k === 'x') { joy.fx = joy.fy = joy.nz = 0; return true; }
      return false;
    },
    resize() { for (const c of canvases) c.resize(); },
    zero() { joy.fx = joy.fy = joy.nz = 0; },
  };
}
