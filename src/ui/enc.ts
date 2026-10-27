// Real-chart layers (ENC-derived, see tools/chart): depth shades relative to the ship's safety
// contour, contours, spot soundings, dredged areas, land, wharves and piers, buoys and lights.
// Drawn in world coordinates on the chart context (x = east, y = north).
import { SHIP } from '../physics/ship';

type Ring = [number, number];
interface ChartData {
  depare: { d1: number | null; d2: number | null; rings: Ring[][] }[];
  drgare: { d: number | null; name?: string; rings: Ring[][] }[];
  land: Ring[][][];
  contours: { v: number | null; pts: Ring[] }[];
  soundings: [number, number, number][];
  slcons: { c: number | null; pts: Ring[] }[];
  aids: { k: string; n: number; e: number; col: string[]; objnam?: string; catlam?: number; litchr?: number; sigper?: number; siggrp?: string; boyshp?: number; bcnshp?: number }[];
  labels: { k: string; n: number; e: number; t: string }[];
  bridges: { rings: Ring[][]; verclr?: number; name?: string }[];
}
const LOADERS: Record<string, () => Promise<{ default: unknown }>> = {
  miami: () => import('../scenes/miami.chart.json'),
};

interface Built {
  data: ChartData;
  shade: Record<'it' | 'vs' | 'ms' | 'md' | 'dw', Path2D>;
  land: Path2D; slc: Path2D; contours: Path2D; safety: Path2D; drg: Path2D; bridges: Path2D;
  safetyDepth: number; contourValue: number;
  soundGrid: Map<string, [number, number, number][]>;
}
const cache = new Map<string, ChartData>();
let built: Built | null = null, builtKey = '';

export async function loadEnc(id: string) {
  if (cache.has(id)) return;
  const m = await LOADERS[id]();
  cache.set(id, m.default as ChartData);
}

const ringPath = (p: Path2D, r: Ring[]) => { r.forEach(([n, e], i) => (i ? p.lineTo(e, n) : p.moveTo(e, n))); p.closePath(); };
const linePath = (p: Path2D, r: Ring[]) => { r.forEach(([n, e], i) => (i ? p.lineTo(e, n) : p.moveTo(e, n))); };

/** Safety depth = draught + 2 m; safety contour = shallowest charted contour at or below it (S-52). */
function build(id: string): Built {
  const data = cache.get(id)!;
  const safetyDepth = SHIP.T + 2;
  const vals = [...new Set(data.contours.map(c => c.v).filter((v): v is number => v !== null))].sort((a, b) => a - b);
  const contourValue = vals.find(v => v >= safetyDepth) ?? vals[vals.length - 1];
  const shade = { it: new Path2D(), vs: new Path2D(), ms: new Path2D(), md: new Path2D(), dw: new Path2D() };
  const cls = (d: number | null) => d === null ? 'dw' : d < 0 ? 'it' : d < 2 ? 'vs' : d < contourValue ? 'ms' : d < 2 * contourValue ? 'md' : 'dw';
  for (const a of data.depare) for (const r of a.rings) ringPath(shade[cls(a.d1)], r);
  // dredged areas are maintained depths: shade them by their own depth
  for (const a of data.drgare) for (const r of a.rings) ringPath(shade[cls(a.d)], r);
  const land = new Path2D(); for (const p of data.land) for (const r of p) ringPath(land, r);
  const slc = new Path2D(); for (const l of data.slcons) linePath(slc, l.pts);
  const contours = new Path2D(), safety = new Path2D();
  for (const c of data.contours) linePath(c.v === contourValue ? safety : contours, c.pts);
  const drg = new Path2D(); for (const a of data.drgare) for (const r of a.rings) ringPath(drg, r);
  const bridges = new Path2D(); for (const b of data.bridges) for (const r of b.rings) ringPath(bridges, r);
  // soundings bucketed on a 200 m grid for viewport culling
  const soundGrid = new Map<string, [number, number, number][]>();
  for (const s of data.soundings) {
    const k = `${Math.floor(s[0] / 200)},${Math.floor(s[1] / 200)}`;
    (soundGrid.get(k) ?? soundGrid.set(k, []).get(k)!).push(s);
  }
  return { data, shade, land, slc, contours, safety, drg, bridges, safetyDepth, contourValue, soundGrid };
}

function get(id: string) {
  const key = id + '|' + SHIP.id;
  if (!built || builtKey !== key) { if (!cache.has(id)) return null; built = build(id); builtKey = key; }
  return built;
}

export interface EncView { ctx: CanvasRenderingContext2D; px: (p: number) => number; scale: number; C: Record<string, string>;
  bounds: [number, number, number, number]; toScr: (n: number, e: number) => [number, number] }

