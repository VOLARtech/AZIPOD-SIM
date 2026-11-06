// Random traffic for any scenario: ships that plan their own way through navigable water, steer and
// change speed like ships (first-order Nomoto yaw, speed with a lag that grows with size), allow for
// the current, slow for turns, stop, wait and go on, ride at anchor swinging to wind and current, and
// keep clear of own ship and of each other the way the collision regulations ask (alter to
// starboard, slow down; the stand-on ship acts only when a collision is close).
//
// Scripted scenario traffic (Traffic) is unchanged: it holds its track and speed.
import { DEG, KN, SHIPS, ShipSpec, wrapAngle } from './ship';
import { Traffic, hullsTouch } from './traffic';

type Pt = [number, number];
export interface NavWorld { obstacles: { poly: Pt[] }[]; depthAt: (n: number, e: number) => number }
/** What a traffic ship sees each step. */
export interface TrafficWorld {
  current: (n: number, e: number) => [number, number];
  wind: { V: number; from: number };
  own: { st: { n: number; e: number; psi: number; u: number; v: number }; spec: ShipSpec };
  traffic: Traffic[];
}
export type NavStatus = 'Under way using engine' | 'At anchor' | 'Restricted manoeuvrability' | 'Stopped';

// ---------------------------------------------------------------- seeded random
export class Rng {
  constructor(private s = 1) { this.s = (s >>> 0) || 1; }
  next() { this.s = (this.s * 1664525 + 1013904223) >>> 0; return this.s / 4294967296; }
  range(a: number, b: number) { return a + (b - a) * this.next(); }
  pick<T>(a: T[]) { return a[Math.floor(this.next() * a.length)]; }
}

