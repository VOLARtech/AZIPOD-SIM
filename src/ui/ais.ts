// AIS mini map: a small plot round own ship, turning with the chart (north-up or head-up), with the
// coastline from the traffic's navigation grid, range rings, and every AIS target as a triangle with its
// course-and-speed vector. Targets that will pass too close too soon are red, here and on the chart.
// Tap a target to select it: its details show under the plot and it is framed on the chart.
import { S } from './state';
import * as D from './draw';
import { DEG, KN, SHIP } from '../physics/ship';
import { Traffic } from '../physics/traffic';
import { NavGrid, TrafficAI, cpa, groundVel, navGridFor } from '../physics/aitraffic';

const NM = 1852;
/** Closest approach that counts as dangerous: 0.2 nm in open water, never less than the two ships' half lengths plus 100 m. */
const cpaLimit = (t: Traffic) => Math.max(0.2 * NM, (SHIP.L + t.spec.L) / 2 + 100);
const p3 = (rad: number) => String(Math.round(((rad / DEG) % 360 + 360) % 360)).padStart(3, '0');

/** Range, bearing, CPA and TCPA of every target from own ship's sensed position and ground velocity. */
export function computeAis() {
  const rt = S.rt, est = rt.sensors.out.est, me = { n: est.n, e: est.e, ...groundVel({ psi: est.psi, u: est.u, v: est.v }) };
  for (const t of rt.traffic) {
    const g = groundVel(t.st, t instanceof TrafficAI ? rt.env.current(t.st.n, t.st.e) : [0, 0]);
    const c = cpa(me, { n: t.st.n, e: t.st.e, ...g });
    const a = t.ais;
    a.range = c.range; a.brg = Math.atan2(t.st.e - est.e, t.st.n - est.n);
    a.cpa = c.cpa; a.tcpa = c.tcpa; a.sog = Math.hypot(g.vn, g.ve); a.cog = Math.atan2(g.ve, g.vn);
    a.danger = c.tcpa > 0 && c.tcpa < 600 && c.cpa < cpaLimit(t);
  }
}

const nameOf = (t: Traffic) => (t instanceof TrafficAI ? t.name : t.setup.label);
const statusOf = (t: Traffic) => (t instanceof TrafficAI ? t.status : 'Under way using engine');
const RANGES = [0.25, 0.5, 0.75, 1, 1.5, 2, 3, 4, 6];        // nm

