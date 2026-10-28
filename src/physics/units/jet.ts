// Waterjet: an impeller in a duct draws water through a flush hull intake and throws it out of a
// nozzle at the transom. Thrust is the momentum flux T = ṁ (V_j − V_i), ṁ = ρ A_n V_j, with the
// jet speed V_j set by the power the pump puts into the flow (Allison 1993; Wärtsilä):
//   η_p P = ½ ṁ ((1 + k_n) V_j² − η_i V_i²)
// The steering nozzle turns the jet sideways (±30°). The reversing bucket drops over the nozzle and
// turns part of the jet forward; its channels keep the jet's sideways component on the same side, so
// the nozzle steers the stern the same way ahead, at the zero-thrust position and astern
// (Kamewa / Rolls-Royce patents US 6234100, 7037150). That is what makes the joystick work: bucket
// at zero, nozzles over, and the jets give pure side force at the stern.
import { RHO } from '../consts';
import type { PodSpec, ShipSpec } from '../ship';
import type { Command } from '../sim';

const ETA_P = 0.88;          // pump efficiency
const K_N = 0.03;            // nozzle loss coefficient
const ETA_I = 0.75;          // intake ram recovery
const ETA_R = 0.62;          // reversed flow: forward component of the turned jet

/** Fraction of the jet turned forward for bucket position b (1 up, 0 zero thrust, −1 full astern). */
export function bucketFrac(b: number) {
  const f0 = 1 / (1 + ETA_R);                        // zero thrust: ahead and reversed parts cancel
  return b >= 0 ? f0 * (1 - b) : f0 + (1 - f0) * -b;
}

/** Jet speed for shaft power Ps through nozzle area An, intake speed Vi (Newton on the cubic). */
export function jetSpeed(Ps: number, An: number, Vi: number) {
  if (Ps <= 0) return Math.max(0, Vi * 0.9);
  const a = 0.5 * RHO * An, e = ETA_P * Ps, vi2 = ETA_I * Vi * Vi;
  let v = Math.max(Vi * 1.05, Math.cbrt(e / (a * (1 + K_N))), 1);
  for (let k = 0; k < 8; k++) {
    const f = a * v * ((1 + K_N) * v * v - vi2) - e, df = a * (3 * (1 + K_N) * v * v - vi2);
    v -= f / df;
  }
  return Math.max(v, 0.1);
}

/** Fraction of rated power the pump may absorb at ship speed U before it cavitates (rpm ceiling = cbrt). */
export const cavLimit = (U: number) => Math.min(1, 0.6 + 0.4 * Math.max(0, U) / 10.3);

export interface JetForce { X: number; Y: number; N: number; T: number; Vj: number; mdot: number }

/** Force of one waterjet on the hull, body axes about the origin. */
export function jetForce(p: PodSpec, ps: { alpha: number; rpm: number; bucket?: number }, ur: number, vr: number, r: number,
                         wake: number, tded: number, out: JetForce): JetForce {
  const j = p.jet!, up = ur - p.y * r, vp = vr + p.x * r;
  const Vi = up > 0 ? (1 - wake) * up : 0;
  const Ps = p.P * Math.max(0, ps.rpm) ** 3;
  const Vj = jetSpeed(Ps, j.Anoz * p.thrustMul, Vi), mdot = RHO * j.Anoz * p.thrustMul * Vj;
  const f = bucketFrac(ps.bucket ?? 1), d = ps.alpha + p.alphaOffset;
  // gross jet thrust: aft part along the nozzle, reversed part forward; side component kept on the same side
  const J = mdot * Vj;
  const Tx = J * Math.cos(d) * ((1 - f) - ETA_R * f) - mdot * Vi;
  const Ty = -J * Math.sin(d) * ((1 - f) + 0.8 * f);
  // intake ingests the cross-flow and destroys its sideways momentum (like a propeller's ram drag)
  const Yi = -mdot * vp;
  const X = Tx * (1 - (Tx > 0 ? tded : 0)), Y = Ty + Yi;
  out.X = X; out.Y = Y; out.N = p.x * Y - p.y * X; out.T = Tx; out.Vj = Vj; out.mdot = mdot;
  return out;
}

/** Impeller speed, nozzle and bucket servos; returns the rpm ceiling the cavitation limit imposed. */
export function stepJet(p: PodSpec, ps: { alpha: number; rpm: number; bucket?: number }, cmd: { alpha: number; rpm: number; bucket?: number },
                        U: number, dt: number, rpmTime: number) {
  const j = p.jet!;
  const ta = Math.max(-j.nozzleMax, Math.min(j.nozzleMax, cmd.alpha)), ma = (j.nozzleMax / j.respT) * dt * p.slewMul;
  ps.alpha += Math.max(-ma, Math.min(ma, ta - ps.alpha));
  const b = ps.bucket ?? 1, tb = Math.max(-1, Math.min(1, cmd.bucket ?? 1)), mb = 2 * dt / j.bucketTime;
  ps.bucket = b + Math.max(-mb, Math.min(mb, tb - b));
  // the engines idle with the clutch in: the impeller never drops below idle while they run
  const lim = Math.cbrt(cavLimit(U)), tgt = Math.max(j.idle, Math.min(lim, cmd.rpm));
  const mr = dt / rpmTime;
  // above the ceiling the governor brings the impeller down at the same rate
  ps.rpm += Math.max(-mr, Math.min(mr, tgt - ps.rpm));
  return { lim, limited: cmd.rpm > lim + 1e-6 };
}

