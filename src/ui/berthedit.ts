// Berth editor: put your own fenders and bollards on any quay. Tap near a berth face to add a bollard on
// it (or a fender on its face, facing the water), or tap one to remove it. What you change is kept per
// scenario in this browser as changes to the scenario's own layout (so a scenario that gains equipment
// later keeps it, with your changes on top), and RESET puts the scenario's own back.
import { S } from './state';
import type { Fender, Pt } from '../physics/contact';
import { RULES, bollardSWL, displacement, faceCoords, fenderClass, fenderOn, nearestBerth, ratedEnergy } from '../physics/berths';
import { SHIPS } from '../physics/ship';
import type { BollardInfo } from '../physics/berths';
import type { Scenario } from '../scenarios';

export type EditMode = 'bollard' | 'fender' | 'remove';
const KEY1 = (id: string) => `azb-berth-${id}`;       // v1: the whole layout, from before every berth was fitted out
const KEY2 = (id: string) => `azb-berth2-${id}`;      // v2: changes to the scenario's own layout
/** This device's changes: fenders and bollards added, and where the scenario's own ones were taken away. */
interface Diff { v: 2; addF: Fender[]; addB: Pt[]; delF: Pt[]; delB: Pt[] }
const originals = new Map<string, { fenders: Fender[]; bollards: Pt[]; info: BollardInfo[] }>();
const copyF = (f: Fender[]) => f.map(x => ({ ...x }));
const copyB = (b: Pt[]) => b.map(p => [p[0], p[1]] as Pt);
const near = (a: Pt, n: number, e: number, tol = 0.05) => Math.abs(a[0] - n) < tol && Math.abs(a[1] - e) < tol;
const empty = (): Diff => ({ v: 2, addF: [], addB: [], delF: [], delB: [] });

function read(sc: Scenario): Diff | null {
  try {
    const v = JSON.parse(localStorage.getItem(KEY2(sc.id)) ?? 'null');
    if (v && v.v === 2 && Array.isArray(v.addF) && Array.isArray(v.addB) && Array.isArray(v.delF) && Array.isArray(v.delB)) return v as Diff;
  } catch { /* storage blocked or garbled: the scenario's own layout */ }
  return null;
}
/** A layout saved by an earlier version (the whole of it): turn it into changes to the scenario's own gear. */
function migrate(sc: Scenario, o: { fenders: Fender[]; bollards: Pt[] }): Diff | null {
  let v: { fenders?: Fender[]; bollards?: Pt[] } | null = null;
  try { v = JSON.parse(localStorage.getItem(KEY1(sc.id)) ?? 'null'); } catch { return null; }
  if (!v || !Array.isArray(v.fenders) || !Array.isArray(v.bollards)) return null;
  const own = sc.ownGear ?? { fenders: o.fenders.length, bollards: o.bollards.length };
  const ownF = o.fenders.slice(0, own.fenders), ownB = o.bollards.slice(0, own.bollards);
  const d = empty();
  for (const f of ownF) if (!v.fenders.some(g => near([g.n, g.e], f.n, f.e))) d.delF.push([f.n, f.e]);
  for (const g of v.fenders) if (!ownF.some(f => near([f.n, f.e], g.n, g.e))) d.addF.push(g);
  for (const p of ownB) if (!v.bollards.some(q => near(q, p[0], p[1]))) d.delB.push(p);
  for (const q of v.bollards) if (!ownB.some(p => near(p, q[0], q[1]))) d.addB.push(q);
  write(sc, d);
  try { localStorage.removeItem(KEY1(sc.id)); } catch { /* ignored */ }
  return d;
}
function write(sc: Scenario, d: Diff) {
  try {
    if (!d.addF.length && !d.addB.length && !d.delF.length && !d.delB.length) localStorage.removeItem(KEY2(sc.id));
    else localStorage.setItem(KEY2(sc.id), JSON.stringify(d));
  } catch { /* ignored */ }
}
let diff: Diff = empty();

const infoFor = (sc: Scenario, n: number, e: number): BollardInfo => {
  const nb = sc.berths?.length ? nearestBerth(sc.berths, n, e, 12) : null, top = (nb?.berth.top ?? sc.landHeight ?? 2) + 0.5;
  return { berth: nb?.berth.id ?? '', z: top, kind: 'bollard', swl: nb ? bollardSWL(displacement(SHIPS[nb.berth.designShip])) : 50 };
};

