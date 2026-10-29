// Tugs as own ship. Particulars typical of their types; hull forces from Clarke's regression
// (stretched to L/B ≈ 2.3, where it is extrapolating) plus the skeg as a lifting surface.
import { DEG } from '../physics/consts';
import type { PodSpec, ShipSpec } from '../physics/ship';

const unit = (label: string, kind: 'azimuth' | 'vsp', x: number, y: number, Tb: number, P: number, D: number, area: number, tol = 0): PodSpec => ({
  label, kind, x, y, Tb, P, D, strutArea: area, asternFrac: 0.7, slewMul: 1 + tol * 0.04, thrustMul: 1 - tol * 0.02, alphaOffset: tol * 0.3 * DEG,
  ...(kind === 'vsp' ? { vsp: { R: D / 2, rpmTime: 10, respT: 2.5 } } : { azimuth: { nozzle: true, pusher: true, rpmTime: 6, slew: 20 * DEG } }),
});
const TUG_COMMON = {
  wake: 0.05, tded: 0.05, ramK: 0.85, podRpmTime: 6, asternMax: 0, revInterlock: 1,
  bowThruster: { x: 0, Tmax: 0, P: 0 }, btRpmTime: 5, powerAvail: 1e9, Cd: 1.0, formFactor: 1.5,
  type: 'tug', hullForm: 'tug' as const,
} satisfies Partial<ShipSpec>;

/** ASD harbour and escort tug, 32 m, 80 t bollard pull: two nozzled Z-drives aft, skeg forward. */
export const ASD_TUG: ShipSpec = {
  ...TUG_COMMON,
  id: 'asd-tug', name: 'ASD tug 32 m · 80 t', station: 'asd', load: 'operating draught',
  note: 'Typical 32 m azimuth-stern-drive harbour and escort tug: two 2.6 MW Z-drives in nozzles (pushing, slewing 20°/s, they turn rather than reverse), a skeg under the bow for indirect escort, towing winch forward and a hook aft. Hull draught 4.3 m (about 830 t); the drives reach 5 m. Hull forces from Clarke\'s regression stretched to a tug\'s L/B, plus the skeg as a lifting surface; heel from the towline and hull forces.',
  LOA: 32, vmaxKn: 13,
  L: 29, B: 13, T: 5.0, Cb: 0.5, xg: 0, hullT: 4.3,
  pods: [unit('PORT', 'azimuth', -11.5, -3.4, 413e3, 2.6e6, 2.8, 3.5), unit('STBD', 'azimuth', -11.5, 3.4, 413e3, 2.6e6, 2.8, 3.5, 1)],
  podSlew: 20 * DEG, Vzero: 8.2,
  skeg: { x: 9, A: 16 },
  windage: { AF: 120, AL: 240, cx: 0.8, cy: 0.9, cn: 0.08, xw: 3 },
  bridgeX: 2,
  roll: { GM: 2.6, KG: 4.4, kxx: 4.9, zWind: 4, vanish: 70 * DEG },
  towPoints: [{ name: 'FWD WINCH', x: 12.5, h: 4.0 }, { name: 'AFT HOOK', x: -8, h: 3.4 }],
  look: {
    freeboard: 2.4, bridgeH: 10.5, bridgeLen: 5, wingOut: 0.3,
    decks: [{ x0: -4, x1: 9, h: 5.6, inset: 1.2 }, { x0: -2, x1: 7, h: 8.2, inset: 2.4 }],
    funnel: { x: -5.5, h: 13, w: 2.6, l: 2.2 },
    hull: '#1c2226', topsides: '#a3161c', super: '#f2f2ee', glass: '#20282f', accent: '#1c2226',
  },
};

