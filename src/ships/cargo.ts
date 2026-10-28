// Single-screw cargo ships on the low-speed (Clarke) hull model: the KCS benchmark hull,
// a Panamax bulk carrier and the KVLCC2 tanker in ballast. Origin at the CG (geometry and
// propulsor positions are given from midship and shifted by −xg).
import { DEG } from '../physics/consts';
import type { ShipSpec } from '../physics/ship';
import { AIR_2S, POD_DEFAULTS, TELEGRAPH_2S, rudder, shaftUnit } from './base';
import { KVLCC2, KVLCC2_PROP, KVLCC2_RUDDER } from './kvlcc2';

/**
 * KCS: KRISO 3600 TEU container ship benchmark hull (SIMMAN). Lpp 230 m, B 32.2 m, T 10.8 m,
 * Cb 0.651, propeller KP505 (D 7.9 m, five blades), rudder 54.45 m². K_T fitted to the KP505
 * open-water curve; engine and windage typical for a 3600 TEU ship (the KCS was never built).
 */
const KCS_XG = -3.4;
export const KCS: ShipSpec = {
  ...POD_DEFAULTS,
  id: 'kcs', name: 'Container 3600 TEU · KCS hull', type: 'container', station: 'telegraph', load: 'laden, 14 tiers on deck',
  note: 'KCS benchmark hull (KRISO) with its KP505 propeller and rudder. Hull forces from Clarke\'s regression (no captive-test set used); engine, bow thruster and windage are typical for a 3600 TEU ship. The KCS was never built.',
  LOA: 243, vmaxKn: 24.5,
  L: 230, B: 32.2, T: 10.8, Cb: 0.651, xg: KCS_XG,
  pods: [shaftUnit('MAIN', 0, {
    D: 7.9, k0: 0.52, k1: -0.37, k2: -0.08, KQ0: 0.077, asternFrac: 0.65,
    tP: 0.15, wP0: 0.24, xP: -0.483 * 230 - KCS_XG, hand: 1, kTTah: 0.015, kTTas: 0.07,
  }, { type: 'direct2s', P: 36e6, n: 104 / 60, nMin: 0.25, barred: [0.38, 0.45], loadTime: 900, I: 9e5, air: AIR_2S },
  rudder({ A: 54.45, H: 9.9, xR: -0.5 * 230 - KCS_XG, xH: -0.45 * 230 - KCS_XG, tR: 0.3, aH: 0.25, gammaP: 0.5, gammaM: 0.4, lR: -0.9, eps: 0.95, kappa: 0.55 }),
  TELEGRAPH_2S)],
  bowThruster: { x: 0.43 * 230 - KCS_XG, Tmax: 220e3, P: 1.8e6 },
  windage: { AF: 820, AL: 5200, cx: 0.75, cy: 0.95, cn: 0.06, xw: 6 },
  Cd: 0.85, formFactor: 1.1,
  btRpmTime: 8, powerAvail: 4.5e6,
  bridgeX: -0.2 * 230 - KCS_XG,
  look: {
    freeboard: 8.5, bridgeH: 36, bridgeLen: 10, wingOut: 0.5,
    decks: [{ x0: -0.25 * 230 - KCS_XG, x1: -0.18 * 230 - KCS_XG, h: 22, inset: 3 }, { x0: -0.245 * 230 - KCS_XG, x1: -0.185 * 230 - KCS_XG, h: 36, inset: 5 }],
    funnel: { x: -0.33 * 230 - KCS_XG, h: 42, w: 6, l: 9 },
    hull: '#20272c', topsides: '#253f5c', super: '#e9e9e4', glass: '#20282f', accent: '#d9a03a',
  },
};

/** Panamax bulk carrier, 82 000 dwt class: typical particulars, laden. */
const BU_XG = 2.5;
export const PANAMAX: ShipSpec = {
  ...POD_DEFAULTS,
  id: 'panamax', name: 'Panamax bulk carrier', type: 'bulk', station: 'telegraph', load: 'laden',
  note: 'Typical 82 000 dwt Panamax bulk carrier (229 m, 32.26 m, 14.45 m laden). Hull forces from Clarke\'s regression; propeller, rudder, engine and windage are typical values for the class, not one ship\'s data.',
  LOA: 229, vmaxKn: 15.4,
  L: 222, B: 32.26, T: 14.45, Cb: 0.86, xg: BU_XG,
  pods: [shaftUnit('MAIN', 0, {
    D: 6.8, k0: 0.33, k1: -0.30, k2: -0.12, KQ0: 0.038, asternFrac: 0.7,
    tP: 0.2, wP0: 0.38, xP: -0.482 * 222 - BU_XG, hand: 1, kTTah: 0.02, kTTas: 0.09,
  }, { type: 'direct2s', P: 9.8e6, n: 97 / 60, nMin: 0.28, barred: [0.42, 0.5], loadTime: 900, I: 3.2e5, air: AIR_2S },
  rudder({ A: 48, H: 10.2, xR: -0.5 * 222 - BU_XG }),
  TELEGRAPH_2S)],
  bowThruster: { x: 0, Tmax: 0, P: 0 },
  windage: { AF: 720, AL: 2900, cx: 0.8, cy: 0.9, cn: 0.08, xw: -18 },
  Cd: 0.8, formFactor: 1.25,
  btRpmTime: 10, powerAvail: 2.1e6,
  bridgeX: -0.4 * 222 - BU_XG,
  look: {
    freeboard: 5.8, bridgeH: 27, bridgeLen: 9, wingOut: 0.5,
    decks: [{ x0: -0.49 * 222, x1: -0.38 * 222, h: 14, inset: 2 }, { x0: -0.48 * 222, x1: -0.39 * 222, h: 21, inset: 3 }, { x0: -0.47 * 222, x1: -0.39 * 222, h: 27, inset: 4 }],
    funnel: { x: -0.46 * 222, h: 34, w: 6, l: 7 },
    hull: '#272a2c', topsides: '#2c3e4f', super: '#ecebe5', glass: '#20282f', accent: '#b8202f',
  },
};

/** The KVLCC2 tanker in ballast: same ship, light draught, twice the windage, Clarke hull model. */
export const KVLCC2_BALLAST: ShipSpec = {
  ...KVLCC2, id: 'kvlcc2-ballast', name: 'VLCC · KVLCC2 hull, ballast', load: 'ballast, T 10.5 m even keel',
  note: 'The KVLCC2 VLCC in ballast. The published MMG coefficients are for the loaded draught, so in ballast the hull uses Clarke\'s regression; the propeller is barely immersed and the windage doubles.',
  T: 10.5, Cb: 0.78, xg: 6, mmg: undefined, vmaxKn: 17.2,
  pods: [shaftUnit('MAIN', 0, { ...KVLCC2_PROP, xP: -0.48 * 320 - 6, wP0: 0.3 }, KVLCC2.pods[0].shaft!.engine,
    { ...KVLCC2_RUDDER, xR: -0.5 * 320 - 6, xH: -0.464 * 320 - 6, rate: 2.32 * DEG }, TELEGRAPH_2S)],
  windage: { AF: 2300, AL: 8600, cx: 0.75, cy: 0.9, cn: 0.1, xw: -10 },
  bridgeX: -128,
  look: { ...KVLCC2.look, freeboard: 19.5, bridgeH: 43, decks: KVLCC2.look.decks.map(d => ({ ...d, x0: d.x0 - 6, x1: d.x1 - 6, h: d.h + 10.3 })), funnel: { ...KVLCC2.look.funnel, x: -156, h: 54 } },
};