// ---------------------------------------------------------------- navigation grid
/** Depth and land on a square grid round a centre, with distance to the nearest unnavigable cell. */
export class NavGrid {
  readonly N: number; readonly depth: Float32Array; private dists = new Map<number, Uint8Array>();
  constructor(w: NavWorld, readonly n0: number, readonly e0: number, readonly half = 3000, readonly cell = 20) {
    const N = this.N = Math.round(2 * half / cell);
    const d = this.depth = new Float32Array(N * N);
    for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
      const [n, e] = this.pos(i, j), z = w.depthAt(n, e);
      d[i * N + j] = z > 0 ? Math.min(z, 1000) : 0;                     // dry or unknown: land
    }
    // land, quays, banks: rasterise each polygon over its bounding box
    for (const o of w.obstacles) {
      let a = Infinity, b = -Infinity, c = Infinity, f = -Infinity;
      for (const [n, e] of o.poly) { a = Math.min(a, n); b = Math.max(b, n); c = Math.min(c, e); f = Math.max(f, e); }
      const i0 = Math.max(0, this.ix(a)), i1 = Math.min(N - 1, this.ix(b)), j0 = Math.max(0, this.jx(c)), j1 = Math.min(N - 1, this.jx(f));
      for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) { const [n, e] = this.pos(i, j); if (inPoly(o.poly, n, e)) d[i * N + j] = 0; }
    }
  }
  ix(n: number) { return Math.floor((n - (this.n0 - this.half)) / this.cell); }
  jx(e: number) { return Math.floor((e - (this.e0 - this.half)) / this.cell); }
  pos(i: number, j: number): Pt { return [this.n0 - this.half + (i + 0.5) * this.cell, this.e0 - this.half + (j + 0.5) * this.cell]; }
  /** Cells to the nearest one shallower than `need` m (or outside the grid), 8-connected, capped at 255. */
  dist(need: number) {
    const key = Math.ceil(need);
    let D = this.dists.get(key);
    if (D) return D;
    const N = this.N; D = new Uint8Array(N * N).fill(255);
    const q = new Int32Array(N * N); let qh = 0, qt = 0;
    for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
      const k = i * N + j;
      if (this.depth[k] < key || i === 0 || j === 0 || i === N - 1 || j === N - 1) { D[k] = 0; q[qt++] = k; }
    }
    while (qh < qt) {
      const k = q[qh++], i = (k / N) | 0, j = k % N, dk = D[k] + 1;
      if (dk > 255) continue;
      for (let di = -1; di <= 1; di++) for (let dj = -1; dj <= 1; dj++) {
        const a = i + di, b = j + dj; if (a < 0 || b < 0 || a >= N || b >= N) continue;
        const m = a * N + b; if (D[m] > dk) { D[m] = dk; q[qt++] = m; }
      }
    }
    this.dists.set(key, D);
    return D;
  }
  /** Clearance (m) from water shallower than `need` at a point; 0 outside the grid. */
  clear(n: number, e: number, need: number) {
    const i = this.ix(n), j = this.jx(e);
    if (i < 0 || j < 0 || i >= this.N || j >= this.N) return 0;
    return this.dist(need)[i * this.N + j] * this.cell;
  }
  /** Is the straight line between two points clear by at least `room` metres everywhere? */
  lineClear(a: Pt, b: Pt, need: number, room: number) {
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]), k = Math.max(1, Math.ceil(L / (this.cell / 2)));
    for (let s = 0; s <= k; s++) { const t = s / k; if (this.clear(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, need) < room) return false; }
    return true;
  }
  /** Shortest way that keeps `room` metres clear, favouring the middle of the channel and going round the
   *  discs given (ships lying stopped); null if there is none. */
  route(a: Pt, b: Pt, need: number, room: number, discs: Disc[] = []): Pt[] | null {
    const N = this.N, D = this.dist(need), minC = Math.ceil(room / this.cell);
    const si = this.ix(a[0]), sj = this.jx(a[1]), ti = this.ix(b[0]), tj = this.jx(b[1]);
    const blk = discs.length ? new Uint8Array(N * N) : null;
    if (blk) for (const d of discs) {
      const r = Math.ceil(d.r / this.cell), ci = this.ix(d.n), cj = this.jx(d.e);
      for (let i = Math.max(0, ci - r); i <= Math.min(N - 1, ci + r); i++) for (let j = Math.max(0, cj - r); j <= Math.min(N - 1, cj + r); j++)
        if ((i - ci) ** 2 + (j - cj) ** 2 <= r * r) blk[i * N + j] = 1;
    }
    // near where she is, any water deep enough will do: a ship pushed to the edge of the channel can always work her way back
    const inS = si >= 0 && sj >= 0 && si < N && sj < N, slack = inS && D[si * N + sj] < minC ? minC + 4 : -1;   // only when she is off clear water
    const ok = (i: number, j: number) => i >= 0 && j >= 0 && i < N && j < N && !(blk && blk[i * N + j])
      && (D[i * N + j] >= minC || (D[i * N + j] >= 1 && Math.abs(i - si) <= slack && Math.abs(j - sj) <= slack));
    if (!ok(ti, tj)) return null;
    const g = new Float32Array(N * N).fill(Infinity), from = new Int32Array(N * N).fill(-1), shut = new Uint8Array(N * N);
    const heap: [number, number][] = [];
    const push = (f: number, k: number) => { heap.push([f, k]); let c = heap.length - 1; while (c > 0) { const p = (c - 1) >> 1; if (heap[p][0] <= heap[c][0]) break; [heap[p], heap[c]] = [heap[c], heap[p]]; c = p; } };
    const pop = () => { const top = heap[0], last = heap.pop()!; if (heap.length) { heap[0] = last; let c = 0; for (;;) { const l = 2 * c + 1, r = l + 1; let m = c; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === c) break; [heap[m], heap[c]] = [heap[c], heap[m]]; c = m; } } return top; };
    const s0 = si * N + sj; g[s0] = 0; push(0, s0);
    const H = (i: number, j: number) => Math.hypot(i - ti, j - tj);
    let found = -1, iters = 0;
    while (heap.length && iters++ < 120000) {
      const [, k] = pop(); if (shut[k]) continue; shut[k] = 1;
      const i = (k / N) | 0, j = k % N;
      if (i === ti && j === tj) { found = k; break; }
      for (let di = -1; di <= 1; di++) for (let dj = -1; dj <= 1; dj++) {
        if (!di && !dj) continue;
        const a2 = i + di, b2 = j + dj;
        if (!ok(a2, b2) && !(a2 === si && b2 === sj)) continue;
        const m = a2 * N + b2; if (shut[m]) continue;
        const step = (di && dj ? Math.SQRT2 : 1) * (1 + 6 / (1 + D[m]));      // the middle of the channel is cheaper
        const ng = g[k] + step;
        if (ng < g[m]) { g[m] = ng; from[m] = k; push(ng + H(a2, b2), m); }
      }
    }
    if (found < 0) return null;
    const cells: Pt[] = [];
    for (let k = found; k >= 0; k = from[k]) cells.push(this.pos((k / N) | 0, k % N));
    cells.reverse(); cells[0] = a; cells[cells.length - 1] = b;
    // string-pull: keep only the corners a straight leg cannot cut
    const out: Pt[] = [cells[0]];
    let i = 0;
    while (i < cells.length - 1) {
      let j = cells.length - 1;
      while (j > i + 1 && !(this.lineClear(cells[i], cells[j], need, room) && discsClear(cells[i], cells[j], discs))) j--;
      out.push(cells[j]); i = j;
    }
    return out;
  }
}
export interface Disc { n: number; e: number; r: number }
/** Does the segment keep out of every disc? */
function discsClear(a: Pt, b: Pt, discs: Disc[]) {
  for (const d of discs) {
    const vn = b[0] - a[0], ve = b[1] - a[1], L2 = vn * vn + ve * ve || 1;
    const t = Math.max(0, Math.min(1, ((d.n - a[0]) * vn + (d.e - a[1]) * ve) / L2));
    if (Math.hypot(a[0] + vn * t - d.n, a[1] + ve * t - d.e) < d.r) return false;
  }
  return true;
}
function inPoly(p: Pt[], n: number, e: number) {
  let c = false;
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
    const [ni, ei] = p[i], [nj, ej] = p[j];
    if ((ni > n) !== (nj > n) && e < (ej - ei) * (n - ni) / (nj - ni) + ei) c = !c;
  }
  return c;
}

