// Scripted headless runs: what each drill does in this model. The cards and the tests make claims about
// them ("the 180° turn is the shortest of the powered stops", "an astern order at once is ignored"), and
// these runs are what those claims are checked against. Used by the tests; the app never imports them.
import { DEG, KN } from '../physics/consts';
import { buildHull, setHull } from '../physics/contact';
import { DT, Runtime } from '../physics/runtime';
import { SHIP, setShip } from '../physics/ship';
import type { ShipSpec } from '../physics/ship';
import { makeState } from '../physics/sim';
import type { Env } from '../physics/sim';

const calm: Env = { windSpeed: 0, windFrom: 0, gusts: false, current: () => [0, 0], depth: Infinity };
const OPEN = { obstacles: [], fenders: [], bollards: [], depthAt: () => Infinity };

/** The ways to stop a twin-pod ship that the guide teaches (or warns about). */
export type StopMethod = 'swing180' | 'reverse' | 'reverse-direct' | 'indirect';
export interface StopRun {
  /** Her speed at the first order [kn]. */
  kn0: number;
  /** Track reach in ship lengths, and the time it took [s]. */
  reach: number; time: number;
  /** Heading change [°]. */
  heading: number;
  stopped: boolean;
  /** An order was ignored by the reverse interlock at some point. */
  blocked: boolean;
}

/**
 * A twin-pod ship under way at `frac` of her top speed (Nowicki's tests ran at about 65 % of service speed)
 * is stopped by one of the methods, in deep calm water, until her speed is below half a knot.
 */
export function scriptedStop(spec: ShipSpec, method: StopMethod, frac = 0.65, limit = 2000): StopRun {
  const prev = SHIP;
  setShip(spec.id); setHull(buildHull(spec.L, spec.B, spec.xg, spec.LOA));
  try {
    const kn0 = frac * spec.vmaxKn, r0 = Math.min(1, kn0 / spec.vmaxKn);
    const st = makeState(spec, 0, 0, 0, kn0);
    st.pods.forEach(p => (p.rpm = r0));
    const cmd = { pods: spec.pods.map(() => ({ alpha: 0, rpm: r0 })), bt: 0 };
    const rt = new Runtime(spec, st, cmd, calm, OPEN);
    rt.setLever('indep');
    const out = (i: number) => (spec.pods[i].y < 0 ? -1 : 1);                       // outboard sign of each pod
    const below = () => st.pods.every(p => Math.abs(p.rpm) <= spec.revInterlock - 0.01);
    let path = 0, pn = st.n, pe = st.e, t = 0, blocked = false, staged = false;
    for (; t < limit; t += DT) {
      if (method === 'swing180') cmd.pods.forEach((p, i) => { p.alpha = out(i) * 179.9 * DEG; p.rpm = Math.abs(st.pods[i].alpha) > 160 * DEG ? 1 : 0.25 * r0; });
      else if (method === 'reverse-direct') cmd.pods.forEach(p => { p.alpha = 0; p.rpm = -1; });
      else {
        if (!staged && below()) staged = true;                                       // bring the rpm under the limit first, then astern
        cmd.pods.forEach((p, i) => { p.alpha = method === 'indirect' ? out(i) * 30 * DEG : 0; p.rpm = staged ? -1 : 0.25; });
      }
      rt.step(DT);
      if (rt.status.revBlocked.some(Boolean)) blocked = true;
      path += Math.hypot(st.n - pn, st.e - pe); pn = st.n; pe = st.e;
      if (Math.hypot(st.u, st.v) < 0.5 * KN) break;
    }
    return { kn0, reach: path / spec.L, time: t, heading: st.psi / DEG, stopped: Math.hypot(st.u, st.v) < 0.5 * KN, blocked };
  } finally {
    setShip(prev.id); setHull(buildHull(prev.L, prev.B, prev.xg, prev.LOA));
  }
}
