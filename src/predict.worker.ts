import { SHIP, setShip } from './physics/ship';
import { setHull, buildHull, type Fender, type Pt } from './physics/contact';
import { PredictJob, runPrediction } from './physics/predict';
import { SCENARIOS, installArea, scenarioWorld } from './scenarios';
import { parsePack } from './scenes/pack';
import type { BerthSpec } from './physics/berths';

type Msg = PredictJob
  | { kind: 'area'; id: string; pack: ArrayBuffer; specs?: BerthSpec[] }
  /** The berth editor changed a scenario's fenders and bollards: take the main thread's lists. */
  | { kind: 'harbour'; id: string; fenders: Fender[]; bollards: Pt[] };

setHull(buildHull(SHIP.L, SHIP.B, SHIP.xg, SHIP.LOA));
self.onmessage = (e: MessageEvent<Msg>) => {
  const m = e.data;
  if ('kind' in m) {
    if (m.kind === 'area') { installArea(m.id, parsePack(m.pack), m.specs); return; }
    const sc = SCENARIOS.find(s => s.id === m.id);
    if (!sc) return;
    { sc.fenders.splice(0, sc.fenders.length, ...m.fenders); sc.bollards.splice(0, sc.bollards.length, ...m.bollards); }
    return;
  }
  const job = m;
  try {
    if (job.shipId !== SHIP.id) { setShip(job.shipId); setHull(buildHull(SHIP.L, SHIP.B, SHIP.xg, SHIP.LOA)); }
    const tracks = runPrediction(SHIP, job, scenarioWorld(job.scenarioId));
    (self as unknown as Worker).postMessage({ id: job.id, tracks });
  } catch (err) {
    // always answer, so the main thread never waits for a reply that will not come
    (self as unknown as Worker).postMessage({ id: job.id, tracks: [], error: String(err) });
  }
};
