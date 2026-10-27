import { KN, ShipSpec } from './ship';
import {
  ActStatus, Command, Env, Gust, Model, ShipState, World, Breakdown, emptyBreakdown, emptyStatus, rk4, updateActuators,
} from './sim';
import { ContactInfo, Fender, Obstacle, Pt } from './contact';
import { DepthField, bankEffect, squat, washReflection } from './harbour';
import { MooringLine, Tug, LINE, makeLines, makeTugs, passLine, tugForces, updateTugs, updateWinches } from './mooring';
import { DPState, JoyInput, allocate, dpForces, joyLimits } from './allocation';
import { Sensors } from './sensors';
import { isPod } from './units/kinds';
import { Escort, EscortSetup } from './escort';
import { RollState, deckEdge, rollInit, stepRoll } from './roll';
import { makeTowline, pointWorld, towForce, updateTowWinch } from './towline';

export const DT = 0.05;

export interface ContactEvent {
  t: number; vn: number; F: number;
  hard: boolean;          // steel on concrete/bank rather than fenders
  energy: number;         // energy put into fenders/structure during loading [J]
  maxDefl: number;        // peak fender deflection, fraction of rated
  fenders: number;        // number of fender units loaded
}
export interface Alert { t: number; text: string; cls: '' | 'good' | 'heavy' }
export type LeverMode = 'twin' | 'indep' | 'joy';

export interface HarbourSetup {
  obstacles: Obstacle[]; fenders: Fender[]; bollards: Pt[]; depthAt: DepthField;
  mooringSide?: -1 | 1; tugSide?: -1 | 1; tugBP?: number; confined?: number;
}

export class Runtime {
  model: Model;
  gust = new Gust();
  bd: Breakdown;
  ci: ContactInfo = { active: false, points: [], fenders: [] };
  status: ActStatus;
  sensors: Sensors;
  world: World;
  lines: MooringLine[] = [];
  tugs: Tug[] = [];
  lever: LeverMode = 'twin';
  joy: JoyInput = { x: 0, y: 0, r: 0 };
  dp: DPState = { hdgHold: false, posHold: false, psiRef: 0, nRef: 0, eRef: 0 };
  bank = { X: 0, Y: 0, N: 0, side: 0, clear: Infinity };
  wash: ReturnType<typeof washReflection> = { X: 0, Y: 0, N: 0, hits: [] };
  sq = 0; depthHere = Infinity; ukc = Infinity;
  wasInContact = false; wasAground = false;
  contactLog: ContactEvent[] = [];
  alerts: Alert[] = [];
  trail: [number, number][] = [];
  escort: Escort | null = null;            // the ship this tug is working, with the towline
  roll: RollState | null = null;           // heel, for ships with roll data
  capsized = false;
  private trailT = 0; private hydroT = 0; private hydroDepth = NaN;

  constructor(public spec: ShipSpec, public state: ShipState, public cmd: Command,
              public env: Env, public harbour: HarbourSetup) {
    this.model = new Model(spec, env.depth);
    this.bd = emptyBreakdown(spec.pods.length);
    this.status = emptyStatus(spec.pods.length);
    this.sensors = new Sensors(spec);
    if (harbour.mooringSide) this.lines = makeLines(spec.L, spec.B, spec.xg, harbour.mooringSide);
    if (harbour.tugSide) this.tugs = makeTugs(spec.L, spec.xg, harbour.tugSide, harbour.tugBP);
    this.world = {
      obstacles: harbour.obstacles, fenders: harbour.fenders, lines: this.lines, bollards: harbour.bollards,
      lineT: this.lines.map(() => 0), ext: { X: 0, Y: 0, N: 0 }, depthAt: harbour.depthAt, squat: 0, aground: 0,
    };
    this.sensors.step(state, 0, env.current(state.n, state.e), this.wind());
    if (spec.roll) this.roll = rollInit();
  }

  wind() {
    return { V: this.env.windSpeed * (1 + this.gust.f), from: this.env.windFrom + this.gust.d };
  }
  alert(text: string, cls: Alert['cls'] = '') {
    this.alerts.unshift({ t: this.state.t, text, cls });
    this.alerts.length = Math.min(this.alerts.length, 12);
  }

