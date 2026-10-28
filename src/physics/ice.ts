// Level ice. Resistance from Lindqvist (1989), "A straightforward method for calculation of ice
// resistance of ships" (POAC '89): crushing at the stem, bending of the ice sheet, and submersion
// of the broken pieces under the bottom, each growing with speed:
//   R = (R_c + R_b)(1 + 1.4 v/√(g h)) + R_s (1 + 9.4 v/√(g L))
// with the bow's stem angle φ and waterline entrance angle α. Ice properties: flexural strength
// 500 kPa, E 2 GPa, ν 0.3, hull–ice friction 0.1, ice density 900 kg/m³ in brackish water.
// Behind the ship the sheet is broken: a channel of brash the width of her beam, where resistance
// falls to a fraction. Sideways and turning motion break ice along the hull and are resisted
// harder: approximated here as the same resistance scaled by the length of hull doing the breaking.
import { G, ShipSpec } from './ship';
import type { Pt } from './contact';
import type { ShipState, Wrench } from './sim';
import { inPoly } from './harbour';

export interface IceField { poly: Pt[]; h: number; sigma?: number }
const E = 2e9, NU = 0.3, MU = 0.1, RHO_W = 1005, RHO_I = 900;

/** Lindqvist level-ice resistance [N] at speed v [m/s] for ice h [m] thick. */
export function lindqvist(spec: ShipSpec, h: number, v: number, sigma = 500e3) {
  const { phi, alpha } = spec.iceBow ?? { phi: 30 * Math.PI / 180, alpha: 30 * Math.PI / 180 };
  const B = spec.B, T = spec.T, L = spec.L;
  const psi = Math.atan(Math.tan(phi) / Math.sin(alpha));
  const Rc = 0.5 * sigma * h * h * (Math.tan(phi) + MU * Math.cos(phi) / Math.cos(psi)) / (1 - MU * Math.sin(phi) / Math.cos(psi));
  const Rb = 27 / 64 * sigma * B * h ** 1.5 / Math.sqrt(E / (12 * (1 - NU * NU) * G * RHO_W))
    * (Math.tan(psi) + MU * Math.cos(phi) / (Math.sin(alpha) * Math.cos(psi))) * (1 + 1 / Math.cos(psi));
  const Rs = (RHO_W - RHO_I) * G * h * B * (T * (B + T) / (B + 2 * T)
    + MU * (0.7 * L - T / Math.tan(phi) - B / (4 * Math.tan(alpha)) + T * Math.cos(phi) * Math.cos(psi) * Math.sqrt(1 / Math.sin(phi) ** 2 + 1 / Math.tan(alpha) ** 2)));
  const a = Math.abs(v);
  return { R: (Rc + Rb) * (1 + 1.4 * a / Math.sqrt(G * h)) + Rs * (1 + 9.4 * a / Math.sqrt(G * L)), Rc, Rb, Rs };
}

export class IceState {
  channel: [number, number][] = [];          // broken-channel centres (bow positions), every quarter beam
  inIce = false; h = 0; R = 0; brash = false;
  private last: [number, number] | null = null;
  constructor(public fields: IceField[]) {}
  /** Thickness of unbroken ice at a point (0: open water or broken channel). */
  at(spec: ShipSpec, n: number, e: number) {
    const f = this.fields.find(x => inPoly(n, e, x.poly));
    if (!f) return { h: 0, f: null as IceField | null, broken: false };
    const r2 = (spec.B * 0.55) ** 2;
    const broken = this.channel.some(([cn, ce]) => (cn - n) ** 2 + (ce - e) ** 2 < r2);
    return { h: f.h, f, broken };
  }
  /** Force on the ship for the coming step (held, like the other external forces). */
  force(spec: ShipSpec, st: ShipState): Wrench {
    const c = Math.cos(st.psi), s = Math.sin(st.psi), xb = spec.L / 2 - spec.xg;
    const bn = st.n + xb * c, be = st.e + xb * s;
    // the ice the bow is about to meet, just ahead of the stem (clear of the channel it is laying behind it)
    const ah = 0.6 * spec.B * (st.u >= 0 ? 1 : -1), xa = st.u >= 0 ? xb : -spec.L / 2 - spec.xg;
    const here = this.at(spec, st.n + (xa + ah) * c, st.e + (xa + ah) * s), mid = this.at(spec, st.n, st.e);
    const h = Math.max(here.h, mid.h);
    this.inIce = h > 0; this.h = h; this.brash = here.broken;
    if (!this.inIce) { this.R = 0; return { X: 0, Y: 0, N: 0 }; }
    // remember where the bow has broken the sheet
    if (!this.last || Math.hypot(bn - this.last[0], be - this.last[1]) > spec.B / 4) {
      if (!here.broken) this.channel.push([bn, be]);
      this.last = [bn, be];
      if (this.channel.length > 4000) this.channel.shift();
    }
    const k = here.broken ? 0.15 : 1, sig = here.f?.sigma ?? mid.f?.sigma ?? 500e3;
    const R0 = lindqvist(spec, h, 0, sig).R * k, R = lindqvist(spec, h, st.u, sig).R * k;
    this.R = R;
    // resistance opposes motion through the ice; it builds up over the first 0.3 m/s (no pull at rest)
    const sm = (x: number) => x / Math.max(Math.abs(x), 0.3);
    return { X: -R * sm(st.u), Y: -2.5 * R0 * sm(st.v), N: -0.35 * R0 * spec.L * sm(st.r * spec.L / 2) };
  }
}
