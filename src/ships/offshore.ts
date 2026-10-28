// Offshore ships on dynamic positioning. Particulars typical of their classes, not one ship's data;
// hull forces from Clarke's regression. Origin at the CG (positions from midship minus xg).
import { DEG } from '../physics/consts';
import type { PodSpec, ShipSpec } from '../physics/ship';
import { POD_DEFAULTS, rudder, shaftUnit } from './base';

const azi = (label: string, x: number, y: number, Tb: number, P: number, D: number, forbid: [number, number][], tol = 0): PodSpec => ({
  label, kind: 'azimuth', x, y, Tb, P, D, strutArea: 2.5, asternFrac: 0.6, slewMul: 1 + tol * 0.04, thrustMul: 1 - tol * 0.015, alphaOffset: tol * 0.3 * DEG,
  azimuth: { nozzle: true, pusher: true, rpmTime: 8, slew: 12 * DEG }, dpForbid: forbid,
});
const sector = (c: number, half: number): [number, number] => [(c - half) * DEG, (c + half) * DEG];

/** Platform supply vessel, 88 m, DP2: two azimuths aft, a retractable azimuth and two tunnel thrusters forward. */
const PSV_XG = -2;
export const PSV: ShipSpec = {
  ...POD_DEFAULTS,
  id: 'psv', name: 'Platform supply vessel 88 m · DP2', type: 'psv', station: 'dp', load: 'loaded, 4 000 t deck cargo and tanks',
  note: 'Typical 88 m diesel-electric platform supply vessel (DP class 2): two 2.2 MW azimuth thrusters aft, a 0.9 MW retractable azimuth and two 0.9 MW tunnel thrusters forward, four 1.8 MW generators. Thrust allocation over every unit with forbidden sectors (aft units never wash each other, the retractable unit keeps its wash off the hull transducers), PID station keeping with wind feed-forward, three position references with median voting. Hull forces from Clarke\'s regression.',
  LOA: 88, vmaxKn: 14,
  L: 81, B: 19, T: 6.2, Cb: 0.72, xg: PSV_XG,
  pods: [
    azi('PORT AZ', -0.47 * 81 - PSV_XG, -4.6, 340e3, 2.2e6, 3.0, [sector(-90, 18)]),
    azi('STBD AZ', -0.47 * 81 - PSV_XG, 4.6, 340e3, 2.2e6, 3.0, [sector(90, 18)], 1),
    azi('RETRACT', 0.36 * 81 - PSV_XG, 0, 120e3, 0.9e6, 1.8, [sector(180, 25)]),
  ],
  bowThruster: { x: 0.44 * 81 - PSV_XG, Tmax: 2 * 110e3, P: 2 * 0.9e6 },
  windage: { AF: 340, AL: 1150, cx: 0.85, cy: 0.9, cn: 0.08, xw: 16 },
  wake: 0.12, tded: 0.1, Vzero: 17, Cd: 0.9, formFactor: 1.3, cwMul: 1.6,
  podSlew: 12 * DEG, podRpmTime: 8, asternMax: 0, revInterlock: 1,
  btRpmTime: 6, powerAvail: 6.8e6, bridgeX: 0.3 * 81 - PSV_XG,
  roll: { GM: 1.9, KG: 7.6, kxx: 7.2, zWind: 7, vanish: 62 * DEG },
  look: {
    freeboard: 2.6, bridgeH: 17, bridgeLen: 6, wingOut: 0.4,
    decks: [{ x0: 0.12 * 81, x1: 0.47 * 81, h: 9.5, inset: 0.3 }, { x0: 0.16 * 81, x1: 0.44 * 81, h: 13, inset: 0.9 }],
    funnel: { x: 0.12 * 81, h: 20, w: 2.2, l: 3 },
    hull: '#b3232a', topsides: '#b3232a', super: '#f4f4f0', glass: '#1d2731', accent: '#1d2731',
  },
};

/** Anchor-handling tug supply vessel, 80 m: twin CPP with flap rudders, tunnels fore and aft, retractable azimuth. */
const AH_XG = -1.5;
export const AHTS: ShipSpec = {
  ...POD_DEFAULTS,
  id: 'ahts', name: 'Anchor-handling tug supply 80 m · DP2', type: 'ahts', station: 'dp', load: 'operating draught',
  note: 'Typical 80 m anchor-handling tug supply vessel, 200 t bollard pull: two 6 MW geared diesels on controllable-pitch propellers in nozzles with flap rudders, two bow and two stern tunnel thrusters and a retractable azimuth. On DP the propellers give the fore-and-aft force, the tunnels and the azimuth the side force and turning; the rudders stay amidships. Hull forces from Clarke\'s regression.',
  LOA: 80, vmaxKn: 16,
  L: 72, B: 18, T: 6.5, Cb: 0.66, xg: AH_XG,
  pods: (['PORT', 'STBD'] as const).map((side, k) => shaftUnit(side, k ? 5.2 : -5.2, {
    D: 4.0, k0: 0.62, k1: -0.42, k2: -0.12, KQ0: 0.095, asternFrac: 0.62,
    tP: 0.1, wP0: 0.18, xP: -0.45 * 72 - AH_XG, hand: k ? 1 : -1, kTTah: 0.01, kTTas: 0.04,
    cpp: { pitchTime: 10, asternPitch: 0.85 },
  }, { type: 'geared', P: 6e6, n: 160 / 60, nMin: 0.6, loadTime: 30, I: 3e4 },
  rudder({ type: 'flap', A: 9, H: 4.2, xR: -0.48 * 72 - AH_XG, rate: 4.5 * DEG, aH: 0.2, tR: 0.3, gammaP: 0.5, gammaM: 0.45, lR: -0.95, eps: 0.95 }),
  { ahead: [0.2, 0.4, 0.6, 0.8, 1], astern: [0.2, 0.4, 0.6, 0.8, 1] })).concat([
    azi('RETRACT', 0.35 * 72 - AH_XG, 0, 160e3, 1.2e6, 2.0, [sector(180, 25)]),
  ]),
  bowThruster: { x: 0.44 * 72 - AH_XG, Tmax: 2 * 125e3, P: 2 * 1.0e6 },
  sternThruster: { x: -0.4 * 72 - AH_XG, Tmax: 2 * 95e3, P: 2 * 0.8e6 },
  windage: { AF: 300, AL: 900, cx: 0.85, cy: 0.9, cn: 0.08, xw: 14 },
  wake: 0.15, tded: 0.1, Vzero: 9, Cd: 0.9, formFactor: 1.35, cwMul: 7,
  podSlew: 12 * DEG, podRpmTime: 8, asternMax: 0, revInterlock: 1,
  btRpmTime: 6, powerAvail: 3.2e6, bridgeX: 0.3 * 72 - AH_XG,
  roll: { GM: 1.6, KG: 7.2, kxx: 6.8, zWind: 6.5, vanish: 58 * DEG },
  towPoints: [{ name: 'TOW PINS', x: -0.47 * 72 - AH_XG, h: 2.4 }],
  look: {
    freeboard: 2.3, bridgeH: 16, bridgeLen: 6, wingOut: 0.4,
    decks: [{ x0: 0.08 * 72, x1: 0.47 * 72, h: 9, inset: 0.3 }, { x0: 0.12 * 72, x1: 0.44 * 72, h: 12.5, inset: 0.9 }],
    funnel: { x: 0.1 * 72, h: 19, w: 2.2, l: 3 },
    hull: '#1f3f6b', topsides: '#1f3f6b', super: '#f4f4f0', glass: '#1d2731', accent: '#e2a91b',
  },
};
