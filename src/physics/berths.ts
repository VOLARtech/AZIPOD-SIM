// Berths: every quay, pier, dolphin or lock-wall face a ship can lie at, and the fenders and bollards it
// carries. One rule set equips them all, hand-built and charted alike:
//  - fenders sized from the berthing energy of the largest ship that fits the berth (PIANC WG33 2002:
//    E = ½·M·v²·Cm·Ce·Cs·Cc, with an abnormal-impact factor), spaced at most about 0.15 of the design
//    ship's length apart, on the face, facing the water;
//  - bollards every 10–30 m set back from the edge, carried on past each end of the face (where there is
//    still quay to put them on) so the head, stern and breast lines of a ship as long as the berth reach;
//  - equipment the scenario already has is kept, in its place and first in the lists; the rules only fill
//    the gaps.
import type { Fender, Obstacle, Pt } from './contact';
import { fenderReaction } from './contact';
import type { DepthField } from './harbour';
import type { ShipSpec } from './ship';
import { BoxIndex } from './spatial';
const bboxOfPoly = (p: Pt[]): [number, number, number, number] => { let a = Infinity, b = Infinity, c = -Infinity, d = -Infinity; for (const [n, e] of p) { if (n < a) a = n; if (e < b) b = e; if (n > c) c = n; if (e > d) d = e; } return [a, b, c, d]; };

export type BerthKind = 'container' | 'tanker' | 'cruise' | 'ferry' | 'roro' | 'general' | 'bulk' | 'tug' | 'yacht'
  | 'pontoon' | 'lockwall' | 'waiting' | 'dolphins';

export interface BerthSpec {
  id: string; name: string; kind: BerthKind;
  /** The face: two points on the structure's edge, a → b. */
  a: Pt; b: Pt;
  /** Unit normal of the face, out into the water. */
  nrm: Pt;
  depth?: number;              // depth alongside [m below the scenario's datum] (else sampled from the depth field)
  top?: number;                // deck height above the water [m] (else the scenario's land height)
  design?: string;             // design ship id (else the largest ship of the fleet that fits)
  /** false: only the equipment already there, nothing generated (a berth whose gear is all hand-placed). */
  generate?: boolean;
  charted?: boolean;           // the face comes from a chart (else hand-built)
  /** Longest ship that lies here clear of everything (a structure in front of part of the face). */
  maxLOA?: number;
}

export interface Berth extends BerthSpec {
  len: number;
  dir: Pt;                     // unit vector along the face, a → b
  depth: number;
  designShip: string;
  /** Berthing energy of the design ship [J]: normal, and with the abnormal-impact factor (what one fender must take). */
  E: { normal: number; design: number; v: number };
  /** The fenders' front panels stand this far off the face [m] (0 without fenders). */
  fenderLat: number;
  /** The scenario's own gear is on this berth (its fenders are then the size of those, not the rule's). */
  kept: boolean;
  /** Open water a ship may overhang past each end, before a quay or pier across her way [m]. */
  room: [number, number];
  /** Least depth along the berth at each distance off the face [m off, m deep]: a wide ship needs it further out. */
  profile: [number, number][];
}

/** What a bollard is: its height above the water, the kind of fitting, safe working load [t]. */
export interface BollardInfo { berth: string; z: number; kind: 'bollard' | 'hook' | 'floating'; swl: number }

/** Per kind of berth: fender spacing, smallest fender, bollard spacing, bollard setback from the edge,
 *  abnormal-impact factor (PIANC 2002 table 4.2.5), and the seaward reach of the bollard line past the ends. */
interface Rule { fs: number; hMin: number; bs: number; set: number; cab: number }
export const RULES: Record<BerthKind, Rule> = {
  container: { fs: 20, hMin: 1.6, bs: 25, set: 2.0, cab: 1.5 },
  cruise: { fs: 20, hMin: 1.6, bs: 25, set: 1.5, cab: 2.0 },
  tanker: { fs: 20, hMin: 2.0, bs: 25, set: 2.0, cab: 1.25 },
  bulk: { fs: 15, hMin: 1.0, bs: 25, set: 1.5, cab: 1.25 },
  general: { fs: 15, hMin: 1.0, bs: 20, set: 1.5, cab: 1.75 },
  ferry: { fs: 12.5, hMin: 1.0, bs: 20, set: 1.5, cab: 2.0 },
  roro: { fs: 12.5, hMin: 1.0, bs: 20, set: 1.5, cab: 2.0 },
  tug: { fs: 5, hMin: 0.4, bs: 10, set: 1.0, cab: 2.0 },
  yacht: { fs: 5, hMin: 0.4, bs: 10, set: 1.0, cab: 2.0 },
  pontoon: { fs: 5, hMin: 0.4, bs: 10, set: 1.0, cab: 2.0 },
  lockwall: { fs: 6, hMin: 0.3, bs: 30, set: 1.0, cab: 1.0 },
  waiting: { fs: 20, hMin: 1.0, bs: 25, set: 1.5, cab: 1.5 },
  dolphins: { fs: 20, hMin: 2.0, bs: 25, set: 2.0, cab: 1.25 },
};

