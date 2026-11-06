// Aids to navigation in 3D, instanced: buoys in their shapes and colours (bands, stripes), beacons and light
// towers, topmarks, and their lights, which flash by their characteristic at dusk and night (in the sector
// colour the observer is in) and stay a point of light however far off they are.
import * as THREE from 'three/webgpu';
import type { Aid } from '../ui/chart/model';
import { TOP } from '../ui/chart/marks';
import { lightOn, sectorColour } from '../ui/chart/lights';

const tp = (n: number, e: number, h = 0) => new THREE.Vector3(e, h, -n);
const COL: Record<string, number> = { red: 0xc8231e, green: 0x1f8a3c, yellow: 0xf2c014, black: 0x161616, white: 0xf2f2ee, orange: 0xf07d1a, blue: 0x2557c7, grey: 0x80868a, brown: 0x6e4a2c };
const LIT: Record<string, number> = { red: 0xff3b2b, green: 0x39ff6a, yellow: 0xffd84a, white: 0xfff6dc, blue: 0x5b8cff, orange: 0xffa040 };

/** Parts: a body band (unit cylinder), a cone, a sphere, a stripe wedge of a sphere, a box (crosses, cans). */
interface Part { geo: THREE.BufferGeometry; list: { m: THREE.Matrix4; c: number }[] }

export class Aids3D {
  readonly group = new THREE.Group();
  private lanterns: THREE.InstancedMesh | null = null;
  private lights: { a: Aid; pos: THREE.Vector3; offset: number }[] = [];
  private tmpC = new THREE.Color(); private tmpM = new THREE.Matrix4(); private q = new THREE.Quaternion(); private s = new THREE.Vector3();

