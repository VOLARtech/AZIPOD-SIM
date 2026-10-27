// Ship particulars and derived hydrodynamic coefficients.
// Axes: body x forward, y starboard, z down; yaw r positive = bow to starboard.
// Hull derivatives from Clarke, Gedling & Hine (1983) regression, split into
// ideal-fluid (added-mass, handled by C_A incl. Munk moment) and viscous remainder (D).

export const RHO = 1025;
export const RHO_AIR = 1.225;
export const NU_W = 1.19e-6;
export const G = 9.81;
export const KN = 0.514444;
export const DEG = Math.PI / 180;

export interface PodSpec {
  label: string;
  x: number; y: number;       // position rel. CG [m]
  Tb: number;                 // bollard thrust ahead [N]
  asternFrac: number;         // astern thrust at equal |rpm|, fraction of ahead
  strutArea: number;          // lateral area of strut + pod body [m^2]
  D: number;                  // propeller diameter [m]
  P: number;                  // rated shaft power [W]
  // build tolerances: real units are never identical
  slewMul: number; thrustMul: number; alphaOffset: number;
}

export interface ShipSpec {
  name: string;
  L: number; B: number; T: number; Cb: number; xg: number;
  pods: PodSpec[];
  bowThruster: { x: number; Tmax: number; P: number };
  windage: { AF: number; AL: number; cx: number; cy: number; cn: number; xw: number };
  wake: number;               // Taylor wake fraction at pods
  tded: number;               // thrust deduction
  Vzero: number;              // advance speed where full-rpm thrust vanishes [m/s]
  Cd: number;                 // deep-water cross-flow drag coefficient (Hoerner, B/2T≈1.9)
  formFactor: number;         // (1+k)
  podSlew: number;            // azimuth slew rate [rad/s]
  podRpmTime: number;         // 0 → 100 % rpm [s]; full ahead → full astern takes 2×
  asternMax: number;          // astern rpm limit, fraction of ahead max
  revInterlock: number;       // reverse order ignored above this |rpm| fraction
  btRpmTime: number;          // bow thruster 0 → 100 % [s]
  powerAvail: number;         // electrical power available for propulsion + thrusters [W]
  bridgeX: number;            // GNSS antenna / conning position, x rel. CG [m]
  ramK: number;               // propeller cross-flow momentum recovery (calibrated on 277 m stopping tests)
  id: string;
  vmaxKn: number;             // steady speed at 100 % rpm, deep water (from trials)
  LOA: number;                // length overall [m] (L is between perpendiculars)
  look: ShipLook;             // 3D appearance
  note?: string;              // provenance shown in the app
}

/** What the 3D view needs to draw the ship (heights above the waterline, x rel. CG). */
export interface ShipLook {
  freeboard: number;          // main/mooring deck height above WL
  decks: { x0: number; x1: number; h: number; inset: number }[]; // superstructure tiers, top height
  bridgeH: number;            // bridge deck height above WL (eye = +1.7)
  bridgeLen: number;          // fore-aft depth of the bridge block
  wingOut: number;            // how far the wings reach past the hull side
  funnel: { x: number; h: number; w: number; l: number };
  hull: string; topsides: string; super: string; glass: string; accent: string;
}

// Fictional 130 m twin-Azipod expedition/ro-pax vessel.
// Azipod figures follow published practice: 7.5°/s azimuth, 60 s full reversal,
// astern rpm ≈ 150/180 of ahead, reversal blocked above ≈ 50/180 rpm (IMPA/TransNav).
export const BECANCOUR: ShipSpec = {
  id: 'becancour', LOA: 135, vmaxKn: 16.6,
  name: 'MV Bécancour',
  note: 'Fictional 130 m expedition / ro-pax ship.',
  L: 130, B: 21, T: 5.5, Cb: 0.62, xg: -1.5,
  pods: [
    { label: 'PORT', x: -56, y: -5.2, Tb: 400e3, asternFrac: 0.75, strutArea: 16, D: 3.8, P: 3.4e6, slewMul: 1, thrustMul: 1, alphaOffset: 0 },
    { label: 'STBD', x: -56, y: 5.2, Tb: 400e3, asternFrac: 0.75, strutArea: 16, D: 3.8, P: 3.4e6, slewMul: 1.05, thrustMul: 0.975, alphaOffset: 0.5 * DEG },
  ],
  bowThruster: { x: 56, Tmax: 2 * 140e3, P: 2 * 1.1e6 },
  windage: { AF: 380, AL: 2150, cx: 0.65, cy: 0.9, cn: 0.08, xw: 6 },
  wake: 0.12, tded: 0.1, Vzero: 15, Cd: 0.8, formFactor: 1.2,
  podSlew: 7.5 * DEG,
  podRpmTime: 30,
  asternMax: 0.83,
  revInterlock: 0.28,
  btRpmTime: 8,
  powerAvail: 7.6e6,
  bridgeX: 30,
  ramK: 0.85,
  look: {
    freeboard: 6.5, bridgeH: 18, bridgeLen: 8, wingOut: 1.2,
    decks: [{ x0: -48, x1: 30, h: 12, inset: 0.5 }, { x0: -38, x1: 30, h: 15.5, inset: 1 }, { x0: -20, x1: 34, h: 18, inset: 1.5 }],
    funnel: { x: -30, h: 25, w: 6, l: 9 },
    hull: '#1f2a33', topsides: '#e9ecee', super: '#f4f5f6', glass: '#2b3b48', accent: '#c9541a',
  },
};

