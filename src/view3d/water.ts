// Harbour water: layered ripple normals, Fresnel reflection, sun glitter, scattering colour.
// High quality reflects the real scene (planar mirror: ship, quays, sky); low quality reflects
// the sky environment map only, which costs nothing extra on phones.
import * as THREE from 'three/webgpu';
import { Fn, cameraPosition, dot, float, length, max, mix, normalize, pmremTexture, positionWorld, pow, reflect, reflector, texture, time, uniform, vec2, vec3 } from 'three/tsl';

export function makeWater(normals: THREE.Texture, env: THREE.Texture | null, high: boolean) {
  const u = {
    sunDir: uniform(new THREE.Vector3(0.5, 0.6, 0.5).normalize()),
    sunColor: uniform(new THREE.Color(1, 0.95, 0.88)),
    waterColor: uniform(new THREE.Color(0x0f2c33)),
  };
  const geo = new THREE.PlaneGeometry(16000, 16000);   // mesh rotated (not the geometry): the mirror plane follows the mesh
  const mat = new THREE.MeshBasicNodeMaterial();
  const mesh = new THREE.Mesh(geo, mat);
  mesh.rotation.x = -Math.PI / 2;

  const noise = (p: ReturnType<typeof vec2>) => {
    const t = time;
    const s0 = texture(normals, p.div(41).add(vec2(t.div(53), t.div(71))));
    const s1 = texture(normals, p.div(17).sub(vec2(t.div(-37), t.div(29))));
    const s2 = texture(normals, p.div(6.3).add(vec2(t.div(19), t.div(-23))));
    const s3 = texture(normals, p.div(173).sub(vec2(t.div(211), t.div(-197))));
    return s0.add(s1).add(s2.mul(0.6)).add(s3).mul(2 / 3.6).sub(1);
  };
  const n = noise(vec2(positionWorld.x, positionWorld.z));
  const surfaceNormal = normalize(vec3(n.x.mul(0.075), float(1), n.y.mul(0.075)));
  const eye = normalize(cameraPosition.sub(positionWorld));
  const dist = length(cameraPosition.sub(positionWorld));
  // calmer looking far away (ripples average out), sharper close by
  const nrm = normalize(mix(surfaceNormal, vec3(0, 1, 0), dist.div(1800).min(0.75)));
  const theta = max(dot(eye, nrm), 0);
  const fresnel = pow(float(1).sub(theta), 5).mul(0.98).add(0.02);
  const sunRef = normalize(reflect(u.sunDir.negate(), nrm));
  const spec = pow(max(dot(eye, sunRef), 0), 400).mul(u.sunColor).mul(4);
  const scatter = u.waterColor.mul(max(u.sunDir.y, 0.05).mul(0.9).add(0.15));

  mat.colorNode = Fn(() => {
    let refl;
    if (high) {
      const mirror = reflector({ resolutionScale: 0.5 });
      const distortion = nrm.xz.mul(float(0.001).add(float(1).div(dist))).mul(26);
      mirror.uvNode = mirror.uvNode!.add(distortion);
      mesh.add(mirror.target);
      refl = mirror.rgb.mul(0.85);
    } else {
      const r = reflect(eye.negate(), nrm);
      refl = env ? pmremTexture(env, vec3(r.x, max(r.y, 0.02), r.z), float(0.18)).rgb : vec3(0.5, 0.6, 0.7);
    }
    return mix(scatter, refl.add(spec), fresnel);
  })();
  return { mesh, u };
}
