// The lock panel (LOCK): call the lock master on VHF, and see what the lock is doing: its phase, the CEVNI
// lights at each end, the levels outside, in the chamber and inside, how long the levelling has to go, the
// surge on the ship in kN and per mil of her weight (PIANC's 1 ‰), the gates and what the lock master said.
import { S } from './state';
import { SHIP } from '../physics/ship';
import { perMil, type Phase, type Signal } from '../physics/lock';

const $ = (id: string) => document.getElementById(id)!;
const PHASE: Record<Phase, string> = {
  idle: 'Waiting for a call', preparing: 'Turning the chamber round', opening: 'Opening the gate', entering: 'Come in',
  mooring: 'Make fast', closing: 'Closing the gate', levelling: 'Levelling', releasing: 'Opening the far gate', leaving: 'Proceed', done: 'Lockage done',
};
const LIGHT: Record<Signal, string> = { red: 'RED', redgreen: 'RED + GREEN', green: 'GREEN' };
const lamp = (s: Signal) => `<span class="lamps" aria-label="${LIGHT[s]}"><i class="lamp r${s !== 'green' ? ' on' : ''}"></i><i class="lamp g${s !== 'red' ? ' on' : ''}"></i></span>`;

/** Show the LOCK button where the scenario has a lock. */
export function initLockPanel() {
  const lock = S.water?.lock;
  $('b-lock').hidden = !lock;
  if (!lock) { $('p-lock').hidden = true; return; }
  $('lock-head').textContent = `${lock.def.name.toUpperCase()} · ${lock.def.vhf}`;
  ($('lock-call') as HTMLButtonElement).onclick = () => { S.rt && lock.call(SHIP, S.rt.state); updateLockPanel(true); };
}
let logN = -1;
/** Refresh the panel (cheap when closed). */
export function updateLockPanel(force = false) {
  const w = S.water, lock = w?.lock; if (!lock || ($('p-lock').hidden && !force)) return;
  const sg = lock.signals(), outer = w!.level(lock.def.outer), inner = w!.level(lock.def.inner);
  const lo = Math.min(outer, inner, lock.eta) - 0.2, hi = Math.max(outer, inner, lock.eta) + 0.2, y = (z: number) => `${(100 * (hi - z) / (hi - lo)).toFixed(1)}%`;
  const levelling = lock.phase === 'levelling' || lock.phase === 'preparing';
  const F = lock.force.F, pm = perMil(F, SHIP);
  $('lock-state').innerHTML = `
    <div class="lk-row"><span class="tag">SEA END</span>${lamp(sg.a)}<span class="tag">CANAL END</span>${lamp(sg.b)}</div>
    <div class="lk-phase">${PHASE[lock.phase]}${levelling && lock.Q ? ` · ${Math.max(1, Math.round(lock.levelTime() / 60 - lock.valve * lock.def.valveTime / 120))} min to go` : ''}</div>
    <div class="lk-lv" aria-label="Levels: sea ${outer.toFixed(2)} m, chamber ${lock.eta.toFixed(2)} m, canal ${inner.toFixed(2)} m">
      <div class="lk-col"><div class="lk-w" style="top:${y(outer)}"></div><span>SEA ${outer.toFixed(2)}</span></div>
      <div class="lk-col ch"><div class="lk-w" style="top:${y(lock.eta)}"></div><span>CHAMBER ${lock.eta.toFixed(2)}</span></div>
      <div class="lk-col"><div class="lk-w" style="top:${y(inner)}"></div><span>CANAL ${inner.toFixed(2)}</span></div>
    </div>
    <div class="lk-stat">Gates: sea ${gate(lock.gates.a.pos, lock.gates.a.blocked)} · canal ${gate(lock.gates.b.pos, lock.gates.b.blocked)} · flow ${Math.abs(lock.Q).toFixed(0)} m³/s</div>
    <div class="lk-stat${pm > 1 ? ' hi' : ''}">Surge on the ship ${(Math.abs(F) / 1e3).toFixed(0)} kN · ${pm.toFixed(2)} ‰ of her weight (PIANC ≤ 1 ‰)</div>`;
  ($('lock-call') as HTMLButtonElement).disabled = lock.phase !== 'idle' && lock.phase !== 'done';
  if (lock.said !== logN || force) {
    logN = lock.said;
    $('lock-log').innerHTML = lock.log.slice(-6).reverse().map(m => `<div class="lk-msg${m.from === SHIP.name ? ' me' : ''}"><span class="t">${fmt(m.t)}</span> ${m.text}</div>`).join('');
  }
}
const gate = (p: number, blocked: boolean) => blocked ? 'STOPPED' : p >= 1 ? 'open' : p <= 0 ? 'shut' : `${Math.round(p * 100)} %`;
const fmt = (t: number) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