/**
 * Lady-class 278 m cruise ship, modelled on the published particulars of Valiant Lady
 * (Fincantieri 2021): 278 m LOA, 38 m beam, 8.05 m draught, 110,000 GT, 2 × 16 MW ABB Azipod XO,
 * 4 Wärtsilä 46F gensets totalling 48 MW, 20 kn service / 22 kn max.
 * Not published, so assumed: Lpp, Cb, bow thrusters (3 × 3 MW), windage, slew rate, pod geometry.
 */
export const LADY: ShipSpec = {
  id: 'lady', LOA: 278, vmaxKn: 22.4,
  name: 'Lady-class 278 m',
  note: 'Modelled on Valiant Lady\'s published particulars (278 m, 38 m beam, 8.05 m draught, 2 × 16 MW Azipods). Bow thrusters, hull form and windage are estimates; this is not the real ship\'s manoeuvring data.',
  L: 250, B: 38, T: 8.05, Cb: 0.68, xg: -4,
  pods: [
    { label: 'PORT', x: -113, y: -9.5, Tb: 1.9e6, asternFrac: 0.75, strutArea: 55, D: 6.0, P: 16e6, slewMul: 1, thrustMul: 1, alphaOffset: 0 },
    { label: 'STBD', x: -113, y: 9.5, Tb: 1.9e6, asternFrac: 0.75, strutArea: 55, D: 6.0, P: 16e6, slewMul: 1.04, thrustMul: 0.98, alphaOffset: 0.4 * DEG },
  ],
  bowThruster: { x: 112, Tmax: 3 * 330e3, P: 3 * 3e6 },
  windage: { AF: 1650, AL: 10200, cx: 0.7, cy: 0.9, cn: 0.1, xw: 4 },
  wake: 0.1, tded: 0.1, Vzero: 20, Cd: 0.72, formFactor: 1.2,
  podSlew: 6 * DEG,
  podRpmTime: 30,
  asternMax: 0.83,
  revInterlock: 0.28,
  btRpmTime: 10,
  powerAvail: 38e6,
  bridgeX: 98,
  ramK: 0.85,
  look: {
    freeboard: 11, bridgeH: 36, bridgeLen: 10, wingOut: 1.5,
    decks: [
      // stepped forward face: tiers ahead of the wheelhouse stay well below the eye (36 m)
      { x0: -132, x1: 116, h: 20, inset: 0.2 }, { x0: -126, x1: 104, h: 27, inset: 0.6 }, { x0: -118, x1: 97, h: 33, inset: 1 },
      { x0: -112, x1: 92, h: 44, inset: 1.2 }, { x0: -90, x1: 86, h: 50, inset: 2.5 }, { x0: -40, x1: 60, h: 56, inset: 5 },
    ],
    funnel: { x: -70, h: 66, w: 10, l: 20 },
    hull: '#232c34', topsides: '#eef0f1', super: '#f6f7f8', glass: '#28394a', accent: '#b8202f',
  },
};

export const SHIPS: Record<string, ShipSpec> = { becancour: BECANCOUR, lady: LADY };
/** The ship in use. A live binding: importers see the new ship after setShip(). */
export let SHIP: ShipSpec = BECANCOUR;
export function setShip(id: string) { SHIP = SHIPS[id] ?? BECANCOUR; return SHIP; }

export interface Hydro {
  m: number; Iz: number; xg: number;
  Xud: number; Yvd: number; Yrd: number; Nvd: number; Nrd: number;
  M: number[]; Minv: number[];
  kYv: number; kYr: number; kNv: number; kNr: number;   // viscous lift, × speed
  Xlin: number; Ylin: number; Nlin: number;
  S: number; strips: { x: number; dx: number }[]; cfK: number;
  fsh: number; fam: number; hT: number;
  prime: Record<string, number>;
}

export function inv3(a: number[]): number[] {
  const [a0, a1, a2, a3, a4, a5, a6, a7, a8] = a;
  const c0 = a4 * a8 - a5 * a7, c1 = a5 * a6 - a3 * a8, c2 = a3 * a7 - a4 * a6;
  const det = a0 * c0 + a1 * c1 + a2 * c2;
  return [
    c0 / det, (a2 * a7 - a1 * a8) / det, (a1 * a5 - a2 * a4) / det,
    c1 / det, (a0 * a8 - a2 * a6) / det, (a2 * a3 - a0 * a5) / det,
    c2 / det, (a1 * a6 - a0 * a7) / det, (a0 * a4 - a1 * a3) / det,
  ];
}

