// What a chart holds, whatever it was made from (an ENC, or a hand-built scenario's own depths):
// depth areas, contours, soundings, land and shoreline constructions, aids to navigation with their lights.
import type { Light } from './lights';

export type Ring = [number, number];                 // [n, e] m
export interface DepthArea { d1: number | null; d2: number | null; rings: Ring[][] }

/** An aid to navigation, S-57 style. */
export interface Aid {
  /** Object class: BOYLAT BOYCAR BOYISD BOYSAW BOYSPP (buoys), BCNLAT BCNCAR BCNISD BCNSAW BCNSPP (beacons),
   *  LIGHTS (a light on its own structure), LNDMRK, FOGSIG, MORFAC. */
  k: string;
  n: number; e: number;
  col: string[];               // body colours, top down (COLOUR)
  colpat?: number;             // COLPAT: 1 horizontal bands, 2 vertical stripes, 3 diagonal, 4 squared
  shp?: number;                // BOYSHP (1 conical, 2 can, 3 spherical, 4 pillar, 5 spar, 6 barrel, 7 super-buoy) or BCNSHP
  cat?: number;                // CATLAM (1 port, 2 stbd, 3 pref. channel to stbd, 4 to port) / CATCAM (1 N, 2 E, 3 S, 4 W)
  top?: number;                // TOPSHP
  topCol?: string[];
  name?: string;
  light?: Light;
  fog?: string;                // fog signal (horn, siren…)
}

export interface ChartModel {
  id: string;
  meta: { datum: string; iala: 'A' | 'B'; source: string; synthetic?: boolean; note?: string };
  /** Fill rule for the area rings: ENC rings carry holes the other way round only once oriented ('nonzero'). */
  fill: CanvasFillRule;
  depare: DepthArea[];
  drgare: { d: number | null; name?: string; rings: Ring[][] }[];
  land: Ring[][][];
  contours: { v: number | null; pts: Ring[] }[];
  soundings: [number, number, number][];
  slcons: { c: number | null; pts: Ring[] }[];
  aids: Aid[];
  labels: { k: string; n: number; e: number; t: string }[];
  bridges: { rings: Ring[][]; verclr?: number; name?: string }[];
}

/** Charts as built by tools/chart/build_chart.py (lights as objects of their own) → the model. */
export function fromEncJson(id: string, j: {
  depare: DepthArea[]; drgare: ChartModel['drgare']; land: Ring[][][]; contours: ChartModel['contours']; soundings: [number, number, number][];
  slcons: ChartModel['slcons']; labels: ChartModel['labels']; bridges: ChartModel['bridges'];
  aids: { k: string; n: number; e: number; col: string[]; objnam?: string; catlam?: number; catcam?: number; litchr?: number; sigper?: number; siggrp?: string; boyshp?: number; bcnshp?: number; colpat?: number; topshp?: number; height?: number; valnmr?: number; orient?: number; sectr1?: number; sectr2?: number }[];
}, meta: ChartModel['meta']): ChartModel {
  const aids: Aid[] = [];
  const lights = j.aids.filter(a => a.k === 'LIGHTS');
  for (const a of j.aids) {
    if (a.k === 'LIGHTS') continue;
    aids.push({ k: a.k, n: a.n, e: a.e, col: a.col, colpat: a.colpat, shp: a.boyshp ?? a.bcnshp, cat: a.catlam ?? a.catcam, top: a.topshp, name: a.objnam });
  }
  // a light charted on a buoy or beacon is that aid's light; the rest stand on their own (pierheads, towers)
  for (const l of lights) {
    const light: Light = { chr: l.litchr ?? 2, grp: l.siggrp, per: l.sigper, col: l.col.length ? l.col : ['white'], h: l.height, range: l.valnmr };
    const host = aids.find(a => !a.light && a.k !== 'MORFAC' && Math.abs(a.n - l.n) < 4 && Math.abs(a.e - l.e) < 4);
    if (host) host.light = light;
    else {
      // sectored lights come as one LIGHTS object per sector at the same point
      const same = aids.find(a => a.k === 'LIGHTS' && Math.abs(a.n - l.n) < 1 && Math.abs(a.e - l.e) < 1);
      if (same && l.sectr1 !== undefined && l.sectr2 !== undefined) (same.light!.sectors ??= []).push({ from: l.sectr1, to: l.sectr2, col: light.col[0] });
      else aids.push({ k: 'LIGHTS', n: l.n, e: l.e, col: light.col, name: l.objnam, light: l.sectr1 !== undefined && l.sectr2 !== undefined ? { ...light, sectors: [{ from: l.sectr1, to: l.sectr2, col: light.col[0] }] } : light });
    }
  }
  return { id, meta, fill: 'evenodd', depare: j.depare, drgare: j.drgare, land: j.land, contours: j.contours, soundings: j.soundings, slcons: j.slcons, aids, labels: j.labels, bridges: j.bridges };
}