// ---------------------------------------------------------------- CPA / TCPA
/** Closest point of approach between two ships from their positions and ground velocities. */
export function cpa(a: { n: number; e: number; vn: number; ve: number }, b: { n: number; e: number; vn: number; ve: number }) {
  const dn = b.n - a.n, de = b.e - a.e, wn = b.vn - a.vn, we = b.ve - a.ve, w2 = wn * wn + we * we;
  const t = w2 < 1e-6 ? 0 : -(dn * wn + de * we) / w2;
  return { tcpa: t, cpa: Math.hypot(dn + wn * Math.max(0, t), de + we * Math.max(0, t)), range: Math.hypot(dn, de) };
}
/** Ground velocity of any ship state (body u, v and heading) plus an optional drift. */
export const groundVel = (s: { psi: number; u: number; v?: number }, cur: [number, number] = [0, 0]) =>
  ({ vn: s.u * Math.cos(s.psi) - (s.v ?? 0) * Math.sin(s.psi) + cur[0], ve: s.u * Math.sin(s.psi) + (s.v ?? 0) * Math.cos(s.psi) + cur[1] });

// ---------------------------------------------------------------- the ships
const NAMES = ['NORDIC STAR', 'BALTIC WIND', 'OCEAN PRIDE', 'SEA HARMONY', 'CAPE AURORA', 'BLUE MARLIN', 'SILVER TIDE', 'ATLANTIC DAWN',
  'CORAL BAY', 'NORTHERN LIGHT', 'POLAR SPIRIT', 'GOLDEN WAVE', 'STELLA MARIS', 'ISLAND TRADER', 'MARE NOSTRUM', 'PACIFIC ARROW',
  'KESTREL', 'ALBATROSS', 'HERON', 'SANDPIPER', 'MISTRAL', 'SIROCCO', 'ZEPHYR', 'CORMORANT', 'SEA FALCON', 'EVENING STAR'];
/** Names in use in the current set of traffic (cleared each time a set is drawn). */
const usedNames = new Set<string>();
const MIDS = [211, 219, 230, 244, 257, 265, 303, 311, 338, 366, 412, 477, 538, 636];
const TYPE: Record<string, string> = { cruise: 'Passenger', ropax: 'Passenger', yacht: 'Pleasure craft', tug: 'Tug', container: 'Cargo', bulk: 'Cargo', tanker: 'Tanker', gas: 'Tanker', psv: 'Offshore supply', ahts: 'Offshore supply', naval: 'Military', icebreaker: 'Special craft', inland: 'Inland', 'fast ferry': 'High speed craft' };

