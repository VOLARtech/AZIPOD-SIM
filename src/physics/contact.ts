// Penalty contact between the waterline polygon and fixed obstacles.
// Spring–damper normal force + regularised Coulomb friction, at every
// penetrating vertex (hull vertex in obstacle, or obstacle corner in hull).
import type { ShipState } from './sim';

export type Pt = [number, number]; // [n, e]
export interface Obstacle {
  poly: Pt[];            // NED vertices
  k: number;             // contact stiffness per point [N/m]
  c: number;             // damping per point [N·s/m]
  mu: number;            // friction
  unload: number;        // unloading/loading force ratio (hysteresis); e ≈ √unload
  kind: 'quay' | 'fendered' | 'bank' | 'pier';
  bbox?: [number, number, number, number];
}

export interface ContactInfo {
  active: boolean;
  points: { n: number; e: number; vn: number; F: number }[];
  fenders: { i: number; defl: number; F: number }[];    // loaded fenders this step
}

/** Discrete fender unit (cone/cell type) on a quay face. */
export interface Fender {
  n: number; e: number;            // centre of the uncompressed front panel
  nn: number; ne: number;          // unit normal, pointing out into the water
  width: number;                   // panel width along the face [m]
  height: number;                  // uncompressed projection [m]
  Rr: number;                      // rated reaction at rated deflection [N]
  Er: number;                      // rated energy absorption [J]
  dRated: number;                  // rated deflection, fraction of height
  mu: number;
}

// Normalised reaction curve of a buckling cone fender, R/Rr vs δ/δrated (manufacturer-style).
const CURVE: [number, number][] = [[0, 0], [0.2, 0.62], [0.4, 0.95], [0.5, 1.0], [0.7, 0.93], [0.9, 0.96], [1.0, 1.0], [1.08, 1.35], [1.2, 3.0], [1.4, 9.0]];
export function fenderReaction(f: Fender, defl: number): number {
  const x = defl / (f.dRated * f.height);
  if (x <= 0) return 0;
  for (let i = 1; i < CURVE.length; i++) {
    if (x <= CURVE[i][0]) {
      const [x0, y0] = CURVE[i - 1], [x1, y1] = CURVE[i];
      return f.Rr * (y0 + (y1 - y0) * (x - x0) / (x1 - x0));
    }
  }
  const [xa, ya] = CURVE[CURVE.length - 2], [xb, yb] = CURVE[CURVE.length - 1];
  return f.Rr * (yb + (yb - ya) / (xb - xa) * (x - xb));
}

// Waterline outline, body frame [x fwd, y stbd] about CG. Set by setHull().
export let HULL: [number, number][] = [];
export function buildHull(L: number, B: number, xg: number, LOA = L + 5): [number, number][] {
  // waterline outline: transom aft, parallel body, faired bow (overhang = LOA − Lpp, mostly forward)
  const over = Math.max(5, LOA - L);
  const pts: [number, number][] = [];
  const xs = -L / 2 - over * 0.2, xb = L / 2 + over * 0.8, xm1 = -L / 2 + 0.17 * L, xm2 = L * 0.12;
  const half = B / 2;
  const side: [number, number][] = [];
  for (let i = 0; i <= 26; i++) {
    const x = xs + (xb - xs) * (i / 26);
    let y: number;
    if (x > xm2) { const t = (x - xm2) / (xb - xm2); y = half * Math.pow(Math.max(0, 1 - t * t), 0.75); }
    else if (x < xm1) { const t = (xm1 - x) / (xm1 - xs); y = half * (1 - 0.14 * t * t); }
    else y = half;
    side.push([x - xg, y]);
  }
  for (const p of side) pts.push([p[0], p[1]]);
  for (let i = side.length - 2; i >= 0; i--) pts.push([side[i][0], -side[i][1]]);
  return pts;
}
export function setHull(h: [number, number][]) { HULL = h; }

export function bboxOf(poly: Pt[]): [number, number, number, number] {
  let a = Infinity, b = Infinity, c = -Infinity, d = -Infinity;
  for (const [n, e] of poly) { a = Math.min(a, n); b = Math.min(b, e); c = Math.max(c, n); d = Math.max(d, e); }
  return [a, b, c, d];
}

function inside(p: Pt, poly: Pt[]) {
  let ins = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [ni, ei] = poly[i], [nj, ej] = poly[j];
    if ((ei > p[1]) !== (ej > p[1]) && p[0] < (nj - ni) * (p[1] - ei) / (ej - ei) + ni) ins = !ins;
  }
  return ins;
}
function closest(p: Pt, poly: Pt[]): [number, number, number] {
  let best = Infinity, bn = 0, be = 0;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [an, ae] = poly[j], [bn2, be2] = poly[i];
    const dn = bn2 - an, de = be2 - ae, l2 = dn * dn + de * de || 1;
    const t = Math.max(0, Math.min(1, ((p[0] - an) * dn + (p[1] - ae) * de) / l2));
    const qn = an + t * dn, qe = ae + t * de, d = (p[0] - qn) ** 2 + (p[1] - qe) ** 2;
    if (d < best) { best = d; bn = qn; be = qe; }
  }
  return [bn, be, Math.sqrt(best)];
}

