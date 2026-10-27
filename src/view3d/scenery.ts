// Harbour scenery from tools/osm/build_scenery.py: chart land, OpenStreetMap buildings (real
// footprints and heights), parks and beaches, roads and bridges, palms, container cranes.
// Geometry is generated here (a few hundred ms) into a handful of merged meshes.
// Building data © OpenStreetMap contributors (ODbL); land from NOAA ENC.
import * as THREE from 'three/webgpu';
import { abs, attribute, clamp, float, floor, fract, mix, normalLocal, sin, step, uniform, uv, vec3 } from 'three/tsl';

const Q = 0.25;
type Ring = [number, number][];        // [n, e] metres
export interface SceneryData {
  land: Ring[][];
  bldg: { ring: Ring; h0: number; h1: number; style: number; seed: number }[];
  green: { kind: number; rings: Ring[] }[];
  roads: { w: number; deck: number; pts: Ring }[];
  trees: [number, number, number][];
  cranes: { n: number; e: number; brg: number; reach: number }[];
}

export function parseScenery(buf: ArrayBuffer): SceneryData {
  const dv = new DataView(buf); let o = 4;
  const u8 = () => dv.getUint8(o++), u16 = () => { const v = dv.getUint16(o, true); o += 2; return v; };
  const u32 = () => { const v = dv.getUint32(o, true); o += 4; return v; }, i16 = () => { const v = dv.getInt16(o, true); o += 2; return v; };
  const ring = (n: number): Ring => { const r: Ring = []; for (let i = 0; i < n; i++) { const a = i16() * Q, b = i16() * Q; r.push([a, b]); } return r; };
  const d: SceneryData = { land: [], bldg: [], green: [], roads: [], trees: [], cranes: [] };
  for (let k = u16(); k > 0; k--) { const rs: Ring[] = []; for (let r = u8(); r > 0; r--) rs.push(ring(u16())); d.land.push(rs); }
  for (let k = u32(); k > 0; k--) { const n = u16(), h0 = u16() / 10, h1 = u16() / 10, style = u8(), seed = u8(); d.bldg.push({ ring: ring(n), h0, h1, style, seed }); }
  for (let k = u16(); k > 0; k--) { const kind = u8(); const rs: Ring[] = []; for (let r = u8(); r > 0; r--) rs.push(ring(u16())); d.green.push({ kind, rings: rs }); }
  for (let k = u16(); k > 0; k--) { const w = u8() / 2, deck = u8(); d.roads.push({ w, deck, pts: ring(u16()) }); }
  for (let k = u16(); k > 0; k--) { const a = i16() * Q, b = i16() * Q; d.trees.push([a, b, u8()]); }
  for (let k = u16(); k > 0; k--) { const a = i16() * Q, b = i16() * Q, brg = i16() / 100; d.cranes.push({ n: a, e: b, brg, reach: u8() }); }
  return d;
}

