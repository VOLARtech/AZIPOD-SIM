import { DEG, KN } from './physics/ship';
import type { Fender, Obstacle, Pt } from './physics/contact';
import { fenderReaction } from './physics/contact';
import type { CurrentField } from './physics/sim';
import type { EscortSetup } from './physics/escort';
import { Shoal, depthField, DepthField, DepthGrid, gridField } from './physics/harbour';
import { bboxOf } from './physics/contact';
import { AMSTERDAM, Building } from './scenes/amsterdam';
import { MIAMI } from './scenes/miami';
export type { Building };

/** One scripted DP fault: at time t a unit trips, the switchboard blacks out, or a reference drifts (toward dir, deg). */
export interface DpScriptItem { t: number; kind: 'unit' | 'blackout' | 'drift' | 'common'; unit?: number; ref?: 'DGNSS 1' | 'DGNSS 2' | 'HPR'; dir?: number }

export interface Scenario {
  id: string; name: string; brief: string;
  start: { n: number; e: number; psi: number; kn: number };
  windKn: number; windFrom: number; gusts: boolean;
  currentKn: number; currentSet: number;          // set = direction current flows TO (deg)
  depth: number;                                  // base depth, m (Infinity = deep)
  shoals: Shoal[];
  obstacles: Obstacle[];
  berth?: { n: number; e: number; psi: number };  // target CG pose
  fenders: Fender[];                              // discrete fender units
  bollards: Pt[];
  mooringSide?: -1 | 1;                           // ship side that goes alongside
  tugSide?: -1 | 1;                               // tugs available, working on this side
  shelter?: (n: number, e: number) => number;     // current reduction factor 0..1
  zoom: number;
  ship?: string;                                  // ship id (default: MV Bécancour; the harbour scenarios use the Spirit)
  /** Fender face of the berth: a point on it, its direction (deg) and the ship side that lies to it.
   *  The berth pose (CG mark) is derived from it for whichever ship is loaded. */
  berthFace?: { n: number; e: number; psi: number; side: -1 | 1; standoff: number };
  escort?: EscortSetup;                           // own ship is a tug made fast to this ship
  tugsOnly?: boolean;                             // only ships with towing points can play it
  /** Scripted DP faults: a unit trips, the switchboard blacks out, a position reference drifts. */
  dpScript?: DpScriptItem[];
  dpOnly?: boolean;                               // only ships with a DP system can play it
  tugBP?: number;                                 // tug bollard pull [N]
  buildings?: Building[];                         // 3D-only scenery
  landHeight?: number;                            // quay / bank height above water for 3D
  chart?: string;                                 // real chart id (ENC-derived layers drawn instead of the grid)
  tide?: number;                                  // height of tide above chart datum [m]
  depthGrid?: DepthGrid;                          // charted depth grid (replaces depth + shoals)
  needsData?: boolean;                            // heavy data (depth grid, land) is loaded on demand…
  setData?: (p: { grid: DepthGrid; land: Pt[][] }) => void;   // …and installed with this
  source?: unknown;                               // provenance (chart cells, editions)
}

// Hull-on-structure: stiff while loading, little stored energy returned (plating crush) → e ≈ 0.2
const CONCRETE = { k: 6e6, c: 1.5e6, mu: 0.45, unload: 0.04 };
const BANK = { k: 1.5e6, c: 2e6, mu: 0.7, unload: 0.02 };   // soft mud/rock bank

/** Row of cone fenders (default ≈ SCN 1000 class: 1.0 m, 72 % rated deflection, ~900 kN). */
function fenderRow(n: number, e0: number, e1: number, spacing: number, nn: number, ne: number, size = { width: 3.2, height: 1.0, Rr: 900e3 }): Fender[] {
  const out: Fender[] = [];
  for (let e = e0; e <= e1 + 1e-6; e += spacing)
    out.push({ n, e, nn, ne, width: size.width, height: size.height, dRated: 0.72, Rr: size.Rr, Er: 0, mu: 0.2 });
  return out;
}
/** SCN 2000-class cone fenders for tanker berths: 2.0 m, ~2.8 MN rated reaction. */
const SCN2000 = { width: 4.0, height: 2.0, Rr: 2.8e6 };

const rect = (n0: number, e0: number, n1: number, e1: number): Pt[] => [[n0, e0], [n0, e1], [n1, e1], [n1, e0]];

export function currentField(sc: Scenario, kn: number, setDeg: number): CurrentField {
  const V = kn * KN, cN = V * Math.cos(setDeg * DEG), cE = V * Math.sin(setDeg * DEG);
  if (!sc.shelter) return () => [cN, cE];
  const f = sc.shelter;
  return (n, e) => { const k = f(n, e); return [cN * k, cE * k]; };
}

