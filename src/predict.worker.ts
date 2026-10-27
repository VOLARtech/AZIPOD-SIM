import { SHIP } from './physics/ship';
import { setHull, buildHull } from './physics/contact';
import { PredictJob, runPrediction } from './physics/predict';
import { scenarioWorld } from './scenarios';

setHull(buildHull(SHIP.L, SHIP.B, SHIP.xg));
self.onmessage = (e: MessageEvent<PredictJob>) => {
  const job = e.data;
  const tracks = runPrediction(SHIP, job, scenarioWorld(job.scenarioId));
  (self as unknown as Worker).postMessage({ id: job.id, tracks });
};