// ---------------------------------------------------------------- fenders
/** Rated energy: area under the reaction curve to rated deflection [J]. */
export function ratedEnergy(f: Fender) {
  const dr = f.dRated * f.height, N = 50; let E = 0;
  for (let i = 0; i < N; i++) E += fenderReaction(f, (i + 0.5) / N * dr) * dr / N;
  return E;
}
/** Cone-fender sizes (projection, m) a berth is fitted with. */
export const FENDER_SIZES = [0.3, 0.4, 0.5, 0.6, 0.8, 1.0, 1.15, 1.25, 1.4, 1.6, 1.8, 2.0, 2.25, 2.5, 3.0];
/** A geometrically scaled SCN 1000-class cone: reaction ∝ H², energy ∝ H³. */
export function fenderOf(H: number): Omit<Fender, 'n' | 'e' | 'nn' | 'ne'> {
  const f = { width: Math.min(4.5, Math.max(1, 1.2 + 2 * H)), height: H, Rr: 0.9e6 * H * H, Er: 0, dRated: 0.72, mu: 0.2 };
  f.Er = ratedEnergy(f as Fender);
  return f;
}
const E1000 = fenderOf(1).Er;
/** Smallest fender that takes energy E [J] at rated deflection, and no smaller than hMin. */
export function fenderClass(E: number, hMin = 0) {
  const need = Math.max(hMin, Math.cbrt(E / E1000));
  return fenderOf(FENDER_SIZES.find(h => h >= need - 1e-9) ?? FENDER_SIZES[FENDER_SIZES.length - 1]);
}

// ---------------------------------------------------------------- berthing energy (PIANC WG33)
export const displacement = (sp: Pick<ShipSpec, 'L' | 'B' | 'T' | 'Cb'>) => 1025 * sp.L * sp.B * sp.T * sp.Cb;
/** Design approach speed [m/s]: a fit to the Brolsma curve for sheltered, moderately difficult berthing. */
export const approachSpeed = (M: number) => Math.min(0.35, Math.max(0.08, 0.2 * (M / 1e7) ** -0.27));
/** Normal berthing energy of a ship landing at the quarter point (eccentricity 0.5, virtual mass 1 + 2T/B) [J]. */
export function berthingEnergy(sp: Pick<ShipSpec, 'L' | 'B' | 'T' | 'Cb'>, v?: number) {
  const M = displacement(sp), vv = v ?? approachSpeed(M);
  return 0.5 * M * vv * vv * (1 + 2 * sp.T / sp.B) * 0.5;
}
/** Bollard safe working load [t] for a ship of this displacement (PIANC / BS 6349-4 bands). */
export function bollardSWL(M: number) {
  const t = M / 1e3;
  return t <= 2e3 ? 10 : t <= 1e4 ? 30 : t <= 2e4 ? 50 : t <= 5e4 ? 80 : t <= 1e5 ? 100 : t <= 2e5 ? 150 : 200;
}

/** The water a ship of beam B has under her alongside: the least depth from the face out past her far side. */
export function depthFor(b: Pick<Berth, 'profile' | 'fenderLat' | 'depth'>, B: number) {
  if (!b.profile?.length) return b.depth;
  let d = Infinity;
  for (const [off, z] of b.profile) if (off <= b.fenderLat + B + 2 || d === Infinity) d = Math.min(d, z);
  return d;
}
/** The largest ship of the fleet that fits a berth with this much length and depth (keel clearance 5 %). */
export function designShipFor(len: number, depth: number | ((B: number) => number), fleet: ShipSpec[]) {
  const dOf = typeof depth === 'number' ? () => depth : depth;
  const ok = fleet.filter(s => s.T * 1.05 <= dOf(s.B) && s.LOA <= len);
  const by = (a: ShipSpec, b: ShipSpec) => displacement(b) - displacement(a) || (a.id < b.id ? -1 : 1);
  return ok.length ? ok.sort(by)[0] : null;
}

// ---------------------------------------------------------------- equipping
export interface EquipOpts {
  depthAt: DepthField;
  /** Is there quay (or pier, dolphin…) here to put a bollard on? */
  solid: (n: number, e: number) => boolean;
  top: number;                 // default deck height above the water [m]
  fleet: ShipSpec[];
  tide?: number;
  /** A new structure the rules put up (a dolphin berth's breasting and mooring dolphins and platform). */
  addSolid?: (poly: Pt[]) => void;
}

