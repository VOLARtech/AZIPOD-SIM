// M/T CB Baltic (IMO 9851701), a 38 000 dwt oil / chemical tanker built by New Hantong (2020),
// from her own papers: pilot card and wheelhouse poster, vessel particulars, the loading computer's
// laden and normal-ballast conditions, mooring arrangement. Where the papers and the ship disagree,
// her officers' figures win: astern thrust about 30 % of ahead (the poster says "astern power 75 %"),
// full speed about 14 kn rather than the poster's 15.2 kn, ballast draughts 7.5 m aft and 5.5 m forward.
// Hull forces from Clarke's regression (no captive tests for this hull). Origin at the CG.
import { DEG } from '../physics/consts';
import type { PropellerSpec, ShipLook, ShipSpec } from '../physics/ship';
import { AIR_2S, POD_DEFAULTS, rudder, shaftUnit } from './base';

const L = 177.43, B = 32, LOA = 182.81;
/** Bridge control programme from the pilot card: [shaft rpm ÷ 89.3, pitch] per order, dead slow → navigation full. */
const PROGRAM = {
  ahead: [[56.3 / 89.3, 0.4], [65 / 89.3, 0.8], [69.2 / 89.3, 1], [82.3 / 89.3, 1], [1, 1]] as [number, number][],
  astern: [[72.5 / 89.3, -0.28], [81.2 / 89.3, -0.56], [83.5 / 89.3, -0.736], [89 / 89.3, -0.912], [1, -1]] as [number, number][],
};
/** 4-bladed CPP on a 6S50ME-C9.6 derated to 6.5 MW at 89.3 rpm. Astern the blades give about 30 % of the ahead thrust. */
const prop = (xg: number, wP0: number): PropellerSpec => ({
  D: 6.3, k0: 0.33, k1: -0.30, k2: -0.12, KQ0: 0.038, asternFrac: 0.3,
  tP: 0.2, wP0, xP: -0.482 * L - xg, hand: 1, kTTah: 0.015, kTTas: 0.06,
  cpp: { pitchTime: 18, asternPitch: 1, program: PROGRAM },
});
const ENGINE = { type: 'direct2s' as const, P: 6.502e6, n: 89.3 / 60, nMin: 23.4 / 89.3, barred: [41 / 89.3, 45 / 89.3] as [number, number], loadTime: 600, I: 2.2e5, air: AIR_2S };
/** Rudder to ±45° (pilot card); 90° hard over to hard over in 40 s on one pump, 24 s on two. */
const rud = (xg: number, H: number) => rudder({ type: 'flap', A: 42 * H / 8.6, H, xR: -0.5 * L - xg, max: 45 * DEG, rate: 2.25 * DEG, aH: 0.25, tR: 0.3, gammaP: 0.5, gammaM: 0.4, lR: -0.9, eps: 0.95, kappa: 0.55 });
// stem and bridge: the bridge front is 146.7 m abaft the stem
const stemX = L / 2 + 0.8 * (LOA - L);
const look = (xg: number, fb: number): ShipLook => {
  const up = fb - 5.5;                                        // the house stands on the poop deck, 16 m above the keel
  return {
    freeboard: fb, bridgeH: 24.6 + up, bridgeLen: 9, wingOut: 0.5,
    decks: [{ x0: -0.5 * L - xg, x1: stemX - 146.7 - xg - 3, h: 3 + up, inset: 0.5 }, { x0: stemX - 166 - xg, x1: stemX - 146.7 - xg, h: 15 + up, inset: 2 }, { x0: stemX - 163 - xg, x1: stemX - 146.7 - xg, h: 24.6 + up, inset: 4 }],
    funnel: { x: stemX - 170 - xg, h: 30 + up, w: 5, l: 6 },
    hull: '#2b2e31', topsides: '#8a1f1d', super: '#ecebe4', glass: '#20282f', accent: '#1f5a8c',
  };
};

