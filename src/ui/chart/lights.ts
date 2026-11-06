// Light characteristics (S-57 LITCHR / SIGGRP / SIGPER / COLOUR): the chart abbreviation ("Fl(2)G.6s8m4M"),
// and whether the light shows at a given moment, and in which colour, so the 2D and 3D views flash alike.

/** A light as charted. Sectors are bearings FROM SEAWARD toward the light (S-57 SECTR1/SECTR2), degrees. */
export interface Light {
  chr: number;                 // LITCHR
  grp?: string;                // SIGGRP, e.g. "(2)", "(2+1)", "(6)+LFl"
  per?: number;                // SIGPER [s]
  col: string[];               // colours, e.g. ['white'], ['red'], ['white', 'red', 'green'] (sectored or alternating)
  h?: number;                  // height of the light above the water [m]
  range?: number;              // nominal range [M]
  sectors?: { from: number; to: number; col: string }[];
  morse?: string;              // Mo: the letter
}

const ABBR: Record<number, string> = {
  1: 'F', 2: 'Fl', 3: 'LFl', 4: 'Q', 5: 'VQ', 6: 'UQ', 7: 'Iso', 8: 'Oc', 9: 'IQ', 10: 'IVQ', 11: 'IUQ', 12: 'Mo', 13: 'FFl',
  14: 'Fl+LFl', 15: 'Oc+Fl', 16: 'FLFl', 17: 'Al.Oc', 18: 'Al.LFl', 19: 'Al.Fl', 20: 'Al.Gr', 25: 'Q+LFl', 26: 'VQ+LFl', 27: 'UQ+LFl', 28: 'Al', 29: 'F+Al.Fl',
};
const LETTER: Record<string, string> = { white: 'W', red: 'R', green: 'G', yellow: 'Y', blue: 'Bu', orange: 'Or', violet: 'Vi', amber: 'Am' };

/** The first signal group, e.g. "2" from "(2)", "2+1" from "(2+1)", "6" from S-57's "(6)(1)"; "" for none. */
const groupOf = (grp?: string) => { const m = /\(([^)]*)\)/.exec(grp ?? ''); return m && m[1] !== '1' ? m[1] : ''; };
/** Chart abbreviation, e.g. "Fl(2)G.6s8m4M", "Q(6)+LFl.15s", "Oc.WRG.4s", "Mo(U)15s". White alone is left out, as on charts. */
export function lightText(l: Light) {
  const cols = [...new Set(l.sectors?.length ? l.sectors.map(s => s.col) : l.col)];
  const base = ABBR[l.chr] ?? 'Fl', g = groupOf(l.grp);
  let s = l.chr === 12 ? `Mo(${l.morse ?? (g || 'U')})`
    : l.chr >= 25 && l.chr <= 27 ? `${base.split('+')[0]}${g ? `(${g})` : ''}+LFl`
    : g ? `${base}(${g})` : base;
  const c = cols.length === 1 && cols[0] === 'white' ? '' : cols.map(x => LETTER[x] ?? '').join('');
  const sep = () => (s.endsWith(')') ? '' : '.');
  if (c) s += sep() + c;
  if (l.per) s += sep() + `${+l.per.toFixed(1)}s`;
  if (l.h) s += `${Math.round(l.h)}m`;
  if (l.range) s += `${Math.round(l.range)}M`;
  return s;
}

/** The light's on/off pattern over one period: [duration s, on?] pairs. */
type Phase = [number, boolean];
const cache = new Map<string, { per: number; ph: Phase[] }>();
const MORSE: Record<string, string> = { A: '.-', B: '-...', C: '-.-.', D: '-..', E: '.', K: '-.-', N: '-.', O: '---', R: '.-.', U: '..-', W: '.--', X: '-..-', Y: '-.--' };

