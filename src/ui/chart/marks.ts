// IALA Maritime Buoyage System: what each kind of mark looks like (colours, shape, topmark) and shows
// (light). Used to put correct marks on hand-built harbours, and to fill in what a chart leaves out.
import type { Aid } from './model';
import type { Light } from './lights';
import type { Pt } from '../../physics/contact';

export type Iala = 'A' | 'B';
/** TOPSHP values used here. */
export const TOP = { coneUp: 1, coneDown: 2, sphere: 3, spheres2: 4, can: 5, x: 7, cones2PointToPoint: 10, cones2BaseToBase: 11, cones2Up: 13, cones2Down: 14 } as const;
/** BOYSHP values. */
export const BOY = { conical: 1, can: 2, spherical: 3, pillar: 4, spar: 5, barrel: 6, superBuoy: 7 } as const;
/** BCNSHP values. */
export const BCN = { stake: 1, withy: 2, tower: 3, lattice: 4, pile: 5, cairn: 6 } as const;

/** Lateral colour for a side, by region: A — port red, starboard green; B (the Americas, Japan, Korea, the Philippines) the other way. */
export const lateralColour = (iala: Iala, side: 'port' | 'stbd') => ((side === 'port') === (iala === 'A') ? 'red' : 'green');

interface MarkOpts { name?: string; lit?: boolean; per?: number; grp?: string; h?: number; range?: number; beacon?: boolean }

/** A lateral mark: port hand (can, cylinder topmark) or starboard hand (conical, cone topmark). Lit ones are pillar buoys. */
export function lateral(iala: Iala, side: 'port' | 'stbd', [n, e]: Pt, o: MarkOpts = {}): Aid {
  const col = lateralColour(iala, side), port = side === 'port';
  const light: Light | undefined = o.lit ? { chr: 2, grp: o.grp, per: o.per ?? (o.grp ? 6 : 4), col: [col], h: o.h, range: o.range ?? 3 } : undefined;
  if (o.beacon) return { k: 'BCNLAT', n, e, col: [col], shp: BCN.tower, cat: port ? 1 : 2, top: port ? TOP.can : TOP.coneUp, topCol: [col], name: o.name, light };
  return { k: 'BOYLAT', n, e, col: [col], shp: o.lit ? BOY.pillar : port ? BOY.can : BOY.conical, cat: port ? 1 : 2, top: o.lit ? (port ? TOP.can : TOP.coneUp) : undefined, topCol: [col], name: o.name, light };
}
/** A cardinal mark: the safe water lies to its named side. Quick or very quick white light in the cardinal rhythm. */
export function cardinal(q: 'N' | 'E' | 'S' | 'W', [n, e]: Pt, o: MarkOpts & { quick?: boolean } = {}): Aid {
  const C = {
    N: { col: ['black', 'yellow'], top: TOP.cones2Up, grp: '', per: 0, cat: 1 },
    E: { col: ['black', 'yellow', 'black'], top: TOP.cones2BaseToBase, grp: '(3)', per: o.quick ? 10 : 5, cat: 2 },
    S: { col: ['yellow', 'black'], top: TOP.cones2Down, grp: '(6)', per: o.quick ? 15 : 10, cat: 3 },
    W: { col: ['yellow', 'black', 'yellow'], top: TOP.cones2PointToPoint, grp: '(9)', per: o.quick ? 15 : 10, cat: 4 },
  }[q];
  const chr = q === 'S' ? (o.quick ? 25 : 26) : o.quick ? 4 : 5;
  return { k: o.beacon ? 'BCNCAR' : 'BOYCAR', n, e, col: C.col, colpat: 1, shp: o.beacon ? BCN.tower : BOY.pillar, cat: C.cat, top: C.top, topCol: ['black'], name: o.name,
    light: { chr, grp: C.grp || undefined, per: C.per || undefined, col: ['white'], range: o.range ?? 5 } };
}
/** Isolated danger: black with a red band, two black balls, Fl(2) white. */
export const isolatedDanger = ([n, e]: Pt, o: MarkOpts = {}): Aid => ({ k: o.beacon ? 'BCNISD' : 'BOYISD', n, e, col: ['black', 'red', 'black'], colpat: 1, shp: o.beacon ? BCN.tower : BOY.pillar, top: TOP.spheres2, topCol: ['black'], name: o.name,
  light: { chr: 2, grp: '(2)', per: o.per ?? 5, col: ['white'], range: o.range ?? 4 } });
