// Inland, naval and special ships. Particulars typical of their types, not one ship's data; hull
// forces from Clarke's regression (the push convoy and the icebreaker sit at the edge of its range).
// Origin at the CG (positions from midship minus xg).
import { DEG } from '../physics/consts';
import type { PodSpec, ShipSpec } from '../physics/ship';
import { POD_DEFAULTS, rudder, shaftUnit } from './base';
import { PANAMAX } from './cargo';

const LEVERS = { ahead: [0.2, 0.4, 0.6, 0.8, 1], astern: [0.2, 0.4, 0.6, 0.8, 1] };

/** Polar icebreaker, 110 m: three Azipods, icebreaking bow (Lindqvist level-ice resistance). */
const IB_XG = -2;
const pod = (label: string, x: number, y: number, Tb: number, P: number, tol = 0): PodSpec =>
  ({ label, x, y, Tb, asternFrac: 0.8, strutArea: 18, D: 4.2, P, slewMul: 1 + tol * 0.04, thrustMul: 1 - tol * 0.02, alphaOffset: tol * 0.3 * DEG });
export const ICEBREAKER: ShipSpec = {
  ...POD_DEFAULTS,
  id: 'icebreaker', name: 'Icebreaker 110 m · 3 Azipods', type: 'icebreaker', station: 'asd', load: 'operating draught',
  note: 'Typical 110 m Baltic/polar icebreaker: three Azipods (2 × 6.5 MW wing units, 6 MW centre), diesel-electric, a sloping icebreaking bow (stem 25°, waterline entrance 30°). Level-ice resistance from Lindqvist (1989): crushing, bending and submersion of the broken ice, rising with speed; behind her the broken channel offers a fraction of it. Turning and sideways motion in unbroken ice are resisted much harder. Hull forces in open water from Clarke\'s regression.',
  LOA: 110, vmaxKn: 17,
  L: 96, B: 24, T: 8, Cb: 0.55, xg: IB_XG,
  pods: [pod('PORT', -0.42 * 96 - IB_XG, -7, 780e3, 6.5e6), pod('CENTRE', -0.46 * 96 - IB_XG, 0, 700e3, 6e6, 0.5), pod('STBD', -0.42 * 96 - IB_XG, 7, 780e3, 6.5e6, 1)],
  bowThruster: { x: 0, Tmax: 0, P: 0 },
  windage: { AF: 560, AL: 1500, cx: 0.8, cy: 0.9, cn: 0.08, xw: 5 },
  wake: 0.1, tded: 0.12, Vzero: 11, Cd: 0.85, formFactor: 1.35, cwMul: 2.2,
  podSlew: 6 * DEG, podRpmTime: 20, powerAvail: 21e6, btRpmTime: 8,
  bridgeX: 0.12 * 96 - IB_XG, ramK: 0.85,
  iceBow: { phi: 25 * DEG, alpha: 30 * DEG },
  roll: { GM: 2.6, KG: 9.8, kxx: 9.4, zWind: 9, vanish: 65 * DEG },
  look: {
    freeboard: 5.2, bridgeH: 22, bridgeLen: 8, wingOut: 1.0,
    decks: [{ x0: -10, x1: 24, h: 11, inset: 0.6 }, { x0: -4, x1: 21, h: 16, inset: 1.4 }, { x0: 2, x1: 18, h: 22, inset: 2.6 }],
    funnel: { x: -12, h: 27, w: 5, l: 6 },
    hull: '#c8102e', topsides: '#c8102e', super: '#f4f4f0', glass: '#1d2731', accent: '#1d2731',
  },
};

