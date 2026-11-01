// AIS viewer: a small console card listing the traffic as own ship's AIS display would, nearest first,
// with range and bearing, CPA and TCPA, speed and course, and the navigational status. Targets that will
// pass too close too soon turn red, here and on the chart. Tap a target to select it and see its details.
import { S } from './state';
import { DEG, KN, SHIP } from '../physics/ship';
import { Traffic } from '../physics/traffic';
import { TrafficAI, cpa, groundVel } from '../physics/aitraffic';

const NM = 1852;
/** Closest approach that counts as dangerous: 0.2 nm in open water, never less than the two ships' half lengths plus 100 m. */
const cpaLimit = (t: Traffic) => Math.max(0.2 * NM, (SHIP.L + t.spec.L) / 2 + 100);
const p3 = (rad: number) => String(Math.round(((rad / DEG) % 360 + 360) % 360)).padStart(3, '0');

/** Range, bearing, CPA and TCPA of every target from own ship's sensed position and ground velocity. */
export function computeAis() {
  const rt = S.rt, est = rt.sensors.out.est, me = { n: est.n, e: est.e, ...groundVel({ psi: est.psi, u: est.u, v: est.v }) };
  for (const t of rt.traffic) {
    const g = groundVel(t.st, t instanceof TrafficAI ? rt.env.current(t.st.n, t.st.e) : [0, 0]);
    const c = cpa(me, { n: t.st.n, e: t.st.e, ...g });
    const a = t.ais;
    a.range = c.range; a.brg = Math.atan2(t.st.e - est.e, t.st.n - est.n);
    a.cpa = c.cpa; a.tcpa = c.tcpa; a.sog = Math.hypot(g.vn, g.ve); a.cog = Math.atan2(g.ve, g.vn);
    a.danger = c.tcpa > 0 && c.tcpa < 600 && c.cpa < cpaLimit(t);
  }
}

const nameOf = (t: Traffic) => (t instanceof TrafficAI ? t.name : t.setup.label);
const statusOf = (t: Traffic) => (t instanceof TrafficAI ? t.status : 'Under way using engine');
const short: Record<string, string> = { 'Under way using engine': 'UNDER WAY', 'At anchor': 'AT ANCHOR', 'Restricted manoeuvrability': 'RESTR MANOEUVR', Stopped: 'STOPPED' };

const rows = new Map<Traffic, { el: HTMLButtonElement; html: string }>();
/** Redraw the list. Each target keeps its own row element (only its text changes), so a tap is never lost
 *  to a row being rebuilt under the finger. */
export function renderAis(box: HTMLElement, count: HTMLElement) {
  const list = [...S.rt.traffic].sort((a, b) => a.ais.range - b.ais.range);
  const danger = list.filter(t => t.ais.danger).length;
  count.textContent = `${list.length} target${list.length === 1 ? '' : 's'}${danger ? ` · ${danger} close` : ''}`;
  count.classList.toggle('warn', danger > 0);
  for (const [t, r] of rows) if (!list.includes(t)) { r.el.remove(); rows.delete(t); }
  box.querySelector('.none')?.remove();
  if (!list.length) { box.insertAdjacentHTML('beforeend', '<span class="none">No traffic</span>'); return; }
  list.forEach((t, k) => {
    const a = t.ais, sel = S.traffic.sel === t, st = statusOf(t);
    const cpaTxt = a.tcpa > 0 && a.tcpa < 3600 ? `CPA ${(a.cpa / NM).toFixed(2)} nm · ${(a.tcpa / 60).toFixed(1)} min` : 'opening';
    let more = '';
    if (sel) {
      const ai = t instanceof TrafficAI ? t : null;
      more = `<span class="det">MMSI ${ai?.mmsi ?? '—'} · ${ai?.kind ?? 'Vessel'} · ${t.spec.LOA.toFixed(0)} × ${t.spec.B.toFixed(0)} m · draught ${t.spec.T.toFixed(1)} m</span>`
        + `<span class="det">HDG ${p3(t.st.psi)}° · ${st}${ai?.dest ? ` · bound ${ai.dest}` : ''}</span>`;
    }
    const html = `<span class="l1"><b>${nameOf(t)}</b><span class="rb">${(a.range / NM).toFixed(2)} nm ${p3(a.brg)}°</span></span>`
      + `<span class="l2">${st === 'Under way using engine' ? `${(a.sog / KN).toFixed(1)} kn ${p3(a.cog)}°` : short[st]} · ${cpaTxt}</span>${more}`;
    let r = rows.get(t);
    if (!r) { const el = document.createElement('button'); el.className = 'ais-row'; r = { el, html: '' }; rows.set(t, r); }
    r.el.dataset.i = String(S.rt.traffic.indexOf(t));
    r.el.classList.toggle('danger', a.danger); r.el.classList.toggle('sel', sel);
    if (r.html !== html) { r.html = html; r.el.innerHTML = html; }
    if (box.children[k] !== r.el) box.insertBefore(r.el, box.children[k] ?? null);   // nearest first
  });
}
