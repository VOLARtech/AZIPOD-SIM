// Amsterdam, Passenger Terminal Amsterdam (PTA) on the IJ.
// Published berth data (amsterdamcruiseport.com): 600 m quay, 10 m water depth, no tide,
// max vessel 340 m / beam 39 m / draught 8.80 m, quay 2 m above the water.
// Geometry is a schematic of the IJ at the PTA built from approximate coordinates, not a survey:
// the quay runs about 078°, the IJ is about 390 m wide here, Amsterdam Centraal lies ~1.3 km west.
import type { Fender, Obstacle, Pt } from '../physics/contact';
import type { Shoal } from '../physics/harbour';

const QB = 78 * Math.PI / 180;                       // quay bearing
const cq = Math.cos(QB), sq = Math.sin(QB);          // along the quay (s)
const cp = Math.cos(QB - Math.PI / 2), sp = Math.sin(QB - Math.PI / 2); // toward the north bank (y)
/** Quay frame (s along the quay, y off the quay toward the north bank) → NED [n, e]. */
export const qf = (s: number, y: number): Pt => [s * cq + y * cp, s * sq + y * sp];
const box = (s0: number, y0: number, s1: number, y1: number): Pt[] => [qf(s0, y0), qf(s1, y0), qf(s1, y1), qf(s0, y1)];

const CONCRETE = { k: 6e6, c: 1.5e6, mu: 0.45, unload: 0.04 };

export interface Building { n: number; e: number; heading: number; w: number; d: number; h: number; color: string; name?: string; glass?: boolean }
const bld = (s: number, y: number, w: number, d: number, h: number, color: string, name?: string, glass = false): Building => {
  const [n, e] = qf(s, y);
  return { n, e, heading: 78, w, d, h, color, name, glass };
};

const FENDER_H = 1.6;
const fenders: Fender[] = [];
for (let s = -300; s <= 300; s += 25) {
  const [n, e] = qf(s, FENDER_H);
  // estimated: large cone fenders, ~2.2 MN rated (PTA's real fender data are not published)
  fenders.push({ n, e, nn: cp, ne: sp, width: 4, height: FENDER_H, dRated: 0.72, Rr: 2.2e6, Er: 0, mu: 0.2 });
}

const obstacles: Obstacle[] = [
  { poly: box(-340, -700, 340, 0), ...CONCRETE, kind: 'fendered' },            // PTA quay (Piet Heinkade)
  { poly: box(-2800, -700, -340, 0), ...CONCRETE, kind: 'quay' },              // De Ruyterkade, Centraal Station
  { poly: box(340, -700, 2800, 0), ...CONCRETE, kind: 'quay' },                // Oostelijke Handelskade
  { poly: box(400, 0, 520, 45), ...CONCRETE, kind: 'pier' },                   // Muziekgebouw aan 't IJ
  { poly: box(-1350, 0, -1150, 30), ...CONCRETE, kind: 'pier' },               // ferry pontoons at Centraal
  { poly: box(-2800, 390, -1100, 900), ...CONCRETE, kind: 'quay' },            // Amsterdam-Noord, west
  { poly: box(-1100, 340, -450, 900), ...CONCRETE, kind: 'quay' },             // Overhoeks (EYE, A'DAM tower)
  { poly: box(-450, 390, 2800, 900), ...CONCRETE, kind: 'quay' },              // Noord, IJplein
];

const shoals: Shoal[] = [
  { poly: box(-340, 0, 340, 45), depth: 10.0, label: '10.0' },                 // berth pocket
  { poly: box(-2800, 330, 2800, 390), depth: 6.0, label: '6.0' },              // north margin
];

const buildings: Building[] = [
  bld(0, -32, 520, 28, 14, '#d7dde2', 'Passenger Terminal Amsterdam', true),
  bld(-180, -110, 120, 60, 26, '#8d6e5c'), bld(-20, -115, 140, 60, 30, '#a07b62'), bld(150, -105, 130, 50, 24, '#c9c3b5'),
  bld(320, -120, 120, 70, 32, '#6f7d86', undefined, true), bld(-380, -90, 80, 50, 20, '#9a8576'),
  bld(460, 22, 100, 40, 28, '#9fb4c2', "Muziekgebouw aan 't IJ", true),
  bld(-1250, -120, 320, 70, 24, '#9c4a36', 'Amsterdam Centraal'),
  bld(-900, -90, 160, 60, 22, '#8a6d5a'), bld(-650, -100, 140, 60, 26, '#b49a84'),
  bld(-800, 470, 26, 26, 80, '#e3e6e8', "A'DAM Toren", true),
  bld(-930, 375, 90, 45, 22, '#f2f2f0', 'EYE Filmmuseum'),
  bld(-300, 440, 160, 60, 18, '#7b8a92'), bld(0, 450, 200, 70, 24, '#a59a8a'), bld(300, 440, 160, 60, 16, '#8f9aa1'),
  bld(650, 445, 180, 60, 28, '#6e7a83', undefined, true), bld(900, -110, 160, 70, 22, '#a18571'),
];

export const AMSTERDAM = {
  id: 'amsterdam-pta', name: 'Amsterdam · PTA, starboard side to',
  brief: 'Bring a 293 m Spirit-class Azipod cruise ship up the IJ and land her starboard side to at the Passenger Terminal Amsterdam: 600 m quay, 10 m alongside, no tide. A fresh south-westerly blows off the quay. Two 60 t tugs on the port side. Geometry is a schematic of the IJ, not a survey.',
  ship: 'spirit',
  start: { n: qf(-1500, 190)[0], e: qf(-1500, 190)[1], psi: 78, kn: 5 },
  windKn: 18, windFrom: 225, gusts: true, currentKn: 0.2, currentSet: 258, depth: 10.5,
  shoals, obstacles, fenders,
  berth: { n: qf(0, FENDER_H + 16.1 + 0.1)[0], e: qf(0, FENDER_H + 16.1 + 0.1)[1], psi: 78 },
  bollards: Array.from({ length: 27 }, (_, i) => qf(-325 + i * 25, -1.5)),
  mooringSide: 1 as const, tugSide: -1 as const, tugBP: 588e3,
  buildings, landHeight: 2,
  zoom: 0.55,
};