const geomCache = new WeakMap<BerthSpec, { depthAt: DepthField; sp: BerthSpec; len: number; dir: Pt; nrm: Pt; profile: [number, number][]; room: [number, number] }>();
/** How far past each end of a face a ship may stick out, at most, as a fraction of its length. */
const ROOM = 0.35;
/** …and in metres: no further than her head and stern lines still reach the last bollards. */
const ROOM_MAX = 45;
/** The length a ship may have at a berth: the face, the clear water past its ends, 2 m spare at each. */
export const usableLength = (b: Pick<Berth, 'len' | 'room' | 'maxLOA'>) => Math.min(b.len + b.room[0] + b.room[1] - 4, b.maxLOA ?? Infinity);
/** A charted face that runs on into shallow water at an end (a wharf rounding into the shoals) is a berth only
 *  where the water alongside is near the depth of the rest of it. */
function trimShallowEnds(sp: BerthSpec, depthAt: DepthField): BerthSpec {
  const dn = sp.b[0] - sp.a[0], de = sp.b[1] - sp.a[1], len = Math.hypot(dn, de);
  if (len < 60) return sp;
  // the least of the water close alongside and out where a big ship's far side lies
  const at = (s: number) => Math.min(...[2, 8, 20, 35].map(off => depthAt(sp.a[0] + dn / len * s + sp.nrm[0] * off, sp.a[1] + de / len * s + sp.nrm[1] * off)));
  const xs: number[] = []; for (let s = 2; s <= len - 2; s += 2) xs.push(at(s));
  const med = [...xs].sort((x, y) => x - y)[xs.length >> 1], ok = (z: number) => z >= 0.85 * med;
  let i0 = 0, i1 = xs.length - 1;
  while (i0 < i1 && !ok(xs[i0])) i0++;
  while (i1 > i0 && !ok(xs[i1])) i1--;
  const s0 = i0 ? 2 + 2 * i0 : 0, s1 = i1 < xs.length - 1 ? 2 + 2 * i1 : len;
  if (s1 - s0 < 30 || (s0 === 0 && s1 === len)) return sp;
  return { ...sp, a: [sp.a[0] + dn / len * s0, sp.a[1] + de / len * s0], b: [sp.a[0] + dn / len * s1, sp.a[1] + de / len * s1] };
}
/** Points along [s0, s1] at most `step` apart, around the ones already there (sorted). */
export function fillAlong(kept: number[], s0: number, s1: number, step: number): number[] {
  const out: number[] = [];
  step = Math.max(1, step);
  if (!kept.length) {
    const n = Math.max(2, Math.ceil((s1 - s0) / step - 1e-9) + 1);
    for (let i = 0; i < n; i++) out.push(s0 + (s1 - s0) * i / (n - 1));
    return out;
  }
  const k = [...kept].sort((a, b) => a - b);
  for (let x = k[0] - step; x >= s0 - 1e-6; x -= step) out.push(x);
  for (let i = 1; i < k.length; i++) {
    const g = k[i] - k[i - 1];
    if (g > 1.5 * step) { const m = Math.ceil(g / step - 1e-9); for (let j = 1; j < m; j++) out.push(k[i - 1] + g * j / m); }
  }
  for (let x = k[k.length - 1] + step; x <= s1 + 1e-6; x += step) out.push(x);
  // and one at each end if the steps left a gap there of more than half a step
  const all = [...k, ...out], lo = Math.min(...all), hi = Math.max(...all);
  if (lo > s0 + 0.5 * step) out.push(s0);
  if (hi < s1 - 0.5 * step) out.push(s1);
  return out;
}
const median = (a: number[]) => { if (!a.length) return Infinity; const s = [...a].sort((x, y) => x - y); return s[s.length >> 1]; };
const gaps = (a: number[]) => { const s = [...a].sort((x, y) => x - y); return s.slice(1).map((x, i) => x - s[i]).filter(g => g > 1); };

/** Along-face and off-face coordinates of a point (off > 0 on the water side). */
export const faceCoords = (b: Pick<Berth, 'a' | 'dir' | 'nrm'>, n: number, e: number): [number, number] => {
  const dn = n - b.a[0], de = e - b.a[1];
  return [dn * b.dir[0] + de * b.dir[1], dn * b.nrm[0] + de * b.nrm[1]];
};
/** Does this fender stand on this berth's face (front panel within 4 m of it, facing the same way)? */
export const fenderOn = (b: Berth, f: Fender) => {
  const [s, off] = faceCoords(b, f.n, f.e);
  return s >= -2 && s <= b.len + 2 && off >= -0.5 && off <= 4 && f.nn * b.nrm[0] + f.ne * b.nrm[1] > 0.9;
};
/** Does this bollard serve this berth: on the quay within 6 m behind the face, or (a dolphin berth) on its
 *  hooks and mooring dolphins, set back and out past the ends? */
