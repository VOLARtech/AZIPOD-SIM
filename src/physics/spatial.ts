// Spatial index for harbour items (obstacle polygons, fenders, bollards), so contact, bank suction, wash,
// line selection and the berth editor stay fast with thousands of items in a large port.
//
// Order-preserving by design: a query returns the candidate ids in ASCENDING original order, and the
// callers still apply their own original bounding-box test to each candidate. So every sum is taken over
// exactly the same items in exactly the same order as the plain loops it replaces, and the physics stays
// bit for bit identical (the golden records check this).
import type { Fender, Obstacle, Pt } from './contact';

// same as contact.bboxOf (kept local so the two modules do not import each other)
function bboxOf(poly: Pt[]): [number, number, number, number] {
  let a = Infinity, b = Infinity, c = -Infinity, d = -Infinity;
  for (const [n, e] of poly) { a = Math.min(a, n); b = Math.min(b, e); c = Math.max(c, n); d = Math.max(d, e); }
  return [a, b, c, d];
}

/** Uniform grid over item boxes [n0, e0, n1, e1], with compressed per-cell id lists. */
export class BoxIndex {
  readonly count: number;
  private n0 = 0; private e0 = 0; private nx = 1; private ny = 1;
  private start: Int32Array; private ids: Int32Array;
  private seen: Uint32Array; private stamp = 0;
  private buf: Int32Array;
  constructor(boxes: ArrayLike<readonly [number, number, number, number]>, readonly cell = 128) {
    const n = this.count = boxes.length;
    this.seen = new Uint32Array(n);
    this.buf = new Int32Array(Math.max(16, n));
    if (!n) { this.start = new Int32Array(2); this.ids = new Int32Array(0); return; }
    let a = Infinity, b = Infinity, c = -Infinity, d = -Infinity;
    for (let i = 0; i < n; i++) { const x = boxes[i]; a = Math.min(a, x[0]); b = Math.min(b, x[1]); c = Math.max(c, x[2]); d = Math.max(d, x[3]); }
    // keep the grid to a sane size: grow the cell if the area is huge for the item count
    let cs = cell;
    while (((c - a) / cs + 1) * ((d - b) / cs + 1) > Math.max(4096, 8 * n)) cs *= 2;
    (this as { cell: number }).cell = cs;
    this.n0 = a; this.e0 = b;
    this.nx = Math.max(1, Math.floor((d - b) / cs) + 1); this.ny = Math.max(1, Math.floor((c - a) / cs) + 1);
    const cells = this.nx * this.ny, cnt = new Int32Array(cells + 1);
    const span = (x: readonly [number, number, number, number]) => [this.ci(x[0]), this.cj(x[1]), this.ci(x[2]), this.cj(x[3])];
    for (let i = 0; i < n; i++) { const [i0, j0, i1, j1] = span(boxes[i]); for (let r = i0; r <= i1; r++) for (let q = j0; q <= j1; q++) cnt[r * this.nx + q + 1]++; }
    for (let k = 0; k < cells; k++) cnt[k + 1] += cnt[k];
    this.start = cnt;
    this.ids = new Int32Array(cnt[cells]);
    const fill = cnt.slice(0, cells);
    // ids are pushed in ascending order, so each cell's list is already sorted
    for (let i = 0; i < n; i++) { const [i0, j0, i1, j1] = span(boxes[i]); for (let r = i0; r <= i1; r++) for (let q = j0; q <= j1; q++) this.ids[fill[r * this.nx + q]++] = i; }
  }
  private ci(n: number) { return Math.min(this.ny - 1, Math.max(0, Math.floor((n - this.n0) / this.cell))); }
  private cj(e: number) { return Math.min(this.nx - 1, Math.max(0, Math.floor((e - this.e0) / this.cell))); }
  /** Ids of every item whose box may overlap [n0, e0]–[n1, e1], unique and in ascending order. The returned
   *  view is reused by the next query. */
  query(n0: number, e0: number, n1: number, e1: number): Int32Array {
    if (!this.count || n1 < n0 || e1 < e0) return this.buf.subarray(0, 0);
    if (++this.stamp === 0xffffffff) { this.seen.fill(0); this.stamp = 1; }
    const i0 = this.ci(n0), i1 = this.ci(n1), j0 = this.cj(e0), j1 = this.cj(e1), st = this.stamp;
    let k = 0, sorted = true, last = -1;
    for (let r = i0; r <= i1; r++) for (let q = j0; q <= j1; q++) {
      const c = r * this.nx + q;
      for (let p = this.start[c]; p < this.start[c + 1]; p++) {
        const id = this.ids[p];
        if (this.seen[id] === st) continue;
        this.seen[id] = st;
        if (k >= this.buf.length) { const nb = new Int32Array(this.buf.length * 2); nb.set(this.buf); this.buf = nb; }
        this.buf[k++] = id;
        if (id < last) sorted = false;
        last = id;
      }
    }
    const out = this.buf.subarray(0, k);
    if (!sorted) out.sort();
    return out;
  }
}