function groups(grp: string | undefined): number[] {
  const g = groupOf(grp);
  return g ? g.split('+').map(x => Math.max(1, +x || 1)) : [1];
}
/** Flashes in groups, `on` long, `gap` dark between flashes, `ggap` between groups; dark to the period's end. */
function flashes(gs: number[], on: number, gap: number, ggap: number, per: number, extra: Phase[] = []): { per: number; ph: Phase[] } {
  const ph: Phase[] = [];
  gs.forEach((n, gi) => { for (let i = 0; i < n; i++) { ph.push([on, true]); if (i < n - 1) ph.push([gap, false]); } if (gi < gs.length - 1) ph.push([ggap, false]); });
  if (extra.length) { ph.push([gap * 1.5, false]); ph.push(...extra); }
  const used = ph.reduce((a, p) => a + p[0], 0);
  const P = Math.max(per, used + gap * 1.5);
  ph.push([P - used, false]);
  return { per: P, ph };
}
function pattern(l: Light) {
  const key = `${l.chr}|${l.grp}|${l.per}|${l.morse}`;
  let p = cache.get(key);
  if (p) return p;
  const per = l.per ?? 0, gs = groups(l.grp), long = /LFl/.test(l.grp ?? ''), plain = !groupOf(l.grp);
  switch (l.chr) {
    case 1: p = { per: 1, ph: [[1, true]] }; break;
    case 2: case 19: p = flashes(gs, 0.5, 1.0, 2.0, per || (gs.length > 1 || gs[0] > 1 ? 10 : 5)); break;
    case 3: case 18: p = flashes(gs, 2.0, 1.5, 3.0, per || 10); break;
    case 4: case 25: p = plain && l.chr === 4 ? { per: 1, ph: [[0.3, true], [0.7, false]] } : flashes(gs, 0.3, 0.7, 0.7, per || 10, l.chr === 25 || long ? [[2, true]] : []); break;
    case 5: case 26: p = plain && l.chr === 5 ? { per: 0.5, ph: [[0.2, true], [0.3, false]] } : flashes(gs, 0.2, 0.3, 0.3, per || 5, l.chr === 26 || long ? [[2, true]] : []); break;
    case 6: case 27: p = { per: 0.25, ph: [[0.1, true], [0.15, false]] }; break;
    case 7: p = { per: per || 4, ph: [[(per || 4) / 2, true], [(per || 4) / 2, false]] }; break;
    case 8: case 17: {
      // occulting: light longer than dark; groups of eclipses
      const P = per || (gs[0] > 1 ? 8 : 4), ph: Phase[] = [];
      gs.forEach(n => { for (let i = 0; i < n; i++) { ph.push([n > 1 ? 0.6 : 1, false]); ph.push([0.6, true]); } });
      const used = ph.reduce((a, x) => a + x[0], 0); ph[ph.length - 1][0] += Math.max(0.5, P - used);
      p = { per: Math.max(P, used + 0.5), ph }; break;
    }
    case 9: case 10: case 11: {
      const q = l.chr === 9 ? 1 : l.chr === 10 ? 0.5 : 0.25, P = per || 10, ph: Phase[] = [];
      for (let t = 0; t < 0.6 * P - q; t += q) { ph.push([q * 0.4, true]); ph.push([q * 0.6, false]); }
      ph.push([P - ph.reduce((a, x) => a + x[0], 0), false]);
      p = { per: P, ph }; break;
    }
    case 12: {
      const code = MORSE[(l.morse ?? (groupOf(l.grp) || 'U')).toUpperCase()] ?? MORSE.U, ph: Phase[] = [];
      for (const c of code) { ph.push([c === '.' ? 0.5 : 1.5, true]); ph.push([0.5, false]); }
      const used = ph.reduce((a, x) => a + x[0], 0);
      p = { per: Math.max(per || 15, used + 1), ph: [...ph, [Math.max(per || 15, used + 1) - used, false]] }; break;
    }
    case 13: case 16: case 29: p = { per: per || 10, ph: [[(per || 10) - 1, true], [1, true]] }; break;   // steady, a brighter flash: shows as on
    default: p = flashes(gs, 0.5, 1.0, 2.0, per || 5);
  }
  cache.set(key, p);
  return p;
}

/** Is the light showing at time t [s] (a fixed offset per light keeps neighbours out of step), and in which
 *  of its colours: alternating lights change colour each flash; sectored ones are chosen by bearing. */
export function lightOn(l: Light, t: number, offset = 0): { on: boolean; k: number } {
  const p = pattern(l);
  let x = ((t + offset) % p.per + p.per) % p.per, k = 0;
  for (const [d, on] of p.ph) {
    if (x < d) return { on, k: l.chr >= 17 && l.chr <= 20 || l.chr === 28 ? (Math.floor((t + offset) / p.per) + k) % Math.max(1, l.col.length) : 0 };
    x -= d; if (on) k++;
  }
  return { on: false, k: 0 };
}

/** The colour seen from bearing `brg` [deg true, from the light to the observer], or null outside every sector. */
export function sectorColour(l: Light, brgFromLight: number): string | null {
  if (!l.sectors?.length) return l.col[0] ?? 'white';
  // sectors are given from seaward (toward the light): the observer's bearing from the light, plus 180°
  const b = ((brgFromLight + 180) % 360 + 360) % 360;
  for (const s of l.sectors) {
    const a = ((s.from % 360) + 360) % 360, z = ((s.to % 360) + 360) % 360;
    if (a <= z ? b >= a && b <= z : b >= a || b <= z) return s.col;
  }
  return null;
}
