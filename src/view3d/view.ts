// Out-of-the-window 3D view. Loaded on demand (dynamic import) so the 2D chart stays light.
// three.js WebGPURenderer: WebGPU where the browser has it, WebGL2 otherwise (same code path).
// Frames: NED (n, e, down) → three (x = e, y = up, z = −n); body (x fwd, y stbd, z up) → ship group
// local (x = y_b, y = z, z = −x_b), group rotation.y = −psi.
import * as THREE from 'three/webgpu';
import { abs, builtinAOContext, clamp, color, float, fract, mix, mrt, normalLocal, normalView, pass, positionLocal, screenUV, step, uniform } from 'three/tsl';
import { SkyMesh } from 'three/addons/objects/SkyMesh.js';
import { ao } from 'three/addons/tsl/display/GTAONode.js';
import spiritUrl from './spirit.bin?url';
import { makeWater } from './water';
import { Wake } from './wake';
import { SPEEDS } from '../ui/state';
import { SHIP } from '../physics/ship';
import { HULL } from '../physics/contact';
import { LINE } from '../physics/mooring';
import { S } from '../ui/state';

export type CamName = 'bridge' | 'port' | 'stbd' | 'chase';
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
    bridge: { yaw: 0, pitch: -9, zoom: 1 }, port: { yaw: -150, pitch: -30, zoom: 1 },
    stbd: { yaw: 150, pitch: -30, zoom: 1 }, chase: { yaw: -150, pitch: 22, zoom: 1 },
  };
  private harbour = new THREE.Group();
  private ship = new THREE.Group();
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
    this.scene.add(this.sun, this.sun.target, this.hemi, this.harbour, this.ship);

    // physically based sky (Preetham + clouds), follows the camera; layer 1 = not in the AO pre-pass
    this.sky.scale.setScalar(9000);
    this.sky.layers.set(1);
    this.scene.add(this.sky);
    this.camera.layers.enable(1);
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
    const key = S.sc.id + '|' + SHIP.id;
    if (key === this.builtFor) return;
    this.builtFor = key;
    this.lit = []; this.lamps = []; this.navLights = [];
    this.tod = null;
    this.buildHarbour();
    this.buildShip();
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
    if (sc.obstacles.length <= 40) {
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

  private shipGen = 0;
  private buildShip() {
    const g = this.ship; this.clear(g);
    if (SHIP.look.model) { this.buildModelShip(SHIP.look.model, ++this.shipGen); return; }
    const L = SHIP.look, T = SHIP.T, fb = L.freeboard;
    const outline = HULL as [number, number][];
    const boot = Math.min(fb - 1, 3);
    g.add(new THREE.Mesh(prism(outline, -T, boot), this.mat(L.hull, { rough: 0.55 })));
    g.add(new THREE.Mesh(prism(outline, boot, fb), this.mat(L.topsides, { rough: 0.5 })));
    // bulwark top line
    const capM = this.mat(L.accent, { rough: 0.6 });
    const stripeM = this.mat(L.super, { rough: 0.5, map: this.stripe, emissive: 0xffffff, emap: this.stripeLit, lit: true });
    const roofM = this.mat(L.super, { rough: 0.7 });
    let topH = fb;
    const whAft = SHIP.bridgeX - L.bridgeLen / 2;
    for (const d of L.decks) {
      // decks that rise above the wheelhouse must stay abaft it, or they would block the view ahead
      const x1 = d.h > L.bridgeH - 3 ? Math.min(d.x1, whAft) : d.x1;
      if (x1 - d.x0 < 4) continue;
      g.add(new THREE.Mesh(prism(deckOutline(d.x0, x1, d.inset), fb, d.h), [roofM, stripeM]));
      topH = Math.max(topH, d.h);
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
    const fun = new THREE.Mesh(new THREE.BoxGeometry(f.w, 18, f.l), this.mat(L.super, { rough: 0.5 }));
    fun.position.set(0, f.h - 9, -f.x); g.add(fun);
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
    this.ship.userData.eyeH = L.bridgeH - 1.4;
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
    this.sky.visible = tod !== 'night';
    this.scene.background = tod === 'night' ? new THREE.Color(0x0a1420) : null;
    this.scene.fog = new THREE.Fog(p.fog, p.fogD[0], p.fogD[1]);
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
    for (const l of this.navLights) l.visible = tod !== 'day';
    for (const l of this.lamps) l.visible = tod !== 'day';
  }
  private keyDir = new THREE.Vector3(0.5, 0.6, 0.5).normalize();

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

    this.placeCamera(w2, psi);
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
    if (this.cam === 'chase') {
      const d = SHIP.L * 1.25 / Math.max(0.4, lk.zoom ** 0.7);
      const x = Math.cos(pitch) * Math.cos(yaw) * d, y = Math.cos(pitch) * Math.sin(yaw) * d, z = Math.sin(pitch) * d;
      cam.position.copy(w2(x, y, Math.max(3, z)));
      cam.lookAt(w2(0, 0, SHIP.look.freeboard));
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
    lk.pitch = Math.max(-80, Math.min(this.cam === 'chase' ? 80 : 50, lk.pitch + dyPx * k));
    if (this.cam === 'chase') lk.pitch = Math.max(3, lk.pitch);
  }
  zoomBy(f: number) {
    const lk = this.look[this.cam];
    lk.zoom = Math.max(this.cam === 'chase' ? 0.35 : 1, Math.min(this.cam === 'chase' ? 3 : 7, lk.zoom * f));
  }
  resetLook() {
    const d: Record<CamName, { yaw: number; pitch: number }> = { bridge: { yaw: 0, pitch: -9 }, port: { yaw: -150, pitch: -30 }, stbd: { yaw: 150, pitch: -30 }, chase: { yaw: -150, pitch: 22 } };
    Object.assign(this.look[this.cam], d[this.cam], { zoom: 1 });
  }
}

export async function createView(canvas: HTMLCanvasElement) {
  const v = new View3D(canvas);
  await v.init();
  return v;
}
