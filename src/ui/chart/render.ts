// The chart, drawn the way an ECDIS does (S-52 in spirit): depth shades relative to the ship's own safety
// contour, contours with the safety contour bold, land and shoreline constructions, dredged areas and
// bridges, spot soundings (shallower than the safety depth in black), aids to navigation and names.
// Large charts are cut into 1 km tiles, each built when first seen at one of three levels of detail
// (Douglas–Peucker 0 / 3 / 15 m), so only what is on the screen, at the detail the zoom needs, is drawn.
import { SHIP } from '../../physics/ship';
import type { Aid, ChartModel, Ring } from './model';
import { completeAid } from './marks';
import { drawAid, type SymbolPalette } from './symbols';

const TILE = 1000, TOL = [0, 3, 15];
type Cls = 'it' | 'vs' | 'ms' | 'md' | 'dw';
const CLASSES: Cls[] = ['dw', 'md', 'ms', 'vs', 'it'];
type BB = [number, number, number, number];
interface Item { ring: Ring[]; bb: BB; simp: (Ring[] | null)[] }
interface Tile {
  shade: Record<Cls, Path2D>; land: Path2D; landEdge: Path2D; slc: Path2D; contours: Path2D; safety: Path2D; drg: Path2D; bridges: Path2D;
}
interface Built {
  model: ChartModel; safetyDepth: number; contourValue: number;
  areas: (Item & { cls: Cls })[]; land: Item[]; drg: Item[]; bridges: Item[]; slc: Item[]; contours: (Item & { safety: boolean })[];
  index: Map<number, { areas: number[]; land: number[]; drg: number[]; bridges: number[]; slc: number[]; contours: number[] }>;
  tiles: Map<number, Tile>[];        // per level of detail
  soundGrid: Map<number, [number, number, number][]>;
  aids: Aid[];
}

const bbOf = (r: Ring[]): BB => { let a = Infinity, b = Infinity, c = -Infinity, d = -Infinity; for (const [n, e] of r) { if (n < a) a = n; if (e < b) b = e; if (n > c) c = n; if (e > d) d = e; } return [a, b, c, d]; };
const tkey = (i: number, j: number) => (i + 32768) * 65536 + (j + 32768);

