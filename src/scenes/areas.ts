// Real-chart areas: what each is (bundled meta: origin, datum, cell editions, berth faces), and where its
// heavy data lives (area pack: depths and land; chart). Packs are fetched when an area is first opened and
// kept for offline use by the service worker; the predictor worker is posted the same pack.
import type { BerthKind, BerthSpec } from '../physics/berths';
import type { Pt } from '../physics/contact';
import { gunzip } from './pack';
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
  meta: AreaMeta; pack: string; chart: string;
  /** Berth kinds by name (first match wins); the rest are general cargo berths, small faces tug berths. */
  kinds?: { match: RegExp; kind: BerthKind; design?: string }[];
  /** Berths the chart shows only in fragments (a tanker jetty's platform and dolphins): laid out by the rules. */
  extra?: BerthSpec[];
}

export const AREAS: Record<string, AreaDef> = {
  miami: {
    // new URL(…, import.meta.url): an asset for Vite, a file for Node (the tests read the packs from disk)
    meta: MIAMI_META as unknown as AreaMeta, pack: new URL('./miami/miami.azp', import.meta.url).href, chart: new URL('./miami/miami.azc', import.meta.url).href,
    kinds: [{ match: /Berth [1-9H J]|\(V\)|Bays/, kind: 'cruise' }],
  },
  lalb: {
    meta: LALB_META as unknown as AreaMeta, pack: new URL('./lalb/lalb.azp', import.meta.url).href, chart: new URL('./lalb/lalb.azc', import.meta.url).href,
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
    meta: IJM_META as unknown as AreaMeta, pack: new URL('./ijmuiden/ijmuiden.azp', import.meta.url).href, chart: new URL('./ijmuiden/ijmuiden.azc', import.meta.url).href,
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
  return order.map(([f, i]) => {
    const name = tidy(f.name);
    const k = def.kinds?.find(x => x.match.test(name));
    const kind: BerthKind = f.len < 60 ? 'tug' : k?.kind ?? 'general';
    return { id: `F${i + 1}`, name, kind, a: f.a, b: f.b, nrm: f.nrm, charted: true, ...(k?.design ? { design: k.design } : {}) } as BerthSpec;
  }).concat(def.extra ?? []);
}

/** Read a pack or chart: fetch in the browser, the file itself under Node. */
async function load(url: string): Promise<ArrayBuffer> {
  if (url.startsWith('file:')) {
    const fs = await import(/* @vite-ignore */ 'node:fs' as string) as { readFileSync(p: URL): Uint8Array };
    const b = fs.readFileSync(new URL(url)); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
  }
  const r = await fetch(url); if (!r.ok) throw new Error(`${r.status} ${url}`);
  return r.arrayBuffer();
}
const raw = new Map<string, Promise<ArrayBuffer>>();
/** The area pack, inflated (fetched once a session; the service worker keeps it for offline use). */
export function fetchAreaPack(id: string): Promise<ArrayBuffer> {
  let p = raw.get(id);
  if (!p) {
    p = load(AREAS[id].pack).then(gunzip);
    raw.set(id, p); p.catch(() => raw.delete(id));
  }
  return p;
}
export async function fetchAreaChart(id: string): Promise<unknown> {
  return JSON.parse(new TextDecoder().decode(await gunzip(await load(AREAS[id].chart))));
}
