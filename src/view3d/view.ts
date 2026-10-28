// Out-of-the-window 3D view. Loaded on demand (dynamic import) so the 2D chart stays light.
// three.js WebGPURenderer: WebGPU where the browser has it, WebGL2 otherwise (same code path).
// Frames: NED (n, e, down) → three (x = e, y = up, z = −n); body (x fwd, y stbd, z up) → ship group
// local (x = y_b, y = z, z = −x_b), group rotation.y = −psi.
import * as THREE from 'three/webgpu';
import { abs, builtinAOContext, clamp, color, float, fract, mix, mrt, normalLocal, normalView, pass, positionLocal, screenUV, step, uniform } from 'three/tsl';
import { SkyMesh } from 'three/addons/objects/SkyMesh.js';
import { ao } from 'three/addons/tsl/display/GTAONode.js';
import spiritUrl from './spirit.bin?url';
import miamiScnUrl from './miami.scn.bin?url';
import { buildScenery, parseScenery } from './scenery';
const SCENERY: Record<string, string> = { 'miami-terminal-v': miamiScnUrl };
export const sceneryCredit = (id: string) => (SCENERY[id] ? 'Buildings © OpenStreetMap contributors' : '');
import { makeWater } from './water';
import { Wake } from './wake';
import { SPEEDS } from '../ui/state';
import type { PodSpec } from '../physics/ship';
import { SHIP } from '../physics/ship';
import { HULL, setHull } from '../physics/contact';
import { setShip } from '../physics/ship';
import { LINE } from '../physics/mooring';
import { S } from '../ui/state';

export type CamName = 'bridge' | 'port' | 'stbd' | 'chase' | 'pods';
export type TimeOfDay = 'day' | 'dusk' | 'night';

// ---------------------------------------------------------------- helpers
/** Concatenate non-indexed geometries (position, normal, uv); disposes the inputs. */
function mergeGeometries(geos: THREE.BufferGeometry[]) {
  const keys = ['position', 'normal', 'uv'] as const, out = new THREE.BufferGeometry();
  for (const k of keys) {
    const parts = geos.map(g => (g.index ? g.toNonIndexed() : g).getAttribute(k) as THREE.BufferAttribute);
    const size = parts[0].itemSize, arr = new Float32Array(parts.reduce((a, p) => a + p.count * size, 0));
    let o = 0; for (const p of parts) { arr.set(p.array as Float32Array, o); o += p.count * size; }
    out.setAttribute(k, new THREE.BufferAttribute(arr, size));
  }
  geos.forEach(g => g.dispose());
  return out;
}
const tp = (n: number, e: number, h = 0) => new THREE.Vector3(e, h, -n);
/** Half-breadth of the waterline outline at body x. */
function halfB(x: number) {
  let best = 0;
  for (let i = 0; i < HULL.length; i++) {
    const [x0, y0] = HULL[i], [x1, y1] = HULL[(i + 1) % HULL.length];
    if ((x - x0) * (x - x1) > 0 || x0 === x1) continue;
    const y = Math.abs(y0 + (y1 - y0) * (x - x0) / (x1 - x0));
    best = Math.max(best, y);
  }
  return best;
}
const hullX = () => { let a = Infinity, b = -Infinity; for (const [x] of HULL) { a = Math.min(a, x); b = Math.max(b, x); } return [a, b]; };
/** Horizontal prism: body-frame outline [x, y][] extruded from z0 to z1. Groups: 0 caps, 1 sides. */
function prism(outline: [number, number][], z0: number, z1: number) {
  const sh = new THREE.Shape(outline.map(([x, y]) => new THREE.Vector2(y, x)));
  const g = new THREE.ExtrudeGeometry(sh, { depth: z1 - z0, bevelEnabled: false, curveSegments: 1 });
  g.rotateX(-Math.PI / 2); g.translate(0, z0, 0);
  return g;
}
/** Plan-view footprint of a deck block: the hull outline between x0 and x1, set in by `inset`. */
function deckOutline(x0: number, x1: number, inset: number): [number, number][] {
  const [ha, hb] = hullX();
  const a = Math.max(x0, ha + 0.5), b = Math.min(x1, hb - 0.5), N = 18, pts: [number, number][] = [];
  for (let i = 0; i <= N; i++) { const x = a + (b - a) * i / N; pts.push([x, Math.max(0.8, halfB(x) - inset)]); }
  for (let i = N; i >= 0; i--) { const x = a + (b - a) * i / N; pts.push([x, -Math.max(0.8, halfB(x) - inset)]); }
  return pts;
}
const canvasTex = (w: number, h: number, paint: (c: CanvasRenderingContext2D) => void) => {
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  paint(cv.getContext('2d')!);
  const t = new THREE.CanvasTexture(cv);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
};

/** Tileable normal map from a few integer-wavenumber swells (seamless at the edges). */
function waterNormals() {
  const N = 256, cv = document.createElement('canvas'); cv.width = cv.height = N;
  const c = cv.getContext('2d')!, img = c.createImageData(N, N);
  const waves: [number, number, number, number][] = [];
  let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 14; i++) {
    const k = 2 + Math.floor(rnd() * 9), th = rnd() * Math.PI * 2;
    waves.push([Math.round(k * Math.cos(th)), Math.round(k * Math.sin(th)), 0.5 / k, rnd() * 6.28]);
  }
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    let dx = 0, dy = 0;
    for (const [kx, ky, a, ph] of waves) {
      const arg = 2 * Math.PI * (kx * x + ky * y) / N + ph, d = Math.cos(arg) * a * 2 * Math.PI;
      dx += d * kx / N * 40; dy += d * ky / N * 40;
    }
    const l = Math.hypot(dx, dy, 1), o = (y * N + x) * 4;
    img.data[o] = (-dx / l * 0.5 + 0.5) * 255; img.data[o + 1] = (-dy / l * 0.5 + 0.5) * 255; img.data[o + 2] = (1 / l * 0.5 + 0.5) * 255; img.data[o + 3] = 255;
  }
  c.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(cv); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.NoColorSpace;
  return t;
}

// lighting presets, loosely matched to the chart palettes. Sun elevation / azimuth drive the
// physical sky (and through it the image-based lighting); night uses the moon as the key light.
const TOD = {
  day:   { sunEl: 36, sunAz: 215, sun: 0xfff1de, sunI: 3.0, env: 0.9, exposure: 0.5, turb: 2.2, ray: 1.1, water: 0x0d3a44, fog: 0xc6d6e0, fogD: [900, 7000], lit: 0, foam: 0.95, hemi: 0, clouds: 0.35 },
  dusk:  { sunEl: 3, sunAz: 250, sun: 0xffa868, sunI: 1.6, env: 0.9, exposure: 0.62, turb: 6, ray: 2.2, water: 0x0b222c, fog: 0xc79a80, fogD: [700, 6000], lit: 0.45, foam: 0.6, hemi: 0, clouds: 0.45 },
  night: { sunEl: -6, sunAz: 250, sun: 0xa8bce0, sunI: 0.9, env: 0.6, exposure: 1.5, turb: 2, ray: 2.5, water: 0x061620, fog: 0x0e1a26, fogD: [350, 4000], lit: 1, foam: 0.3, hemi: 0.45, clouds: 0.2 },
};
export type Quality = 'low' | 'high';

