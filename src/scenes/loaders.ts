// Main-thread loaders for scenario data too big to bundle up front: an area's pack (depths, land, berths),
// fetched when the area is first opened. Workers never fetch: the main thread posts them the same pack.
import type { Scenario } from '../scenarios';
import { installArea } from '../scenarios';
import { fetchAreaPack } from './areafetch';
import { parsePack } from './pack';

/** What the predictor worker needs to install the same area: the inflated pack. */
export type ScenarioData = { area: string; pack: ArrayBuffer };

/** Make sure a scenario's area is installed; returns its pack (for posting to workers). */
export async function ensureScenario(sc: Scenario): Promise<ScenarioData | null> {
  if (!sc.area) return null;
  const buf = await fetchAreaPack(sc.area);
  installArea(sc.area, parsePack(buf));
  return { area: sc.area, pack: buf };
}