/** Safe water (fairway, landfall): red and white vertical stripes, a red ball, isophase or long flash white. */
export const safeWater = ([n, e]: Pt, o: MarkOpts = {}): Aid => ({ k: 'BOYSAW', n, e, col: ['red', 'white'], colpat: 2, shp: BOY.spherical, top: TOP.sphere, topCol: ['red'], name: o.name,
  light: { chr: 7, per: o.per ?? 4, col: ['white'], range: o.range ?? 6 } });
/** Special mark: yellow, a yellow X, yellow light. */
export const special = ([n, e]: Pt, o: MarkOpts = {}): Aid => ({ k: o.beacon ? 'BCNSPP' : 'BOYSPP', n, e, col: ['yellow'], shp: o.beacon ? BCN.stake : BOY.can, top: TOP.x, topCol: ['yellow'], name: o.name,
  light: o.lit === false ? undefined : { chr: 2, per: o.per ?? 5, col: ['yellow'], range: o.range ?? 3 } });
/** A light on a pier or breakwater head: a lateral light tower in the side's colour. */
export const pierLight = (iala: Iala, side: 'port' | 'stbd', at: Pt, o: MarkOpts = {}) => lateral(iala, side, at, { lit: true, beacon: true, h: 8, range: 5, per: 3, ...o });
/** An offshore structure's lights: white Morse U every 15 s, 10 NM, with a fog horn. */
export const platformLight = ([n, e]: Pt, o: MarkOpts = {}): Aid => ({ k: 'LIGHTS', n, e, col: ['white'], name: o.name, fog: 'horn Mo(U) 30s',
  light: { chr: 12, morse: 'U', per: 15, col: ['white'], h: o.h ?? 20, range: o.range ?? 10 } });

/** What a chart left out, filled in from the mark's class: its topmark (for pillar and spar buoys and beacons) and colours. */
export function completeAid(a: Aid, iala: Iala): Aid {
  if (a.top !== undefined) return a;
  const pillarish = a.k.startsWith('BCN') || a.shp === BOY.pillar || a.shp === BOY.spar;
  const out = { ...a };
  switch (a.k) {
    case 'BOYCAR': case 'BCNCAR': out.top = [0, TOP.cones2Up, TOP.cones2BaseToBase, TOP.cones2Down, TOP.cones2PointToPoint][a.cat ?? 0] || undefined; out.topCol = ['black']; break;
    case 'BOYISD': case 'BCNISD': out.top = TOP.spheres2; out.topCol = ['black']; break;
    case 'BOYSAW': case 'BCNSAW': out.top = TOP.sphere; out.topCol = ['red']; break;
    case 'BOYSPP': case 'BCNSPP': if (a.col.includes('yellow')) { out.top = TOP.x; out.topCol = ['yellow']; } break;
    case 'BOYLAT': case 'BCNLAT': if (pillarish && (a.cat === 1 || a.cat === 2)) {
      // port-hand marks carry a can, starboard-hand ones a cone, in the mark's colour
      out.top = a.cat === 1 ? TOP.can : TOP.coneUp;
      out.topCol = [a.col[0] ?? lateralColour(iala, a.cat === 1 ? 'port' : 'stbd')];
    } break;
  }
  if (!out.col.length && (a.k === 'BOYLAT' || a.k === 'BCNLAT') && (a.cat === 1 || a.cat === 2)) out.col = [lateralColour(iala, a.cat === 1 ? 'port' : 'stbd')];
  return out;
}
