// Foam on the water, driven by the simulation: pod wash (direction and strength from each pod's
// actual azimuth and rpm), bow thruster jets, the bow wave arms and the turbulent stern wake.
// Particles live in the water frame (they stay where they were made, drift with the current
// and spread), drawn as flat instanced quads just above the surface.
import { unitAxis } from '../physics/units/kinds';
import * as THREE from 'three/webgpu';
import { instancedBufferAttribute, texture, uniform } from 'three/tsl';
import type { Runtime } from '../physics/runtime';
import type { ShipSpec } from '../physics/ship';

function foamTexture() {
  const N = 128, cv = document.createElement('canvas'); cv.width = cv.height = N;
  const c = cv.getContext('2d')!;
  let s = 11; const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  // a soft blob made of many bubbles, denser in the middle
  for (let i = 0; i < 420; i++) {
    const a = r() * Math.PI * 2, d = Math.pow(r(), 0.7) * N * 0.42;
    const x = N / 2 + Math.cos(a) * d, y = N / 2 + Math.sin(a) * d, rad = 2 + r() * 7 * (1 - d / (N * 0.5));
    const g = c.createRadialGradient(x, y, 0, x, y, rad);
    g.addColorStop(0, `rgba(255,255,255,${0.35 + 0.4 * r()})`); g.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = g; c.beginPath(); c.arc(x, y, rad, 0, Math.PI * 2); c.fill();
  }
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class Wake {
  mesh: THREE.InstancedMesh;
  tint = uniform(new THREE.Color(1, 1, 1));
  private max: number;
  private alpha: THREE.InstancedBufferAttribute;
  private P: Float32Array;      // n, e, vn, ve, age, life, s0, s1, a0, rot
  private next = 0;
  private acc = new Float32Array(8);
  private m = new THREE.Matrix4(); private q = new THREE.Quaternion(); private v = new THREE.Vector3(); private sc = new THREE.Vector3();
  private up = new THREE.Vector3(0, 1, 0);

  constructor(max: number) {
    this.max = max;
    const geo = new THREE.PlaneGeometry(1, 1); geo.rotateX(-Math.PI / 2);
    this.alpha = new THREE.InstancedBufferAttribute(new Float32Array(max), 1);
    this.alpha.setUsage(THREE.DynamicDrawUsage);
    const mat = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false });
    const tex = texture(foamTexture());
    mat.colorNode = this.tint;
    mat.opacityNode = tex.a.mul(instancedBufferAttribute(this.alpha));
    this.mesh = new THREE.InstancedMesh(geo, mat, max);
    this.mesh.frustumCulled = false; this.mesh.renderOrder = 2;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.P = new Float32Array(max * 10);
    for (let i = 0; i < max; i++) { this.m.makeScale(0, 0, 0); this.mesh.setMatrixAt(i, this.m); }
  }

  reset() { for (let i = 0; i < this.max; i++) this.P[i * 10 + 5] = 0; }

  private spawn(n: number, e: number, vn: number, ve: number, life: number, s0: number, s1: number, a0: number) {
    const i = this.next; this.next = (this.next + 1) % this.max;
    const P = this.P, o = i * 10;
    P[o] = n; P[o + 1] = e; P[o + 2] = vn; P[o + 3] = ve; P[o + 4] = 0; P[o + 5] = life; P[o + 6] = s0; P[o + 7] = s1; P[o + 8] = a0; P[o + 9] = Math.random() * 6.283;
  }
  /** Emit `rate` particles per second from a source (fractional accumulation per channel). */
  private emit(ch: number, rate: number, dt: number, f: () => void) {
    this.acc[ch] += rate * dt;
    while (this.acc[ch] >= 1) { this.acc[ch] -= 1; f(); }
  }

  update(rt: Runtime, spec: ShipSpec, dt: number, halfB: (x: number) => number, bowX: number, sternX: number) {
    if (dt > 0) {
      const st = rt.state, c = Math.cos(st.psi), s = Math.sin(st.psi);
      const w = (x: number, y: number): [number, number] => [st.n + x * c - y * s, st.e + x * s + y * c];
      const vN = st.u * c - st.v * s, vE = st.u * s + st.v * c;      // ship over ground (≈ water)
      const rnd = (a: number) => (Math.random() - 0.5) * 2 * a;
      // pod wash: the jet leaves opposite to the direction the pod pulls
      spec.pods.forEach((pd, k) => {
        const ps = st.pods[k], drive = pd.kind === 'waterjet' ? ps.rpm * (ps.bucket ?? 1) : ps.pitch ?? ps.rpm, r = Math.abs(drive);
        if (r < 0.04) return;
        const sg = drive >= 0 ? -1 : 1, a = unitAxis(pd, ps);
        const jx = Math.cos(a) * sg, jy = Math.sin(a) * sg;
        const jn = jx * c - jy * s, je = jx * s + jy * c;
        const vj = 2 + 7 * r;
        this.emit(k, 10 + 36 * r, dt, () => {
          const [n, e] = w(pd.x + jx * 5 + rnd(1.5), pd.y + jy * 5 + rnd(1.5));
          this.spawn(n, e, vN * 0.5 + jn * vj + rnd(0.6), vE * 0.5 + je * vj + rnd(0.6), 9 + Math.random() * 7, 3 + 2 * r, 12 + 10 * r, 0.35 + 0.5 * Math.sqrt(r));
        });
      });
      // bow thruster: jet out of the side opposite to the push
      const b = st.bt;
      if (Math.abs(b) > 0.05 && spec.bowThruster) {
        const side = -Math.sign(b), x = spec.bowThruster.x, y = side * halfB(x);
        const jn = -s * side, je = c * side;           // body +y → world
        this.emit(3, 22 * Math.abs(b), dt, () => {
          const [n, e] = w(x + rnd(2), y);
          const vj = 3 + 5 * Math.abs(b);
          this.spawn(n, e, vN + jn * vj + rnd(0.5), vE + je * vj + rnd(0.5), 7 + Math.random() * 4, 2, 9, 0.6 * Math.abs(b));
        });
      }
      // bow wave arms (Kelvin wedge: crests spread at ~0.35 U) and the stern wake
      const U = Math.abs(st.u);
      if (U > 0.8) {
        const xs = bowX - 18, y0 = halfB(xs);
        for (const side of [-1, 1]) {
          this.emit(side < 0 ? 4 : 5, 3.5 * U, dt, () => {
            const [n, e] = w(xs + rnd(4), side * (y0 + 1));
            const on = -s * side * 0.35 * U, oe = c * side * 0.35 * U;
            this.spawn(n, e, on, oe, 22 + Math.random() * 8, 2, 7, Math.min(0.55, 0.12 * U));
          });
        }
        this.emit(6, 4 * U, dt, () => {
          const [n, e] = w(sternX + rnd(3), rnd(halfB(sternX + 10) * 0.8));
          this.spawn(n, e, rnd(0.3), rnd(0.3), 25 + Math.random() * 10, 6, 20, Math.min(0.5, 0.1 * U));
        });
      }
      // advance: jets slow down in the water, everything drifts with the current
      const P = this.P, drag = Math.exp(-dt / 3.5);
      for (let i = 0; i < this.max; i++) {
        const o = i * 10;
        if (P[o + 5] <= 0) continue;
        P[o + 4] += dt;
        if (P[o + 4] >= P[o + 5]) { P[o + 5] = 0; continue; }
        const [cn, ce] = rt.env.current(P[o], P[o + 1]);
        P[o] += (P[o + 2] + cn) * dt; P[o + 1] += (P[o + 3] + ce) * dt;
        P[o + 2] *= drag; P[o + 3] *= drag;
      }
    }
    // instance transforms and fade
    const P = this.P, A = this.alpha.array as Float32Array;
    for (let i = 0; i < this.max; i++) {
      const o = i * 10;
      if (P[o + 5] <= 0) { A[i] = 0; this.m.makeScale(0, 0, 0); this.mesh.setMatrixAt(i, this.m); continue; }
      const t = P[o + 4], life = P[o + 5], k = t / life;
      const size = P[o + 6] + (P[o + 7] - P[o + 6]) * (1 - Math.exp(-t / (life * 0.35)));
      A[i] = P[o + 8] * Math.min(1, t / 0.5) * Math.pow(1 - k, 1.6);
      this.q.setFromAxisAngle(this.up, P[o + 9] + t * 0.05);
      this.v.set(P[o + 1], 0.06 + (i % 7) * 0.004, -P[o]); this.sc.set(size, 1, size);
      this.m.compose(this.v, this.q, this.sc); this.mesh.setMatrixAt(i, this.m);
    }
    this.alpha.needsUpdate = true; this.mesh.instanceMatrix.needsUpdate = true;
  }
}
