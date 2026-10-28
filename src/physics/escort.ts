// The ship a tug is working: her own manoeuvring model, autopilot holding a course at a set
// engine order, the reaction of the towline at her fairlead, and scripted failures for
// training (rudder jammed, engine stopped) at a given time.
import { DEG } from './consts';
import type { ShipSpec } from './ship';
import { Command, Env, Model, ShipState, World, makeState, rk4, updateActuators, wrap } from './sim';
import { engines, helm, primeRunning } from './pilot';
import { Towline, pointWorld, towReaction } from './towline';
import { buildHull } from './contact';

export interface EscortSetup {
  ship: string;                  // ship id
  kn: number;                    // speed through the water [kn]
  course: number;                // course to hold [deg]
  fair: 'aft' | 'fwd';           // the ship's fairlead: centre lead aft, or the bow chock
  tugPoint: number;              // index into the tug's towPoints
  L0: number;                    // towline paid out [m]
  failure?: { t: number; kind: 'rudder' | 'engine'; rudder?: number; text: string };
}

export class Escort {
  model: Model; st: ShipState; cmd: Command; hull: [number, number][];
  failed = false; t = 0; ordered: number;
  constructor(public spec: ShipSpec, public setup: EscortSetup, public line: Towline, n: number, e: number, env: Env) {
    this.model = new Model(spec, env.depth);
    this.st = makeState(spec, n, e, setup.course, setup.kn);
    const f = Math.min(1, setup.kn / spec.vmaxKn);
    primeRunning(spec, this.st, f);
    this.cmd = { pods: spec.pods.map(() => ({ alpha: 0, rpm: 0 })), bt: 0 };
    engines(spec, this.cmd, f);
    this.ordered = setup.course * DEG;
    this.hull = buildHull(spec.L, spec.B, spec.xg, spec.LOA);
  }
  /** World position and velocity of her fairlead. */
  anchor() { return pointWorld(this.st, this.line.fairShip); }
  step(dt: number, env: Env, tugPoint: [number, number]) {
    this.t += dt;
    const fl = this.setup.failure;
    if (fl && !this.failed && this.t >= fl.t) this.failed = true;
    // autopilot: rudder to hold the course (a jammed rudder stays put)
    if (this.failed && fl?.kind === 'rudder') helm(this.spec, this.cmd, (fl.rudder ?? 20) * DEG);
    else helm(this.spec, this.cmd, Math.max(-0.35, Math.min(0.35, 1.2 * wrap(this.ordered - this.st.psi) - 30 * this.st.r)));
    if (this.failed && fl?.kind === 'engine') engines(this.spec, this.cmd, 0);
    const ext = towReaction(this.st, this.line, tugPoint);
    const world: World = { obstacles: [], fenders: [], contact: false, ext };
    updateActuators(this.spec, this.st, this.cmd, dt);
    rk4(this.model, this.st, env, { V: env.windSpeed, from: env.windFrom }, world, dt);
  }
}
