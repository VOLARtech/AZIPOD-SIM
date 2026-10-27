// Mooring lines with winches, and harbour tugs.
import { KN } from './ship';
import type { Pt } from './contact';
import type { ShipState, Wrench } from './sim';

export type WinchMode = 'brake' | 'heave' | 'slack' | 'auto';
export type LineKind = 'head' | 'fwdBreast' | 'fwdSpring' | 'aftSpring' | 'aftBreast' | 'stern';
export interface MooringLine {
  kind: LineKind; name: string;
  fair: [number, number];          // fairlead, body [x, y]
  lead: number;                    // preferred lead along ship x from fairlead to bollard [m]
  state: 'stowed' | 'fast' | 'parted';
  bollard: number;                 // index into scenario bollards
  L0: number;                      // unstretched length [m]
  mode: WinchMode;
  T: number;                       // tension [N]
  peakT: number;
}
export const LINE = {
  EA: 1.1e7,         // axial stiffness [N], HMPE with nylon tail
  MBL: 1.0e6,        // minimum breaking load [N] (≈ 100 t)
  stall: 1.6e5,      // winch heaving stall pull [N]
  brake: 6.0e5,      // winch brake holding load [N] — renders above this
  auto: 1.0e5,       // auto-tension target [N]
  heave: 0.3,        // heave / pay-out speed [m/s]
  reach: 60,         // max fairlead–bollard distance to get a line ashore [m]
};

export function makeLines(L: number, B: number, xg: number, side: -1 | 1): MooringLine[] {
  const y = side * (B / 2 - 0.5);
  const mk = (kind: LineKind, name: string, x: number, lead: number): MooringLine =>
    ({ kind, name, fair: [x - xg, y], lead, state: 'stowed', bollard: -1, L0: 0, mode: 'brake', T: 0, peakT: 0 });
  return [
    mk('head', 'HEAD', L / 2 - 4, 35), mk('fwdBreast', 'FWD BREAST', L * 0.4, 0), mk('fwdSpring', 'FWD SPRING', L * 0.33, -40),
    mk('aftSpring', 'AFT SPRING', -L * 0.33, 40), mk('aftBreast', 'AFT BREAST', -L * 0.4, 0), mk('stern', 'STERN', -L / 2 + 2, -35),
  ];
}

const fairWorld = (st: ShipState, f: [number, number]): Pt => {
  const c = Math.cos(st.psi), s = Math.sin(st.psi);
  return [st.n + f[0] * c - f[1] * s, st.e + f[0] * s + f[1] * c];
};

/** Choose the bollard giving the line its proper lead, within reach. */
export function pickBollard(st: ShipState, line: MooringLine, bollards: Pt[]): number {
  const c = Math.cos(st.psi), s = Math.sin(st.psi);
  const [fn, fe] = fairWorld(st, line.fair);
  const tn = fn + line.lead * c, te = fe + line.lead * s;
  let best = -1, bd = Infinity;
  bollards.forEach(([bn, be], i) => {
    const d = Math.hypot(bn - fn, be - fe);
    if (d > LINE.reach) return;
    const score = Math.hypot(bn - tn, be - te);
    if (score < bd) { bd = score; best = i; }
  });
  return best;
}

export function passLine(st: ShipState, line: MooringLine, bollards: Pt[]): boolean {
  const b = pickBollard(st, line, bollards);
  if (b < 0) return false;
  const [fn, fe] = fairWorld(st, line.fair);
  line.bollard = b; line.state = 'fast'; line.mode = 'slack';
  line.L0 = Math.hypot(bollards[b][0] - fn, bollards[b][1] - fe) + 3;
  line.T = 0; line.peakT = 0;
  return true;
}