  /** Make the tug fast to a ship: she steams `setup.L0` + both half-lengths ahead on the tug's heading. */
  attachEscort(setup: EscortSetup, ship: ShipSpec) {
    const tp = this.spec.towPoints?.[setup.tugPoint];
    if (!tp) return;
    const st = this.state, c = Math.cos(st.psi), s = Math.sin(st.psi);
    const fairShip: [number, number] = setup.fair === 'aft' ? [-ship.L / 2 + 3 - ship.xg, 0] : [ship.L / 2 - 4 - ship.xg, 0];
    const d = tp.x + setup.L0 - fairShip[0];                       // tug origin → ship origin, along the heading
    const bp = this.spec.pods.reduce((a, p) => a + p.Tb, 0);
    const line = makeTowline([tp.x, 0], fairShip, tp.h, setup.L0, bp);
    this.escort = new Escort(ship, setup, line, st.n + d * c, st.e + d * s, this.env);
  }
  /** The joystick allocator drives two azimuthing pods and the bow thruster. */
  get canJoy() { return this.spec.pods.length === 2 && this.spec.pods.every(isPod); }
  setLever(m: LeverMode) {
    this.lever = m;
    if (m !== 'joy') { this.dp.hdgHold = this.dp.posHold = false; this.joy = { x: 0, y: 0, r: 0 }; }
  }
  setHdgHold(on: boolean) { this.dp.hdgHold = on; this.dp.psiRef = this.sensors.out.est.psi; }
  setPosHold(on: boolean) { const e = this.sensors.out.est; this.dp.posHold = on; this.dp.nRef = e.n; this.dp.eRef = e.e; }

  passLine(i: number) {
    const ok = passLine(this.state, this.lines[i], this.harbour.bollards);
    this.alert(ok ? `${this.lines[i].name} ashore` : `${this.lines[i].name}: no bollard within ${LINE.reach} m`, ok ? 'good' : '');
    return ok;
  }
  letGo(i: number) { const l = this.lines[i]; l.state = 'stowed'; l.T = 0; }

