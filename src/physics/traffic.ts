// Other ships in the scenario, and the hydrodynamic interaction between them and own ship.
// Traffic holds its track and speed (a pilot on board, not reacting to you).
//
// Passing-ship interaction: the pressure field round a moving hull (high at the bow and stern,
// low along the parallel body) acts on a ship close alongside. Model tests (Varyani, Thavalingam &
// Krishnankutty 2004; Vantorre, Verzhbitskaya & Laforce 2002) show the same shape whatever the
// pair: in sway, attraction while the ships are abeam and repulsion with bow to bow or stern to
// stern; in yaw, the bow is pushed away as the other ship approaches it, then drawn toward the
// other's stern. Forces scale with the speed squared, fall off with the gap between the hulls, and
// grow sharply in shallow water. The shape functions here are of that form with amplitudes typical
// of the published tests at these gaps, not a fit to one data set.
import { RHO, ShipSpec } from './ship';
import { buildHull } from './contact';
import type { Wrench } from './sim';

export interface TrafficSetup { ship: string; label: string; start: { n: number; e: number; psi: number; kn: number } }

export class Traffic {
  st: { n: number; e: number; psi: number; u: number; v: number; r: number; t: number; pods: { alpha: number; rpm: number }[] };
  hull: [number, number][];
  constructor(public spec: ShipSpec, public setup: TrafficSetup) {
    const s = setup.start;
    this.st = { n: s.n, e: s.e, psi: s.psi * Math.PI / 180, u: s.kn * 0.514444, v: 0, r: 0, t: 0, pods: spec.pods.map(() => ({ alpha: 0, rpm: 0.6 })) };
    this.hull = buildHull(spec.L, spec.B, spec.xg, spec.LOA);
  }
  step(dt: number) {
    const s = this.st;
    s.n += s.u * Math.cos(s.psi) * dt; s.e += s.u * Math.sin(s.psi) * dt; s.t += dt;
  }
}

/** Relative position of b in a's body axes, and the clear gap between their sides. */
export function relPos(a: { n: number; e: number; psi: number }, b: { n: number; e: number }) {
  const dn = b.n - a.n, de = b.e - a.e, c = Math.cos(a.psi), s = Math.sin(a.psi);
  return { dx: c * dn + s * de, dy: -s * dn + c * de };
}

/**
 * Interaction force on ship 1 (body axes about its origin) from ship 2 passing on a near-parallel course.
 * depth: water depth (Infinity = deep).
 */
export function interaction(s1: ShipSpec, a: { n: number; e: number; psi: number; u: number }, s2: ShipSpec, b: { n: number; e: number; psi: number; u: number }, depth: number): Wrench & { xi: number; gap: number } {
  const zero = { X: 0, Y: 0, N: 0, xi: NaN, gap: NaN };
  const par = Math.cos(b.psi - a.psi);
  if (Math.abs(par) < 0.7) return zero;                       // crossing, not passing
  const { dx, dy } = relPos(a, b);
  const xi = dx / ((s1.L + s2.L) / 2);
  if (Math.abs(xi) > 2.2) return zero;
  const Bm = (s1.B + s2.B) / 2, gap = Math.abs(dy) - Bm;
  const g = (Bm / (Math.max(gap, 0.1 * Bm) + Bm)) ** 2;      // falls off with the clear gap
  const r = Math.sqrt((s2.B * s2.T) / (s1.B * s1.T));         // a bigger ship pushes harder
  const fh = isFinite(depth) ? 1 + 1.5 * (s1.T / depth) ** 2 : 1;
  // the other ship's pressure field (her speed), and own ship's own field reflected off her hull
  const U2 = b.u * b.u + 0.5 * a.u * a.u;
  const Q = 0.5 * RHO * s1.L * s1.T * U2 * g * r * fh;
  const side = Math.sign(dy) || 1, env = Math.exp(-(xi * xi) / 0.9);
  const Y = side * 0.012 * Q * Math.cos(Math.PI * xi) * env;           // + = toward the other ship
  const N = -side * 0.003 * Q * s1.L * Math.sin(Math.PI * xi) * env;   // bow away as she comes up on the bow
  return { X: -0.002 * Q * Math.sin(Math.PI * xi) * env * Math.sign(par), Y, N, xi, gap };
}

/** Do the two hulls overlap? (Own hull outline points tested against the other's waterline rectangle.) */
export function hullsTouch(h1: [number, number][], a: { n: number; e: number; psi: number }, s2: ShipSpec, b: { n: number; e: number; psi: number }) {
  const c = Math.cos(a.psi), s = Math.sin(a.psi);
  for (const [x, y] of h1) {
    const n = a.n + x * c - y * s, e = a.e + x * s + y * c;
    const p = relPos(b, { n, e }), px = p.dx + s2.xg;
    if (Math.abs(px) < s2.L / 2 && Math.abs(p.dy) < s2.B / 2 * Math.min(1, 1.25 * (1 - (2 * px / s2.L) ** 8))) return true;
  }
  return false;
}
