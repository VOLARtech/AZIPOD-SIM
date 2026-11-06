// IJmuiden – Noordzeekanaal – Amsterdam, from Rijkswaterstaat's inland ENC cells, 1 m bathymetry and buoy
// register (CC0), built by tools/chart/build_region.py into the area pack (scenes/ijmuiden/). Depths are below
// NAP. Outside the locks the North Sea's tide, inside the canal held at NAP −0.40 m. The Zeesluis (2022) is
// worked by its lock master; the Noordersluis, Middensluis and Zuidersluis stand shut. Not for navigation.
import IJM_META from './ijmuiden/ijmuiden.meta.json';
import type { Pt } from '../physics/contact';
import type { LockDef } from '../physics/lock';
import { IJMUIDEN_TIDE } from '../physics/levels';

/** A chamber's axis and width from its charted outline: the smallest rectangle around it (one side along an
 *  edge of the outline), its long axis the chamber's; a, the west (sea) end. */
function chamberBox(ring0: Pt[]) {
  const ring = ring0.length > 1 && ring0[0][0] === ring0[ring0.length - 1][0] && ring0[0][1] === ring0[ring0.length - 1][1] ? ring0.slice(0, -1) : ring0;
  let best: { area: number; u: Pt; s0: number; s1: number; w0: number; w1: number } | null = null;
  for (let i = 0; i < ring.length; i++) {
    const p = ring[i], q = ring[(i + 1) % ring.length], L = Math.hypot(q[0] - p[0], q[1] - p[1]);
    if (L < 1) continue;
    const u: Pt = [(q[0] - p[0]) / L, (q[1] - p[1]) / L];
    let s0 = Infinity, s1 = -Infinity, w0 = Infinity, w1 = -Infinity;
    for (const [n, e] of ring) { const s = n * u[0] + e * u[1], w = -n * u[1] + e * u[0]; s0 = Math.min(s0, s); s1 = Math.max(s1, s); w0 = Math.min(w0, w); w1 = Math.max(w1, w); }
    const area = (s1 - s0) * (w1 - w0);
    if (!best || area < best.area) best = { area, u, s0, s1, w0, w1 };
  }
  let { u, s0, s1, w0, w1 } = best!;
  if (s1 - s0 < w1 - w0) { u = [-u[1], u[0]]; [s0, s1, w0, w1] = [w0, w1, -s1, -s0]; }      // the long side is the axis
  const wc = (w0 + w1) / 2, at = (s: number): Pt => [u[0] * s - u[1] * wc, u[1] * s + u[0] * wc];
  let a = at(s0), b = at(s1);
  if (a[1] > b[1]) [a, b] = [b, a];
  return { a, b, width: w1 - w0 };
}
interface Meta { locks: { basins: { name: string | null; ring: Pt[] }[] }; zones: { e0: number; n0: number; cell: number; nx: number; ny: number; rle: string } | null }
const META = IJM_META as unknown as Meta;
const basin = (re: RegExp) => META.locks.basins.filter(b => b.name && re.test(b.name));
const zee = chamberBox(basin(/Zeesluis IJmuiden/)[0].ring);

/** The Zeesluis: 500 × 70 m between its gates, sill NAP −18 m, rolling gates (config: travel, valves). */
export const ZEESLUIS: LockDef = {
  id: 'zeesluis', name: 'Zeesluis IJmuiden', vhf: 'VHF 22',
  a: zee.a, b: zee.b, width: Math.round(zee.width), sill: 18, gateThick: 11, gateTravel: 150, recess: 1,
  valveArea: 30, mu: 0.7, valveTime: 180, outer: 'outer', inner: 'inner', maxLength: 500,
  // least charted depths of the outer basin and the Noordzeekanaal (Rijkswaterstaat IENC 1R7NK000/NK008)
  approach: { outer: 14.4, inner: 14.9 }, highWater: 1.0,
};
// the other locks stand shut: a gate across each end of each chamber
const shutGates: Pt[][] = basin(/(Noordersluis|Middensluis|Zuidersluis) IJmuiden/).flatMap(bs => {
  const c = chamberBox(bs.ring), dn = c.b[0] - c.a[0], de = c.b[1] - c.a[1], L = Math.hypot(dn, de), u: Pt = [dn / L, de / L], w: Pt = [-u[1], u[0]];
  const P = (s: number, ww: number): Pt => [c.a[0] + u[0] * s + w[0] * ww, c.a[1] + u[1] * s + w[1] * ww];
  return [0, L - 8].map(s0 => [P(s0, -c.width / 2 - 2), P(s0 + 8, -c.width / 2 - 2), P(s0 + 8, c.width / 2 + 2), P(s0, c.width / 2 + 2)]);
});
// which water has the tide and which the canal's level: the builder's flood fill from the sea around the lock
// complex (10 m cells: o outer, i inner, c chamber, . land, land taking its nearest water's), west/east beyond it
const lockMid = (zee.a[1] + zee.b[1]) / 2;
const zoneGrid = (() => {
  const z = META.zones; if (!z) return null;
  const v = new Uint8Array(z.nx * z.ny); let k = 0;
  for (const [, num, ch] of z.rle.matchAll(/(\d+)(\D)/g)) { v.fill(ch === 'o' ? 1 : ch === '.' ? 0 : 2, k, k + +num); k += +num; }
  for (let pass = 0; pass < 6; pass++) {                       // land cells take the zone of the water beside them
    const w = v.slice();
    for (let i = 0; i < z.ny; i++) for (let j = 0; j < z.nx; j++) {
      const c = i * z.nx + j; if (v[c]) continue;
      w[c] = (j > 0 && v[c - 1]) || (j < z.nx - 1 && v[c + 1]) || (i > 0 && v[c - z.nx]) || (i < z.ny - 1 && v[c + z.nx]) || 0;
    }
    v.set(w);
  }
  return { ...z, v };
})();
export function ijmZoneAt(n: number, e: number): 'outer' | 'inner' {
  const z = zoneGrid;
  if (z) {
    const i = Math.floor((n - z.n0) / z.cell), j = Math.floor((e - z.e0) / z.cell);
    if (i >= 0 && i < z.ny && j >= 0 && j < z.nx) { const c = z.v[i * z.nx + j]; if (c) return c === 1 ? 'outer' : 'inner'; }
  }
  return e < lockMid ? 'outer' : 'inner';
}
const levels = (tideT0: number) => ({ tide: IJMUIDEN_TIDE, tideT0, inner: -0.4, zoneAt: ijmZoneAt });