  /** `baseOf`: height a mark stands on (0 at sea; the quay's height for a light on a pier). */
  constructor(aids: Aid[], baseOf: (a: Aid) => number, mat: (c: number) => THREE.Material) {
    const parts: Record<string, Part> = {
      band: { geo: new THREE.CylinderGeometry(1, 1, 1, 14), list: [] },
      cone: { geo: new THREE.ConeGeometry(1, 1, 14), list: [] },
      sphere: { geo: new THREE.SphereGeometry(1, 14, 10), list: [] },
      wedge: { geo: new THREE.SphereGeometry(1, 6, 10, 0, Math.PI / 2), list: [] },
      box: { geo: new THREE.BoxGeometry(1, 1, 1), list: [] },
    };
    const put = (k: string, pos: THREE.Vector3, sc: THREE.Vector3, c: number, rotY = 0, rotZ = 0) => {
      const m = new THREE.Matrix4().compose(pos, new THREE.Quaternion().setFromEuler(new THREE.Euler(0, rotY, rotZ)), sc);
      parts[k].list.push({ m, c });
    };
    /** A banded column from y0, height h, radius r0 at the bottom to r1 at the top. */
    const column = (x: number, z: number, y0: number, h: number, r0: number, r1: number, cols: string[], pat?: number) => {
      const cs = cols.length ? cols : ['grey'];
      if (pat === 2 && cs.length > 1) {
        // vertical stripes: four quarter columns
        for (let k = 0; k < 4; k++) put('band', new THREE.Vector3(x, y0 + h / 2, z), new THREE.Vector3((r0 + r1) / 2, h, (r0 + r1) / 2), COL[cs[k % cs.length]] ?? COL.grey, k * Math.PI / 2);
        return;
      }
      const nb = cs.length, bh = h / nb;
      cs.forEach((c, i) => { const r = r0 + (r1 - r0) * (i + 0.5) / nb; put('band', new THREE.Vector3(x, y0 + h - (i + 0.5) * bh, z), new THREE.Vector3(r, bh, r), COL[c] ?? COL.grey); });
    };
    const lantern: THREE.Vector3[] = [];
    aids.forEach((a, idx) => {
      if (a.k === 'MORFAC' || a.k === 'FOGSIG' || a.k === 'LNDMRK') return;
      const p = tp(a.n, a.e), x = p.x, z = p.z, y0 = baseOf(a);
      let top = y0;
      if (a.k === 'LIGHTS') {
        // a light on its own: a white column with the lantern on top (on a structure, or a pile at sea)
        const h = Math.max(3, Math.min(14, (a.light?.h ?? 8) - y0));
        column(x, z, y0, h, 0.6, 0.45, a.col.length && a.col[0] !== 'white' ? [a.col[0], 'white'] : ['white']);
        top = y0 + h;
      } else if (a.k.startsWith('BCN')) {
        const tower = a.shp === 3 || a.shp === 4, h = tower ? 6 : 4.5;
        if (y0 < 0.5) column(x, z, -1, 1.6, 1.4, 1.4, ['grey']);          // pile cap at sea
        column(x, z, Math.max(y0, 0.6), h, tower ? 1.0 : 0.18, tower ? 0.6 : 0.15, a.col, a.colpat);
        top = Math.max(y0, 0.6) + h;
      } else {
        // buoys float: the body above the water
        switch (a.shp) {
          case 1: put('cone', new THREE.Vector3(x, 1.0, z), new THREE.Vector3(1.0, 2.2, 1.0), COL[a.col[0]] ?? COL.grey); put('band', new THREE.Vector3(x, -0.05, z), new THREE.Vector3(1.05, 0.3, 1.05), COL[a.col[0]] ?? COL.grey); top = 2.1; break;
          case 2: column(x, z, -0.2, 1.8, 0.9, 0.9, a.col, a.colpat); top = 1.6; break;
          case 3: {
            const cs = a.col.length ? a.col : ['grey'];
            if (a.colpat === 2 && cs.length > 1) for (let k = 0; k < 4; k++) put('wedge', new THREE.Vector3(x, 0.8, z), new THREE.Vector3(1.1, 1.1, 1.1), COL[cs[k % cs.length]] ?? COL.grey, k * Math.PI / 2);
            else put('sphere', new THREE.Vector3(x, 0.8, z), new THREE.Vector3(1.1, 1.1, 1.1), COL[cs[0]] ?? COL.grey);
            top = 1.9; break;
          }
          case 5: column(x, z, -0.5, 4.5, 0.2, 0.15, a.col, a.colpat); top = 4; break;
          case 6: put('band', new THREE.Vector3(x, 0.4, z), new THREE.Vector3(0.7, 1.8, 0.7), COL[a.col[0]] ?? COL.grey, 0, Math.PI / 2); top = 1.1; break;
          case 7: column(x, z, -0.3, 1.4, 2.4, 2.4, a.col, a.colpat); column(x, z, 1.1, 2.5, 0.25, 0.2, ['grey']); top = 3.6; break;
          default: column(x, z, -0.2, 0.7, 1.3, 1.3, a.col.slice(-1), undefined); column(x, z, 0.5, 2.8, 0.75, 0.45, a.col, a.colpat); top = 3.3;   // pillar: float and tower
        }
      }
      // topmark: on a short mast above the body
      if (a.top !== undefined) {
        const c = COL[a.topCol?.[0] ?? 'black'] ?? COL.black, s = 0.42, b = top + 0.45;
        column(x, z, top, 0.45, 0.06, 0.06, ['grey']);
        const coneAt = (y: number, up: boolean) => put('cone', new THREE.Vector3(x, y + s, z), new THREE.Vector3(s, 2 * s, s), c, 0, up ? 0 : Math.PI);
        switch (a.top) {
          case TOP.coneUp: coneAt(b, true); top = b + 2 * s; break;
          case TOP.coneDown: coneAt(b, false); top = b + 2 * s; break;
          case TOP.sphere: put('sphere', new THREE.Vector3(x, b + s, z), new THREE.Vector3(s, s, s), c); top = b + 2 * s; break;
          case TOP.spheres2: put('sphere', new THREE.Vector3(x, b + s, z), new THREE.Vector3(s, s, s), c); put('sphere', new THREE.Vector3(x, b + 3.2 * s, z), new THREE.Vector3(s, s, s), c); top = b + 4.2 * s; break;
          case TOP.can: put('band', new THREE.Vector3(x, b + s, z), new THREE.Vector3(s, 2 * s, s), c); top = b + 2 * s; break;
          case TOP.x: put('box', new THREE.Vector3(x, b + s, z), new THREE.Vector3(0.12, 2.4 * s, 0.12), c, 0, Math.PI / 4); put('box', new THREE.Vector3(x, b + s, z), new THREE.Vector3(0.12, 2.4 * s, 0.12), c, 0, -Math.PI / 4); top = b + 2 * s; break;
          case TOP.cones2Up: coneAt(b, true); coneAt(b + 2.2 * s, true); top = b + 4.2 * s; break;
          case TOP.cones2Down: coneAt(b, false); coneAt(b + 2.2 * s, false); top = b + 4.2 * s; break;
          case TOP.cones2BaseToBase: coneAt(b, false); coneAt(b + 2 * s, true); top = b + 4 * s; break;
          case TOP.cones2PointToPoint: coneAt(b, true); coneAt(b + 2 * s, false); top = b + 4 * s; break;
        }
      }
      if (a.light) { lantern.push(new THREE.Vector3(x, top + 0.35, z)); this.lights.push({ a, pos: lantern[lantern.length - 1], offset: (idx * 0.618) % 1 * 7 }); }
    });
    for (const [, part] of Object.entries(parts)) {
      if (!part.list.length) continue;
      const im = new THREE.InstancedMesh(part.geo, mat(0xffffff), part.list.length);
      part.list.forEach((x, i) => { im.setMatrixAt(i, x.m); im.setColorAt(i, this.tmpC.setHex(x.c)); });
      im.computeBoundingSphere(); im.castShadow = true; im.receiveShadow = true;
      this.group.add(im);
    }
    if (lantern.length) {
      const lm = new THREE.InstancedMesh(new THREE.SphereGeometry(0.3, 10, 8), new THREE.MeshBasicNodeMaterial({ color: 0xffffff }), lantern.length);
      lm.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      lantern.forEach((p, i) => { lm.setMatrixAt(i, this.tmpM.makeTranslation(p)); lm.setColorAt(i, this.tmpC.setHex(0x333333)); });
      lm.frustumCulled = false;
      this.group.add(lm);
      this.lanterns = lm;
    }
  }

