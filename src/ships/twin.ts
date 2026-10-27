// Twin-screw ships: a Ro-Pax ferry on controllable-pitch propellers with flap rudders, a
// conventional diesel-electric cruise ship on twin fixed propellers and rudders, and a twin-skeg
// LNG carrier on two slow-speed engines. Plus a 24 000 TEU single-screw container ship.
// Particulars are typical of their classes, not one ship's data; hull forces from Clarke's
// regression. Origin at the CG (positions from midship minus xg).
import { DEG } from '../physics/consts';
import type { EngineSpec, PropellerSpec, RudderSpec, ShipSpec } from '../physics/ship';
import { AIR_2S, POD_DEFAULTS, TELEGRAPH_2S, rudder, shaftUnit } from './base';

const LEVERS = { ahead: [0.2, 0.4, 0.6, 0.8, 1], astern: [0.2, 0.4, 0.6, 0.8, 1] };

/** Twin units at ±y, outward turning (port shaft left-handed). */
function twin(y: number, prop: PropellerSpec, engine: EngineSpec, rud: (y: number) => RudderSpec | undefined, tel: { ahead: number[]; astern: number[] } = TELEGRAPH_2S) {
  return [
    shaftUnit('PORT', -y, { ...prop, hand: -1 }, engine, rud(-y), tel),
    shaftUnit('STBD', y, { ...prop, hand: 1 }, engine, rud(y), tel),
  ];
}

/** Ro-Pax ferry, ~200 m: twin CPP on geared medium-speed diesels, flap rudders, 2 bow + 1 stern thruster. */
const RP_XG = -2;
export const ROPAX: ShipSpec = {
  ...POD_DEFAULTS,
  id: 'ropax', name: 'Ro-Pax ferry · twin CPP', type: 'ropax', station: 'cpp', load: 'service draught',
  note: 'Typical 200 m Ro-Pax ferry: twin controllable-pitch propellers on geared medium-speed diesels (2 × 12 MW, 145 rpm constant), Becker-type flap rudders to ±45°, two bow and one stern tunnel thruster. Hull forces from Clarke\'s regression; values typical of the class, not one ship\'s data.',
  LOA: 200, vmaxKn: 23.5,
  L: 186, B: 30.5, T: 6.4, Cb: 0.58, xg: RP_XG,
  pods: twin(6.8, {
    D: 5.2, k0: 0.56, k1: -0.40, k2: -0.10, KQ0: 0.088, asternFrac: 0.6,
    tP: 0.12, wP0: 0.12, xP: -0.46 * 186 - RP_XG, hand: 1, kTTah: 0.01, kTTas: 0.05,
    cpp: { pitchTime: 14, asternPitch: 0.8 },
  }, { type: 'geared', P: 12e6, n: 145 / 60, nMin: 0.6, loadTime: 40, I: 9e4 },
  () => rudder({ type: 'flap', A: 21, H: 5.4, xR: -0.49 * 186 - RP_XG, rate: 4 * DEG, aH: 0.2, tR: 0.3, gammaP: 0.5, gammaM: 0.45, lR: -0.95, eps: 0.95 }), LEVERS),
  bowThruster: { x: 0.43 * 186 - RP_XG, Tmax: 2 * 250e3, P: 2 * 2.0e6 },
  sternThruster: { x: -0.4 * 186 - RP_XG, Tmax: 150e3, P: 1.2e6 },
  windage: { AF: 820, AL: 4900, cx: 0.7, cy: 0.9, cn: 0.08, xw: 6 },
  Cd: 0.7, formFactor: 1.15,
  btRpmTime: 6, powerAvail: 8.5e6,
  bridgeX: 0.36 * 186 - RP_XG,
  look: {
    freeboard: 9.5, bridgeH: 32, bridgeLen: 9, wingOut: 1.6,
    decks: [{ x0: -0.48 * 186, x1: 0.42 * 186, h: 18, inset: 0.4 }, { x0: -0.4 * 186, x1: 0.4 * 186, h: 25, inset: 0.8 }, { x0: -0.25 * 186, x1: 0.39 * 186, h: 32, inset: 1.4 }],
    funnel: { x: -0.22 * 186, h: 41, w: 8, l: 12 },
    hull: '#1d3a5a', topsides: '#f2f2ee', super: '#f6f6f2', glass: '#24323e', accent: '#d2232a',
  },
};

