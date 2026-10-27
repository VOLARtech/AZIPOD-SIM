// Propeller on a shaft with the rudder behind it, and the engine that turns it.
//
// Propeller: K_T(J) = k0 + k1 J + k2 J² (MMG standard method, Yasukawa & Yoshimura 2015),
// written as T = ρD²(k0·c·n|n|D² + k1|n|D·Va + k2·Va|Va|) so that it stays finite through all
// four quadrants: a stopped propeller in flow is a drag (the k2 term), a reversed one meeting
// headway brakes harder than at rest, and going astern on astern turns loses thrust.
// Torque follows the same form, so a stopped engine's propeller windmills ahead with way on
// and an astern start has to fight it.
//
// Rudder: MMG standard rudder model. Inflow u_R from the propeller slipstream (ε, κ, η = D/H),
// v_R from flow straightening (γ_R, l'_R), normal force F_N = ½ρA_R U_R² C_N(α_R), hull
// interaction (t_R, a_H, x_H). C_N is capped per rudder type: a conventional rudder stalls,
// a flap rudder gives more lift, a Schilling rudder keeps lift towards 70°.
import { RHO, DEG } from '../consts';
import type { PodSpec, PropellerSpec, RudderSpec, ShaftSpec, ShipSpec, EngineSpec } from '../ship';

export interface ShaftForce { X: number; Y: number; N: number; T: number; FN: number; uR: number; TT: number; Q: number }

/** Signed shaft speed n [rps] and pitch factor of a unit. */
export function shaftN(sh: ShaftSpec, rpm: number) { return rpm * sh.engine.n; }

/** Effective wake 1 − w_P in a turn (MMG standard method, C1 = 2, C2 = 1.6 / 1.1). */
function wakeFactor(p: PropellerSpec, up: number, vp: number) {
  if (up <= 0) return 1;                                     // going astern: no hull wake at the propeller
  const bP = Math.atan2(-vp, up);
  const C2 = bP > 0 ? 1.6 : 1.1;
  return (1 - p.wP0) * (1 + (1 - Math.exp(-2 * Math.abs(bP))) * (C2 - 1));
}

/** Thrust of the propeller at shaft speed n [rps], axial inflow Va [m/s], pitch fraction (CPP) or 1. */
export function propThrust(p: PropellerSpec, n: number, Va: number, pitch = 1) {
  const D = p.D, nD = n * D;
  let c: number;
  if (p.cpp) c = pitch >= 0 ? pitch : pitch * p.asternFrac;     // shaft always turns ahead; pitch reverses
  else c = n >= 0 ? 1 : p.asternFrac;
  return RHO * D * D * (p.k0 * c * nD * Math.abs(nD) + p.k1 * Math.abs(nD) * Va * (p.cpp ? Math.max(0.15, Math.abs(pitch)) : 1) + p.k2 * Va * Math.abs(Va));
}

/** Hydrodynamic torque on the shaft [N m]: positive opposes ahead rotation. */
export function propTorque(p: PropellerSpec, n: number, Va: number, pitch = 1) {
  const D = p.D, nD = n * D, kq = p.KQ0 / p.k0;
  let c: number;
  if (p.cpp) c = 0.25 + 0.75 * Math.abs(pitch);                 // feathered blades still absorb some torque
  else c = n >= 0 ? 1 : p.asternFrac;
  const pa = p.cpp ? Math.abs(pitch) : 1;
  return RHO * D * D * D * kq * (p.k0 * c * nD * Math.abs(nD) + 0.8 * p.k1 * Math.abs(nD) * Va * pa + 0.8 * p.k2 * Va * Math.abs(Va) * pa);
}

/** Normal-force coefficient of a rudder at effective angle α (0 … π/2), MMG gradient with a stall cap by type. */
export function rudderCN(r: RudderSpec, a: number) {
  const lin = r.fa * Math.sin(a);
  const [stall, cap, post] = r.type === 'schilling' ? [70 * DEG, 1.9, 1.6] : r.type === 'flap' ? [45 * DEG, 2.2, 1.5] : [35 * DEG, 1.45, 1.05];
  if (a <= stall) return Math.min(lin, cap);
  // past the stall the normal force falls back towards a flat-plate value
  const k = Math.min(1, (a - stall) / (12 * DEG));
  return Math.min(lin, cap) * (1 - k) + post * k;
}

/**
 * Forces of one shaft unit (propeller + rudder) on the hull, body axes about the reference point.
 * ur, vr: water-relative velocity of the reference point; r yaw rate; xMid: x of midship.
 */