export type Mode = 'transit' | 'wait' | 'anchor' | 'hold';
export class TrafficAI extends Traffic {
  readonly ai = true;
  name: string; mmsi: string; kind: string; dest = ''; status: NavStatus = 'Under way using engine';
  mode: Mode; cruise: number;
  private path: Pt[] = []; private wp = 1; private goal: Pt | null = null;
  private delta = 0; private waitT = 0; private think = 0; private replanAt = 0; private w: TrafficWorld | null = null;
  private avoid: { until: number; turn: number; slow: number; who: Traffic | 'own'; k?: number } | null = null;
  private course = 0; private backing = 0; private caution = false;
  anchor: Pt | null = null; private sheer = 0;
  /** Radius of the circle she swings through at anchor (cable plus her length). */
  get swing() { return this.scope + this.spec.LOA; }
  constructor(spec: ShipSpec, start: { n: number; e: number; psi: number; kn: number }, mode: Mode, readonly grid: NavGrid, private rng: Rng, readonly need: number, private scope = 0) {
    const name = rng.pick(NAMES.filter(n => !usedNames.has(n))) ?? rng.pick(NAMES);
    usedNames.add(name);
    super(spec, { ship: spec.id, label: name, start });
    this.name = name;
    this.mmsi = `${rng.pick(MIDS)}${String(Math.floor(rng.range(0, 999999))).padStart(6, '0')}`;
    this.kind = TYPE[spec.type ?? ''] ?? (spec.station === 'asd' || spec.station === 'vsp' ? 'Tug' : 'Passenger');   // the Azipod ships are passenger ships
    this.mode = mode;
    this.cruise = Math.min(spec.vmaxKn * 0.6, spec.type === 'fast ferry' ? 16 : 11) * KN;
    if (mode === 'anchor') { this.status = 'At anchor'; const [bn, be] = this.bowPoint(), p = this.st.psi; this.anchor = [bn + scope * Math.cos(p), be + scope * Math.sin(p)]; }
    if (mode === 'hold') this.status = 'Restricted manoeuvrability';
  }
  /** Bow position (where the cable leads from). */
  private bowPoint(): Pt { const s = this.st, b = this.spec.LOA / 2 - this.spec.xg; return [s.n + b * Math.cos(s.psi), s.e + b * Math.sin(s.psi)]; }
  private get room() { return this.spec.B / 2 + 40; }   // two grid cells of margin: corners get cut a little
  /** Ships lying stopped (at anchor, holding, waiting, or own ship stopped): plan round them. */
  private discs(): Disc[] {
    const w = this.w; if (!w) return [];
    const out: Disc[] = [], me = this.st;
    const add = (st: { n: number; e: number; u: number }, spec: ShipSpec) => {
      if (Math.abs(st.u) > 0.5) return;                                          // under way: the lookout handles her
      out.push({ n: st.n, e: st.e, r: spec.LOA / 2 + this.spec.B / 2 + 60 });
    };
    add(w.own.st, w.own.spec);
    for (const t of w.traffic) {
      if (t === this) continue;
      // a ship at anchor can lie anywhere round her anchor: keep clear of the whole swinging circle
      if (t instanceof TrafficAI && t.anchor) { out.push({ n: t.anchor[0], e: t.anchor[1], r: t.swing + this.spec.B / 2 + 50 }); continue; }
      add(t.st, t.spec);
    }
    // already inside a circle (she stopped close by): that one cannot be planned round, the lookout keeps them apart
    return out.filter(d => Math.hypot(d.n - me.n, d.e - me.e) > d.r);
  }
  /** A new destination somewhere reachable, at least ~1 km on. */
  plan() {
    const s = this.st, G = this.grid;
    for (let k = 0; k < 10; k++) {
      const a = this.rng.range(0, 2 * Math.PI), d = this.rng.range(900, G.half * 0.85);
      const b: Pt = [G.n0 + Math.cos(a) * d, G.e0 + Math.sin(a) * d];
      if (G.clear(b[0], b[1], this.need) < this.room + this.spec.L / 2) continue;
      const dd = this.discs(), r = G.route([s.n, s.e], b, this.need, this.room, dd);
      if (r && r.length >= 2) { this.path = this.keepRight(r, dd); this.wp = 1; this.goal = b; this.mode = 'transit'; this.status = 'Under way using engine'; this.dest = `${String(Math.round(((Math.atan2(b[1] - s.e, b[0] - s.n) / DEG) + 360) % 360)).padStart(3, '0')}° ${(Math.hypot(b[0] - s.n, b[1] - s.e) / 1852).toFixed(1)} nm`; return true; }
    }
    return false;
  }
  private replan(now = false) { if (!now && this.st.t < this.replanAt) return; this.replanAt = this.st.t + 8; if (this.goal) { const d = this.discs(), r = this.grid.route([this.st.n, this.st.e], this.goal, this.need, this.room, d); if (r) { this.path = this.keepRight(r, d); this.wp = 1; return; } } this.plan(); }
  /** Rule 9: keep to the starboard side of the fairway. Each leg moves over to its right by as much as the
   *  water allows (keeping her margin off the bank), so ships meeting in a channel pass port to port. */
  private keepRight(path: Pt[], discs: Disc[] = []): Pt[] {
    if (path.length < 2) return path;
    const G = this.grid, out: Pt[] = [path[0]], want = this.spec.B * 1.5 + 60;
    for (let i = 1; i < path.length; i++) {
      const a = path[i - 1], b = path[i], L = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (L < 3 * G.cell) { out.push(b); continue; }
      const rn = -(b[1] - a[1]) / L, re = (b[0] - a[0]) / L;            // unit vector to starboard of the leg
      let o = want, moved: [Pt, Pt] | null = null;
      while (o >= G.cell) {
        const a2: Pt = [a[0] + rn * o, a[1] + re * o], b2: Pt = [b[0] + rn * o, b[1] + re * o];
        if (G.lineClear(a2, b2, this.need, this.room * 1.5 + 20) && discsClear(a2, b2, discs)) { moved = [a2, b2]; break; }   // spare room for cutting the corners
        o -= G.cell;
      }
      // the shifted leg, entered and left smoothly; the last point stays the destination
      if (moved) { const [a2, b2] = moved; out.push([a[0] + (a2[0] - a[0]) + (b2[0] - a2[0]) * 0.15, a[1] + (a2[1] - a[1]) + (b2[1] - a2[1]) * 0.15]); out.push(i === path.length - 1 ? b : [b2[0] - (b2[0] - a2[0]) * 0.15, b2[1] - (b2[1] - a2[1]) * 0.15]); if (i === path.length - 1) continue; }
      else out.push(b);
    }
    // never leave a corner the straight run between two points cannot make
    return out.filter((p, k) => k === 0 || k === out.length - 1 || G.clear(p[0], p[1], this.need) >= this.room);
  }
  /** Steering and speed: first-order Nomoto yaw (K, T from length and speed) with a rudder that moves at 2.5°/s. */
  private steer(psiCmd: number, dt: number) {
    const s = this.st, L = this.spec.L, azi = this.spec.pods.some(p => p.kind !== 'shaft');
    const U = Math.max(Math.abs(s.u), azi ? 1.2 : 0.6);
    const K = 1.6 * U / L, T = 1.8 * L / U, dMax = 35 * DEG;
    const err = wrapAngle(psiCmd - s.psi), rMax = K * dMax * 0.7;
    const rCmd = Math.max(-rMax, Math.min(rMax, err / Math.max(8, T)));
    const dCmd = Math.max(-dMax, Math.min(dMax, (rCmd + 1.5 * (rCmd - s.r)) / K));
    this.delta += Math.max(-2.5 * DEG * dt, Math.min(2.5 * DEG * dt, dCmd - this.delta));
    s.r += (K * this.delta - s.r) / T * dt;
    return err;
  }
  private speed(uCmd: number, dt: number) {
    const s = this.st, tau = Math.max(20, Math.min(150, this.spec.L * 0.55));
    s.u += (uCmd - s.u) / (uCmd < s.u ? tau * 1.6 : tau) * dt;
  }
  step(dt: number, w?: TrafficWorld) {
    if (!w) return super.step(dt);
    this.w = w;
    const s = this.st; s.t += dt;
    const cur = w.current(s.n, s.e);
    if (this.mode === 'anchor' || this.mode === 'hold') return this.ride(dt, w, cur);
    if ((this.think -= dt) <= 0) {
      this.think = 1;
      // pushed off her track (giving way, the current): if the run to her next point is no longer clear, plan again from here
      if (this.mode === 'transit' && this.path.length >= 2 && !this.backing && !this.grid.lineClear([s.n, s.e], this.path[this.wp], this.need, this.spec.B / 2 + 10)) this.replan(true);
      // shoal water ahead inside her turning distance: ease right down until she is pointing clear
      const look = Math.max(this.spec.L, Math.abs(s.u) * 75);
      this.caution = s.u > 0.5 && !this.grid.lineClear([s.n, s.e], [s.n + Math.cos(s.psi) * look, s.e + Math.sin(s.psi) * look], this.need, this.spec.B / 2 + 10);
      this.lookout(w);
    }
    let psiCmd = s.psi, uCmd = 0;
    if (this.mode === 'wait') {
      if ((this.waitT -= dt) <= 0 && !this.plan()) this.waitT = 30;     // nowhere to go yet: try again later
    } else if (this.path.length >= 2) {
      // next waypoint: switch early enough to turn onto the next leg
      const rMax = 1.6 * Math.max(Math.abs(s.u), 1) / this.spec.L * 35 * DEG * 0.7;
      const reach = Math.max(this.spec.L, Math.abs(s.u) / Math.max(rMax, 1e-3) * 1.2);
      let [tn, te] = this.path[this.wp];
      while (this.wp < this.path.length - 1 && Math.hypot(tn - s.n, te - s.e) < reach) { this.wp++; [tn, te] = this.path[this.wp]; }
      const dRem = Math.hypot(tn - s.n, te - s.e), last = this.wp === this.path.length - 1;
      // course to make good, corrected for the current across it
      const cog = Math.atan2(te - s.e, tn - s.n), cross = -cur[0] * Math.sin(cog) + cur[1] * Math.cos(cog);
      psiCmd = cog - Math.asin(Math.max(-0.6, Math.min(0.6, cross / Math.max(1, Math.abs(s.u)))));
      this.course = psiCmd;
      uCmd = this.cruise;
      if (last) uCmd = Math.min(uCmd, Math.max(0, (dRem - this.spec.L * 0.3) / (this.spec.L * 0.55 * 2)));
      // arrived: close to the spot, or already past it, and she lets her way run off there
      const past = (tn - s.n) * Math.cos(s.psi) + (te - s.e) * Math.sin(s.psi) < 0;
      if (last && (dRem < Math.max(this.spec.L, 150) || past)) { this.mode = 'wait'; this.waitT = this.rng.range(40, 160); this.path = []; this.dest = ''; }
    }
    if (this.avoid) {
      // the turn holds only while there is water ahead for it: never carried on into the bank
      if (this.avoid.turn && (this.think <= 0.05) && !this.grid.lineClear([s.n, s.e], [s.n + Math.cos(s.psi) * Math.max(this.spec.L, s.u * 90), s.e + Math.sin(s.psi) * Math.max(this.spec.L, s.u * 90)], this.need, this.room * 0.8)) this.avoid.turn = 0;
      psiCmd += this.avoid.turn; uCmd *= this.avoid.slow;
      if (s.t > this.avoid.until) { this.avoid = null; this.replan(); }
    }
    if (this.caution) uCmd = Math.min(uCmd, this.cruise * 0.3);
    if (this.backing > 0) { psiCmd = s.psi; uCmd = -0.8; }
    const err = this.steer(psiCmd, dt);
    this.speed(uCmd * Math.max(0.5, 1 - Math.abs(err) / Math.PI * 0.9), dt);
    // the move this step, unless it would put her on the ground or into another ship: then she stops short
    const nx = { n: s.n + (s.u * Math.cos(s.psi) + cur[0]) * dt, e: s.e + (s.u * Math.sin(s.psi) + cur[1]) * dt, psi: wrapAngle(s.psi + s.r * dt) };
    if (this.safe(nx, w)) { s.n = nx.n; s.e = nx.e; s.psi = nx.psi; }
    else { s.u = 0; s.r = 0; if (!this.avoid || this.avoid.slow > 0) this.avoid = { until: s.t + 20, turn: 0, slow: 0, who: 'own' }; }
    s.pods.forEach(p => (p.rpm = s.u / Math.max(1, this.cruise) * 0.8));
    // touching the edge of the channel: she loses her way in seconds; stuck, she goes astern off it and tries again
    if (this.backing > 0) { this.backing -= dt; if (this.backing <= 0) this.replan(true); }
    else if (this.grid.clear(s.n, s.e, this.need) < this.spec.B / 2) {
      s.u *= Math.exp(-dt / 4); this.replan();
      if (Math.abs(s.u) < 0.3) { this.backing = 30; this.avoid = null; }
    }
  }
  /** Would this pose keep her afloat and clear of every other hull? (Bow, middle and stern in water deeper
   *  than her draught; her outline not touching own ship or any other traffic close by.) */
  private safe(p: { n: number; e: number; psi: number }, w: TrafficWorld) {
    const G = this.grid, h = this.spec.L / 2, c = Math.cos(p.psi), sn = Math.sin(p.psi);
    for (const x of [-h, 0, h]) {
      const n = p.n + c * x, e = p.e + sn * x, i = G.ix(n), j = G.jx(e);
      if (i < 0 || j < 0 || i >= G.N || j >= G.N || G.depth[i * G.N + j] < this.spec.T + 0.3) return false;
    }
    const near = (o: { n: number; e: number }, L: number) => Math.hypot(o.n - p.n, o.e - p.e) < (this.spec.LOA + L) / 2 + 5;
    if (near(w.own.st, w.own.spec.LOA) && hullsTouch(this.hull, p, w.own.spec, w.own.st)) return !hullsTouch(this.hull, this.st, w.own.spec, w.own.st) ? false : true;
    const touch = (q: { n: number; e: number; psi: number }, t: Traffic) => hullsTouch(this.hull, q, t.spec, t.st) || hullsTouch(t.hull, t.st, this.spec, q);
    for (const t of w.traffic) if (t !== this && near(t.st, t.spec.LOA) && touch(p, t) && !touch(this.st, t)) return false;
    return true;
  }
  /** At anchor: the bow lies to the cable and swings to the wind and current, with a slow sheer.
   *  Holding (DP, restricted): keeps her spot and heads into the weather. */
  private ride(dt: number, w: TrafficWorld, cur: [number, number]) {
    const s = this.st;
    // the bow points where the water and wind come from; the current dominates a laden hull
    const fn = -cur[0] * 8 + Math.cos(w.wind.from) * w.wind.V * 0.25, fe = -cur[1] * 8 + Math.sin(w.wind.from) * w.wind.V * 0.25;
    this.sheer += dt;
    const want = (Math.hypot(fn, fe) > 0.05 ? Math.atan2(fe, fn) : s.psi) + (this.mode === 'anchor' ? 6 * DEG * Math.sin(this.sheer / 70) : 0);
    const rr = Math.max(-0.25 * DEG, Math.min(0.25 * DEG, wrapAngle(want - s.psi) * 0.02));
    s.r += (rr - s.r) * Math.min(1, dt / 10); s.u = 0;
    const psi = wrapAngle(s.psi + s.r * dt);
    // the cable leads ahead of the bow: she lies astern of her anchor, swinging round it (but never into another ship)
    const lead = this.scope + this.spec.LOA / 2 - this.spec.xg;
    const p = this.mode === 'anchor' && this.anchor ? { n: this.anchor[0] - lead * Math.cos(psi), e: this.anchor[1] - lead * Math.sin(psi), psi } : { n: s.n, e: s.e, psi };
    if (this.safe(p, w)) { s.n = p.n; s.e = p.e; s.psi = p.psi; } else s.r = 0;
  }
  /** Look out for own ship and the other traffic, every second; give way as the rules ask. */
  private lookout(w: TrafficWorld) {
    const s = this.st, me = { n: s.n, e: s.e, ...groundVel(s, w.current(s.n, s.e)) };
    if (this.mode !== 'transit') return;
    const others = [{ st: w.own.st, spec: w.own.spec, who: 'own' as const }, ...w.traffic.filter(t => t !== this).map(t => ({ st: t.st, spec: t.spec, who: t as Traffic }))]
      .map(o => ({ ...o, v: { n: o.st.n, e: o.st.e, ...groundVel(o.st) }, safe: Math.max(150, (this.spec.L + o.spec.L) / 2 + 2 * Math.max(this.spec.B, o.spec.B) + 60) }));
    const moving = others.filter(o => Math.hypot(o.v.vn, o.v.ve) >= 0.5), discs = this.discs();
    // a ship lying stopped across the way is like a shoal: go round her
    const blocked = !discsClear([s.n, s.e], [s.n + me.vn * 240, s.e + me.ve * 240], discs);
    if (blocked) {
      // whatever she was doing, a stopped ship across her way comes first: new route round her, or stop
      this.avoid = null; this.replan(true);
      if (this.path.length < 2) { this.avoid = { until: s.t + 60, turn: 0, slow: 0, who: 'own' }; return; }
    }
    // close quarters (rule 17 b / rule 2): whoever is closing fast and near, turn away and take all way off
    for (const o of others) {
      const c = cpa(me, o.v), gap = c.range - (this.spec.L + o.spec.L) / 4;
      if (c.tcpa > 0 && c.tcpa < 75 && c.cpa < o.safe * 0.45 && gap < 4 * Math.max(this.spec.L, o.spec.L)) {
        // hard to starboard (a turn to port toward a ship on the port side is what the rules forbid) and stop
        // (nearly stopped already: just stop, rather than swing her ends into the other ship)
        const h = s.psi + 45 * DEG, room = Math.abs(s.u) > 1 && this.grid.lineClear([s.n, s.e], [s.n + Math.cos(h) * this.spec.L * 2, s.e + Math.sin(h) * this.spec.L * 2], this.need, this.room);
        this.avoid = { until: s.t + Math.max(45, c.tcpa + 30), turn: room ? 45 * DEG : 0, slow: 0, who: o.who };
        return;
      }
    }
    // who must I keep clear of?
    let worst = 0;
    const threat = moving.some(o => {
      const c = cpa(me, o.v);
      if (c.range > 4000 || c.tcpa <= 0 || c.tcpa > 600 || c.cpa > o.safe) return false;
      const brg = wrapAngle(Math.atan2(o.v.e - me.e, o.v.n - me.n) - s.psi);
      const headOn = Math.abs(brg) < 8 * DEG && Math.cos(o.st.psi - s.psi) < -0.9;
      const onStbd = brg > 4 * DEG && brg < 112.5 * DEG;
      const overtaking = Math.abs(brg) < 67.5 * DEG && Math.cos(o.st.psi - s.psi) > 0.7 && Math.hypot(me.vn, me.ve) > Math.hypot(o.v.vn, o.v.ve);
      worst = Math.max(worst, c.tcpa);
      return headOn || onStbd || overtaking || (c.cpa < o.safe * 0.5 && c.tcpa < 150);     // the stand-on ship acts when it comes to that
    });
    if (!threat) return;
    // trial manoeuvre, as on a radar: the first action that clears every ship under way, with water to do it
    // and no stopped ship in the way; failing that, the one that does best. Once taken, an action is held
    // (a big ship needs minutes to show it) unless it clearly stops working.
    const ahead = Math.max(2 * this.spec.L, 300), U = Math.max(this.cruise, Math.abs(s.u)), base = this.path.length >= 2 ? this.course : s.psi;
    const score = (turn: number, slow: number) => {
      const h = base + turn, sp = U * slow, end: Pt = [s.n + Math.cos(h) * ahead, s.e + Math.sin(h) * ahead];
      if (turn && (!this.grid.lineClear([s.n, s.e], end, this.need, this.room) || !discsClear([s.n, s.e], end, discs))) return -1;
      const mine = { n: s.n, e: s.e, vn: sp * Math.cos(h), ve: sp * Math.sin(h) };
      let sc = Infinity;
      for (const o of moving) { const c = cpa(mine, o.v); if (c.tcpa > 0 && c.tcpa < 600) sc = Math.min(sc, c.cpa / o.safe); }
      return sc;
    };
    const until = s.t + Math.min(420, Math.max(60, worst + 60));
    if (this.avoid && this.avoid.k !== undefined && score(this.avoid.turn, this.avoid.slow) >= 0.5) { this.avoid.until = Math.max(this.avoid.until, until); return; }
    // turns keep the speed on (the rudder needs it); slowing right down is its own, last choice.
    // A decision is only ever made bigger, never taken back for a smaller one while the danger lasts.
    const CANDS = [[20, 1], [35, 1], [60, 0.9], [90, 0.8], [0, 0.15]] as const;
    let best: { k: number; sc: number } | null = null;
    for (let k = this.avoid?.k !== undefined ? this.avoid.k + 1 : 0; k < CANDS.length; k++) {
      const sc = score(CANDS[k][0] * DEG, CANDS[k][1]);
      if (sc < 0) continue;
      if (!best || sc > best.sc) best = { k, sc };
      if (sc >= 1) break;
    }
    if (best) this.avoid = { until, turn: CANDS[best.k][0] * DEG, slow: CANDS[best.k][1], who: 'own', k: best.k };
    else if (this.avoid) this.avoid.until = Math.max(this.avoid.until, until);
  }
}