/** Growable typed buffers for one merged mesh. */
class Buf {
  p: number[] = []; n: number[] = []; uv: number[] = []; c: number[] = []; x: number[] = [];
  /** Triangle, with its winding fixed so it faces `want` (approx. outward normal). */
  tri(a: number[], b: number[], c: number[], nrm: number[], want: number[], col: number[], ua: number[], ub: number[], uc: number[], aux: number[]) {
    const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], ac = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const cr = [ab[1] * ac[2] - ab[2] * ac[1], ab[2] * ac[0] - ab[0] * ac[2], ab[0] * ac[1] - ab[1] * ac[0]];
    if (cr[0] * want[0] + cr[1] * want[1] + cr[2] * want[2] < 0) { [b, c] = [c, b]; [ub, uc] = [uc, ub]; }
    this.p.push(...a, ...b, ...c);
    for (let i = 0; i < 3; i++) { this.n.push(...nrm); this.c.push(...col); this.x.push(...aux); }
    this.uv.push(...ua, ...ub, ...uc);
  }
  geometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
    g.setAttribute('aux', new THREE.Float32BufferAttribute(this.x, 2));
    g.computeBoundingSphere();
    return g;
  }
}
const W = (n: number, e: number, y: number) => [e, y, -n];
const hex = (h: string) => { const c = new THREE.Color(h); return [c.r, c.g, c.b]; };
const PAL: string[][] = [
  ['#e8e2d6', '#d9d4c7', '#cfc8b8', '#efe9dd', '#c9c3b5', '#f2efe8'],       // generic
  ['#f1e6cf', '#f4d9c4', '#e7efe9', '#f3e3b5', '#e9d3d3', '#fbfaf6', '#d7e6ee'],   // houses (Miami pastels)
  ['#f1efe8', '#e3e0d8', '#d8d3c8', '#d5dde0', '#ece6da'],                   // apartment / hotel towers
  ['#d6d3cc', '#bfc3c6', '#e6e2da', '#cfcac0'],                              // commercial
  ['#c2c7cb', '#aab3ba', '#d0d4d6', '#b8bfc4'],                              // port sheds, industrial
  ['#a9a59c', '#b3afa6'],                                                    // parking, canopies
  ['#5f7a8c', '#6d8796', '#4f6a7d', '#8aa0ad', '#7d8f99'],                   // glass towers
];
const GLASS = [0.35, 0.2, 0.5, 0.45, 0.05, 0, 1];

