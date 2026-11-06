import { DEG, KN, ShipSpec, wrapAngle } from './ship';
import {
  ActStatus, Command, Env, Gust, Model, ShipState, World, Breakdown, emptyBreakdown, emptyStatus, rk4, updateActuators, thrusterEff,
} from './sim';
import { ContactInfo, Fender, Obstacle, Pt } from './contact';
import { DepthField, bankEffect, groundingForces, squat, washReflection } from './harbour';
import { Damage, Hit } from './damage';
import { MooringLine, Tug, LINE, makeLines, makeTugs, passLine, tugEngaged, tugForces, updateTugs, updateWinches } from './mooring';
import { DPState, JoyInput, allocate, dpForces, joyLimits } from './allocation';
import { Sensors } from './sensors';
import { isPod } from './units/kinds';
import { Escort, EscortSetup } from './escort';
import { RollState, deckEdge, rollInit, stepRoll } from './roll';
import { makeTowline, pointWorld, towForce, updateTowWinch } from './towline';
import { DpSystem } from './dp';
import { Traffic, hullsTouch, interaction } from './traffic';
import { IceState } from './ice';
import { HULL } from './contact';
import { HarbourIndex, harbourIndex } from './spatial';
import type { LockSim } from './lock';

export const DT = 0.05;
/** Joystick auto heading (HDG HOLD), rate gain × ship length in m/s: 1.7 /s on the 47 m yacht, 0.32 /s on a
 *  250 m cruise ship, whose slower pods and thruster would otherwise chase the swing round and round. */
