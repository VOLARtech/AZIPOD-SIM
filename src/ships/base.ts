// Helpers for ship data files: defaults for the fields that only matter to pod ships,
// and standard MMG-style rudder / propeller blocks scaled from main dimensions.
import { DEG } from '../physics/consts';
import type { EngineSpec, PodSpec, PropellerSpec, RudderSpec, RudderType, ShaftSpec, ShipSpec } from '../physics/ship';

/** Fields every ShipSpec carries for the pod model; harmless defaults for non-pod ships. */
export const POD_DEFAULTS = {
  wake: 0.1, tded: 0.1, Vzero: 20, podSlew: 7.5 * DEG, podRpmTime: 30, asternMax: 0.83, revInterlock: 0.28, ramK: 0.85,
} satisfies Partial<ShipSpec>;

/** Fujii's normal-force gradient for a rudder of aspect ratio Λ = H²/A. */
export const fujii = (H: number, A: number) => { const lam = H * H / A; return 6.13 * lam / (lam + 2.25); };

/**
 * A rudder with MMG-standard interaction constants. Values are the KVLCC2 set
 * (Yasukawa & Yoshimura 2015) unless given; for other hulls they are a reasonable start,
 * flagged in the ship's provenance note.
 */
export function rudder(o: { type?: RudderType; A: number; H: number; xR: number; xH?: number; max?: number; rate?: number } & Partial<RudderSpec>): RudderSpec {
  const type = o.type ?? 'conventional';
  const max = o.max ?? (type === 'schilling' ? 70 : type === 'flap' ? 45 : 35) * DEG;
  return {
    type, A: o.A, H: o.H, xR: o.xR, fa: o.fa ?? fujii(o.H, o.A) * (type === 'flap' ? 1.25 : type === 'schilling' ? 1.15 : 1),
    max, rate: o.rate ?? 2.32 * DEG,
    tR: o.tR ?? 0.387, aH: o.aH ?? 0.312, xH: o.xH ?? o.xR * 0.93,
    gammaP: o.gammaP ?? 0.64, gammaM: o.gammaM ?? 0.395, lR: o.lR ?? -0.71, eps: o.eps ?? 1.09, kappa: o.kappa ?? 0.5,
  };
}

/** One shaft unit as a PodSpec. P is the engine MCR (the pod fields are unused for shafts). */
export function shaftUnit(label: string, y: number, prop: PropellerSpec, engine: EngineSpec, rud: RudderSpec | undefined,
                          telegraph: ShaftSpec['telegraph']): PodSpec {
  return {
    label, kind: 'shaft', x: prop.xP, y, Tb: 0, asternFrac: prop.asternFrac, strutArea: 0, D: prop.D, P: engine.P,
    slewMul: 1, thrustMul: 1, alphaOffset: 0,
    shaft: { prop, engine, rudder: rud, telegraph },
  };
}

/** Standard bridge telegraph rpm table (fraction of MCR rpm): dead slow → navigation full. */
export const TELEGRAPH_2S = { ahead: [0.3, 0.42, 0.55, 0.72, 1.0], astern: [0.3, 0.42, 0.55, 0.72, 0.8] };

/** Air-start system with classification-society capacity (12 consecutive starts, alternating). */
export const AIR_2S = { pMax: 30, pMin: 12, dpAhead: 1.2, dpAstern: 1.8, refill: 1.2, firing: 0.15, torque: 0.6, maxT: 8 };
