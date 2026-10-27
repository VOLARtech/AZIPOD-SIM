// Restricted-water effects: depth field, squat, grounding, bank suction, pod wash reflection.
import { G, KN, RHO, ShipSpec } from './ship';
import type { Obstacle, Pt } from './contact';
import type { ShipState, Wrench } from './sim';

export interface Shoal { poly: Pt[]; depth: number; label?: string }
export type DepthField = (n: number, e: number) => number;

function inPoly(n: number, e: number, poly: Pt[]) {
  let ins = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [ni, ei] = poly[i], [nj, ej] = poly[j];
    if ((ei > e) !== (ej > e) && n < (nj - ni) * (e - ei) / (ej - ei) + ni) ins = !ins;
  }
  return ins;
}
export function depthField(base: number, shoals: Shoal[]): DepthField {
  return (n, e) => {
    let d = base;
    for (const s of shoals) if (s.depth < d && inPoly(n, e, s.poly)) d = s.depth;
    return d;
  };
}

/** Barrass squat [m]: Cb·V²/100 in open water, rising toward Cb·V²/50 in confined water (V in kn). */
export function squat(spec: ShipSpec, speed: number, depth: number, confined = 0) {
  if (!isFinite(depth)) return 0;
  const V = Math.abs(speed) / KN;
  const hT = depth / spec.T;
  const shallow = hT < 1.5 ? 1 : hT > 4 ? 0 : (4 - hT) / 2.5; // effect fades out in deep water
  return shallow * spec.Cb * V * V / (100 - 50 * confined);
}

/** Sample points along the keel for grounding checks (body x). */
export function keelPoints(spec: ShipSpec): number[] {
  const L = spec.L;
  return [L / 2 - 6, L / 4, 0, -L / 4, -L / 2 + 4].map(x => x - spec.xg);
}

/** Grounding: soft-bottom penetration → large friction against motion at aground points. */
export function groundingForces(spec: ShipSpec, st: ShipState, depthAt: DepthField, sq: number) {
  const c = Math.cos(st.psi), s = Math.sin(st.psi);
  let X = 0, Y = 0, N = 0, maxPen = 0;
  const kg = RHO * G * spec.L * spec.B / 5; // N per m penetration per point (≈ lost buoyancy)
  for (const x of keelPoints(spec)) {
    const pn = st.n + x * c, pe = st.e + x * s;
    const draught = spec.T + sq * (x > 0 ? 1.15 : 0.85);   // fine-ish hull squats by the head
    const pen = draught - depthAt(pn, pe);
    if (pen <= 0) continue;
    maxPen = Math.max(maxPen, pen);
    const vx = st.u, vy = st.v + st.r * x, vm = Math.hypot(vx, vy);
    const F = 0.45 * kg * pen;
    const fx = -F * vx / (vm + 0.05), fy = -F * vy / (vm + 0.05);
    X += fx; Y += fy; N += x * fy;
  }
  return { X, Y, N, maxPen };
}

function closestOnPoly(pn: number, pe: number, poly: Pt[]): [number, number, number] {
  let best = Infinity, bn = 0, be = 0;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [an, ae] = poly[j], [cn, ce] = poly[i];
    const dn = cn - an, de = ce - ae, l2 = dn * dn + de * de || 1;
    const t = Math.max(0, Math.min(1, ((pn - an) * dn + (pe - ae) * de) / l2));
    const qn = an + t * dn, qe = ae + t * de, d = (pn - qn) ** 2 + (pe - qe) ** 2;
    if (d < best) { best = d; bn = qn; be = qe; }
  }
  return [bn, be, Math.sqrt(best)];
}

/** Nearest structure to a world point: [n, e, distance]. */
export function nearestStructure(pn: number, pe: number, obs: Obstacle[], maxD = 600): [number, number, number] | null {
  let best: [number, number, number] | null = null;
  for (const o of obs) {
    const b = o.bbox;
    if (b && (pn < b[0] - maxD || pn > b[2] + maxD || pe < b[1] - maxD || pe > b[3] + maxD)) continue;
    const r = closestOnPoly(pn, pe, o.poly);
    if (r[2] < maxD && (!best || r[2] < best[2])) best = r;
  }
  return best;
}

/**
 * Bank suction (body-frame wrench). The flow accelerating between hull and bank
 * draws the stern toward the bank and sets the bow off: modelled as a lateral force
 * toward the bank applied at 0.25 L aft, ∝ U², decaying with side clearance,
 * amplified in shallow water.
 */
