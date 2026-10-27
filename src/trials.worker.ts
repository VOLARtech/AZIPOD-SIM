import { SHIP } from './physics/ship';
import { runTrials } from './physics/trials';
import { buildPoster } from './physics/poster';
import { runValidation } from './physics/validation';
self.onmessage = () => {
  const post = (m: unknown) => (self as unknown as Worker).postMessage(m);
  post({ kind: 'poster', poster: buildPoster(SHIP) });
  post({ kind: 'trials', deep: runTrials(SHIP, Infinity).rows, shallow: runTrials(SHIP, 1.2 * SHIP.T).rows, depth: 1.2 * SHIP.T });
  post({ kind: 'validation', v: runValidation() });
};
