// A worked lock in 3D: its two rolling gates (running sideways into their recesses), the CEVNI lights on the
// wall heads, and the chamber's own water at the chamber's level. The main water has a hole over the chamber
// (see chamberHole), so the chamber can stand lower or higher than the water outside.
import * as THREE from 'three/webgpu';
import type { LockSim, Signal } from '../physics/lock';
import type { Pt } from '../physics/contact';

const tp = (n: number, e: number, h = 0) => new THREE.Vector3(e, h, -n);

export class Lock3D {
  readonly group = new THREE.Group();
  private gates: Record<'a' | 'b', THREE.Mesh>;
  private lamps: Record<'a' | 'b', { r: THREE.Mesh; g: THREE.Mesh }>;
  private water: THREE.Mesh;
  private on = { r: new THREE.MeshBasicNodeMaterial({ color: 0xff3b30 }), g: new THREE.MeshBasicNodeMaterial({ color: 0x30e070 }) };
  private off = new THREE.MeshBasicNodeMaterial({ color: 0x222426 });

  /** `still`: the level the scene's y = 0 stands for; LH: the walls' height above it. */
  constructor(lock: LockSim, waterMat: THREE.Material, private still: number, LH: number, gateMat: THREE.Material, poleMat: THREE.Material) {
    const d = lock.def, yaw = Math.atan2(lock.u[1], -lock.u[0]);
    const H = LH + d.sill + still + 0.5;                            // sill to wall top
    const mk = () => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(d.width + 2, H, d.gateThick), gateMat);
      m.rotation.y = yaw; m.castShadow = m.receiveShadow = true; this.group.add(m); return m;
    };
    this.gates = { a: mk(), b: mk() };
    for (const g of [this.gates.a, this.gates.b]) g.position.y = LH - H / 2 + 0.5;
    // lights: a pole on the wall head at each end, red over green
    const lampGeo = new THREE.SphereGeometry(0.55, 10, 8), poleGeo = new THREE.CylinderGeometry(0.15, 0.18, 7, 6);
    const P = (s: number, w: number): Pt => [d.a[0] + lock.u[0] * s + lock.w[0] * w, d.a[1] + lock.u[1] * s + lock.w[1] * w];
    const lampAt = (s: number) => {
      const [n, e] = P(s, -d.recess * (d.width / 2 + 4));
      const pole = new THREE.Mesh(poleGeo, poleMat); pole.position.copy(tp(n, e, LH + 3.5)); this.group.add(pole);
      const r = new THREE.Mesh(lampGeo, this.off), g = new THREE.Mesh(lampGeo, this.off);
      r.position.copy(tp(n, e, LH + 7.2)); g.position.copy(tp(n, e, LH + 5.8));
      for (const x of [r, g]) { x.userData.noShadow = true; this.group.add(x); }
      return { r, g };
    };
    this.lamps = { a: lampAt(-6), b: lampAt(lock.L + 6) };
    // the chamber's water: the main water's material, its own plane (half a metre into the walls)
    this.water = new THREE.Mesh(new THREE.PlaneGeometry(d.width + 1, lock.L + 1), waterMat);
    this.water.rotation.order = 'YXZ'; this.water.rotation.set(-Math.PI / 2, yaw, 0);
    const [cn, ce] = P(lock.L / 2, 0);
    this.water.position.set(ce, 0, -cn);
    this.water.renderOrder = 1; this.water.layers.set(1); this.water.userData.noShadow = true;
    this.group.add(this.water);
  }

  /** Gates, lights and chamber water as the lock stands (the scenario's lock: a reset makes a new one). */
  update(lock: LockSim, waterMat: THREE.Material) {
    const d = lock.def;
    this.water.material = waterMat;
    for (const k of ['a', 'b'] as const) {
      const g = lock.gates[k], m = this.gates[k];
      m.visible = g.pos < 1;
      const s = (k === 'a' ? 0 : lock.L - d.gateThick) + d.gateThick / 2, w = d.recess * g.pos * (d.width + 2);
      m.position.x = d.a[1] + lock.u[1] * s + lock.w[1] * w; m.position.z = -(d.a[0] + lock.u[0] * s + lock.w[0] * w);
    }
    const sg = lock.signals();
    for (const k of ['a', 'b'] as const) this.setLamp(this.lamps[k], sg[k]);
    this.water.position.y = lock.eta - this.still;
  }
  private setLamp(l: { r: THREE.Mesh; g: THREE.Mesh }, s: Signal) {
    l.r.material = s !== 'green' ? this.on.r : this.off;
    l.g.material = s !== 'red' ? this.on.g : this.off;
  }
}

/** The main water's geometry with a hole over a lock's chamber: a square of side `size` about the mesh's
 *  position (X, Z) in the shape's own axes (x east, y north: the mesh lies rotated flat). */
export function chamberHole(lock: LockSim, size: number, X: number, Z: number): THREE.BufferGeometry {
  const h = size / 2, d = lock.def, N0 = -Z;
  const sh = new THREE.Shape([new THREE.Vector2(-h, -h), new THREE.Vector2(h, -h), new THREE.Vector2(h, h), new THREE.Vector2(-h, h)]);
  const P = (s: number, w: number) => { const n = d.a[0] + lock.u[0] * s + lock.w[0] * w, e = d.a[1] + lock.u[1] * s + lock.w[1] * w; return new THREE.Vector2(e - X, n - N0); };
  const ring = [P(-0.5, -d.width / 2 - 0.5), P(lock.L + 0.5, -d.width / 2 - 0.5), P(lock.L + 0.5, d.width / 2 + 0.5), P(-0.5, d.width / 2 + 0.5)];
  if (ring.every(p => Math.abs(p.x) < h - 1 && Math.abs(p.y) < h - 1)) sh.holes.push(new THREE.Path(ring));
  return new THREE.ShapeGeometry(sh, 1);
}
