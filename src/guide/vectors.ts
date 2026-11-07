// Suggested vectors: pure functions from the ship's state to what the chart and the controls draw.
// None of them steers anything. Every one is computed from this simulator's own model and says so.
import { allocate, joyLimits } from '../physics/allocation';
import type { JoyInput } from '../physics/allocation';
import { DEG } from '../physics/consts';
import type { ShipSpec } from '../physics/ship';
import type { Command, ShipState } from '../physics/sim';
import { isPod } from '../physics/units/kinds';
import { guideSpeed } from './align';
import type { Ctx } from './context';
import type { Ghost } from './types';

/**
 * The pivot point: where her sideways speed is zero, in metres ahead of the CG (`x`) and as a share of her
 * length aft of the bow (`fromBow`), the same quantity the sea trials table reports. Null while she is not
 * turning (there is no pivot to speak of) or when the point lies far off the hull (a sideways drift).
 */
export function pivotPoint(spec: ShipSpec, v: number, r: number): { x: number; fromBow: number } | null {
  if (Math.abs(r) < 0.003) return null;                    // under about 10°/min
  const x = -v / r;
  if (Math.abs(x) > 0.9 * spec.L) return null;
  return { x, fromBow: (spec.L / 2 - spec.xg - x) / spec.L };
}

// ---------------------------------------------------------------- the docking suggestion
/** Seconds in which the suggestion tries to remove a speed error. It is this model's own rule, not a published procedure. */
export const T_SWAY = 25, T_YAW = 35, T_SURGE = 20;
/** The pods answer slowly, so the guideline is read at the distance she will have reached this many seconds ahead [s]. */
export const LOOKAHEAD = 15;
/** The suggestion is made within this many metres of a quay [m]. */
export const RANGE = 60;
/** The surge speed to hold below with `togo` metres still to go along the berth [m/s]: a limit, not a set point, so it never hunts. */
export const surgeCap = (togo: number) => Math.max(0.05, Math.min(0.5, 0.03 * Math.abs(togo)));

/** Her masses as the model uses them: surge, sway (both with added mass) and yaw inertia. */
export interface Masses { surge: number; sway: number; yaw: number }

/**
 * The stick a docking officer's rule would give: close both ends of the hull on the quay at the guideline
 * speed (sway from the mean speed error of the two ends, yaw from their difference), and keep her to the
 * berth mark by holding her surge speed under a limit that falls away with the distance still to go. Null when there is no berth
 * to make for, no quay within range, or she is not roughly parallel to the berth.
 */
export function dockingStick(c: Ctx, m: Masses, lim: { X: number; Y: number; N: number }): JoyInput | null {
  if (!c.berth || Math.abs(c.berth.dpsi) > 60 * DEG) return null;
  const ends = c.quay.filter(q => Number.isFinite(q.d) && q.d < RANGE);
  if (!ends.length) return null;
  const nearest = ends.reduce((a, q) => (q.d < a.d ? q : a));
  const err = (q: Ctx['quay'][number]) => guideSpeed(c.spec, Math.max(0, q.d - LOOKAHEAD * q.closing)) - q.closing;   // + may close faster, − brake
  const mean = ends.reduce((a, q) => a + err(q), 0) / ends.length;
  const bow = ends.find(q => q.x > 0), stern = ends.find(q => q.x < 0);
  const dYaw = bow && stern && bow.x > stern.x ? m.yaw * (err(bow) - err(stern)) / ((bow.x - stern.x) * T_YAW) : 0;
  const clamp = (a: number) => Math.max(-1, Math.min(1, a));
  const cap = surgeCap(c.berth.along), excess = c.u > cap ? c.u - cap : c.u < -cap ? c.u + cap : 0;
  const X = excess === 0 ? 0 : -m.surge * excess / T_SURGE;
  return {
    x: clamp(nearest.side * m.sway * mean / T_SWAY / lim.Y),     // toward the quay is positive on the quay's own side
    y: clamp(X / lim.X),
    r: clamp(nearest.side * dYaw / lim.N),                       // bow toward the quay when the bow needs to close faster than the stern
  };
}

/**
 * The pod azimuths, rpm and bow thruster a stick would need, from the joystick allocator the ship has (twin
 * pods and a bow thruster only): what the joystick would do, shown as outlines on the dials.
 */
export function ghostFromStick(spec: ShipSpec, st: ShipState, stick: JoyInput, btEff: number): Ghost | null {
  if (spec.pods.length !== 2 || !spec.pods.every(isPod) || spec.bowThruster.Tmax <= 0) return null;
  const cmd: Command = { pods: spec.pods.map(() => ({ alpha: 0, rpm: 0 })), bt: 0 };
  allocate(spec, st, stick, btEff, cmd, false);
  return { units: cmd.pods.map(p => ({ alpha: p.alpha, rpm: p.rpm })), bt: cmd.bt };
}

/** The docking stick and its ghost in one go. */
export function podGhost(spec: ShipSpec, st: ShipState, c: Ctx, m: Masses, btEff: number): Ghost | null {
  const stick = dockingStick(c, m, joyLimits(spec, btEff));
  return stick ? ghostFromStick(spec, st, stick, btEff) : null;
}
