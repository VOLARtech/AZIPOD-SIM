// PortMiami, Terminal V (Virgin Voyages), built from NOAA ENC harbour cells (S-57, public domain).
// tools/chart/fetch_noaa.py pulls the cells; tools/chart/build_chart.py turns them into
//   miami.meta.json     berth face, fenders, bollards, cell editions        (bundled)
//   miami.physics.json  10 m depth grid (MLLW) and land/wharf contact tiles (loaded on demand)
//   miami.chart.json    depth areas, contours, soundings, aids… for the chart (loaded on demand)
// Simulation only, not for navigation: the chart is reduced, simplified and may be out of date.
import META from './miami.meta.json';
import type { Fender, Obstacle, Pt } from '../physics/contact';
import { bboxOf } from '../physics/contact';
import type { DepthGrid } from '../physics/harbour';

const B = META.berth;
const [an, ae] = B.along, [nn, ne] = B.normal;           // along the face (to its north end), normal to the water
const faceAt = (s: number, off = 0): Pt => [B.n + an * s + nn * off, B.e + ae * s + ne * off];
const deg = (n: number, e: number) => ((Math.atan2(e, n) * 180 / Math.PI) + 360) % 360;

const FENDER_H = 1.8;
// estimated: large cone fenders typical of a cruise berth (Terminal V's fender data are not published)
const fenders: Fender[] = B.fenders.map(s => {
  const [n, e] = faceAt(s, FENDER_H);
  return { n, e, nn, ne, width: 4, height: FENDER_H, dRated: 0.72, Rr: 2.4e6, Er: 0, mu: 0.2 };
});
const HALF_B = 16.1;                                    // Spirit-class beam / 2
const berthPos = faceAt(B.centre, FENDER_H + HALF_B + 0.1);
const heading = deg(an, ae);                            // bow toward the turning basin, starboard side to

export const MIAMI = {
  id: 'miami-terminal-v', name: 'PortMiami · Terminal V, starboard side to',
  brief: 'Real chart: NOAA ENC harbour cells. Come up the Main Channel past Berths 1–9 at 5 kn, swing in the turning basin at the west end and back her down onto Terminal V, starboard side to, bow to the basin. The dredged berth carries 10.0 m (MLLW), tide +0.3 m; the water shoals fast south of the berth and outside the channel. 15 kn easterly trade wind on the quarter, weak flood. Two 70 t tugs on the port side.',
  ship: 'spirit',
  start: { n: 17, e: 300, psi: 295, kn: 5 },
  windKn: 15, windFrom: 95, gusts: true, currentKn: 0.3, currentSet: 290, depth: 12,
  shoals: [], obstacles: [] as Obstacle[], fenders,
  berth: { n: berthPos[0], e: berthPos[1], psi: heading },
  bollards: B.bollards as Pt[],
  mooringSide: 1 as const, tugSide: -1 as const, tugBP: 686e3,
  landHeight: 2.5, zoom: 0.45,
  chart: 'miami', tide: 0.3,
  depthGrid: undefined as DepthGrid | undefined,
  source: META,
  needsData: true,
  /** Install the depth grid and land tiles (loaded on demand by the main thread, posted to workers). */
  setData(P: { grid: DepthGrid; land: Pt[][] }) {
    if (this.depthGrid) return;
    // land / wharf tiles: concrete; the ones along the berth face carry the fenders
    const CONCRETE = { k: 6e6, c: 1.5e6, mu: 0.45, unload: 0.04 };
    const [fn0, fe0] = faceAt(Math.min(...B.fenders) - 15), [fn1, fe1] = faceAt(Math.max(...B.fenders) + 15);
    const nearFace = (p: Pt[]) => p.some(([n, e]) => {
      const dn = fn1 - fn0, de = fe1 - fe0, l2 = dn * dn + de * de;
      const t = Math.max(0, Math.min(1, ((n - fn0) * dn + (e - fe0) * de) / l2));
      return Math.hypot(n - fn0 - t * dn, e - fe0 - t * de) < 3;
    });
    this.obstacles.length = 0;
    for (const poly of P.land) {
      const o: Obstacle = { poly, ...CONCRETE, kind: nearFace(poly) ? 'fendered' : 'quay' };
      o.bbox = bboxOf(poly);
      this.obstacles.push(o);
    }
    this.depthGrid = P.grid;
  },
};
