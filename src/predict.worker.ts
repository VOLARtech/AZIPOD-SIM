import { SHIP, setShip } from './physics/ship';
import { setHull, buildHull } from './physics/contact';
import { PredictJob, runPrediction } from './physics/predict';
import { scenarioWorld } from './scenarios';

setHull(buildHull(SHIP.L, SHIP.B, SHIP.xg, SHIP.LOA));
self.onmessage = (e: MessageEvent<PredictJob>) => {
  const job = e.data;
  if (job.shipId !== SHIP.id) { setShip(job.shipId); setHull(buildHull(SHIP.L, SHIP.B, SHIP.xg, SHIP.LOA)); }
  const tracks = runPrediction(SHIP, job, scenarioWorld(job.scenarioId));
  (self as unknown as Worker).postMessage({ id: job.id, tracks });
};