export function bankEffect(spec: ShipSpec, st: ShipState, obs: Obstacle[], depth: number): Wrench & { side: number; clear: number } {
  const U2 = st.u * st.u;
  const out = { X: 0, Y: 0, N: 0, side: 0, clear: Infinity };
  if (U2 < 0.04 || !obs.length) return out;
  const c = Math.cos(st.psi), s = Math.sin(st.psi);
  const hT = isFinite(depth) ? depth / spec.T : 10;
  const shallow = 1 + 2.5 / (hT * hT);
  let Y = 0;
  for (const side of [-1, 1]) {
    let clear = Infinity;
    for (const x of [spec.L * 0.3, 0, -spec.L * 0.3]) {
      const y = side * spec.B / 2;
      const pn = st.n + x * c - y * s, pe = st.e + x * s + y * c;
      const r = nearestStructure(pn, pe, obs, 3 * spec.B);
      if (!r) continue;
      // only count banks that are abeam (not ahead/astern)
      const dn = r[0] - pn, de = r[1] - pe;
      const lat = -dn * s + de * c;
      if (lat * side <= 0.3 * r[2]) continue;
      clear = Math.min(clear, r[2]);
    }
    if (!isFinite(clear)) continue;
    if (clear < out.clear) { out.clear = clear; out.side = side; }
    const f = 0.5 * RHO * spec.L * spec.T * U2 * 0.018 * shallow * Math.exp(-clear / (0.6 * spec.B));
    Y += side * f;
  }
  out.Y = Y;
  out.N = Y * (-0.25 * spec.L);
  return out;
}

/** Ray–segment intersection distance along unit ray from (pn,pe) dir (dn,de). */
function rayHit(pn: number, pe: number, dn: number, de: number, obs: Obstacle[], maxD: number) {
  let best: { d: number; nn: number; ne: number } | null = null;
  for (const o of obs) for (let i = 0, j = o.poly.length - 1; i < o.poly.length; j = i++) {
    const [an, ae] = o.poly[j], [bn, be] = o.poly[i];
    const sn = bn - an, se = be - ae;
    const den = dn * se - de * sn;
    if (Math.abs(den) < 1e-9) continue;
    const t = ((an - pn) * se - (ae - pe) * sn) / den;
    const u = ((an - pn) * de - (ae - pe) * dn) / den;
    if (t <= 0 || t > maxD || u < 0 || u > 1) continue;
    if (!best || t < best.d) {
      const l = Math.hypot(sn, se); let nn = -se / l, ne = sn / l;
      if (nn * dn + ne * de > 0) { nn = -nn; ne = -ne; }  // normal facing the incoming jet
      best = { d: t, nn, ne };
    }
  }
  return best;
}

/**
 * Pod wash hitting a quay or bank reflects back onto the hull: a force pushing the
 * stern off the wall, strongest close-in and for jets striking square-on.
 */
export function washReflection(spec: ShipSpec, st: ShipState, thrusts: number[], obs: Obstacle[]): Wrench & { hits: { n: number; e: number; f: number }[] } {
  const out = { X: 0, Y: 0, N: 0, hits: [] as { n: number; e: number; f: number }[] };
  const c = Math.cos(st.psi), s = Math.sin(st.psi), R = 70;
  spec.pods.forEach((p, i) => {
    const T = thrusts[i];
    if (Math.abs(T) < 20e3) return;
    const a = st.pods[i].alpha + p.alphaOffset, sg = T > 0 ? -1 : 1;
    const wx = Math.cos(a) * sg, wy = Math.sin(a) * sg;          // wash direction, body
    const dn = wx * c - wy * s, de = wx * s + wy * c;            // wash direction, world
    const pn = st.n + p.x * c - p.y * s, pe = st.e + p.x * s + p.y * c;
    const hit = rayHit(pn, pe, dn, de, obs, R);
    if (!hit) return;
    const square = Math.max(0, -(hit.nn * dn + hit.ne * de));
    const f = 0.32 * Math.abs(T) * (1 - hit.d / R) ** 1.5 * square;
    const fN = f * hit.nn, fE = f * hit.ne;
    const fx = c * fN + s * fE, fy = -s * fN + c * fE;
    out.X += fx; out.Y += fy; out.N += p.x * fy - p.y * fx;
    out.hits.push({ n: pn + dn * hit.d, e: pe + de * hit.d, f });
  });
  return out;
}