// ---------------------------------------------------------------- generation
const grids = new Map<string, NavGrid>();
/** The navigation grid built for a scenario's traffic, if any (the AIS mini map draws its coastline from it). */
export const navGridFor = (key: string) => grids.get(key);
export type TrafficLevel = 'off' | 'light' | 'busy';
/**
 * Random traffic round own ship: a mix of ships under way on their own business and ships at anchor
 * (or holding station where it is too deep to anchor), in water that suits each one's draught.
 */
export function makeTraffic(key: string, world: NavWorld, own: { n: number; e: number; vn?: number; ve?: number; spec: ShipSpec }, level: TrafficLevel, seed: number): TrafficAI[] {
  usedNames.clear();
  if (level === 'off') return [];
  let G = grids.get(key);
  if (!G) { G = new NavGrid(world, own.n, own.e); grids.set(key, G); }
  // as many ships as the water holds: a narrow channel gets fewer than an open roadstead
  const D = G.dist(8), roomy = D.reduce((a, d) => a + (d * G.cell >= 120 ? 1 : 0), 0) / D.length;
  const rng = new Rng(seed), count = Math.max(level === 'busy' ? 3 : 2, Math.round((level === 'busy' ? 8 : 4) * Math.min(1, roomy / 0.35))), out: TrafficAI[] = [];
  const fleet = Object.values(SHIPS).filter(s => s.id !== 'push-convoy');   // barges keep to the rivers
  const sep = (n: number, e: number, L: number) =>
    Math.hypot(n - own.n, e - own.e) > Math.max(600, 3 * own.spec.L) && out.every(t => Math.hypot(t.st.n - n, t.st.e - e) > (t.spec.L + L) / 2 + 250);
  // a narrow waterway is a sliver of the grid: after half the tries, draw from its open water cells instead
  let open: number[] | null = null;
  for (let tries = 0; out.length < count && tries < count * 150; tries++) {
    const spec = rng.pick(fleet), need = spec.T * 1.15 + 1;
    let n: number, e: number;
    if (tries < count * 75) { const a = rng.range(0, 2 * Math.PI), d = rng.range(500, G.half * 0.8); n = G.n0 + Math.cos(a) * d; e = G.e0 + Math.sin(a) * d; }
    else {
      if (!open) { open = []; for (let k = 0; k < D.length; k++) if (D[k] * G.cell >= 60) open.push(k); }
      if (!open.length) break;
      const k = open[Math.floor(rng.next() * open.length)];
      [n, e] = G.pos(Math.floor(k / G.N), k % G.N);
    }
    if (G.clear(n, e, need) < spec.B / 2 + 40 || !sep(n, e, spec.L)) continue;
    if (out.filter(t => t.spec.id === spec.id).length >= 2) continue;            // a mix, not a fleet of sisters
    const depth = G.depth[G.ix(n) * G.N + G.jx(e)];
    const still = rng.next() < 0.3;
    // anchored with about three times the depth of cable; too deep to anchor, she holds station
    const mode: Mode = still ? (depth < 80 ? 'anchor' : 'hold') : 'transit', scope = Math.min(150, 3 * depth + 20);
    if (mode === 'anchor' && G.clear(n, e, need) < spec.LOA + scope) continue;          // room to swing
    const t = new TrafficAI(spec, { n, e, psi: rng.range(0, 360), kn: 0 }, mode, G, rng, need, scope);
    if (mode === 'transit') {
      if (!t.plan()) continue;
      // start on her way: heading down the first leg, at her cruising speed
      const [pn, pe] = (t as unknown as { path: Pt[] }).path[1];
      t.st.psi = Math.atan2(pe - e, pn - n); t.st.u = t.cruise * rng.range(0.6, 1);
    }
    // no one starts on a collision course: real traffic is not met already in extremis
    const v0 = { n: t.st.n, e: t.st.e, ...groundVel(t.st) };
    const conflict = [{ n: own.n, e: own.e, vn: own.vn ?? 0, ve: own.ve ?? 0, L: own.spec.L }, ...out.map(o => ({ n: o.st.n, e: o.st.e, ...groundVel(o.st), L: o.spec.L }))]
      .some(o => { const c = cpa(v0, o); return c.tcpa > 0 && c.tcpa < 600 && c.cpa < (spec.L + o.L) / 2 + 300; });   // ten minutes to act
    if (conflict) continue;
    out.push(t);
  }
  return out;
}