/** Conventional cruise ship, ~260 m: diesel-electric, twin fixed propellers on electric motors, twin rudders. */
const CR_XG = -3;
export const CRUISE_CONV: ShipSpec = {
  ...POD_DEFAULTS,
  id: 'cruise-shaft', name: 'Cruise ship · twin screw', type: 'cruise', station: 'cpp', load: 'service draught',
  note: 'Typical 1990s 260 m cruise ship: diesel-electric, two 14 MW propulsion motors on fixed-pitch propellers, two conventional rudders, three bow and three stern tunnel thrusters. The same hull class as the Azipod ships, with shafts and rudders: compare them on the same berth. Clarke hull; class-typical values.',
  LOA: 262, vmaxKn: 21,
  L: 233, B: 31.5, T: 7.75, Cb: 0.67, xg: CR_XG,
  pods: twin(7.5, {
    D: 5.2, k0: 0.5, k1: -0.38, k2: -0.09, KQ0: 0.075, asternFrac: 0.65,
    tP: 0.12, wP0: 0.1, xP: -0.45 * 233 - CR_XG, hand: 1, kTTah: 0.01, kTTas: 0.05,
  }, { type: 'electric', P: 14e6, n: 145 / 60, nMin: 0, loadTime: 30, I: 1.2e5 },
  () => rudder({ A: 30, H: 6.2, xR: -0.49 * 233 - CR_XG, rate: 3 * DEG, aH: 0.22, tR: 0.3, gammaP: 0.5, gammaM: 0.45, lR: -0.95, eps: 0.95 }), LEVERS),
  bowThruster: { x: 0.43 * 233 - CR_XG, Tmax: 3 * 190e3, P: 3 * 1.5e6 },
  sternThruster: { x: -0.38 * 233 - CR_XG, Tmax: 3 * 160e3, P: 3 * 1.3e6 },
  windage: { AF: 1300, AL: 9800, cx: 0.7, cy: 0.9, cn: 0.1, xw: 4 },
  Cd: 0.72, formFactor: 1.2,
  btRpmTime: 10, powerAvail: 42e6,
  bridgeX: 0.38 * 233 - CR_XG,
  look: {
    freeboard: 8, bridgeH: 30, bridgeLen: 10, wingOut: 1.5,
    decks: [{ x0: -0.5 * 233, x1: 0.42 * 233, h: 18, inset: 0.2 }, { x0: -0.47 * 233, x1: 0.4 * 233, h: 25, inset: 0.6 }, { x0: -0.42 * 233, x1: 0.39 * 233, h: 30, inset: 1 }, { x0: -0.3 * 233, x1: 0.3 * 233, h: 38, inset: 2 }],
    funnel: { x: -0.32 * 233, h: 48, w: 10, l: 16 },
    hull: '#1f2a33', topsides: '#f2f3f3', super: '#f6f7f8', glass: '#26384a', accent: '#c9541a',
  },
};

