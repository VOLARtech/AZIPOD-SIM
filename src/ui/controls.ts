// Control feel shared by every lever, slider and dial in the sim: a zero deadband with a stop you can feel,
// azimuth detents, and a snap onto dead ahead and dead astern. Raw drag positions go in; the clean order
// that reaches the ship comes out. No DOM here: feedback goes through the sink the app plugs in (onFeel).

/** Tuning, shared by every control unless one passes its own. */
export const CONTROL = {
  /** Half-width of the zero deadband on levers and sliders, as a fraction of full travel (±3–5 % is usual). */
  deadzoneThreshold: 0.04,
  /** The deadband is left only this much further out, so resting on its edge does not chatter. */
  deadzoneHysteresis: 0.02,
  /** Lever step felt while moving, as a fraction of full travel. */
  leverStep: 0.1,
  /** Azimuth and helm detent felt while turning, degrees. */
  angleStepDegrees: 5,
  /** Snap window around dead ahead (000°) and dead astern (180°), degrees either side. */
  cardinalSnapDegrees: 3,
  /** The snap is let go only this much further out, degrees. */
  cardinalHysteresisDegrees: 1.5,
  /** Vibrate on detents (the user's haptics setting must also be on). The click sound plays either way. */
  enableHaptics: true,
};

/** zero: the neutral stop (firm). cardinal: dead ahead or astern (pronounced). step: a detent passed (subtle). */
export type Feel = 'zero' | 'cardinal' | 'step';
let sink: (k: Feel, vibrate: boolean) => void = () => {};
/** The app connects sound and vibration here once at start-up. */
export function onFeel(f: (k: Feel, vibrate: boolean) => void) { sink = f; }
const feel = (k: Feel) => sink(k, CONTROL.enableHaptics);

const DEG = Math.PI / 180;
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
const round2 = (v: number) => Math.round(v * 100) / 100;

export interface LinearOpts { min?: number; max?: number; deadzone?: number; step?: number; quiet?: boolean }

/**
 * A lever or slider through zero: −min..max of travel, a deadband at zero that reads exactly 0, one firm
 * click on entering it (not again until the lever has properly left it), a light click every step.
 */
export class LinearDetent {
  private inZero = true;
  private last = 0;
  constructor(private o: LinearOpts = {}) {}
  private get dz() { return this.o.deadzone ?? CONTROL.deadzoneThreshold; }
  /** Start of a drag: take up wherever the order actually is (keys or ZERO may have moved it). */
  begin(current: number) { this.last = current; this.inZero = current === 0; }
  /** Raw position (fraction of travel) → the order to send. */
  update(raw: number): number {
    const lo = -(this.o.min ?? 1), hi = this.o.max ?? 1;
    const x = Math.max(lo, Math.min(hi, raw)), a = Math.abs(x);
    const wasZero = this.inZero;
    this.inZero = this.inZero ? a <= this.dz + CONTROL.deadzoneHysteresis : a <= this.dz;
    const v = this.inZero ? 0 : round2(x);
    const step = this.o.step ?? CONTROL.leverStep;
    if (this.o.quiet) { /* an axis of a 2-D control: the control gives the feedback */ }
    else if (this.inZero && !wasZero) feel('zero');
    else if (!this.inZero && Math.floor(v / step) !== Math.floor(this.last / step)) feel('step');
    this.last = v;
    return v;
  }
  /** End of a drag: inside the deadband it locks to 0, anywhere else it stays where it was let go. */
  release(raw: number): number {
    if (Math.abs(raw) <= this.dz + CONTROL.deadzoneHysteresis) { if (!this.inZero && !this.o.quiet) feel('zero'); this.inZero = true; this.last = 0; }
    return this.last;
  }
}

export interface AngleOpts { cardinals?: number[]; step?: number; snap?: number; min?: number; max?: number }

/**
 * An azimuth dial or helm: 1° resolution, a light click every detent step, and a snap onto the cardinal
 * angles (dead ahead and dead astern by default) with a firmer click. Angles in radians.
 */
export class AngleDetent {
  private snapped: number | null = null;
  private last = 0;
  constructor(private o: AngleOpts = {}) {}
  private get cards() { return this.o.cardinals ?? [0, Math.PI]; }
  begin(current: number) {
    this.last = current;
    this.snapped = this.cards.find(c => Math.abs(wrap(current - c)) < 1e-6) ?? null;
  }
  /** Raw angle → the order to send: snapped onto a cardinal, or whole degrees. */
  update(raw: number): number {
    let a = wrap(raw);
    if (this.o.min !== undefined) a = Math.max(this.o.min, a);
    if (this.o.max !== undefined) a = Math.min(this.o.max, a);
    const snap = (this.o.snap ?? CONTROL.cardinalSnapDegrees) * DEG, hold = snap + CONTROL.cardinalHysteresisDegrees * DEG;
    const was = this.snapped;
    if (this.snapped !== null && Math.abs(wrap(a - this.snapped)) > hold) this.snapped = null;
    if (this.snapped === null) this.snapped = this.cards.find(c => Math.abs(wrap(a - c)) <= snap) ?? null;
    const v = this.snapped !== null ? wrap(this.snapped) : Math.round(a / DEG) * DEG;
    const step = (this.o.step ?? CONTROL.angleStepDegrees) * DEG;
    const bin = (x: number) => Math.floor((wrap(x) + Math.PI + 1e-9) / step);
    if (this.snapped !== null && this.snapped !== was) feel('cardinal');
    else if (this.snapped === null && bin(v) !== bin(this.last)) feel('step');
    this.last = v;
    return v;
  }
  /** End of a drag: the order stays exactly where it was, snapped or not. */
  release(): number { return this.last; }
}

/** A −100..100 range input (thrusters, yaw) with the zero deadband: the thumb jumps to 0 and stays there. */
export function detentSlider(el: HTMLInputElement, write: (v: number) => void, read: () => number, o: LinearOpts = {}) {
  const d = new LinearDetent(o);
  let dragging = false;
  const put = (v: number) => { el.value = String(Math.round(v * 100)); write(v); };
  el.addEventListener('pointerdown', () => { dragging = true; d.begin(read()); });
  el.addEventListener('input', () => { if (!dragging) d.begin(read()); put(d.update(+el.value / 100)); });
  const end = () => { if (!dragging) return; dragging = false; put(d.release(+el.value / 100)); };
  el.addEventListener('pointerup', end); el.addEventListener('pointercancel', end); el.addEventListener('change', end);
  el.addEventListener('dblclick', () => { d.begin(0); put(0); });
  return d;
}