export const SCENARIOS: Scenario[] = [
  MIAMI,
  AMSTERDAM,
  {
    id: 'quai27', name: 'Quai 27 · port side to',
    brief: 'Land the 293 m Spirit port side to on the fenders with the CG on the berth mark, then put out head, stern and springs. Offshore wind, ebb setting west, weaker water inside the pier. 12 m alongside; silt off the pier head carries 8.6 m. Two 60 t tugs on call on the starboard side.',
    ship: 'spirit', tugBP: 588e3,
    start: { n: -300, e: -520, psi: 70, kn: 5 },
    windKn: 14, windFrom: 15, gusts: true, currentKn: 1.2, currentSet: 270, depth: 12,
    shoals: [
      { poly: [[-250, 150], [-250, 250], [-160, 250], [-150, 190], [-190, 140]], depth: 8.6, label: '8.6' },
      { poly: rect(-620, -900, -545, 900), depth: 7.0, label: '7.0' },
    ],
    obstacles: [
      { poly: rect(1.0, -520, 400, 260), ...CONCRETE, kind: 'fendered' },
      { poly: rect(-150, 260, 400, 330), ...CONCRETE, kind: 'pier' },
      { poly: rect(-900, -900, -620, 900), ...BANK, kind: 'bank' },
    ],
    berth: { n: -16.2, e: 40, psi: 90 },
    fenders: fenderRow(0, -500, 240, 20, -1, 0),
    bollards: Array.from({ length: 31 }, (_, i) => [3, -500 + i * 24] as Pt),
    mooringSide: -1, tugSide: 1,
    // the pier shadows the ebb along the quay: weak water inside ~150 m
    shelter: (n, e) => {
      const ss = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
      return 1 - 0.65 * ss(-210, -110, n) * (1 - ss(250, 330, e));
    },
    zoom: 0.55,
  },
  {
    id: 'canal', name: 'Dredged channel · bank effect',
    brief: '260 m wide, 10.6 m deep (h/T 1.36) for a 293 m, 7.8 m-draught ship. Hold the centreline at 6–8 kn: watch squat eat the under-keel clearance, and the stern get drawn toward the near bank if you wander off centre. An 8.5 m shoal narrows the channel halfway.',
    ship: 'spirit',
    start: { n: -1500, e: -34, psi: 0, kn: 7 },
    windKn: 8, windFrom: 250, gusts: true, currentKn: 0.5, currentSet: 180, depth: 10.6,
    shoals: [
      { poly: [[-225, 46], [-225, 130], [180, 130], [180, 77], [0, 46]], depth: 8.5, label: '8.5' },
      { poly: rect(-2100, -130, 2100, -104), depth: 6.3 }, { poly: rect(-2100, 104, 2100, 130), depth: 6.3 },
    ],
    obstacles: [
      { poly: rect(-2100, -500, 2100, -130), ...BANK, kind: 'bank' },
      { poly: rect(-2100, 130, 2100, 500), ...BANK, kind: 'bank' },
    ],
    fenders: [], bollards: [],
    zoom: 0.45,
  },
  {
    id: 'swing', name: 'Swing basin · 180°',
    brief: 'Turn the 293 m Spirit 180° inside a 660 m basin and leave the way you came. Fresh beam wind, no current. Watch your pod wash off the walls. Two 60 t tugs available on the port side if you want them.',
    ship: 'spirit', tugBP: 588e3,
    start: { n: -1144, e: 0, psi: 0, kn: 4 },
    windKn: 16, windFrom: 270, gusts: true, currentKn: 0, currentSet: 0, depth: 10.5,
    shoals: [],
    obstacles: [
      { poly: rect(-1232, -880, 484, -330), ...CONCRETE, kind: 'quay' },
      { poly: rect(-1232, 330, 484, 880), ...CONCRETE, kind: 'quay' },
      { poly: rect(330, -330, 484, 330), ...CONCRETE, kind: 'quay' },
      { poly: rect(-924, -330, -880, -110), ...CONCRETE, kind: 'pier' },
      { poly: rect(-924, 110, -880, 330), ...CONCRETE, kind: 'pier' },
    ],
    fenders: [], bollards: [], tugSide: -1,
    zoom: 0.45,
  },
  {
    id: 'terminal', name: 'Crude terminal · jetty, port side to',
    brief: 'Deep-water tanker jetty: four breasting dolphins on a 26 m berth, mooring dolphins beyond, open water astern. Come in at a shallow angle, take the way off early (a big ship carries it for miles), and land flat on the dolphins at a few centimetres a second. 18 kn wind on the starboard bow, flood tide 0.8 kn along the berth. Two 80 t tugs on the starboard side. Schematic, not a real terminal.',
    start: { n: -1150, e: -2300, psi: 72, kn: 5 },
    windKn: 18, windFrom: 40, gusts: true, currentKn: 0.8, currentSet: 90, depth: 30,
    shoals: [
      { poly: [[260, -3200], [260, 3200], [900, 3200], [900, -3200]], depth: 12, label: '12' },
      { poly: [[-3200, 900], [-1600, 1400], [-1300, 3200], [-3200, 3200]], depth: 16, label: '16' },
      { poly: rect(-60, -260, 30, 260), depth: 26, label: '26' },
    ],
    obstacles: [
      // breasting dolphins (fendered faces on n = 0), loading platform set back, mooring dolphins
      ...[-130, -45, 45, 130].map(e => ({ poly: rect(0, e - 7, 14, e + 7), ...CONCRETE, kind: 'fendered' as const })),
      { poly: rect(8, -22, 40, 22), ...CONCRETE, kind: 'pier' as const },
      ...[-230, -185, 185, 230].map(e => ({ poly: rect(35, e - 6, 47, e + 6), ...CONCRETE, kind: 'pier' as const })),
      { poly: rect(40, -12, 300, 12), ...CONCRETE, kind: 'pier' as const },                 // trestle to shore
      { poly: rect(300, -3200, 1400, 3200), ...BANK, kind: 'bank' as const },
    ],
    berthFace: { n: -2, e: 0, psi: 90, side: -1, standoff: 0.1 },
    fenders: [-130, -45, 45, 130].flatMap(e => fenderRow(-2, e - 3, e + 3, 6, -1, 0, SCN2000)),
    bollards: [-230, -185, -45, 45, 185, 230].map(e => [41, e] as Pt),
    mooringSide: -1, tugSide: 1, tugBP: 80 * 9.81e3, ship: 'kvlcc2',
    zoom: 0.5,
  },
  {
    id: 'escort', name: 'Escort · laden VLCC, 8 kn',
    brief: 'You are the escort tug, made fast on your forward winch to the centre lead aft of a laden VLCC making 8 kn on 000°, 60 m of line out. Work out to her quarter, then steer her with the line in indirect mode: hold your hull at an angle to the flow and let the water do the work. At about three minutes her rudder jams 20° to starboard: stop the swing. Watch the line tension and your heel: a line leading abeam at high tension girts and capsizes a tug.',
    start: { n: 0, e: 0, psi: 0, kn: 8 },
    windKn: 10, windFrom: 300, gusts: true, currentKn: 0, currentSet: 0, depth: Infinity,
    shoals: [], obstacles: [], fenders: [], bollards: [], zoom: 1.6,
    ship: 'asd-tug', tugsOnly: true,
    escort: { ship: 'kvlcc2', kn: 8, course: 0, fair: 'aft', tugPoint: 0, L0: 60, failure: { t: 180, kind: 'rudder', rudder: 20, text: 'Escorted ship: RUDDER JAMMED 20° STARBOARD' } },
  },
  {
    id: 'hsc', name: 'Fast ferry · harbour entrance at speed',
    brief: 'You are coming in from sea at 34 kn on 000°. The breakwater gap is 150 m wide, 3.5 km ahead, and inside it the harbour limit is 8 kn. A fast craft carries her way for only a couple of lengths, so the skill is judging when to come off the power: the hull drops off the plane through the resistance hump. Then berth port side to on the ferry quay at the head of the basin: buckets and nozzles, or switch to the joystick. Fresh westerly, 1 kn flood setting east across the entrance. Schematic harbour.',
    start: { n: -3500, e: -60, psi: 0, kn: 34 },
    windKn: 18, windFrom: 260, gusts: true, currentKn: 1.0, currentSet: 90, depth: 9,
    shoals: [{ poly: rect(-260, -1400, -40, -900), depth: 3.2, label: '3.2' }, { poly: rect(-260, 900, -40, 1400), depth: 3.2, label: '3.2' }],
    obstacles: [
      { poly: rect(-40, -1400, 0, -75), ...CONCRETE, kind: 'quay' },
      { poly: rect(-40, 75, 0, 1400), ...CONCRETE, kind: 'quay' },
      { poly: rect(0, -1400, 720, -620), ...BANK, kind: 'bank' },
      { poly: rect(0, 620, 720, 1400), ...BANK, kind: 'bank' },
      { poly: rect(600, -620, 720, 620), ...CONCRETE, kind: 'fendered' },
    ],
    berthFace: { n: 598.5, e: -120, psi: 90, side: -1, standoff: 0.1 },
    fenders: fenderRow(598.5, -380, 140, 16, -1, 0),
    bollards: Array.from({ length: 14 }, (_, i) => [603, -380 + i * 40] as Pt),
    mooringSide: -1, ship: 'hsc-cat',
    // the breakwater shelters the basin from the cross-set
    shelter: n => (n > 0 ? 0.15 : 1),
    zoom: 0.5,
  },
  {
    id: 'dp', name: 'DP · supply run at a platform',
    brief: 'Platform supply vessel on DP, stern 25 m off the east face of a fixed platform, ready to work cargo. Wind 24 kn from the east-south-east, 0.8 kn current setting west-north-west: the environment pushes her onto the platform. Take her in on the joystick, then AUTO POS with the stern 15 m off. During the run the instructor script trips the port azimuth (2 min), then both DGNSS drift together (5 min): a drift-off toward the platform if you trust them. Watch the position plot and the consequence alarm.',
    start: { n: 0, e: 92, psi: 90, kn: 0 },
    windKn: 24, windFrom: 110, gusts: true, currentKn: 0.8, currentSet: 290, depth: 110,
    shoals: [],
    obstacles: [
      ...[[-25, -25], [-25, 25], [25, -25], [25, 25]].map(([n, e]) => ({ poly: rect(n - 3, e - 3, n + 3, e + 3), ...CONCRETE, kind: 'pier' as const })),
    ],
    fenders: [], bollards: [], zoom: 2.4,
    ship: 'psv', dpOnly: true,
    dpScript: [{ t: 120, kind: 'unit', unit: 0 }, { t: 300, kind: 'common', dir: 90 }],
  },
  {
    id: 'trials', name: 'Open water · trials',
    brief: 'Deep, calm, no obstructions. Try a crash stop, a pod-only turn, the joystick, or walking the ship sideways.',
    ship: 'spirit',
    start: { n: 0, e: 0, psi: 0, kn: 8 },
    windKn: 0, windFrom: 0, gusts: false, currentKn: 0, currentSet: 0, depth: Infinity,
    shoals: [], obstacles: [], fenders: [], bollards: [], zoom: 0.3,
  },
];