/** Builds all scenery meshes into `group`; returns the night-light uniform. */
export function buildScenery(d: SceneryData, group: THREE.Group, LH: number, low: boolean) {
  const lit = uniform(0);
  // ------------------------------------------------ land
  {
    const geos: THREE.BufferGeometry[] = [];
    for (const rings of d.land) {
      const sh = new THREE.Shape(rings[0].map(([n, e]) => new THREE.Vector2(e, n)));
      for (const h of rings.slice(1)) sh.holes.push(new THREE.Path(h.map(([n, e]) => new THREE.Vector2(e, n))));
      const g = new THREE.ExtrudeGeometry(sh, { depth: LH + 4, bevelEnabled: false });
      g.rotateX(-Math.PI / 2); g.translate(0, -4, 0);
      geos.push(g.index ? g.toNonIndexed() : g);
    }
    const g = merge(geos);
    const m = new THREE.Mesh(g, new THREE.MeshStandardNodeMaterial({ color: '#77736a', roughness: 0.95 }));
    m.receiveShadow = true; group.add(m);
  }
  // ------------------------------------------------ buildings
  {
    const B = new Buf();
    for (const b of d.bldg) {
      const area = Math.abs(b.ring.reduce((a, [n, e], i) => { const [n2, e2] = b.ring[(i + 1) % b.ring.length]; return a + e * n2 - e2 * n; }, 0)) / 2;
      if (low && (b.style === 1 || area < 90) && b.h1 < 12) continue;      // phones: skip small houses
      const pal = PAL[b.style] ?? PAL[0], col = hex(pal[b.seed % pal.length]);
      const roofCol = col.map(v => v * (b.style === 6 ? 0.8 : 0.86));
      const y0 = LH + b.h0, y1 = LH + b.h1, aux = [b.seed / 255, GLASS[b.style] ?? 0.3];
      const r = b.ring; let per = 0;
      for (let i = 0; i < r.length; i++) {
        const [n0, e0] = r[i], [n1, e1] = r[(i + 1) % r.length];
        const len = Math.hypot(n1 - n0, e1 - e0); if (len < 0.2) continue;
        // outward normal (ring is counter-clockwise in plan)
        const on = -(e1 - e0) / len, oe = (n1 - n0) / len, nrm = [oe, 0, -on];
        const A = W(n0, e0, y0), Bv = W(n1, e1, y0), C = W(n1, e1, y1), D = W(n0, e0, y1);
        B.tri(A, Bv, C, nrm, nrm, col, [per, b.h0], [per + len, b.h0], [per + len, b.h1], aux);
        B.tri(A, C, D, nrm, nrm, col, [per, b.h0], [per + len, b.h1], [per, b.h1], aux);
        per += len;
      }
      const v2 = r.map(([n, e]) => new THREE.Vector2(e, n));
      for (const [a, bb, c] of THREE.ShapeUtils.triangulateShape(v2, [])) {
        const p = (k: number) => W(r[k][0], r[k][1], y1);
        B.tri(p(a), p(bb), p(c), [0, 1, 0], [0, 1, 0], roofCol, [0, -1], [0, -1], [0, -1], aux);
      }
    }
    const g = B.geometry();
    // facades: a window grid from the wall's own (perimeter, height) coordinates; glass towers are
    // almost all glass; windows reflect the sky by day and some are lit at night
    const U = uv(), wall = float(1).sub(step(0.5, abs(normalLocal.y)));
    const ax = attribute('aux', 'vec2'), seed = ax.x, glassy = ax.y;
    const cw = mix(float(3.2), float(2.2), glassy), rh = float(3.4);
    const fu = fract(U.x.div(cw)), fv = fract(U.y.div(rh));
    const margin = mix(float(0.2), float(0.05), glassy);
    const win = step(margin, fu).mul(step(fu, float(1).sub(margin))).mul(step(mix(float(0.28), float(0.08), glassy), fv)).mul(step(fv, 0.86))
      .mul(step(2.6, U.y)).mul(wall).mul(step(0.01, glassy));
    const cell = floor(U.x.div(cw)).add(floor(U.y.div(rh)).mul(17.0)).add(seed.mul(997));
    const on = step(0.58, fract(sin(cell.mul(12.9898)).mul(43758.5453)));
    const base = attribute('color', 'vec3');
    const m = new THREE.MeshStandardNodeMaterial();
    m.colorNode = mix(base, mix(vec3(0.16, 0.22, 0.28), base.mul(0.5), glassy.mul(0.4)), win);
    m.roughnessNode = mix(float(0.88), float(0.08), win);
    m.metalnessNode = mix(float(0), float(0.65), win);
    m.emissiveNode = vec3(1.0, 0.78, 0.48).mul(win).mul(on).mul(lit).mul(clamp(glassy.add(0.4), 0, 1));
    const mesh = new THREE.Mesh(g, m);
    mesh.castShadow = mesh.receiveShadow = true; group.add(mesh);
  }
  // ------------------------------------------------ parks, beaches, pitches
  {
    const B = new Buf(), COL = ['#6f8f4e', '#4d6a39', '#e3d6ad', '#5f9a4f'].map(hex);
    for (const gr of d.green) {
      const outer = gr.rings[0].map(([n, e]) => new THREE.Vector2(e, n));
      const holes = gr.rings.slice(1).map(h => h.map(([n, e]) => new THREE.Vector2(e, n)));
      const all = [...gr.rings[0], ...gr.rings.slice(1).flat()];
      for (const [a, b, c] of THREE.ShapeUtils.triangulateShape(outer, holes)) {
        const p = (k: number) => W(all[k][0], all[k][1], LH + 0.05);
        B.tri(p(a), p(b), p(c), [0, 1, 0], [0, 1, 0], COL[gr.kind] ?? COL[0], [0, 0], [0, 0], [0, 0], [0, 0]);
      }
    }
    const m = new THREE.Mesh(B.geometry(), new THREE.MeshStandardNodeMaterial({ vertexColors: true, roughness: 0.95 }));
    m.receiveShadow = true; group.add(m);
  }
  // ------------------------------------------------ roads and bridges
  {
    const B = new Buf(), asphalt = hex('#4b4c4e'), deckC = hex('#bdb9b0'), pier = hex('#a8a49b');
    for (const r of d.roads) {
      const y = r.deck ? r.deck : LH + 0.08, hw = r.w / 2, pts = r.pts;
      const off = pts.map((_, i) => {
        const [na, ea] = pts[Math.max(0, i - 1)], [nb, eb] = pts[Math.min(pts.length - 1, i + 1)];
        const l = Math.hypot(nb - na, eb - ea) || 1; return [-(eb - ea) / l * hw, (nb - na) / l * hw];   // [dn, de] to the left
      });
      for (let i = 0; i + 1 < pts.length; i++) {
        const [n0, e0] = pts[i], [n1, e1] = pts[i + 1], [a0, b0] = off[i], [a1, b1] = off[i + 1];
        const L0 = W(n0 + a0, e0 + b0, y), R0 = W(n0 - a0, e0 - b0, y), L1 = W(n1 + a1, e1 + b1, y), R1 = W(n1 - a1, e1 - b1, y);
        const col = r.deck ? deckC : asphalt;
        B.tri(L0, R0, R1, [0, 1, 0], [0, 1, 0], col, [0, 0], [0, 0], [0, 0], [0, 0]);
        B.tri(L0, R1, L1, [0, 1, 0], [0, 1, 0], col, [0, 0], [0, 0], [0, 0], [0, 0]);
        if (r.deck) {
          // deck edges and underside
          const yb = y - 1.6, dn = n1 - n0, de = e1 - e0, l = Math.hypot(dn, de) || 1;
          for (const s of [1, -1]) {
            const nn = s * -de / l, ne = s * dn / l, nrm = [ne, 0, -nn];
            const p0 = s > 0 ? [n0 + a0, e0 + b0] : [n0 - a0, e0 - b0], p1 = s > 0 ? [n1 + a1, e1 + b1] : [n1 - a1, e1 - b1];
            B.tri(W(p0[0], p0[1], yb), W(p1[0], p1[1], yb), W(p1[0], p1[1], y), nrm, nrm, pier, [0, 0], [0, 0], [0, 0], [0, 0]);
            B.tri(W(p0[0], p0[1], yb), W(p1[0], p1[1], y), W(p0[0], p0[1], y), nrm, nrm, pier, [0, 0], [0, 0], [0, 0], [0, 0]);
          }
          B.tri(W(n0 + a0, e0 + b0, yb), W(n1 - a1, e1 - b1, yb), W(n0 - a0, e0 - b0, yb), [0, -1, 0], [0, -1, 0], pier, [0, 0], [0, 0], [0, 0], [0, 0]);
          B.tri(W(n0 + a0, e0 + b0, yb), W(n1 + a1, e1 + b1, yb), W(n1 - a1, e1 - b1, yb), [0, -1, 0], [0, -1, 0], pier, [0, 0], [0, 0], [0, 0], [0, 0]);
        }
      }
    }
    const m = new THREE.Mesh(B.geometry(), new THREE.MeshStandardNodeMaterial({ vertexColors: true, roughness: 0.9 }));
    m.receiveShadow = true; m.castShadow = true; group.add(m);
    // bridge piers every ~45 m
    const piers: THREE.Vector3[] = [];
    for (const r of d.roads) if (r.deck) {
      let acc = 0;
      for (let i = 0; i + 1 < r.pts.length; i++) {
        const [n0, e0] = r.pts[i], [n1, e1] = r.pts[i + 1], l = Math.hypot(n1 - n0, e1 - e0);
        for (let s = 45 - acc; s < l; s += 45) piers.push(new THREE.Vector3(e0 + (e1 - e0) * s / l, r.deck, -(n0 + (n1 - n0) * s / l)));
        acc = (acc + l) % 45;
      }
    }
    if (piers.length) {
      const pg = new THREE.CylinderGeometry(1.1, 1.3, 1, 8); pg.translate(0, 0.5, 0);
      const im = new THREE.InstancedMesh(pg, new THREE.MeshStandardNodeMaterial({ color: '#a8a49b', roughness: 0.9 }), piers.length);
      const mm = new THREE.Matrix4();
      piers.forEach((p, i) => { mm.makeScale(1, p.y - 1.6 + 3, 1); mm.setPosition(p.x, -3, p.z); im.setMatrixAt(i, mm); });
      im.castShadow = true; group.add(im);
    }
  }
  // ------------------------------------------------ palms
  if (d.trees.length) {
    const n = low ? Math.min(d.trees.length, 1500) : d.trees.length;
    const trunkG = new THREE.CylinderGeometry(0.16, 0.26, 1, 6); trunkG.translate(0, 0.5, 0);
    const crownG = new THREE.IcosahedronGeometry(1, 0);
    const trunks = new THREE.InstancedMesh(trunkG, new THREE.MeshStandardNodeMaterial({ color: '#7b6a55', roughness: 0.9 }), n);
    const crowns = new THREE.InstancedMesh(crownG, new THREE.MeshStandardNodeMaterial({ color: '#3d6a33', roughness: 0.8 }), n);
    const mm = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0);
    for (let i = 0; i < n; i++) {
      const [tn, te, h] = d.trees[i];
      mm.compose(new THREE.Vector3(te, LH, -tn), q.setFromAxisAngle(up, i), new THREE.Vector3(1, h, 1)); trunks.setMatrixAt(i, mm);
      mm.compose(new THREE.Vector3(te, LH + h, -tn), q.setFromAxisAngle(up, i * 1.7), new THREE.Vector3(3.2, 1.1, 3.2)); crowns.setMatrixAt(i, mm);
    }
    trunks.castShadow = crowns.castShadow = true;
    group.add(trunks, crowns);
  }
  // ------------------------------------------------ container cranes (ship-to-shore gantries)
  if (d.cranes.length) {
    const white = new THREE.MeshStandardNodeMaterial({ color: '#e3e6e8', roughness: 0.55, metalness: 0.2 });
    const red = new THREE.MeshStandardNodeMaterial({ color: '#b5322a', roughness: 0.5, metalness: 0.2 });
    const box = (w: number, h: number, l: number, x: number, y: number, z: number, m: THREE.Material, g: THREE.Group) => {
      const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, l), m); o.position.set(x, y, z); o.castShadow = true; g.add(o);
    };
    for (const c of d.cranes) {
      const g = new THREE.Group(), H = 42, gauge = 30, span = 17;
      // local: +z = toward the water (boom), x = along the quay
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) box(1.6, H, 1.6, sx * span / 2, LH + H / 2, sz * gauge / 2, white, g);
      for (const sz of [-1, 1]) box(span + 1.6, 2.2, 2, 0, LH + H - 1, sz * gauge / 2, white, g);
      for (const sx of [-1, 1]) box(1.8, 2.4, gauge + 2, sx * span / 2, LH + 14, 0, white, g);
      box(4.2, 3, c.reach + 50, 0, LH + H + 6, (c.reach + 50) / 2 - 38, white, g);         // boom + back-reach
      box(9, 6, 12, 0, LH + H + 9, -30, white, g);                                       // machinery house
      box(3, 22, 3, 0, LH + H + 16, -10, red, g);                                        // A-frame
      box(4.4, 1.2, 6, 0, LH + H + 4, c.reach + 8, red, g);                              // boom tip
      g.position.set(c.e, 0, -c.n);
      g.rotation.y = Math.PI - c.brg;            // local +z → bearing brg
      group.add(g);
    }
  }
  return lit;
}

function merge(geos: THREE.BufferGeometry[]) {
  const out = new THREE.BufferGeometry();
  for (const k of ['position', 'normal', 'uv'] as const) {
    const parts = geos.map(g => g.getAttribute(k) as THREE.BufferAttribute);
    const size = parts[0].itemSize, arr = new Float32Array(parts.reduce((a, p) => a + p.count * size, 0));
    let o = 0; for (const p of parts) { arr.set(p.array as Float32Array, o); o += p.count * size; }
    out.setAttribute(k, new THREE.BufferAttribute(arr, size));
  }
  geos.forEach(g => g.dispose());
  out.computeBoundingSphere();
  return out;
}
