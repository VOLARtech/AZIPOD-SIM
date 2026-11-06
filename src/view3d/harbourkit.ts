// Berth equipment in 3D, instanced (a harbour has thousands of fenders and bollards): cone fenders on the
// faces, squeezed live as the contact model loads them; bollards; and quay lamps along every berth, set back
// from its edge on the quay, that glow at night.
import * as THREE from 'three/webgpu';
import type { Scenario } from '../scenarios';
import { solidTest } from '../physics/berths';

const tp = (n: number, e: number, h = 0) => new THREE.Vector3(e, h, -n);
const UP = new THREE.Vector3(0, 1, 0);

export class HarbourKit {
  readonly group = new THREE.Group();
  /** The lamp heads, one object, shown only at dusk and night. */
  readonly lampHeads: THREE.InstancedMesh | null = null;
  private fenders: THREE.InstancedMesh | null = null;
  private squeezed = new Set<number>();
  private floatIdx: number[] = []; private floating: THREE.InstancedMesh | null = null; private floatY: number[] = [];
  private m = new THREE.Matrix4(); private q = new THREE.Quaternion(); private s = new THREE.Vector3();

  constructor(private sc: Scenario, private LH: number, mats: { fender: THREE.Material; bollard: THREE.Material; pole: THREE.Material; lamp: THREE.Material; floating?: THREE.Material }) {
    const F = sc.fenders;
    if (F.length) {
      const fm = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), mats.fender, F.length);
      fm.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      this.fenders = fm;
      for (let i = 0; i < F.length; i++) this.place(i, 0);
      fm.computeBoundingSphere();
      this.group.add(fm);
    }
    const B = sc.bollards;
    if (B.length) {
      const bm = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.32, 0.4, 0.9, 10), mats.bollard, B.length);
      B.forEach(([n, e], i) => {
        // floating bollards (in a lock wall's slots) are drawn on their own, riding the water
        if (sc.bollardInfo?.[i]?.kind === 'floating') { this.floatIdx.push(i); this.m.makeScale(0, 0, 0); } else this.m.makeTranslation(tp(n, e, LH + 0.45));
        bm.setMatrixAt(i, this.m);
      });
      bm.computeBoundingSphere();
      this.group.add(bm);
      if (this.floatIdx.length) {
        const fm = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.35, 0.35, 1.0, 10), mats.floating ?? mats.bollard, this.floatIdx.length);
        fm.instanceMatrix.setUsage(THREE.DynamicDrawUsage); fm.frustumCulled = false;
        this.floating = fm; this.ride(() => 0);
        this.group.add(fm);
      }
    }
    // quay lamps: every 45 m along each berth, on the quay 9 m back from the edge (4 m on small-craft berths)
    const solid = solidTest(sc.obstacles), lamps: [number, number, number][] = [];
    for (const b of sc.berths ?? []) {
      const small = b.kind === 'tug' || b.kind === 'pontoon' || b.kind === 'yacht', back = small ? 4 : 9, h = small ? 6 : 10;
      const k = Math.max(1, Math.round(b.len / 45));
      for (let j = 0; j < k; j++) {
        const s = b.len * (j + 0.5) / k, n = b.a[0] + b.dir[0] * s - b.nrm[0] * back, e = b.a[1] + b.dir[1] * s - b.nrm[1] * back;
        if (solid(n, e) && !lamps.some(p => Math.abs(p[0] - n) < 8 && Math.abs(p[1] - e) < 8)) lamps.push([n, e, h]);
      }
    }
    if (lamps.length) {
      const poles = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.12, 0.15, 1, 6), mats.pole, lamps.length);
      const heads = new THREE.InstancedMesh(new THREE.SphereGeometry(0.55, 8, 6), mats.lamp, lamps.length);
      lamps.forEach(([n, e, h], i) => {
        this.m.compose(tp(n, e, LH + h / 2), this.q.identity(), this.s.set(1, h, 1)); poles.setMatrixAt(i, this.m);
        this.m.makeTranslation(tp(n, e, LH + h)); heads.setMatrixAt(i, this.m);
      });
      poles.computeBoundingSphere(); heads.computeBoundingSphere();
      heads.castShadow = heads.receiveShadow = false; heads.userData.noShadow = true;
      this.group.add(poles, heads);
      this.lampHeads = heads;
    }
  }

  /** One fender, its cone squeezed by `d` metres: body from the face out to the (pushed-back) panel. */
  private place(i: number, d: number) {
    const f = this.sc.fenders[i], dd = Math.min(f.height * 0.85, d), len = f.height - dd, tall = Math.max(1.2, 1.6 * f.height + 1.0);
    this.q.setFromAxisAngle(UP, Math.atan2(f.ne, -f.nn));
    this.m.compose(tp(f.n - f.nn * (dd + len / 2), f.e - f.ne * (dd + len / 2), this.LH - 0.3 - tall / 2), this.q, this.s.set(f.width, tall, len));
    this.fenders!.setMatrixAt(i, this.m);
  }

  /** Floating bollards at the water where they are (`y`: the water's height there in scene units). */
  ride(y: (n: number, e: number) => number) {
    const fm = this.floating; if (!fm) return;
    const B = this.sc.bollards;
    let dirty = false;
    this.floatIdx.forEach((i, k) => {
      const [n, e] = B[i], h = y(n, e);
      if (Math.abs(h - (this.floatY[k] ?? NaN)) < 0.005) return;
      this.floatY[k] = h; dirty = true;
      this.m.makeTranslation(tp(n, e, h + 0.9)); fm.setMatrixAt(k, this.m);
    });
    if (dirty) fm.instanceMatrix.needsUpdate = true;
  }

  /** Squeeze the fenders the hull is loading this step (and let go of the ones it no longer does). */
  update(loaded: { i: number; defl: number }[]) {
    const fm = this.fenders; if (!fm) return;
    let dirty = false;
    const now = new Set<number>();
    for (const l of loaded) if (l.i < this.sc.fenders.length) { now.add(l.i); this.place(l.i, l.defl); dirty = true; }
    for (const i of this.squeezed) if (!now.has(i) && i < this.sc.fenders.length) { this.place(i, 0); dirty = true; }
    this.squeezed = now;
    if (dirty) fm.instanceMatrix.needsUpdate = true;
  }
}
