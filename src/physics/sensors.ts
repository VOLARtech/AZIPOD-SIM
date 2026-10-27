// Bridge sensors as a captain sees them: GNSS at the antenna, gyro, rate-of-turn,
// doppler log, anemometer. Optional AIS-style smoothing + latency (MAIB/MARS lesson:
// a PPU fed from the AIS pilot plug predicts from smoothed, late positions).
import { DEG, KN, ShipSpec, wrapAngle } from './ship';
import type { ShipState } from './sim';
import type { Est } from './allocation';

export type SensorMode = 'ideal' | 'real' | 'ais';

class Rng {
  constructor(private s = 987654321) {}
  next() { this.s = (this.s * 1664525 + 1013904223) >>> 0; return this.s / 4294967296; }
  gauss() { const a = this.next() || 1e-9, b = this.next(); return Math.sqrt(-2 * Math.log(a)) * Math.cos(2 * Math.PI * b); }
}

export interface Reading {
  est: Est;                  // CG state reconstructed from sensors
  sog: number; cog: number; stw: number; hdg: number; rot: number;
  windRelSpeed: number; windRelAngle: number; windTrueSpeed: number; windTrueFrom: number;
  curEst: [number, number];  // estimated current [vN, vE]
}

export class Sensors {
  mode: SensorMode = 'real';
  private rng = new Rng();
  private biasN = 0; private biasE = 0;
  private gnssT = 0;
  private fixN = 0; private fixE = 0; private fixVN = 0; private fixVE = 0;
  private smN = 0; private smE = 0; private smVN = 0; private smVE = 0;
  private hist: { t: number; n: number; e: number; vn: number; ve: number }[] = [];
  private hdg = 0; private rot = 0;
  private cur: [number, number] = [0, 0];
  private init = false;
  out!: Reading;

  constructor(private spec: ShipSpec) {}

  reset() { this.init = false; this.hist = []; }

  step(st: ShipState, dt: number, trueCur: [number, number], wind: { V: number; from: number }) {
    const { spec } = this;
    const c = Math.cos(st.psi), s = Math.sin(st.psi);
    const ax = spec.bridgeX;
    // truth at the antenna
    const aN = st.n + ax * c, aE = st.e + ax * s;
    const vN = c * st.u - s * st.v - st.r * ax * s, vE = s * st.u + c * st.v + st.r * ax * c;
    const ideal = this.mode === 'ideal';
    if (!this.init) {
      Object.assign(this, { fixN: aN, fixE: aE, fixVN: vN, fixVE: vE, smN: aN, smE: aE, smVN: vN, smVE: vE, hdg: st.psi, rot: st.r });
      this.cur = [...trueCur] as [number, number]; this.init = true;
    }
    if (ideal) {
      this.fixN = aN; this.fixE = aE; this.fixVN = vN; this.fixVE = vE; this.hdg = st.psi; this.rot = st.r;
    } else {
      // GNSS: 1 Hz fixes, white noise + slowly wandering bias (DGNSS class, ~0.5 m)
      const tb = 120;
      this.biasN += -this.biasN / tb * dt + 0.35 * Math.sqrt(2 * dt / tb) * this.rng.gauss();
      this.biasE += -this.biasE / tb * dt + 0.35 * Math.sqrt(2 * dt / tb) * this.rng.gauss();
      this.gnssT += dt;
      if (this.gnssT >= 1) {
        this.gnssT = 0;
        this.fixN = aN + this.biasN + 0.25 * this.rng.gauss();
        this.fixE = aE + this.biasE + 0.25 * this.rng.gauss();
        this.fixVN = vN + 0.03 * this.rng.gauss();   // doppler velocity
        this.fixVE = vE + 0.03 * this.rng.gauss();
      }
      // gyro: small lag + noise; rate gyro for ROT
      this.hdg = wrapAngle(this.hdg + wrapAngle(st.psi - this.hdg) * Math.min(1, dt / 0.4) + 0.02 * DEG * this.rng.gauss());
      this.rot += (st.r - this.rot) * Math.min(1, dt / 1.0) + 0.0003 * this.rng.gauss() * Math.sqrt(dt);
    }
    // AIS path: exponential smoothing + 2 s latency
    let pN = this.fixN, pE = this.fixE, pVN = this.fixVN, pVE = this.fixVE;
    if (this.mode === 'ais') {
      const k = Math.min(1, dt / 6);
      this.smN += (this.fixN - this.smN) * k; this.smE += (this.fixE - this.smE) * k;
      this.smVN += (this.fixVN - this.smVN) * k; this.smVE += (this.fixVE - this.smVE) * k;
      this.hist.push({ t: st.t, n: this.smN, e: this.smE, vn: this.smVN, ve: this.smVE });
      while (this.hist.length > 2 && this.hist[1].t <= st.t - 2) this.hist.shift();
      const h = this.hist[0];
      pN = h.n; pE = h.e; pVN = h.vn; pVE = h.ve;
    }
    // back out CG from antenna
    const hc = Math.cos(this.hdg), hs = Math.sin(this.hdg);
    const gN = pN - ax * hc, gE = pE - ax * hs;
    const gVN = pVN + this.rot * ax * hs, gVE = pVE - this.rot * ax * hc;
    const u = hc * gVN + hs * gVE, v = -hs * gVN + hc * gVE;
    // doppler log through the water (longitudinal + transverse)
    const tu = c * trueCur[0] + s * trueCur[1], tv = -s * trueCur[0] + c * trueCur[1];
    const lu = st.u - tu + (ideal ? 0 : 0.04 * this.rng.gauss()), lv = st.v - tv + (ideal ? 0 : 0.03 * this.rng.gauss());
    // current estimate: ground velocity minus water velocity, rotated to earth, filtered (τ 60 s)
    const wN = hc * lu - hs * lv, wE = hs * lu + hc * lv;
    const k = ideal ? 1 : Math.min(1, dt / 60);
    this.cur = [this.cur[0] + (gVN - wN - this.cur[0]) * k, this.cur[1] + (gVE - wE - this.cur[1]) * k];
    // anemometer: apparent wind with noise; true wind back-computed with SOG
    const wto = wind.from + Math.PI;
    const ax2 = wind.V * Math.cos(wto - st.psi) - st.u, ay2 = wind.V * Math.sin(wto - st.psi) - st.v;
    const nz = ideal ? 0 : 1;
    const rs = Math.hypot(ax2, ay2) * (1 + 0.04 * nz * this.rng.gauss());
    const ra = Math.atan2(-ay2, -ax2) + 2 * DEG * nz * this.rng.gauss();
    // true wind = apparent + own ground velocity
    const airX = -rs * Math.cos(ra) + u, airY = -rs * Math.sin(ra) + v;
    const tN = hc * airX - hs * airY, tE = hs * airX + hc * airY;
    this.out = {
      est: { n: gN, e: gE, psi: this.hdg, u, v, r: this.rot },
      sog: Math.hypot(gVN, gVE), cog: Math.atan2(gVE, gVN), stw: Math.hypot(lu, lv),
      hdg: this.hdg, rot: this.rot,
      windRelSpeed: rs, windRelAngle: wrapAngle(ra),
      windTrueSpeed: Math.hypot(tN, tE), windTrueFrom: Math.atan2(-tE, -tN),
      curEst: this.cur,
    };
    void KN;
  }
}
