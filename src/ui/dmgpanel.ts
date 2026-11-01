// Damage control panel: a plan of the hull in its five sections (sides and bottom coloured by damage,
// compartments filled by flooding, propulsion units and bow thruster by what thrust they have left),
// then draught, trim, list, stability, water in and the pumps, and the damage log.
import { S } from './state';
import * as D from './draw';
import { DEG, SHIP } from '../physics/ship';
import { HULL } from '../physics/contact';
import { SECTIONS } from '../physics/damage';

const amber = '#e8a33a', red = '#ff5a3d', water = 'rgba(60, 170, 230, 0.55)';

export function drawDamagePlan(c: HTMLCanvasElement) {
  const d = S.rt.damage, w = c.clientWidth, h = c.clientHeight; if (w < 60) return;
  const dpr = Math.min(2, devicePixelRatio || 1);
  if (c.width !== Math.round(w * dpr)) { c.width = Math.round(w * dpr); c.height = Math.round(h * dpr); }
  const g = c.getContext("2d")!, K = D.K, B = SHIP.B;
  g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, w, h);
  // body x (bow right) → canvas x; body y (stbd down) → canvas y
  const xs = Math.max(...HULL.map(p => p[0])), xa = Math.min(...HULL.map(p => p[0]));
  const k = Math.min((w - 24) / (xs - xa), (h - 22) / (B * 1.25)), X = (x: number) => 12 + (x - xa) * k, Y = (y: number) => h / 2 - 2 + y * k;
  const hull = () => { g.beginPath(); HULL.forEach(([x, y], i) => (i ? g.lineTo(X(x), Y(y)) : g.moveTo(X(x), Y(y)))); g.closePath(); };
  hull(); g.fillStyle = K.face; g.fill();
  // flooding: each compartment filled from its stern bulkhead up to how full it is
  g.save(); hull(); g.clip();
  for (let s = 0; s < 5; s++) {
    const cmp = d.comp[s]; if (cmp.W <= 0) continue;
    const x0 = cmp.x - cmp.len / 2, f = cmp.W / cmp.V;
    g.fillStyle = water; g.fillRect(X(x0), Y(-B / 2) + (1 - f) * B * k, cmp.len * k, f * B * k);
  }
  g.restore();
  // sections, and their sides and bottom by damage
  for (let s = 0; s < 5; s++) {
    const cmp = d.comp[s], x0 = cmp.x - cmp.len / 2, x1 = cmp.x + cmp.len / 2;
    if (s > 0) { g.strokeStyle = 'rgba(255,255,255,0.25)'; g.setLineDash([3, 3]); g.beginPath(); g.moveTo(X(x1), Y(-B / 2)); g.lineTo(X(x1), Y(B / 2)); g.stroke(); g.setLineDash([]); }
    for (const z of d.zones) {
      if (z.section !== s || !z.dent) continue;
      g.strokeStyle = z.hole > 0 ? red : amber; g.lineWidth = z.hole > 0 ? 5 : 3; g.lineCap = 'round';
      const yy = z.side === 0 ? 0 : z.side * B * 0.46;
      if (z.side === 0) g.setLineDash([5, 4]);
      g.beginPath(); g.moveTo(X(x0 + 2), Y(yy)); g.lineTo(X(x1 - 2), Y(yy)); g.stroke(); g.setLineDash([]);
    }
    g.font = `600 9px ${K.fontLabel}`; g.fillStyle = K.muted; g.textAlign = 'center'; g.textBaseline = 'top';
    g.fillText(SECTIONS[s].slice(0, 3), X(cmp.x), h - 11);
  }
  hull(); g.strokeStyle = K.ink; g.lineWidth = 1.4; g.stroke();
  // propulsion units and bow thruster by health
  const col = (hh: number) => (hh >= 1 ? K.ok : hh > 0.6 ? amber : red);
  SHIP.pods.forEach((p, i) => { g.fillStyle = col(d.health[i]); g.beginPath(); g.arc(X(p.x), Y(p.y), 4.5, 0, Math.PI * 2); g.fill(); });
  if (SHIP.bowThruster.Tmax > 0) { g.fillStyle = col(d.btHealth); g.fillRect(X(SHIP.bowThruster.x) - 2, Y(-B * 0.3), 4, B * 0.6 * k); }
}

let statHtml = '', logHtml = '';
export function renderDamage(stat: HTMLElement, log: HTMLElement) {
  const d = S.rt.damage, s = SHIP, f = (x: number) => d.draughtAt(x);
  const tF = s.T + f(s.L / 2), tA = s.T + f(-s.L / 2), m3min = (q: number) => (q * 60).toFixed(q * 60 < 10 ? 1 : 0);
  const state = d.lost ? `LOST · ${d.lost.toUpperCase()}` : d.inflow > d.pumping + 1e-3 ? 'FLOODING' : d.water > 1 ? 'FLOODED · STABLE' : d.any ? 'DAMAGED · WATERTIGHT' : 'INTACT';
  const units = s.pods.map((p, i) => `${p.label} ${Math.round(d.health[i] * 100)} %`).join(' · ') + (s.bowThruster.Tmax > 0 ? ` · BOW TH ${Math.round(d.btHealth * 100)} %` : '');
  const html = `<div class="k">STATE</div><div class="v${d.lost || d.inflow > d.pumping ? ' warn' : ''}">${state}</div>
    <div class="k">DRAUGHT</div><div class="v">fwd ${tF.toFixed(2)} · aft ${tA.toFixed(2)} m</div>
    <div class="k">TRIM · LIST</div><div class="v${Math.abs(d.list) > 5 * DEG ? ' warn' : ''}">${(d.trim / DEG).toFixed(1)}° ${d.trim >= 0 ? 'by head' : 'by stern'} · ${(Math.abs(d.list) / DEG).toFixed(1)}° ${d.list >= 0 ? 'stbd' : 'port'}</div>
    <div class="k">GM</div><div class="v${d.GMeff < 0.3 ? ' warn' : ''}">${d.GMeff.toFixed(2)} m (intact ${d.GM0.toFixed(2)})</div>
    <div class="k">WATER IN</div><div class="v">${Math.round(d.water * 1.025)} t · ${m3min(d.inflow)} m³/min in · pumps ${m3min(d.pumping)} m³/min</div>
    <div class="k">PROPULSION</div><div class="v">${units}</div>`;
  if (html !== statHtml) { statHtml = html; stat.innerHTML = html; }
  const lh = d.events.length ? d.events.map(e => `<div class="${e.level}"><span>${fmtT(e.t)}</span>${e.text}</div>`).join('') : '<div>No damage.</div>';
  if (lh !== logHtml) { logHtml = lh; log.innerHTML = lh; }
}
const fmtT = (t: number) => `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