export function shaftForces(s: ShipSpec, u: PodSpec, rpm: number, delta: number, pitch: number,
                            ur: number, vr: number, r: number, xMid: number, out: ShaftForce) {
  const sh = u.shaft!, p = sh.prop, rd = sh.rudder;
  const n = rpm * sh.engine.n;
  const up = ur - u.y * r, vp = vr + p.xP * r;
  const Va = up * wakeFactor(p, up, vp);
  const T = propThrust(p, n, Va, pitch);
  const tP = T > 0 ? p.tP : 0.5 * p.tP;
  let X = (1 - tP) * T, Y = 0, N = 0;
  // transverse thrust (paddle-wheel effect): with the shaft turning ahead a right-hand propeller
  // walks the stern to starboard, turning astern to port; a CPP keeps turning ahead, so astern
  // pitch walks it to starboard like a left-hand fixed propeller. Ahead it is only felt at low J.
  if (Math.abs(T) > 1) {
    const rot = Math.sign(n) || 1;
    const k = T > 0 ? p.kTTah / (1 + (Va / (0.1 * Math.abs(n) * p.D + 0.3)) ** 2) : p.kTTas;
    const TT = p.hand * rot * k * Math.abs(T);
    Y += TT; N += p.xP * TT;
    out.TT = TT;
  } else out.TT = 0;

  let FN = 0, uR = 0;
  if (rd) {
    // rudder inflow: propeller slipstream on η of the span, hull flow on the rest
    const eta = Math.min(1, p.D / rd.H), Ad = RHO * Math.PI * p.D * p.D / 8;  // 8T/(πρD²) = T/Ad
    // u_P = Va (wake-reduced), as in u_R = ε u_P √(η{1 + κ(√(1 + 8K_T/πJ²) − 1)}² + 1 − η)
    if (T > 0 && Va >= 0) {
      const sl = Math.sqrt(Va * Va + T / Ad);
      const a = Va + rd.kappa * (sl - Va);
      uR = rd.eps * Math.sqrt(eta * a * a + (1 - eta) * Va * Va);
    } else if (T > 0) {
      uR = rd.eps * Math.sqrt(eta) * rd.kappa * Math.sqrt(T / Ad) + Va;                     // slipstream against sternway
    } else {
      // astern thrust or a windmilling disc: the rudder sits in disturbed, blanketed flow
      const blank = 1 / (1 + 4 * Math.abs(T) / (Ad * (Va * Va + 0.25)));
      uR = (Va >= 0 ? rd.eps : 1) * Va * blank;
    }
    // flow straightening: v_R = U γ_R (β − l'_R r'), β the drift angle at midship
    const vMid = vr + xMid * r, U = Math.hypot(ur, vMid);
    const bR = U * Math.atan2(-vMid, Math.abs(ur)) - rd.lR * s.L * r;   // U·β_R
    const vR = (bR > 0 ? rd.gammaP : rd.gammaM) * bR;
    const UR2 = uR * uR + vR * vR;
    const aR = delta - Math.atan2(vR, uR);
    const sa = Math.sin(aR), ae = Math.abs(Math.atan2(Math.abs(sa), Math.abs(Math.cos(aR))));
    const rev = Math.cos(aR) < 0 ? 0.6 : 1;                    // flow from aft: rudder works backwards, weaker
    FN = 0.5 * RHO * rd.A * UR2 * rudderCN(rd, ae) * Math.sign(sa) * rev;
    const aH = up > 0 ? rd.aH : 0;
    const cd = Math.cos(delta), sd = Math.sin(delta);
    X += -(1 - rd.tR) * FN * sd;
    Y += -(1 + aH) * FN * cd;
    N += -(rd.xR + aH * rd.xH) * FN * cd;
  }
  N += -u.y * X;                                               // off-centre shafts: surge moment
  out.X = X; out.Y = Y; out.N = N; out.T = T; out.FN = FN; out.uR = uR;
  out.Q = propTorque(p, n, Va, pitch);
  return out;
}

// ---------------------------------------------------------------- engine
export type EngMode = 'stop' | 'start' | 'run' | 'wait';
export interface EngineState {
  mode: EngMode; dir: -1 | 0 | 1;
  air: number;               // starting-air receiver [bar]
  t: number;                 // time in the current mode [s]
  tries: number;             // start attempts for the current order
  barredT: number;           // time spent inside the barred range [s]
  lowT: number;              // time held below firing speed at full fuel (stalling) [s]
  q: number;                 // engine torque, fraction of MCR torque
  target: number;            // governor setpoint, fraction of MCR rpm
  msg: string;               // what the engine room would tell you
  starts: number;            // starts made this watch
}
export function initEngine(e: EngineSpec, running: number): EngineState {
  return {
    mode: running ? 'run' : 'stop', dir: running > 0 ? 1 : running < 0 ? -1 : 0, air: e.air?.pMax ?? 0,
    t: 0, tries: 0, barredT: 0, lowT: 0, q: 0, target: running, msg: '', starts: 0,
  };
}
export const qMcr = (e: EngineSpec) => e.P / (2 * Math.PI * e.n);

/** Highest torque the fuel limiters allow at shaft speed fraction |n| (scavenge-air limiter at low rpm). */
function torqueCap(e: EngineSpec, nf: number) {
  if (e.type === 'electric') return 1.15;                     // motors give full torque from standstill
  if (e.type === 'turbine') return Math.min(1.05, 0.7 + 0.4 * nf);
  return Math.min(1.05, 0.55 + 0.55 * nf);
}

/**
 * Advance the engine and shaft by dt. demand: ordered shaft speed (fraction of MCR rpm, signed;
 * for CPP the governor setpoint, ≥ 0). Qh: hydrodynamic torque [N m] at the current state.
 * Returns the new shaft speed fraction. Shaft dynamics are integrated semi-implicitly.
 */