/** Line forces as a body wrench (used inside the integrator). */
export function lineForces(st: ShipState, lines: MooringLine[], bollards: Pt[], out?: number[]): Wrench {
  const c = Math.cos(st.psi), s = Math.sin(st.psi);
  let X = 0, Y = 0, N = 0;
  lines.forEach((l, i) => {
    if (l.state !== 'fast') { if (out) out[i] = 0; return; }
    const [fn, fe] = fairWorld(st, l.fair), [bn, be] = bollards[l.bollard];
    const dn = bn - fn, de = be - fe, d = Math.hypot(dn, de) || 1e-6;
    const strain = (d - l.L0) / l.L0;
    if (strain <= 0) { if (out) out[i] = 0; return; }
    // stretch rate for line damping
    const vN = c * st.u - s * st.v - st.r * (fe - st.e), vE = s * st.u + c * st.v + st.r * (fn - st.n);
    const ddot = -(vN * dn + vE * de) / d;
    const T = Math.max(0, LINE.EA * strain + 2e5 * ddot);
    const FN = T * dn / d, FE = T * de / d;
    const fx = c * FN + s * FE, fy = -s * FN + c * FE;
    X += fx; Y += fy; N += l.fair[0] * fy - l.fair[1] * fx;
    if (out) out[i] = T;
  });
  return { X, Y, N };
}

/** Winch behaviour per step. Returns names of lines that parted. */
export function updateWinches(lines: MooringLine[], dt: number): string[] {
  const parted: string[] = [];
  for (const l of lines) {
    if (l.state !== 'fast') continue;
    l.peakT = Math.max(l.peakT, l.T);
    if (l.T > LINE.MBL) { l.state = 'parted'; l.T = 0; parted.push(l.name); continue; }
    if (l.mode === 'heave' && l.T < LINE.stall) l.L0 = Math.max(4, l.L0 - LINE.heave * dt);
    else if (l.mode === 'slack') l.L0 += LINE.heave * 1.5 * dt;
    else if (l.mode === 'auto') {
      if (l.T < LINE.auto * 0.8) l.L0 = Math.max(4, l.L0 - LINE.heave * dt);
      else if (l.T > LINE.auto * 1.4) l.L0 += LINE.heave * dt;
    }
    // brake renders (slips) above holding load in every mode
    if (l.T > LINE.brake) l.L0 += 0.4 * dt * (l.T / LINE.brake - 1) * 10;
  }
  return parted;
}

// ---------------------------------------------------------------- tugs
export interface Tug {
  name: string;
  x: number;                 // attachment point, body x [m]
  side: -1 | 1;              // side the tug works on
  order: number;             // −1..1: + pushes toward the far side (i.e. −side), − pulls on the line
  F: number;                 // actual force along body y [N], + = to starboard
  repos: number;             // seconds left repositioning (push ↔ pull)
  Fmax: number;              // bollard pull [N]
}
export function makeTugs(L: number, xg: number, side: -1 | 1): Tug[] {
  return [
    { name: 'TUG FWD', x: L * 0.36 - xg, side, order: 0, F: 0, repos: 0, Fmax: 400e3 },
    { name: 'TUG AFT', x: -L * 0.36 - xg, side, order: 0, F: 0, repos: 0, Fmax: 400e3 },
  ];
}
/** Tug response: ~20 s to change power, ~60 s to switch between pushing and pulling. */
export function updateTugs(tugs: Tug[], u: number, dt: number) {
  const eff = Math.max(0, 1 - (u / (6 * KN)) ** 2);
  for (const t of tugs) {
    // + order pushes the ship away from the tug's side
    const target = -t.side * t.order * t.Fmax * eff;
    if (t.repos > 0) { t.repos -= dt; t.F *= Math.max(0, 1 - dt / 3); continue; }
    if (target * t.F < 0 && Math.abs(t.F) > 1e3) { t.repos = 60; continue; }
    const rate = t.Fmax / 20 * dt;
    t.F += Math.max(-rate, Math.min(rate, target - t.F));
  }
}
export function tugForces(tugs: Tug[]): Wrench {
  let Y = 0, N = 0;
  for (const t of tugs) { Y += t.F; N += t.x * t.F; }
  return { X: 0, Y, N };
}