/** Douglas–Peucker, keeping closed rings closed (at least a triangle) and lines at least their ends. */
export function simplify(r: Ring[], tol: number, closed: boolean): Ring[] | null {
  if (tol <= 0 || r.length <= 3) return r;
  const keep = new Uint8Array(r.length); keep[0] = keep[r.length - 1] = 1;
  const stack: [number, number][] = [[0, r.length - 1]], t2 = tol * tol;
  while (stack.length) {
    const [i0, i1] = stack.pop()!;
    const [an, ae] = r[i0], [bn, be] = r[i1], dn = bn - an, de = be - ae, l2 = dn * dn + de * de;
    let best = -1, bd = t2;
    for (let i = i0 + 1; i < i1; i++) {
      const pn = r[i][0] - an, pe = r[i][1] - ae;
      const d = l2 > 0 ? (() => { const t = Math.max(0, Math.min(1, (pn * dn + pe * de) / l2)); return (pn - t * dn) ** 2 + (pe - t * de) ** 2; })() : pn * pn + pe * pe;
      if (d > bd) { bd = d; best = i; }
    }
    if (best > 0) { keep[best] = 1; stack.push([i0, best], [best, i1]); }
  }
  const out = r.filter((_, i) => keep[i]);
  if (closed && out.length < 4) { const bb = bbOf(r); return (bb[2] - bb[0]) < tol && (bb[3] - bb[1]) < tol ? null : r; }
  return out;
}
/** Sutherland–Hodgman: a ring clipped to a box. */
function clipRing(r: Ring[], [n0, e0, n1, e1]: BB): Ring[] {
  let out = r;
  const edges: [(p: Ring) => boolean, (a: Ring, b: Ring) => Ring][] = [
    [p => p[0] >= n0, (a, b) => { const t = (n0 - a[0]) / (b[0] - a[0]); return [n0, a[1] + t * (b[1] - a[1])]; }],
    [p => p[0] <= n1, (a, b) => { const t = (n1 - a[0]) / (b[0] - a[0]); return [n1, a[1] + t * (b[1] - a[1])]; }],
    [p => p[1] >= e0, (a, b) => { const t = (e0 - a[1]) / (b[1] - a[1]); return [a[0] + t * (b[0] - a[0]), e0]; }],
    [p => p[1] <= e1, (a, b) => { const t = (e1 - a[1]) / (b[1] - a[1]); return [a[0] + t * (b[0] - a[0]), e1]; }],
  ];
  for (const [inside, cut] of edges) {
    if (!out.length) break;
    const inp = out; out = [];
    for (let i = 0; i < inp.length; i++) {
      const p = inp[i], q = inp[(i + inp.length - 1) % inp.length];
      if (inside(p)) { if (!inside(q)) out.push(cut(q, p)); out.push(p); }
      else if (inside(q)) out.push(cut(q, p));
    }
  }
  return out;
}
/** Liang–Barsky: the runs of a polyline inside a box. */
function clipLine(r: Ring[], [n0, e0, n1, e1]: BB, closed: boolean): Ring[][] {
  const runs: Ring[][] = []; let cur: Ring[] | null = null;
  const m = closed ? r.length : r.length - 1;
  for (let i = 0; i < m; i++) {
    const a = r[i], b = r[(i + 1) % r.length];
    let t0 = 0, t1 = 1; const dn = b[0] - a[0], de = b[1] - a[1];
    const p = [-dn, dn, -de, de], q = [a[0] - n0, n1 - a[0], a[1] - e0, e1 - a[1]];
    let ok = true;
    for (let k = 0; k < 4 && ok; k++) {
      if (p[k] === 0) { if (q[k] < 0) ok = false; }
      else { const t = q[k] / p[k]; if (p[k] < 0) { if (t > t1) ok = false; else if (t > t0) t0 = t; } else { if (t < t0) ok = false; else if (t < t1) t1 = t; } }
    }
    if (!ok) { cur = null; continue; }
    const s: Ring = [a[0] + t0 * dn, a[1] + t0 * de], f: Ring = [a[0] + t1 * dn, a[1] + t1 * de];
    if (!cur || t0 > 0) { cur = [s]; runs.push(cur); }
    cur.push(f);
    if (t1 < 1) cur = null;
  }
  return runs;
}

const ring = (p: Path2D, r: Ring[]) => { r.forEach(([n, e], i) => (i ? p.lineTo(e, n) : p.moveTo(e, n))); p.closePath(); };
const line = (p: Path2D, r: Ring[]) => { r.forEach(([n, e], i) => (i ? p.lineTo(e, n) : p.moveTo(e, n))); };

/** Safety depth = draught + 2 m; safety contour = the shallowest charted contour at or below it (S-52). */
function build(model: ChartModel, T: number): Built {
  const safetyDepth = T + 2;
  const vals = [...new Set(model.contours.map(c => c.v).filter((v): v is number => v !== null))].sort((a, b) => a - b);
  const contourValue = vals.find(v => v >= safetyDepth) ?? vals[vals.length - 1] ?? safetyDepth;
  const cls = (d: number | null): Cls => d === null ? 'dw' : d < 0 ? 'it' : d < 2 ? 'vs' : d < contourValue ? 'ms' : d < 2 * contourValue ? 'md' : 'dw';
  const item = (r: Ring[]): Item => ({ ring: r, bb: bbOf(r), simp: [r, null, null] });
  const areas = [...model.depare.flatMap(a => a.rings.map(r => ({ ...item(r), cls: cls(a.d1) }))),
    // dredged areas are maintained depths: shade them by their own depth
    ...model.drgare.flatMap(a => a.rings.map(r => ({ ...item(r), cls: cls(a.d) })))];
  const land = model.land.flatMap(p => p.map(item));
  const drg = model.drgare.flatMap(a => a.rings.map(item));
  const bridges = model.bridges.flatMap(b => b.rings.map(item));
  const slc = model.slcons.map(l => item(l.pts));
  const contours = model.contours.map(c => ({ ...item(c.pts), safety: c.v === contourValue }));
  const index: Built['index'] = new Map();
  const add = (list: Item[], key: 'areas' | 'land' | 'drg' | 'bridges' | 'slc' | 'contours') => list.forEach((it, k) => {
    for (let i = Math.floor(it.bb[0] / TILE); i <= Math.floor(it.bb[2] / TILE); i++) for (let j = Math.floor(it.bb[1] / TILE); j <= Math.floor(it.bb[3] / TILE); j++) {
      const t = tkey(i, j); let x = index.get(t);
      if (!x) index.set(t, x = { areas: [], land: [], drg: [], bridges: [], slc: [], contours: [] });
      x[key].push(k);
    }
  });
  add(areas, 'areas'); add(land, 'land'); add(drg, 'drg'); add(bridges, 'bridges'); add(slc, 'slc'); add(contours, 'contours');
  const soundGrid = new Map<number, [number, number, number][]>();
  for (const s of model.soundings) { const k = tkey(Math.floor(s[0] / 200), Math.floor(s[1] / 200)); (soundGrid.get(k) ?? soundGrid.set(k, []).get(k)!).push(s); }
  return { model, safetyDepth, contourValue, areas, land, drg, bridges, slc, contours, index, tiles: [new Map(), new Map(), new Map()], soundGrid, aids: model.aids.map(a => completeAid(a, model.meta.iala)) };
}

