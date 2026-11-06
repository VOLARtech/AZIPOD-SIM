// Charts by scenario: a real one (ENC-derived, loaded on demand), else one made from the scenario itself.
import type { Scenario } from '../../scenarios';
import type { ChartModel } from './model';
import { synthChart } from '../../scenes/synth';
import { AREAS } from '../../scenes/areas';
import { fetchAreaChart } from '../../scenes/areafetch';
export type { ChartModel } from './model';
export { drawChartBase, drawChartMarks, chartInfo } from './render';

const loaded = new Map<string, ChartModel>();
const synth = new WeakMap<Scenario, ChartModel>();

/** Fetch a real chart (once). */
export async function loadChart(id: string) {
  if (loaded.has(id) || !AREAS[id]) return;
  const m = await fetchAreaChart(id) as ChartModel;
  loaded.set(id, { ...m, id });
}
/** The chart to draw for a scenario: its real chart once loaded, else (hand-built) its schematic chart. */
export function chartOf(sc: Scenario): ChartModel | null {
  if (sc.chart) return loaded.get(sc.chart) ?? null;
  let m = synth.get(sc);
  if (!m) synth.set(sc, (m = synthChart(sc)));
  return m;
}