export class AisMap {
  /** 0: fit the targets; otherwise a fixed range in nm. */
  range = 0;
  private shown = 1; private size = 0;
  private land: HTMLCanvasElement | null = null; private landOf: NavGrid | null = null;
  private pos = new Map<Traffic, [number, number]>();
  constructor(private c: HTMLCanvasElement, private info: HTMLElement, private rangeBtn: HTMLElement) {}
  /** Range button: auto, then each fixed range in turn. */
  cycle() { const k = this.range ? RANGES.indexOf(this.range) : -1; this.range = k < 0 ? RANGES[0] : k === RANGES.length - 1 ? 0 : RANGES[k + 1]; }
  /** The target nearest a tap on the plot, if one is close enough. */
  pick(x: number, y: number) {
    let best: Traffic | null = null, d0 = 22;
    for (const [t, [px, py]] of this.pos) { const d = Math.hypot(px - x, py - y); if (d < d0) { d0 = d; best = t; } }
    return best;
  }
  /** Coastline and shallows of the traffic's grid, one pixel a cell, north row last (drawn flipped). */
  private landImage(G: NavGrid) {
    if (this.landOf === G && this.land) return this.land;
    const cv = document.createElement('canvas'); cv.width = cv.height = G.N;
    const g = cv.getContext('2d')!, img = g.createImageData(G.N, G.N), shoal = SHIP.T + 1;
    for (let i = 0; i < G.N; i++) for (let j = 0; j < G.N; j++) {
      const d = G.depth[i * G.N + j], k = (i * G.N + j) * 4;
      const [r, gr, b, a] = d <= 0 ? [92, 82, 52, 255] : d < shoal ? [38, 72, 92, 255] : [0, 0, 0, 0];
      img.data[k] = r; img.data[k + 1] = gr; img.data[k + 2] = b; img.data[k + 3] = a;
    }
    g.putImageData(img, 0, 0);
    this.land = cv; this.landOf = G;
    return cv;
  }
  draw() {
    const c = this.c, w = c.clientWidth; if (w < 40) return;
    const dpr = Math.min(2, devicePixelRatio || 1);
    if (this.size !== w) { this.size = w; c.width = c.height = Math.round(w * dpr); }
    const g = c.getContext('2d')!, K = D.K, est = S.rt.sensors.out.est, rot = S.view.rot;
    const list = S.rt.traffic;
    // range: fit every target (up to 6 nm), or the one chosen
    const far = Math.max(0.2, ...list.map(t => Math.min(6, t.ais.range / NM * 1.15)));
    this.shown = this.range || (RANGES.find(r => r >= far) ?? 6);
    this.rangeBtn.textContent = `${this.shown} NM`; this.rangeBtn.classList.toggle('auto', !this.range); this.rangeBtn.title = this.range ? 'Fixed range: tap for the next' : 'Range fits the targets: tap to fix it';
    const cx = w / 2, cy = w / 2, Rp = w / 2 - 6, k = Rp / (this.shown * NM);
    const toMap = (n: number, e: number): [number, number] => {
      const dx = (e - est.e) * k, dy = -(n - est.n) * k, a = -rot;
      return [cx + dx * Math.cos(a) - dy * Math.sin(a), cy + dx * Math.sin(a) + dy * Math.cos(a)];
    };
    g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, w, w);
    // face, clipped round
    g.save(); g.beginPath(); g.arc(cx, cy, Rp, 0, Math.PI * 2); g.clip();
    g.fillStyle = '#0d1820'; g.fillRect(0, 0, w, w);
    const G = navGridFor(S.sc.id);
    if (G) {
      g.save(); g.translate(cx, cy); g.rotate(-rot); g.scale(k, -k); g.translate(-est.e, -est.n);
      g.imageSmoothingEnabled = true;
      g.drawImage(this.landImage(G), G.e0 - G.half, G.n0 - G.half, 2 * G.half, 2 * G.half);
      g.restore();
    }
    // range rings and north
    g.strokeStyle = 'rgba(255, 255, 255, 0.14)'; g.lineWidth = 1;
    for (const f of [0.5, 1]) { g.beginPath(); g.arc(cx, cy, Rp * f - 0.5, 0, Math.PI * 2); g.stroke(); }
    g.restore();
    g.strokeStyle = 'rgba(255, 255, 255, 0.22)'; g.lineWidth = 1.5; g.beginPath(); g.arc(cx, cy, Rp, 0, Math.PI * 2); g.stroke();
    g.font = `500 9px ${K.fontNum}`; g.fillStyle = K.muted; g.textAlign = 'left'; g.textBaseline = 'middle';
    g.fillText(`${this.shown / 2}`, cx + Rp * 0.5 * Math.SQRT1_2 + 2, cy + Rp * 0.5 * Math.SQRT1_2 + 2);
    const nx = cx + Math.sin(-rot) * (Rp - 8), ny = cy - Math.cos(-rot) * (Rp - 8);
    g.font = `700 10px ${K.fontLabel}`; g.fillStyle = K.own; g.textAlign = 'center'; g.fillText('N', nx, ny);
    // own ship: heading line to the rim and her outline at this scale (a mark if smaller)
    const hd = est.psi - rot;
    g.setLineDash([3, 3]); g.strokeStyle = 'rgba(255, 255, 255, 0.35)'; g.lineWidth = 1;
    g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + Math.sin(hd) * Rp, cy - Math.cos(hd) * Rp); g.stroke(); g.setLineDash([]);
    this.hull(g, cx, cy, hd, Math.max(10, SHIP.L * k), Math.max(5, SHIP.B * k * 1.6), K.own, K.own);
    // targets
    this.pos.clear();
    const vec = S.disp.vecMin * 60;
    for (const t of list) {
      const a = t.ais, [x, y] = toMap(t.st.n, t.st.e);
      if (Math.hypot(x - cx, y - cy) > Rp + 4) continue;
      this.pos.set(t, [x, y]);
      const sel = S.traffic.sel === t, col = a.danger ? K.warn : K.ink;
      const anch = t instanceof TrafficAI && t.anchor;
      if (a.sog > 0.2) {
        const [vx, vy] = toMap(t.st.n + Math.cos(a.cog) * a.sog * vec, t.st.e + Math.sin(a.cog) * a.sog * vec);
        g.strokeStyle = col; g.lineWidth = 1.2; g.beginPath(); g.moveTo(x, y); g.lineTo(vx, vy); g.stroke();
      }
      if (anch) { g.strokeStyle = col; g.lineWidth = 1.5; g.beginPath(); g.arc(x, y, 4.5, 0, Math.PI * 2); g.stroke(); g.fillStyle = col; g.beginPath(); g.arc(x, y, 1.5, 0, Math.PI * 2); g.fill(); }
      else this.hull(g, x, y, t.st.psi - rot, Math.max(11, t.spec.L * k), Math.max(7, t.spec.B * k * 1.6), col, null);
      if (sel) { g.strokeStyle = K.own; g.lineWidth = 1.8; g.strokeRect(x - 9, y - 9, 18, 18); }
      if (sel || a.danger) { g.font = `600 9.5px ${K.fontLabel}`; g.fillStyle = sel ? K.own : col; g.textAlign = x > cx ? 'right' : 'left'; g.fillText(nameOf(t), x + (x > cx ? -12 : 12), y - 9); }
    }
    this.text();
  }
  /** A ship as an AIS triangle along her heading (her outline's length when she is big enough at this scale). */
  private hull(g: CanvasRenderingContext2D, x: number, y: number, hd: number, L: number, B: number, stroke: string, fill: string | null) {
    const ux = Math.sin(hd), uy = -Math.cos(hd), h = Math.min(L, 40) / 2, b = Math.min(B, 14) / 2;
    g.beginPath(); g.moveTo(x + ux * h, y + uy * h); g.lineTo(x - ux * h - uy * b, y - uy * h + ux * b); g.lineTo(x - ux * h + uy * b, y - uy * h - ux * b); g.closePath();
    g.fillStyle = fill ?? '#0d1820'; g.fill(); g.strokeStyle = stroke; g.lineWidth = 1.6; g.stroke();
  }
  private html = '';
  /** Under the plot: the selected target in full, otherwise the count and how many are close. */
  private text() {
    const list = S.rt.traffic, t = S.traffic.sel && list.includes(S.traffic.sel) ? S.traffic.sel : null;
    let html: string;
    if (t) {
      const a = t.ais, ai = t instanceof TrafficAI ? t : null, st = statusOf(t);
      const cpaTxt = a.tcpa > 0 && a.tcpa < 3600 ? `CPA ${(a.cpa / NM).toFixed(2)} nm in ${(a.tcpa / 60).toFixed(1)} min` : 'opening';
      html = `<b class="${a.danger ? 'warn' : ''}">${nameOf(t)}</b><span>${ai?.kind ?? 'Vessel'} · ${t.spec.LOA.toFixed(0)} × ${t.spec.B.toFixed(0)} m<span class="xt"> · T ${t.spec.T.toFixed(1)} m${ai ? ` · MMSI ${ai.mmsi}` : ''}</span></span>`
        + `<span>${(a.range / NM).toFixed(2)} nm ${p3(a.brg)}° · ${st === 'Under way using engine' ? `${(a.sog / KN).toFixed(1)} kn ${p3(a.cog)}°` : st === 'At anchor' ? 'at anchor' : st.toLowerCase()}</span>`
        + `<span class="${a.danger ? 'warn' : ''}">${cpaTxt}${ai?.dest ? `<span class="xt"> · bound ${ai.dest}</span>` : ''}</span>`;
    } else {
      const close = list.filter(x => x.ais.danger);
      html = `<span>${list.length} target${list.length === 1 ? '' : 's'}${close.length ? ` · <b class="warn">${close.length} close: ${close.map(nameOf).join(', ')}</b>` : ''}</span><span class="hint">Tap a ship for its details</span>`;
    }
    if (html !== this.html) { this.html = html; this.info.innerHTML = html; }
  }
}