function tile(b: Built, i: number, j: number, lod: number): Tile | null {
  const key = tkey(i, j), x = b.index.get(key); if (!x) return null;
  let t = b.tiles[lod].get(key);
  if (t) return t;
  const m = 0.5, box: BB = [i * TILE - m, j * TILE - m, (i + 1) * TILE + m, (j + 1) * TILE + m];
  const simp = (it: Item, closed: boolean) => (it.simp[lod] === null && lod ? (it.simp[lod] = simplify(it.ring, TOL[lod], closed) ?? []) : it.simp[lod] ?? it.ring);
  t = { shade: { it: new Path2D(), vs: new Path2D(), ms: new Path2D(), md: new Path2D(), dw: new Path2D() }, land: new Path2D(), landEdge: new Path2D(), slc: new Path2D(), contours: new Path2D(), safety: new Path2D(), drg: new Path2D(), bridges: new Path2D() };
  const inside = (bb: BB) => bb[0] >= box[0] && bb[2] <= box[2] && bb[1] >= box[1] && bb[3] <= box[3];
  const fill = (p: Path2D, it: Item) => { const r = simp(it, true); if (r.length < 3) return; const c = inside(it.bb) ? r : clipRing(r, box); if (c.length >= 3) ring(p, c); };
  const edge = (p: Path2D, it: Item, closed: boolean) => { const r = simp(it, closed); if (r.length < 2) return; if (inside(it.bb)) { if (closed) ring(p, r); else line(p, r); } else for (const run of clipLine(r, box, closed)) line(p, run); };
  for (const k of x.areas) fill(t.shade[b.areas[k].cls], b.areas[k]);
  // small structures (a dolphin, a pile) only when zoomed in, as on an ECDIS (S-52 SCAMIN): further out a row of
  // them reads as a grid of dots
  const minLand = lod === 0 ? 0 : lod === 1 ? 12 : 40;
  for (const k of x.land) { const it = b.land[k]; if (minLand && Math.max(it.bb[2] - it.bb[0], it.bb[3] - it.bb[1]) < minLand) continue; fill(t.land, it); edge(t.landEdge, it, true); }
  for (const k of x.drg) edge(t.drg, b.drg[k], true);
  for (const k of x.bridges) edge(t.bridges, b.bridges[k], true);
  for (const k of x.slc) edge(t.slc, b.slc[k], false);
  // a contour ringing a speck (a pile the survey saw as a shoal) is noise at any scale, a small one zoomed out
  const minCnt = lod === 0 ? 12 : lod === 1 ? 40 : 150;
  for (const k of x.contours) { const c = b.contours[k]; if (Math.max(c.bb[2] - c.bb[0], c.bb[3] - c.bb[1]) < minCnt) continue; edge(c.safety ? t.safety : t.contours, c, false); }
  b.tiles[lod].set(key, t);
  return t;
}

const builtFor = new WeakMap<ChartModel, { T: number; b: Built }>();
function get(model: ChartModel) {
  const c = builtFor.get(model);
  if (c && c.T === SHIP.T) return c.b;
  const b = build(model, SHIP.T);
  builtFor.set(model, { T: SHIP.T, b });
  return b;
}

