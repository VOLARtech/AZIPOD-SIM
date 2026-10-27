// VLCC on the KVLCC2 benchmark hull (KRISO, SIMMAN). Hull, rudder and propeller from the
// MMG standard method paper (Yasukawa & Yoshimura 2015, Table of KVLCC2 coefficients):
// Lpp 320 m, B 58 m, d 20.8 m, ∇ 312 600 m³, xG 11.2 m, k_zz 76.78 m, D_P 9.86 m, H_R 15.8 m, A_R 112.5 m².
// Full-scale adjustments: R'0 0.022 (model) → 0.0088 (ITTC-57 friction, (1+k) 1.25, roughness and
// air allowances), which puts the self-propulsion point near 74 rpm and ≈ 22 MW at 15.5 kn.
// The engine (direct-reversing two-stroke, 27 MW at 76 rpm) and K_Q are typical VLCC values, not KVLCC2 data.
import { DEG } from '../physics/consts';
import type { MmgHull, PropellerSpec, ShipSpec } from '../physics/ship';
import { AIR_2S, POD_DEFAULTS, TELEGRAPH_2S, rudder, shaftUnit } from './base';

const L = 320;
export const KVLCC2_MMG: MmgHull = {
  xG: 11.2, mx: 0.022, my: 0.223, Jz: 0.011, kzz: 76.78 / L,
  R0: 0.0088, Xvv: -0.040, Xvr: 0.002, Xrr: 0.011, Xvvvv: 0.771,
  Yv: -0.315, Yr: 0.083, Yvvv: -1.607, Yvvr: 0.379, Yvrr: -0.391, Yrrr: 0.008,
  Nv: -0.137, Nr: -0.049, Nvvv: -0.030, Nvvr: -0.294, Nvrr: 0.055, Nrrr: -0.013,
  source: 'Yasukawa & Yoshimura (2015), J. Mar. Sci. Technol. 20:37–52, KVLCC2 captive tests; R\'0 corrected to full scale',
};
export const KVLCC2_PROP: PropellerSpec = {
  D: 9.86, k0: 0.2931, k1: -0.2753, k2: -0.1385, KQ0: 0.032, asternFrac: 0.7,
  tP: 0.22, wP0: 0.40, xP: -0.48 * L, hand: 1, kTTah: 0.02, kTTas: 0.08,
};
export const KVLCC2_RUDDER = rudder({
  A: 112.5, H: 15.8, xR: -0.5 * L, xH: -0.464 * L, fa: 2.747,
  tR: 0.387, aH: 0.312, gammaP: 0.640, gammaM: 0.395, lR: -0.710, eps: 1.09, kappa: 0.50,
  max: 35 * DEG, rate: 2.32 * DEG,
});

export const KVLCC2: ShipSpec = {
  ...POD_DEFAULTS,
  id: 'kvlcc2', name: 'VLCC · KVLCC2 hull', type: 'tanker', station: 'telegraph', load: 'laden',
  note: 'KVLCC2 benchmark hull (KRISO) with the published MMG captive-test coefficients (Yasukawa & Yoshimura 2015). Resistance corrected to full scale; engine, air-start system, windage and transverse thrust are typical VLCC values, not measured data.',
  LOA: 333, vmaxKn: 15.8,
  L, B: 58, T: 20.8, Cb: 312600 / (320 * 58 * 20.8), xg: 0,
  mmg: KVLCC2_MMG,
  pods: [shaftUnit('MAIN', 0, KVLCC2_PROP, {
    type: 'direct2s', P: 27e6, n: 76 / 60, nMin: 0.27, barred: [0.45, 0.53], loadTime: 900, I: 2.2e6, air: AIR_2S,
  }, KVLCC2_RUDDER, TELEGRAPH_2S)],
  bowThruster: { x: 150, Tmax: 0, P: 0 },
  windage: { AF: 1450, AL: 4200, cx: 0.75, cy: 0.9, cn: 0.08, xw: -25 },
  Cd: 0.75, formFactor: 1.25,
  btRpmTime: 10, powerAvail: 3.6e6,
  bridgeX: -122,
  look: {
    freeboard: 9.2, bridgeH: 33, bridgeLen: 10, wingOut: 0.5,
    decks: [{ x0: -162, x1: -118, h: 18, inset: 2 }, { x0: -158, x1: -120, h: 27, inset: 4 }, { x0: -152, x1: -120, h: 33, inset: 6 }],
    funnel: { x: -150, h: 44, w: 9, l: 10 },
    hull: '#2a2f33', topsides: '#7a2220', super: '#e8e6df', glass: '#20282f', accent: '#c4511f',
  },
};
