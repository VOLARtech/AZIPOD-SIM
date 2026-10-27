import { DEG, KN } from './physics/ship';
import type { Fender, Obstacle, Pt } from './physics/contact';
import { fenderReaction } from './physics/contact';
import type { CurrentField } from './physics/sim';
import { Shoal, depthField, DepthField, DepthGrid, gridField } from './physics/harbour';
import { bboxOf } from './physics/contact';
import { AMSTERDAM, Building } from './scenes/amsterdam';
import { MIAMI } from './scenes/miami';
export type { Building };

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
  ship?: string;                                  // ship id (default: MV Bécancour)
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

/** Row of cone fenders (≈ SCN 1000 class: 1.0 m, 72 % rated deflection, ~900 kN). */
function fenderRow(n: number, e0: number, e1: number, spacing: number, nn: number, ne: number): Fender[] {
  const out: Fender[] = [];
  for (let e = e0; e <= e1 + 1e-6; e += spacing)
    out.push({ n, e, nn, ne, width: 3.2, height: 1.0, dRated: 0.72, Rr: 900e3, Er: 0, mu: 0.2 });
  return out;
}

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
    brief: 'Land port side to on the fenders with the CG on the berth mark, then put out head, stern and springs. Offshore wind, ebb setting west, weaker water inside the pier. 9 m alongside; silt off the pier head carries 6.2 m. Two tugs on call on the starboard side.',
    start: { n: -300, e: -520, psi: 70, kn: 5 },
    windKn: 16, windFrom: 15, gusts: true, currentKn: 1.2, currentSet: 270, depth: 9,
    shoals: [
      { poly: [[-250, 150], [-250, 250], [-160, 250], [-150, 190], [-190, 140]], depth: 6.2, label: '6.2' },
      { poly: rect(-620, -900, -545, 900), depth: 5.0, label: '5.0' },
    ],
    obstacles: [
      { poly: rect(1.0, -520, 400, 260), ...CONCRETE, kind: 'fendered' },
      { poly: rect(-150, 260, 400, 330), ...CONCRETE, kind: 'pier' },
      { poly: rect(-900, -900, -620, 900), ...BANK, kind: 'bank' },
    ],
    berth: { n: -10.6, e: 40, psi: 90 },
    fenders: fenderRow(0, -500, 240, 20, -1, 0),
    bollards: Array.from({ length: 31 }, (_, i) => [3, -500 + i * 24] as Pt),
    mooringSide: -1, tugSide: 1,
    // the pier shadows the ebb along the quay: weak water inside ~150 m
    shelter: (n, e) => {
      const ss = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
      return 1 - 0.65 * ss(-210, -110, n) * (1 - ss(250, 330, e));
    },
    zoom: 1.1,
  },
  {
    id: 'canal', name: 'Dredged channel · bank effect',
    brief: '170 m wide, 7.5 m deep (h/T 1.36). Hold the centreline at 6–8 kn: watch squat eat the under-keel clearance, and the stern get drawn toward the near bank if you wander off centre. A 6.0 m shoal narrows the channel halfway.',
    start: { n: -900, e: -22, psi: 0, kn: 7 },
    windKn: 8, windFrom: 250, gusts: true, currentKn: 0.5, currentSet: 180, depth: 7.5,
    shoals: [
      { poly: [[-150, 30], [-150, 85], [120, 85], [120, 50], [0, 30]], depth: 6.0, label: '6.0' },
      { poly: rect(-1400, -85, 1400, -68), depth: 4.5 }, { poly: rect(-1400, 68, 1400, 85), depth: 4.5 },
    ],
    obstacles: [
      { poly: rect(-1400, -400, 1400, -85), ...BANK, kind: 'bank' },
      { poly: rect(-1400, 85, 1400, 400), ...BANK, kind: 'bank' },
    ],
    fenders: [], bollards: [],
    zoom: 0.8,
  },
  {
    id: 'swing', name: 'Swing basin · 180°',
    brief: 'Turn 180° inside a 300 m basin and leave the way you came. Fresh beam wind, no current. Watch your pod wash off the walls. Tugs available on the port side if you want them.',
    start: { n: -520, e: 0, psi: 0, kn: 4 },
    windKn: 22, windFrom: 270, gusts: true, currentKn: 0, currentSet: 0, depth: 8,
    shoals: [],
    obstacles: [
      { poly: rect(-560, -400, 220, -150), ...CONCRETE, kind: 'quay' },
      { poly: rect(-560, 150, 220, 400), ...CONCRETE, kind: 'quay' },
      { poly: rect(150, -150, 220, 150), ...CONCRETE, kind: 'quay' },
      { poly: rect(-420, -150, -400, -50), ...CONCRETE, kind: 'pier' },
      { poly: rect(-420, 50, -400, 150), ...CONCRETE, kind: 'pier' },
    ],
    fenders: [], bollards: [], tugSide: -1,
    zoom: 1.0,
  },
  {
    id: 'trials', name: 'Open water · trials',
    brief: 'Deep, calm, no obstructions. Try a crash stop, a pod-only turn, the joystick, or walking the ship sideways.',
    start: { n: 0, e: 0, psi: 0, kn: 8 },
    windKn: 0, windFrom: 0, gusts: false, currentKn: 0, currentSet: 0, depth: Infinity,
    shoals: [], obstacles: [], fenders: [], bollards: [], zoom: 0.55,
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
