// Towline between a tug (own ship) and the ship she is working: a stiff synthetic line
// (HMPE) between two moving fairleads, with the tug's towing winch: brake (renders above its
// holding load), render (pays out at a set tension), heave, pay out and quick release.
// The force on the tug is evaluated inside its integrator; the ship gets the reaction.
import type { ShipState, Wrench } from './sim';

export type TowMode = 'brake' | 'render' | 'heave' | 'pay' | 'released';
export interface Towline {
  fairTug: [number, number];        // tug towing point, tug body [x, y]
  fairShip: [number, number];       // the ship's fairlead (centre lead, chock), ship body [x, y]
  hTug: number;                     // towing point height above the waterline [m] (heels the tug)
  L0: number;                       // unstretched length [m]
  EA: number;                       // axial stiffness [N]
  MBL: number;                      // minimum breaking load [N]
  brake: number;                    // winch brake holding load [N]
  renderT: number;                  // render tension setting [N]
  mode: TowMode;
  T: number; peakT: number; parted: boolean;
}
export function makeTowline(fairTug: [number, number], fairShip: [number, number], hTug: number, L0: number, bp: number): Towline {
  // line sized for the tug: MBL ≈ 2.5 × bollard pull, brake at 2 × bollard pull
  return { fairTug, fairShip, hTug, L0, EA: 1.0e8, MBL: 2.5 * bp * 1.6, brake: 2.2 * bp, renderT: 1.4 * bp, mode: 'brake', T: 0, peakT: 0, parted: false };
}

/** World position and velocity of a body point. */
export function pointWorld(st: ShipState, p: [number, number]): [number, number, number, number] {
  const c = Math.cos(st.psi), s = Math.sin(st.psi);
  const n = st.n + p[0] * c - p[1] * s, e = st.e + p[0] * s + p[1] * c;
  const vx = st.u - st.r * p[1], vy = st.v + st.r * p[0];           // body velocity of the point
  return [n, e, c * vx - s * vy, s * vx + c * vy];
}

/** Line force on the tug as a body wrench; anchor = the ship's fairlead [n, e, vN, vE], held over the step. */
export function towForce(st: ShipState, line: Towline, anchor: [number, number, number, number]): Wrench & { T: number } {
  if (line.mode === 'released' || line.parted) return { X: 0, Y: 0, N: 0, T: 0 };
  const [fn, fe, vfn, vfe] = pointWorld(st, line.fairTug);
  const dn = anchor[0] - fn, de = anchor[1] - fe, d = Math.hypot(dn, de) || 1e-6;
  const strain = (d - line.L0) / line.L0;
  if (strain <= 0) return { X: 0, Y: 0, N: 0, T: 0 };
  const ddot = ((anchor[2] - vfn) * dn + (anchor[3] - vfe) * de) / d;      // stretch rate
  const T = Math.max(0, line.EA * strain + 4e5 * ddot);
  const FN = T * dn / d, FE = T * de / d, c = Math.cos(st.psi), s = Math.sin(st.psi);
  const fx = c * FN + s * FE, fy = -s * FN + c * FE;
  return { X: fx, Y: fy, N: line.fairTug[0] * fy - line.fairTug[1] * fx, T };
}

/** Winch per step: render, heave, pay out, part. Returns an event to announce, if any. */
export function updateTowWinch(line: Towline, dt: number): string | null {
  if (line.mode === 'released' || line.parted) return null;
  line.peakT = Math.max(line.peakT, line.T);
  if (line.T > line.MBL) { line.parted = true; line.T = 0; return 'TOWLINE PARTED'; }
  if (line.mode === 'heave' && line.T < 0.5 * line.brake) line.L0 = Math.max(8, line.L0 - 0.6 * dt);
  if (line.mode === 'pay') line.L0 = Math.min(200, line.L0 + 1.0 * dt);
  const hold = line.mode === 'render' ? line.renderT : line.brake;
  if (line.T > hold) line.L0 += Math.min(2, (line.T / hold - 1) * 6) * dt;   // the drum slips and pays out
  return null;
}

/** Reaction on the ship (body wrench of the ship) from tension T along the line. */
export function towReaction(ship: ShipState, line: Towline, tugPoint: [number, number]): Wrench {
  if (line.T <= 0) return { X: 0, Y: 0, N: 0 };
  const [fn, fe] = pointWorld(ship, line.fairShip);
  const dn = tugPoint[0] - fn, de = tugPoint[1] - fe, d = Math.hypot(dn, de) || 1e-6;
  const FN = line.T * dn / d, FE = line.T * de / d, c = Math.cos(ship.psi), s = Math.sin(ship.psi);
  const fx = c * FN + s * FE, fy = -s * FN + c * FE;
  return { X: fx, Y: fy, N: line.fairShip[0] * fy - line.fairShip[1] * fx };
}