/** The harbour's static items, indexed. It remembers the length and the first and last item of each list
 *  as they were when it was built: if a list no longer matches (the berth editor added or removed
 *  something), callers fall back to plain loops until the owner rebuilds the index. */
export interface HarbourIndex {
  obs: BoxIndex; nObs: number; o0?: Obstacle; oL?: Obstacle;
  fenders: Fender[]; fen: BoxIndex; nFen: number; f0?: Fender; fL?: Fender;
  bollards: Pt[]; bol: BoxIndex; nBol: number; b0?: Pt; bL?: Pt;
}
export function harbourIndex(obstacles: Obstacle[], fenders: Fender[], bollards: Pt[], cell = 128): HarbourIndex {
  const ob = obstacles.map(o => o.bbox ?? (o.bbox = bboxOf(o.poly)));
  return {
    obs: new BoxIndex(ob, cell), nObs: obstacles.length, o0: obstacles[0], oL: obstacles[obstacles.length - 1],
    fenders, fen: new BoxIndex(fenders.map(f => [f.n, f.e, f.n, f.e] as const), cell), nFen: fenders.length, f0: fenders[0], fL: fenders[fenders.length - 1],
    bollards, bol: new BoxIndex(bollards.map(b => [b[0], b[1], b[0], b[1]] as const), cell), nBol: bollards.length, b0: bollards[0], bL: bollards[bollards.length - 1],
  };
}
/** Do the first nObs entries of this obstacle list hold the indexed obstacles (moving ones may follow)? */
export function obsIndexed(idx: HarbourIndex | undefined, obs: Obstacle[]): idx is HarbourIndex {
  return !!idx && idx.nObs > 0 && obs.length >= idx.nObs && obs[0] === idx.o0 && obs[idx.nObs - 1] === idx.oL;
}
export function fenIndexed(idx: HarbourIndex | undefined, f: Fender[] | null): idx is HarbourIndex {
  return !!idx && !!f && idx.nFen > 0 && f === idx.fenders && f.length === idx.nFen && f[0] === idx.f0 && f[idx.nFen - 1] === idx.fL;
}
/** Does the index still describe exactly these three lists (same lengths, same first and last items)? */
export function indexFresh(idx: HarbourIndex | undefined, obstacles: Obstacle[], fenders: Fender[], bollards: Pt[]): idx is HarbourIndex {
  return !!idx && obstacles.length === idx.nObs && obstacles[0] === idx.o0 && obstacles[obstacles.length - 1] === idx.oL
    && fenders === idx.fenders && fenders.length === idx.nFen && fenders[0] === idx.f0 && fenders[fenders.length - 1] === idx.fL
    && bollards === idx.bollards && bollards.length === idx.nBol && bollards[0] === idx.b0 && bollards[bollards.length - 1] === idx.bL;
}
export function bolIndexed(idx: HarbourIndex | undefined, b: Pt[]): idx is HarbourIndex {
  return !!idx && idx.nBol > 0 && b === idx.bollards && b.length === idx.nBol && b[0] === idx.b0 && b[idx.nBol - 1] === idx.bL;
}