/** European push convoy: pushboat and 2 × 2 barges (class Vb), three propellers with steering and flanking rudders. */
const PC_XG = -10;
export const PUSH_CONVOY: ShipSpec = {
  ...POD_DEFAULTS,
  id: 'push-convoy', name: 'Push convoy · 4 barges, 193 m', type: 'inland', station: 'cpp', load: 'laden, 3.5 m',
  note: 'Rhine-type push convoy: a 40 m pushboat with three 1.5 MW propellers in nozzles, each with twin steering rudders behind and twin flanking rudders ahead, pushing four laden Europe IIa barges (2 × 2, 193 × 22.8 m overall). On a river the water under her is rarely more than half her draught again. The flanking rudders sit in the propeller slipstream when going astern and steer the stern while backing and stopping. Hull forces from Clarke\'s regression at the edge of its range (B/T 6.5).',
  LOA: 193, vmaxKn: 11,
  L: 190, B: 22.8, T: 3.5, Cb: 0.9, xg: PC_XG,
  pods: ([-3.6, 0, 3.6]).map((y, k) => shaftUnit(['PORT', 'CENTRE', 'STBD'][k], y, {
    D: 2.0, k0: 0.6, k1: -0.4, k2: -0.12, KQ0: 0.09, asternFrac: 0.7,
    tP: 0.15, wP0: 0.25, xP: -0.49 * 190 - PC_XG, hand: k === 0 ? -1 : 1, kTTah: 0.01, kTTas: 0.04,
  }, { type: 'geared', P: 1.5e6, n: 350 / 60, nMin: 0.25, loadTime: 15, I: 3e3, clutch: true },
  { ...rudder({ type: 'schilling', A: 2 * 4.2, H: 2.4, xR: -0.5 * 190 - PC_XG - 2.2, max: 60 * DEG, rate: 8 * DEG }), flank: { A: 2 * 3.5, xF: -0.49 * 190 - PC_XG + 2.6, max: 45 * DEG } },
  LEVERS)),
  bowThruster: { x: 0.5 * 190 - PC_XG - 4, Tmax: 60e3, P: 0.5e6 },
  windage: { AF: 120, AL: 900, cx: 0.8, cy: 0.9, cn: 0.06, xw: -60 },
  wake: 0.25, tded: 0.15, Vzero: 20, Cd: 1.1, formFactor: 2.2,
  btRpmTime: 5, powerAvail: 0.6e6, bridgeX: -0.44 * 190 - PC_XG,
  look: {
    freeboard: 1.2, bridgeH: 9, bridgeLen: 5, wingOut: 0.5,
    decks: [{ x0: -0.5 * 190 + 4, x1: -0.5 * 190 + 30, h: 5.5, inset: 2 }, { x0: -0.5 * 190 + 8, x1: -0.5 * 190 + 24, h: 9, inset: 4 }],
    funnel: { x: -0.5 * 190 + 9, h: 10, w: 1.6, l: 2.4 },
    hull: '#20242a', topsides: '#2f4f3a', super: '#f2f2ec', glass: '#1b2530', accent: '#e8b11c',
  },
};

/** Frigate on the DTMB 5415 hull (the open benchmark surface combatant), twin CPP, twin rudders, 30 kn. */
const FR_XG = -2.5;
export const FRIGATE: ShipSpec = {
  ...POD_DEFAULTS,
  id: 'frigate', name: 'Frigate · DTMB 5415 hull', type: 'naval', station: 'cpp', load: 'full load',
  note: 'Surface combatant on the DTMB 5415 hull (142 × 19.06 × 6.15 m, Cb 0.507), the open benchmark of the SIMMAN workshops: twin controllable-pitch propellers on gas turbines and diesels (2 × 37.5 MW), twin spade rudders. Particulars of the benchmark hull; propulsion, steering and windage typical of the type. Hull forces from Clarke\'s regression.',
  LOA: 153.3, vmaxKn: 29,
  L: 142, B: 19.06, T: 6.15, Cb: 0.507, xg: FR_XG,
  pods: (['PORT', 'STBD'] as const).map((side, k) => shaftUnit(side, k ? 4.6 : -4.6, {
    D: 5.2, k0: 0.52, k1: -0.3, k2: -0.1, KQ0: 0.09, asternFrac: 0.6,
    tP: 0.08, wP0: 0.06, xP: -0.43 * 142 - FR_XG, hand: k ? 1 : -1, kTTah: 0.005, kTTas: 0.03,
    cpp: { pitchTime: 12, asternPitch: 0.75 },
  }, { type: 'turbine', P: 37.5e6, n: 168 / 60, nMin: 0.3, loadTime: 50, I: 1.4e5 },
  rudder({ A: 15, H: 4.5, xR: -0.47 * 142 - FR_XG, rate: 4 * DEG }), LEVERS)),
  bowThruster: { x: 0, Tmax: 0, P: 0 },
  windage: { AF: 330, AL: 1700, cx: 0.75, cy: 0.9, cn: 0.08, xw: 4 },
  wake: 0.06, tded: 0.08, Vzero: 20, Cd: 0.7, formFactor: 1.08, cwMul: 0.75,
  btRpmTime: 5, powerAvail: 1e6, bridgeX: 0.2 * 142 - FR_XG,
  look: {
    freeboard: 6, bridgeH: 16, bridgeLen: 6, wingOut: 0.8,
    decks: [{ x0: -30, x1: 28, h: 10, inset: 1.2 }, { x0: -18, x1: 26, h: 14, inset: 2.6 }],
    funnel: { x: -10, h: 22, w: 4, l: 7 },
    hull: '#5d6670', topsides: '#7c858e', super: '#8d959d', glass: '#1b232b', accent: '#2b3137',
  },
};

