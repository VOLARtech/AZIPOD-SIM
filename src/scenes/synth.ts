// A chart for a hand-built scenario, made from the scenario itself: its base depth and shoals become depth
// areas, the steps between them contours at the standard values crossed, the water is sounded on a grid,
// quays and banks are land, the berths are named, and the scenario's own marks (IALA-correct, see
// ui/chart/marks.ts) are its aids to navigation. Exactly the depths the physics uses.
import type { Scenario } from '../scenarios';
import { depthAt } from '../scenarios';
import type { ChartModel, Ring } from '../ui/chart/model';
import type { Pt } from '../physics/contact';
import { inPoly } from '../physics/harbour';

/** Standard contour values (m), as on charts. */
export const STD_CONTOURS = [2, 5, 10, 15, 20, 30, 50, 100, 200];

/** The area the chart covers: everything in the scenario, and some water round it. */
export function chartExtent(sc: Scenario): [number, number, number, number] {
  const pts: Pt[] = [[sc.start.n, sc.start.e]];
  for (const o of sc.obstacles) pts.push(...o.poly);
  for (const s of sc.shoals) pts.push(...s.poly);
  if (sc.berth) pts.push([sc.berth.n, sc.berth.e]);
  for (const t of sc.traffic ?? []) pts.push([t.start.n, t.start.e]);
  for (const f of sc.ice ?? []) pts.push(...f.poly);
  let [n0, e0, n1, e1] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const [n, e] of pts) { n0 = Math.min(n0, n); e0 = Math.min(e0, e); n1 = Math.max(n1, n); e1 = Math.max(e1, e); }
  const m = Math.max(1000, 0.25 * Math.max(n1 - n0, e1 - e0));
  return [n0 - m, e0 - m, n1 + m, e1 + m];
}

const ccw = (r: Ring[]): Ring[] => { let A = 0; for (let i = 0, j = r.length - 1; i < r.length; j = i++) A += (r[j][1] - r[i][1]) * (r[j][0] + r[i][0]); return A < 0 ? r : [...r].reverse(); };

export function synthChart(sc: Scenario): ChartModel {
  const [n0, e0, n1, e1] = chartExtent(sc), d = depthAt(sc), base = isFinite(sc.depth) ? sc.depth : null;
  const solid = (n: number, e: number) => sc.obstacles.some(o => o.kind !== 'ship' && inPoly(n, e, o.poly));
  const depare: ChartModel['depare'] = [{ d1: base, d2: null, rings: [ccw([[n0, e0], [n0, e1], [n1, e1], [n1, e0]])] }];
  // shoals, deepest first so the shallower ones lie over them (one area each: the painter's order of the depth classes)
  for (const s of [...sc.shoals].sort((a, b) => b.depth - a.depth)) depare.push({ d1: s.depth, d2: base, rings: [ccw(s.poly as Ring[])] });
  // contours: a shoal's edge steps the depth from what lies outside it to its own; every standard value in
  // between runs along that edge (the steps the physics has are the contours the chart shows)
  const contours: ChartModel['contours'] = [];
  for (const s of sc.shoals) {
    const p = s.poly as Ring[], k = p.length;
    for (let i = 0; i < k; i++) {
      const a = p[i], b = p[(i + 1) % k], dn = b[0] - a[0], de = b[1] - a[1], L = Math.hypot(dn, de) || 1;
      // outward: probe both sides of the edge's middle, the one outside the shoal is the surrounding water
      const mid: Pt = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], nrm: Pt = [de / L, -dn / L];
      const q1: Pt = [mid[0] + nrm[0] * 3, mid[1] + nrm[1] * 3], q2: Pt = [mid[0] - nrm[0] * 3, mid[1] - nrm[1] * 3];
      const out = inPoly(q1[0], q1[1], s.poly) ? q2 : q1;
      if (solid(out[0], out[1])) continue;                          // along a bank: the coastline is the edge
      const dOut = d(out[0], out[1]), lo = Math.min(s.depth, dOut), hi = Math.max(s.depth, dOut);
      for (const v of STD_CONTOURS) if (v > lo && v <= hi && isFinite(hi)) contours.push({ v, pts: [a, b] });
    }
  }
  // soundings: a grid over the water, jittered so it reads like a survey, plus each shoal's least depth
  const soundings: [number, number, number][] = [];
  const span = Math.max(n1 - n0, e1 - e0), g = Math.min(400, Math.max(60, span / 40));
  let seed = 9; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  if (base !== null || sc.shoals.length) for (let n = n0 + g / 2; n < n1; n += g) for (let e = e0 + g / 2; e < e1; e += g) {
    const pn = n + (rnd() - 0.5) * g * 0.5, pe = e + (rnd() - 0.5) * g * 0.5, z = d(pn, pe);
    if (isFinite(z) && !solid(pn, pe)) soundings.push([pn, pe, Math.round(z * 10) / 10]);
  }
  for (const s of sc.shoals) {
    let cn = 0, ce = 0; for (const [n, e] of s.poly) { cn += n; ce += e; } cn /= s.poly.length; ce /= s.poly.length;
    if (inPoly(cn, ce, s.poly) && !solid(cn, ce)) soundings.push([cn, ce, s.depth]);
  }
  // land and shoreline constructions: banks are land, quays and piers built-up land with a hard edge
  const land: Ring[][][] = sc.obstacles.filter(o => o.kind !== 'ship').map(o => [ccw(o.poly as Ring[])]);
  const slcons: ChartModel['slcons'] = sc.obstacles.filter(o => o.kind !== 'bank' && o.kind !== 'ship').map(o => ({ c: o.kind === 'pier' ? 4 : 6, pts: [...o.poly, o.poly[0]] as Ring[] }));
  const labels: ChartModel['labels'] = (sc.berths ?? []).filter(b => b.len >= 100).map(b => {
    const s = b.len / 2, off = 30;
    return { k: 'BERTHS', n: b.a[0] + b.dir[0] * s + b.nrm[0] * off, e: b.a[1] + b.dir[1] * s + b.nrm[1] * off, t: b.name.replace(/^.* · /, '') };
  });
  return {
    id: sc.id, fill: 'nonzero',
    meta: { datum: sc.chartDatum ?? 'chart datum', iala: sc.iala ?? 'A', source: 'Schematic chart of the scenario', synthetic: true },
    depare, drgare: [], land, contours, soundings, slcons, aids: sc.marks ?? [], labels, bridges: [],
  };
}