for (const sc of SCENARIOS) for (const o of sc.obstacles) o.bbox = bboxOf(o.poly);

const fields = new Map<string, DepthField>();
export function depthAt(sc: Scenario): DepthField {
  let f = fields.get(sc.id);
  if (!f) {
    if (sc.needsData && !sc.depthGrid) return () => sc.depth;     // not loaded yet: never cache the placeholder
    f = sc.depthGrid ? gridField(sc.depthGrid, sc.tide ?? 0) : depthField(sc.depth, sc.shoals);
    fields.set(sc.id, f);
  }
  return f;
}


/** Everything the predictor worker needs about a scenario, rebuilt from its id. */
export function scenarioWorld(id: string) {
  const sc = SCENARIOS.find(s => s.id === id)!;
  return {
    obstacles: sc.obstacles, fenders: sc.fenders, bollards: sc.bollards, depthAt: depthAt(sc),
    current: (kn: number, set: number) => currentField(sc, kn, set),
  };
}

// Rated energy: area under the reaction curve to rated deflection
for (const sc of SCENARIOS) for (const f of sc.fenders) {
  const dr = f.dRated * f.height, N = 50; let E = 0;
  for (let i = 0; i < N; i++) E += fenderReaction(f, (i + 0.5) / N * dr) * dr / N;
  f.Er = E;
}

/** Berth pose (CG mark) for a ship of beam B and CG offset xg, from the scenario's fender face. */
export function berthFor(sc: Scenario, B: number, xg: number) {
  const f = sc.berthFace;
  if (!f) return sc.berth;
  const ps = f.psi * Math.PI / 180, off = -f.side * (B / 2 + f.standoff);
  // the ship lies parallel to the face, off it by half her beam and the fender standoff; CG offset along the face
  return { n: f.n + off * Math.cos(ps + Math.PI / 2) + xg * Math.cos(ps), e: f.e + off * Math.sin(ps + Math.PI / 2) + xg * Math.sin(ps), psi: f.psi };
}
/** Water at the start (and the berth) deep enough for a ship of draught T? */
export function fits(sc: Scenario, T: number, berth = sc.berth, tug = true, dp = true) {
  if (sc.tugsOnly && !tug) return false;
  if (sc.dpOnly && !dp) return false;
  const d = depthAt(sc);
  const ok = (n: number, e: number, need: number) => d(n, e) >= need;
  return ok(sc.start.n, sc.start.e, 1.1 * T) && (!berth || ok(berth.n, berth.e, 1.05 * T));
}