export const bollardOn = (b: Berth, p: Pt) => {
  const [s, off] = faceCoords(b, p[0], p[1]), dol = b.kind === 'dolphins', reach = dol ? 120 : 5;
  return s >= -reach && s <= b.len + reach && off >= (dol ? -60 : -6) && off <= 0.5;
};

/** Build the berths from their specs and fit each with fenders and bollards (appended to the lists given;
 *  what is already in them is kept, first). Returns the berths, and what every bollard is. */
export function equipBerths(specs: BerthSpec[], fenders: Fender[], bollards: Pt[], o: EquipOpts, info: BollardInfo[] = []) {
  const berths: Berth[] = [];
  const nKeptF = fenders.length, nKeptB = bollards.length;
  // a 64 m hash of the gear, so each berth finds what already stands on it (its own, or a neighbour's on the
  // same wharf) without looking at every fender and bollard of the port
  const H = 64, key = (n: number, e: number) => Math.floor(n / H) * 100003 + Math.floor(e / H);
  const fh = new Map<number, number[]>(), bh = new Map<number, number[]>();
  const put = (h: Map<number, number[]>, i: number, n: number, e: number) => { const k = key(n, e); let a = h.get(k); if (!a) h.set(k, a = []); a.push(i); };
  const near = (h: Map<number, number[]>, bb: [number, number, number, number]) => {
    const out: number[] = [];
    for (let i = Math.floor(bb[0] / H); i <= Math.floor(bb[2] / H); i++) for (let j = Math.floor(bb[1] / H); j <= Math.floor(bb[3] / H); j++) { const a = h.get(i * 100003 + j); if (a) out.push(...a); }
    return out.sort((x, y) => x - y);
  };
  fenders.forEach((f, i) => put(fh, i, f.n, f.e)); bollards.forEach((p, i) => put(bh, i, p[0], p[1]));
  const pushF = (f: Fender) => { fenders.push(f); put(fh, fenders.length - 1, f.n, f.e); };
  const pushB = (p: Pt) => { bollards.push(p); put(bh, bollards.length - 1, p[0], p[1]); };
  for (let i = info.length; i < nKeptB; i++) info.push({ berth: '', z: o.top + 0.5, kind: 'bollard', swl: 50 });
  const byId = new Map(o.fleet.map(s => [s.id, s]));
  const grown = new Set<number>();
  for (const sp0 of specs) {
    // the face's own geometry (trimmed ends, the water along and past it) depends on the land and the depths
    // only: worked out once per spec, even when the gear is laid out again
    let g = geomCache.get(sp0);
    if (!g || g.depthAt !== o.depthAt) {
      const sp = sp0.charted ? trimShallowEnds(sp0, o.depthAt) : sp0;
      const dn = sp.b[0] - sp.a[0], de = sp.b[1] - sp.a[1], len = Math.hypot(dn, de) || 1;
      const nl = Math.hypot(sp.nrm[0], sp.nrm[1]) || 1;
      const dir: Pt = [dn / len, de / len], nrm: Pt = [sp.nrm[0] / nl, sp.nrm[1] / nl];
      const at = (s: number, off: number): Pt => [sp.a[0] + dir[0] * s + nrm[0] * off, sp.a[1] + dir[1] * s + nrm[1] * off];
      // water alongside: the least depth along the face at each distance off it
      const OFFS = [1, 2, 4, 6, 8, 10, 13, 16, 20, 25, 30, 40, 50, 60, 70], step = Math.max(1, Math.min(2.5, (len - 2) / 4));
      const least = (s0: number, s1: number, off: number) => { let d = Infinity; for (let s = s0; s <= s1 + 1e-6; s += step) { const p = at(s, off); d = Math.min(d, o.depthAt(p[0], p[1])); } return d; };
      const profile = OFFS.map(off => [off, least(1, len - 1, off)] as [number, number]);
      // how far a ship lying here may stick out past each end: up to 35 % of the face (45 m), less where a quay
      // or pier stands across her way (an inside corner) or the water there is shallower than along the face
      const probe = (s0: number, sgn: number) => {
        const cap = Math.min(ROOM * len, ROOM_MAX);
        for (let x = 0; x <= cap + 1e-6; x += 2.5) {
          for (const w of [3, 12, 24]) { const p = at(s0 + sgn * x, w); if (o.solid(p[0], p[1])) return Math.max(0, x - 2.5); }
          for (const [w, z] of profile) { if (w > 40) break; const p = at(s0 + sgn * x, w); if (o.depthAt(p[0], p[1]) < z) return Math.max(0, x - 2.5); }
        }
        return cap;
      };
      g = { depthAt: o.depthAt, sp, len, dir, nrm, profile, room: [probe(0, -1), probe(len, 1)] };
      geomCache.set(sp0, g);
    }
    const { sp, len } = g;
    const b: Berth = { ...sp, len, dir: g.dir, nrm: g.nrm, depth: 0, designShip: '', E: { normal: 0, design: 0, v: 0 }, fenderLat: 0, kept: false, room: [...g.room] as [number, number], profile: g.profile.map(x => [x[0], x[1]] as [number, number]) };
    const rule = RULES[b.kind];
    const at = (s: number, off: number): Pt => [b.a[0] + b.dir[0] * s + b.nrm[0] * off, b.a[1] + b.dir[1] * s + b.nrm[1] * off];
    // a charted depth given for the berth (below datum: the tide on top) holds alongside it; the depths the
    // depth field gives are the water as it stands, tide and all
    const tide = o.tide ?? 0;
    if (sp.depth !== undefined) b.profile = b.profile.map(([off, z]) => [off, off <= 15 ? sp.depth! + tide : z]);
    b.depth = sp.depth !== undefined ? sp.depth + tide : Math.min(...b.profile.filter(([off]) => off <= 15).map(([, z]) => z));
    b.fenderLat = RULES[b.kind].hMin;                         // until the fenders are known: for the design ship's water
    const fit = designShipFor(usableLength(b), B => depthFor(b, B), o.fleet);
    // a charted face no ship of the fleet can lie at (too shallow, too short) is no berth
    if (!fit && sp.charted && !sp.design) continue;
    const ds = (sp.design && byId.get(sp.design)) || fit || [...o.fleet].sort((x, y) => x.T - y.T)[0];
    b.designShip = ds.id;
    const M = displacement(ds), v = approachSpeed(M), En = berthingEnergy(ds, v);
    b.E = { normal: En, design: En * rule.cab, v };
    // the fenders already on this face (the scenario's own, or a whole wharf's this part of it shares), and the
    // size any new ones take
    const fbb: [number, number, number, number] = [Math.min(b.a[0], b.b[0]) - 125, Math.min(b.a[1], b.b[1]) - 125, Math.max(b.a[0], b.b[0]) + 125, Math.max(b.a[1], b.b[1]) + 125];
    const keptF = near(fh, fbb).filter(i => fenderOn(b, fenders[i]) && (i < nKeptF || ((s0: number) => s0 > 1 && s0 < len - 1)(faceCoords(b, fenders[i].n, fenders[i].e)[0])));
    b.kept = keptF.some(i => i < nKeptF);
    const sAlong = keptF.map(i => faceCoords(b, fenders[i].n, fenders[i].e)[0]);
    let tmpl: Omit<Fender, 'n' | 'e' | 'nn' | 'ne'>, lat: number;
    if (keptF.length) {
      const mid = keptF.reduce((x, i) => (Math.abs(faceCoords(b, fenders[i].n, fenders[i].e)[0] - len / 2) < Math.abs(faceCoords(b, fenders[x].n, fenders[x].e)[0] - len / 2) ? i : x), keptF[0]);
      const f = fenders[mid];
      tmpl = { width: f.width, height: f.height, Rr: f.Rr, Er: f.Er || ratedEnergy(f), dRated: f.dRated, mu: f.mu };
      lat = faceCoords(b, f.n, f.e)[1];
      // a whole wharf's fenders, sized for the ship its shallowest stretch takes, on a deeper stretch that takes a
      // bigger one: the bigger size, for the wharf's fenders here too (never the scenario's own)
      if (!b.kept && tmpl.Er < b.E.design) {
        const big = fenderClass(b.E.design, Math.max(rule.hMin, tmpl.height));
        for (const i of keptF) if ((fenders[i].Er || ratedEnergy(fenders[i])) < big.Er) {
          const p = at(faceCoords(b, fenders[i].n, fenders[i].e)[0], big.height);
          Object.assign(fenders[i], big, { n: p[0], e: p[1] }); grown.add(i);
        }
        tmpl = big; lat = big.height;
      }
    } else { tmpl = fenderClass(b.E.design, rule.hMin); lat = tmpl.height; }
    b.fenderLat = lat;
    const gen = sp.generate !== false;
    const dolphins = gen && b.kind === 'dolphins';
    const f0 = fenders.length, b0 = bollards.length;
    if (dolphins) {
      // a tanker jetty out in deep water (OCIMF practice): four breasting dolphins on the berth line, at about
      // ±0.18 and ±0.38 of the design ship's length from the middle, two fenders each; mooring dolphins set back
      // abreast of her ends for the breast lines and beyond them for head and stern lines; a loading platform
      const mid = len / 2, Lpp = ds.L, loa = ds.LOA;
      const box = (s0: number, s1: number, o0: number, o1: number): Pt[] => [at(s0, o0), at(s1, o0), at(s1, o1), at(s0, o1)];
      for (const k of [-0.38, -0.18, 0.18, 0.38]) {
        const s = mid + k * Lpp;
        o.addSolid?.(box(s - 7, s + 7, -14, 0));
        for (const d2 of [-3, 3]) { const p = at(s + d2, lat); pushF({ n: p[0], e: p[1], nn: b.nrm[0], ne: b.nrm[1], ...tmpl }); }
      }
      o.addSolid?.(box(mid - 20, mid + 20, -50, -18));
      for (const [s, off] of [[mid - 0.42 * loa, -40], [mid + 0.42 * loa, -40], [mid - 0.5 * loa - 30, -15], [mid + 0.5 * loa + 30, -15]] as [number, number][])
        o.addSolid?.(box(s - 6, s + 6, off - 6, off + 6));
    }
    if (gen && !dolphins) {
      // new fenders at the spacing of the berth's own, if it has some close to the rule's
      const ks = median(gaps(sAlong)), step = ks <= 1.35 * rule.fs ? ks : rule.fs;
      const pad = Math.min(rule.fs / 2, len / 6);
      for (const s of fillAlong(sAlong, pad, len - pad, step)) {
        const p = at(s, lat);
        pushF({ n: p[0], e: p[1], nn: b.nrm[0], ne: b.nrm[1], ...tmpl });
      }
    }
    // bollards behind the face, and on past each end while there is quay to stand them on
    const swl = bollardSWL(M), z = (sp.top ?? o.top) + 0.5;
    if (dolphins) {
      // quick-release hooks: both ends of each breasting dolphin (springs), each mooring dolphin, the platform
      const mid = len / 2, Lpp = ds.L, loa = ds.LOA;
      const hooks: Pt[] = [
        ...[-0.38, -0.18, 0.18, 0.38].flatMap(k => [at(mid + k * Lpp - 5, -4), at(mid + k * Lpp + 5, -4)]),
        at(mid - 12, -20), at(mid + 12, -20),
        ...([[mid - 0.42 * loa, -40], [mid + 0.42 * loa, -40], [mid - 0.5 * loa - 30, -15], [mid + 0.5 * loa + 30, -15]] as [number, number][]).map(([s, off]) => at(s, off)),
      ];
      for (const p of hooks) { pushB(p); info.push({ berth: b.id, z, kind: 'hook', swl }); }
    }
    const keptB = near(bh, fbb).filter(i => bollardOn(b, bollards[i]));
    const bAlong = keptB.map(i => faceCoords(b, bollards[i][0], bollards[i][1])[0]);
    for (const i of keptB) if (!info[i].berth) info[i] = { berth: b.id, z, kind: b.kind === 'dolphins' ? 'hook' : 'bollard', swl };
    if (gen && !dolphins) {
      const kb = median(gaps(bAlong)), step = kb <= 1.2 * rule.bs ? kb : rule.bs;
      const ext = Math.min(0.5 * ds.LOA, 120);
      // set back as the scenario's own are (not as a neighbouring face's that reach round the corner)
      const ownB = keptB.find(i => i < nKeptB);
      const set = ownB !== undefined ? Math.max(0.5, -faceCoords(b, bollards[ownB][0], bollards[ownB][1])[1]) : rule.set;
      const cand = keptB.length ? fillAlong(bAlong, -ext, len + ext, step).concat([1, len - 1].filter(x => bAlong.every(y => Math.abs(y - x) > 0.5 * step)))
        : fillAlong([], 1, len - 1, rule.bs).concat(fillAlong([1], -ext, 1, rule.bs), fillAlong([len - 1], len - 1, len + ext, rule.bs));   // 1 m in from the corners
      for (const s0 of cand) {
        // one that falls on a corner moves 1 m in, onto the quay
        const s = Math.abs(s0 - len) < 1 ? len - 1 : Math.abs(s0) < 1 ? 1 : s0;
        let p = at(s, -set);
        const q = at(s, 2);
        // a narrow pier or catwalk: nearer the edge; a notch in the quay: a few metres along
        if (!o.solid(p[0], p[1])) {
          search: for (const ds of [0, -2.5, 2.5, -5, 5]) for (const k of [1, 0.6, 0.35]) {
            if (s + ds < -1 && s >= -1) continue;
            const p2 = at(s + ds, -set * k); if (o.solid(p2[0], p2[1])) { p = p2; break search; }
          }
        }
        // on the quay, and past the ends only while the quay edge runs on (not round a corner, not inland)
        if (!o.solid(p[0], p[1]) || ((s < -1 || s > len + 1) && o.solid(q[0], q[1]))) continue;
        // one bollard where two berths meet at a corner
        if (near(bh, [p[0] - 1.5, p[1] - 1.5, p[0] + 1.5, p[1] + 1.5]).some(i => Math.abs(bollards[i][0] - p[0]) < 1.5 && Math.abs(bollards[i][1] - p[1]) < 1.5)) continue;
        pushB(p);
        info.push({ berth: b.id, z, kind: 'bollard', swl });
      }
    }
    // a lock wall: floating bollards in slots in the wall face, every 60 m between the wall-top ones; they
    // ride up and down with the chamber, so a line on them keeps its length while the level changes
    if (gen && b.kind === 'lockwall') {
      for (const s of fillAlong([], 16, len - 16, 60)) {
        const p = at(s, -0.8);
        if (!o.solid(p[0], p[1]) || near(bh, [p[0] - 1.5, p[1] - 1.5, p[0] + 1.5, p[1] + 1.5]).some(i => Math.hypot(bollards[i][0] - p[0], bollards[i][1] - p[1]) < 1.5)) continue;
        pushB(p); info.push({ berth: b.id, z: 1.0, kind: 'floating', swl });
      }
    }
    // repair: wherever the bollard line still leaves an end or a stretch uncovered (a notch, a neighbour's
    // bollards that set the spacing), one more where there is quay for it, a few metres either way if need be
    if (gen && !dolphins) {
      const set = rule.set;
      for (let it = 0; it < 8; it++) {
        const ss = near(bh, fbb).filter(i => bollardOn(b, bollards[i])).map(i => faceCoords(b, bollards[i][0], bollards[i][1])[0]).sort((x, y) => x - y);
        const want: number[] = [];
        if (!ss.length || ss[0] > 0.6 * rule.bs) want.push(1);
        if (!ss.length || ss[ss.length - 1] < len - 0.6 * rule.bs) want.push(len - 1);
        for (let k = 1; k < ss.length; k++) if (ss[k] - ss[k - 1] > 1.2 * rule.bs) want.push((ss[k] + ss[k - 1]) / 2);
        let placed = 0;
        for (const t of want) {
          search: for (const ds of [0, -2.5, 2.5, -5, 5, -7.5, 7.5]) for (const k of [1, 0.6, 0.35]) {
            const s2 = Math.max(0.5, Math.min(len - 0.5, t + ds)), p = at(s2, -set * k);
            if (!o.solid(p[0], p[1]) || near(bh, [p[0] - 1.5, p[1] - 1.5, p[0] + 1.5, p[1] + 1.5]).some(i => Math.abs(bollards[i][0] - p[0]) < 1.5 && Math.abs(bollards[i][1] - p[1]) < 1.5)) continue;
            pushB(p); info.push({ berth: b.id, z, kind: 'bollard', swl }); placed++; break search;
          }
        }
        if (!placed) break;
      }
    }
    // a charted face with nowhere to stand two bollards (a catwalk, a sliver) is no berth: take back its gear
    if (sp.charted && !dolphins && near(bh, fbb).filter(i => bollardOn(b, bollards[i])).length < 2) {
      const drop = (h: Map<number, number[]>, from: number, pts: (i: number) => Pt) => { for (let i = from; i < (h === fh ? fenders.length : bollards.length); i++) { const k = key(...pts(i)); const a = h.get(k); if (a) h.set(k, a.filter(x => x !== i)); } };
      drop(fh, f0, i => [fenders[i].n, fenders[i].e]); drop(bh, b0, i => bollards[i]);
      fenders.length = f0; bollards.length = b0; info.length = b0;
      continue;
    }
    berths.push(b);
  }
  for (let i = nKeptF; i < fenders.length; i++) if (!fenders[i].Er) fenders[i].Er = ratedEnergy(fenders[i]);
  // berths whose fenders grew for a neighbour: their fender line stands further out now
  if (grown.size) for (const b of berths) {
    if (b.kind === 'dolphins') continue;
    const fb: [number, number, number, number] = [Math.min(b.a[0], b.b[0]) - 10, Math.min(b.a[1], b.b[1]) - 10, Math.max(b.a[0], b.b[0]) + 10, Math.max(b.a[1], b.b[1]) + 10];
    const on = near(fh, fb).filter(i => fenderOn(b, fenders[i]));
    if (on.some(i => grown.has(i))) b.fenderLat = Math.max(b.fenderLat, ...on.map(i => faceCoords(b, fenders[i].n, fenders[i].e)[1]));
  }
  return { berths, info };
}

