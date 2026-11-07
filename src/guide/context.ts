// What the coach is allowed to know: the ship, her speed and attitude as the bridge sensors give them,
// the propulsion units as the dials show them, and where she is against the berth being made for.
// Pure: built from a Runtime, so the tests read it headless and the guide never knows more than the bridge.
import { DEG } from '../physics/consts';
import { wrapAngle } from '../physics/ship';
import type { ShipSpec } from '../physics/ship';
import type { LeverMode, Runtime } from '../physics/runtime';
import { familyOf } from './families';
import type { Fam } from './types';

/** The berth being made for, as `S.berth.target` holds it: the CG pose that puts her on the berth (heading in degrees). */
export interface BerthTarget { n: number; e: number; psi: number; name: string; id?: string; side?: -1 | 1 }
/** How far each end of the hull is from the quay and how fast it is closing, as the chart's quay lines read it. */
export interface QuayRead { d: number; rate: number }

export interface Ctx {
  /** Simulated seconds. */
  t: number;
  spec: ShipSpec;
  fam: Fam;
  lever: LeverMode;
  /** Speed over ground [m/s] and the CG velocities the bridge estimates: ahead u, sideways v [m/s], yaw rate r [rad/s]. */
  sog: number; u: number; v: number; r: number;
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
  /** Against the berth being made for: metres past it (+) or short (−), off its line (+ to starboard), heading error [rad], range [m]. */
  berth: null | { name: string; id?: string; along: number; off: number; dpsi: number; dist: number };
  quay: QuayRead[];
}

export function guideCtx(rt: Runtime, berth: BerthTarget | null = null, quay: QuayRead[] = []): Ctx {
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
    sog: out.sog, u: est.u, v: est.v, r: est.r,
    bow: est.v + est.r * (spec.L * 0.42 - spec.xg),
    stern: est.v + est.r * (-spec.L * 0.42 - spec.xg),
    wind: out.windTrueSpeed,
    ukc: rt.ukc,
    units: st.pods.map((p, i) => ({ alpha: p.alpha, rpm: p.rpm, cmdAlpha: rt.cmd.pods[i]?.alpha ?? 0, cmdRpm: rt.cmd.pods[i]?.rpm ?? 0 })),
    revBlocked: rt.status.revBlocked.slice(),
    berth: b,
    quay: quay.map(q => ({ d: q.d, rate: q.rate })),
  };
}