export interface ChartView { ctx: CanvasRenderingContext2D; px: (p: number) => number; scale: number; C: Record<string, string>;
  bounds: [number, number, number, number]; toScr: (n: number, e: number) => [number, number]; rot?: number }

/** Depth shades, contours, land and structures (under the ship and the traffic). World coordinates. */
export function drawChartBase(model: ChartModel, v: ChartView) {
  const b = get(model), { ctx, px, C, scale } = v, [n0, e0, n1, e1] = v.bounds;
  const lod = scale > 0.5 ? 0 : scale > 0.1 ? 1 : 2;
  const ts: Tile[] = [];
  for (let i = Math.floor(n0 / TILE); i <= Math.floor(n1 / TILE); i++) for (let j = Math.floor(e0 / TILE); j <= Math.floor(e1 / TILE); j++) { const t = tile(b, i, j, lod); if (t) ts.push(t); }
  for (const k of CLASSES) { ctx.fillStyle = C['dep-' + k]; for (const t of ts) ctx.fill(t.shade[k], model.fill); }
  ctx.lineWidth = px(0.8); ctx.strokeStyle = C.contour; for (const t of ts) ctx.stroke(t.contours);
  ctx.lineWidth = px(1.8); ctx.strokeStyle = C.safety; for (const t of ts) ctx.stroke(t.safety);
  ctx.setLineDash([px(5), px(4)]); ctx.lineWidth = px(1); ctx.strokeStyle = C.muted; for (const t of ts) ctx.stroke(t.drg); ctx.setLineDash([]);
  ctx.fillStyle = C.land; for (const t of ts) ctx.fill(t.land, model.fill);
  ctx.lineWidth = px(1.2); ctx.strokeStyle = C['land-edge']; for (const t of ts) ctx.stroke(t.landEdge);
  ctx.lineWidth = px(1.6); for (const t of ts) ctx.stroke(t.slc);
  ctx.setLineDash([px(3), px(3)]); ctx.lineWidth = px(1); ctx.strokeStyle = C.ink; for (const t of ts) ctx.stroke(t.bridges); ctx.setLineDash([]);
}

/** Screen boxes already written on, hashed in 48 px cells: nothing is drawn over a name, a light's
 *  characteristic or a sounding already placed. */
class Room {
  private g = new Map<number, [number, number, number, number][]>();
  private cells(b: [number, number, number, number], f: (k: number) => boolean | void) {
    for (let i = Math.floor(b[0] / 48); i <= Math.floor(b[2] / 48); i++) for (let j = Math.floor(b[1] / 48); j <= Math.floor(b[3] / 48); j++) if (f(i * 131071 + j)) return true;
    return false;
  }
  /** Take the box if it is free; false if something is already there. */
  take(b: [number, number, number, number]) {
    const hit = this.cells(b, k => (this.g.get(k) ?? []).some(o => o[0] < b[2] && o[2] > b[0] && o[1] < b[3] && o[3] > b[1]));
    if (hit) return false;
    this.cells(b, k => { let a = this.g.get(k); if (!a) this.g.set(k, a = []); a.push(b); });
    return true;
  }
}
// names from the inland ENC come as "Ligplaats <harbour> <quay> <town>": the berth, without the boilerplate
const TOWN = /\s+(IJmuiden|Velsen-Noord|Velsen-Zuid|Velsen|Amsterdam|Zaandam|Spaarndam|Beverwijk|Assendelft|Haarlem|Halfweg|Zaanstad|Westzaan|Oostzaan|Wijk aan Zee)$/;
export function labelText(t: string) {
  let s = t.replace(/ \(Bays [^)]*\)/, '').replace(/^Berth Ligplaats /, '').replace(/^Ligplaats /, '').replace(/^Sluiskolk /, '');
  for (let k = 0; k < 2; k++) s = s.replace(TOWN, '');
  return s.length > 34 ? s.slice(0, 32).replace(/\s+\S*$/, '') + '…' : s;
}
// which names go first where they compete: locks and harbours, then fairways and terminals, then berths
const RANK: Record<string, number> = { LOKBSN: 0, HRBARE: 1, FAIRWY: 2, WTWAXS: 2, TERMNL: 3, BERTHS: 4 };

