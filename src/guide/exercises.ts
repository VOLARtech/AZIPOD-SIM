// Guided exercises: a scenario, a ship and objectives, ending in a debrief that sets what the player did
// beside a reference. There is no score and no pass or fail: no authoritative numeric standard exists for
// these manoeuvres, so a grade would be invented. The debrief reports; the player judges.
import { approachSpeed, displacement } from '../physics/berths';
import { DEG, KN } from '../physics/consts';
import type { Runtime } from '../physics/runtime';
import { wrapAngle } from '../physics/ship';
import { PUBLISHED } from '../physics/validation';
import { TUG_FADE } from '../physics/mooring';
import { AIR_BRAKE_N } from '../physics/units/shaft';
import { guideSpeed } from './align';
import { wayOff } from './context';
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

/** Metrics for the tug track. */
Object.assign(METRICS, {
  /** The worst heel, against the angle at which the deck edge goes under. */
  heel: () => {
    let worst = 0, edge = NaN;
    return {
      update: (c: Ctx) => { if (c.heel) { worst = Math.max(worst, Math.abs(c.heel.phi)); edge = c.heel.edge; } },
      row: (): Row => ({ label: 'Peak heel', you: `${(worst / DEG).toFixed(0)}° (deck edge at ${(edge / DEG).toFixed(0)}°)`, ref: 'every escort tug has a maximum allowable heel angle in its stability book (Robert Allan)' }),
    };
  },
  /** The worst tension in the towline, against its breaking load. */
  tension: () => {
    let worst = 0, mbl = NaN;
    return {
      update: (c: Ctx) => { if (c.tow) { worst = Math.max(worst, c.tow.T); mbl = c.tow.mbl; } },
      row: (): Row => ({ label: 'Peak line tension', you: `${(worst / 9.81e3).toFixed(0)} t (${(100 * worst / mbl).toFixed(0)} % of its breaking load)`, ref: 'a line at up to 45° to the ship can put 140 % of the bollard pull on the deck fitting (Robert Allan)' }),
    };
  },
  /** Whether the line was let go. */
  released: () => {
    let gone = false;
    return {
      update: (c: Ctx) => { if (c.tow?.released || c.tow?.parted) gone = true; },
      row: (): Row => ({ label: 'Line let go', you: gone ? 'yes' : 'no', ref: 'where girting is suspected or about to happen the towline must be released immediately (Milford Haven)' }),
    };
  },
  /** How far the escorted ship's heading strayed from her course. */
  swing: () => {
    let worst = 0;
    return {
      update: (c: Ctx) => { if (c.tow) worst = Math.max(worst, Math.abs(c.tow.dev)); },
      row: (): Row => ({ label: 'Escorted ship\'s swing', you: `${(worst / DEG).toFixed(0)}° off her course` }),
    };
  },
  /** The fastest the ship went while any assist tug was working. */
  tugspeed: () => {
    let worst = 0;
    return {
      update: (c: Ctx) => { if (c.tugs.some(t => Math.abs(t.F) > 1e3)) worst = Math.max(worst, Math.abs(c.u)); },
      row: (): Row => ({ label: 'Fastest with a tug working', you: `${(worst / KN).toFixed(1)} kn`, ref: `5 to 8 kn is accepted for making fast (Milford Haven); the tugs in this model have no grip at ${(TUG_FADE / KN).toFixed(0)} kn` }),
    };
  },
});

/** Metrics for the specialised-propulsion track. */
Object.assign(METRICS, {
  /** Track reach in ship lengths, against the IMO crash-stop criterion. */
  reachimo: () => {
    let path = 0;
    return {
      update: (c: Ctx, _rt: Runtime, dt: number) => { path += c.sog * dt; },
      row: (c: Ctx): Row => ({ label: 'Track reach', you: `${(path / c.spec.L).toFixed(1)} L`, ref: 'the IMO criterion is under 15 L in a full astern crash stop; up to 20 L for low-powered large-displacement vessels, with approval (via ABS)' }),
    };
  },
  /** Heading change since the run began, with nothing said about it: a ship with way on that goes astern may sheer off her heading. */
  turned: (c0: Ctx) => {
    let d = 0;
    return {
      update: (c: Ctx) => { d = wrapAngle(c.psi - c0.psi); },
      row: (): Row => ({ label: 'Heading change', you: `${d >= 0 ? '+' : '−'}${Math.abs(d / DEG).toFixed(0)}°` }),
    };
  },
  /** How long the engine took to start astern after the first order. */
  astern: () => {
    let t = 0, at = NaN;
    return {
      update: (c: Ctx, _rt: Runtime, dt: number) => { t += dt; if (Number.isNaN(at) && c.units.some(u => u.rpm < -0.02)) at = t; },
      row: (): Row => ({ label: 'Shaft turning astern after', you: Number.isNaN(at) ? 'not yet' : `${Math.round(at)} s`, ref: `brake air is given once the rpm is below 40 % of MCR (marinesite.info); in the model the astern start waits for the shaft to fall to ${Math.round(AIR_BRAKE_N * 100)} %` }),
    };
  },
  /** The furthest she strayed from her DP set point in auto position: as the console showed it, and in truth (references drifting together fool the console, not the ship). */
  dperr: () => {
    let shown = 0, truth = 0;
    return {
      update: (c: Ctx, rt: Runtime) => {
        if (c.dp?.mode !== 'auto' || !rt.dps) return;
        shown = Math.max(shown, c.dp.err);
        truth = Math.max(truth, Math.hypot(rt.state.n - rt.dps.sp.n, rt.state.e - rt.dps.sp.e));
      },
      row: (): Row => ({ label: 'Furthest off her set point', you: `${truth.toFixed(1)} m in truth, ${shown.toFixed(1)} m on the console`, ref: 'the console follows the voted references, so a drift they share does not show on it' }),
    };
  },
  /** The hardest any thruster was worked. */
  dputil: () => {
    let worst = 0;
    return { update: (c: Ctx) => { if (c.dp?.mode === 'auto') worst = Math.max(worst, c.dp.util); }, row: (): Row => ({ label: 'Thruster use, at most', you: `${(worst * 100).toFixed(0)} %`, ref: 'a class 2 ship is meant to keep enough in hand that losing one unit does not lose her position' }) };
  },
  /** How long the demand was beyond what the thrusters could give. */
  dplimit: () => {
    let secs = 0;
    return {
      update: (c: Ctx, _rt: Runtime, dt: number) => { if (c.dp?.mode === 'auto' && c.dp.limit) secs += dt; },
      row: (): Row => ({ label: 'Beyond her thrusters for', you: `${Math.round(secs)} s`, ref: 'a class 2 system is meant to survive any single fault in an active component (IMO MSC/Circ.645, as summarised by Wikipedia)' }),
    };
  },
});

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
    if (this.ex.end === 'stopped' && t > 10 && wayOff(c)) this.finished = true;
    if (this.ex.end === 'landed') {
      if (Number.isNaN(this.landedAt) && rt.contactLog.some(e => e.t >= this.t0)) this.landedAt = c.t;
      if (!Number.isNaN(this.landedAt) && c.t - this.landedAt > 8) this.finished = true;      // let her settle on the fenders
    }
    if (this.ex.end === 'time' && t >= this.ex.limit) this.finished = true;
    if (!this.finished && t > this.ex.limit) { this.finished = true; this.timedOut = true; }
  }

  rows(c: Ctx): Row[] { return this.accs.map(a => a.row(c)); }
}
