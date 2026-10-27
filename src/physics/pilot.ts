// Propulsion-agnostic orders for trials, the predictor and the pilot card:
// "helm 35° to starboard", "full ahead", "crash stop" mean different lever movements
// on a pod ship, a shaft-and-rudder ship or a CPP ship.
import type { ShipSpec } from './ship';
import type { Command, ShipState } from './sim';

/** Turning order, + = turn to starboard [rad]. Pods push the stern the other way; rudders follow the helm. */
export function helm(spec: ShipSpec, cmd: Command, a: number) {
  spec.pods.forEach((p, i) => (cmd.pods[i].alpha = p.kind === 'shaft' || p.kind === 'waterjet' ? a : -a));
}

/** Engine order as a signed fraction of full: shaft rpm, CPP pitch (at constant shaft speed), pod rpm. */
export function engines(spec: ShipSpec, cmd: Command, f: number) {
  spec.pods.forEach((p, i) => {
    const c = cmd.pods[i];
    if (p.shaft?.prop.cpp) { c.pitch = f; c.rpm = 1; }
    else if (p.kind === 'waterjet') { c.bucket = f >= 0 ? 1 : -1; c.rpm = Math.abs(f); }
    else c.rpm = f;
  });
}

/** Current engine order, signed fraction (for "keep the power on while you turn"). */
export function enginesNow(spec: ShipSpec, cmd: Command) {
  const p = spec.pods[0], c = cmd.pods[0];
  return p.shaft?.prop.cpp ? (c.pitch ?? 0) : p.kind === 'waterjet' && (c.bucket ?? 1) < 0 ? -c.rpm : c.rpm;
}

/** Highest astern order the telegraph has (shaft ships), or full astern. */
export function fullAstern(spec: ShipSpec) {
  const sh = spec.pods[0].shaft;
  if (spec.pods[0].kind === 'waterjet') return -0.8;        // bucket down, astern rpm limit
  if (!sh) return -1;
  return sh.prop.cpp ? -sh.prop.cpp.asternPitch : -Math.max(...sh.telegraph.astern);
}

/** Put a ship into steady running at engine order f (engine already running, no transient). */
export function primeRunning(spec: ShipSpec, st: ShipState, f: number) {
  spec.pods.forEach((p, i) => {
    const ps = st.pods[i];
    if (p.shaft?.prop.cpp) { ps.rpm = 1; ps.pitch = f; }
    else if (p.kind === 'waterjet') { ps.rpm = Math.max(p.jet!.idle, Math.abs(f)); ps.bucket = f >= 0 ? 1 : -1; }
    else ps.rpm = f;
    delete ps.eng;
  });
}

export const isShaftShip = (spec: ShipSpec) => spec.pods.some(p => p.kind === 'shaft');
export const isJetShip = (spec: ShipSpec) => spec.pods.some(p => p.kind === 'waterjet');
/** Ships steered by helm and engine orders (rudders or jet nozzles) rather than azimuthing units. */
export const isHelmShip = (spec: ShipSpec) => isShaftShip(spec) || isJetShip(spec);
