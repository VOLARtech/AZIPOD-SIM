// What the coach is allowed to know: the ship, her speed and attitude as the bridge sensors give them,
// the propulsion units as the dials show them, and where she is against the berth being made for.
// Pure: built from a Runtime, so the tests read it headless and the guide never knows more than the bridge.
import { DEG } from '../physics/consts';
import { deckEdge } from '../physics/roll';
import { wrapAngle } from '../physics/ship';
import type { ShipSpec } from '../physics/ship';
import type { LeverMode, Runtime } from '../physics/runtime';
import { closingSpeed } from './align';
import { familyOf } from './families';
import type { Fam } from './types';

/** The berth being made for, as `S.berth.target` holds it: the CG pose that puts her on the berth (heading in degrees). */
export interface BerthTarget { n: number; e: number; psi: number; name: string; id?: string; side?: -1 | 1 }
/** A hull point and the nearest structure to it, as the chart's quay lines measure them (world coordinates [m]). */
export interface QuayPoint { d: number; n: number; e: number; pn: number; pe: number }
/**
 * An end of the hull against the quay: its distance [m], how fast it is closing [m/s, negative while opening],
 * which side of the hull the quay is on (+1 starboard) and where the hull point is, metres ahead of the CG.
 */
export interface QuayRead { d: number; closing: number; side: 1 | -1; x: number }

export interface Ctx {
  /** Simulated seconds. */
  t: number;
  spec: ShipSpec;
  fam: Fam;
  lever: LeverMode;
  /** Speed over ground [m/s], the heading [rad] and the CG velocities the bridge estimates: ahead u, sideways v [m/s], yaw rate r [rad/s]. */
  sog: number; psi: number; u: number; v: number; r: number;
  /** Her position as the bridge sensors give it (north, east) [m]. */
  pos: { n: number; e: number };
  /** Sideways speed at the bow and at the stern [m/s], + to starboard: the HUD's FWD and AFT. */
  bow: number; stern: number;
  /** True wind speed [m/s]. */
  wind: number;
  /** Water under the keel [m]. */
  ukc: number;
  /** The units as the dials show them: actual and ordered azimuth [rad] and rpm (−1..1). */
  units: { alpha: number; rpm: number; cmdAlpha: number; cmdRpm: number }[];
  /** A reverse order the control system is ignoring because the rpm is still too high, per unit. */
  revBlocked: boolean[];
  /** The switchboard is too short for what the pods and thrusters were asked for (not the berthing split). */
  powerLimited: boolean;
  /** Against the berth being made for: metres past it (+) or short (−), off its line (+ to starboard), heading error [rad], range [m]. */
  berth: null | { name: string; id?: string; along: number; off: number; dpsi: number; dist: number };
  quay: QuayRead[];
  /** Heel [rad] and the deck-edge immersion angle [rad], for ships that have roll data. */
  heel: null | { phi: number; edge: number };
  /** The line of an escorting tug: tension and breaking load [N], whether it is let go or has parted, and the escorted ship's heading error [rad]. */
  tow: null | { T: number; mbl: number; released: boolean; parted: boolean; dev: number };
  /** The assist tugs on call: order (−1 pull … +1 push), force across the beam [N, + to starboard], bollard pull [N], the side they work on, and where they are made fast (m ahead of the CG). */
  tugs: { name: string; order: number; F: number; Fmax: number; side: 1 | -1; x: number }[];
}

export function guideCtx(rt: Runtime, berth: BerthTarget | null = null, quay: QuayPoint[] = []): Ctx {
  const spec = rt.spec, out = rt.sensors.out, est = out.est, st = rt.state;
  let b: Ctx['berth'] = null;
  if (berth) {
    const bp = berth.psi * DEG, dn = est.n - berth.n, de = est.e - berth.e;
    b = {
      name: berth.name, id: berth.id,
      along: dn * Math.cos(bp) + de * Math.sin(bp),
      off: -dn * Math.sin(bp) + de * Math.cos(bp),
      dpsi: wrapAngle(est.psi - bp),
      dist: Math.hypot(dn, de),
    };
  }
  return {
    t: st.t, spec, fam: familyOf(spec), lever: rt.lever,
    sog: out.sog, psi: est.psi, u: est.u, v: est.v, r: est.r, pos: { n: est.n, e: est.e },
    bow: est.v + est.r * (spec.L * 0.42 - spec.xg),
    stern: est.v + est.r * (-spec.L * 0.42 - spec.xg),
    wind: out.windTrueSpeed,
    ukc: rt.ukc,
    units: st.pods.map((p, i) => ({ alpha: p.alpha, rpm: p.rpm, cmdAlpha: rt.cmd.pods[i]?.alpha ?? 0, cmdRpm: rt.cmd.pods[i]?.rpm ?? 0 })),
    revBlocked: rt.status.revBlocked.slice(),
    powerLimited: rt.status.rpmLimit.some((l, i) => l < 0.999 && !rt.status.split[i]),
    berth: b,
    heel: rt.roll ? { phi: rt.roll.phi, edge: deckEdge(spec) } : null,
    tow: rt.escort ? { T: rt.escort.line.T, mbl: rt.escort.line.MBL, released: rt.escort.line.mode === 'released', parted: rt.escort.line.parted, dev: wrapAngle(rt.escort.st.psi - rt.escort.ordered) } : null,
    tugs: rt.tugs.map(t => ({ name: t.name, order: t.order, F: t.F, Fmax: t.Fmax, side: t.side, x: t.x })),
    quay: quay.map(q => {
      const fin = Number.isFinite(q.d), c = Math.cos(est.psi), s = Math.sin(est.psi);
      return {
        d: q.d, closing: fin ? closingSpeed(est, q) : 0,
        side: (fin && -(q.n - q.pn) * s + (q.e - q.pe) * c < 0 ? -1 : 1) as 1 | -1,
        x: fin ? (q.pn - est.n) * c + (q.pe - est.e) * s : 0,
      };
    }),
  };
}