/** Bucket position that turns fraction f of the jet forward (inverse of bucketFrac). */
export function bucketFor(f: number) {
  const f0 = 1 / (1 + ETA_R);
  return f <= f0 ? 1 - f / f0 : -(f - f0) / (1 - f0);
}
/** Static gross jet thrust ṁV_j of one jet at impeller speed n (ship stopped). */
export const staticJet = (p: PodSpec, n: number) => { const An = p.jet!.Anoz, v = jetSpeed(p.P * Math.max(0, n) ** 3, An, 0); return RHO * An * v * v; };

/** Orders for one jet giving gross side force `side` (+ pushes the stern to starboard) and surge `along` [N]. */
function jetOrder(p: PodSpec, side: number, along: number) {
  const j = p.jet!, J1 = staticJet(p, 1), f0 = 1 / (1 + ETA_R), kS0 = (1 - f0) + 0.8 * f0, sMax = Math.sin(j.nozzleMax);
  // impeller: enough jet for the side force at full nozzle and the surge within the bucket's range
  const need = Math.max(staticJet(p, j.idle), Math.abs(side) / (sMax * kS0), Math.abs(along) / (Math.cos(j.nozzleMax) * (along >= 0 ? 0.9 : ETA_R * 0.9)));
  const n = Math.min(1, Math.max(j.idle, Math.sqrt(need / J1))), J = staticJet(p, n);
  let f = f0, d = 0;
  for (let k = 0; k < 3; k++) {
    const kS = (1 - f) + 0.8 * f;
    d = Math.max(-j.nozzleMax, Math.min(j.nozzleMax, -Math.sign(side) * Math.asin(Math.min(1, Math.abs(side) / (J * kS)))));
    const q = Math.max(-ETA_R, Math.min(1, along / (J * Math.cos(d))));
    f = (1 - q) / (1 + ETA_R);
  }
  return { alpha: d, bucket: bucketFor(f), rpm: n, short: need > J1 * 1.0001 ? need / J1 : 1 };
}

/**
 * Joystick on a waterjet ship: surge fx, sway fy, yaw nz (−1..1, + = ahead, to starboard, bow to starboard)
 * to bucket, nozzle and impeller orders for every jet and the bow thruster. The jets only push at the stern,
 * so a sideways push needs its turning moment taken out: by the bow thruster as far as it goes, the rest by
 * running the port and starboard jets differentially (one hull ahead, the other astern).
 */
export function jetJoystick(spec: ShipSpec, cmd: Command, fx: number, fy: number, nz: number) {
  const jets = spec.pods.map((p, i) => [p, i] as [PodSpec, number]).filter(([p]) => p.kind === 'waterjet');
  if (!jets.length) return;
  const p0 = jets[0][0], nj = jets.length, J1 = staticJet(p0, 1);
  const f0 = 1 / (1 + ETA_R), kS0 = (1 - f0) + 0.8 * f0, sMax = Math.sin(p0.jet!.nozzleMax);
  const xs = jets.reduce((a, [p]) => a + p.x, 0) / nj, yb = jets.reduce((a, [p]) => a + Math.abs(p.y), 0) / nj;
  const bt = spec.bowThruster, xb = bt.x;
  const FsMax = 0.35 * nj * J1 * sMax * kS0, FxMax = 0.06 * nj * J1, NMax = 0.12 * FsMax * Math.abs(xs);
  let k = 1, orders: ReturnType<typeof jetOrder>[] = [];
  for (let it = 0; it < 4; it++) {
    const Fx = fx * FxMax * k, Fy = fy * (0.4 * FsMax + bt.Tmax) * k, Nt = nz * NMax * k;
    // bow thruster and stern side force share the sway and yaw; the bow thruster is capped
    let Fb = bt.Tmax > 0 ? Math.max(-bt.Tmax, Math.min(bt.Tmax, (Nt - xs * Fy) / (xb - xs))) : 0;
    const Fs = Fy - Fb;
    const dN = Nt - xs * Fs - xb * Fb;                     // moment left over: port and starboard jets differential
    const dX = dN / yb;                                    // N = −y·X summed: port (y<0) ahead turns her to starboard
    cmd.bt = bt.Tmax > 0 ? Math.sign(Fb) * Math.sqrt(Math.abs(Fb) / bt.Tmax) : 0;
    const np = jets.filter(([p]) => p.y < 0).length || 1, ns = nj - np || 1;
    orders = jets.map(([p]) => jetOrder(p, Fs / nj, p.y < 0 ? (Fx / 2 + dX / 2) / np : (Fx / 2 - dX / 2) / ns));
    const short = Math.max(...orders.map(o => o.short));
    if (short <= 1) break;
    k /= short;                                            // beyond the jets' reach: scale the whole demand down
  }
  jets.forEach(([, i], m) => { const c = cmd.pods[i], o = orders[m]; c.alpha = o.alpha; c.bucket = o.bucket; c.rpm = o.rpm; });
}

/** Thrust lever of a waterjet (combinator): near the centre it moves the bucket at idle, beyond it the impeller speed. */
export const BAND = 0.3;
const AST_RPM = 0.8;
export function leverToJet(v: number, idle: number) {
  if (v >= 0) return v <= BAND ? { bucket: v / BAND, rpm: idle } : { bucket: 1, rpm: idle + (1 - idle) * (v - BAND) / (1 - BAND) };
  return -v <= BAND ? { bucket: v / BAND, rpm: idle } : { bucket: -1, rpm: idle + (AST_RPM - idle) * (-v - BAND) / (1 - BAND) };
}
export function jetToLever(bucket: number, rpm: number, idle: number) {
  if (Math.abs(bucket) < 0.999 || rpm <= idle + 1e-6) return bucket * BAND;
  return bucket > 0 ? BAND + (1 - BAND) * (rpm - idle) / (1 - idle) : -(BAND + (1 - BAND) * (rpm - idle) / (AST_RPM - idle));
}
