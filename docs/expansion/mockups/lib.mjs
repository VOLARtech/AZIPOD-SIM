// Mockup toolkit: the app's own tokens and fonts, plus SVG widgets for every proposed
// control station. Pure string builders, no dependencies; render.mjs turns pages into PNGs.

const FONT = '../../../../node_modules/@fontsource';

export const PALETTES = {
  night: {
    water: '#06121a', water2: '#0a1c27', grid: '#10283a', land: '#2b2513', landEdge: '#5e512a', shoal: '#0d2a3a',
    ink: '#d4c49a', muted: '#7d7660', panel: 'rgba(6,13,18,0.92)', panelSolid: '#08121a', rule: '#1e3242',
    own: '#d27a2a', hull: '#13232e', port: '#d2475a', stbd: '#36ad66', predict: '#c4489a', warn: '#e0583a', ok: '#36ad66',
    sound: '#5f7380', contour: '#2c4757', info: '#4f9fbf',
  },
  dusk: {
    water: '#16232c', water2: '#1d2f3b', grid: '#243a49', land: '#4a4128', landEdge: '#7b6b3d', shoal: '#20394a',
    ink: '#e2d6b4', muted: '#9a917a', panel: 'rgba(20,30,38,0.94)', panelSolid: '#16222b', rule: '#33495a',
    own: '#e58a34', hull: '#24343f', port: '#e0566a', stbd: '#47bd75', predict: '#d65aad', warn: '#f06a48', ok: '#47bd75',
    sound: '#8494a0', contour: '#3f5a6b', info: '#62b3d4',
  },
  day: {
    water: '#e6eff2', water2: '#d3e3ea', grid: '#c3d4dc', land: '#d8c993', landEdge: '#8f7d45', shoal: '#b9d4e2',
    ink: '#14242d', muted: '#566a74', panel: 'rgba(247,250,251,0.95)', panelSolid: '#f4f8f9', rule: '#c2d0d6',
    own: '#cf6410', hull: '#fbfcfc', predict: '#b5137f', port: '#c4142f', stbd: '#0b8a3e', warn: '#b8290f', ok: '#0b8a3e',
    sound: '#66808c', contour: '#8fa7b3', info: '#1f6f93',
  },
};

export function baseCss(p) {
  return `
@font-face { font-family: "Barlow Condensed"; font-weight: 500; src: url(${FONT}/barlow-condensed/files/barlow-condensed-latin-500-normal.woff2); }
@font-face { font-family: "Barlow Condensed"; font-weight: 600; src: url(${FONT}/barlow-condensed/files/barlow-condensed-latin-600-normal.woff2); }
@font-face { font-family: "Barlow Condensed"; font-weight: 700; src: url(${FONT}/barlow-condensed/files/barlow-condensed-latin-700-normal.woff2); }
@font-face { font-family: "Barlow"; font-weight: 400; src: url(${FONT}/barlow/files/barlow-latin-400-normal.woff2); }
@font-face { font-family: "Barlow"; font-weight: 500; src: url(${FONT}/barlow/files/barlow-latin-500-normal.woff2); }
@font-face { font-family: "IBM Plex Mono"; font-weight: 400; src: url(${FONT}/ibm-plex-mono/files/ibm-plex-mono-latin-400-normal.woff2); }
@font-face { font-family: "IBM Plex Mono"; font-weight: 500; src: url(${FONT}/ibm-plex-mono/files/ibm-plex-mono-latin-500-normal.woff2); }
:root {
  ${Object.entries(p).map(([k, v]) => `--${k}: ${v};`).join(' ')}
  --font-label: "Barlow Condensed", "Arial Narrow", sans-serif;
  --font-body: "Barlow", system-ui, sans-serif;
  --font-num: "IBM Plex Mono", ui-monospace, monospace;
}
* { box-sizing: border-box; margin: 0; padding: 0; }
html, body { width: 100%; height: 100%; overflow: hidden; }
body { background: var(--water); color: var(--ink); font-family: var(--font-body); position: relative; }
svg text { font-family: var(--font-label); }
.lab, .tag { font-family: var(--font-label); font-weight: 600; letter-spacing: 0.08em; font-size: 12px; color: var(--muted); text-transform: uppercase; }
.val { font-family: var(--font-num); font-variant-numeric: tabular-nums; font-weight: 500; }
.unit { font-family: var(--font-label); font-size: 12px; color: var(--muted); }
.mono { font-family: var(--font-num); }
.hud { position: absolute; left: 0; right: 0; top: 0; z-index: 3; background: var(--panel); border-bottom: 1px solid var(--rule); padding: 10px 16px 8px; }
.hud-row { display: flex; align-items: baseline; gap: 6px 30px; flex-wrap: wrap; }
.hud .cell { display: flex; align-items: baseline; gap: 6px; }
.hud .primary .val { font-size: 26px; }
.hud .secondary { margin-top: 2px; }
.hud .secondary .val { font-size: 22px; }
.hud .env { font-family: var(--font-num); font-size: 11.5px; color: var(--muted); margin-top: 6px; gap: 4px 28px; }
.c-port { color: var(--port) !important; } .c-stbd { color: var(--stbd) !important; } .c-own { color: var(--own) !important; }
.c-warn { color: var(--warn) !important; } .c-ok { color: var(--ok) !important; } .c-muted { color: var(--muted) !important; } .c-info { color: var(--info) !important; }
.mb { font-family: var(--font-label); font-weight: 600; letter-spacing: 0.08em; font-size: 12px; min-width: 56px; height: 32px; padding: 0 10px;
  border-radius: 3px; background: var(--panel); border: 1px solid var(--rule); color: var(--muted); display: inline-flex; align-items: center; justify-content: center; }
.mb.on { color: var(--ink); border-color: var(--own); }
.mapbtns { position: absolute; z-index: 3; left: 16px; display: flex; gap: 6px; }
.shipchip { position: absolute; z-index: 3; right: 16px; display: flex; align-items: center; gap: 10px; padding: 6px 12px 6px 8px;
  background: var(--panel); border: 1px solid var(--rule); border-radius: 3px; }
.shipchip .nm { font-family: var(--font-label); font-weight: 700; font-size: 15px; letter-spacing: 0.02em; }
.shipchip .sp { font-family: var(--font-num); font-size: 11px; color: var(--muted); }
.flag { position: absolute; z-index: 3; font-family: var(--font-label); font-weight: 600; letter-spacing: 0.06em; font-size: 13px;
  padding: 4px 10px; border-radius: 3px; background: var(--panelSolid); border: 1px solid var(--rule); }
.flag.heavy { color: var(--warn); border-color: var(--warn); } .flag.good { color: var(--ok); border-color: var(--ok); } .flag.info { color: var(--info); border-color: var(--info); }
.tray { position: absolute; left: 0; right: 0; bottom: 0; z-index: 2; background: var(--panel); border-top: 1px solid var(--rule); padding: 10px 16px 12px;
  display: flex; gap: 10px; align-items: stretch; justify-content: center; }
.pn { border: 1px solid var(--rule); border-radius: 4px; padding: 8px 10px 8px; display: flex; flex-direction: column; align-items: center; gap: 4px; background: color-mix(in srgb, var(--panelSolid) 70%, transparent); }
.pn > .tag { align-self: stretch; display: flex; justify-content: space-between; gap: 10px; }
.pn > .tag b { color: var(--ink); font-weight: 600; }
.rd { font-family: var(--font-num); font-size: 12px; font-variant-numeric: tabular-nums; display: flex; gap: 8px; align-items: baseline; }
.rd .k { font-family: var(--font-label); font-weight: 600; letter-spacing: 0.08em; font-size: 11px; color: var(--muted); }
.cb { font-family: var(--font-label); font-weight: 600; letter-spacing: 0.08em; font-size: 12px; height: 30px; border-radius: 3px; border: 1px solid var(--rule);
  color: var(--muted); display: flex; align-items: center; justify-content: center; padding: 0 10px; }
.cb.on { color: var(--ink); border-color: var(--own); } .cb.warn { color: var(--warn); border-color: var(--warn); }
.row { display: flex; gap: 6px; } .col { display: flex; flex-direction: column; gap: 6px; }
.chip { font-family: var(--font-label); font-weight: 600; letter-spacing: 0.06em; font-size: 11px; padding: 2px 7px; border-radius: 2px; border: 1px solid var(--rule); color: var(--muted); white-space: nowrap; }
.chip.on { color: var(--ink); border-color: var(--own); } .chip.ok { color: var(--ok); border-color: var(--ok); } .chip.info { color: var(--info); border-color: var(--info); } .chip.warn { color: var(--warn); border-color: var(--warn); }
.meter { width: 100%; height: 6px; border-radius: 3px; background: var(--rule); position: relative; overflow: hidden; }
.meter > i { position: absolute; left: 0; top: 0; bottom: 0; background: var(--ink); border-radius: 3px; }
.legend { position: absolute; z-index: 3; font-family: var(--font-num); font-size: 10.5px; color: var(--muted); }
`;
}