/** Superyacht, 90 m: twin screws on electric motors, bow and stern thrusters. */
const SY_XG = -1;
export const SUPERYACHT: ShipSpec = {
  ...POD_DEFAULTS,
  id: 'superyacht', name: 'Superyacht 90 m · twin screw', type: 'yacht', station: 'cpp', load: 'half load',
  note: 'Typical 90 m motor yacht: diesel-electric, twin fixed propellers on electric motors (2 × 5.5 MW, reversing through zero), twin rudders, bow and stern tunnel thrusters for berthing stern-to in crowded marinas. High windage for her size. Hull forces from Clarke\'s regression.',
  LOA: 90, vmaxKn: 20,
  L: 80, B: 14.5, T: 3.9, Cb: 0.48, xg: SY_XG,
  pods: (['PORT', 'STBD'] as const).map((side, k) => shaftUnit(side, k ? 2.9 : -2.9, {
    D: 2.6, k0: 0.48, k1: -0.36, k2: -0.1, KQ0: 0.07, asternFrac: 0.65,
    tP: 0.1, wP0: 0.08, xP: -0.43 * 80 - SY_XG, hand: k ? 1 : -1, kTTah: 0.01, kTTas: 0.05,
  }, { type: 'electric', P: 5.5e6, n: 300 / 60, nMin: 0, loadTime: 20, I: 2e3 },
  rudder({ A: 4.2, H: 2.6, xR: -0.47 * 80 - SY_XG, rate: 5 * DEG }), LEVERS)),
  bowThruster: { x: 0.43 * 80 - SY_XG, Tmax: 60e3, P: 0.4e6 },
  sternThruster: { x: -0.4 * 80 - SY_XG, Tmax: 40e3, P: 0.3e6 },
  windage: { AF: 260, AL: 1100, cx: 0.7, cy: 0.9, cn: 0.08, xw: 2 },
  wake: 0.08, tded: 0.1, Vzero: 20, Cd: 0.75, formFactor: 1.12,
  btRpmTime: 5, powerAvail: 12e6, bridgeX: 0.24 * 80 - SY_XG,
  look: {
    freeboard: 3.6, bridgeH: 13, bridgeLen: 6, wingOut: 0.6,
    decks: [{ x0: -32, x1: 30, h: 7, inset: 0.5 }, { x0: -24, x1: 26, h: 10, inset: 1.4 }, { x0: -14, x1: 22, h: 13, inset: 2.4 }],
    funnel: { x: -12, h: 15, w: 3, l: 4 },
    hull: '#f4f5f2', topsides: '#16243a', super: '#f4f5f2', glass: '#141c26', accent: '#b89b5e',
  },
};

/** Panamax bulk carrier fitted with four Flettner rotor sails. */
export const PANAMAX_ROTOR: ShipSpec = {
  ...PANAMAX, id: 'panamax-rotor', name: 'Bulk carrier · 4 rotor sails',
  note: PANAMAX.note + ' Fitted with four 5 × 30 m Flettner rotor sails on the centreline: each spins to the spin ratio that gives the most forward thrust in the apparent wind (lift to about 9 × q·D·H near spin ratio 3), or stops when the wind is too far ahead. Thrust and side force go into the manoeuvring model like any other force.',
  rotors: [-0.32, -0.08, 0.14, 0.32].map(f => ({ x: f * PANAMAX.L - PANAMAX.xg, y: 0, D: 5, H: 30, zc: PANAMAX.look.freeboard + 15, vMax: 30 })),
};