/** LNG carrier, 174 000 m³, twin-skeg: two slow-speed dual-fuel engines, two rudders. */
const LN_XG = 1.5;
export const LNG: ShipSpec = {
  ...POD_DEFAULTS,
  id: 'lng', name: 'LNG carrier 174 000 m³ · twin skeg', type: 'gas', station: 'telegraph', load: 'laden',
  note: 'Typical 174 000 m³ membrane LNG carrier (295 m × 46.4 m × 11.5 m): twin skeg, two direct-drive dual-fuel two-strokes on fixed propellers (outward turning), two rudders, one bow thruster. High freeboard and trunk deck: a lot of windage for her draught. Clarke hull; class-typical values.',
  LOA: 295, vmaxKn: 19.5,
  L: 285, B: 46.4, T: 11.5, Cb: 0.75, xg: LN_XG,
  pods: twin(11, {
    D: 7.6, k0: 0.44, k1: -0.36, k2: -0.1, KQ0: 0.06, asternFrac: 0.65,
    tP: 0.17, wP0: 0.3, xP: -0.46 * 285 - LN_XG, hand: 1, kTTah: 0.015, kTTas: 0.06,
  }, { type: 'direct2s', P: 15e6, n: 77 / 60, nMin: 0.3, barred: [0.47, 0.55], loadTime: 900, I: 6e5, air: AIR_2S },
  () => rudder({ A: 52, H: 9, xR: -0.49 * 285 - LN_XG }), TELEGRAPH_2S),
  bowThruster: { x: 0.44 * 285 - LN_XG, Tmax: 260e3, P: 2.5e6 },
  windage: { AF: 1450, AL: 7400, cx: 0.75, cy: 0.9, cn: 0.08, xw: 2 },
  Cd: 0.78, formFactor: 1.2,
  btRpmTime: 10, powerAvail: 8e6,
  bridgeX: -0.4 * 285 - LN_XG,
  look: {
    freeboard: 15, bridgeH: 40, bridgeLen: 10, wingOut: 0.5,
    decks: [{ x0: -0.47 * 285, x1: -0.37 * 285, h: 24, inset: 2 }, { x0: -0.46 * 285, x1: -0.38 * 285, h: 33, inset: 3 }, { x0: -0.45 * 285, x1: -0.38 * 285, h: 40, inset: 5 }],
    funnel: { x: -0.45 * 285, h: 48, w: 9, l: 10 },
    hull: '#2a2e31', topsides: '#7d1f1d', super: '#ecebe5', glass: '#20282f', accent: '#1d5f8a',
  },
};

/** 24 000 TEU ultra-large container ship: one 58 MW two-stroke, one big rudder, two bow thrusters. */
const UL_XG = -5;
export const ULCV: ShipSpec = {
  ...POD_DEFAULTS,
  id: 'ulcv', name: 'Container 24 000 TEU', type: 'container', station: 'telegraph', load: 'laden, 10 tiers on deck',
  note: '24 000 TEU class (400 m × 61.3 m, 16 m laden): one 58 MW two-stroke on a 10.5 m fixed propeller, one rudder, two bow thrusters. About 16 000 m² of windage beam-on: in a breeze she goes where the wind sends her unless the tugs are fast. Clarke hull; class-typical values.',
  LOA: 400, vmaxKn: 22.5,
  L: 383, B: 61.3, T: 16, Cb: 0.66, xg: UL_XG,
  pods: [shaftUnit('MAIN', 0, {
    D: 10.5, k0: 0.48, k1: -0.36, k2: -0.09, KQ0: 0.068, asternFrac: 0.65,
    tP: 0.17, wP0: 0.27, xP: -0.48 * 383 - UL_XG, hand: 1, kTTah: 0.015, kTTas: 0.07,
  }, { type: 'direct2s', P: 58e6, n: 80 / 60, nMin: 0.27, barred: [0.4, 0.47], loadTime: 1200, I: 5e6, air: AIR_2S },
  rudder({ A: 125, H: 14.5, xR: -0.5 * 383 - UL_XG, tR: 0.3, aH: 0.25, gammaP: 0.5, gammaM: 0.4, lR: -0.9, eps: 0.95, kappa: 0.55 }), TELEGRAPH_2S)],
  bowThruster: { x: 0.44 * 383 - UL_XG, Tmax: 2 * 330e3, P: 2 * 3e6 },
  windage: { AF: 2500, AL: 16000, cx: 0.75, cy: 0.95, cn: 0.06, xw: 15 },
  Cd: 0.8, formFactor: 1.12,
  btRpmTime: 10, powerAvail: 12e6,
  bridgeX: 0.15 * 383 - UL_XG,
  look: {
    freeboard: 13, bridgeH: 50, bridgeLen: 10, wingOut: 0.5,
    decks: [{ x0: 0.1 * 383 - UL_XG, x1: 0.18 * 383 - UL_XG, h: 30, inset: 4 }, { x0: 0.11 * 383 - UL_XG, x1: 0.17 * 383 - UL_XG, h: 50, inset: 7 }],
    funnel: { x: -0.38 * 383 - UL_XG, h: 48, w: 9, l: 12 },
    hull: '#20272c', topsides: '#2f3d4a', super: '#e9e9e4', glass: '#20282f', accent: '#d9a03a',
  },
};