/** Depth shades, land and structures (under the ship and the traffic). */
export function drawEncBase(id: string, v: EncView) {
  const b = get(id); if (!b) return false;
  const { ctx, px, C } = v;
  for (const k of ['dw', 'md', 'ms', 'vs', 'it'] as const) { ctx.fillStyle = C['dep-' + k]; ctx.fill(b.shade[k], 'evenodd'); }
  ctx.lineWidth = px(0.8); ctx.strokeStyle = C.contour; ctx.stroke(b.contours);
  ctx.lineWidth = px(1.8); ctx.strokeStyle = C.safety; ctx.stroke(b.safety);
  ctx.setLineDash([px(5), px(4)]); ctx.lineWidth = px(1); ctx.strokeStyle = C.muted; ctx.stroke(b.drg); ctx.setLineDash([]);
  ctx.fillStyle = C.land; ctx.fill(b.land, 'evenodd');
  ctx.lineWidth = px(1.2); ctx.strokeStyle = C['land-edge']; ctx.stroke(b.land);
  ctx.lineWidth = px(1.6); ctx.stroke(b.slc);
  ctx.setLineDash([px(3), px(3)]); ctx.lineWidth = px(1); ctx.strokeStyle = C.ink; ctx.stroke(b.bridges); ctx.setLineDash([]);
  return true;
}

/** Soundings, aids to navigation and names. Screen space: call with the context at device-pixel scale. */
export function drawEncMarks(id: string, v: EncView) {
  const b = get(id); if (!b) return;
  const { ctx, scale, C, bounds: [n0, e0, n1, e1], toScr } = v;
  // spot soundings once there is room for them (≈ 1:6 000 and closer)
  if (scale > 0.22) {
    ctx.font = `500 ${scale > 0.6 ? 11 : 10}px ${C.fontNum}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const step = scale > 0.6 ? 0 : 18;                 // thin out when zoomed further out
    const placed: [number, number][] = [];
    for (let i = Math.floor(n0 / 200); i <= Math.floor(n1 / 200); i++) for (let j = Math.floor(e0 / 200); j <= Math.floor(e1 / 200); j++) {
      for (const [n, e, d] of b.soundGrid.get(`${i},${j}`) ?? []) {
        const [x, y] = toScr(n, e);
        if (step && placed.some(([px2, py2]) => Math.abs(px2 - x) < step && Math.abs(py2 - y) < step * 0.7)) continue;
        placed.push([x, y]);
        const shallow = d < b.safetyDepth;
        ctx.fillStyle = shallow ? C['sound-sh'] : C.sound;
        const whole = Math.floor(d), dec = Math.round((d - whole) * 10);
        // chart style: whole metres with the decimetres as a lowered digit
        ctx.fillText(String(whole), x - (dec ? 3 : 0), y);
        if (dec && whole < 21) { ctx.font = `500 ${scale > 0.6 ? 8 : 7}px ${C.fontNum}`; ctx.fillText(String(dec), x + (whole >= 10 ? 9 : 5), y + 4); ctx.font = `500 ${scale > 0.6 ? 11 : 10}px ${C.fontNum}`; }
      }
    }
  }
  // aids to navigation
  for (const a of b.data.aids) {
    if (a.n < n0 || a.n > n1 || a.e < e0 || a.e > e1) continue;
    const [x, y] = toScr(a.n, a.e);
    const red = a.col.includes('red'), green = a.col.includes('green');
    const col = red ? C.port : green ? C.stbd : a.col.includes('yellow') ? '#d9b400' : C.ink;
    if (a.k === 'LIGHTS') {
      // light flare
      ctx.save(); ctx.translate(x, y); ctx.rotate(Math.PI * 0.75);
      ctx.fillStyle = red ? C.port : green ? C.stbd : C['aid-light']; ctx.globalAlpha = 0.85;
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(4, 7, 0, 14); ctx.quadraticCurveTo(-4, 7, 0, 0); ctx.fill();
      ctx.restore(); ctx.globalAlpha = 1;
      continue;
    }
    ctx.fillStyle = col; ctx.strokeStyle = C.ink; ctx.lineWidth = 1;
    ctx.beginPath();
    if (a.k.startsWith('BCN')) { ctx.rect(x - 1.5, y - 9, 3, 9); }
    else if (a.boyshp === 1 || (green && !a.boyshp)) { ctx.moveTo(x - 5, y); ctx.lineTo(x + 5, y); ctx.lineTo(x + 3, y - 8); ctx.lineTo(x - 3, y - 8); ctx.closePath(); }   // can
    else if (a.boyshp === 2 || red) { ctx.moveTo(x - 5, y); ctx.lineTo(x + 5, y); ctx.lineTo(x, y - 10); ctx.closePath(); }                                          // cone (nun)
    else ctx.arc(x, y - 4, 4, 0, Math.PI * 2);
    ctx.fill(); ctx.stroke();
    if (scale > 0.3 && a.objnam) {
      ctx.font = `italic 500 10px ${C.fontNum}`; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillStyle = C.ink;
      ctx.fillText(a.objnam.replace(/^Miami (Harbor|Main Channel) /, '').slice(0, 24), x + 8, y - 4);
    }
  }
  // names: berths and fairways once zoomed in
  if (scale > 0.25) {
    ctx.font = `italic 500 11px ${C.fontLabel}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = C.muted;
    for (const l of b.data.labels) {
      if (l.n < n0 || l.n > n1 || l.e < e0 || l.e > e1) continue;
      const [x, y] = toScr(l.n, l.e);
      ctx.fillText(l.t.replace(/ \(Bays [^)]*\)/, ''), x, y);
    }
  }
}

export function encInfo(id: string) { const b = get(id); return b ? { safetyDepth: b.safetyDepth, contour: b.contourValue } : null; }