/** Point-in-solid test over a harbour's structures (quays, piers, dolphins; not banks, not ships). */
export function solidTest(obstacles: Obstacle[]) {
  const hard = obstacles.filter(o => o.kind !== 'bank' && o.kind !== 'ship');
  const idx = hard.length > 64 ? new BoxIndex(hard.map(o => o.bbox ?? bboxOfPoly(o.poly))) : null;
  return (n: number, e: number) => {
    for (const k of idx ? idx.query(n, e, n, e) : hard.keys()) {
      const o = hard[k];
      const bb = o.bbox;
      if (bb && (n < bb[0] || n > bb[2] || e < bb[1] || e > bb[3])) continue;
      let ins = false; const p = o.poly;
      for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
        const [ni, ei] = p[i], [nj, ej] = p[j];
        if ((ni > n) !== (nj > n) && e < (ej - ei) * (n - ni) / (nj - ni) + ei) ins = !ins;
      }
      if (ins) return true;
    }
    return false;
  };
}

// ---------------------------------------------------------------- using a berth
/** Heading [deg] of a ship lying with this side (−1 port, +1 starboard) to the face. */
export function berthHeading(b: Pick<Berth, 'nrm'>, side: -1 | 1) {
  const [nn, ne] = b.nrm;
  const psi = side > 0 ? Math.atan2(nn, -ne) : Math.atan2(-nn, ne);
  return ((psi * 180 / Math.PI) + 360) % 360;
}
/** Hull extent ahead of and abaft midship (the outline contact.ts builds: overhang mostly forward). */
export const hullEnds = (sp: { L: number; LOA: number }) => { const over = Math.max(5, sp.LOA - sp.L); return { fwd: sp.L / 2 + 0.8 * over, aft: sp.L / 2 + 0.2 * over }; };
/** CG pose [n, e, psi deg] of a ship alongside: side to the face, on the fenders (plus standoff), her midship
 *  `along` m from the start of the face (default: in the middle, moved along so she does not stick out past
 *  either end further than the open water there allows). */