export function hullWorld(st: ShipState): Pt[] {
  const c = Math.cos(st.psi), s = Math.sin(st.psi);
  return HULL.map(([x, y]) => [st.n + x * c - y * s, st.e + x * s + y * c]);
}

export function contactForces(st: ShipState, obs: Obstacle[], fenders: Fender[] | null, ci?: ContactInfo) {
  const c = Math.cos(st.psi), s = Math.sin(st.psi);
  let X = 0, Y = 0, N = 0;
  if (ci) { ci.active = false; ci.points.length = 0; ci.fenders.length = 0; }
  const hw = hullWorld(st);
  const hb = bboxOf(hw);
  // ground velocity of a world point on the hull
  const vel = (pn: number, pe: number): Pt => {
    const dn = pn - st.n, de = pe - st.e;
    const vN = c * st.u - s * st.v, vE = s * st.u + c * st.v;
    return [vN - st.r * de, vE + st.r * dn];
  };
  const apply = (pn: number, pe: number, FN: number, FE: number) => {
    const fx = c * FN + s * FE, fy = -s * FN + c * FE;
    const dn = pn - st.n, de = pe - st.e;
    const x = c * dn + s * de, y = -s * dn + c * de;
    X += fx; Y += fy; N += x * fy - y * fx;
  };
  const resolve = (pn: number, pe: number, nN: number, nE: number, d: number, o: Obstacle) => {
    // n = unit normal pushing the hull out; d = penetration
    const [vN, vE] = vel(pn, pe);
    const vn = vN * nN + vE * nE;              // >0 separating
    // loading (vn<0): full stiffness; unloading: reduced → energy lost (crushing, rubber hysteresis)
    const load = 1 / (1 + Math.exp(vn / 0.01));
    const kEff = o.k * (o.unload + (1 - o.unload) * load);
    const Fn = Math.max(0, kEff * d - o.c * vn);
    if (Fn <= 0) return;
    const tN = vN - vn * nN, tE = vE - vn * nE, tm = Math.hypot(tN, tE);
    const fr = o.mu * Fn / (tm + 0.03);
    apply(pn, pe, Fn * nN - fr * tN, Fn * nE - fr * tE);
    if (ci) { ci.active = true; ci.points.push({ n: pn, e: pe, vn, F: Fn }); }
  };
  for (const o of obs) {
    const b = o.bbox ?? (o.bbox = bboxOf(o.poly));
    if (b[0] > hb[2] || b[2] < hb[0] || b[1] > hb[3] || b[3] < hb[1]) continue;
    for (const p of hw) {
      if (p[0] < b[0] || p[0] > b[2] || p[1] < b[1] || p[1] > b[3]) continue;
      if (!inside(p, o.poly)) continue;
      const [qn, qe, d] = closest(p, o.poly);
      if (d < 1e-6) continue;
      resolve(p[0], p[1], (qn - p[0]) / d, (qe - p[1]) / d, d, o);
    }
    for (const p of o.poly) {
      if (p[0] < hb[0] || p[0] > hb[2] || p[1] < hb[1] || p[1] > hb[3]) continue;
      if (!inside(p, hw)) continue;
      const [qn, qe, d] = closest(p, hw);
      if (d < 1e-6) continue;
      // hull must move away from the corner: −(outward hull normal)
      resolve(p[0], p[1], -(qn - p[0]) / d, -(qe - p[1]) / d, d, o);
    }
  }
  if (fenders) {
    for (let i = 0; i < fenders.length; i++) {
      const f = fenders[i];
      if (f.n < hb[0] - 3 || f.n > hb[2] + 3 || f.e < hb[1] - 3 || f.e > hb[3] + 3) continue;
      // deepest point of the panel inside the hull (centre and both ends)
      const tN = -f.ne, tE = f.nn;
      let best = 0, bn = 0, be = 0;
      for (const s2 of [-0.5, 0, 0.5]) {
        const p: Pt = [f.n + tN * f.width * s2, f.e + tE * f.width * s2];
        if (!inside(p, hw)) continue;
        const [, , d] = closest(p, hw);
        if (d > best) { best = d; bn = p[0]; be = p[1]; }
      }
      if (best <= 0) continue;
      const [vN, vE] = vel(bn, be);
      const vn = vN * f.nn + vE * f.ne;      // >0 hull moving off the fender
      // rubber hysteresis: unloading reaction ≈ 55 % of loading
      const R = fenderReaction(f, best) * (0.55 + 0.45 / (1 + Math.exp(vn / 0.005)));
      const Fn = Math.max(0, R - 0.02 * f.Rr * vn / 0.1);
      const tvN = vN - vn * f.nn, tvE = vE - vn * f.ne, tm = Math.hypot(tvN, tvE);
      const fr = f.mu * Fn / (tm + 0.03);
      apply(bn, be, Fn * f.nn - fr * tvN, Fn * f.ne - fr * tvE);
      if (ci) { ci.active = true; ci.points.push({ n: bn, e: be, vn, F: Fn }); ci.fenders.push({ i, defl: best, F: Fn }); }
    }
  }
  return { X, Y, N };
}
