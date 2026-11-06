// Real-chart areas: what each is (bundled meta: origin, datum, cell editions, berth faces, locks) and how its
// berths are named and kinded. Its heavy data (area pack: depths and land; chart) is fetched by areafetch.ts,
// on the main thread only: the predictor worker is posted the same pack (so it never carries a copy).
import type { BerthKind, BerthSpec } from '../physics/berths';
import type { Pt } from '../physics/contact';
import MIAMI_META from './miami/miami.meta.json';
import LALB_META from './lalb/lalb.meta.json';
import IJM_META from './ijmuiden/ijmuiden.meta.json';

export interface AreaFace { a: Pt; b: Pt; nrm: Pt; depth: number; len: number; name: string; place?: string | null; whole?: boolean }
export interface AreaMeta {
  id: string; name: string; origin: [number, number]; datum: string; iala: 'A' | 'B'; landHeight: number;
  bounds: [number, number, number, number]; fetched?: string;
  cells: Record<string, { edition?: string | number | null; update?: string | number | null; issued?: string | null; scale?: number | null; source: string }>;
  faces: AreaFace[];
  locks?: { basins: { name?: string | null; ring: Pt[] }[]; gates: { name?: string | null; cat?: number | null; pts: Pt[] }[] };
  latMinusNap?: number | null;
}
export interface AreaDef {
  meta: AreaMeta;
  /** Berth kinds by name (first match wins); the rest are general cargo berths, small faces tug berths. */
  kinds?: { match: RegExp; kind: BerthKind; design?: string }[];
  /** Berths the chart shows only in fragments (a tanker jetty's platform and dolphins): laid out by the rules. */
  extra?: BerthSpec[];
}

export const AREAS: Record<string, AreaDef> = {
  miami: {
    meta: MIAMI_META as unknown as AreaMeta,
    kinds: [{ match: /Berth [1-9H J]|\(V\)|Bays/, kind: 'cruise' }],
  },
  lalb: {
    meta: LALB_META as unknown as AreaMeta,
    // Long Beach Pier T, Berth T121 (crude): the jetty's line in the 22–24 m basin east of the pier's tip
    extra: [{ id: 'T121', name: 'Pier T · Berth T121 (crude)', kind: 'dolphins', a: [2000, 700], b: [2380, 700], nrm: [0, 1], charted: true }],
    kinds: [
      // crude and product berths (Pier 400 Berth 408 takes VLCCs; Long Beach T121; Los Angeles 238–240)
      { match: /Berths? (408|T?121|23[89]|240)\b/, kind: 'tanker' },
      { match: /Berths? (9[1-3]|8[89]|90)\b/, kind: 'cruise' },
      { match: /Berths? (40[1-6]|30[1-6]|1[0-3]\d|2[1-7]\d)\b|Pier (J|E|G|T|A|400|300)\b/, kind: 'container' },
    ],
  },
  ijmuiden: {
    meta: IJM_META as unknown as AreaMeta,
    kinds: [
      { match: /[Cc]ruise|Passenger/, kind: 'cruise' },
      { match: /[Oo]lie|Tank|LNG|Petroleum/, kind: 'tanker' },
      { match: /[Cc]ontainer|ACT|Terminal/, kind: 'container' },
      { match: /Binnenvaart|loswal|steiger|Steiger/, kind: 'general' },
    ],
  },
};
/** Chart names to app names: "PIER T" and bare pier letters as "Pier T"; "Berth Berth" once. */
const tidy = (n: string) => n.replace(/Berth Berth/, 'Berth').replace(/ \(Bays [^)]*\)/, '').replace(/^PIER /, 'Pier ').replace(/^([A-Z]|\d{1,3}) · /, 'Pier $1 · ');

/** The area's berth faces as berth specs (ids F1…), named and kinded. */
export function areaBerths(id: string): BerthSpec[] {
  const def = AREAS[id];
  // whole wharves first: their fenders are sized for the biggest ship, and the numbered berths along them share them
  const order = def.meta.faces.map((f, i) => [f, i] as const).sort((x, y) => Number(!!y[0].whole) - Number(!!x[0].whole) || x[1] - y[1]);
  // a face looking into a lock chamber is a lock wall
  const chambers = def.meta.locks?.basins.map(b => b.ring) ?? [];
  const inRing = (r: Pt[], n: number, e: number) => { let k = false; for (let i = 0, j = r.length - 1; i < r.length; j = i++) if ((r[i][1] > e) !== (r[j][1] > e) && n < (r[j][0] - r[i][0]) * (e - r[i][1]) / (r[j][1] - r[i][1]) + r[i][0]) k = !k; return k; };
  return order.map(([f, i]) => {
    const name = tidy(f.name);
    const k = def.kinds?.find(x => x.match.test(name));
    const mn = (f.a[0] + f.b[0]) / 2 + 5 * f.nrm[0], me = (f.a[1] + f.b[1]) / 2 + 5 * f.nrm[1];
    const kind: BerthKind = chambers.some(r => inRing(r, mn, me)) ? 'lockwall' : f.len < 60 ? 'tug' : k?.kind ?? 'general';
    return { id: `F${i + 1}`, name, kind, a: f.a, b: f.b, nrm: f.nrm, charted: true, ...(k?.design ? { design: k.design } : {}) } as BerthSpec;
  }).concat(def.extra ?? []);
}