// ---------------------------------------------------------------- view
export class View3D {
  renderer: THREE.WebGPURenderer;
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(55, 1, 0.5, 12000);
  backend = '';
  cam: CamName = 'bridge';
  look: Record<CamName, { yaw: number; pitch: number; zoom: number }> = {
    bridge: { yaw: 0, pitch: -9, zoom: 1 }, port: { yaw: -150, pitch: -30, zoom: 1 }, pods: { yaw: -165, pitch: -4, zoom: 1 },
    stbd: { yaw: 150, pitch: -30, zoom: 1 }, chase: { yaw: -150, pitch: 22, zoom: 1 },
  };
  private harbour = new THREE.Group();
  private ship = new THREE.Group();
  private other = new THREE.Group();          // the ship a tug is working (escort)
  private trafficG: THREE.Group[] = [];       // other ships under way
  private towLine: THREE.Line | null = null;
  private navLights: THREE.Object3D[] = [];
  private lamps: THREE.Object3D[] = [];
  private lit: THREE.MeshStandardNodeMaterial[] = [];
  private fenders: THREE.Mesh[] = [];
  private tugs: THREE.Group[] = [];
  private tugLines: THREE.Line[] = [];
  private lines: THREE.Line[] = [];
  private track: THREE.Line;
  private trackEnd: THREE.Line;
  private sky = new SkyMesh();
  private water: ReturnType<typeof makeWater> | null = null;
  private waterNormals = waterNormals();
  private wake!: Wake;
  private env: THREE.Texture | null = null;
  private envRT: { texture: THREE.Texture; dispose(): void } | null = null;
  private pmrem: THREE.PMREMGenerator | null = null;
  private pipeline: THREE.RenderPipeline | null = null;
  private preCam = new THREE.PerspectiveCamera();
  quality: Quality = 'low';
  private sunDir = new THREE.Vector3(0, 1, 0);
  private lastT = 0;
  private underSurf!: THREE.Mesh;
  private bubbles!: THREE.InstancedMesh;
  private bub = { p: new Float32Array(600 * 3), v: new Float32Array(600 * 3), age: new Float32Array(600).fill(99), next: 0, acc: [0, 0] };
  private seabed!: THREE.Mesh;
  private aboveFog: THREE.Fog | null = null;
  private aboveBg: THREE.Color | null = null;
  private underFog = new THREE.Fog(0x1f6670, 6, 120);
  private submerged = false;
  private sun = new THREE.DirectionalLight(0xffffff, 2);
  private hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 1);
  private tod: TimeOfDay | null = null;
  private stripe: THREE.CanvasTexture;
  private stripeLit: THREE.CanvasTexture;
  private builtFor = '';

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGPURenderer({ canvas, antialias: true, alpha: false });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.75));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.scene.add(this.sun, this.sun.target, this.hemi, this.harbour, this.ship, this.other);
    this.ship.rotation.order = 'YXZ';            // yaw, then heel about the fore-and-aft axis

    // physically based sky (Preetham + clouds), follows the camera; layer 1 = not in the AO pre-pass
    this.sky.scale.setScalar(9000);
    this.sky.layers.set(1);
    this.scene.add(this.sky);
    this.camera.layers.enable(1);
    // underwater: the surface seen from below and a seabed under the ship (shown only when submerged)
    const us = new THREE.MeshBasicNodeMaterial({ color: '#5fb7c2', side: THREE.BackSide, transparent: true, opacity: 0.92, fog: true });
    this.underSurf = new THREE.Mesh(new THREE.PlaneGeometry(4000, 4000), us);
    this.underSurf.rotation.x = -Math.PI / 2; this.underSurf.position.y = -0.02; this.underSurf.visible = false; this.underSurf.layers.set(1);
    this.seabed = new THREE.Mesh(new THREE.PlaneGeometry(1500, 1500), new THREE.MeshStandardNodeMaterial({ color: '#8a7f62', roughness: 1 }));
    this.seabed.rotation.x = -Math.PI / 2; this.seabed.visible = false;
    this.scene.add(this.underSurf, this.seabed);
    // propeller bubbles / cavitation, only drawn underwater
    this.bubbles = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1),
      new THREE.MeshBasicNodeMaterial({ color: '#dff4f7', transparent: true, opacity: 0.4, depthWrite: false }), 600);
    this.bubbles.frustumCulled = false; this.bubbles.visible = false;
    this.bubbles.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.scene.add(this.bubbles);
    // sun shadows: an orthographic box that follows the ship
    this.sun.castShadow = true;
    const sc = this.sun.shadow.camera as THREE.OrthographicCamera;
    sc.left = -260; sc.right = 260; sc.top = 260; sc.bottom = -260; sc.near = 10; sc.far = 3000;
    this.sun.shadow.bias = -0.0004; this.sun.shadow.normalBias = 0.8;

    // balcony / window bands, 2.9 m deck pitch (ExtrudeGeometry side UVs are in metres)
    this.stripe = canvasTex(4, 64, c => {
      c.fillStyle = '#ffffff'; c.fillRect(0, 0, 4, 64);
      c.fillStyle = '#5a6a78'; c.fillRect(0, 26, 4, 28);
      c.fillStyle = '#2a3846'; c.fillRect(0, 30, 4, 22);
    });
    this.stripe.repeat.set(0.25, 1 / 2.9);
    this.stripeLit = canvasTex(4, 64, c => {
      c.fillStyle = '#000'; c.fillRect(0, 0, 4, 64);
      c.fillStyle = '#6b4a22'; c.fillRect(0, 32, 4, 18);
    });
    this.stripeLit.repeat.copy(this.stripe.repeat);

    const tl = new THREE.LineBasicNodeMaterial({ color: 0xc4489a, transparent: true, opacity: 0.9, depthTest: true });
    this.track = new THREE.Line(new THREE.BufferGeometry(), tl);
    this.trackEnd = new THREE.Line(new THREE.BufferGeometry(), tl);
    this.track.frustumCulled = this.trackEnd.frustumCulled = false;
    this.scene.add(this.track, this.trackEnd);
  }

  async init() {
    await this.renderer.init();
    const be = (this.renderer as unknown as { backend: { isWebGPUBackend?: boolean } }).backend;
    this.backend = be?.isWebGPUBackend ? 'WebGPU' : 'WebGL2';
    this.pmrem = new THREE.PMREMGenerator(this.renderer);
  }

  /** Low: phones (sky reflections, 1k shadows). High: planar reflections, ambient occlusion, 2k shadows. */
  setQuality(q: Quality) {
    if (q === this.quality && this.wake) return;
    this.quality = q;
    const high = q === 'high';
    this.renderer.setPixelRatio(Math.min(devicePixelRatio || 1, high ? 1.5 : 1.75));
    this.sun.shadow.mapSize.set(high ? 2048 : 1024, high ? 2048 : 1024);
    this.sun.shadow.map?.dispose(); (this.sun.shadow as unknown as { map: null }).map = null;
    if (this.wake) { this.scene.remove(this.wake.mesh); this.wake.mesh.dispose(); }
    this.wake = new Wake(high ? 1800 : 700);
    this.scene.add(this.wake.mesh);
    this.makeWater();
    this.pipeline?.dispose(); this.pipeline = null;
    if (high) {
      // ambient occlusion: normals/depth pre-pass (without sky and water), GTAO at half resolution,
      // applied to the indirect light of the main pass
      this.preCam.layers.set(0);
      const prePass = pass(this.scene, this.preCam);
      prePass.setMRT(mrt({ output: normalView }));
      const aoPass = ao(prePass.getTextureNode('depth'), prePass.getTextureNode(), this.preCam);
      aoPass.resolutionScale = 0.5;
      aoPass.radius.value = 0.6; aoPass.distanceFallOff.value = 1.2;
      const scenePass = pass(this.scene, this.camera);
      scenePass.contextNode = builtinAOContext(aoPass.getTextureNode().sample(screenUV).r);
      this.pipeline = new THREE.RenderPipeline(this.renderer);
      this.pipeline.outputNode = scenePass;
    }
    if (this.tod) { const t = this.tod; this.tod = null; this.setTime(t); }
  }
  private makeWater() {
    if (this.water) { this.scene.remove(this.water.mesh); this.water.mesh.geometry.dispose(); }
    this.water = makeWater(this.waterNormals, this.env, this.quality === 'high');
    this.water.mesh.layers.set(1);
    const s = S.sc?.start;
    if (s) this.water.mesh.position.set(s.e, 0, -s.n);
    this.water.mesh.renderOrder = 1;
    this.water.mesh.visible = !this.submerged;
    this.scene.add(this.water.mesh);
    if (this.tod) this.applyWaterTod(TOD[this.tod]);
  }
  private applyWaterTod(p: typeof TOD.day) {
    if (!this.water) return;
    this.water.u.waterColor.value.set(p.water);
    this.water.u.sunColor.value.set(p.sun).multiplyScalar(p.sunEl > 0 ? 1 : 0.15);
    this.water.u.sunDir.value.copy(this.sunDir);
  }

  resize(w: number, h: number) {
    if (w < 2 || h < 2) return;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  // ---------------------------------------------------------------- scene building
  private mat(color: THREE.ColorRepresentation, o: Partial<{ rough: number; metal: number; emissive: THREE.ColorRepresentation; map: THREE.Texture; emap: THREE.Texture; lit: boolean }> = {}) {
    const m = new THREE.MeshStandardNodeMaterial({ color, roughness: o.rough ?? 0.8, metalness: o.metal ?? 0 });
    if (o.map) m.map = o.map;
    if (o.emissive !== undefined) { m.emissive = new THREE.Color(o.emissive); if (o.emap) m.emissiveMap = o.emap; }
    if (o.lit) this.lit.push(m);
    return m;
  }
  private clear(g: THREE.Group) {
    g.traverse(o => { const m = o as THREE.Mesh; if (m.geometry) m.geometry.dispose(); });
    g.clear();
  }

  /** Rebuild for the current scenario and ship (cheap; called on scenario load). */
  build() {
    const key = S.sc.id + '|' + SHIP.id + '|' + (S.rt.escort?.spec.id ?? '') + '|' + S.rt.traffic.map(t => t.spec.id).join(',');
    if (key === this.builtFor) return;
    this.builtFor = key;
    this.lit = []; this.lamps = []; this.navLights = [];
    this.tod = null;
    this.buildHarbour();
    this.buildShip();
    this.buildOther();
    this.buildTraffic();
    this.buildTugs();
    for (const l of this.lines) this.scene.remove(l);
    this.lines = S.rt.lines.map(() => {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(17 * 3), 3));
      const l = new THREE.Line(g, new THREE.LineBasicNodeMaterial({ color: 0xe8d9a0 }));
      l.frustumCulled = false; l.visible = false; this.scene.add(l);
      return l;
    });
    this.harbour.traverse(o => { if ((o as THREE.Mesh).isMesh) { o.receiveShadow = true; o.castShadow = true; } });
    for (const t of this.tugs) t.traverse(o => { if ((o as THREE.Mesh).isMesh) o.castShadow = o.receiveShadow = true; });
    if (!SHIP.look.model) this.ship.traverse(o => { if ((o as THREE.Mesh).isMesh) o.castShadow = o.receiveShadow = true; });
    const s = S.sc.start;
    this.water?.mesh.position.set(s.e, 0, -s.n);
    this.wake?.reset();
  }

  private buildHarbour() {
    const g = this.harbour; this.clear(g); this.fenders = [];
    const sc = S.sc, LH = sc.landHeight ?? 2;
    const quayM = this.mat(0x858176, { rough: 0.95 }), pierM = this.mat(0x7a756b, { rough: 0.95 });
    const edgeM = this.mat(0x3b3a37, { rough: 0.9 });
    // level ice: a white sheet at the waterline (the broken channel shows on the chart)
    for (const f of sc.ice ?? []) {
      const geo = new THREE.ShapeGeometry(new THREE.Shape(f.poly.map(([n, e]) => new THREE.Vector2(e, n))));
      geo.rotateX(-Math.PI / 2); geo.translate(0, f.h > 1 ? 0.14 : 0.08, 0);
      const m = new THREE.Mesh(geo, this.mat(f.h > 1 ? 0xdde6ec : 0xf1f5f8, { rough: 0.85 }));
      m.receiveShadow = true; g.add(m);
    }
    if (SCENERY[sc.id]) this.loadScenery(sc.id, LH);
    else if (sc.obstacles.length <= 40) {
      for (const ob of sc.obstacles) {
        const sh = new THREE.Shape(ob.poly.map(([n, e]) => new THREE.Vector2(e, n)));
        const geo = new THREE.ExtrudeGeometry(sh, { depth: LH + 4, bevelEnabled: false });
        geo.rotateX(-Math.PI / 2); geo.translate(0, -4, 0);
        g.add(new THREE.Mesh(geo, [ob.kind === 'pier' ? pierM : quayM, edgeM]));
      }
    } else {
      // chart-derived land comes in hundreds of tiles: one merged mesh keeps it to a single draw call
      const geos = sc.obstacles.map(ob => {
        const geo = new THREE.ExtrudeGeometry(new THREE.Shape(ob.poly.map(([n, e]) => new THREE.Vector2(e, n))), { depth: LH + 4, bevelEnabled: false });
        geo.rotateX(-Math.PI / 2); geo.translate(0, -4, 0);
        return geo;
      });
      g.add(new THREE.Mesh(mergeGeometries(geos), quayM));
    }
    // fenders: cone body + panel, compressed live
    const fM = this.mat(0x1d1d1f, { rough: 0.7 });
    for (const f of sc.fenders) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(f.width, 2.6, 1), fM);
      m.rotation.y = Math.atan2(f.ne, -f.nn);
      m.userData = { f };
      g.add(m); this.fenders.push(m);
    }
    const bM = this.mat(0x24272a, { rough: 0.5, metal: 0.4 });
    const bG = new THREE.CylinderGeometry(0.32, 0.4, 0.9, 10);
    for (const [n, e] of sc.bollards) { const b = new THREE.Mesh(bG, bM); b.position.copy(tp(n, e, LH + 0.45)); g.add(b); }
    // quay lamps (glow at night)
    const lampM = new THREE.MeshBasicNodeMaterial({ color: 0xffd9a0 });
    const poleM = this.mat(0x4a4d50, { rough: 0.6, metal: 0.3 });
    const poleG = new THREE.CylinderGeometry(0.12, 0.15, 10, 6), headG = new THREE.SphereGeometry(0.55, 8, 6);
    for (let i = 0; i < sc.bollards.length; i += 3) {
      const [n, e] = sc.bollards[i];
      const nb = sc.bollards[Math.min(sc.bollards.length - 1, i + 1)];
      const dn = nb[0] - n, de = nb[1] - e, l = Math.hypot(dn, de) || 1;
      // 9 m back from the bollard line, toward the land (perpendicular to the bollard row)
      const fN = sc.fenders[0]?.nn ?? 0, fE = sc.fenders[0]?.ne ?? 0;
      const pn = n - fN * 9 + dn / l * 12, pe = e - fE * 9 + de / l * 12;
      const p = new THREE.Mesh(poleG, poleM); p.position.copy(tp(pn, pe, LH + 5)); g.add(p);
      const h = new THREE.Mesh(headG, lampM); h.position.copy(tp(pn, pe, LH + 10)); g.add(h); this.lamps.push(h);
    }
    // buildings with lit-window textures
    const win = canvasTex(64, 64, c => {
      c.fillStyle = '#000'; c.fillRect(0, 0, 64, 64);
      let s = 3; const r = () => ((s = (s * 48271) % 2147483647) / 2147483647);
      for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) {
        c.fillStyle = r() < 0.55 ? `rgb(255,${200 + r() * 40 | 0},${120 + r() * 60 | 0})` : '#000';
        c.fillRect(x * 16 + 4, y * 16 + 5, 9, 8);
      }
    });
    for (const b of sc.buildings ?? []) {
      const col = new THREE.Color(b.color);
      const roof = this.mat(col.clone().multiplyScalar(0.8), { rough: 0.9 });
      const side = (span: number) => {
        const t = win.clone(); t.needsUpdate = true; t.repeat.set(Math.max(1, Math.round(span / 14)), Math.max(1, Math.round(b.h / 13)));
        return this.mat(b.glass ? col.clone().lerp(new THREE.Color(0x3a5468), 0.45) : col, { rough: b.glass ? 0.25 : 0.85, metal: b.glass ? 0.3 : 0, emissive: 0xffffff, emap: t, lit: true });
      };
      const sd = side(b.d), sw = side(b.w);
      const m = new THREE.Mesh(new THREE.BoxGeometry(b.w, b.h, b.d), [sd, sd, roof, roof, sw, sw]);
      m.position.copy(tp(b.n, b.e, LH + b.h / 2));
      m.rotation.y = (90 - b.heading) * Math.PI / 180;
      g.add(m);
    }
  }

  /** Real-world scenery (chart land + OpenStreetMap), fetched and built on demand. */
  private async loadScenery(id: string, LH: number) {
    const key = this.builtFor;
    try {
      const buf = await (await fetch(SCENERY[id])).arrayBuffer();
      if (key !== this.builtFor) return;
      const g = new THREE.Group();
      this.sceneryLit = buildScenery(parseScenery(buf), g, LH, this.quality === 'low');
      if (key !== this.builtFor) return;
      this.harbour.add(g);
      if (this.tod) this.sceneryLit.value = TOD[this.tod].lit;
    } catch (e) { console.error('scenery', e); }
  }
  private sceneryLit: { value: number } | null = null;
  private shipGen = 0;
  /** Azipod units under the stern: strut, pod body, pulling propeller. Driven from the actual pod state. */
  private pods: { yaw: THREE.Group; prop: THREE.Group; spin: number; rudder?: THREE.Group }[] = [];
  podDepth = -5;
  private buildPods(g: THREE.Group) {
    this.pods = [];
    const T = SHIP.T;
    const steel = new THREE.MeshStandardNodeMaterial({ color: '#3b4046', roughness: 0.55, metalness: 0.35 });
    const anti = new THREE.MeshStandardNodeMaterial({ color: '#7a1a1c', roughness: 0.7 });
    const bronze = new THREE.MeshStandardNodeMaterial({ color: '#a8834c', roughness: 0.3, metalness: 0.85, side: THREE.DoubleSide });
    for (const p of SHIP.pods) {
      if (p.kind === 'shaft') { this.pods.push(this.buildShaftUnit(g, p, steel, anti, bronze)); continue; }
      if (p.kind === 'azimuth' || p.kind === 'vsp') { this.pods.push(this.buildTugUnit(g, p, steel, bronze)); continue; }
      if (p.kind === 'waterjet') { this.pods.push(this.buildJetUnit(g, p, steel)); continue; }
      const D = p.D, podR = D * 0.27, podL = D * 1.9;
      const cy = -(T - D / 2 - 0.2);                     // propeller tip just above the keel line
      this.podDepth = cy;
      const yaw = new THREE.Group(); yaw.position.set(p.y, 0, -p.x);
      // strut: a vertical foil from the hull down to the pod (local -z = direction of pull)
      const strutH = Math.max(1, -cy - 0.3);              // up into the hull (stern bottoms sit just under the waterline)
      const sg = new THREE.CylinderGeometry(1, 1, strutH, 20, 1); sg.scale(0.45, 1, D * 0.42); 
      const strut = new THREE.Mesh(sg, anti); strut.position.set(0, cy + strutH / 2, D * 0.12); yaw.add(strut);
      // pod body: streamlined motor housing, hub cone forward, tail cone and fin aft
      const body = new THREE.Mesh(new THREE.CapsuleGeometry(podR, podL - 2 * podR, 8, 20), steel);
      body.rotation.x = Math.PI / 2; body.position.set(0, cy, D * 0.2); yaw.add(body);
      const fin = new THREE.Mesh(new THREE.BoxGeometry(0.22, D * 0.26, D * 0.5), steel);
      fin.position.set(0, cy - podR - D * 0.12, D * 0.55); yaw.add(fin);
      // propeller at the forward end (pulling): hub + 4 skewed, pitched blades
      const prop = new THREE.Group(); prop.position.set(0, cy, D * 0.2 - podL / 2 - 0.35);
      const hub = new THREE.Mesh(new THREE.ConeGeometry(podR * 0.85, D * 0.35, 20), bronze);
      hub.rotation.x = -Math.PI / 2; hub.position.z = -D * 0.12; prop.add(hub);
      const bladeShape = new THREE.Shape();
      const R = D / 2, r0 = podR * 0.7;
      // wide, skewed blade (expanded area ratio ≈ 0.6)
      bladeShape.moveTo(-R * 0.16, r0);
      bladeShape.bezierCurveTo(-R * 0.5, R * 0.5, -R * 0.42, R * 0.9, R * 0.02, R);
      bladeShape.bezierCurveTo(R * 0.34, R * 0.9, R * 0.36, R * 0.4, R * 0.2, r0);
      const bg = new THREE.ShapeGeometry(bladeShape, 10);
      for (let k = 0; k < 4; k++) {
        const holder = new THREE.Group(); holder.rotation.z = k * Math.PI / 2;
        const blade = new THREE.Mesh(bg, bronze);
        blade.rotation.y = 0.55;                         // blade pitch
        holder.add(blade); prop.add(holder);
      }
      yaw.add(prop);
      yaw.traverse(o => { if ((o as THREE.Mesh).isMesh) o.castShadow = true; });
      g.add(yaw);
      this.pods.push({ yaw, prop, spin: 0 });
    }
    // bow thruster tunnel mouths, both sides
    if (SHIP.bowThruster && SHIP.bowThruster.Tmax > 0) {
      const tm = new THREE.MeshStandardNodeMaterial({ color: '#0d1013', roughness: 0.9 });
      const bt = SHIP.bowThruster, n = Math.max(1, Math.round(bt.P / 2e6));
      for (let k = 0; k < n; k++) for (const side of [-1, 1]) {
        const x = bt.x + (k - (n - 1) / 2) * 5.5;
        const hw = (() => { let best = 0; for (let i = 0; i < HULL.length; i++) { const [x0, y0] = HULL[i], [x1, y1] = HULL[(i + 1) % HULL.length]; if ((x - x0) * (x - x1) <= 0 && x0 !== x1) best = Math.max(best, Math.abs(y0 + (y1 - y0) * (x - x0) / (x1 - x0))); } return best; })();
        const disc = new THREE.Mesh(new THREE.CircleGeometry(1.25, 20), tm);
        disc.position.set(side * (hw + 0.05), -T * 0.55, -x); disc.rotation.y = side * Math.PI / 2; g.add(disc);
      }
    }
  }
  /** Cargo-specific deck detail: tank-deck piping, container stacks, hatch covers. */
  private buildCargo(g: THREE.Group, fb: number) {
    const L = SHIP.look, [ha, hb] = hullX();
    const houseFwd = Math.max(...L.decks.map(d => d.x1)), houseAft = Math.min(...L.decks.map(d => d.x0));
    const fwdEnd = hb - SHIP.B * 0.9;
    if (SHIP.type === 'tanker') {
      const deck = new THREE.Mesh(prism(deckOutline(houseFwd, hb - 2, 0.6), fb, fb + 0.15), this.mat('#6e2b24', { rough: 0.85 }));
      g.add(deck);
      const pipe = this.mat('#c9c4b4', { rough: 0.5, metal: 0.3 });
      // centreline pipe rack and catwalk, from the house to the forecastle
      const len = fwdEnd - houseFwd;
      for (const [y, h, w] of [[-1.6, 1.4, 1.1], [1.6, 1.4, 1.1], [0, 2.6, 1.6]] as [number, number, number][]) {
        const m = new THREE.Mesh(new THREE.BoxGeometry(w, 0.6, len), pipe); m.position.set(y, fb + h, -(houseFwd + len / 2)); g.add(m);
      }
      // midship manifold: pipes across the deck to both rails
      const mx = (houseFwd + fwdEnd) / 2;
      for (const dx of [-3, 0, 3]) { const m = new THREE.Mesh(new THREE.BoxGeometry(SHIP.B * 0.85, 0.7, 0.7), pipe); m.position.set(0, fb + 1.2, -(mx + dx)); g.add(m); }
      const crane = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.7, 12, 8), this.mat(L.accent, { rough: 0.6 }));
      crane.position.set(SHIP.B * 0.3, fb + 6, -(mx + 8)); g.add(crane);
    } else if (SHIP.type === 'container') {
      // 40 ft bays, 2.5 m rows, on-deck tiers; stacks step down toward the bow to keep the view ahead clear
      const bayL = 12.6, rowW = 2.5, tierH = 2.6;
      const rows = Math.floor((SHIP.B - 1.5) / rowW);
      const boxes: [number, number, number][] = [];
      let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
      // SOLAS V/22: the sea surface may be hidden for at most min(2 L, 500 m) ahead of the bow,
      // so stacks forward of the bridge stay under the sight line from the conning position
      const eye = L.bridgeH + 1.7, reach = hb + Math.min(2 * SHIP.L, 500);
      const stackFor = (x0: number, x1: number, maxTiers: number) => {
        for (let x = x1 - bayL / 2; x - bayL / 2 > x0; x -= bayL + 0.8) {
          const hb2 = Math.max(0, halfB(x) - 0.8), r = Math.min(rows, Math.floor(2 * hb2 / rowW));
          if (r < 2) continue;
          const hMax = x > SHIP.bridgeX ? eye * (1 - (x + bayL / 2 - SHIP.bridgeX) / (reach - SHIP.bridgeX)) : Infinity;
          const allowed = Math.floor((hMax - fb - 1.2) / tierH);
          const tiers = Math.max(1, Math.min(maxTiers - (rnd() < 0.3 ? 1 : 0), allowed));
          for (let k = 0; k < r; k++) for (let t = 0; t < tiers - (rnd() < 0.12 ? 1 : 0); t++) boxes.push([x, (k - (r - 1) / 2) * rowW, fb + 1.2 + tierH * (t + 0.5)]);
        }
      };
      stackFor(houseFwd + 2, fwdEnd, 6);
      stackFor(ha + 14, houseAft - 2, 6);
      const geo = new THREE.BoxGeometry(2.4, tierH - 0.1, 12.1);
      const mesh = new THREE.InstancedMesh(geo, new THREE.MeshStandardNodeMaterial({ roughness: 0.75 }), boxes.length);
      const cols = ['#b8202f', '#1f4e8c', '#2f7d4f', '#d9a03a', '#6b6f73', '#e4e2da', '#7a3e1d', '#155e6e', '#c45a1d'].map(c => new THREE.Color(c));
      const m4 = new THREE.Matrix4();
      boxes.forEach(([x, y, z], i) => { m4.makeTranslation(y, z, -x); mesh.setMatrixAt(i, m4); mesh.setColorAt(i, cols[(i * 7 + Math.floor(x)) % cols.length]); });
      mesh.castShadow = true; g.add(mesh);
    } else if (SHIP.type === 'gas') {
      // membrane LNG carrier: a continuous trunk deck over the four tanks, liquid domes on top
      const trunkM = this.mat(L.topsides, { rough: 0.6 }), dome = this.mat('#d8d6cf', { rough: 0.5 });
      const len = fwdEnd - houseFwd - 4;
      const trunk = new THREE.Mesh(new THREE.BoxGeometry(SHIP.B * 0.78, 4.5, len), trunkM);
      trunk.position.set(0, fb + 2.25, -(houseFwd + 2 + len / 2)); g.add(trunk);
      for (let k = 0; k < 4; k++) {
        const d = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.2, 3, 12), dome);
        d.position.set(0, fb + 6, -(houseFwd + 2 + len * (k + 0.5) / 4)); g.add(d);
      }
      const rack = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.8, len), this.mat('#c9c4b4', { rough: 0.5 }));
      rack.position.set(SHIP.B * 0.2, fb + 5, -(houseFwd + 2 + len / 2)); g.add(rack);
    } else if (SHIP.type === 'bulk') {
      const holds = 7, span = fwdEnd - houseFwd - 6, hl = span / holds;
      const cover = this.mat(L.accent, { rough: 0.65 }), coam = this.mat(L.topsides, { rough: 0.6 });
      for (let k = 0; k < holds; k++) {
        const x = houseFwd + 4 + hl * (k + 0.5);
        const w = Math.min(SHIP.B * 0.62, 2 * halfB(x) - 6);
        const c1 = new THREE.Mesh(new THREE.BoxGeometry(w + 1, 1.6, hl * 0.72 + 1), coam); c1.position.set(0, fb + 0.8, -x); g.add(c1);
        const c2 = new THREE.Mesh(new THREE.BoxGeometry(w, 1.0, hl * 0.72), cover); c2.position.set(0, fb + 2.0, -x); g.add(c2);
      }
    }
  }
  /** Z-drive (leg, gearbox, propeller in a nozzle, pushing) or Voith Schneider rotor (vertical blades). */
  private buildTugUnit(g: THREE.Group, p: PodSpec, steel: THREE.Material, bronze: THREE.Material) {
    const T = SHIP.T, D = p.D, cy = -(T - D / 2 - 0.1);
    const yaw = new THREE.Group(); yaw.position.set(p.y, 0, -p.x);
    const prop = new THREE.Group();
    if (p.kind === 'vsp') {
      // rotor flush with the bottom, five blades hanging down, a guard plate below
      const disc = new THREE.Mesh(new THREE.CylinderGeometry(D / 2, D / 2, 0.4, 24), steel); disc.position.y = -T + 2.2; yaw.add(disc);
      prop.position.y = -T + 2.0;
      for (let k = 0; k < 5; k++) {
        const a = k * 2 * Math.PI / 5;
        const b = new THREE.Mesh(new THREE.BoxGeometry(0.25, 1.9, 0.9), bronze); b.position.set(Math.cos(a) * D * 0.4, -0.95, Math.sin(a) * D * 0.4); b.rotation.y = -a; prop.add(b);
      }
      yaw.add(prop);
      const guard = new THREE.Mesh(new THREE.CylinderGeometry(D * 0.65, D * 0.65, 0.15, 24), steel); guard.position.y = -T - 0.1; yaw.add(guard);
    } else {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.6, -cy, D * 0.45), steel); leg.position.set(0, cy / 2, 0); yaw.add(leg);
      const box = new THREE.Mesh(new THREE.CapsuleGeometry(D * 0.18, D * 0.5, 6, 14), steel); box.rotation.x = Math.PI / 2; box.position.set(0, cy, 0); yaw.add(box);
      const duct = new THREE.Mesh(new THREE.TorusGeometry(D / 2 + 0.15, 0.18, 8, 28), steel); duct.position.set(0, cy, D * 0.5); duct.scale.z = 2.2; yaw.add(duct);
      prop.position.set(0, cy, D * 0.5);
      for (let k = 0; k < 4; k++) { const h = new THREE.Group(); h.rotation.z = k * Math.PI / 2; const b = new THREE.Mesh(new THREE.BoxGeometry(0.12, D * 0.46, D * 0.22), bronze); b.position.y = D * 0.24; b.rotation.y = 0.6; h.add(b); prop.add(h); }
      yaw.add(prop);
    }
    yaw.traverse(o => { if ((o as THREE.Mesh).isMesh) o.castShadow = true; });
    g.add(yaw);
    this.podDepth = p.kind === 'vsp' ? -T + 0.6 : cy;
    return { yaw, prop, spin: 0 };
  }
  /** Waterjet at the transom: steering nozzle (turns about a vertical pivot) and the reversing bucket over it. */
  private buildJetUnit(g: THREE.Group, p: PodSpec, steel: THREE.Material) {
    const cy = -0.55, r = Math.sqrt(p.jet!.Anoz / Math.PI);
    const yaw = new THREE.Group(); yaw.position.set(p.y, cy, -p.x);
    const housing = new THREE.Mesh(new THREE.CylinderGeometry(r * 2.1, r * 2.4, 1.6, 18), steel);
    housing.rotation.x = Math.PI / 2; housing.position.z = -0.8; g.add(housing); housing.position.add(yaw.position);
    const nozzle = new THREE.Mesh(new THREE.CylinderGeometry(r * 1.15, r * 1.6, 1.2, 18), steel);
    nozzle.rotation.x = Math.PI / 2; nozzle.position.z = 0.6; yaw.add(nozzle);
    // bucket: a hood hinged above the nozzle, swinging down over its exit
    const prop = new THREE.Group(); prop.position.set(0, r * 1.8, 0.4);
    const hood = new THREE.Mesh(new THREE.BoxGeometry(r * 3.4, 0.25, 1.5), new THREE.MeshStandardNodeMaterial({ color: '#c9ccd0', roughness: 0.4, metalness: 0.6 }));
    hood.position.set(0, 0, 0.9); prop.add(hood);
    yaw.add(prop);
    yaw.traverse(o => { if ((o as THREE.Mesh).isMesh) o.castShadow = true; });
    g.add(yaw);
    this.podDepth = cy;
    return { yaw, prop, spin: 0 };
  }
  /** Fixed propeller on a shaft boss (pushing, under the stern) and the rudder behind it. */
  private buildShaftUnit(g: THREE.Group, p: PodSpec, steel: THREE.Material, anti: THREE.Material, bronze: THREE.Material) {
    const sh = p.shaft!, D = sh.prop.D, T = SHIP.T, R = D / 2;
    const cy = -(T - R - 0.4);
    this.podDepth = cy;
    const yaw = new THREE.Group(); yaw.position.set(p.y, 0, -p.x);
    const boss = new THREE.Mesh(new THREE.CylinderGeometry(D * 0.1, D * 0.16, D * 0.7, 16), anti);
    boss.rotation.x = Math.PI / 2; boss.position.set(0, cy, -D * 0.35); yaw.add(boss);
    const prop = new THREE.Group(); prop.position.set(0, cy, 0.2);
    const hub = new THREE.Mesh(new THREE.ConeGeometry(D * 0.1, D * 0.28, 16), bronze);
    hub.rotation.x = Math.PI / 2; hub.position.z = D * 0.1; prop.add(hub);
    const bs = new THREE.Shape(), r0 = D * 0.08;
    bs.moveTo(-R * 0.18, r0); bs.bezierCurveTo(-R * 0.48, R * 0.5, -R * 0.36, R * 0.92, R * 0.04, R);
    bs.bezierCurveTo(R * 0.36, R * 0.88, R * 0.34, R * 0.4, R * 0.18, r0);
    const bg = new THREE.ShapeGeometry(bs, 10), nb = D > 7 ? 5 : 4;
    for (let k = 0; k < nb; k++) { const h = new THREE.Group(); h.rotation.z = k * 2 * Math.PI / nb; const b = new THREE.Mesh(bg, bronze); b.rotation.y = -0.6 * sh.prop.hand; h.add(b); prop.add(h); }
    yaw.add(prop);
    yaw.traverse(o => { if ((o as THREE.Mesh).isMesh) o.castShadow = true; });
    g.add(yaw);
    let rudder: THREE.Group | undefined;
    if (sh.rudder) {
      const rd = sh.rudder, chord = rd.A / rd.H;
      rudder = new THREE.Group(); rudder.position.set(p.y, 0, -rd.xR);
      const blade = new THREE.Mesh(new THREE.BoxGeometry(Math.max(0.4, chord * 0.16), rd.H, chord), steel);
      blade.position.set(0, -T + rd.H / 2 + 0.3, chord * 0.25);
      rudder.add(blade);
      if (rd.type === 'flap') { const flap = new THREE.Mesh(new THREE.BoxGeometry(Math.max(0.3, chord * 0.1), rd.H, chord * 0.28), anti); flap.position.set(0, -T + rd.H / 2 + 0.3, chord * 0.85); rudder.add(flap); }
      rudder.traverse(o => { if ((o as THREE.Mesh).isMesh) o.castShadow = true; });
      g.add(rudder);
    }
    return { yaw, prop, spin: 0, rudder };
  }
  /** The escorted ship, built by the same procedure with her particulars swapped in for the build. */
  private buildOther() {
    this.clear(this.other);
    if (this.towLine) { this.scene.remove(this.towLine); this.towLine = null; }
    const esc = S.rt.escort; if (!esc) return;
    const own = SHIP.id, ownHull = HULL, pods = this.pods, depth = this.podDepth;
    try { setShip(esc.spec.id); setHull(esc.hull); this.buildShip(this.other, false); }
    finally { setShip(own); setHull(ownHull); this.pods = pods; this.podDepth = depth; }
    this.other.traverse(o => { if ((o as THREE.Mesh).isMesh) o.castShadow = o.receiveShadow = true; });
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(17 * 3), 3));
    this.towLine = new THREE.Line(g, new THREE.LineBasicNodeMaterial({ color: 0xe8d9a0 }));
    this.towLine.frustumCulled = false; this.scene.add(this.towLine);
  }
  /** Traffic: each ship built by the same procedure as the escorted ship. */
  private buildTraffic() {
    for (const g of this.trafficG) { this.clear(g); this.scene.remove(g); }
    this.trafficG = [];
    const own = SHIP.id, ownHull = HULL, pods = this.pods, depth = this.podDepth;
    try {
      for (const tr of S.rt.traffic) {
        const g = new THREE.Group();
        setShip(tr.spec.id); setHull(tr.hull); this.buildShip(g, false);
        g.traverse(o => { if ((o as THREE.Mesh).isMesh) o.castShadow = o.receiveShadow = true; });
        this.scene.add(g); this.trafficG.push(g);
      }
    } finally { setShip(own); setHull(ownHull); this.pods = pods; this.podDepth = depth; }
  }
  private buildShip(g = this.ship, own = true) {
    this.clear(g);
    const gen = own ? ++this.shipGen : this.shipGen;   // a model still loading for the previous ship must not land
    this.buildPods(g);
    if (own && SHIP.look.model) { this.buildModelShip(SHIP.look.model, gen); return; }
    const L = SHIP.look, T = SHIP.T, fb = L.freeboard;
    const outline = HULL as [number, number][];
    const boot = Math.min(fb - 1, 3);
    if (SHIP.demi) {
      // catamaran: two slender demi-hulls under a bridging deck, an open tunnel between them
      const d = SHIP.demi, half = SHIP.B / 2, tunnel = Math.min(fb - 1.4, 1.3);
      for (const side of [-1, 1]) {
        const demi = outline.map(([x, y]) => [x, side * d.y + y / half * d.B / 2] as [number, number]);
        g.add(new THREE.Mesh(prism(demi, -T, tunnel + 0.6), this.mat(L.hull, { rough: 0.55 })));
      }
      g.add(new THREE.Mesh(prism(outline, tunnel, boot), this.mat(L.hull, { rough: 0.55 })));
    } else g.add(new THREE.Mesh(prism(outline, -T, boot), this.mat(L.hull, { rough: 0.55 })));
    g.add(new THREE.Mesh(prism(outline, boot, fb), this.mat(L.topsides, { rough: 0.5 })));
    // bulwark top line
    const capM = this.mat(L.accent, { rough: 0.6 });
    const stripeM = this.mat(L.super, { rough: 0.5, map: this.stripe, emissive: 0xffffff, emap: this.stripeLit, lit: true });
    const roofM = this.mat(L.super, { rough: 0.7 });
    let topH = fb;
    const whAft = SHIP.bridgeX - L.bridgeLen / 2;
    const cargo = SHIP.type && SHIP.type !== 'cruise';
    const sideM = cargo ? this.mat(L.super, { rough: 0.6 }) : stripeM;
    for (const d of L.decks) {
      // decks that rise above the wheelhouse must stay abaft it, or they would block the view ahead
      const x1 = d.h > L.bridgeH - 3 ? Math.min(d.x1, whAft) : d.x1;
      if (x1 - d.x0 < 4) continue;
      g.add(new THREE.Mesh(prism(deckOutline(d.x0, x1, d.inset), fb, d.h), [roofM, sideM]));
      if (cargo) {
        // a band of windows under each deck edge
        const win = new THREE.Mesh(prism(deckOutline(d.x0 - 0.05, x1 + 0.05, d.inset - 0.05), d.h - 1.6, d.h - 0.6), this.mat(L.glass, { rough: 0.2, metal: 0.4 }));
        g.add(win);
      }
      topH = Math.max(topH, d.h);
    }
    if (cargo) this.buildCargo(g, fb);
    // rotor sails: tall cylinders with an end plate on top
    for (const r of SHIP.rotors ?? []) {
      const cyl = new THREE.Mesh(new THREE.CylinderGeometry(r.D / 2, r.D / 2, r.H, 24), this.mat('#e9ebec', { rough: 0.45 }));
      cyl.position.set(r.y, fb + r.H / 2, -r.x); g.add(cyl);
      const plate = new THREE.Mesh(new THREE.CylinderGeometry(r.D, r.D, 0.3, 28), this.mat(L.accent, { rough: 0.5 }));
      plate.position.set(r.y, fb + r.H, -r.x); g.add(plate);
    }
    // wheelhouse with wings, glass all round
    const glass = this.mat(L.glass, { rough: 0.15, metal: 0.5 });
    const wingW = 2 * (SHIP.B / 2 + L.wingOut), bx = SHIP.bridgeX;
    // enclosed wheelhouse amidships, open wings out to the ship's side and beyond
    const whW = SHIP.B * 0.7;
    const wh = new THREE.Mesh(new THREE.BoxGeometry(whW, 3, L.bridgeLen), glass);
    wh.position.set(0, L.bridgeH - 1.5, -bx); g.add(wh);
    const roof = new THREE.Mesh(new THREE.BoxGeometry(whW + 0.6, 0.5, L.bridgeLen + 0.6), roofM);
    roof.position.set(0, L.bridgeH + 0.25, -bx); g.add(roof);
    const wingL = (wingW - whW) / 2;
    for (const sgn of [-1, 1]) {
      const wd = new THREE.Mesh(new THREE.BoxGeometry(wingL, 0.5, 4), roofM);
      wd.position.set(sgn * (whW / 2 + wingL / 2), L.bridgeH - 3.2, -(bx + L.bridgeLen / 2 - 2)); g.add(wd);
      const bw = new THREE.Mesh(new THREE.BoxGeometry(wingL, 1.1, 0.15), roofM);   // forward bulwark
      bw.position.set(sgn * (whW / 2 + wingL / 2), L.bridgeH - 2.4, -(bx + L.bridgeLen / 2)); g.add(bw);
    }
    // funnel
    const f = L.funnel;
    const fh = Math.min(18, f.h - fb + 0.5);              // from the deck up (low craft have short funnels)
    const fun = new THREE.Mesh(new THREE.BoxGeometry(f.w, fh, f.l), this.mat(L.super, { rough: 0.5 }));
    fun.position.set(0, f.h - fh / 2, -f.x); g.add(fun);
    const band = new THREE.Mesh(new THREE.BoxGeometry(f.w + 0.2, 3, f.l + 0.2), capM);
    band.position.set(0, f.h - 1.5, -f.x); g.add(band);
    // mast + navigation lights (COLREG: masthead, sidelights, stern)
    const mastH = Math.max(topH, L.bridgeH) + 9;
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.35, mastH - L.bridgeH, 6), roofM);
    mast.position.set(0, (mastH + L.bridgeH) / 2, -(bx - 3)); g.add(mast);
    const lamp = (c: number, x: number, y: number, z: number) => {
      const m = new THREE.Mesh(new THREE.SphereGeometry(0.55, 8, 6), new THREE.MeshBasicNodeMaterial({ color: c }));
      m.position.set(y, z, -x); g.add(m); this.navLights.push(m);
    };
    const [hxa, hxb] = hullX();
    lamp(0xfff6e0, bx - 3, 0, mastH + 0.5);
    lamp(0xfff6e0, hxb - 8, 0, fb + 12);
    lamp(0xff2a2a, bx, -wingW / 2 - 0.2, L.bridgeH - 1);
    lamp(0x22ff66, bx, wingW / 2 + 0.2, L.bridgeH - 1);
    lamp(0xfff6e0, hxa + 1, 0, fb + 2);
    if (own) this.ship.userData.eyeH = L.bridgeH - 1.4;
  }

  /** Detailed ship from a converted STL, painted per pixel (see tools/ship/stl_to_ship.py). */
  private async buildModelShip(m: NonNullable<typeof SHIP.look.model>, gen: number) {
    const L = SHIP.look, g = this.ship;
    // the bridge wings, lights and cameras still come from the look (no blocks drawn)
    this.ship.userData.eyeH = L.bridgeH - 1.4;
    const wingW = 2 * (SHIP.B / 2 + L.wingOut);
    const lamp = (c: number, x: number, y: number, z: number) => {
      const o = new THREE.Mesh(new THREE.SphereGeometry(0.55, 8, 6), new THREE.MeshBasicNodeMaterial({ color: c }));
      o.position.set(y, z, -x); g.add(o); this.navLights.push(o); o.visible = this.tod !== 'day' && this.tod !== null;
    };
    lamp(0xfff6e0, m.mast[0], 0, m.mast[1] + 0.8);
    lamp(0xff2a2a, SHIP.bridgeX, -wingW / 2 - 0.3, L.bridgeH - 2);
    lamp(0x22ff66, SHIP.bridgeX, wingW / 2 + 0.3, L.bridgeH - 2);
    lamp(0xfff6e0, m.stern[0], 0, m.stern[1]);
    const url = ({ spirit: spiritUrl } as Record<string, string>)[m.id];
    const buf = await (await fetch(url)).arrayBuffer();
    if (gen !== this.shipGen) return;                     // ship changed while loading
    const dv = new DataView(buf);
    let o = 4; const n = dv.getUint32(o, true); o += 4;
    // per-pixel paint for the hull and superstructure (heights in metres above the waterline)
    const y = positionLocal.y, z = positionLocal.z, nrm = normalLocal;
    const vertical = float(1).sub(step(0.3, abs(nrm.y))), upward = step(0.85, nrm.y), side = step(0.75, abs(nrm.x));
    const band = (lo: number, hi: number) => step(lo, y).mul(float(1).sub(step(hi, y)));
    const C = (h: string) => color(new THREE.Color(h));
    let col = mix(C('#eceee9'), C('#cfccc3'), upward);
    const glassMask = vertical.mul(band(18.8, 29.2)).mul(step(0.38, fract(y.sub(18.8).div(2.95))))
      .add(vertical.mul(band(29.2, 33.7)))
      .add(vertical.mul(band(25.4, 29.7)).mul(step(z, -114.8)))
      .add(side.mul(band(7.9, 8.5).add(band(10.5, 11.1))).mul(step(0.78, fract(z.div(2.6)))));
    const glass = clamp(glassMask, 0, 1);
    col = mix(col, C('#1d242c'), glass);
    col = mix(col, C('#c8102e'), side.mul(band(5.3, 5.85)));          // sheer stripe
    col = mix(col, C('#1f3a8c'), band(0.35, 1.5));                     // boot top
    col = mix(col, C('#a3161c'), float(1).sub(step(0.35, y)));         // antifouling
    // balcony dividers: the dark bands are broken into individual balconies every 3.6 m
    const divider = step(0.93, fract(z.div(3.6))).mul(vertical).mul(band(18.8, 29.2));
    col = mix(col, C('#eceee9'), divider.mul(0.85));
    const lit = uniform(0);
    this.modelLit = lit;
    // painted steel: semi-gloss; glass: smooth and mirror-like so it picks up the sky
    const glassOnly = glass.mul(float(1).sub(divider));
    const body = new THREE.MeshStandardNodeMaterial();
    body.colorNode = col;
    body.roughnessNode = mix(float(0.34), float(0.07), glassOnly);
    body.metalnessNode = mix(float(0.0), float(0.55), glassOnly);
    body.emissiveNode = C('#ffcf8a').mul(glassOnly).mul(lit).mul(0.9);
    const MATS = [body,
      new THREE.MeshStandardNodeMaterial({ color: '#a50a1f', roughness: 0.35 }),     // funnel
      new THREE.MeshStandardNodeMaterial({ color: '#a97c50', roughness: 0.75 }),    // teak
      new THREE.MeshStandardNodeMaterial({ color: '#f26b1d', roughness: 0.45 })];   // lifeboats
    if (new TextDecoder().decode(new Uint8Array(buf, 0, 4)) !== 'SHP2') throw new Error('ship model: expected SHP2');
    const pad = (v: number) => (4 - (v % 4)) % 4;
    for (let k = 0; k < n; k++) {
      const cls = dv.getUint8(o); const nv = dv.getUint32(o + 1, true), ni = dv.getUint32(o + 5, true); o += 9;
      const pos = new Float32Array(nv * 3), nor = new Float32Array(nv * 3);
      for (let i = 0; i < nv * 3; i++) pos[i] = dv.getInt16(o + i * 2, true) * 0.005;
      o += nv * 6; o += pad(nv * 6);
      for (let i = 0; i < nv * 3; i++) nor[i] = dv.getInt8(o + i) / 127;
      o += nv * 3; o += pad(nv * 3);
      const big = nv > 65535, idx = big ? new Uint32Array(ni) : new Uint16Array(ni);
      for (let i = 0; i < ni; i++) idx[i] = big ? dv.getUint32(o + i * 4, true) : dv.getUint16(o + i * 2, true);
      o += ni * (big ? 4 : 2); o += pad(ni * (big ? 4 : 2));
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));   // creased smooth normals from the converter
      geo.setIndex(new THREE.BufferAttribute(idx, 1));
      geo.computeBoundingSphere();
      const mesh = new THREE.Mesh(geo, MATS[cls] ?? body);
      mesh.castShadow = mesh.receiveShadow = true;
      g.add(mesh);
    }
    if (this.tod) { const t = this.tod; this.tod = null; this.setTime(t); }
  }
  private modelLit: { value: number } | null = null;

  private buildTugs() {
    for (const t of this.tugs) { this.clear(t); this.scene.remove(t); }
    for (const l of this.tugLines) this.scene.remove(l);
    this.tugs = []; this.tugLines = [];
    const hullM = this.mat(0x1f2a30, { rough: 0.6 }), topM = this.mat(0xd8dcdf, { rough: 0.6 }), redM = this.mat(0xb8202f, { rough: 0.6 });
    const out: [number, number][] = [[16, 0], [12, 5], [4, 6], [-14, 6], [-16, 4.5], [-16, -4.5], [-14, -6], [4, -6], [12, -5]];
    for (const _ of S.rt.tugs) {
      const g = new THREE.Group();
      g.add(new THREE.Mesh(prism(out, -3, 2.2), hullM));
      const fender = new THREE.Mesh(new THREE.TorusGeometry(5.5, 0.6, 6, 16, Math.PI), this.mat(0x111111));
      fender.rotation.x = Math.PI / 2; fender.rotation.z = Math.PI; fender.position.set(0, 1.3, -11); fender.scale.set(1, 1, 1);
      g.add(fender);
      const h = new THREE.Mesh(new THREE.BoxGeometry(7, 4, 8), topM); h.position.set(0, 4.2, -2); g.add(h);
      const w = new THREE.Mesh(new THREE.BoxGeometry(7.6, 2.4, 6), this.mat(0x24323e, { rough: 0.2, metal: 0.4 })); w.position.set(0, 7.4, -2.6); g.add(w);
      const st = new THREE.Mesh(new THREE.BoxGeometry(1.2, 3.5, 1.2), redM); st.position.set(-2.4, 7.5, 3); g.add(st);
      const st2 = st.clone(); st2.position.x = 2.4; g.add(st2);
      g.visible = false; this.scene.add(g); this.tugs.push(g);
      const lg = new THREE.BufferGeometry(); lg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
      const ln = new THREE.Line(lg, new THREE.LineBasicNodeMaterial({ color: 0xe8d9a0 })); ln.frustumCulled = false; ln.visible = false;
      this.scene.add(ln); this.tugLines.push(ln);
    }
  }

  // ---------------------------------------------------------------- per frame
  setTime(tod: TimeOfDay) {
    if (tod === this.tod) return;
    this.tod = tod;
    const p = TOD[tod], DEG = Math.PI / 180;
    const el = p.sunEl * DEG, az = p.sunAz * DEG;
    this.sunDir.set(Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el));
    const sky = this.sky as unknown as Record<string, { value: number | THREE.Vector3 }>;
    (sky.sunPosition.value as THREE.Vector3).copy(this.sunDir);
    sky.turbidity.value = p.turb; sky.rayleigh.value = p.ray;
    if (sky.cloudCoverage) sky.cloudCoverage.value = p.clouds;
    this.renderer.toneMappingExposure = p.exposure;
    // the physical sky has nothing to show after dusk: a deep navy night sky instead
    this.aboveBg = tod === 'night' ? new THREE.Color(0x0a1420) : null;
    this.aboveFog = new THREE.Fog(p.fog, p.fogD[0], p.fogD[1]);
    this.underFog.color.set(tod === 'night' ? 0x041318 : tod === 'dusk' ? 0x163f47 : 0x1f6670);
    this.submerged = !this.submerged; this.setSubmerged(!this.submerged);   // re-apply for this light
    // key light: the sun, or the moon at night
    this.keyDir = p.sunEl > 0 ? this.sunDir.clone() : new THREE.Vector3(0.55, 0.6, 0.35).normalize();
    this.sun.color.set(p.sun); this.sun.intensity = p.sunI;
    this.hemi.color.set(0x8fa6c4); this.hemi.groundColor.set(0x1a1c20); this.hemi.intensity = p.hemi;
    // image-based lighting from the same sky
    if (this.pmrem) {
      const envScene = new THREE.Scene(), envSky = new SkyMesh();
      const es = envSky as unknown as Record<string, { value: number | THREE.Vector3 }>;
      (es.sunPosition.value as THREE.Vector3).copy(this.sunDir); es.turbidity.value = p.turb; es.rayleigh.value = p.ray;
      if (es.cloudCoverage) es.cloudCoverage.value = p.clouds;
      if (es.showSunDisc) es.showSunDisc.value = 0;
      envSky.scale.setScalar(900); envScene.add(envSky);
      const rt = this.pmrem.fromScene(envScene, 0, 0.5, 2000);
      this.envRT?.dispose(); this.envRT = rt; this.env = rt.texture;
      this.scene.environment = this.env;
      (this.scene as unknown as { environmentIntensity: number }).environmentIntensity = p.env;
      envSky.geometry.dispose();
    }
    if (this.quality === 'low') this.makeWater(); else this.applyWaterTod(p);
    if (this.wake) this.wake.tint.value.setScalar(p.foam);
    for (const m of this.lit) m.emissiveIntensity = p.lit;
    if (this.modelLit) this.modelLit.value = p.lit;
    if (this.sceneryLit) this.sceneryLit.value = p.lit;
    for (const l of this.navLights) l.visible = tod !== 'day';
    for (const l of this.lamps) l.visible = tod !== 'day';
  }
  private keyDir = new THREE.Vector3(0.5, 0.6, 0.5).normalize();
  private updateBubbles(dt: number, rpm: number[]) {
    const B = this.bub, m = new THREE.Matrix4(), wp = new THREE.Vector3(), dir = new THREE.Vector3(), q = new THREE.Quaternion();
    this.pods.forEach((pd, i) => {
      const r = Math.abs(rpm[i] ?? 0); if (r < 0.05 || dt <= 0) return;
      pd.prop.getWorldPosition(wp); pd.yaw.getWorldQuaternion(q);
      dir.set(0, 0, (rpm[i] ?? 0) >= 0 ? 1 : -1).applyQuaternion(q);       // the jet leaves opposite to the pull
      const R = (SHIP.pods[i]?.D ?? 6) / 2;
      B.acc[i] += (18 + 80 * r) * dt;
      while (B.acc[i] >= 1) {
        B.acc[i] -= 1;
        const k = B.next; B.next = (B.next + 1) % 600;
        const a = Math.random() * Math.PI * 2, rr = R * (0.55 + 0.45 * Math.random());
        // a point on the blade-tip circle (tip vortices cavitate first)
        const t = new THREE.Vector3(Math.cos(a) * rr, Math.sin(a) * rr, 0).applyQuaternion(q);
        B.p[k * 3] = wp.x + t.x; B.p[k * 3 + 1] = wp.y + t.y; B.p[k * 3 + 2] = wp.z + t.z;
        const vj = 2 + 7 * r;
        B.v[k * 3] = dir.x * vj + (Math.random() - 0.5); B.v[k * 3 + 1] = 0.4 + Math.random() * 0.5; B.v[k * 3 + 2] = dir.z * vj + (Math.random() - 0.5);
        B.age[k] = 0;
      }
    });
    for (let k = 0; k < 600; k++) {
      if (B.age[k] > 3) { m.makeScale(0, 0, 0); this.bubbles.setMatrixAt(k, m); continue; }
      B.age[k] += dt;
      const drag = Math.exp(-dt / 1.2);
      B.p[k * 3] += B.v[k * 3] * dt; B.p[k * 3 + 1] = Math.min(-0.05, B.p[k * 3 + 1] + B.v[k * 3 + 1] * dt); B.p[k * 3 + 2] += B.v[k * 3 + 2] * dt;
      B.v[k * 3] *= drag; B.v[k * 3 + 2] *= drag;
      const sz = 0.04 + 0.09 * Math.min(1, B.age[k] / 1.5);
      m.makeScale(sz, sz, sz); m.setPosition(B.p[k * 3], B.p[k * 3 + 1], B.p[k * 3 + 2]);
      this.bubbles.setMatrixAt(k, m);
    }
    this.bubbles.instanceMatrix.needsUpdate = true;
  }
  private setSubmerged(on: boolean) {
    if (on === this.submerged && this.scene.fog) return;
    this.submerged = on;
    const night = this.tod === 'night';
    this.sky.visible = !on && !night;
    if (this.water) this.water.mesh.visible = !on;
    this.underSurf.visible = on; this.seabed.visible = on; this.bubbles.visible = on;
    this.scene.fog = on ? this.underFog : this.aboveFog;
    this.scene.background = on ? this.underFog.color : this.aboveBg;
  }

  render() {
    const rt = S.rt, st = rt.state, psi = st.psi;
    const now = performance.now(), dtReal = this.lastT ? Math.min(0.1, (now - this.lastT) / 1000) : 0;
    this.lastT = now;
    const simDt = S.paused ? 0 : dtReal * SPEEDS[S.speedIdx];
    const c = Math.cos(psi), s = Math.sin(psi);
    const w2 = (x: number, y: number, z = 0) => tp(st.n + x * c - y * s, st.e + x * s + y * c, z);
    // own ship: true pose (out of the window is reality, not the sensor estimate); squat as sinkage
    this.ship.position.set(st.e, -(rt.world.squat ?? 0), -st.n);
    this.ship.rotation.y = -psi;
    this.ship.rotation.z = -(rt.roll?.phi ?? 0);
    rt.traffic.forEach((tr, k) => { const g = this.trafficG[k]; if (!g) return; g.position.set(tr.st.e, 0, -tr.st.n); g.rotation.y = -tr.st.psi; });
    const esc = rt.escort;
    this.other.visible = !!esc;
    if (esc && this.towLine) {
      this.other.position.set(esc.st.e, 0, -esc.st.n); this.other.rotation.y = -esc.st.psi;
      const l = esc.line, line = this.towLine, pos = line.geometry.getAttribute('position') as THREE.BufferAttribute;
      line.visible = !l.parted && l.mode !== 'released';
      const ce = Math.cos(esc.st.psi), se = Math.sin(esc.st.psi);
      const a = w2(l.fairTug[0], l.fairTug[1], SHIP.T * 0 + l.hTug);
      const b = tp(esc.st.n + l.fairShip[0] * ce, esc.st.e + l.fairShip[0] * se, esc.spec.look.freeboard + 1);
      const span = a.distanceTo(b), sag = Math.max(0, (1 - l.T / (0.15 * l.brake)) * span * 0.08);
      for (let k = 0; k <= 16; k++) { const f = k / 16; pos.setXYZ(k, a.x + (b.x - a.x) * f, a.y + (b.y - a.y) * f - sag * 4 * f * (1 - f), a.z + (b.z - a.z) * f); }
      pos.needsUpdate = true;
    }

    // fenders: cone length shrinks with the deflection reported by the contact model this step
    const defl = new Map(rt.ci.fenders.map(f => [f.i, f.defl]));
    const LH = S.sc.landHeight ?? 2;
    this.fenders.forEach((m, i) => {
      const f = m.userData.f as { n: number; e: number; nn: number; ne: number; height: number };
      const d = Math.min(f.height * 0.85, defl.get(i) ?? 0), len = f.height - d;
      m.scale.z = len;
      m.position.copy(tp(f.n - f.nn * (d + len / 2), f.e - f.ne * (d + len / 2), LH - 1.6));
    });

    // mooring lines: catenary-ish sag from tension
    const fb = SHIP.look.freeboard;
    rt.lines.forEach((l, i) => {
      const obj = this.lines[i]; if (!obj) return;
      obj.visible = l.state === 'fast';
      if (!obj.visible) return;
      const a = w2(l.fair[0], l.fair[1], fb - 0.5), [bn, be] = S.sc.bollards[l.bollard], b = tp(bn, be, LH + 0.8);
      const len = a.distanceTo(b), sag = len * (l.T < 2e4 ? 0.08 : l.T < 1.5e5 ? 0.03 : 0.006);
      const pos = obj.geometry.getAttribute('position') as THREE.BufferAttribute;
      for (let k = 0; k <= 16; k++) {
        const t = k / 16, p = a.clone().lerp(b, t); p.y -= 4 * sag * t * (1 - t);
        pos.setXYZ(k, p.x, Math.max(p.y, 0.05), p.z);
      }
      pos.needsUpdate = true;
      const r = Math.min(1, l.T / LINE.MBL);
      (obj.material as THREE.LineBasicNodeMaterial).color.setRGB(0.91, 0.85 - r * 0.6, 0.63 - r * 0.55);
    });

    // tugs: alongside when pushing, out on a line when pulling, hidden when not engaged
    rt.tugs.forEach((t, i) => {
      const g = this.tugs[i], ln = this.tugLines[i]; if (!g) return;
      const on = t.order !== 0 || Math.abs(t.F) > 1e3 || t.repos > 0;
      g.visible = on; ln.visible = false;
      if (!on) return;
      const pulling = t.F * t.side > 1e3 || (t.order < 0 && t.repos <= 0);
      const off = pulling ? 45 : SHIP.B / 2 + 16.5;
      const p = w2(t.x, t.side * off);
      g.position.set(p.x, 0, p.z);
      // tug bow toward the ship when pushing, away from it when pulling (NED heading of the tug bow)
      const hd = psi + Math.PI / 2 + (t.side > 0 ? Math.PI : 0) + (pulling ? Math.PI : 0);
      g.rotation.y = -hd;
      if (pulling) {
        const a = w2(t.x, t.side * (SHIP.B / 2 - 0.5), fb), b = w2(t.x, t.side * (off - 14), 2.5);
        const pos = ln.geometry.getAttribute('position') as THREE.BufferAttribute;
        pos.setXYZ(0, a.x, a.y, a.z); pos.setXYZ(1, b.x, b.y, b.z); pos.needsUpdate = true; ln.visible = true;
      }
    });

    // predicted track (as set), with the hull outline at the end of the horizon
    const tr = S.pred.mode ? S.pred.tracks.find(t => t.alt === 'current') : undefined;
    this.track.visible = this.trackEnd.visible = !!tr && tr.poses.length > 1;
    if (tr && tr.poses.length > 1) {
      this.track.geometry.setFromPoints(tr.poses.map(p => tp(p.n, p.e, 0.6)));
      const e = tr.poses[tr.poses.length - 1], ce = Math.cos(e.psi), se = Math.sin(e.psi);
      this.trackEnd.geometry.setFromPoints([...HULL, HULL[0]].map(([x, y]) => tp(e.n + x * ce - y * se, e.e + x * se + y * ce, 0.6)));
    }

    // foam: pod wash, thruster jets, bow wave, stern wake
    if (this.wake) {
      const [hxa, hxb] = hullX();
      this.wake.update(rt, SHIP, simDt, halfB, hxb, hxa);
    }
    // key light and its shadow box ride with the ship
    this.sun.position.set(st.e + this.keyDir.x * 1500, this.keyDir.y * 1500, -st.n + this.keyDir.z * 1500);
    this.sun.target.position.set(st.e, 0, -st.n);

    // pods: azimuth and propeller from the actual (lagging) pod state
    this.pods.forEach((pd, i) => {
      const ps = st.pods[i], spec = SHIP.pods[i]; if (!ps || !spec) return;
      if (spec.kind === 'vsp') { pd.spin += 1.2 * 2 * Math.PI * simDt * (i ? -1 : 1); pd.prop.rotation.y = pd.spin; return; }   // rotor runs at constant speed
      if (spec.kind === 'waterjet') {
        pd.yaw.rotation.y = ps.alpha + spec.alphaOffset;
        pd.prop.rotation.x = (1 - (ps.bucket ?? 1)) / 2 * 1.25;       // hood swings down over the nozzle exit
        return;
      }
      if (spec.kind === 'shaft') {
        if (pd.rudder) pd.rudder.rotation.y = ps.alpha;
        pd.spin -= ps.rpm * spec.shaft!.engine.n * 2 * Math.PI * simDt * spec.shaft!.prop.hand;   // actual shaft speed
        pd.prop.rotation.z = pd.spin;
        return;
      }
      pd.yaw.rotation.y = -(ps.alpha + spec.alphaOffset);
      pd.spin += ps.rpm * (140 / 60) * 2 * Math.PI * simDt * (i ? -1 : 1);   // ~140 rpm at 100 %, outward-turning pair
      pd.prop.rotation.z = pd.spin;
    });
    this.placeCamera(w2, psi);
    this.setSubmerged(this.camera.position.y < -0.2);
    if (this.submerged) {
      this.updateBubbles(simDt, st.pods.map(p => p.pitch ?? p.rpm));
      const dep = isFinite(rt.depthHere) ? rt.depthHere : 30;
      this.seabed.position.set(st.e, -dep, -st.n);
      this.underSurf.position.set(this.camera.position.x, -0.02, this.camera.position.z);
    }
    this.sky.position.copy(this.camera.position);
    if (this.pipeline) {
      this.preCam.copy(this.camera); this.preCam.layers.set(0);
      this.pipeline.render();
    } else this.renderer.render(this.scene, this.camera);
  }

  private placeCamera(w2: (x: number, y: number, z?: number) => THREE.Vector3, psi: number) {
    const lk = this.look[this.cam], cam = this.camera;
    const yaw = lk.yaw * Math.PI / 180, pitch = lk.pitch * Math.PI / 180;
    const fov = 55 / lk.zoom;
    if (Math.abs(cam.fov - fov) > 0.01) { cam.fov = fov; cam.updateProjectionMatrix(); }
    if (this.cam === 'chase' || this.cam === 'pods') {
      // above water the camera orbits the whole ship; dragged below the surface it closes in on
      // the pods (water visibility is tens of metres), like a diver behind the stern
      const t = this.cam === 'pods' ? 1 : 1 - THREE.MathUtils.smoothstep(lk.pitch, -6, 6);
      const under = 1 - t;
      const podX = SHIP.pods.reduce((a, p) => a + p.x, 0) / SHIP.pods.length;
      const dAbove = SHIP.L * 1.25 / Math.max(0.4, lk.zoom ** 0.7), dBelow = 32 / Math.max(0.4, lk.zoom ** 0.8);
      const d = dAbove * under + dBelow * t;
      const tx = podX * t, tz = SHIP.look.freeboard * under + this.podDepth * t;
      const x = tx + Math.cos(pitch) * Math.cos(yaw) * d, y = Math.cos(pitch) * Math.sin(yaw) * d;
      const floor = -(isFinite(S.rt.depthHere) ? S.rt.depthHere : 30) + 0.8;
      const z = Math.max(floor, tz + Math.sin(pitch) * d);
      cam.position.copy(w2(x, y, t > 0.5 ? Math.min(-0.6, z) : Math.max(3, z)));
      cam.lookAt(w2(tx, 0, tz));
      if (cam.fov !== 50) { cam.fov = 50; cam.updateProjectionMatrix(); }
      return;
    }
    const eye = this.ship.userData.eyeH as number;
    const half = SHIP.B / 2 + SHIP.look.wingOut + 0.4;   // leaning over the wing bulwark
    const bx = SHIP.bridgeX, front = bx + SHIP.look.bridgeLen / 2 - 0.8;
    const pos = this.cam === 'bridge' ? w2(front, 0, eye) : w2(bx, this.cam === 'port' ? -half : half, eye);
    cam.position.copy(pos);
    // look direction in the body frame → world
    const dx = Math.cos(pitch) * Math.cos(yaw), dy = Math.cos(pitch) * Math.sin(yaw), dz = Math.sin(pitch);
    const c = Math.cos(psi), s = Math.sin(psi);
    const dn = dx * c - dy * s, de = dx * s + dy * c;
    cam.lookAt(pos.x + de, pos.y + dz, pos.z - dn);
  }

  drag(dxPx: number, dyPx: number, hPx: number) {
    const lk = this.look[this.cam], k = 55 / lk.zoom / Math.max(200, hPx);
    lk.yaw -= dxPx * k;
    if (this.cam === 'chase' || this.cam === 'pods') {
      // drag down to lower the camera (below the surface to watch the pods), up to raise it
      lk.pitch = Math.max(-50, Math.min(80, lk.pitch - dyPx * k));
      if (this.cam === 'pods') lk.pitch = Math.min(-2, lk.pitch);
      return;
    }
    lk.pitch = Math.max(-80, Math.min(50, lk.pitch + dyPx * k));
  }
  zoomBy(f: number) {
    const lk = this.look[this.cam];
    const orbit = this.cam === 'chase' || this.cam === 'pods';
    lk.zoom = Math.max(orbit ? 0.35 : 1, Math.min(orbit ? 3 : 7, lk.zoom * f));
  }
  resetLook() {
    const d: Record<CamName, { yaw: number; pitch: number }> = { bridge: { yaw: 0, pitch: -9 }, port: { yaw: -150, pitch: -30 }, stbd: { yaw: 150, pitch: -30 }, chase: { yaw: -150, pitch: 22 }, pods: { yaw: -165, pitch: -4 } };
    Object.assign(this.look[this.cam], d[this.cam], { zoom: 1 });
  }
}

export async function createView(canvas: HTMLCanvasElement) {
  const v = new View3D(canvas);
  await v.init();
  return v;
}
