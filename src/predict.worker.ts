import { SHIP, setShip } from './physics/ship';
import { setHull, buildHull } from './physics/contact';
import { PredictJob, runPrediction } from './physics/predict';
import { SCENARIOS, scenarioWorld } from './scenarios';
import type { ScenarioData } from './scenes/loaders';

setHull(buildHull(SHIP.L, SHIP.B, SHIP.xg, SHIP.LOA));
self.onmessage = (e: MessageEvent<PredictJob | { kind: 'data'; id: string; data: ScenarioData }>) => {
  if ('kind' in e.data) { SCENARIOS.find(s => s.id === (e.data as { id: string }).id)?.setData?.(e.data.data); return; }
  const job = e.data;
  if (job.shipId !== SHIP.id) { setShip(job.shipId); setHull(buildHull(SHIP.L, SHIP.B, SHIP.xg, SHIP.LOA)); }
  const tracks = runPrediction(SHIP, job, scenarioWorld(job.scenarioId));
  (self as unknown as Worker).postMessage({ id: job.id, tracks });
};
