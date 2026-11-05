// Real-chart areas: what each is (bundled meta: origin, datum, cell editions, berth faces), and where its
// heavy data lives (area pack: depths and land; chart). Packs are fetched when an area is first opened and
// kept for offline use by the service worker; the predictor worker is posted the same pack.
import type { BerthKind, BerthSpec } from '../physics/berths';
import type { Pt } from '../physics/contact';
import { gunzip } from './pack';
import MIAMI_META from './miami/miami.meta.json';

export interface AreaFace { a: Pt; b: Pt; nrm: Pt; depth: number; len: number; name: string; place?: string | null }
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
}

export const AREAS: Record<string, AreaDef> = {
  miami: {
    // new URL(…, import.meta.url): an asset for Vite, a file for Node (the tests read the packs from disk)
    meta: MIAMI_META as unknown as AreaMeta, pack: new URL('./miami/miami.azp', import.meta.url).href, chart: new URL('./miami/miami.azc', import.meta.url).href,
    kinds: [{ match: /Berth [1-9H J]|\(V\)|Bays/, kind: 'cruise' }],
  },
};

/** The area's berth faces as berth specs (ids F1…), named and kinded. */
export function areaBerths(id: string): BerthSpec[] {
  const def = AREAS[id];
  return def.meta.faces.map((f, i) => {
    const k = def.kinds?.find(x => x.match.test(f.name));
    const kind: BerthKind = f.len < 60 ? 'tug' : k?.kind ?? 'general';
    const name = f.name.replace(/Berth Berth/, 'Berth').replace(/ \(Bays [^)]*\)/, '');
    return { id: `F${i + 1}`, name, kind, a: f.a, b: f.b, nrm: f.nrm, charted: true, ...(k?.design ? { design: k.design } : {}) };
  });
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