export function stepEngine(e: EngineSpec, es: EngineState, rpm: number, demand: number, Qh: number, dQdn: number, dt: number, limit = 1) {
  const Qm = qMcr(e), n = rpm, ord = Math.sign(demand) as -1 | 0 | 1;
  es.t += dt;
  if (e.air) es.air = Math.min(e.air.pMax, es.air + e.air.refill / 60 * dt);
  let qEng = 0;
  const direct = e.type === 'direct2s';
  // a non-reversing engine (CPP, geared clutch, electric, turbine) follows its setpoint directly
  if (!direct) {
    es.mode = Math.abs(demand) > 0.005 || Math.abs(n) > 0.005 ? 'run' : 'stop';
    es.target = Math.max(-limit, Math.min(limit, demand));
    const err = es.target - n;
    qEng = Math.max(-torqueCap(e, Math.abs(n)), Math.min(torqueCap(e, Math.abs(n)), (Qh / Qm) + 8 * err));
    if (e.type !== 'electric' && n * qEng < 0 && Math.abs(n) > 0.02) qEng = 0;   // a diesel cannot brake
    es.msg = '';
  } else {
    const air = e.air!;
    const nFire = air.firing;
    switch (es.mode) {
      case 'run': {
        if (ord !== es.dir) {                                 // stop, or reverse: fuel off first
          es.mode = 'stop'; es.t = 0; es.tries = 0; es.msg = ord === 0 ? 'STOP' : 'REVERSING';
          break;
        }
        // governor with load programme and minimum running speed
        let tgt = Math.max(e.nMin, Math.min(limit, Math.abs(demand)));
        if (e.barred) {
          const [lo, hi] = e.barred;
          if (tgt > lo && tgt < hi) tgt = lo - 0.005;           // never settle inside the barred range
        }
        // manoeuvring range answers in seconds; above it the load-up programme takes loadTime to MCR
        const cur = es.target * es.dir;
        const rate = cur < 0.8 ? 0.7 / 40 : 0.2 / e.loadTime;
        es.target = es.dir * (cur + Math.max(-0.05 * dt, Math.min(rate * dt, tgt - cur)));
        const err = es.target - n;
        qEng = es.dir * Math.max(0, Math.min(torqueCap(e, Math.abs(n)), es.dir * (Qh / Qm) + 6 * es.dir * err));
        // overloaded: the shaft is dragged below firing speed (astern against heavy headway) → stalls
        es.lowT = es.dir * n < 0.8 * e.air!.firing && es.dir * qEng >= 0.99 * torqueCap(e, Math.abs(n)) ? es.lowT + dt : 0;
        if (es.lowT > 3) { es.mode = 'wait'; es.t = 0; es.lowT = 0; es.msg = 'ENGINE STALLED'; qEng = 0; break; }
        if (e.barred && Math.abs(n) > e.barred[0] && Math.abs(n) < e.barred[1]) es.barredT += dt; else es.barredT = 0;
        es.msg = es.barredT > 6 ? 'IN BARRED RANGE' : '';
        break;
      }
      case 'stop':
      case 'wait': {
        qEng = 0;
        if (ord === 0) { es.msg = Math.abs(n) > 0.05 ? 'STOP · SHAFT TURNING' : 'STOP'; es.tries = 0; break; }
        if (es.mode === 'wait' && es.t < 4) break;            // after a failed start: purge, re-try
        if (Math.abs(n) > 0.32 && Math.sign(n) !== ord) { es.msg = 'WAITING · SHAFT TOO FAST'; break; }
        if (es.tries >= 3) { es.msg = 'START BLOCKED · 3 FAILED'; break; }
        if (es.air < air.pMin) { es.msg = 'NO STARTING AIR'; break; }
        es.mode = 'start'; es.t = 0; es.dir = ord; es.tries++; es.starts++;
        es.air -= ord > 0 ? air.dpAhead : air.dpAstern;
        es.msg = ord > 0 ? 'STARTING AHEAD' : 'STARTING ASTERN';
        break;
      }
      case 'start': {
        qEng = es.dir * air.torque;
        if (ord !== es.dir) { es.mode = 'stop'; es.t = 0; qEng = 0; break; }
        if (es.dir * n >= nFire) { es.mode = 'run'; es.t = 0; es.target = es.dir * Math.max(e.nMin, Math.abs(n)); es.msg = ''; break; }
        if (es.t > air.maxT) { es.mode = 'wait'; es.t = 0; es.msg = 'START FAILED'; qEng = 0; }
        break;
      }
    }
  }
  es.q = qEng;
  // shaft: 2πI ṅ = Q_eng − Q_h − friction; semi-implicit in the hydrodynamic stiffness
  const I2 = 2 * Math.PI * e.I * e.n;                         // per unit of rpm fraction
  const fr = 0.015 * Qm * Math.tanh(n / 0.01);
  const f = (qEng * Qm - Qh - fr) / I2;
  const k = Math.max(0, dQdn) * e.n / I2;
  return n + dt * f / (1 + dt * k);
}