  /** Lights at time t [s]: dark by day; flashing by their characteristic at dusk and night, in the colour of
   *  the sector the camera is in, and drawn big enough to stay a few pixels across at any distance. */
  update(t: number, cam: THREE.Vector3, lit: boolean, pxPerRad: number) {
    const lm = this.lanterns; if (!lm) return;
    this.lights.forEach(({ a, pos, offset }, i) => {
      const l = a.light!;
      const brg = (Math.atan2(cam.x - pos.x, -(cam.z - pos.z)) * 180 / Math.PI + 360) % 360;   // from the light to the camera, true
      const sc = sectorColour(l, brg);
      const on = lit && sc !== null && lightOn(l, t, offset);
      const k = lightOn(l, t, offset).k, c = l.chr >= 17 && l.chr <= 20 || l.chr === 28 ? l.col[k] ?? sc : sc;
      this.tmpC.setHex(on ? LIT[c ?? 'white'] ?? LIT.white : 0x3a3a3a);
      lm.setColorAt(i, this.tmpC);
      // at least ~5 px across
      const d = cam.distanceTo(pos), r = on ? Math.max(1, 2.4 / 0.3 * d / Math.max(1, pxPerRad)) : 1;
      lm.setMatrixAt(i, this.tmpM.compose(pos, this.q.identity(), this.s.setScalar(r)));
    });
    lm.instanceMatrix.needsUpdate = true;
    if (lm.instanceColor) lm.instanceColor.needsUpdate = true;
  }
}