export const JOY_RATE_GAIN = 80;
/** …and its heading stiffness, rad/s: soft, as the bow thruster takes seconds to spin up. */
export const JOY_HDG_W = 0.12;

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
  /** A lock worked by a lock master (its gates are moving obstacles, its levelling pulls on the ship). */
  lock?: LockSim;
  /** Where water levels change: the fairlead and bollard heights, for three-dimensional mooring lines. */
  lineZ?: (st: ShipState) => { fair: number; bol: (i: number) => number };
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
  private hdgLatched = false;                     // auto heading: the heading to keep has been taken
  dp: DPState = { hdgHold: false, posHold: false, psiRef: 0, nRef: 0, eRef: 0 };
  bank = { X: 0, Y: 0, N: 0, side: 0, clear: Infinity };
  wash: ReturnType<typeof washReflection> = { X: 0, Y: 0, N: 0, hits: [] };
  sq = 0; depthHere = Infinity; ukc = Infinity;
  wasInContact = false; wasAground = false;
  contactLog: ContactEvent[] = [];
  /** Hull and propulsion damage, flooding and its consequences (off in the test harness and the regression runs). */
  damage: Damage;
  damageOn = false;
  private hits: Hit[] = []; private gpts: { x: number; F: number; v: number }[] = [];
  alerts: Alert[] = [];
  trail: [number, number][] = [];
  escort: Escort | null = null;            // the ship this tug is working, with the towline
  roll: RollState | null = null;           // heel, for ships with roll data
  capsized = false;
  dps: DpSystem | null = null;             // DP system for ships with a DP console
  traffic: Traffic[] = [];                 // other ships under way in the scenario
  ice: IceState | null = null;             // level ice in the scenario
  iceF = { X: 0, Y: 0, N: 0 };
  inter = { X: 0, Y: 0, N: 0 };            // ship-ship interaction on own ship, this step
  private touching = new Set<Traffic>();
  dpScript: { t: number; kind: string; unit?: number; ref?: string; dir?: number; done?: boolean }[] = [];
  private trailT = 0; private hydroT = 0; private hydroDepth = NaN; private lockSaid = 0;

  constructor(public spec: ShipSpec, public state: ShipState, public cmd: Command,
              public env: Env, public harbour: HarbourSetup) {
    this.model = new Model(spec, env.depth);
    this.bd = emptyBreakdown(spec.pods.length);
    this.status = emptyStatus(spec.pods.length);
    this.sensors = new Sensors(spec);
    if (harbour.mooringSide) this.lines = makeLines(spec.L, spec.B, spec.xg, harbour.mooringSide);
    if (harbour.tugSide) this.tugs = makeTugs(spec.L, spec.xg, harbour.tugSide, harbour.tugBP);
    this.damage = new Damage(spec);
    this.world = {
      obstacles: harbour.obstacles, fenders: harbour.fenders, lines: this.lines, bollards: harbour.bollards,
      lineT: this.lines.map(() => 0), ext: { X: 0, Y: 0, N: 0 }, depthAt: harbour.depthAt, squat: 0, aground: 0,
    };
    this.reindex();
    this.sensors.step(state, 0, env.current(state.n, state.e), this.wind());
    if (spec.roll) this.roll = rollInit();
    if (spec.station === 'dp') {
      const M = this.model.h.M;
      this.dps = new DpSystem(spec, [M[0], M[4], M[8]]);
      this.dps.hold(this.sensors.out.est);
    }
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
  /** The joystick allocator drives two azimuthing pods and a bow thruster (the tugs have their own console). */
  get canJoy() { return this.spec.pods.length === 2 && this.spec.pods.every(isPod) && this.spec.bowThruster.Tmax > 0; }
  setLever(m: LeverMode) {
    this.lever = m;
    if (m !== 'joy') { this.dp.hdgHold = this.dp.posHold = false; this.joy = { x: 0, y: 0, r: 0 }; }
    else if (!this.dp.hdgHold) this.setHdgHold(true);   // joystick starts in auto heading; HDG HOLD off is the plain joystick
  }
  /** Auto heading: stops any swing, then keeps the heading she settles on (the twist still turns her). */
  setHdgHold(on: boolean) { this.dp.hdgHold = on; this.dp.psiRef = this.sensors.out.est.psi; this.hdgLatched = false; }
  setPosHold(on: boolean) { const e = this.sensors.out.est; this.dp.posHold = on; this.dp.nRef = e.n; this.dp.eRef = e.e; }

  /** Rebuild the spatial index over the harbour's obstacles, fenders and bollards (after a berth edit). */
  reindex() { this.index = this.world.index = harbourIndex(this.harbour.obstacles, this.harbour.fenders, this.harbour.bollards); }
  index!: HarbourIndex;

  passLine(i: number) {
    const ok = passLine(this.state, this.lines[i], this.harbour.bollards, this.index, this.harbour.lineZ?.(this.state));
    this.alert(ok ? `${this.lines[i].name} ashore` : `${this.lines[i].name}: no bollard within ${LINE.reach} m`, ok ? 'good' : '');
    return ok;
  }
  letGo(i: number) { const l = this.lines[i]; l.state = 'stowed'; l.T = 0; }
  /** Rig the mooring lines on the other side (none may be fast). Returns whether it was done. */
  setMooringSide(side: -1 | 1) {
    if (this.lines.some(l => l.state === 'fast')) return false;
    this.harbour.mooringSide = side;
    this.lines.splice(0, this.lines.length, ...makeLines(this.spec.L, this.spec.B, this.spec.xg, side));
    this.world.lineT = this.lines.map(() => 0);
    return true;
  }
  /** Send the tugs round to the other side (only while none is working). */
  setTugSide(side: -1 | 1) {
    if (!this.tugs.length || this.tugs.some(tugEngaged)) return false;
    this.harbour.tugSide = side;
    this.tugs = makeTugs(this.spec.L, this.spec.xg, side, this.harbour.tugBP);
    return true;
  }

  step(dt = DT) {
    const st = this.state, spec = this.spec;
    const cur = this.env.current(st.n, st.e);
    const wind = this.wind();
    this.sensors.step(st, dt, cur, wind);

    // joystick / DP → lever orders (on sensor estimates, like the real system)
    if (this.lever === 'joy' && this.canJoy) {
      const uc = Math.cos(st.psi) * cur[0] + Math.sin(st.psi) * cur[1];
      const btEff = thrusterEff(st.u - uc);
      const lim = joyLimits(spec, btEff);
      const d = dpForces(spec, this.model.h.M[0], this.model.h.M[8], this.sensors.out.est, { ...this.dp, hdgHold: false }, lim);   // position; heading below
      const j = this.joy;
      // touching the stick moves the DP reference: the operator is in charge
      if (this.dp.posHold && (Math.abs(j.x) > 0.05 || Math.abs(j.y) > 0.05)) this.setPosHold(true);
      const c = (a: number) => Math.max(-1, Math.min(1, a));
      // auto heading (HDG HOLD): with the twist centred the gyro stops any swing the stick or the hull causes
      // (pushing sideways under way turns the bow against the push), then keeps the heading she settles on.
      // Off, the stick is a plain force order and she swings as the hull and thrusters dictate.
      let yaw = j.r;
      if (this.dp.hdgHold) {
        const est = this.sensors.out.est;
        if (Math.abs(j.r) > 0.05) this.hdgLatched = false;
        else {
          if (!this.hdgLatched && Math.abs(est.r) < 0.2 * DEG) { this.dp.psiRef = est.psi; this.hdgLatched = true; }
          const k = JOY_RATE_GAIN / spec.L, dPsi = this.hdgLatched ? wrapAngle(est.psi - this.dp.psiRef) : 0;
          yaw = -this.model.h.M[8] * (k * est.r + JOY_HDG_W * JOY_HDG_W * dPsi) / lim.N;
        }
      }
      // in auto heading, heading comes before sway: the sideways push gives way when the bow thruster cannot balance it
      allocate(spec, st, { x: c(j.x + d.Y), y: c(j.y + d.X), r: c(yaw) }, btEff, this.cmd, this.dp.hdgHold);
      this.cmd.mode = 'twin';
    } else this.cmd.mode = this.lever === 'joy' ? 'twin' : this.lever;
    if (this.dps) {
      const uc = Math.cos(st.psi) * cur[0] + Math.sin(st.psi) * cur[1];
      const btEff = thrusterEff(st.u - uc);
      const d = this.dps;
      for (const x of this.dpScript) if (!x.done && st.t >= x.t) {
        x.done = true;
        if (x.kind === 'unit') d.fail(x.unit ?? 0);
        else if (x.kind === 'blackout') d.blackout();
        else d.drift(x.kind === 'common' ? 'common' : (x.ref ?? 'DGNSS 1') as 'DGNSS 1', 0.25, (x.dir ?? 60) * Math.PI / 180);
      }
      d.update(st, this.sensors.out.est, { V: this.env.windSpeed, from: this.env.windFrom }, this.cmd, btEff, dt);
      for (const m of d.msgs) this.alert(m, 'heavy');
      d.msgs.length = 0;
      // a tripped unit, or every unit in a blackout, spins down at once rather than at its ramp rate
      const av = d.avail(), k = Math.exp(-dt / 1.2);
      d.acts.forEach((a, j) => { if (av[j]) return; if (a.unit >= 0) { st.pods[a.unit].rpm *= k; if (st.pods[a.unit].pitch !== undefined) st.pods[a.unit].pitch! *= k; } else if (a.unit === -1) st.bt *= k; else if (st.sbt) st.sbt *= k; });
    }

    updateActuators(spec, st, this.cmd, dt, this.status, cur);
    // the lock: gates, levelling and the lock master; what he says goes up as an alert
    const lock = this.harbour.lock;
    if (lock) {
      lock.step(dt, st.t, st, spec, this.lines.filter(l => l.state === 'fast').length);
      const nNew = lock.said - this.lockSaid;
      for (const m of lock.log.slice(Math.max(0, lock.log.length - nNew))) this.alert(`VHF · ${m.from}: ${m.text}`, m.from === spec.name ? '' : 'good');
      this.lockSaid = lock.said;
    }
    if (this.harbour.lineZ) this.world.lineZ = this.harbour.lineZ(st);
    this.gust.step(dt, this.env.gusts && this.env.windSpeed > 0.1);

    // harbour effects held over the step
    updateTugs(this.tugs, st.u, dt);
    const tug = tugForces(this.tugs);
    this.depthHere = this.harbour.depthAt(st.n, st.e);
    const stw = Math.hypot(st.u - (Math.cos(st.psi) * cur[0] + Math.sin(st.psi) * cur[1]), st.v);
    this.bank = bankEffect(spec, st, this.harbour.obstacles, this.depthHere, this.index);
    const confined = this.bank.clear < 2 * spec.B ? 1 : 0;
    this.sq = squat(spec, stw, this.depthHere, confined);
    const dmgT = this.damageOn ? Math.max(this.damage.draughtAt(spec.L / 2), this.damage.draughtAt(-spec.L / 2)) : 0;
    this.ukc = this.depthHere - spec.T - this.sq - dmgT;
    this.wash = washReflection(spec, st, this.bd.pods.map(p => p.T), this.harbour.obstacles, this.index);
    const ext = this.world.ext!;
    // passing ships
    const it = this.inter; it.X = it.Y = it.N = 0;
    for (const tr of this.traffic) {
      const f = interaction(spec, st, tr.spec, tr.st, this.depthHere);
      it.X += f.X; it.Y += f.Y; it.N += f.N;
      const touch = Math.abs(f.gap) < spec.B && hullsTouch(HULL, st, tr.spec, tr.st);
      if (touch && !this.touching.has(tr)) this.alert(`COLLISION · ${tr.setup.label}`, 'heavy');
      if (touch) this.touching.add(tr); else this.touching.delete(tr);
    }
    const ice = this.ice ? this.ice.force(spec, st) : this.iceF;
    this.iceF = ice;
    // other ships are hard: their hulls are obstacles moving with them, so a collision pushes, stops and damages
    const near = this.traffic.filter(t => Math.hypot(t.st.n - st.n, t.st.e - st.e) < (spec.LOA + t.spec.LOA) / 2 + 30);
    const base = lock ? this.harbour.obstacles.concat(lock.obstacles()) : this.harbour.obstacles;
    this.world.obstacles = near.length ? base.concat(near.map(t => {
      const c = Math.cos(t.st.psi), sn = Math.sin(t.st.psi);
      return { poly: t.hull.map(([x, y]) => [t.st.n + x * c - y * sn, t.st.e + x * sn + y * c] as Pt), k: 4e6, c: 1.2e6, mu: 0.3, unload: 0.05, kind: 'ship' as const,
        vel: [t.st.u * c, t.st.u * sn] as Pt, name: `collision with ${t.setup.label}` };
    })) : base;
    // damage: thrust lost on hit units, flooding sinks and trims her (grounding sees it), and drags
    const dmg = this.damage, dmgX = this.damageOn ? dmg.resistance(st.u) : 0;
    if (this.damageOn) { this.model.health = dmg.health; this.model.btHealth = dmg.btHealth; this.world.dmgDraught = dmg.water > 0 ? (x: number) => dmg.draughtAt(x) : undefined; }
    ext.X = tug.X + this.bank.X + this.wash.X + it.X + ice.X + dmgX;
    ext.Y = tug.Y + this.bank.Y + this.wash.Y + it.Y + ice.Y;
    ext.N = tug.N + this.bank.N + this.wash.N + it.N + ice.N;
    if (lock) { ext.X += lock.force.X; ext.Y += lock.force.Y; }
    this.world.squat = this.sq;
    // hydrodynamics follow the water under the keel (1 Hz)
    this.hydroT -= dt;
    if (this.hydroT <= 0) {
      this.hydroT = 1;
      const hEff = isFinite(this.depthHere) ? Math.max(spec.T * 1.05, this.depthHere - this.sq) : Infinity;
      if (!(Math.abs(hEff - this.hydroDepth) < 0.02 * (hEff || 1))) { this.model.setDepth(hEff); this.hydroDepth = hEff; }
    }

    if (this.traffic.length) {
      const tw = { current: this.env.current, wind: this.wind(), own: { st, spec }, traffic: this.traffic };
      for (const tr of this.traffic) tr.step(dt, tw);
    }
    const esc = this.escort;
    // towline tension with both ends at the same instant (end of the last step): the ship takes it
    // as her reaction over this step, as the tug takes the line force inside its own integrator
    const T0 = esc ? esc.line.T : 0;
    if (esc) this.world.tow = { line: esc.line, anchor: esc.anchor() };
    rk4(this.model, st, this.env, wind, this.world, dt);
    // diagnostics at end-of-step state
    this.model.accel(st, this.env, wind, this.world, this.bd, this.ci);
    if (esc) {
      const tp = pointWorld(st, esc.line.fairTug);
      esc.line.T = T0;
      esc.step(dt, this.env, [tp[0], tp[1]]);
      // the stiff line's tension is only meaningful with the ship's fairlead where she is now; with it
      // held at the start of the step the tug has already closed the gap and the line reads slack
      this.world.tow!.anchor = esc.anchor();
      esc.line.T = towForce(st, esc.line, this.world.tow!.anchor).T;
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
    if (this.damageOn) this.stepDamage(dt);
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

  /** Hard contact and grounding this step → hull and unit damage, then flooding and its settling. */
  private stepDamage(dt: number) {
    const st = this.state, spec = this.spec, c = Math.cos(st.psi), s = Math.sin(st.psi), hits = this.hits;
    hits.length = 0;
    if (this.ci.active) for (const p of this.ci.points) {
      // fenders doing their job, the hull moving off, or just lying (or pushing) against it: only an impact damages
      // (and raking: sliding along it under load tears the plating, the friction work counts too)
      const dE = (p.vn < -0.05 ? p.F * -p.vn : 0) + (p.slide ?? 0);
      if (!p.with || dE <= 0) continue;
      const dn = p.n - st.n, de = p.e - st.e;
      hits.push({ x: c * dn + s * de, y: -s * dn + c * de, dE: dE * dt, bottom: false, with: p.with });
    }
    if ((this.world.aground ?? 0) > 0) {
      this.gpts.length = 0;
      groundingForces(spec, st, this.harbour.depthAt, this.sq, this.world.dmgDraught, this.gpts);
      for (const g of this.gpts) if (g.v > 0.05) hits.push({ x: g.x, y: 0, dE: g.F * g.v * dt, bottom: true, with: 'grounding' });   // sliding over the bottom tears it
    }
    this.damage.aground = (this.world.aground ?? 0) > 0.05;
    for (const e of this.damage.step(dt, st, hits)) this.alert(e.text, e.level === 'heavy' ? 'heavy' : '');
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
