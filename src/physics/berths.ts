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
}

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
  return out;
}
const median = (a: number[]) => { if (!a.length) return Infinity; const s = [...a].sort((x, y) => x - y); return s[s.length >> 1]; };
const gaps = (a: number[]) => { const s = [...a].sort((x, y) => x - y); return s.slice(1).map((x, i) => x - s[i]); };

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
  for (let i = info.length; i < nKeptB; i++) info.push({ berth: '', z: o.top + 0.5, kind: 'bollard', swl: 50 });
  const byId = new Map(o.fleet.map(s => [s.id, s]));
  for (const sp0 of specs) {
    const sp = sp0.charted ? trimShallowEnds(sp0, o.depthAt) : sp0;
    const dn = sp.b[0] - sp.a[0], de = sp.b[1] - sp.a[1], len = Math.hypot(dn, de) || 1;
    const nl = Math.hypot(sp.nrm[0], sp.nrm[1]) || 1;
    const b: Berth = { ...sp, len, dir: [dn / len, de / len], nrm: [sp.nrm[0] / nl, sp.nrm[1] / nl], depth: 0, designShip: '', E: { normal: 0, design: 0, v: 0 }, fenderLat: 0, kept: false, room: [0, 0], profile: [] };
    const rule = RULES[b.kind];
    const at = (s: number, off: number): Pt => [b.a[0] + b.dir[0] * s + b.nrm[0] * off, b.a[1] + b.dir[1] * s + b.nrm[1] * off];
    // water alongside: the least depth along the face at each distance off it
    const OFFS = [1, 2, 4, 6, 8, 10, 13, 16, 20, 25, 30, 40, 50, 60, 70], step = Math.max(1, Math.min(2.5, (len - 2) / 4));
    const least = (s0: number, s1: number, off: number) => { let d = Infinity; for (let s = s0; s <= s1 + 1e-6; s += step) { const p = at(s, off); d = Math.min(d, o.depthAt(p[0], p[1])); } return d; };
    b.profile = OFFS.map(off => [off, least(1, len - 1, off)] as [number, number]);
    // how far a ship lying here may stick out past each end: up to 15 % of the face, less where a quay or
    // pier stands across her way (an inside corner) or the water there is shallower than along the face
    const probe = (s0: number, sgn: number) => {
      const cap = Math.min(ROOM * len, ROOM_MAX);
      for (let x = 0; x <= cap + 1e-6; x += 2.5) {
        for (const w of [3, 12, 24]) { const p = at(s0 + sgn * x, w); if (o.solid(p[0], p[1])) return Math.max(0, x - 2.5); }
        for (const [w, z] of b.profile) { if (w > 40) break; const p = at(s0 + sgn * x, w); if (o.depthAt(p[0], p[1]) < z) return Math.max(0, x - 2.5); }
      }
      return cap;
    };
    b.room = [probe(0, -1), probe(len, 1)];
    // a charted depth given for the berth holds alongside it
    if (sp.depth !== undefined) b.profile = b.profile.map(([off, z]) => [off, off <= 15 ? sp.depth! : z]);
    b.depth = sp.depth ?? Math.min(...b.profile.filter(([off]) => off <= 15).map(([, z]) => z));
    b.fenderLat = RULES[b.kind].hMin;                         // until the fenders are known: for the design ship's water
    const tide = o.tide ?? 0;
    const fit = designShipFor(usableLength(b), B => depthFor(b, B) + tide, o.fleet);
    // a charted face no ship of the fleet can lie at (too shallow, too short) is no berth
    if (!fit && sp.charted && !sp.design) continue;
    const ds = (sp.design && byId.get(sp.design)) || fit || [...o.fleet].sort((x, y) => x.T - y.T)[0];
    b.designShip = ds.id;
    const M = displacement(ds), v = approachSpeed(M), En = berthingEnergy(ds, v);
    b.E = { normal: En, design: En * rule.cab, v };
    // the berth's own fenders (kept), and the size any new ones take
    const keptF: number[] = [];
    for (let i = 0; i < nKeptF; i++) if (fenderOn(b, fenders[i])) keptF.push(i);
    b.kept = keptF.length > 0;
    const sAlong = keptF.map(i => faceCoords(b, fenders[i].n, fenders[i].e)[0]);
    let tmpl: Omit<Fender, 'n' | 'e' | 'nn' | 'ne'>, lat: number;
    if (keptF.length) {
      const mid = keptF.reduce((x, i) => (Math.abs(faceCoords(b, fenders[i].n, fenders[i].e)[0] - len / 2) < Math.abs(faceCoords(b, fenders[x].n, fenders[x].e)[0] - len / 2) ? i : x), keptF[0]);
      const f = fenders[mid];
      tmpl = { width: f.width, height: f.height, Rr: f.Rr, Er: f.Er || ratedEnergy(f), dRated: f.dRated, mu: f.mu };
      lat = faceCoords(b, f.n, f.e)[1];
    } else { tmpl = fenderClass(b.E.design, rule.hMin); lat = tmpl.height; }
    b.fenderLat = lat;
    const gen = sp.generate !== false;
    if (gen) {
      // new fenders at the spacing of the berth's own, if it has some close to the rule's
      const ks = median(gaps(sAlong)), step = ks <= 1.35 * rule.fs ? ks : rule.fs;
      const pad = Math.min(rule.fs / 2, len / 6);
      for (const s of fillAlong(sAlong, pad, len - pad, step)) {
        const p = at(s, lat);
        fenders.push({ n: p[0], e: p[1], nn: b.nrm[0], ne: b.nrm[1], ...tmpl });
      }
    }
    // bollards behind the face, and on past each end while there is quay to stand them on
    const swl = bollardSWL(M), z = (sp.top ?? o.top) + 0.5;
    const keptB: number[] = [];
    for (let i = 0; i < nKeptB; i++) if (bollardOn(b, bollards[i])) keptB.push(i);
    const bAlong = keptB.map(i => faceCoords(b, bollards[i][0], bollards[i][1])[0]);
    for (const i of keptB) if (!info[i].berth) info[i] = { berth: b.id, z, kind: b.kind === 'dolphins' ? 'hook' : 'bollard', swl };
    if (gen) {
      const kb = median(gaps(bAlong)), step = kb <= 1.2 * rule.bs ? kb : rule.bs;
      const ext = Math.min(0.5 * ds.LOA, 120);
      const set = keptB.length ? -faceCoords(b, bollards[keptB[0]][0], bollards[keptB[0]][1])[1] : rule.set;
      const cand = keptB.length ? fillAlong(bAlong, -ext, len + ext, step)
        : fillAlong([], 1, len - 1, rule.bs).concat(fillAlong([1], -ext, 1, rule.bs), fillAlong([len - 1], len - 1, len + ext, rule.bs));   // 1 m in from the corners
      for (const s0 of cand) {
        // one that falls on a corner moves 1 m in, onto the quay
        const s = Math.abs(s0 - len) < 1 ? len - 1 : Math.abs(s0) < 1 ? 1 : s0;
        let p = at(s, -set);
        const q = at(s, 2);
        // a narrow pier or catwalk: nearer the edge
        if (!o.solid(p[0], p[1])) for (const k of [0.6, 0.35]) { const p2 = at(s, -set * k); if (o.solid(p2[0], p2[1])) { p = p2; break; } }
        // on the quay, and past the ends only while the quay edge runs on (not round a corner, not inland)
        if (!o.solid(p[0], p[1]) || ((s < -1 || s > len + 1) && o.solid(q[0], q[1]))) continue;
        // one bollard where two berths meet at a corner
        if (bollards.some(q => Math.abs(q[0] - p[0]) < 1.5 && Math.abs(q[1] - p[1]) < 1.5)) continue;
        bollards.push(p);
        info.push({ berth: b.id, z, kind: 'bollard', swl });
      }
    }
    berths.push(b);
  }
  for (let i = nKeptF; i < fenders.length; i++) if (!fenders[i].Er) fenders[i].Er = ratedEnergy(fenders[i]);
  return { berths, info };
}

/** Point-in-solid test over a harbour's structures (quays, piers, dolphins; not banks, not ships). */
export function solidTest(obstacles: Obstacle[]) {
  const hard = obstacles.filter(o => o.kind !== 'bank' && o.kind !== 'ship');
  return (n: number, e: number) => {
    for (const o of hard) {
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
/** Can a ship lie at this berth? null if she can, else why not. */
export function berthFits(b: Berth, ship: Pick<ShipSpec, 'T' | 'LOA' | 'B'>, tide = 0): string | null {
  const d = depthFor(b, ship.B);
  if (ship.T * 1.05 > d + tide) return `too shallow (${d.toFixed(1)} m)`;
  if (ship.LOA > usableLength(b)) return `too short (${b.len.toFixed(0)} m)`;
  return null;
}
export const KIND_LABEL: Record<BerthKind, string> = {
  container: 'container', tanker: 'tanker', cruise: 'cruise', ferry: 'ferry', roro: 'ro-ro', general: 'general cargo',
  bulk: 'bulk', tug: 'tug / small craft', yacht: 'yacht', pontoon: 'pontoon', lockwall: 'lock wall', waiting: 'waiting berth', dolphins: 'dolphins',
};
