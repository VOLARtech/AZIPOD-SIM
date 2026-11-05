// Charts by scenario: a real one (ENC-derived, loaded on demand), else one made from the scenario itself.
import type { Scenario } from '../../scenarios';
import { fromEncJson, type ChartModel } from './model';
import { synthChart } from '../../scenes/synth';
export type { ChartModel } from './model';
export { drawChartBase, drawChartMarks, chartInfo } from './render';

const REAL: Record<string, () => Promise<ChartModel>> = {
  miami: async () => fromEncJson('miami', (await import('../../scenes/miami.chart.json')).default as never,
    { datum: 'MLLW', iala: 'B', source: 'NOAA ENC' }),
};
const loaded = new Map<string, ChartModel>();
const synth = new WeakMap<Scenario, ChartModel>();

/** Fetch a real chart (once). */
export async function loadChart(id: string) {
  if (loaded.has(id) || !REAL[id]) return;
  loaded.set(id, await REAL[id]());
}
/** The chart to draw for a scenario: its real chart once loaded, else (hand-built) its schematic chart. */
export function chartOf(sc: Scenario): ChartModel | null {
  if (sc.chart) return loaded.get(sc.chart) ?? null;
  let m = synth.get(sc);
  if (!m) synth.set(sc, (m = synthChart(sc)));
  return m;
}
