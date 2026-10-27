import type { Scenario } from '../scenarios';
import type { Runtime } from '../physics/runtime';
import type { Command } from '../physics/sim';
import type { Alt, Track } from '../physics/predict';
import type { SensorMode } from '../physics/sensors';

export type Unit = 'cm' | 'ms' | 'kn';
export type Palette = 'auto' | 'day' | 'dusk' | 'night';

export const S = {
  sc: null as unknown as Scenario,
  rt: null as unknown as Runtime,
  cmd: { pods: [{ alpha: 0, rpm: 0 }, { alpha: 0, rpm: 0 }], bt: 0, mode: 'twin' } as Command,
  env: { windKn: 0, windFrom: 0, curKn: 0, curSet: 0, gusts: false },
  view: { cN: 0, cE: 0, scale: 1, headUp: false, follow: true, rot: 0 },
  pred: {
    mode: 1 as 0 | 1 | 2,                 // off / track / track + what-if
    count: 2, intervalIdx: 0,             // 0 = auto, else ×10 s
    alts: new Set<Alt>(['port', 'stbd', 'crash', 'coast']),
    source: 'onboard' as 'ideal' | 'onboard',
    staticArc: false,
    tracks: [] as Track[], jobId: 0, pending: false, lastSend: 0,
    interval: 30, horizon: 150,
  },
  disp: { vecMin: 1, unit: 'ms' as Unit, palette: 'auto' as Palette, truth: false, detail: 'clean' as 'clean' | 'full', view: '2d' as '2d' | 'split' | '3d', sound: true, vol: 0.6, haptics: true, cam: 'bridge' as 'bridge' | 'port' | 'stbd' | 'chase' },
  sensMode: 'real' as SensorMode,
  speedIdx: 0, paused: false,
  quay: [{ d: Infinity, rate: 0, n: 0, e: 0, pn: 0, pe: 0 }, { d: Infinity, rate: 0, n: 0, e: 0, pn: 0, pe: 0 }],
};
export const full = () => S.disp.detail === 'full';
export const SPEEDS = [1, 2, 4, 8];

/** Auto ghost spacing: tighter in the berth, longer in transit (PPU/docking-display practice). */
export function ghostInterval(sogKn: number) {
  if (S.pred.intervalIdx > 0) return S.pred.intervalIdx * 10;
  return sogKn < 3 ? 30 : sogKn < 8 ? 45 : 60;
}