// ---------- geometry ----------
export const pt = (cx, cy, r, deg) => [cx + r * Math.sin(deg * Math.PI / 180), cy - r * Math.cos(deg * Math.PI / 180)];
const f = n => (Math.round(n * 10) / 10).toString();
export function arc(cx, cy, r, a0, a1) {
  const [x0, y0] = pt(cx, cy, r, a0), [x1, y1] = pt(cx, cy, r, a1);
  return `M${f(x0)},${f(y0)} A${r},${r} 0 ${Math.abs(a1 - a0) > 180 ? 1 : 0} ${a1 > a0 ? 1 : 0} ${f(x1)},${f(y1)}`;
}
export function rng(seed) { return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const hatchDefs = (id, color, op = 0.55) => `<pattern id="${id}" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="5" height="5" fill="none"/><line x1="0" y1="0" x2="0" y2="5" stroke="${color}" stroke-width="2" opacity="${op}"/></pattern>`;

// ---------- hull shapes (plan view) ----------
/** Ship outline in plan view; x,y screen, hdg deg (0 = up), L,B in px. kind tweaks the waterplane. */
export function hullPath(x, y, hdg, L, B, kind = 'ship') {
  let body;
  const h = L / 2, b = B / 2;
  if (kind === 'tug') body = [[h, 0], [h * 0.75, b * 0.8], [h * 0.35, b], [-h * 0.9, b * 0.95], [-h, b * 0.7], [-h, -b * 0.7], [-h * 0.9, -b * 0.95], [h * 0.35, -b], [h * 0.75, -b * 0.8]];
  else if (kind === 'cat') body = [[h, b * 0.55], [h * 0.6, b], [-h, b], [-h, b * 0.25], [h * 0.4, b * 0.25], [h * 0.4, -b * 0.25], [-h, -b * 0.25], [-h, -b], [h * 0.6, -b], [h, -b * 0.55]];
  else if (kind === 'barge') body = [[h, b * 0.9], [h * 0.97, b], [-h, b], [-h, -b], [h * 0.97, -b], [h, -b * 0.9]];
  else body = [[h, 0], [h - B * 0.55, b * 0.92], [h - B * 1.3, b], [-h + B * 0.25, b], [-h, b * 0.78], [-h, -b * 0.78], [-h + B * 0.25, -b], [h - B * 1.3, -b], [h - B * 0.55, -b * 0.92]];
  const c = Math.cos(hdg * Math.PI / 180), s = Math.sin(hdg * Math.PI / 180);
  // body: x fwd, y stbd → screen: fwd = (s, -c), stbd = (c, s)
  return 'M' + body.map(([bx, by]) => `${f(x + bx * s + by * c)},${f(y - bx * c + by * s)}`).join(' L') + ' Z';
}
/** body-frame point → screen */
export function bodyPt(x, y, hdg, bx, by) {
  const c = Math.cos(hdg * Math.PI / 180), s = Math.sin(hdg * Math.PI / 180);
  return [x + bx * s + by * c, y - bx * c + by * s];
}

// ---------- chart background ----------
export function chart({ w, h, land = [], shoal = [], channel = [], soundings = 60, seed = 3, extra = '', ships = '', over = '', scale = { px: 100, label: '200 m' }, legend = '' }) {
  const r = rng(seed);
  let snd = '';
  for (let i = 0; i < soundings; i++) {
    const x = 20 + r() * (w - 40), y = 20 + r() * (h - 40), d = Math.floor(8 + r() * 24), sub = Math.floor(r() * 10);
    snd += `<text x="${f(x)}" y="${f(y)}" font-family="IBM Plex Mono" font-size="11" fill="var(--sound)">${d}<tspan font-size="8" dy="3">${sub}</tspan></text>`;
  }
  const poly = (pts) => 'M' + pts.map(p => p.join(',')).join(' L') + ' Z';
  return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" style="position:absolute;left:0;top:0">
  <rect width="${w}" height="${h}" fill="var(--water2)"/>
  ${shoal.map(s => `<path d="${poly(s)}" fill="var(--shoal)" stroke="var(--contour)" stroke-width="1"/>`).join('')}
  ${channel.map(c => `<path d="${c}" fill="none" stroke="var(--muted)" stroke-width="1" stroke-dasharray="8 6" opacity="0.6"/>`).join('')}
  ${snd}
  ${land.map(s => `<path d="${poly(s)}" fill="var(--land)" stroke="var(--landEdge)" stroke-width="1.2"/>`).join('')}
  ${extra}
  ${ships}
  ${over}
  <g transform="translate(16,${h - 28})"><line x1="0" y1="10" x2="${scale.px}" y2="10" stroke="var(--ink)" stroke-width="1.5"/><line x1="0" y1="5" x2="0" y2="10" stroke="var(--ink)"/><line x1="${scale.px}" y1="5" x2="${scale.px}" y2="10" stroke="var(--ink)"/>
  <text x="2" y="2" font-family="IBM Plex Mono" font-size="11" fill="var(--ink)">${scale.label}</text></g>
  <text x="16" y="${h - 36}" font-family="IBM Plex Mono" font-size="10.5" fill="var(--muted)">${legend}</text>
</svg>`;
}

/** Own ship with predictor ghosts along a polyline of [x,y,hdg]. */
export function ownShip(x, y, hdg, L, B, { kind = 'ship', track = [], ghosts = [], label = '' } = {}) {
  const tr = track.length ? `<path d="M${track.map(p => p.slice(0, 2).join(',')).join(' L')}" fill="none" stroke="var(--predict)" stroke-width="2"/>` : '';
  const gh = ghosts.map(([gx, gy, gh]) => `<path d="${hullPath(gx, gy, gh, L, B, kind)}" fill="none" stroke="var(--predict)" stroke-width="1.2" stroke-dasharray="3 3"/>`).join('');
  return `${tr}${gh}<path d="${hullPath(x, y, hdg, L, B, kind)}" fill="var(--hull)" stroke="var(--own)" stroke-width="2"/>${label}`;
}

/** Force arrow (teaching overlay). */
export function force(x, y, ang, len, color, text = '', anchor = 'start') {
  const [x1, y1] = pt(x, y, len, ang);
  const [a1, b1] = pt(x1, y1, 9, ang + 150), [a2, b2] = pt(x1, y1, 9, ang - 150);
  const [tx, ty] = pt(x, y, len + 14, ang);
  return `<g><line x1="${f(x)}" y1="${f(y)}" x2="${f(x1)}" y2="${f(y1)}" stroke="${color}" stroke-width="2.5"/><path d="M${f(x1)},${f(y1)} L${f(a1)},${f(b1)} L${f(a2)},${f(b2)} Z" fill="${color}"/>
  ${text ? `<text x="${f(tx)}" y="${f(ty + 4)}" font-size="12" font-weight="600" letter-spacing="0.06em" fill="${color}" text-anchor="${anchor}">${text}</text>` : ''}</g>`;
}

// ---------- widgets ----------
/** Engine order telegraph. order/answer: index into steps (0 = top). */
export function telegraph({ order, answer, steps, h = 250, w = 150, ahead = 5 }) {
  const top = 14, bot = h - 14, x = 34, n = steps.length, dy = (bot - top) / (n - 1);
  const Y = i => top + i * dy;
  let s = `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
  <rect x="${x - 7}" y="${top - 8}" width="14" height="${bot - top + 16}" rx="7" fill="var(--panelSolid)" stroke="var(--rule)"/>
  <rect x="${x - 2}" y="${Y(ahead)}" width="4" height="${bot - Y(ahead)}" fill="var(--rule)"/>`;
  steps.forEach((t, i) => {
    const on = i === order, stop = i === ahead;
    s += `<line x1="${x + 10}" y1="${f(Y(i))}" x2="${x + (stop ? 22 : 16)}" y2="${f(Y(i))}" stroke="${stop ? 'var(--ink)' : 'var(--muted)'}" stroke-width="${stop ? 2 : 1}"/>
    <text x="${x + 28}" y="${f(Y(i) + 4)}" font-size="${on ? 13 : 11.5}" font-weight="${on ? 700 : 600}" letter-spacing="0.06em" fill="${on ? 'var(--ink)' : 'var(--muted)'}">${t}</text>`;
  });
  s += `<text x="${x}" y="${top - 12 < 0 ? 8 : 8}" font-size="9" fill="var(--muted)" text-anchor="middle" letter-spacing="0.1em">AH</text>`;
  // answer-back pointer (engine room / bridge control answered)
  s += `<path d="M${x - 12},${f(Y(answer))} l-9,-6 v12 Z" fill="var(--ink)"/>`;
  // handle = order
  s += `<rect x="${x - 15}" y="${f(Y(order) - 9)}" width="30" height="18" rx="3" fill="var(--panelSolid)" stroke="var(--own)" stroke-width="2.5"/><line x1="${x - 8}" y1="${f(Y(order))}" x2="${x + 8}" y2="${f(Y(order))}" stroke="var(--own)" stroke-width="2"/>`;
  return s + '</svg>';
}

/** Arc gauge with signed range, optional barred band(s) and dead band. */
export function gauge({ v, order, min, max, size = 150, label = 'RPM', unit = 'rpm', barred = [], dead = null, warnAbove = null, fmt = x => Math.round(x), sweep = 120 }) {
  const c = size / 2, R = size / 2 - 12;
  const A = x => -sweep + (x - min) / (max - min) * 2 * sweep;
  const defs = `<defs>${hatchDefs('hb' + size + label, 'var(--warn)', 0.8)}${hatchDefs('hd' + size + label, 'var(--muted)', 0.5)}</defs>`;
  let s = `<svg width="${size}" height="${size * 0.86}" viewBox="0 0 ${size} ${size * 0.86}">${defs}
  <path d="${arc(c, c, R, -sweep, sweep)}" fill="none" stroke="var(--rule)" stroke-width="8"/>`;
  if (dead) s += `<path d="${arc(c, c, R, A(dead[0]), A(dead[1]))}" fill="none" stroke="url(#hd${size}${label})" stroke-width="8"/>`;
  for (const [a, b] of barred) s += `<path d="${arc(c, c, R, A(a), A(b))}" fill="none" stroke="url(#hb${size}${label})" stroke-width="8"/><path d="${arc(c, c, R + 6, A(a), A(b))}" fill="none" stroke="var(--warn)" stroke-width="1.5"/>`;
  if (warnAbove != null) s += `<path d="${arc(c, c, R, A(warnAbove), sweep)}" fill="none" stroke="var(--warn)" stroke-width="8" opacity="0.7"/>`;
  // actual sweep from zero
  const z = Math.max(min, Math.min(max, 0));
  s += `<path d="${arc(c, c, R, Math.min(A(z), A(v)), Math.max(A(z), A(v)))}" fill="none" stroke="var(--ink)" stroke-width="3"/>`;
  for (let i = 0; i <= 10; i++) { const a = -sweep + i * sweep / 5; const [x0, y0] = pt(c, c, R - 7, a), [x1, y1] = pt(c, c, R - (i % 5 ? 11 : 15), a); s += `<line x1="${f(x0)}" y1="${f(y0)}" x2="${f(x1)}" y2="${f(y1)}" stroke="var(--muted)" stroke-width="${i % 5 ? 1 : 1.5}"/>`; }
  const [nx, ny] = pt(c, c, R - 4, A(v));
  s += `<line x1="${c}" y1="${c}" x2="${f(nx)}" y2="${f(ny)}" stroke="var(--ink)" stroke-width="2.5" stroke-linecap="round"/><circle cx="${c}" cy="${c}" r="4" fill="var(--ink)"/>`;
  if (order != null) { const [ox, oy] = pt(c, c, R + 8, A(order)); const [p1x, p1y] = pt(c, c, R + 16, A(order) - 4), [p2x, p2y] = pt(c, c, R + 16, A(order) + 4); s += `<path d="M${f(ox)},${f(oy)} L${f(p1x)},${f(p1y)} L${f(p2x)},${f(p2y)} Z" fill="var(--own)"/>`; }
  s += `<text x="${c}" y="${c + 26}" text-anchor="middle" font-family="IBM Plex Mono" font-size="17" font-weight="500" fill="var(--ink)">${fmt(v)}</text>
  <text x="${c}" y="${c + 40}" text-anchor="middle" font-size="10" font-weight="600" letter-spacing="0.1em" fill="var(--muted)">${label} · ${unit}</text>
  <text x="${f(pt(c, c, R, -sweep)[0])}" y="${f(pt(c, c, R, -sweep)[1] + 16)}" text-anchor="middle" font-size="9" fill="var(--muted)">${min}</text>
  <text x="${f(pt(c, c, R, sweep)[0])}" y="${f(pt(c, c, R, sweep)[1] + 16)}" text-anchor="middle" font-size="9" fill="var(--muted)">${max}</text>`;
  return s + '</svg>';
}

/** Rudder angle indicator / helm order. max = hard-over (35 conventional, 45 flap, 70 Schilling). */
export function rai({ order, actual, max = 35, w = 250, label = 'RUDDER', sub = '' }) {
  const cx = w / 2, R = w / 2 - 22, cy = R + 18, sweep = 75;
  const A = d => d / max * sweep;
  let s = `<svg width="${w}" height="${cy + 30}" viewBox="0 0 ${w} ${cy + 30}">
  <path d="${arc(cx, cy, R, -sweep, 0)}" fill="none" stroke="var(--port)" stroke-width="6" opacity="0.35"/>
  <path d="${arc(cx, cy, R, 0, sweep)}" fill="none" stroke="var(--stbd)" stroke-width="6" opacity="0.35"/>`;
  for (let d = -max; d <= max; d += 5) {
    const a = A(d), major = d % 10 === 0 || Math.abs(d) === max;
    const [x0, y0] = pt(cx, cy, R - 5, a), [x1, y1] = pt(cx, cy, R - (major ? 14 : 9), a);
    s += `<line x1="${f(x0)}" y1="${f(y0)}" x2="${f(x1)}" y2="${f(y1)}" stroke="var(--muted)" stroke-width="${major ? 1.5 : 1}"/>`;
    if (major && d !== 0) { const [tx, ty] = pt(cx, cy, R + 12, a); s += `<text x="${f(tx)}" y="${f(ty + 3)}" text-anchor="middle" font-family="IBM Plex Mono" font-size="9" fill="${d < 0 ? 'var(--port)' : 'var(--stbd)'}">${Math.abs(d)}</text>`; }
  }
  const [nx, ny] = pt(cx, cy, R - 3, A(actual));
  s += `<path d="${arc(cx, cy, R, Math.min(0, A(actual)), Math.max(0, A(actual)))}" fill="none" stroke="${actual < 0 ? 'var(--port)' : 'var(--stbd)'}" stroke-width="6"/>`;
  s += `<line x1="${cx}" y1="${cy}" x2="${f(nx)}" y2="${f(ny)}" stroke="var(--ink)" stroke-width="2.5" stroke-linecap="round"/><circle cx="${cx}" cy="${cy}" r="5" fill="var(--ink)"/>`;
  const [ox, oy] = pt(cx, cy, R + 2, A(order)), [p1x, p1y] = pt(cx, cy, R + 11, A(order) - 4), [p2x, p2y] = pt(cx, cy, R + 11, A(order) + 4);
  s += `<path d="M${f(ox)},${f(oy)} L${f(p1x)},${f(p1y)} L${f(p2x)},${f(p2y)} Z" fill="var(--own)"/>`;
  const side = v => v === 0 ? 'MID' : (v < 0 ? 'P ' : 'S ') + Math.abs(v);
  s += `<text x="${cx}" y="${cy + 24}" text-anchor="middle" font-size="10" font-weight="600" letter-spacing="0.1em" fill="var(--muted)">${label}${sub ? ' · ' + sub : ''}</text>
  <text x="${cx - 14}" y="${cy - 16}" text-anchor="end" font-family="IBM Plex Mono" font-size="15" fill="var(--ink)">${side(actual)}°</text>
  <text x="${cx + 14}" y="${cy - 16}" font-family="IBM Plex Mono" font-size="12" fill="var(--own)">${side(order)}°</text>`;
  return s + '</svg>';
}

/** Vertical lever (CPP pitch, RPM, bucket). v/order in −1..1. */
export function lever({ order, actual, h = 170, w = 64, color = 'var(--ink)', top = 'AH', bottom = 'AS', limit = null, marks = [], labels = [] }) {
  const x = 22, y0 = 14, y1 = h - 14, mid = (y0 + y1) / 2, Y = v => mid - v * (y1 - y0) / 2;
  let s = `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
  <text x="${x}" y="9" text-anchor="middle" font-size="9" letter-spacing="0.1em" fill="var(--muted)">${top}</text>
  <text x="${x}" y="${h - 1}" text-anchor="middle" font-size="9" letter-spacing="0.1em" fill="var(--muted)">${bottom}</text>
  <rect x="${x - 4}" y="${y0}" width="8" height="${y1 - y0}" rx="4" fill="var(--panelSolid)" stroke="var(--rule)"/>
  <rect x="${x - 3}" y="${f(Math.min(mid, Y(actual)))}" width="6" height="${f(Math.abs(Y(actual) - mid))}" rx="3" fill="${color}"/>`;
  for (let i = -10; i <= 10; i += 2) s += `<line x1="${x + 9}" y1="${f(Y(i / 10))}" x2="${x + (i === 0 ? 20 : 14)}" y2="${f(Y(i / 10))}" stroke="${i === 0 ? 'var(--ink)' : 'var(--muted)'}" stroke-width="${i === 0 ? 1.6 : 1}"/>`;
  for (const m of marks) s += `<line x1="${x - 12}" y1="${f(Y(m))}" x2="${x + 12}" y2="${f(Y(m))}" stroke="var(--warn)" stroke-dasharray="3 2" stroke-width="1.5"/>`;
  if (limit != null) s += `<line x1="${x - 12}" y1="${f(Y(limit))}" x2="${x + 12}" y2="${f(Y(limit))}" stroke="var(--warn)" stroke-dasharray="3 2" stroke-width="1.5"/>`;
  for (const [v, t] of labels) s += `<text x="${x + 24}" y="${f(Y(v) + 3)}" font-size="9" letter-spacing="0.06em" fill="var(--muted)">${t}</text>`;
  s += `<rect x="${x - 13}" y="${f(Y(order) - 7)}" width="26" height="14" rx="3" fill="var(--panelSolid)" stroke="var(--own)" stroke-width="2.5"/>`;
  return s + '</svg>';
}

/** Azimuth combi-lever (ASD / Z-drive / azimuth thruster): direction of thrust + magnitude. */
export function azimuth({ order, actual, thrust, thrustOrder, size = 140, color = 'var(--ink)', label = '', pusher = true }) {
  const c = size / 2, R = c - 12;
  let s = `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <circle cx="${c}" cy="${c}" r="${R}" fill="var(--panelSolid)" stroke="var(--rule)" stroke-width="1.5"/>
  <circle cx="${c}" cy="${c}" r="${R * 0.5}" fill="none" stroke="var(--rule)" stroke-dasharray="2 3"/>`;
  for (let a = 0; a < 360; a += 15) { const [x0, y0] = pt(c, c, R, a), [x1, y1] = pt(c, c, R - (a % 90 ? 5 : 10), a); s += `<line x1="${f(x0)}" y1="${f(y0)}" x2="${f(x1)}" y2="${f(y1)}" stroke="var(--muted)" stroke-width="${a % 90 ? 1 : 1.6}"/>`; }
  // actual thrust vector (direction ship is pushed)
  const L = R * 0.92 * Math.max(0.06, thrust);
  const [vx, vy] = pt(c, c, L, actual);
  const [a1, b1] = pt(vx, vy, 8, actual + 150), [a2, b2] = pt(vx, vy, 8, actual - 150);
  s += `<line x1="${c}" y1="${c}" x2="${f(vx)}" y2="${f(vy)}" stroke="${color}" stroke-width="4" stroke-linecap="round"/><path d="M${f(vx)},${f(vy)} L${f(a1)},${f(b1)} L${f(a2)},${f(b2)} Z" fill="${color}"/>`;
  // order handle on the ring + radial order magnitude
  const [hx, hy] = pt(c, c, R, order);
  const [mx, my] = pt(c, c, R * 0.92 * (thrustOrder ?? thrust), order);
  s += `<line x1="${c}" y1="${c}" x2="${f(hx)}" y2="${f(hy)}" stroke="var(--own)" stroke-width="1" stroke-dasharray="2 3"/><circle cx="${f(mx)}" cy="${f(my)}" r="4" fill="none" stroke="var(--own)" stroke-width="2"/>
  <circle cx="${f(hx)}" cy="${f(hy)}" r="8" fill="var(--panelSolid)" stroke="var(--own)" stroke-width="2.5"/>
  <circle cx="${c}" cy="${c}" r="3" fill="var(--muted)"/>`;
  if (label) s += `<text x="${c}" y="${c + R * 0.5 + 14}" text-anchor="middle" font-size="9" letter-spacing="0.1em" fill="var(--muted)">${label}</text>`;
  return s + '</svg>';
}

/** Voith Schneider pitch pad: cross with thrust point (x = transverse, y = longitudinal), each −1..1. */
export function vspPad({ x, y, ox, oy, size = 130, label = '' }) {
  const c = size / 2, R = c - 10;
  let s = `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect x="10" y="10" width="${size - 20}" height="${size - 20}" rx="6" fill="var(--panelSolid)" stroke="var(--rule)" stroke-width="1.5"/>
  <circle cx="${c}" cy="${c}" r="${R}" fill="none" stroke="var(--rule)" stroke-dasharray="2 3"/>
  <line x1="${c}" y1="14" x2="${c}" y2="${size - 14}" stroke="var(--muted)"/><line x1="14" y1="${c}" x2="${size - 14}" y2="${c}" stroke="var(--muted)"/>
  <text x="${c + 4}" y="22" font-size="9" fill="var(--muted)">AH</text><text x="${c + 4}" y="${size - 14}" font-size="9" fill="var(--muted)">AS</text>
  <text x="15" y="${c - 4}" font-size="9" fill="var(--port)">P</text><text x="${size - 22}" y="${c - 4}" font-size="9" fill="var(--stbd)">S</text>`;
  const px = c + x * R, py = c - y * R;
  s += `<line x1="${c}" y1="${c}" x2="${f(px)}" y2="${f(py)}" stroke="var(--ink)" stroke-width="4" stroke-linecap="round"/><circle cx="${f(px)}" cy="${f(py)}" r="4" fill="var(--ink)"/>
  <circle cx="${f(c + ox * R)}" cy="${f(c - oy * R)}" r="8" fill="none" stroke="var(--own)" stroke-width="2.5"/>`;
  if (label) s += `<text x="${c}" y="${size - 1}" text-anchor="middle" font-size="9" letter-spacing="0.1em" fill="var(--muted)">${label}</text>`;
  return s + '</svg>';
}

/** Horizontal port↔stbd bar (tunnel thruster). v −1..1. */
export function tunnel({ v, order, w = 180, label = 'BOW 1', eff = 1 }) {
  const x0 = 10, x1 = w - 10, mid = w / 2, X = q => mid + q * (x1 - x0) / 2;
  return `<svg width="${w}" height="40" viewBox="0 0 ${w} 40">
  <text x="${mid}" y="9" text-anchor="middle" font-size="10" font-weight="600" letter-spacing="0.1em" fill="var(--muted)">${label}${eff < 1 ? ` · EFF ${Math.round(eff * 100)}%` : ''}</text>
  <rect x="${x0}" y="17" width="${x1 - x0}" height="6" rx="3" fill="var(--rule)"/>
  <rect x="${f(Math.min(mid, X(v)))}" y="17" width="${f(Math.abs(X(v) - mid))}" height="6" rx="3" fill="${v < 0 ? 'var(--port)' : 'var(--stbd)'}"/>
  <line x1="${mid}" y1="13" x2="${mid}" y2="27" stroke="var(--ink)"/>
  <rect x="${f(X(order) - 8)}" y="12" width="16" height="16" rx="3" fill="var(--panelSolid)" stroke="var(--own)" stroke-width="2.5"/>
  <text x="${x0}" y="38" font-size="9" fill="var(--port)">P</text><text x="${x1}" y="38" text-anchor="end" font-size="9" fill="var(--stbd)">S</text>
  <text x="${mid}" y="38" text-anchor="middle" font-family="IBM Plex Mono" font-size="9.5" fill="var(--ink)">${v === 0 ? '0' : (v < 0 ? 'P' : 'S') + Math.round(Math.abs(v) * 100)}%</text></svg>`;
}

/** Plan-view propulsion layout glyph for cards (hull outline + propulsor symbols). */
export function layoutGlyph(kind, w = 200, h = 52) {
  const cx = w / 2, cy = h / 2, L = w - 16, B = h - 22;
  const hull = `<path d="${hullPath(cx, cy, 90, L, B, kind === 'tug' || kind === 'vsp' ? 'tug' : kind === 'cat' ? 'cat' : kind === 'push' ? 'barge' : 'ship')}" fill="none" stroke="var(--muted)" stroke-width="1.2"/>`;
  const sx = cx - L / 2, bx = cx + L / 2;
  const pod = (x, y) => `<circle cx="${x}" cy="${y}" r="4.5" fill="none" stroke="var(--own)" stroke-width="2"/><line x1="${x}" y1="${y}" x2="${x - 9}" y2="${y}" stroke="var(--own)" stroke-width="2"/>`;
  const prop = (x, y) => `<rect x="${x - 2}" y="${y - 5}" width="4" height="10" fill="var(--own)"/>`;
  const rud = (x, y) => `<line x1="${x}" y1="${y}" x2="${x - 9}" y2="${y}" stroke="var(--ink)" stroke-width="2.5"/>`;
  const tun = x => `<line x1="${x}" y1="${cy - B / 2 + 3}" x2="${x}" y2="${cy + B / 2 - 3}" stroke="var(--info)" stroke-width="2.5"/>`;
  const vsp = (x, y) => `<circle cx="${x}" cy="${y}" r="5" fill="none" stroke="var(--own)" stroke-width="2"/><circle cx="${x}" cy="${y}" r="1.5" fill="var(--own)"/>`;
  const jet = (x, y) => `<path d="M${x},${y - 3} L${x - 9},${y - 3} L${x - 9},${y + 3} L${x},${y + 3}" fill="none" stroke="var(--own)" stroke-width="2"/>`;
  let g = '';
  switch (kind) {
    case 'azipod': g = pod(sx + 14, cy - 7) + pod(sx + 14, cy + 7) + tun(bx - 26) + tun(bx - 32); break;
    case 'fpp': g = prop(sx + 12, cy) + rud(sx + 6, cy); break;
    case 'fpp-bt': g = prop(sx + 12, cy) + rud(sx + 6, cy) + tun(bx - 22); break;
    case 'cpp2': g = prop(sx + 16, cy - 7) + prop(sx + 16, cy + 7) + rud(sx + 9, cy - 7) + rud(sx + 9, cy + 7) + tun(bx - 22) + tun(bx - 28) + tun(sx + 34); break;
    case 'tug': g = pod(sx + 9, cy - 6) + pod(sx + 9, cy + 6); break;
    case 'vsp': g = vsp(bx - 34, cy - 6) + vsp(bx - 34, cy + 6) + `<rect x="${sx + 4}" y="${cy - 2}" width="18" height="4" fill="var(--muted)"/>`; break;
    case 'cat': g = jet(sx + 8, cy - 15) + jet(sx + 8, cy - 9) + jet(sx + 8, cy + 9) + jet(sx + 8, cy + 15); break;
    case 'dp': g = pod(sx + 14, cy - 7) + pod(sx + 14, cy + 7) + tun(bx - 22) + tun(bx - 28) + `<circle cx="${bx - 42}" cy="${cy}" r="4.5" fill="none" stroke="var(--info)" stroke-width="2"/>`; break;
    case 'push': g = prop(sx + 10, cy - 6) + prop(sx + 10, cy + 6) + rud(sx + 5, cy - 6) + rud(sx + 5, cy + 6) + `<line x1="${sx + 18}" y1="${cy - 6}" x2="${sx + 26}" y2="${cy - 6}" stroke="var(--info)" stroke-width="2.5"/><line x1="${sx + 18}" y1="${cy + 6}" x2="${sx + 26}" y2="${cy + 6}" stroke="var(--info)" stroke-width="2.5"/>`; break;
    case 'ice': g = pod(sx + 14, cy - 9) + pod(sx + 14, cy) + pod(sx + 14, cy + 9) + tun(bx - 26); break;
    case 'naval': g = prop(sx + 18, cy - 7) + prop(sx + 18, cy + 7) + rud(sx + 10, cy - 7) + rud(sx + 10, cy + 7); break;
  }
  return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${hull}${g}</svg>`;
}

/** Side profile silhouettes (stern left, bow right). */
export function profile(type, w = 300, h = 70) {
  const wl = h * 0.72; // waterline y
  const P = pts => 'M' + pts.map(([x, y]) => `${f(x * w)},${f(y)}`).join(' L') + ' Z';
  const hull = (fb, bowRake = 0.03, sternOver = 0.02, draft = 10) => P([[0.02, wl - fb], [0.98 - bowRake, wl - fb], [1, wl - fb - 2], [0.97, wl + draft * 0.4], [0.93, wl + draft], [0.06, wl + draft], [0.02 + sternOver, wl], [0, wl - fb + 2]]);
  const box = (x0, x1, y0, y1) => P([[x0, y0], [x1, y0], [x1, y1], [x0, y1]]);
  const sup = [], hl = [];
  let hp;
  switch (type) {
    case 'cruise': hp = hull(10, 0.04, 0.02, 9); sup.push(box(0.05, 0.86, wl - 28, wl - 10), box(0.08, 0.8, wl - 38, wl - 27), box(0.15, 0.74, wl - 45, wl - 37), box(0.3, 0.38, wl - 55, wl - 44)); break;
    case 'vlcc': hp = hull(9, 0.02, 0.02, 14); sup.push(box(0.06, 0.15, wl - 34, wl - 9), box(0.08, 0.12, wl - 42, wl - 34)); hl.push(box(0.2, 0.92, wl - 11, wl - 9)); break;
    case 'container': hp = hull(9, 0.03, 0.02, 12); { const r = rng(7); for (let x = 0.12; x < 0.92; x += 0.042) if (x < 0.66 || x > 0.71) sup.push(box(x, x + 0.038, wl - 9 - (14 + Math.floor(r() * 4) * 2), wl - 9)); } sup.push(box(0.66, 0.71, wl - 40, wl - 9)); break;
    case 'bulk': hp = hull(9, 0.02, 0.02, 12); sup.push(box(0.05, 0.15, wl - 30, wl - 9), box(0.07, 0.12, wl - 36, wl - 30)); for (let x = 0.2; x < 0.9; x += 0.1) hl.push(box(x, x + 0.07, wl - 13, wl - 9)); break;
    case 'lng': hp = hull(12, 0.03, 0.02, 11); sup.push(box(0.05, 0.14, wl - 38, wl - 12), box(0.2, 0.9, wl - 18, wl - 12)); break;
    case 'pctc': hp = hull(8, 0.0, 0.02, 9); sup.push(P([[0.02, wl - 8], [0.98, wl - 8], [0.99, wl - 34], [0.94, wl - 42], [0.03, wl - 42]]), box(0.84, 0.95, wl - 46, wl - 42)); break;
    case 'ropax': hp = hull(9, 0.03, 0.01, 7); sup.push(box(0.03, 0.85, wl - 22, wl - 9), box(0.1, 0.82, wl - 32, wl - 22), box(0.62, 0.8, wl - 38, wl - 32), box(0.2, 0.28, wl - 44, wl - 32)); break;
    case 'tug': hp = P([[0.02, wl - 6], [0.88, wl - 10], [1, wl - 13], [0.96, wl + 6], [0.06, wl + 6], [0, wl]]); sup.push(box(0.4, 0.66, wl - 22, wl - 9), box(0.43, 0.63, wl - 32, wl - 22), box(0.5, 0.53, wl - 42, wl - 32)); break;
    case 'psv': hp = P([[0.02, wl - 6], [0.62, wl - 6], [0.66, wl - 9], [0.98, wl - 11], [1, wl - 14], [0.95, wl + 7], [0.06, wl + 7], [0, wl]]); sup.push(box(0.66, 0.95, wl - 30, wl - 10), box(0.7, 0.92, wl - 38, wl - 30), box(0.8, 0.83, wl - 48, wl - 38)); break;
    case 'cat': hp = P([[0.02, wl - 8], [0.9, wl - 8], [1, wl - 6], [0.97, wl + 3], [0.05, wl + 3], [0, wl - 3]]); sup.push(P([[0.08, wl - 8], [0.75, wl - 8], [0.86, wl - 18], [0.8, wl - 26], [0.12, wl - 26]])); break;
    case 'push': hp = P([[0, wl - 6], [0.22, wl - 6], [0.22, wl + 4], [0, wl + 4]]); sup.push(box(0.03, 0.15, wl - 26, wl - 6), box(0.05, 0.13, wl - 34, wl - 26)); for (let x = 0.24; x < 0.98; x += 0.25) hl.push(box(x, x + 0.24, wl - 5, wl + 4)); break;
    case 'naval': hp = P([[0.02, wl - 7], [0.96, wl - 11], [1, wl - 12], [0.96, wl + 5], [0.06, wl + 5], [0, wl - 4]]); sup.push(P([[0.25, wl - 10], [0.7, wl - 10], [0.66, wl - 26], [0.3, wl - 26]]), P([[0.5, wl - 26], [0.6, wl - 26], [0.57, wl - 44], [0.53, wl - 44]])); break;
    case 'ice': hp = P([[0.02, wl - 10], [0.88, wl - 10], [0.97, wl - 14], [1, wl - 6], [0.9, wl + 9], [0.06, wl + 9], [0, wl - 4]]); sup.push(box(0.5, 0.82, wl - 30, wl - 10), box(0.56, 0.8, wl - 40, wl - 30), box(0.3, 0.38, wl - 34, wl - 10)); break;
    case 'yacht': hp = P([[0.02, wl - 7], [0.9, wl - 9], [1, wl - 11], [0.93, wl + 4], [0.06, wl + 4], [0, wl - 2]]); sup.push(P([[0.1, wl - 7], [0.82, wl - 9], [0.7, wl - 18], [0.16, wl - 18]]), P([[0.22, wl - 18], [0.66, wl - 18], [0.58, wl - 26], [0.28, wl - 26]])); break;
    default: hp = hull(8);
  }
  return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
  <line x1="0" y1="${wl}" x2="${w}" y2="${wl}" stroke="var(--info)" stroke-width="1" opacity="0.5"/>
  ${sup.map(d => `<path d="${d}" fill="var(--ink)" opacity="0.82"/>`).join('')}
  ${hl.map(d => `<path d="${d}" fill="var(--muted)"/>`).join('')}
  <path d="${hp}" fill="var(--muted)"/></svg>`;
}

export function hud(cells, env, top = 0) {
  const c = ([k, v, u, cls = '']) => `<div class="cell"><span class="lab">${k}</span><span class="val ${cls}">${v}</span><span class="unit">${u}</span></div>`;
  return `<header class="hud" style="top:${top}px">
  <div class="hud-row primary">${cells[0].map(c).join('')}</div>
  <div class="hud-row secondary">${cells[1].map(c).join('')}</div>
  <div class="hud-row env">${env.map(e => `<span>${e}</span>`).join('')}</div></header>`;
}

export function page({ palette = 'night', w = 1440, h = 900, body, css = '' }) {
  return `<!doctype html><html><head><meta charset="utf-8"><style>${baseCss(PALETTES[palette])}${css}</style></head>
<body style="width:${w}px;height:${h}px">${body}</body></html>`;
}
