// Guided exercises: a scenario, a ship and objectives, ending in a debrief that sets what the player did
// beside a reference. There is no score and no pass or fail: no authoritative numeric standard exists for
// these manoeuvres, so a grade would be invented. The debrief reports; the player judges.
import { approachSpeed, displacement } from '../physics/berths';
import { DEG, KN } from '../physics/consts';
import type { Runtime } from '../physics/runtime';
import { wrapAngle } from '../physics/ship';
import { PUBLISHED } from '../physics/validation';
import { guideSpeed } from './align';
import type { Ctx } from './context';
import type { Exercise, Row } from './types';

/** Measures one thing over a run. */
export interface Acc {
  update(c: Ctx, rt: Runtime, dt: number): void;
  row(c: Ctx): Row;
}

const mmss = (t: number) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;

/** The powered stopping methods of Nowicki's model tests, in ship lengths, and the speed they began at [kn]. */
const POWERED = PUBLISHED.filter(p => p.key !== 'inertia').map(p => p.sd);
const TEST_KN = 12;

/** The three lines of a stop's debrief, from the track covered [m], the time [s] and the heading change [rad]. */
export function stopRows(L: number, path: number, time: number, heading: number): Row[] {
  return [
    { label: 'Track reach', you: `${(path / L).toFixed(1)} L`, ref: `${Math.min(...POWERED).toFixed(1)} to ${Math.max(...POWERED).toFixed(1)} L from about ${TEST_KN} kn, the powered methods in the model tests (Nowicki)` },
    { label: 'Time', you: mmss(time) },
    { label: 'Heading change', you: `${heading >= 0 ? '+' : '−'}${Math.abs(heading / DEG).toFixed(1)}°`, ref: 'a manual stop wanders unless the heading is watched (Nowicki)' },
  ];
}

/** Metrics by id: each makes a fresh accumulator for a run that starts in situation `c0`. */
export const METRICS: Record<string, (c0: Ctx) => Acc> = {
  /** Track reach, in ship lengths. */
  reach: c0 => {
    let path = 0;
    return {
      update: (c, _rt, dt) => { path += c.sog * dt; },
      row: c => stopRows(c.spec.L, path, 0, 0)[0],
    };
  },
  /** Time since the run began. */
  time: () => {
    let t = 0;
    return { update: (_c, _rt, dt) => { t += dt; }, row: () => ({ label: 'Time', you: mmss(t) }) };
  },
  /** Heading change since the run began. */
  heading: c0 => {
    let d = 0;
    return {
      update: c => { d = wrapAngle(c.psi - c0.psi); },
      row: () => stopRows(1, 0, 0, d)[2],
    };
  },
  /** Furthest she strayed from the line she began on. */
  offtrack: c0 => {
    let worst = 0;
    const s = Math.sin(c0.psi), c1 = Math.cos(c0.psi);
    return {
      update: c => { worst = Math.max(worst, Math.abs(-(c.pos.n - c0.pos.n) * s + (c.pos.e - c0.pos.e) * c1)); },
      row: c => ({ label: 'Off her track', you: `${worst.toFixed(0)} m (${(worst / c.spec.L).toFixed(2)} L)` }),
    };
  },
  /** The speed she landed at, from the first contact with the fenders. */
  landing: c0 => {
    let vn = NaN;
    return {
      update: (_c, rt) => { const ev = rt.contactLog.filter(e => e.t >= c0.t); if (Number.isNaN(vn) && ev.length) vn = ev[ev.length - 1].vn; },      // the log is newest first
      row: c => ({
        label: 'Landing speed', you: Number.isNaN(vn) ? 'not landed' : `${(vn * 100).toFixed(0)} cm/s`,
        ref: `the simulator's limit for her displacement is ${(approachSpeed(displacement(c.spec)) * 100).toFixed(0)} cm/s`,
      }),
    };
  },
  /** The most the fenders were squeezed, as a share of what they are rated for. */
  fender: c0 => {
    let worst = NaN;
    return {
      update: (_c, rt) => { for (const e of rt.contactLog) if (e.t >= c0.t && !(worst >= e.maxDefl)) worst = e.maxDefl; },
      row: () => ({ label: 'Fender squeeze', you: Number.isNaN(worst) ? '–' : `${(worst * 100).toFixed(0)} % of rated`, ref: 'rated deflection is 100 %' }),
    };
  },
  /** The worst closing speed in the last 30 m, against the guideline for that distance. */
  closing: () => {
    let worst = 0;
    return {
      update: c => { for (const q of c.quay) if (Number.isFinite(q.d) && q.d < 30 && q.d > 1) worst = Math.max(worst, q.closing / guideSpeed(c.spec, q.d)); },
      row: () => ({ label: 'Closing speed in the last 30 m', you: `${worst.toFixed(1)}× the guideline`, ref: 'the guideline is half the distance in cm/s (Ishihata): 1.0× is on it' }),
    };
  },
};

/** A run of an exercise: measures from the start or the first order, and says when it is over. */
export class ExRun {
  started: boolean;
  finished = false;
  timedOut = false;
  private accs: Acc[];
  private t0 = NaN;
  private last = NaN;
  private landedAt = NaN;
  private cmd0: { alpha: number; rpm: number }[];
  private c0: Ctx;

  constructor(readonly ex: Exercise, c0: Ctx) {
    this.c0 = c0;
    this.started = ex.begin === 'start';
    if (this.started) this.t0 = c0.t;
    this.accs = ex.metrics.map(id => METRICS[id](c0));
    this.cmd0 = c0.units.map(u => ({ alpha: u.cmdAlpha, rpm: u.cmdRpm }));
  }

  /** Simulated seconds since measuring began. */
  get elapsed() { return this.started ? Math.max(0, this.last - this.t0) : 0; }

  update(c: Ctx, rt: Runtime) {
    if (this.finished) return;
    const dt = Number.isNaN(this.last) ? 0 : Math.max(0, Math.min(2, c.t - this.last));
    this.last = c.t;
    if (!this.started) {
      const moved = c.units.some((u, i) => Math.abs(u.cmdRpm - this.cmd0[i].rpm) > 0.05 || Math.abs(wrapAngle(u.cmdAlpha - this.cmd0[i].alpha)) > 5 * DEG);
      if (!moved) return;
      this.started = true; this.t0 = c.t;
      this.accs = this.ex.metrics.map(id => METRICS[id]({ ...this.c0, t: c.t, psi: c.psi, pos: c.pos }));       // measure from here
    }
    for (const a of this.accs) a.update(c, rt, dt);
    const t = c.t - this.t0;
    if (this.ex.end === 'stopped' && t > 10 && c.sog < 0.5 * KN) this.finished = true;
    if (this.ex.end === 'landed') {
      if (Number.isNaN(this.landedAt) && rt.contactLog.some(e => e.t >= this.t0)) this.landedAt = c.t;
      if (!Number.isNaN(this.landedAt) && c.t - this.landedAt > 8) this.finished = true;      // let her settle on the fenders
    }
    if (!this.finished && t > this.ex.limit) { this.finished = true; this.timedOut = true; }
  }

  rows(c: Ctx): Row[] { return this.accs.map(a => a.row(c)); }
}