const LA_XG = 2.6;
export const CB_BALTIC: ShipSpec = {
  ...POD_DEFAULTS,
  id: 'cb-baltic', name: 'CB Baltic · 38 000 dwt tanker', type: 'tanker', station: 'cpp', load: 'laden, 10.5 m even keel (48 900 t)',
  note: 'M/T CB Baltic (IMO 9851701), oil / chemical tanker, New Hantong 2020: 182.8 m, 32 m, summer draught 10.5 m. MAN 6S50ME-C9.6 derated to 6 502 kW at 89.3 rpm on a controllable-pitch propeller; the lever runs the ship\'s bridge programme from her pilot card (rpm and pitch per order, astern to −100 % pitch). Astern thrust about 30 % of ahead and full speed about 14 kn, as her officers find (her poster says 75 % and 15.2 kn). Rudder to ±45°, 1 200 kW bow thruster, no stern thruster. Loading computer: laden 48 903 t, KG 10.69 m, GM 3.53 m, windage 1 595 m². Hull forces from Clarke\'s regression; propeller diameter and curves, rudder area and the rudder type are assumed.',
  LOA, vmaxKn: 13.5,
  L, B, T: 10.5, Cb: 0.80, xg: LA_XG,
  pods: [shaftUnit('MAIN', 0, prop(LA_XG, 0.36), ENGINE, rud(LA_XG, 8.6), { ahead: [0.2, 0.4, 0.6, 0.8, 1], astern: [0.2, 0.4, 0.6, 0.8, 1] })],
  bowThruster: { x: 0.44 * L - LA_XG, Tmax: 150e3, P: 1.2e6 },
  windage: { AF: 640, AL: 1595, cx: 0.8, cy: 0.9, cn: 0.08, xw: -22 },
  Cd: 0.8, formFactor: 1.5,
  btRpmTime: 8, powerAvail: 2.2e6,
  bridgeX: stemX - 146.7 - LA_XG + 4,
  roll: { GM: 3.53, KG: 10.69, kxx: 0.38 * B, zWind: 16.98 - 10.5, vanish: 56.6 * DEG },
  look: look(LA_XG, 5.5),
};

/** Normal ballast: 7.53 m aft, 5.57 m forward (28 400 t). Mean draught for the hull; the rudder works with about three quarters of its area. */
const BA_XG = -1.5;
export const CB_BALTIC_BALLAST: ShipSpec = {
  ...CB_BALTIC,
  id: 'cb-baltic-ballast', name: 'CB Baltic · ballast', load: 'normal ballast, 7.5 m aft / 5.5 m fwd (28 400 t)',
  note: CB_BALTIC.note!.replace(/Loading computer: laden[^.]*\./, 'Loading computer, normal ballast: 28 396 t, 7.53 m aft, 5.57 m forward, KG 7.85 m, GM 9.23 m, windage 2 286 m². The hull uses the mean draught 6.55 m with the CG moved aft for the trim by the stern; the top of the 8.6 m rudder is close to the surface and about three quarters of its area works.'),
  vmaxKn: 13.9, formFactor: 1.45,
  T: 6.55, Cb: 0.745, xg: BA_XG,
  pods: [shaftUnit('MAIN', 0, prop(BA_XG, 0.3), ENGINE, rud(BA_XG, 6.4), { ahead: [0.2, 0.4, 0.6, 0.8, 1], astern: [0.2, 0.4, 0.6, 0.8, 1] })],
  bowThruster: { x: 0.44 * L - BA_XG, Tmax: 140e3, P: 1.2e6 },
  windage: { AF: 760, AL: 2286, cx: 0.8, cy: 0.9, cn: 0.08, xw: -14 },
  bridgeX: stemX - 146.7 - BA_XG + 4,
  roll: { GM: 9.23, KG: 7.85, kxx: 0.4 * B, zWind: 14.44 - 6.55, vanish: 69.8 * DEG },
  look: look(BA_XG, 15.99 - 6.55),
};