/** Put the scenario's own layout back, then this browser's changes on it. */
export function loadBerth() {
  const sc = S.sc;
  if (!originals.has(sc.id)) originals.set(sc.id, { fenders: copyF(sc.fenders), bollards: copyB(sc.bollards), info: (sc.bollardInfo ?? []).map(x => ({ ...x })) });
  const o = originals.get(sc.id)!;
  sc.fenders.splice(0, sc.fenders.length, ...copyF(o.fenders)); sc.bollards.splice(0, sc.bollards.length, ...copyB(o.bollards));
  sc.bollardInfo = o.info.map(x => ({ ...x }));
  diff = read(sc) ?? migrate(sc, o) ?? empty();
  for (const [n, e] of diff.delF) { const i = sc.fenders.findIndex(f => near([f.n, f.e], n, e)); if (i >= 0) sc.fenders.splice(i, 1); }
  for (const [n, e] of diff.delB) { const i = sc.bollards.findIndex(p => near(p, n, e)); if (i >= 0) { sc.bollards.splice(i, 1); sc.bollardInfo.splice(i, 1); } }
  for (const f of diff.addF) sc.fenders.push({ ...f });
  for (const p of diff.addB) { sc.bollards.push([p[0], p[1]]); sc.bollardInfo.push(infoFor(sc, p[0], p[1])); }
}
export function resetBerth() {
  const o = originals.get(S.sc.id); if (!o) return;
  letGoAll();
  S.sc.fenders.splice(0, S.sc.fenders.length, ...copyF(o.fenders)); S.sc.bollards.splice(0, S.sc.bollards.length, ...copyB(o.bollards));
  S.sc.bollardInfo = o.info.map(x => ({ ...x }));
  diff = empty();
  try { localStorage.removeItem(KEY2(S.sc.id)); localStorage.removeItem(KEY1(S.sc.id)); } catch { /* ignored */ }
}
export const isEdited = () => { try { return localStorage.getItem(KEY2(S.sc.id)) !== null || localStorage.getItem(KEY1(S.sc.id)) !== null; } catch { return false; } };

/** Nearest point on a berth face (else on a quay or pier edge with water off it): point, distance, outward normal. */
function nearestEdge(n: number, e: number) {
  const sc = S.sc, nb = sc.berths?.length ? nearestBerth(sc.berths, n, e, 25) : null;
  if (nb) {
    const b = nb.berth;
    return { n: b.a[0] + b.dir[0] * nb.s, e: b.a[1] + b.dir[1] * nb.s, d: nb.d, nn: b.nrm[0], ne: b.nrm[1], berth: b };
  }
  let best = { n: 0, e: 0, d: Infinity, nn: 0, ne: 0, berth: undefined as (typeof sc.berths & object)[number] | undefined };
  for (const o of sc.obstacles) {
    if (o.kind === 'bank' || o.kind === 'ship') continue;
    const p = o.poly;
    // signed area: which side of an edge is outside
    let A = 0; for (let i = 0, j = p.length - 1; i < p.length; j = i++) A += p[j][1] * p[i][0] - p[i][1] * p[j][0];
    for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
      const [an, ae] = p[j], [bn, be] = p[i], dn = bn - an, de = be - ae, l2 = dn * dn + de * de || 1;
      const t = Math.max(0, Math.min(1, ((n - an) * dn + (e - ae) * de) / l2));
      const qn = an + t * dn, qe = ae + t * de, d = Math.hypot(n - qn, e - qe);
      if (d < best.d) {
        const L = Math.sqrt(l2), s = A > 0 ? -1 : 1;           // outward normal of this edge
        best = { n: qn, e: qe, d, nn: s * de / L, ne: -s * dn / L, berth: undefined };
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
    if (bi >= 0 && (fi < 0 || bd <= fd)) {
      const p = sc.bollards[bi], k = diff.addB.findIndex(q => near(q, p[0], p[1]));
      if (k >= 0) diff.addB.splice(k, 1); else diff.delB.push([p[0], p[1]]);
      dropBollard(bi); sc.bollards.splice(bi, 1); sc.bollardInfo?.splice(bi, 1); write(sc, diff);
      return 'Bollard removed.';
    }
    const f = sc.fenders[fi], k = diff.addF.findIndex(g => near([g.n, g.e], f.n, f.e));
    if (k >= 0) diff.addF.splice(k, 1); else diff.delF.push([f.n, f.e]);
    sc.fenders.splice(fi, 1); write(sc, diff);
    return 'Fender removed.';
  }
  const q = nearestEdge(n, e);
  if (q.d > 25) return 'Too far from a quay: tap close to its edge.';
  const b = q.berth;
  if (mode === 'bollard') {
    // on the quay, set back from the edge as the berth's own are
    const set = b ? RULES[b.kind].set : 1.5, p: Pt = [q.n - q.nn * set, q.e - q.ne * set];
    sc.bollards.push(p); sc.bollardInfo?.push(infoFor(sc, p[0], p[1])); diff.addB.push(p); write(sc, diff);
    return 'Bollard added.';
  }
  // a fender like the berth's own nearby (else one sized for its design ship), on the face, facing the water
  const like = sc.fenders.reduce<Fender | null>((a, f) => ((!b || fenderOn(b, f)) && (!a || Math.hypot(f.n - n, f.e - e) < Math.hypot(a.n - n, a.e - e)) ? f : a), null);
  const base = like && Math.hypot(like.n - n, like.e - e) < 80 ? like
    : b ? { ...fenderClass(b.E.design, RULES[b.kind].hMin) } as Fender : { width: 3.2, height: 1.0, Rr: 900e3, dRated: 0.72, mu: 0.2 } as Fender;
  const off = b && like === base ? faceCoords(b, like.n, like.e)[1] : base.height;
  const f: Fender = { n: q.n + q.nn * off, e: q.e + q.ne * off, nn: q.nn, ne: q.ne, width: base.width, height: base.height, Rr: base.Rr, Er: 0, dRated: base.dRated, mu: base.mu };
  f.Er = ratedEnergy(f);
  sc.fenders.push(f); diff.addF.push({ ...f }); write(sc, diff);
  return 'Fender added.';
}
