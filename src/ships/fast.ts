// High-speed craft. Particulars typical of the type, not a particular vessel.
import { DEG } from '../physics/consts';
import type { PodSpec, ShipSpec } from '../physics/ship';

const jet = (label: string, x: number, y: number, tol: number): PodSpec => ({
  label, kind: 'waterjet', x, y, Tb: 0, asternFrac: 0, strutArea: 0, D: 1.0, P: 6.5e6,
  slewMul: 1 + tol * 0.03, thrustMul: 1 - Math.abs(tol) * 0.01, alphaOffset: tol * 0.2 * DEG,
  jet: { nozzleMax: 30 * DEG, Anoz: 0.40, respT: 2.0, bucketTime: 4.0, idle: 0.32, rpmTime: 14 },
});

/** 70 m wave-piercing catamaran fast ferry, 36 kn: four steerable, reversing waterjets. */
export const HSC_CAT: ShipSpec = {
  id: 'hsc-cat', name: 'Fast ferry 70 m · 36 kn', type: 'fast ferry', station: 'waterjet', load: 'full load, 700 t',
  note: 'Typical 70 m aluminium catamaran fast ferry (HSC Code craft): four 6.5 MW diesels, each driving a steerable, reversing waterjet (nozzle ±30°, bucket for astern), 36 kn at full load. Jet thrust from momentum flux with the pump power balance; the bucket keeps the nozzle\'s side force on the same side ahead and astern, so bucket at zero and nozzles over gives pure side force at the stern. Hull: Clarke for one demi-hull, twice, plus the resistance hump of a fast slender hull. Pumps are held below their cavitation limit at low speed.',
  LOA: 70, vmaxKn: 36,
  L: 63, B: 17.5, T: 2.5, Cb: 2 * 0.48 * 4.6 / 17.5, xg: -3,
  hullForm: 'cat', demi: { B: 4.6, Cb: 0.48, y: 6.45 },
  pods: [jet('P OUT', -29.3, -7.5, -1), jet('P IN', -29.3, -5.4, 0.5), jet('S IN', -29.3, 5.4, -0.5), jet('S OUT', -29.3, 7.5, 1)],
  bowThruster: { x: 27, Tmax: 40e3, P: 350e3 }, btRpmTime: 4,
  windage: { AF: 175, AL: 560, cx: 0.75, cy: 0.85, cn: 0.09, xw: 4 },
  wake: 0.04, tded: 0.03, Vzero: 20, Cd: 1.4, formFactor: 1.25,
  podSlew: 15 * DEG, podRpmTime: 14, asternMax: 0, revInterlock: 1,
  powerAvail: 0.6e6, bridgeX: 22, ramK: 0,
  roll: { GM: 20, KG: 5.6, kxx: 6.6, zWind: 5, vanish: 40 * DEG },
  look: {
    freeboard: 3.4, bridgeH: 10.6, bridgeLen: 4, wingOut: 0.2,
    decks: [{ x0: -24, x1: 20, h: 7.6, inset: 0.6 }, { x0: -8, x1: 24, h: 10.2, inset: 2.2 }],
    funnel: { x: -14, h: 12, w: 1.6, l: 3 },
    hull: '#f2f3f1', topsides: '#1f4e8c', super: '#f2f3f1', glass: '#1b2530', accent: '#d23a2b',
  },
};