export function deriveHydro(s: ShipSpec, depth: number): Hydro {
  const { L, B, T, Cb } = s;
  const m = RHO * Cb * L * B * T;
  const Iz = m * (0.25 * L) ** 2;
  const k = Math.PI * (T / L) ** 2;
  const BL = B / L, BT = B / T;

  // Shallow-water amplification (h/T → 1): lateral damping and added mass grow.
  const hT = isFinite(depth) ? depth / T : Infinity;
  const rr = isFinite(hT) ? Math.min(1 / hT, 0.92) : 0;
  const fsh = Math.pow(1 - rr, -0.65);
  const fam = Math.pow(1 - rr, -0.35);

  // Clarke added mass (prime, normalised by ½ρL³, ½ρL⁴, ½ρL⁵)
  const Yvd_p = -k * (1 + 0.16 * Cb * BT - 5.1 * BL ** 2);
  const Yrd_p = -k * (0.67 * BL - 0.0033 * BT ** 2);
  const Nvd_p = -k * (1.1 * BL - 0.041 * BT);
  const Nrd_p = -k * (1 / 12 + 0.017 * Cb * BT - 0.33 * BL);
  // Clarke total linear derivatives (prime, normalised by ½ρL²U, ½ρL³U, ½ρL³U, ½ρL⁴U)
  const Yv_p = -k * (1 + 0.4 * Cb * BT);
  const Yr_p = -k * (-0.5 + 2.2 * BL - 0.08 * BT);
  const Nv_p = -k * (0.5 + 2.4 * T / L);
  const Nr_p = -k * (0.25 + 0.039 * BT - 0.56 * BL);

  const q3 = 0.5 * RHO * L ** 3, q4 = q3 * L, q5 = q4 * L;
  const Xud = -0.05 * m;
  const Yvd = Yvd_p * q3 * fam;
  const Ycross = 0.5 * (Yrd_p + Nvd_p) * q4 * fam; // symmetric M
  const Nrd = Nrd_p * q5 * fam;
  const Xud_p = Xud / q3;
  const symX_p = 0.5 * (Yrd_p + Nvd_p);

  // Viscous remainder = Clarke total − ideal-fluid part already in C_A(ν_r)ν_r:
  //   C_A gives  Y_r = X_u̇·U,  N_v = (Y_v̇ − X_u̇)·U  (Munk),  N_r = Y_ṙ·U,  Y_v = 0
  const YvD = Yv_p;
  const YrD = Yr_p - Xud_p;
  const NvD = Nv_p - (Yvd_p - Xud_p);
  const NrD = Nr_p - symX_p;

  const q2 = 0.5 * RHO * L ** 2;
  const M = [
    m - Xud, 0, 0,
    0, m - Yvd, m * s.xg - Ycross,
    0, m * s.xg - Ycross, Iz - Nrd,
  ];

  const S = L * (1.7 * T + Cb * B); // Mumford wetted surface
  const NS = 26, strips: { x: number; dx: number }[] = [];
  for (let i = 0; i < NS; i++) {
    const x = -L / 2 + (i + 0.5) * (L / NS) - s.xg;
    strips.push({ x, dx: L / NS });
  }

  return {
    m, Iz, xg: s.xg, Xud, Yvd, Yrd: Ycross, Nvd: Ycross, Nrd,
    M, Minv: inv3(M),
    kYv: q2 * YvD * fsh, kYr: q3 * YrD, kNv: q3 * NvD, kNr: q4 * NrD * fsh,
    // Tiny residual linear damping (wave radiation / laminar creep). Kept an order of
    // magnitude below the quadratic terms at berthing speeds; surge term fades out above 1 m/s.
    Xlin: m / 4000, Ylin: (m - Yvd) / 3000, Nlin: (Iz - Nrd) / 3000,
    S, strips, cfK: 0.5 * RHO * T * s.Cd * fsh,
    fsh, fam, hT,
    prime: { Yvd_p, Yrd_p, Nvd_p, Nrd_p, Yv_p, Yr_p, Nv_p, Nr_p, YvD, YrD, NvD, NrD, munk: Yvd_p - Xud_p },
  };
}

// ITTC-57 frictional + simple wave term; total resistance coefficient.
export function resistanceCt(s: ShipSpec, u: number, hT: number): number {
  const Re = Math.max(Math.abs(u) * s.L / NU_W, 2e6);
  const Cf = 0.075 / (Math.log10(Re) - 2) ** 2;
  const Fn = Math.abs(u) / Math.sqrt(G * s.L);
  const Cw = 0.0007 * Math.min((Fn / 0.25) ** 4, 6);
  const shallow = isFinite(hT) ? 1 + 0.6 / (hT * hT) : 1;
  return (Cf * s.formFactor + Cw) * shallow;
}

export const wrapAngle = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
