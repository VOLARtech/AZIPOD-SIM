// Main-thread loaders for scenario data too big to bundle up front (fetched as separate chunks).
// Workers never import these: the main thread posts the loaded data to them.
import type { Scenario } from '../scenarios';
import type { DepthGrid } from '../physics/harbour';
import type { Pt } from '../physics/contact';

export type ScenarioData = { grid: DepthGrid; land: Pt[][] };
const LOADERS: Record<string, () => Promise<{ default: unknown }>> = {
  'miami-terminal-v': () => import('./miami.physics.json'),
};
const loaded = new Map<string, ScenarioData>();

/** Make sure a scenario's heavy data is installed; returns it (for posting to workers). */
export async function ensureScenario(sc: Scenario): Promise<ScenarioData | null> {
  if (!sc.needsData) return null;
  let d = loaded.get(sc.id);
  if (!d) { d = (await LOADERS[sc.id]()).default as ScenarioData; loaded.set(sc.id, d); }
  sc.setData!(d);
  return d;
}