const u = [(zee.b[0] - zee.a[0]) / 544, (zee.b[1] - zee.a[1]) / 544];
const along = (s: number): { n: number; e: number } => ({ n: zee.a[0] + u[0] * s, e: zee.a[1] + u[1] * s });
const axisPsi = (Math.atan2(zee.b[1] - zee.a[1], zee.b[0] - zee.a[0]) * 180 / Math.PI + 360) % 360;

const area = { shoals: [], obstacles: [], fenders: [], bollards: [], landHeight: 3.4, chart: 'ijmuiden', area: 'ijmuiden', needsData: true, depth: 15, tugBP: 60 * 9.81e3, iala: 'A' as const, tide: -0.4, extraSolids: shutGates };

export const IJM_LOCK_IN = {
  ...area, lockDef: ZEESLUIS, lockOpen: null, levels: levels(0),
  id: 'ijm-lock-in', name: 'IJmuiden · through the Zeesluis, inbound',
  brief: 'Real chart: Rijkswaterstaat. High water outside: the North Sea stands about 1.3 m above the canal. Bring the 293 m Spirit up the outer harbour to the Zeesluis (500 × 70 m, the largest sea lock in the world), call the lock master on VHF (CALL LOCK), wait for the green light, go in at no more than 2 knots and make fast on the south wall. He shuts the sea gate and levels you down to the canal: tend your lines, the surge pulls on them. On the green light at the canal gate, let go and proceed into the Noordzeekanaal. 12 kn south-westerly. Two 60 t tugs.',
  ship: 'spirit',
  start: { ...along(-900), psi: axisPsi, kn: 4 },
  windKn: 12, windFrom: 240, gusts: true, currentKn: 0.2, currentSet: 90,
  mooringSide: 1 as const, tugSide: -1 as const, zoom: 0.35,
};
export const IJM_LOCK_OUT = {
  ...area, lockDef: ZEESLUIS, lockOpen: null, levels: levels(0),
  id: 'ijm-lock-out', name: 'IJmuiden · through the Zeesluis, outbound',
  brief: 'Real chart: Rijkswaterstaat. The Spirit outbound from the Noordzeekanaal at high water: call the lock, enter from the canal side, make fast and be lifted about 1.3 m to the sea level, then out past the pier heads. The chamber rises under you: lines on the wall-top bollards go slack and then pull as the ship rises; keep them tended. 10 kn westerly.',
  ship: 'spirit',
  start: { ...along(544 + 900), psi: (axisPsi + 180) % 360, kn: 4 },
  windKn: 10, windFrom: 270, gusts: true, currentKn: 0.1, currentSet: 270,
  mooringSide: -1 as const, tugSide: 1 as const, zoom: 0.35,
};
export const IJM_LOCK_VLCC = {
  ...area, lockDef: ZEESLUIS, lockOpen: null, levels: levels(-3600),
  id: 'ijm-lock-vlcc', name: 'IJmuiden · VLCC in ballast through the Zeesluis',
  brief: 'Real chart: Rijkswaterstaat. A 333 m VLCC in ballast (10.5 m) an hour before high water: 58 m of beam in a 70 m chamber, 6 m either side. Laden (20.8 m) the lock master would turn her away: the sill and the canal are not deep enough. Call the lock, come in dead slow on the tugs: with the canal gate shut she pushes the water ahead of her and it stops her hard. Make fast on the south wall. 8 kn westerly. Two 60 t tugs.',
  ship: 'kvlcc2-ballast',
  start: { ...along(-1100), psi: axisPsi, kn: 3 },
  windKn: 8, windFrom: 270, gusts: true, currentKn: 0.2, currentSet: 90,
  mooringSide: 1 as const, tugSide: -1 as const, zoom: 0.3,
};
export const NZK_TRANSIT = {
  ...area, lockDef: ZEESLUIS, lockOpen: 'b' as const, levels: levels(0),
  id: 'nzk-transit', name: 'Noordzeekanaal · IJmuiden to Amsterdam',
  brief: "Real chart: Rijkswaterstaat. A 3600 TEU container ship (KCS hull) just out of the Zeesluis, bound up the Noordzeekanaal to the Amerikahaven in Amsterdam's western port: 15 km of canal at NAP −0.40 m, bends at Velsen and Zijkanaal C, ferries crossing, other ships. Hold the middle, meet the other ships on your own side and slow down for the harbour entrance. Lie port side to at the Holland Cargo Terminal. 14 kn south-westerly.",
  ship: 'kcs',
  start: { ...along(544 + 700), psi: axisPsi, kn: 6 },
  windKn: 14, windFrom: 225, gusts: true, currentKn: 0.1, currentSet: 90,
  mooringSide: -1 as const, tugSide: 1 as const, zoom: 0.3,
  berthRef: { match: /Holland Cargo Terminal Zuid/, side: -1 as const },
};
export const IJM_SCENARIOS = [IJM_LOCK_IN, IJM_LOCK_OUT, IJM_LOCK_VLCC, NZK_TRANSIT];