  step(dt = DT) {
    const st = this.state, spec = this.spec;
    const cur = this.env.current(st.n, st.e);
    const wind = this.wind();
    this.sensors.step(st, dt, cur, wind);

    // joystick / DP → lever orders (on sensor estimates, like the real system)
    if (this.lever === 'joy' && this.canJoy) {
      const uc = Math.cos(st.psi) * cur[0] + Math.sin(st.psi) * cur[1];
      const btEff = 1 / (1 + ((st.u - uc) / 1.6) ** 2);
      const lim = joyLimits(spec, btEff);
      const d = dpForces(spec, this.model.h.M[0], this.model.h.M[8], this.sensors.out.est, this.dp, lim);
      const j = this.joy;
      // touching the stick moves the DP reference: the operator is in charge
      if (this.dp.posHold && (Math.abs(j.x) > 0.05 || Math.abs(j.y) > 0.05)) this.setPosHold(true);
      if (this.dp.hdgHold && Math.abs(j.r) > 0.05) this.dp.psiRef = this.sensors.out.est.psi;
      const c = (a: number) => Math.max(-1, Math.min(1, a));
      allocate(spec, st, { x: c(j.x + d.Y), y: c(j.y + d.X), r: c(j.r + d.N) }, btEff, this.cmd);
      this.cmd.mode = 'twin';
    } else this.cmd.mode = this.lever === 'joy' ? 'twin' : this.lever;

    updateActuators(spec, st, this.cmd, dt, this.status, cur);
    this.gust.step(dt, this.env.gusts && this.env.windSpeed > 0.1);

    // harbour effects held over the step
    updateTugs(this.tugs, st.u, dt);
    const tug = tugForces(this.tugs);
    this.depthHere = this.harbour.depthAt(st.n, st.e);
    const stw = Math.hypot(st.u - (Math.cos(st.psi) * cur[0] + Math.sin(st.psi) * cur[1]), st.v);
    this.bank = bankEffect(spec, st, this.harbour.obstacles, this.depthHere);
    const confined = this.bank.clear < 2 * spec.B ? 1 : 0;
    this.sq = squat(spec, stw, this.depthHere, confined);
    this.ukc = this.depthHere - spec.T - this.sq;
    this.wash = washReflection(spec, st, this.bd.pods.map(p => p.T), this.harbour.obstacles);
    const ext = this.world.ext!;
    ext.X = tug.X + this.bank.X + this.wash.X;
    ext.Y = tug.Y + this.bank.Y + this.wash.Y;
    ext.N = tug.N + this.bank.N + this.wash.N;
    this.world.squat = this.sq;
    // hydrodynamics follow the water under the keel (1 Hz)
    this.hydroT -= dt;
    if (this.hydroT <= 0) {
      this.hydroT = 1;
      const hEff = isFinite(this.depthHere) ? Math.max(spec.T * 1.05, this.depthHere - this.sq) : Infinity;
      if (!(Math.abs(hEff - this.hydroDepth) < 0.02 * (hEff || 1))) { this.model.setDepth(hEff); this.hydroDepth = hEff; }
    }

    const esc = this.escort;
    if (esc) this.world.tow = { line: esc.line, anchor: esc.anchor() };
    rk4(this.model, st, this.env, wind, this.world, dt);
    // diagnostics at end-of-step state
    this.model.accel(st, this.env, wind, this.world, this.bd, this.ci);
    if (esc) {
      const tp = pointWorld(st, esc.line.fairTug);
      esc.step(dt, this.env, [tp[0], tp[1]]);
      const ev = updateTowWinch(esc.line, dt);
      if (ev) this.alert(ev, 'heavy');
    }
    if (this.roll && !this.capsized) {
      const tow = esc && this.world.tow ? towForce(st, esc.line, this.world.tow.anchor) : null;
      stepRoll(spec, this.roll, this.bd, tow ? [{ Y: tow.Y, h: esc!.line.hTug }] : [], dt);
      const phi = Math.abs(this.roll.phi), r = spec.roll!;
      if (phi > r.vanish) { this.capsized = true; this.alert('CAPSIZED', 'heavy'); }
      else if (phi > deckEdge(spec) && st.t % 2 < dt) this.alert(`DECK EDGE UNDER · HEEL ${(phi * 180 / Math.PI).toFixed(0)}°${tow && tow.T > 0 ? ' · GIRTING' : ''}`, 'heavy');
    }
    this.lines.forEach((l, i) => (l.T = this.world.lineT![i]));
    for (const name of updateWinches(this.lines, dt)) this.alert(`${name} PARTED`, 'heavy');
    for (const l of this.lines) if (l.state === 'fast' && l.T > 0.8 * LINE.MBL && st.t % 2 < dt) this.alert(`${l.name} ${(l.T / 9.81e3).toFixed(0)} t — near breaking`, 'heavy');

    this.logContact(dt);
    const ag = (this.world.aground ?? 0) > 0.02;
    if (ag && !this.wasAground) this.alert(`AGROUND · ${(st.u / KN).toFixed(1)} kn`, 'heavy');
    this.wasAground = ag;

    this.trailT += dt;
    if (this.trailT >= 2) {
      this.trailT = 0;
      this.trail.push([st.n, st.e]);
      if (this.trail.length > 900) this.trail.shift();
    }
  }

  private logContact(dt: number) {
    const ci = this.ci;
    if (ci.active) {
      const vin = Math.max(0, ...ci.points.map(p => -p.vn));
      const F = ci.points.reduce((a, p) => a + p.F, 0);
      const hard = ci.points.length > ci.fenders.length;
      let maxDefl = 0;
      for (const f of ci.fenders) {
        const fd = this.harbour.fenders[f.i];
        maxDefl = Math.max(maxDefl, f.defl / (fd.dRated * fd.height));
      }
      const dE = ci.points.reduce((a, p) => a + p.F * Math.max(0, -p.vn), 0) * dt;
      if (!this.wasInContact) {
        this.contactLog.unshift({ t: this.state.t, vn: vin, F, hard, energy: 0, maxDefl, fenders: 0 });
        this.contactLog.length = Math.min(this.contactLog.length, 8);
      }
      const ev = this.contactLog[0];
      ev.vn = Math.max(ev.vn, vin); ev.F = Math.max(ev.F, F); ev.hard ||= hard;
      ev.energy += dE; ev.maxDefl = Math.max(ev.maxDefl, maxDefl);
      ev.fenders = Math.max(ev.fenders, ci.fenders.length);
    }
    this.wasInContact = ci.active;
  }
}