/** Soundings, aids to navigation and names. Screen space: call with the context at device-pixel scale. */
export function drawChartMarks(model: ChartModel, v: ChartView) {
  const b = get(model);
  const { ctx, scale, C, bounds: [n0, e0, n1, e1], toScr } = v;
  const room = new Room();
  // aids to navigation first (their names and light characteristics only where there is room for them)
  const P: SymbolPalette = { ink: C.ink, port: C.port, stbd: C.stbd, light: C['aid-light'], muted: C.muted, fontNum: C.fontNum, panel: C['panel-solid'] };
  const m = 60 / Math.max(scale, 1e-3);
  const inView = b.aids.filter(a => !(a.n < n0 - m || a.n > n1 + m || a.e < e0 - m || a.e > e1 + m));
  for (const a of inView) { const [x, y] = toScr(a.n, a.e); room.take([x - 7, y - 16, x + 7, y + 5]); }
  for (const a of inView) { const [x, y] = toScr(a.n, a.e); drawAid(ctx, a, x, y, P, scale, v.rot ?? 0, bx => room.take(bx)); }
  // names, the important ones first, each only where it does not run into another
  if (scale > 0.25) {
    ctx.font = `italic 500 11px ${C.fontLabel}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = C.muted;
    const ls = b.model.labels.filter(l => l.n >= n0 && l.n <= n1 && l.e >= e0 && l.e <= e1 && (scale > 0.5 || (RANK[l.k] ?? 4) < 4))
      .map(l => ({ l, t: labelText(l.t), r: RANK[l.k] ?? 4 })).sort((x, y) => x.r - y.r || x.t.length - y.t.length);
    const seen = new Set<string>();
    for (const { l, t } of ls) {
      if (!t || seen.has(t)) continue;
      const [x, y] = toScr(l.n, l.e), w = ctx.measureText(t).width;
      if (!room.take([x - w / 2 - 3, y - 8, x + w / 2 + 3, y + 8])) continue;
      seen.add(t);
      ctx.fillText(t, x, y);
    }
  }
  // spot soundings once there is room for them (≈ 1:6 000 and closer): the shoalest first, as on a paper
  // chart, each where it overlaps nothing already written
  if (scale > 0.22) {
    const big = scale > 0.6, cand: [number, number, number][] = [];
    for (let i = Math.floor(n0 / 200); i <= Math.floor(n1 / 200); i++) for (let j = Math.floor(e0 / 200); j <= Math.floor(e1 / 200); j++)
      for (const s of b.soundGrid.get(tkey(i, j)) ?? []) if (s[0] >= n0 && s[0] <= n1 && s[1] >= e0 && s[1] <= e1) cand.push(s);
    cand.sort((x, y) => x[2] - y[2]);
    const padX = big ? 5 : 9, padY = big ? 3 : 6;
    const whole: [number, number, string, boolean][] = [], decs: [number, number, string, boolean][] = [];
    for (const [n, e, d] of cand) {
      const [x, y] = toScr(n, e);
      const w = Math.floor(d), dec = Math.round((d - w) * 10), wd = (w >= 10 ? 13 : 7) + (dec ? 5 : 0);
      if (!room.take([x - wd / 2 - padX, y - 6 - padY, x + wd / 2 + padX, y + 7 + padY])) continue;
      const shallow = d < b.safetyDepth;
      // chart style: whole metres with the decimetres as a lowered digit
      whole.push([x - (dec ? 3 : 0), y, String(w), shallow]);
      if (dec && w < 21) decs.push([x + (w >= 10 ? 9 : 5), y + 4, String(dec), shallow]);
    }
    // two passes, one font each: switching fonts per sounding is what made this slow
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const text = (list: typeof whole) => { for (const [x, y, t, sh] of list) { ctx.fillStyle = sh ? C['sound-sh'] : C.sound; ctx.fillText(t, x, y); } };
    ctx.font = `500 ${big ? 11 : 10}px ${C.fontNum}`; text(whole);
    ctx.font = `500 ${big ? 8 : 7}px ${C.fontNum}`; text(decs);
  }
}

/** The ship's safety depth and the contour the chart shows as her safety contour. */
export function chartInfo(model: ChartModel) { const b = get(model); return { safetyDepth: b.safetyDepth, contour: b.contourValue }; }