export function berthPose(b: Berth, side: -1 | 1, ship: { B: number; xg: number; L: number; LOA: number }, along?: number, standoff = 0.1) {
  const psi = berthHeading(b, side), pr = psi * Math.PI / 180;
  let s = along ?? b.len / 2;
  if (along === undefined) {
    const { fwd, aft } = hullEnds(ship), ahead = Math.cos(pr) * b.dir[0] + Math.sin(pr) * b.dir[1] > 0;
    const lo = -b.room[0] + 2 + (ahead ? aft : fwd), hi = b.len + b.room[1] - 2 - (ahead ? fwd : aft);
    s = lo <= hi ? Math.max(lo, Math.min(hi, s)) : (lo + hi) / 2;     // too long for it: as little over each end as can be
  }
  const off = b.fenderLat + ship.B / 2 + standoff;
  return {
    n: b.a[0] + b.dir[0] * s + b.nrm[0] * off + Math.cos(pr) * ship.xg,
    e: b.a[1] + b.dir[1] * s + b.nrm[1] * off + Math.sin(pr) * ship.xg,
    psi,
  };
}
/** Nearest berth face to a point, within maxD: the berth, the distance to its face and where along it. */
export function nearestBerth(berths: Berth[], n: number, e: number, maxD = Infinity) {
  let best: { berth: Berth; d: number; s: number } | null = null;
  for (const b of berths) {
    const [s0, off] = faceCoords(b, n, e), s = Math.max(0, Math.min(b.len, s0));
    const d = Math.hypot(s0 - s, off);
    if (d <= maxD && (!best || d < best.d)) best = { berth: b, d, s };
  }
  return best;
}
/** Can a ship lie at this berth (its depths as the water stands)? null if she can, else why not. */
export function berthFits(b: Berth, ship: Pick<ShipSpec, 'T' | 'LOA' | 'B'>): string | null {
  const d = depthFor(b, ship.B);
  if (ship.T * 1.05 > d) return `too shallow (${d.toFixed(1)} m)`;
  if (ship.LOA > usableLength(b)) return `too short (${b.len.toFixed(0)} m)`;
  return null;
}
export const KIND_LABEL: Record<BerthKind, string> = {
  container: 'container', tanker: 'tanker', cruise: 'cruise', ferry: 'ferry', roro: 'ro-ro', general: 'general cargo',
  bulk: 'bulk', tug: 'tug / small craft', yacht: 'yacht', pontoon: 'pontoon', lockwall: 'lock wall', waiting: 'waiting berth', dolphins: 'dolphins',
};
