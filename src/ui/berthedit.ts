// Berth editor: put your own fenders and bollards on any quay. Tap near a quay edge to add a bollard on
// it (or a fender on its face, facing the water), or tap one to remove it. Changes are kept per scenario
// in this browser and can be reset to the scenario's own layout.
import { S } from './state';
import type { Fender, Pt } from '../physics/contact';
import { ratedEnergy } from '../scenarios';

export type EditMode = 'bollard' | 'fender' | 'remove';
const KEY = (id: string) => `azb-berth-${id}`;
const originals = new Map<string, { fenders: Fender[]; bollards: Pt[] }>();
const copyF = (f: Fender[]) => f.map(x => ({ ...x }));
const copyB = (b: Pt[]) => b.map(p => [p[0], p[1]] as Pt);

/** Remember the scenario's own layout, then apply what this browser saved for it. */
export function loadBerth() {
  const sc = S.sc;
  if (!originals.has(sc.id)) originals.set(sc.id, { fenders: copyF(sc.fenders), bollards: copyB(sc.bollards) });
  try {
    const v = JSON.parse(localStorage.getItem(KEY(sc.id)) ?? 'null');
    if (v && Array.isArray(v.fenders) && Array.isArray(v.bollards)) { sc.fenders.splice(0, sc.fenders.length, ...v.fenders); sc.bollards.splice(0, sc.bollards.length, ...v.bollards); }
  } catch { /* storage blocked: the scenario's own layout */ }
}
function save() { try { localStorage.setItem(KEY(S.sc.id), JSON.stringify({ fenders: S.sc.fenders, bollards: S.sc.bollards })); } catch { /* ignored */ } }
export function resetBerth() {
  const o = originals.get(S.sc.id); if (!o) return;
  letGoAll();
  S.sc.fenders.splice(0, S.sc.fenders.length, ...copyF(o.fenders)); S.sc.bollards.splice(0, S.sc.bollards.length, ...copyB(o.bollards));
  try { localStorage.removeItem(KEY(S.sc.id)); } catch { /* ignored */ }
}
export const isEdited = () => { try { return localStorage.getItem(KEY(S.sc.id)) !== null; } catch { return false; } };

/** Nearest point on any quay, pier or bank edge: [n, e, distance, outward normal n, e]. */
function nearestEdge(n: number, e: number) {
  let best = { n: 0, e: 0, d: Infinity, nn: 0, ne: 0 };
  for (const o of S.sc.obstacles) {
    const p = o.poly;
    // signed area: which side of an edge is outside
    let A = 0; for (let i = 0, j = p.length - 1; i < p.length; j = i++) A += p[j][1] * p[i][0] - p[i][1] * p[j][0];
    for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
      const [an, ae] = p[j], [bn, be] = p[i], dn = bn - an, de = be - ae, l2 = dn * dn + de * de || 1;
      const t = Math.max(0, Math.min(1, ((n - an) * dn + (e - ae) * de) / l2));
      const qn = an + t * dn, qe = ae + t * de, d = Math.hypot(n - qn, e - qe);
      if (d < best.d) {
        const L = Math.sqrt(l2), s = A > 0 ? -1 : 1;           // outward normal of this edge
        best = { n: qn, e: qe, d, nn: s * de / L, ne: -s * dn / L };
      }
    }
  }
  return best;
}
/** Release any mooring line made fast to bollard i (and re-point the ones after it). */
function dropBollard(i: number) {
  for (const l of S.rt.lines) {
    if (l.bollard === i) { l.state = 'stowed'; l.bollard = -1; l.T = 0; }
    else if (l.bollard > i) l.bollard--;
  }
}
function letGoAll() { for (const l of S.rt.lines) if (l.bollard >= 0) { l.state = 'stowed'; l.bollard = -1; l.T = 0; } }

/** A tap on the chart at (n, e) in edit mode. Returns what happened, for a toast. */
export function editAt(mode: EditMode, n: number, e: number): string {
  const sc = S.sc;
  if (mode === 'remove') {
    let bi = -1, bd = 12, fi = -1, fd = 12;
    sc.bollards.forEach(([bn, be], i) => { const d = Math.hypot(bn - n, be - e); if (d < bd) { bd = d; bi = i; } });
    sc.fenders.forEach((f, i) => { const d = Math.hypot(f.n - n, f.e - e); if (d < fd) { fd = d; fi = i; } });
    if (bi < 0 && fi < 0) return 'Nothing to remove there: tap on a bollard or a fender.';
    if (bi >= 0 && (fi < 0 || bd <= fd)) { dropBollard(bi); sc.bollards.splice(bi, 1); save(); return 'Bollard removed.'; }
    sc.fenders.splice(fi, 1); save(); return 'Fender removed.';
  }
  const q = nearestEdge(n, e);
  if (q.d > 25) return 'Too far from a quay: tap close to its edge.';
  if (mode === 'bollard') {
    // on the quay, 1.5 m in from the edge
    sc.bollards.push([q.n - q.nn * 1.5, q.e - q.ne * 1.5]); save();
    return 'Bollard added.';
  }
  // a fender like the berth's own (or a 1 m cone, SCN 1000 class), on the face, facing the water
  const like = sc.fenders.reduce<Fender | null>((a, f) => (!a || Math.hypot(f.n - n, f.e - e) < Math.hypot(a.n - n, a.e - e) ? f : a), null);
  const base = like ?? { width: 3.2, height: 1.0, Rr: 900e3, dRated: 0.72, mu: 0.2 } as Fender;
  const f: Fender = { n: q.n + q.nn * base.height, e: q.e + q.ne * base.height, nn: q.nn, ne: q.ne, width: base.width, height: base.height, Rr: base.Rr, Er: 0, dRated: base.dRated, mu: base.mu };
  f.Er = ratedEnergy(f);
  sc.fenders.push(f); save();
  return 'Fender added.';
}
