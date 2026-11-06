// Where each area's heavy data lives, and fetching it: the area pack (depths, land, charted bollards) and the
// chart. Fetched when an area is first opened and kept for offline use by the service worker. Main thread only
// (the workers get the pack posted to them), so the single-file build carries each pack once.
import { gunzip } from './pack';

// new URL(…, import.meta.url): an asset for Vite, a file for Node (the tests read the packs from disk)
const URLS: Record<string, { pack: string; chart: string }> = {
  miami: { pack: new URL('./miami/miami.azp', import.meta.url).href, chart: new URL('./miami/miami.azc', import.meta.url).href },
  lalb: { pack: new URL('./lalb/lalb.azp', import.meta.url).href, chart: new URL('./lalb/lalb.azc', import.meta.url).href },
  ijmuiden: { pack: new URL('./ijmuiden/ijmuiden.azp', import.meta.url).href, chart: new URL('./ijmuiden/ijmuiden.azc', import.meta.url).href },
};
/** The areas' data files (for "download for offline use"). */
export const AREA_FILES = Object.values(URLS).flatMap(u => [u.pack, u.chart]);

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
    p = load(URLS[id].pack).then(gunzip);
    raw.set(id, p); p.catch(() => raw.delete(id));
  }
  return p;
}
export async function fetchAreaChart(id: string): Promise<unknown> {
  return JSON.parse(new TextDecoder().decode(await gunzip(await load(URLS[id].chart))));
}