/** Voith water tractor, 31.5 m, 70 t: two VSP forward, big skeg aft, towing point aft. */
export const VSP_TUG: ShipSpec = {
  ...TUG_COMMON,
  id: 'vsp-tug', name: 'Voith tractor tug 31 m · 70 t', station: 'vsp', load: 'operating draught',
  note: 'Typical 31.5 × 12.5 m Voith water tractor (two VSP 32R5/265-2 class units, 2 × 2.67 MW, 70 t bollard pull): propulsion forward, a large skeg aft, towing point aft. The cycloidal propellers set their thrust vector directly, in any direction, in a couple of seconds. The hull itself is flat (2.9 m); the propellers, their guard plate and the fin reach 5 m. Hull forces from Clarke\'s regression for the hull (about 680 t), plus the fin as a lifting surface: it keeps her on course and puts the pivot point aft, so thrust at the bow turns her about the fin.',
  LOA: 31.5, vmaxKn: 12.5,
  L: 29.5, B: 12.5, T: 5.0, Cb: 0.62, xg: 0, hullT: 2.9,
  pods: [unit('PORT', 'vsp', 5.2, -3.0, 360e3, 2.67e6, 3.2, 5), unit('STBD', 'vsp', 5.2, 3.0, 360e3, 2.67e6, 3.2, 5, 1)],
  podSlew: 30 * DEG, Vzero: 9,
  skeg: { x: -9, A: 28 },
  windage: { AF: 115, AL: 230, cx: 0.8, cy: 0.9, cn: 0.08, xw: 2 },
  bridgeX: 3,
  roll: { GM: 2.4, KG: 4.6, kxx: 4.75, zWind: 4, vanish: 68 * DEG },
  towPoints: [{ name: 'AFT WINCH', x: -11, h: 3.8 }],
  look: {
    freeboard: 2.6, bridgeH: 10.5, bridgeLen: 5, wingOut: 0.3,
    decks: [{ x0: -3, x1: 10, h: 5.8, inset: 1.2 }, { x0: -1, x1: 8, h: 8.2, inset: 2.4 }],
    funnel: { x: -4.5, h: 13, w: 2.6, l: 2.2 },
    hull: '#1c2226', topsides: '#e8a31b', super: '#f2f2ee', glass: '#20282f', accent: '#1c2226',
  },
};

/** Rotor tug, 32 m, 80 t: three azimuth thrusters, two forward and one aft. */
export const ROTOR_TUG: ShipSpec = {
  ...TUG_COMMON,
  id: 'rotor-tug', name: 'Rotor tug 32 m · 80 t', station: 'asd', load: 'operating draught',
  note: 'Typical 32 m rotor tug: three azimuth thrusters (two forward, one aft, 3 × 2.0 MW) give the same push or pull in every direction and keep working if one fails. Towing points fore and aft. Hull draught 3.8 m (about 770 t); the thrusters reach 5.2 m. Hull forces from Clarke\'s regression stretched to a tug.',
  LOA: 32, vmaxKn: 12.5,
  L: 30, B: 13.2, T: 5.2, Cb: 0.5, xg: 0, hullT: 3.8,
  pods: [unit('PORT FWD', 'azimuth', 7, -3.3, 322e3, 2.0e6, 2.5, 3), unit('STBD FWD', 'azimuth', 7, 3.3, 322e3, 2.0e6, 2.5, 3, 1), unit('AFT', 'azimuth', -11, 0, 322e3, 2.0e6, 2.5, 3)],
  podSlew: 20 * DEG, Vzero: 9.5,
  skeg: { x: 2, A: 6 },
  windage: { AF: 120, AL: 240, cx: 0.8, cy: 0.9, cn: 0.08, xw: 2 },
  bridgeX: 2,
  roll: { GM: 2.7, KG: 4.5, kxx: 5, zWind: 4, vanish: 70 * DEG },
  towPoints: [{ name: 'FWD WINCH', x: 12.5, h: 4.0 }, { name: 'AFT WINCH', x: -9, h: 3.6 }],
  look: {
    freeboard: 2.4, bridgeH: 10.5, bridgeLen: 5, wingOut: 0.3,
    decks: [{ x0: -4, x1: 9, h: 5.6, inset: 1.2 }, { x0: -2, x1: 7, h: 8.2, inset: 2.4 }],
    funnel: { x: -5.5, h: 13, w: 2.6, l: 2.2 },
    hull: '#1c2226', topsides: '#f07c00', super: '#f2f2ee', glass: '#20282f', accent: '#1c2226',
  },
};
