// Area packs (tools/chart/build_region.py): one gzip file of binary physics data per area.
//   'AZP1' · u32 header length · header JSON · padding to 4 bytes
//   per depth grid: Int16 depth below datum [cm], row-major, row 0 south (padded to 4 bytes)
//   per contact tile: u32 point count · Int32 [n, e] decimetres
import type { Pt } from '../physics/contact';
import type { DepthField } from '../physics/harbour';

export interface PackGrid { e0: number; n0: number; cell: number; nx: number; ny: number; data: Int16Array }
export interface AreaPack { id: string; origin: [number, number]; datum: string; grids: PackGrid[]; tiles: Pt[][] }

/** gunzip in the browser (DecompressionStream) or in Node (zlib). */
export async function gunzip(buf: ArrayBuffer): Promise<ArrayBuffer> {
  const u8 = new Uint8Array(buf);
  if (u8[0] !== 0x1f || u8[1] !== 0x8b) return buf;               // already inflated (a server did it)
  if (typeof DecompressionStream !== 'undefined') return new Response(new Blob([buf]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
  const zlib = await import(/* @vite-ignore */ 'node:zlib' as string) as { gunzipSync(b: Uint8Array): Uint8Array };
  const out = zlib.gunzipSync(u8);
  return out.buffer.slice(out.byteOffset, out.byteOffset + out.byteLength) as ArrayBuffer;
}

export function parsePack(raw: ArrayBuffer): AreaPack {
  const dv = new DataView(raw), magic = String.fromCharCode(...new Uint8Array(raw, 0, 4));
  if (magic !== 'AZP1') throw new Error(`not an area pack (${magic})`);
  const hl = dv.getUint32(4, true);
  const hdr = JSON.parse(new TextDecoder().decode(new Uint8Array(raw, 8, hl)));
  let o = 8 + hl; o += (4 - (o % 4)) % 4;
  const grids: PackGrid[] = hdr.grids.map((g: Omit<PackGrid, 'data'>) => {
    const n = g.nx * g.ny, data = new Int16Array(raw.slice(o, o + 2 * n));
    o += 2 * n + 2 * (n % 2);
    return { ...g, data };
  });
  const tiles: Pt[][] = [];
  for (let k = 0; k < hdr.tiles; k++) {
    const m = dv.getUint32(o, true); o += 4;
    const q = new Int32Array(raw.slice(o, o + 8 * m)); o += 8 * m;
    const t: Pt[] = []; for (let i = 0; i < m; i++) t.push([q[2 * i] / 10, q[2 * i + 1] / 10]);
    tiles.push(t);
  }
  return { id: hdr.id, origin: hdr.origin, datum: hdr.datum, grids, tiles };
}

/** Depth from the finest grid that covers a point (bilinear), plus the height of the water above datum.
 *  Beyond every grid: the coarsest one's edge value. */
export function multiGridField(grids: PackGrid[], level = 0): DepthField {
  const gs = [...grids].sort((a, b) => a.cell - b.cell);
  const one = (g: PackGrid) => {
    const { nx, ny, cell, data } = g;
    const at = (i: number, j: number) => data[Math.min(ny - 1, Math.max(0, i)) * nx + Math.min(nx - 1, Math.max(0, j))] * 0.01;
    return (n: number, e: number) => {
      const x = (e - g.e0) / cell - 0.5, y = (n - g.n0) / cell - 0.5;
      const j = Math.floor(x), i = Math.floor(y), fx = x - j, fy = y - i;
      return (at(i, j) * (1 - fx) + at(i, j + 1) * fx) * (1 - fy) + (at(i + 1, j) * (1 - fx) + at(i + 1, j + 1) * fx) * fy;
    };
  };
  const fs = gs.map(one);
  return (n, e) => {
    for (let k = 0; k < gs.length; k++) {
      const g = gs[k];
      // inside, with half a cell to spare so the bilinear blend has its neighbours
      if (e >= g.e0 + g.cell / 2 && e <= g.e0 + (g.nx - 0.5) * g.cell && n >= g.n0 + g.cell / 2 && n <= g.n0 + (g.ny - 0.5) * g.cell) return fs[k](n, e) + level;
    }
    return fs[fs.length - 1](n, e) + level;
  };
}
