// The step runner for drills. Each step has a live check on the situation; the runner highlights the next
// step, ticks steps off as the player does them (in any order: the furthest step that holds counts), and
// never forces anything. The player can skip a step or stop the drill at any time.
import { DEG } from '../physics/consts';
import { wrapAngle } from '../physics/ship';
import { wayOff } from './context';
import type { Ctx } from './context';
import { stopRows } from './exercises';
import { RULES, TUGS_SLOW } from './rules';
import type { Procedure, Row, Step } from './types';

/** What the checks may remember between ticks. */
export interface Memo {
  /** The highest rpm ordered when the drill started. */
  rpm0: number;
  flags: { ack?: boolean; eased?: boolean; waited?: boolean; tugsWorked?: boolean };
}
export type Check = (c: Ctx, m: Memo) => boolean;

const near = (a: number, b: number, tol: number) => Math.abs(wrapAngle(a - b)) <= tol;

export const CHECKS: Record<string, Check> = {
  /** The player taps NEXT. */
  ack: (_c, m) => !!m.flags.ack,
  /** Every pod is ordered round to astern (180°). */
  'pods-ordered-round': c => c.units.every(u => near(u.cmdAlpha, Math.PI, 25 * DEG)),
  /** The rpm was eased while the pods were ordered across the flow. */
  'rpm-eased': (_c, m) => !!m.flags.eased,
  /** Every pod has come round to astern and the rpm is back up. */
  'rpm-up-round': c => c.units.every(u => near(u.alpha, Math.PI, 30 * DEG) && u.cmdRpm >= 0.85),
  /** The way is off her. */
  stopped: c => wayOff(c),
  /** Rpm to zero and the pods ordered back ahead. */
  'pods-idle': c => c.units.every(u => Math.abs(u.cmdRpm) < 0.02 && near(u.cmdAlpha, 0, 30 * DEG)),
  /** Every pod is turning slower than the reverse limit, so an astern order will be taken. */
  'rpm-below-limit': c => c.units.every(u => Math.abs(u.rpm) <= c.spec.revInterlock + 0.01),
  /** Full astern is ordered on every pod. */
  'astern-ordered': c => c.units.every(u => u.cmdRpm <= -0.75),
  /** Astern is ordered on the telegraph. */
  'telegraph-astern': c => c.units.every(u => u.cmdRpm <= -0.2),
  /** The engine has said it is waiting for the shaft to slow before it can start astern. */
  'engine-waiting': (_c, m) => !!m.flags.waited,
  /** A shaft is turning astern. */
  'astern-started': c => c.units.some(u => u.rpm < -0.02),
  /** The buckets are down on every jet. */
  'buckets-down': c => c.units.every(u => (u.cmdBucket ?? 1) <= -0.5),
  /** The buckets are down and the throttle is up: astern thrust. */
  'astern-throttle': c => c.units.every(u => (u.cmdBucket ?? 1) <= -0.5 && u.cmdRpm >= 0.5),
  /** The buckets are at their zero-thrust position. */
  'bucket-zero': c => c.units.every(u => Math.abs(u.cmdBucket ?? 1) <= 0.25),
  /** She is slow enough for the assist tugs to keep their grip (the speed the tip warns at). */
  'slow-for-tugs': c => Math.abs(c.u) <= TUGS_SLOW,
  /** Every assist tug has an order of a quarter or more. */
  'tugs-ordered': c => c.tugs.length > 0 && c.tugs.every(t => Math.abs(t.order) >= 0.25),
  /** The tugs have worked and every one is back at STOP. */
  'tugs-stopped': (c, m) => !!m.flags.tugsWorked && c.tugs.length > 0 && c.tugs.every(t => t.order === 0),
  /** An escorting tug is heeling toward the deck edge with the line fast: the girting danger. */
  'girting-risk': c => RULES['girting-risk'](c),
  /** The towline has been let go. */
  'line-released': c => !!c.tow && (c.tow.released || c.tow.parted),
  /** The line is gone and the tug has come back upright. */
  upright: c => !!c.tow && (c.tow.released || c.tow.parted) && !!c.heel && Math.abs(c.heel.phi) < 0.25 * c.heel.edge,
};

/** Latches the checks need: things that happen once and are gone. */
function watch(c: Ctx, m: Memo) {
  const across = c.units.some(u => Math.abs(wrapAngle(u.cmdAlpha)) > 40 * DEG);
  if (across && c.units.every(u => Math.abs(u.cmdRpm) <= 0.6 * Math.max(m.rpm0, 0.2))) m.flags.eased = true;
  if (c.engine.some(e => e.startsWith('WAITING'))) m.flags.waited = true;
  if (c.tugs.some(t => t.order !== 0)) m.flags.tugsWorked = true;
}

export type StepState = 'todo' | 'now' | 'done' | 'skipped';
/** A condition must hold this long [s] to count. */
export const HOLD = 0.5;

export class Runner {
  states: StepState[];
  memo: Memo;
  /** What the drill has measured so far: path length [m], time [s] and heading change [rad] since it started. */
  path = 0; time = 0; heading = 0;
  private held: number[];
  private psi0: number;

  constructor(readonly proc: Procedure, c0: Ctx) {
    this.states = proc.steps.map((_, i) => (i === 0 ? 'now' : 'todo'));
    this.held = proc.steps.map(() => 0);
    this.memo = { rpm0: Math.max(0, ...c0.units.map(u => Math.abs(u.cmdRpm))), flags: {} };
    this.psi0 = c0.psi;
  }

  /** The step to do now, or -1 when the drill is finished. */
  get index() { return this.states.indexOf('now'); }
  get finished() { return this.index < 0; }
  get current(): Step | undefined { return this.proc.steps[this.index]; }

  /** What the drill measured, as a debrief: the track reach, the time and the heading change. */
  rows(L: number): Row[] { return stopRows(L, this.path, this.time, this.heading); }

  /** The player has read the step and tapped NEXT. Only a step that asks to be read takes the tap. */
  ack() { if (this.current?.check === 'ack') this.memo.flags.ack = true; }
  /** Leave the current step undone and go on to the next. */
  skip() { const i = this.index; if (i >= 0) this.settle(i, i, 'skipped'); }

  private settle(from: number, hit: number, as: StepState) {
    for (let i = from; i < hit; i++) this.states[i] = 'skipped';
    this.states[hit] = as;
    if (hit + 1 < this.states.length) this.states[hit + 1] = 'now';
    this.memo.flags.ack = false;                                     // the next acknowledgement is for the next step
  }

  /** Advance by `dt` simulated seconds with the situation `c`. */
  step(c: Ctx, dt: number) {
    if (this.finished) return;
    if (dt > 0) { this.path += c.sog * dt; this.time += dt; }
    this.heading = wrapAngle(c.psi - this.psi0);
    watch(c, this.memo);
    const i0 = this.index;
    let hit = -1;
    this.proc.steps.forEach((s, i) => {
      if (i < i0) return;
      // a tap answers the step on the screen, not a later one that also asks to be read
      const ok = s.check === 'ack' && i !== i0 ? false : CHECKS[s.check]?.(c, this.memo) ?? false;
      this.held[i] = ok ? this.held[i] + dt : 0;
      if (ok && this.held[i] >= HOLD) hit = i;
    });
    if (hit >= i0) this.settle(i0, hit, 'done');
  }
}
