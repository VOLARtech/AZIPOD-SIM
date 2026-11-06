// Berth picker (menu → Berth): make for any berth of the scenario, either side to, and see what it is fitted
// with. The pick holds for the scenario until another is chosen; RESET keeps it.
import { S } from './state';
import { SHIP, SHIPS } from '../physics/ship';
import { KIND_LABEL, berthFits, bollardOn, bollardSWL, displacement, fenderOn, nearestBerth, berthPose, type Berth } from '../physics/berths';
import { refBerth, type Scenario } from '../scenarios';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

/** The berth to make for: the one picked in the menu, else the scenario's own (named after the face it is on). */
export function targetFor(sc: Scenario): typeof S.berth.target {
  const pk = S.berth.pick?.sc === sc.id ? sc.berths?.find(b => b.id === S.berth.pick!.id) : undefined;
  if (pk) return { ...berthPose(pk, S.berth.pick!.side, SHIP), name: pk.name, id: pk.id, side: S.berth.pick!.side };
  // a scenario's berth named on a real chart: posed for the ship in use
  const ref = refBerth(sc, SHIP);
  if (ref) return { ...berthPose(ref, sc.berthRef!.side, SHIP, sc.berthRef!.along), name: ref.name, id: ref.id, side: sc.berthRef!.side };
  if (!sc.berth) return null;
  const nb = sc.berths?.length ? nearestBerth(sc.berths, sc.berth.n, sc.berth.e, 90) : null;
  return { ...sc.berth, name: nb?.berth.name ?? 'Berth', id: nb?.berth.id, side: sc.mooringSide };
}

/** What a berth is fitted with, in a line. */
export function gearText(sc: Scenario, b: Berth) {
  const F = sc.fenders.filter(f => fenderOn(b, f)), B = sc.bollards.filter(p => bollardOn(b, p));
  const f = F[0], ds = SHIPS[b.designShip], swl = ds ? bollardSWL(displacement(ds)) : undefined;
  return `${KIND_LABEL[b.kind]} berth, ${b.len.toFixed(0)} m, ${b.depth.toFixed(1)} m alongside · ${F.length} fenders${f ? ` (${f.height.toFixed(2)} m cones, ${(f.Er / 1e3).toFixed(0)} kJ each)` : ''} · ${B.length} ${b.kind === 'dolphins' ? 'hooks and bollards' : 'bollards'}${swl ? ` (${swl} t)` : ''} · sized for ${ds?.name ?? b.designShip}`;
}

export interface PickerHooks {
  /** A berth (or the scenario's own, null) and side were chosen. */
  pick(id: string | null, side: -1 | 1): void;
  /** Start again lying off the target berth, stopped. */
  startOff(): void;
}
let hooks: PickerHooks | null = null;
export function initBerthPicker(h: PickerHooks) {
  hooks = h;
  const sel = $<HTMLSelectElement>('b-berth');
  sel.onchange = () => { const id = sel.value || null; hooks!.pick(id, side()); renderBerthPicker(); };
  $('seg-side').querySelectorAll<HTMLButtonElement>('button').forEach(b => (b.onclick = () => { hooks!.pick(sel.value || null, +b.dataset.v! as -1 | 1); renderBerthPicker(); }));
  $('b-startoff').onclick = () => hooks!.startOff();
}
const side = (): -1 | 1 => S.berth.target?.side ?? S.berth.pick?.side ?? S.sc.mooringSide ?? -1;

/** Fill the berth list for this scenario and ship. */
export function renderBerthPicker() {
  const sc = S.sc, sel = $<HTMLSelectElement>('b-berth'), bs = sc.berths ?? [];
  const row = $('berth-pick');
  row.hidden = !bs.length;
  if (!bs.length) return;
  const cur = S.berth.pick?.sc === sc.id ? S.berth.pick.id : '';
  const own = sc.berth ? `<option value="">The scenario's berth${S.berth.target && !cur ? ` · ${S.berth.target.name}` : ''}</option>` : '<option value="">None</option>';
  sel.innerHTML = own + bs.map(b => {
    const why = berthFits(b, SHIP, sc.tide ?? 0);
    return `<option value="${b.id}"${why ? ' disabled' : ''}${b.id === cur ? ' selected' : ''}>${b.name} · ${b.len.toFixed(0)} m · ${b.depth.toFixed(1)} m${why ? ` · ${why}` : ''}</option>`;
  }).join('');
  sel.value = cur;
  const sd = side();
  $('seg-side').querySelectorAll<HTMLButtonElement>('button').forEach(b => b.setAttribute('aria-pressed', String(+b.dataset.v! === sd)));
  const tb = S.berth.target?.id ? bs.find(b => b.id === S.berth.target!.id) : undefined;
  $('berth-info').textContent = tb ? gearText(sc, tb) : 'No berth to make for: pick one to have its mark on the chart and the distance to it on the bar.';
  ($('b-startoff') as HTMLButtonElement).disabled = !S.berth.target;
}
