// Mockup pages for the propulsion / fleet expansion plan (docs/expansion/PLAN.md).
// Values on screen are illustrative, chosen to be physically plausible for each ship.
import { page, hud, chart, ownShip, hullPath, bodyPt, force, telegraph, gauge, rai, lever, azimuth, vspPad, tunnel, layoutGlyph, profile, pt } from './lib.mjs';

const btns = (top, list) => `<nav class="mapbtns" style="top:${top}px">${list.map(([t, on]) => `<span class="mb${on ? ' on' : ''}">${t}</span>`).join('')}</nav>`;
const chip = (top, type, name, spec) => `<div class="shipchip" style="top:${top}px">${profile(type, 92, 34)}<div><div class="nm">${name}</div><div class="sp">${spec}</div></div><span class="chip on" style="margin-left:6px">CHANGE SHIP</span></div>`;
const pn = (title, right, inner, style = '') => `<section class="pn" style="${style}"><div class="tag"><span>${title}</span><b>${right}</b></div>${inner}</section>`;
const rd = (k, v, cls = '') => `<div class="rd"><span class="k">${k}</span><span class="${cls}">${v}</span></div>`;
const tugIcon = (x, y, hdg, line) => `${line ? `<line x1="${line[0]}" y1="${line[1]}" x2="${x}" y2="${y}" stroke="var(--ink)" stroke-width="1" stroke-dasharray="4 3"/>` : ''}<path d="${hullPath(x, y, hdg, 14, 6, 'tug')}" fill="var(--hull)" stroke="var(--ink)" stroke-width="1.4"/>`;

// ─────────────────────────────────────────────────────────── 02 VLCC single screw
export function vlcc() {
  const H = 900, trayH = 262, chartH = H - trayH;
  // 1 px ≈ 2.4 m. Ship 320 m → 133 px.
  const sx = 610, sy = 370, hdg = 62, L = 133, B = 24;
  const track = [[sx, sy], [sx + 70, sy - 30], [sx + 150, sy - 48], [sx + 230, sy - 52], [sx + 300, sy - 46]];
  const ghosts = [[sx + 150, sy - 48, 78], [sx + 300, sy - 46, 92]];
  const [stx, sty] = bodyPt(sx, sy, hdg, -64, 0), [bwx, bwy] = bodyPt(sx, sy, hdg, 62, 0);
  const [qx, qy] = bodyPt(sx, sy, hdg, -44, 20);
  const tugs = tugIcon(bwx + 34, bwy - 46, 10, [bwx, bwy]) + tugIcon(qx, qy, hdg - 90, null);
  const jetty = `<rect x="1010" y="230" width="190" height="10" fill="var(--landEdge)"/><rect x="1100" y="240" width="10" height="160" fill="var(--landEdge)"/>
    ${[1000, 1060, 1150, 1210].map(x => `<rect x="${x}" y="244" width="12" height="12" fill="var(--land)" stroke="var(--landEdge)"/>`).join('')}
    <text x="1020" y="222" font-size="11" font-style="italic" fill="var(--muted)">Crude jetty No 2 · 22.0 m</text>
    <path d="M1015,262 L1205,262" stroke="var(--predict)" stroke-dasharray="2 4" stroke-width="1.5"/>`;
  const forces = force(stx, sty, hdg - 90, 46, 'var(--warn)', 'TRANSVERSE THRUST · STERN TO PORT', 'end')
    + force(470, 250, 40, 44, 'var(--info)', 'WIND 220° 18 kn', 'start')
    + force(qx, qy, hdg - 90, 26, 'var(--ink)', '', 'start')
    + `<text x="${qx + 12}" y="${qy + 24}" font-size="12" font-weight="600" letter-spacing="0.06em" fill="var(--ink)">TUG 2 · PUSH 25 %</text>`
    + force(bwx + 34, bwy - 46, 10, 30, 'var(--ink)', 'TUG 1 · PULL 40 %', 'start');
  const ch = chart({
    w: 1440, h: chartH, seed: 11, soundings: 70,
    land: [[[1440, 0], [1440, chartH], [1290, chartH], [1250, 520], [1265, 300], [1230, 180], [1260, 0]], [[0, chartH], [0, 470], [140, 520], [260, 600], [300, chartH]]],
    shoal: [[[1180, 0], [1260, 0], [1230, 180], [1265, 300], [1250, 520], [1290, chartH], [1150, chartH], [1160, 420], [1190, 300], [1170, 140]], [[0, 380], [200, 430], [360, 560], [420, chartH], [0, chartH]]],
    channel: ['M80,180 L1000,250', 'M120,300 L1000,330'],
    extra: jetty + forces,
    ships: ownShip(sx, sy, hdg, L, B, { track, ghosts }) + tugs,
    scale: { px: 104, label: '250 m' },
    legend: 'CHART SCHEMATIC · DEPTHS m · HEAD REACH (est.) 1.6 nm · NOT FOR NAVIGATION',
  });
  const tray = `<footer class="tray" style="height:${trayH}px">
  ${pn('Engine telegraph', 'BRIDGE CONTROL', telegraph({ order: 7, answer: 5, steps: ['NAV FULL', 'FULL', 'HALF', 'SLOW', 'DEAD SLOW', 'STOP', 'DEAD SLOW', 'SLOW', 'HALF', 'FULL', 'EMERGENCY'], h: 214, w: 140 }))}
  ${pn('Main engine', '2-STROKE · DIRECT REVERSING', `<div class="row" style="gap:12px;align-items:center">${gauge({ v: -14, order: -38, min: -80, max: 80, size: 160, barred: [[42, 52], [-52, -42]], dead: [-24, 24], label: 'SHAFT' })}
    <div class="col" style="gap:7px;width:206px">
      ${rd('STATE', 'STARTING ASTERN', 'c-own')}
      ${rd('START AIR', '24.1 bar')}<div class="meter"><i style="width:78%"></i></div>
      ${rd('STARTS LEFT', '≈ 9')}
      ${rd('MIN STABLE', '24 rpm')}
      ${rd('BARRED', '42–52 rpm', 'c-warn')}
      ${rd('REVERSAL', 'stop 0:41 · start 0:12')}
    </div></div>`)}
  ${pn('Helm', 'FOLLOW-UP · 2 PUMPS', `${rai({ order: -20, actual: -14, max: 35, w: 232, sub: '2.3 °/s' })}
    <div class="row"><span class="cb on">FU</span><span class="cb">NFU</span><span class="cb">AUTO</span><span class="cb">ROT</span></div>`)}
  ${pn('Tugs', '2 × 80 t ASD', `<div class="col" style="width:236px;gap:8px">
    <div class="rd"><span class="k">1 · PORT BOW</span><span>PULL 040° · 40 %</span></div><div class="meter"><i style="width:40%;background:var(--own)"></i></div>
    <div class="rd"><span class="k">2 · STBD QTR</span><span>PUSH 90° on hull · 25 %</span></div><div class="meter"><i style="width:25%;background:var(--own)"></i></div>
    <div class="row" style="flex-wrap:wrap"><span class="cb">PUSH</span><span class="cb on">PULL</span><span class="cb">STOP</span><span class="cb">LET GO</span><span class="cb">BOTH</span></div>
    <div class="rd"><span class="k">VHF</span><span class="c-muted">"Tug 1, pull easy, 040"</span></div></div>`)}
  ${pn('Coach', 'FORCES ON', `<div class="col" style="width:260px;gap:7px;font-size:13px;line-height:1.35">
    <div><b class="c-warn">Astern on a right-hand FPP</b> walks the stern to port, about 5–10 % of astern thrust. Expect the bow to swing to starboard.</div>
    <div><b class="c-own">Rudder in no slipstream.</b> At 2.6 kn STW and engine stopped, the rudder is at 30 % of its normal authority.</div>
    <div class="c-muted">Laden, h/T 1.18: turning circle about 1.6 × deep water. Squat 0.42 m.</div></div>`)}
</footer>`;
  const body = `${ch.replace('position:absolute;left:0;top:0', `position:absolute;left:0;top:0`)}
  ${hud([[['HDG', '062.4', '°'], ['SOG', '3.1', 'kn'], ['ROT', '+6', '°/min'], ['COG', '064', '°'], ['STW', '2.6', 'kn']],
    [['FWD', '▸ 0.04', 'm/s', 'c-stbd'], ['AFT', '◂ 0.11', 'm/s', 'c-port'], ['LONG', '+1.58', 'm/s'], ['UKC', '2.1', 'm']]],
    ['WIND 220° 18 kn · REL −158°', 'CURRENT est 030° 0.8 kn', 'DEPTH 24.6 m · SQUAT 0.42 m', 'LADEN T 20.8 m · Δ ≈ 320 000 t', 'ME 14 rpm AS · 6 % MCR', '06:42 1×'])}
  ${btns(110, [['MENU'], ['PAUSE'], ['1×'], ['PRED', 1], ['N-UP'], ['2D'], ['FOLLOW', 1], ['TUGS', 1], ['FORCES', 1]])}
  ${chip(108, 'vlcc', 'VLCC 320 m · KVLCC2 hull', 'Lpp 320 · B 58 · T 20.8 · Cb 0.81 · 1 × FPP right-hand · 1 rudder')}
  <div class="flag info" style="left:16px;top:154px">SLOW ASTERN ordered · engine stopping, then starting on air</div>
  <div style="position:absolute;top:0;left:0;right:0;height:${chartH}px;overflow:hidden">${''}</div>
  ${tray}`;
  return page({ palette: 'night', body: body.replace(`<svg width="1440" height="${chartH}"`, `<svg width="1440" height="${chartH}" style="position:absolute;left:0;top:0"`) });
}

// ─────────────────────────────────────────────────────────── 01 Fleet picker
const FLEET = [
  { t: 'cruise', g: 'azipod', n: 'Spirit-class cruise', s: '293 m · 2 × 17.6 MW Azipod · 3 BT', tags: ['AZIPOD', 'IN SIM'], lvl: 3, sel: 0 },
  { t: 'vlcc', g: 'fpp', n: 'VLCC · KVLCC2 hull', s: '320 m · 1 × FPP · 2-stroke · rudder', tags: ['SHAFT + RUDDER', 'SIMMAN DATA'], lvl: 4, sel: 1 },
  { t: 'container', g: 'fpp-bt', n: 'Container 14 000 TEU · DTC', s: '355 m · 1 × FPP · rudder · 2 BT', tags: ['SHAFT + RUDDER', 'SHALLOW-WATER DATA'], lvl: 4 },
  { t: 'ropax', g: 'cpp2', n: 'Ro-Pax ferry', s: '200 m · 2 × CPP · flap rudders · 2 BT + 1 ST', tags: ['TWIN CPP'], lvl: 2 },
  { t: 'tug', g: 'tug', n: 'ASD harbour / escort tug', s: '32 m · 2 × Z-drive · 80 t BP', tags: ['AZIMUTH STERN DRIVE'], lvl: 3 },
  { t: 'tug', g: 'vsp', n: 'Voith tractor tug', s: '31 m · 2 × VSP · 70 t BP · skeg aft', tags: ['VOITH SCHNEIDER'], lvl: 3 },
  { t: 'cat', g: 'cat', n: 'Fast ferry catamaran', s: '70 m · 4 × waterjet · 36 kn', tags: ['WATERJET', 'HSC TYPE RATING'], lvl: 3 },
  { t: 'psv', g: 'dp', n: 'Platform supply vessel', s: '89 m · 2 × azimuth · 2 BT + retract · DP2', tags: ['DP', 'THRUSTERS'], lvl: 3 },
  { t: 'push', g: 'push', n: 'Push convoy 2 × 2', s: '40 m pusher + 4 Europa IIa barges · 193 m · flanking rudders', tags: ['INLAND'], lvl: 4 },
];
export function fleet() {
  const card = (s, i) => `<article class="card${s.sel ? ' sel' : ''}">
    <div class="pf">${profile(s.t, 300, 72)}</div>
    <div class="nm">${s.n}</div><div class="sp">${s.s}</div>
    <div class="lg">${layoutGlyph(s.g, 300, 46)}</div>
    <div class="tg">${s.tags.map((t, j) => `<span class="chip ${j ? (t === 'IN SIM' ? 'ok' : 'info') : 'on'}">${t}</span>`).join('')}<span class="lvl">${'▮'.repeat(s.lvl)}<i>${'▮'.repeat(5 - s.lvl)}</i></span></div>
  </article>`;
  const filt = (title, items) => `<div class="fg"><div class="tag">${title}</div>${items.map(([t, n, on]) => `<div class="fi${on ? ' on' : ''}"><span>${t}</span><span class="mono">${n}</span></div>`).join('')}</div>`;
  const css = `
  .wrap { position:absolute; inset:0; display:grid; grid-template-columns: 230px 1fr 380px; }
  .side { border-right:1px solid var(--rule); padding:22px 16px; display:flex; flex-direction:column; gap:20px; background: var(--panelSolid); }
  .side h1 { font-family: var(--font-label); font-weight:700; font-size:26px; letter-spacing:0.01em; }
  .fg { display:flex; flex-direction:column; gap:2px; } .fg .tag { margin-bottom:6px; border-bottom:1px solid var(--rule); padding-bottom:4px; }
  .fi { display:flex; justify-content:space-between; font-size:13.5px; padding:4px 8px; border-radius:3px; color: var(--muted); border:1px solid transparent; }
  .fi.on { color: var(--ink); border-color: var(--own); }
  .main { padding: 22px 22px; display:flex; flex-direction:column; gap:14px; overflow:hidden; }
  .bar { display:flex; align-items:center; gap:10px; }
  .search { flex:1; height:36px; border:1px solid var(--rule); border-radius:3px; display:flex; align-items:center; padding:0 12px; color:var(--muted); font-size:14px; }
  .grid { display:grid; grid-template-columns: repeat(3, 1fr); gap:12px; }
  .card { border:1px solid var(--rule); border-radius:4px; padding:10px 12px 10px; display:flex; flex-direction:column; gap:3px; background: color-mix(in srgb, var(--panelSolid) 60%, transparent); }
  .card.sel { border-color: var(--own); box-shadow: 0 0 0 1px var(--own) inset; }
  .card .pf svg, .card .lg svg { width:100%; height:auto; display:block; }
  .card .nm { font-family: var(--font-label); font-weight:700; font-size:17px; margin-top:2px; }
  .card .sp { font-family: var(--font-num); font-size:11px; color: var(--muted); min-height:30px; }
  .card .lg { margin:4px 0 2px; border-top:1px dashed var(--rule); padding-top:4px; }
  .card .tg { display:flex; gap:5px; align-items:center; flex-wrap:wrap; }
  .lvl { margin-left:auto; color: var(--own); font-size:11px; letter-spacing:1px; } .lvl i { color: var(--rule); font-style:normal; }
  .det { border-left:1px solid var(--rule); padding:22px 20px; background: var(--panelSolid); display:flex; flex-direction:column; gap:12px; }
  .det h2 { font-family: var(--font-label); font-weight:700; font-size:24px; }
  .det p { font-size:13.5px; line-height:1.45; color: var(--ink); }
  table { border-collapse: collapse; width:100%; font-size:12.5px; } td { padding:3px 0; border-bottom:1px solid var(--rule); } td:first-child { color: var(--muted); font-family: var(--font-label); font-weight:600; letter-spacing:0.06em; font-size:11.5px; } td:last-child { text-align:right; font-family: var(--font-num); font-size:12px; }
  .go { height:42px; border:1.5px solid var(--own); border-radius:3px; display:flex; align-items:center; justify-content:center; font-family:var(--font-label); font-weight:700; letter-spacing:0.1em; font-size:15px; color: var(--ink); margin-top:auto; }
  .station { display:flex; gap:10px; align-items:center; border:1px dashed var(--rule); border-radius:4px; padding:8px; }
  .more { display:flex; flex-wrap:wrap; gap:6px; align-items:center; border-top:1px solid var(--rule); padding-top:12px; } .more .tag { margin-right:6px; }
  .legendrow { display:flex; gap:16px; font-family: var(--font-label); font-size:11.5px; letter-spacing:0.06em; color: var(--muted); align-items:center; }
  .legendrow i { display:inline-block; width:14px; height:4px; margin-right:5px; vertical-align:middle; }
  `;
  const body = `<div class="wrap">
  <aside class="side"><h1>Fleet</h1>
    ${filt('Propulsion', [['Azipod / podded', 3, 0], ['Shaft + rudder · FPP', 4, 1], ['Shaft + rudder · CPP', 3, 0], ['Azimuth stern drive', 2, 0], ['Voith Schneider', 1, 0], ['Waterjet', 1, 0], ['DP · thrusters', 2, 0], ['Wind-assist rotor', 1, 0]])}
    ${filt('Ship type', [['All types', 18, 1], ['Tanker · gas', 3], ['Container · bulk', 3], ['Passenger · ferry', 4], ['Tug · workboat', 4], ['Inland · naval · yacht', 4]])}
    ${filt('Length', [['< 50 m', 3], ['50–150 m', 5], ['150–250 m', 4], ['250 m +', 6, 1]])}
  </aside>
  <main class="main">
    <div class="bar"><div class="search">Search ships, propulsion, ports…</div><span class="mb on">GRID</span><span class="mb">COMPARE</span><span class="mb">CLOSE</span></div>
    <div class="legendrow"><span>PLAN VIEW KEY</span><span><i style="background:var(--own)"></i>PROPULSOR</span><span><i style="background:var(--ink)"></i>RUDDER</span><span><i style="background:var(--info)"></i>THRUSTER</span><span style="margin-left:auto">HANDLING DIFFICULTY <b style="color:var(--own)">▮▮▮</b></span></div>
    <div class="grid">${FLEET.map(card).join('')}</div>
    <div class="more"><span class="tag">Later phases</span>${['LNG carrier 174k m³', 'PCTC car carrier', 'Capesize bulker', 'Conventional twin-screw cruise', 'AHTS', 'Rotor tug', 'Arctic icebreaker', 'Frigate · CODAG', 'Superyacht 90 m', 'Rhine barge 110 m', 'Rotor-sail bulker'].map(t => `<span class="chip">${t}</span>`).join('')}</div>
  </main>
  <aside class="det">
    <div class="tag">Selected</div>
    <h2>VLCC · KVLCC2 hull</h2>
    ${profile('vlcc', 340, 80)}
    ${layoutGlyph('fpp', 340, 60)}
    <p>Very large crude carrier on the open KVLCC2 benchmark hull (SIMMAN). One right-hand fixed-pitch propeller on a direct-reversing two-stroke, one semi-balanced rudder, no thrusters. Huge inertia; stopping takes miles, astern walks the stern hard to port, and the engine has a limited number of air starts.</p>
    <table>
      <tr><td>LPP · B · T</td><td>320 · 58 · 20.8 m</td></tr>
      <tr><td>VOLUME</td><td>312 600 m³ · Cb 0.81</td></tr>
      <tr><td>MAIN ENGINE (TYP.)</td><td>2-stroke · ≈ 27 MW · 76 rpm</td></tr>
      <tr><td>RUDDER</td><td>semi-balanced · ±35° · 2.3 °/s</td></tr>
      <tr><td>LOAD CASE</td><td>LADEN · BALLAST</td></tr>
      <tr><td>VALIDATION</td><td>Turning, zig-zag vs SIMMAN free-running</td></tr>
    </table>
    <div class="station">${rai({ order: 10, actual: 6, max: 35, w: 130 })}
      <div class="col" style="gap:4px"><div class="tag">Control station</div><div style="font-size:13.5px">Engine telegraph + follow-up helm, tug orders, air-start state</div><div class="row"><span class="chip on">TELEGRAPH</span><span class="chip on">HELM</span><span class="chip">TUGS</span></div></div></div>
    <div class="go">LOAD SHIP · LADEN</div>
  </aside></div>`;
  return page({ palette: 'night', body, css });
}

// ─────────────────────────────────────────────────────────── 03 Ro-Pax twin CPP (day palette)
export function ropax() {
  const H = 900, trayH = 270, chartH = H - trayH;
  const sx = 700, sy = 360, hdg = 182, L = 167, B = 25; // backing in, stern first (heading ~S, moving N)
  const track = [[sx, sy], [sx - 4, sy - 60], [sx - 10, sy - 130], [sx - 14, sy - 190]];
  const ghosts = [[sx - 10, sy - 130, 178]];
  const [stx, sty] = bodyPt(sx, sy, hdg, -80, 0), [bwx, bwy] = bodyPt(sx, sy, hdg, 78, 0);
  const berth = `<rect x="610" y="96" width="170" height="40" fill="var(--landEdge)" opacity="0.85"/><rect x="672" y="128" width="46" height="34" fill="var(--muted)" opacity="0.8"/>
    <text x="480" y="156" font-size="11" font-style="italic" fill="var(--ink)">Linkspan 3 · stern ramp →</text>
    ${[620, 760].map(x => `<rect x="${x}" y="136" width="8" height="70" fill="var(--landEdge)"/>`).join('')}`;
  const [p1x, p1y] = bodyPt(sx, sy, hdg, -72, -7), [p2x, p2y] = bodyPt(sx, sy, hdg, -72, 7);
  const forces = force(p1x, p1y, hdg + 180, 34, 'var(--port)', 'PORT AS 40 %', 'end') + force(p2x, p2y, hdg, 28, 'var(--stbd)', 'STBD AH 28 %', 'start')
    + force(bwx, bwy, hdg - 90, 40, 'var(--info)', 'BOW THRUSTERS → PORT', 'start')
    + force(1050, 420, 290, 40, 'var(--info)', 'WIND 110° 22 kn', 'start');
  const ch = chart({
    w: 1440, h: chartH, seed: 21, soundings: 60,
    land: [[[0, 0], [1440, 0], [1440, 110], [880, 110], [800, 136], [600, 136], [520, 110], [0, 110]], [[1180, 110], [1440, 110], [1440, 600], [1300, 520], [1230, 300]]],
    shoal: [[[0, 110], [520, 110], [480, 240], [300, 330], [0, 360]], [[1230, 300], [1300, 520], [1440, 600], [1440, chartH], [1100, chartH], [1150, 420]]],
    channel: ['M560,620 L640,180', 'M840,620 L780,180'],
    extra: berth,
    ships: ownShip(sx, sy, hdg, L, B, { track, ghosts }), over: forces,
    scale: { px: 84, label: '100 m' }, legend: 'CHART SCHEMATIC · DEPTHS m · NOT FOR NAVIGATION',
  });
  const cpp = (lab, cls, o, a) => pn(`<span class="${cls}">${lab} CPP</span>`, 'PITCH', `<div class="row" style="align-items:center;gap:4px">${lever({ order: o, actual: a, h: 176, w: 74, color: cls === 'c-port' ? 'var(--port)' : 'var(--stbd)', labels: [[1, '100'], [0.5, '50'], [-0.5, '50'], [-1, '100']] })}
    <div class="col" style="gap:5px;width:92px">${rd('ORDER', (o < 0 ? '−' : '+') + Math.round(Math.abs(o) * 100) + ' %', 'c-own')}${rd('PITCH', (a < 0 ? '−' : '+') + Math.round(Math.abs(a) * 100) + ' %')}${rd('SHAFT', '145 rpm')}${rd('LOAD', Math.round(Math.abs(a) * 9) + '.4 MW')}<div class="meter"><i style="width:${Math.abs(a) * 80}%"></i></div></div></div>`);
  const tray = `<footer class="tray" style="height:${trayH}px">
  ${cpp('PORT', 'c-port', -0.4, -0.32)}
  ${cpp('STBD', 'c-stbd', 0.3, 0.28)}
  ${pn('Rudders', 'FLAP · LINKED', `<div class="row" style="gap:0">${rai({ order: -35, actual: -31, max: 45, w: 170, label: 'PORT' })}${rai({ order: -35, actual: -33, max: 45, w: 170, label: 'STBD' })}</div>
    <div class="row"><span class="cb on">LINKED</span><span class="cb">SPLIT</span><span class="cb">FU</span><span class="cb">NFU</span></div>`)}
  ${pn('Thrusters', 'TUNNEL · CPP', `<div class="col" style="gap:4px">${tunnel({ v: -0.82, order: -0.9, w: 200, label: 'BOW 1', eff: 0.94 })}${tunnel({ v: -0.8, order: -0.9, w: 200, label: 'BOW 2', eff: 0.94 })}${tunnel({ v: 0, order: 0, w: 200, label: 'STERN' })}</div>`)}
  ${pn('Power', 'PMS · 2 SG + 3 DG', `<div class="col" style="gap:6px;width:210px">
    ${rd('AVAILABLE', '13.2 MW')}${rd('IN USE', '10.9 MW', 'c-own')}<div class="meter"><i style="width:83%;background:var(--own)"></i></div>
    <div class="row" style="flex-wrap:wrap"><span class="chip ok">SG1</span><span class="chip ok">SG2</span><span class="chip ok">DG1</span><span class="chip ok">DG2</span><span class="chip">DG3 STBY</span></div>
    <div style="font-size:12.5px;line-height:1.35" class="c-warn">Thrusters near limit: PMS will cap pitch at 85 % to protect the switchboard.</div>
    <div class="row"><span class="cb on">COMBINATOR</span><span class="cb">CONST RPM</span></div></div>`)}
</footer>`;
  const body = `${ch.replace(`<svg width="1440" height="${chartH}"`, `<svg width="1440" height="${chartH}" style="position:absolute;left:0;top:0"`)}
  ${hud([[['HDG', '181.6', '°'], ['SOG', '1.2', 'kn'], ['ROT', '−9', '°/min'], ['COG', '356', '°'], ['STW', '1.0', 'kn']],
    [['FWD', '◂ 0.22', 'm/s', 'c-port'], ['AFT', '▸ 0.06', 'm/s', 'c-stbd'], ['LONG', '−0.61', 'm/s'], ['UKC', '3.4', 'm']]],
    ['WIND 110° 22 kn · REL −72°', 'CURRENT est 250° 0.4 kn', 'DEPTH 9.8 m · SQUAT 0.03 m', 'T 6.4 m', 'PWR 10.9/13.2 MW', '14:12 1×'])}
  ${btns(110, [['MENU'], ['PAUSE'], ['1×'], ['PRED', 1], ['H-UP', 1], ['SPLIT'], ['FOLLOW', 1], ['LINES'], ['FORCES', 1]])}
  ${chip(108, 'ropax', 'Ro-Pax ferry · 200 m', 'Lpp 186 · B 30.5 · T 6.4 · 2 × CPP 12 MW · 2 × flap rudder · 2 BT + 1 ST')}
  <div class="flag good" style="left:16px;top:154px">TWISTING TO PORT · port astern, stbd ahead, rudders and bow thrusters to port</div>
  ${tray}`;
  return page({ palette: 'day', body });
}

// ─────────────────────────────────────────────────────────── 04 ASD tug, escort (dusk)
export function tug() {
  const H = 900, trayH = 278, chartH = H - trayH;
  // 1 px ≈ 0.5 m. Tanker moving N at 8 kn (heading 000), we escort on the stern line in indirect mode.
  const tkx = 560, tky = -220;
  const tanker = `<path d="${hullPath(tkx, tky + 300, 0, 600, 96)}" fill="var(--hull)" stroke="var(--ink)" stroke-width="1.6"/>
    <text x="${tkx - 280}" y="300" font-size="12" font-weight="600" letter-spacing="0.06em" fill="var(--ink)">ESCORTED: AFRAMAX 250 m · 8.1 kn</text>`;
  const fair = [tkx, 380]; // centre-lead aft
  const ux = 800, uy = 500, uh = 318; // tug heading, angled fin-first ~42° to the line
  const [bx, by] = bodyPt(ux, uy, uh, 30, 0);
  const line = `<line x1="${fair[0]}" y1="${fair[1]}" x2="${f1(bx)}" y2="${f1(by)}" stroke="var(--own)" stroke-width="2.5"/>`;
  const la = Math.atan2(bx - fair[0], -(by - fair[1])) * 180 / Math.PI;
  const forces = force(fair[0], fair[1], la, 80, 'var(--own)', 'LINE 92 t', 'start')
    + force(fair[0], fair[1] - 40, 90, 70, 'var(--info)', 'STEERING ≈ 84 t · STERN TO STBD', 'start')
    + force(fair[0], fair[1] - 40, 180, 30, 'var(--muted)', '', 'start')
    + `<text x="${fair[0] - 8}" y="${fair[1] - 52}" text-anchor="end" font-size="12" font-weight="600" letter-spacing="0.06em" fill="var(--muted)">BRAKING 41 t ↓</text>`
    + force(ux + 6, uy + 10, 75, 50, 'var(--predict)', 'TUG HULL LIFT', 'start');
  const ch = chart({
    w: 1440, h: chartH, seed: 31, soundings: 40,
    land: [[[1300, 0], [1440, 0], [1440, chartH], [1340, chartH]]],
    shoal: [[[1180, 0], [1300, 0], [1340, chartH], [1220, chartH]]],
    channel: ['M380,0 L380,620', 'M760,0 L760,620'],
    extra: tanker + line,
    ships: ownShip(ux, uy, uh, 64, 25, { kind: 'tug' }), over: forces,
    scale: { px: 100, label: '50 m' }, legend: 'ESCORT MODE · INDIRECT · CLASS HEEL LIMIT 15° · NOT FOR NAVIGATION',
  });
  const heel = (() => {
    const c = 80, R = 64; let s = `<svg width="160" height="100" viewBox="0 0 160 100"><path d="${arcP(c, 84, R, -40, 40)}" fill="none" stroke="var(--rule)" stroke-width="7"/>
      <path d="${arcP(c, 84, R, -40, -25)}" fill="none" stroke="var(--warn)" stroke-width="7"/><path d="${arcP(c, 84, R, 25, 40)}" fill="none" stroke="var(--warn)" stroke-width="7"/>`;
    const [nx, ny] = pt(c, 84, R - 4, 9 * 25 / 15);
    s += `<line x1="${c}" y1="84" x2="${f1(nx)}" y2="${f1(ny)}" stroke="var(--ink)" stroke-width="2.5"/><circle cx="${c}" cy="84" r="4" fill="var(--ink)"/>
      <text x="38" y="56" text-anchor="middle" font-family="IBM Plex Mono" font-size="15" fill="var(--ink)">S 9°</text><text x="${c}" y="99" text-anchor="middle" font-size="9.5" letter-spacing="0.1em" fill="var(--muted)">HEEL · LIMIT 15°</text></svg>`;
    return s;
  })();
  const env = (() => { // escort envelope ("butterfly"): steering force vs tug angle
    let s = `<svg width="170" height="130" viewBox="0 0 170 130"><line x1="85" y1="8" x2="85" y2="122" stroke="var(--rule)"/><line x1="8" y1="100" x2="162" y2="100" stroke="var(--rule)"/>`;
    const lobe = side => { let d = ''; for (let a = 0; a <= 90; a += 6) { const r = 70 * Math.sin(a * Math.PI / 90) ** 0.8; const x = 85 + side * r * Math.sin(a * Math.PI / 180), y = 100 - r * Math.cos(a * Math.PI / 180) * 1.1; d += (a ? 'L' : 'M') + f1(x) + ',' + f1(y); } return d + ' Z'; };
    s += `<path d="${lobe(-1)}" fill="var(--ok)" opacity="0.18" stroke="var(--ok)"/><path d="${lobe(1)}" fill="var(--ok)" opacity="0.18" stroke="var(--ok)"/>
      <circle cx="${85 + 50}" cy="${100 - 36}" r="5" fill="var(--own)"/><text x="6" y="12" font-size="9" letter-spacing="0.08em" fill="var(--muted)">STEERING ↔</text><text x="6" y="124" font-size="9" letter-spacing="0.08em" fill="var(--muted)">8 kn · HEEL ≤ 15°</text></svg>`;
    return s;
  })();
  const tray = `<footer class="tray" style="height:${trayH}px">
  ${pn('<span class="c-port">Port Z-drive</span>', 'AZ · THRUST', `${azimuth({ order: 262, actual: 255, thrust: 0.62, thrustOrder: 0.7, size: 150, color: 'var(--port)', label: 'PUSHER · NOZZLE' })}${rd('AZ', '255°')}${rd('ENG', '1 280 rpm · 71 %')}`)}
  ${pn('<span class="c-stbd">Stbd Z-drive</span>', 'AZ · THRUST', `${azimuth({ order: 214, actual: 220, thrust: 0.45, thrustOrder: 0.45, size: 150, color: 'var(--stbd)', label: 'PUSHER · NOZZLE' })}${rd('AZ', '220°')}${rd('ENG', '1 120 rpm · 52 %')}`)}
  ${pn('Towline · winch', 'FWD · 150 t SWL', `<div class="row" style="gap:10px;align-items:center">${gauge({ v: 92, order: null, min: 0, max: 150, size: 150, label: 'TENSION', unit: 't', warnAbove: 120 })}
    <div class="col" style="gap:6px;width:150px">${rd('PAID OUT', '62 m')}${rd('LEAD', '42° off bow')}${rd('RENDER AT', '120 t', 'c-warn')}
    <div class="row" style="flex-wrap:wrap"><span class="cb on">BRAKE</span><span class="cb">RENDER</span><span class="cb">HEAVE</span><span class="cb">PAY</span><span class="cb warn">QUICK RELEASE</span></div></div></div>`)}
  ${pn('Stability', 'GIRTING WATCH', `${heel}${rd('GIRT RISK', 'LOW · line 42° off bow', 'c-ok')}`)}
  ${pn('Escort envelope', 'INDIRECT', `${env}${rd('MODE', 'INDIRECT → DIRECT below 5 kn')}`)}
  ${pn('Variant', 'VOITH TRACTOR', `<div class="row" style="gap:4px">${vspPad({ x: 0.55, y: -0.2, ox: 0.6, oy: -0.15, size: 104, label: 'FWD VSP' })}${vspPad({ x: 0.5, y: -0.25, ox: 0.6, oy: -0.15, size: 104, label: 'AFT VSP' })}</div>
    <div style="font-size:12px;line-height:1.35;width:210px" class="c-muted">Same station, VSP pitch pads instead of combi-levers: thrust in any direction in seconds, no slewing.</div>`)}
</footer>`;
  const body = `${ch.replace(`<svg width="1440" height="${chartH}"`, `<svg width="1440" height="${chartH}" style="position:absolute;left:0;top:0"`)}
  ${hud([[['HDG', '318.0', '°'], ['SOG', '8.1', 'kn'], ['ROT', '+2', '°/min'], ['COG', '358', '°'], ['DRIFT', '40', '°']],
    [['LINE', '92', 't', 'c-own'], ['HEEL', 'S 9', '°'], ['STEER', '84', 't'], ['UKC', '11.0', 'm']]],
    ['WIND 330° 14 kn', 'CURRENT est 180° 0.6 kn', 'DEPTH 22.4 m', 'ESCORT ORDER: "Hold 30° to port"', 'PWR 2 × 2.6 MW', '03:55 1×'])}
  ${btns(110, [['MENU'], ['PAUSE'], ['1×'], ['PRED', 1], ['H-UP'], ['3D'], ['FOLLOW', 1], ['FORCES', 1]])}
  ${chip(108, 'tug', 'ASD escort tug · 32 m', 'B 13 · T 5.6 · 2 × Z-drive 2.6 MW · 80 t bollard · escort notation')}
  <div class="flag info" style="left:16px;top:154px">PILOT: "Tug, steer me 30° to port" · tanker steering force 84 t</div>
  ${tray}`;
  return page({ palette: 'dusk', body });
}
const f1 = n => (Math.round(n * 10) / 10).toString();
function arcP(cx, cy, r, a0, a1) { const [x0, y0] = pt(cx, cy, r, a0), [x1, y1] = pt(cx, cy, r, a1); return `M${f1(x0)},${f1(y0)} A${r},${r} 0 0 1 ${f1(x1)},${f1(y1)}`; }

// ─────────────────────────────────────────────────────────── 05 Fast ferry, waterjets
export function ferry() {
  const H = 900, trayH = 262, chartH = H - trayH;
  const sx = 640, sy = 420, hdg = 52, L = 36, B = 12; // 1 px ≈ 2 m
  const track = []; for (let i = 0; i <= 8; i++) { const a = hdg + i * 4.2, r = i * 34; track.push([sx + r * Math.sin(a * Math.PI / 180), sy - r * Math.cos(a * Math.PI / 180)]); }
  const wake = `<path d="M${sx - 18},${sy + 12} q-160,60 -400,120" fill="none" stroke="var(--ink)" stroke-width="10" opacity="0.08"/>`;
  const traffic = `<path d="${hullPath(1010, 200, 232, 70, 12)}" fill="none" stroke="var(--ink)" stroke-width="1.4"/><line x1="1010" y1="200" x2="900" y2="285" stroke="var(--ink)" stroke-dasharray="3 3"/>
    <text x="1030" y="190" font-family="IBM Plex Mono" font-size="11" fill="var(--ink)">CPA 0.42 nm · TCPA 1:48</text>
    <circle cx="300" cy="180" r="5" fill="var(--stbd)"/><circle cx="1190" cy="430" r="5" fill="var(--port)"/>`;
  const ch = chart({
    w: 1440, h: chartH, seed: 41, soundings: 60,
    land: [[[0, 0], [260, 0], [200, 120], [80, 230], [0, 260]], [[1440, 520], [1260, 470], [1140, chartH], [1440, chartH]]],
    shoal: [[[260, 0], [420, 0], [330, 160], [160, 300], [0, 330], [0, 260], [80, 230], [200, 120]], [[1440, 420], [1220, 400], [1060, chartH], [1140, chartH], [1260, 470], [1440, 520]]],
    channel: ['M300,620 L1100,120', 'M520,620 L1260,250'],
    extra: wake + traffic,
    ships: ownShip(sx, sy, hdg, L, B, { kind: 'cat', track, ghosts: [[track[4][0], track[4][1], hdg + 17], [track[8][0], track[8][1], hdg + 34]] }),
    scale: { px: 100, label: '200 m' }, legend: 'HSC · 36 kn · PREDICTOR 2 min · NOT FOR NAVIGATION',
  });
  const jet = (lab, cls, b, bo, n, no) => pn(`<span class="${cls}">${lab}</span>`, 'BUCKET · NOZZLE', `<div class="row" style="gap:4px;align-items:center">${lever({ order: bo, actual: b, h: 160, w: 70, top: 'AH', bottom: 'AS', labels: [[1, 'UP'], [0, 'ZERO'], [-1, 'DOWN']] })}<div class="col" style="gap:2px">${rai({ order: no, actual: n, max: 30, w: 150, label: 'NOZZLE' })}${rd('JET', '2 × 9.1 MW · 94 %')}${rd('BUCKET', b > 0.9 ? 'UP · full ahead' : Math.round(b * 100) + ' %')}</div></div>`);
  const tray = `<footer class="tray" style="height:${trayH}px">
  ${jet('Port jets 1 + 2', 'c-port', 1, 1, 8, 10)}
  ${jet('Stbd jets 3 + 4', 'c-stbd', 1, 1, 8, 10)}
  ${pn('Motions', 'RIDE CONTROL', `<div class="row" style="gap:6px">${gauge({ v: -3.2, order: null, min: -10, max: 10, size: 120, label: 'HEEL', unit: '°', fmt: x => x.toFixed(1), sweep: 90 })}${gauge({ v: 0.8, order: null, min: -5, max: 5, size: 120, label: 'TRIM', unit: '°', fmt: x => x.toFixed(1), sweep: 90 })}</div>
    <div class="row"><span class="cb on">T-FOIL AUTO</span><span class="cb on">INTERCEPTORS</span></div>${rd('VERT ACC', '0.08 g · OK', 'c-ok')}`)}
  ${pn('Mode', 'HSC CODE', `<div class="col" style="gap:6px;width:220px">
    <div class="row"><span class="cb on">TRANSIT</span><span class="cb">HARBOUR</span><span class="cb">JOYSTICK</span></div>
    <div style="font-size:12.5px;line-height:1.4">At 36 kn the ferry covers <b>1 nm in 100 s</b>. Predictor horizon is stretched to 2 min and CPA alarms to 1 nm.</div>
    <div style="font-size:12.5px;line-height:1.4" class="c-muted">Turning at speed: heel outward is resisted by the hulls; watch passenger lateral acceleration.</div>
    ${rd('LAT ACC', '0.11 g', 'c-own')}<div class="meter"><i style="width:44%;background:var(--own)"></i></div></div>`)}
</footer>`;
  const body = `${ch.replace(`<svg width="1440" height="${chartH}"`, `<svg width="1440" height="${chartH}" style="position:absolute;left:0;top:0"`)}
  ${hud([[['HDG', '052.0', '°'], ['SOG', '35.8', 'kn'], ['ROT', '+126', '°/min'], ['COG', '049', '°'], ['STW', '36.4', 'kn']],
    [['HEEL', 'P 3.2', '°'], ['TRIM', '+0.8', '°'], ['LAT', '0.11', 'g'], ['UKC', '7.9', 'm']]],
    ['WIND 270° 16 kn', 'SEA Hs 1.2 m', 'DEPTH 11.2 m', 'CPA 0.42 nm', 'PWR 36.4/36.4 MW', '09:21 1×'])}
  ${btns(110, [['MENU'], ['PAUSE'], ['1×'], ['PRED 2 MIN', 1], ['H-UP', 1], ['SPLIT'], ['AIS', 1], ['FORCES']])}
  ${chip(108, 'cat', 'Fast ferry · 70 m catamaran', 'B 18 · T 2.6 · 4 × waterjet 9.1 MW · 36 kn service · HSC Code')}
  <div class="flag heavy" style="left:16px;top:154px">CPA 0.42 nm with crossing vessel · alter now</div>
  ${tray}`;
  return page({ palette: 'night', body });
}

// ─────────────────────────────────────────────────────────── 06 DP offshore
export function dp() {
  const css = `.grid6 { position:absolute; top:98px; left:0; right:0; bottom:0; display:grid; grid-template-columns: 1fr 1fr 360px; gap:10px; padding:10px 16px 12px; }
  .grid6 .pn { align-items:stretch; } .grid6 .pn svg { align-self:center; }
  .refs { display:grid; grid-template-columns: 1fr 1fr; gap:6px; }
  .ref { border:1px solid var(--rule); border-radius:3px; padding:6px 8px; display:flex; justify-content:space-between; font-size:12.5px; }
  .ref b { font-family: var(--font-num); font-weight:500; font-size:12px; }
  .ref.ok { border-color: var(--ok); } .ref.bad { border-color: var(--warn); color: var(--warn); }`;
  // position plot
  const pos = (() => {
    const c = 250; let s = `<svg width="500" height="640" viewBox="0 0 500 640">`;
    for (const [r, t] of [[45, '25 m'], [90, '50 m'], [180, '100 m']]) s += `<circle cx="${c}" cy="${c - 20}" r="${r}" fill="none" stroke="var(--rule)" stroke-dasharray="3 4"/><text x="${c + r + 3}" y="${c - 22}" font-family="IBM Plex Mono" font-size="10" fill="var(--muted)">${t}</text>`;
    s += `<circle cx="${c}" cy="${c - 20}" r="9" fill="none" stroke="var(--warn)" stroke-dasharray="2 2"/><text x="${c + 12}" y="${c - 4}" font-family="IBM Plex Mono" font-size="9" fill="var(--warn)">5 m alarm</text>`;
    let tr = ''; for (let i = 0; i < 80; i++) tr += `${i ? 'L' : 'M'}${f1(c + 82 + i * 4)},${f1(590 - 12 * Math.abs(Math.sin(i / 7) * Math.cos(i / 3.1)) - (i > 64 ? 10 : 0))}`;
    s += `<text x="${c - 240}" y="560" font-size="10" letter-spacing="0.1em" fill="var(--muted)">POSITION ERROR · LAST 10 MIN</text><line x1="${c - 240}" y1="590" x2="${c + 240}" y2="590" stroke="var(--rule)"/>
      <line x1="${c - 240}" y1="575" x2="${c + 240}" y2="575" stroke="var(--warn)" stroke-dasharray="3 3"/><path d="M${c - 240},588 ${tr.replace('M', 'L').slice(0)}" fill="none" stroke="var(--ink)" stroke-width="1.5"/>`;
    s += `<rect x="${c - 210}" y="20" width="160" height="70" fill="var(--land)" stroke="var(--landEdge)"/><text x="${c - 200}" y="40" font-size="12" fill="var(--ink)">PLATFORM · 500 m ZONE</text>`;
    const r = (() => { let a = 7, d = ''; for (let i = 0; i < 60; i++) { a = (a * 9301 + 49297) % 233280; const x = c + ((a / 233280) - 0.5) * 3 + Math.sin(i / 6) * 1.5, y = c - 20 + Math.cos(i / 5) * 2; d += (i ? 'L' : 'M') + f1(x) + ',' + f1(y); } return d; })();
    s += `<path d="${r}" fill="none" stroke="var(--predict)" stroke-width="1.2" opacity="0.8"/>`;
    s += `<path d="${hullPath(c + 8, c - 14, 22, 160, 36)}" fill="var(--hull)" stroke="var(--own)" stroke-width="2"/>`;
    s += `<line x1="${c - 10}" y1="${c - 20}" x2="${c + 10}" y2="${c - 20}" stroke="var(--ink)"/><line x1="${c}" y1="${c - 30}" x2="${c}" y2="${c - 10}" stroke="var(--ink)"/>`;
    s += force(c + 40, c + 150, 230 + 180, 40, 'var(--info)', 'WIND 24 kn', 'start') + force(c - 150, c + 150, 350, 34, 'var(--info)', 'CURRENT 1.1 kn', 'start');
    return s + '</svg>';
  })();
  // capability plot
  const cap = (() => {
    const c = 160; let s = `<svg width="320" height="320" viewBox="0 0 320 320">`;
    for (const r of [40, 80, 120]) s += `<circle cx="${c}" cy="${c}" r="${r}" fill="none" stroke="var(--rule)" stroke-dasharray="3 4"/>`;
    for (let a = 0; a < 360; a += 30) { const [x, y] = pt(c, c, 140, a); s += `<line x1="${c}" y1="${c}" x2="${f1(x)}" y2="${f1(y)}" stroke="var(--rule)"/><text x="${f1(pt(c, c, 150, a)[0])}" y="${f1(pt(c, c, 150, a)[1] + 3)}" text-anchor="middle" font-family="IBM Plex Mono" font-size="9" fill="var(--muted)">${a}</text>`; }
    const env = (k) => { let d = ''; for (let a = 0; a <= 360; a += 10) { const r = k * (120 - 52 * Math.abs(Math.sin(a * Math.PI / 180)) ** 1.4 + 6 * Math.cos(2 * a * Math.PI / 180)); const [x, y] = pt(c, c, r, a); d += (a ? 'L' : 'M') + f1(x) + ',' + f1(y); } return d + 'Z'; };
    s += `<path d="${env(1)}" fill="var(--ok)" opacity="0.14" stroke="var(--ok)" stroke-width="1.5"/><path d="${env(0.72)}" fill="none" stroke="var(--warn)" stroke-width="1.5" stroke-dasharray="5 3"/>`;
    const [wx, wy] = pt(c, c, 64, 230 - 22); s += `<circle cx="${f1(wx)}" cy="${f1(wy)}" r="6" fill="var(--own)"/><text x="${f1(wx) - 60}" y="${f1(wy) + 4}" font-size="10" fill="var(--own)">NOW · 24 kn</text>`;
    s += `<path d="${hullPath(c, c, 0, 34, 10)}" fill="var(--hull)" stroke="var(--own)"/>`;
    return s + '</svg>';
  })();
  const th = (lab, o, a, t, kind = 'az') => `<div class="col" style="align-items:center;gap:0">${kind === 'az' ? azimuth({ order: o, actual: a, thrust: t, size: 96, label: '' }) : tunnel({ v: t, order: t, w: 110, label: '' })}<span class="tag" style="text-align:center">${lab}</span><span class="mono" style="font-size:11px">${Math.round(Math.abs(t) * 100)} %</span></div>`;
  const body = `${hud([[['HDG', '022.0', '°'], ['SET', '022.0', '°'], ['POS ERR', '0.7', 'm', 'c-ok'], ['HDG ERR', '0.2', '°', 'c-ok'], ['SOG', '0.1', 'kn']],
    [['SURGE', '−0.02', 'm/s'], ['SWAY', '+0.04', 'm/s'], ['ROT', '0', '°/min'], ['UKC', '108', 'm']]],
    ['WIND 230° 24 kn · gusting 31', 'CURRENT 350° 1.1 kn', 'Hs 2.4 m', 'DP2 · 3 SWBD', 'PWR 4.9/8.0 MW', '22:10 1×'])}
  <div class="grid6">
    ${pn('Position plot', 'AUTO POSITION · 500 m ZONE', pos)}
    <section class="pn" style="align-items:stretch"><div class="tag"><span>Thrusters</span><b>ALLOCATION · BIASED</b></div>
      <div class="row" style="justify-content:space-around;margin-top:6px">${th('BT1', 0, 0, 0.42, 'tun')}${th('BT2', 0, 0, 0.38, 'tun')}${th('RETR AZ', 200, 196, 0.33)}</div>
      <div class="row" style="justify-content:space-around;margin-top:10px">${th('MAIN P', 120, 116, 0.58)}${th('MAIN S', 250, 246, 0.61)}</div>
      <div class="tag" style="margin-top:8px">Capability · intact vs worst single failure</div>${cap}
    </section>
    <section class="pn" style="align-items:stretch;gap:10px"><div class="tag"><span>DP control</span><b>K-POS STYLE</b></div>
      <div class="row" style="flex-wrap:wrap"><span class="cb">JOYSTICK</span><span class="cb">AUTO HDG</span><span class="cb on">AUTO POS</span><span class="cb">TRACK</span><span class="cb">FOLLOW TGT</span></div>
      <div class="tag">Position references</div>
      <div class="refs"><div class="ref ok"><span>DGNSS 1</span><b>0.6 m</b></div><div class="ref ok"><span>DGNSS 2</span><b>0.7 m</b></div><div class="ref ok"><span>CyScan</span><b>0.3 m</b></div><div class="ref bad"><span>HPR · REJECTED</span><b>4.1 m</b></div></div>
      <div class="tag">Consequence analysis</div>
      <div class="ref ok"><span>Worst single failure: SWBD A</span><b>OK</b></div>
      <div style="font-size:12.5px;line-height:1.4" class="c-muted">After losing SWBD A, the remaining thrust still holds 24 kn of wind on the quarter (dashed envelope). Above 30 kn: alarm.</div>
      <div class="tag">Instructor faults (training)</div>
      <div class="row" style="flex-wrap:wrap"><span class="chip warn">DRIFT-OFF</span><span class="chip">REF JUMP</span><span class="chip">THRUSTER FAIL</span><span class="chip">BLACKOUT</span><span class="chip">GYRO DRIFT</span></div>
      <div class="tag">Power</div>${rd('BUS A', '1.6 MW · 2 DG')}<div class="meter"><i style="width:55%"></i></div>${rd('BUS B', '1.9 MW · 2 DG')}<div class="meter"><i style="width:63%"></i></div>${rd('BUS C', '1.4 MW · 1 DG')}<div class="meter"><i style="width:48%"></i></div>
    </section>
  </div>
  <div class="shipchip" style="top:14px">${profile('psv', 92, 34)}<div><div class="nm">PSV · 89 m · DP2</div><div class="sp">B 19 · T 6.2 · 2 × azimuth 2.2 MW · 2 BT + 1 retractable</div></div></div>`;
  return page({ palette: 'night', body, css });
}

// ─────────────────────────────────────────────────────────── 07 Control library
export function library() {
  const css = `.lib { position:absolute; inset:0; padding:24px 28px; display:flex; flex-direction:column; gap:14px; }
  h1 { font-family: var(--font-label); font-weight:700; font-size:28px; } .sub { color: var(--muted); font-size:14px; max-width:980px; line-height:1.45; }
  .tiles { display:grid; grid-template-columns: repeat(5, 1fr); gap:12px; }
  .tile { border:1px solid var(--rule); border-radius:4px; padding:10px; display:flex; flex-direction:column; align-items:center; gap:6px; min-height:250px; }
  .tile .tag { align-self:stretch; } .tile p { font-size:12px; line-height:1.4; color: var(--muted); align-self:stretch; margin-top:auto; }
  .tri { display:flex; gap:22px; align-items:center; border:1px solid var(--rule); border-radius:4px; padding:12px 16px; }
  .tri .k { display:flex; gap:8px; align-items:center; font-size:13px; }
  .sw { display:flex; gap:4px; } .sw i { width:22px; height:22px; border-radius:3px; border:1px solid var(--rule); display:inline-block; }`;
  const tile = (t, inner, p) => `<div class="tile"><div class="tag">${t}</div>${inner}<p>${p}</p></div>`;
  const sw = pal => `<div class="sw">${['water', 'land', 'ink', 'own', 'port', 'stbd', 'predict', 'info', 'warn'].map(k => `<i style="background:${(PAL[pal])[k]}"></i>`).join('')}</div>`;
  const body = `<div class="lib"><h1>Control language · one pattern for every propulsor</h1>
  <div class="sub">Every control shows the same three things: the <b class="c-own">order</b> (amber handle you move), the <b>actual</b> state (ink needle or bar, which lags the way the real machinery does), and any <b class="c-warn">limit</b> (dashed or hatched: barred speed range, power cap, interlock). Port is red and starboard is green everywhere. Thrusters are cyan in plan views. A trainee who learns one station can read the others.</div>
  <div class="tri"><span class="tag">Key</span>
    <span class="k"><svg width="30" height="16"><rect x="2" y="2" width="26" height="12" rx="3" fill="none" stroke="var(--own)" stroke-width="2.5"/></svg>Order</span>
    <span class="k"><svg width="30" height="16"><line x1="2" y1="8" x2="28" y2="8" stroke="var(--ink)" stroke-width="3"/></svg>Actual</span>
    <span class="k"><svg width="30" height="16"><line x1="2" y1="8" x2="28" y2="8" stroke="var(--warn)" stroke-width="2" stroke-dasharray="4 2"/></svg>Limit · interlock</span>
    <span class="k"><svg width="30" height="16"><defs><pattern id="hz" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="5" stroke="var(--warn)" stroke-width="2"/></pattern></defs><rect width="30" height="16" fill="url(#hz)"/></svg>Barred · unavailable</span>
    <span style="margin-left:auto" class="row">${sw('night')}<span class="tag">NIGHT</span>${sw('dusk')}<span class="tag">DUSK</span>${sw('day')}<span class="tag">DAY</span></span></div>
  <div class="tiles">
    ${tile('Engine telegraph', telegraph({ order: 2, answer: 3, steps: ['NAV FULL', 'FULL', 'HALF', 'SLOW', 'DEAD SLOW', 'STOP', 'DEAD SLOW', 'SLOW', 'HALF', 'FULL', 'EMERG'], h: 190, w: 130 }), 'FPP ships. Answer-back arrow lags the handle while the engine slows, stops and restarts.')}
    ${tile('Shaft rpm', gauge({ v: 51, order: 58, min: -80, max: 80, size: 160, barred: [[42, 52], [-52, -42]], dead: [-24, 24] }), 'Barred range hatched (passed through quickly). Hatched centre: below minimum running rpm.')}
    ${tile('Helm · conventional ±35°', rai({ order: 20, actual: 12, max: 35, w: 200 }), 'Rudder follows at 2.3 °/s (SOLAS: 35° → 30° other side in 28 s).')}
    ${tile('Helm · Schilling ±70°', rai({ order: -65, actual: -58, max: 70, w: 200 }), 'High-lift rudders: same widget, scale set by the ship. Flap rudders ±45°.')}
    ${tile('CPP pitch', lever({ order: -0.5, actual: -0.3, h: 180, w: 80, labels: [[1, '100'], [0, '0'], [-1, '100']], limit: 0.85 }), 'Constant shaft rpm, pitch reverses in about 15–20 s. Dashed: PMS power cap.')}
    ${tile('Azimuth combi-lever', azimuth({ order: 135, actual: 120, thrust: 0.55, thrustOrder: 0.7, size: 150 }), 'ASD tugs, Z-drives, Azipods. Ring handle = azimuth order, dot = thrust order, arrow = actual.')}
    ${tile('Voith Schneider pad', vspPad({ x: -0.4, y: 0.5, ox: -0.5, oy: 0.6, size: 140 }), 'Cycloidal propeller: thrust vector set directly in x/y, reaches it in seconds.')}
    ${tile('Waterjet', `<div class="row" style="align-items:center">${lever({ order: -0.2, actual: 0.1, h: 150, w: 60, labels: [] })}${rai({ order: 25, actual: 18, max: 30, w: 140, label: 'NOZZLE' })}</div>`, 'Bucket lever (ahead ↔ astern through zero) plus nozzle angle. Bucket down with the nozzle over gives sideways thrust.')}
    ${tile('Tunnel thruster', `<div class="col">${tunnel({ v: -0.6, order: -0.7, w: 190, label: 'BOW 1', eff: 0.55 })}${tunnel({ v: 0.3, order: 0.3, w: 190, label: 'STERN' })}</div>`, 'Effectiveness shown live: tunnel thrusters lose most of their side force above 3–4 kn.')}
    ${tile('Tow winch', gauge({ v: 104, order: null, min: 0, max: 150, size: 150, label: 'TENSION', unit: 't', warnAbove: 120 }), 'Tugs. Brake / render / quick-release, with a girting watch on the heel.')}
  </div></div>`;
  return page({ palette: 'night', body, css });
}
import { PALETTES as PAL } from './lib.mjs';

// ─────────────────────────────────────────────────────────── 08 Mobile
export function mobile() {
  const css = `.hud { padding: 8px 12px 6px; } .hud .primary .val { font-size: 20px; } .hud .secondary .val { font-size: 16px; } .hud-row { gap: 4px 14px; } .hud .env { font-size: 10px; gap: 2px 12px; }
  .tray { padding: 8px 10px 22px; gap:6px; } .pn { padding:6px; }`;
  const a = (() => {
    const W = 390, H = 844, trayH = 310, chartH = H - trayH;
    const ch = chart({ w: W, h: chartH, seed: 51, soundings: 26,
      land: [[[390, 0], [390, chartH], [330, chartH], [300, 300], [320, 0]]], shoal: [[[270, 0], [320, 0], [300, 300], [330, chartH], [250, chartH], [250, 300]]],
      extra: `<rect x="230" y="160" width="10" height="120" fill="var(--landEdge)"/><text x="160" y="152" font-size="10" font-style="italic" fill="var(--muted)">Jetty 2</text>` + force(110, 330, 330, 30, 'var(--warn)', 'STERN → PORT', 'end'),
      ships: ownShip(150, 300, 30, 70, 13, { track: [[150, 300], [180, 250], [205, 220]], ghosts: [[205, 220, 50]] }), scale: { px: 60, label: '200 m' }, legend: '' });
    const body = `${ch.replace(`<svg width="${W}" height="${chartH}"`, `<svg width="${W}" height="${chartH}" style="position:absolute;left:0;top:0"`)}
    ${hud([[['HDG', '030', '°'], ['SOG', '3.1', 'kn'], ['ROT', '+6', '°/m']], [['FWD', '▸0.04', '', 'c-stbd'], ['AFT', '◂0.11', '', 'c-port'], ['UKC', '2.1', 'm']]], ['WIND 220° 18', 'ME 14 rpm AS'])}
    <nav class="mapbtns" style="top:96px;left:12px"><span class="mb">MENU</span><span class="mb on">PRED</span><span class="mb on">FORCES</span></nav>
    <footer class="tray" style="height:${trayH}px;flex-direction:column;align-items:stretch">
      <div class="row" style="gap:6px;justify-content:center">
        ${pn('Telegraph', '', telegraph({ order: 7, answer: 5, steps: ['NAV', 'FULL', 'HALF', 'SLOW', 'D SLOW', 'STOP', 'D SLOW', 'SLOW', 'HALF', 'FULL', 'EMERG'], h: 196, w: 104 }))}
        <div class="col" style="gap:6px">${pn('Helm', 'FU', rai({ order: -20, actual: -14, max: 35, w: 220 }))}
        <div class="pn" style="flex-direction:row;gap:10px;justify-content:space-between;align-items:center"><div class="col" style="gap:3px">${rd('SHAFT', '14 AS')}${rd('AIR', '24 bar · ≈ 9')}</div><span class="chip warn">BARRED 42–52</span></div></div>
      </div>
      <div class="row" style="justify-content:center"><span class="cb on">TUGS</span><span class="cb">VIEW</span><span class="cb">3D</span><span class="cb">COACH</span></div>
    </footer>`;
    return page({ palette: 'night', w: W, h: H, body, css });
  })();
  const b = (() => {
    const W = 390, H = 844;
    const row = (t, g, n, s, sel) => `<div style="border:1px solid ${sel ? 'var(--own)' : 'var(--rule)'};border-radius:4px;padding:8px 10px;display:flex;flex-direction:column;gap:2px">
      ${profile(t, 340, 50)}<div style="font-family:var(--font-label);font-weight:700;font-size:16px">${n}</div><div class="mono" style="font-size:10.5px;color:var(--muted)">${s}</div>${layoutGlyph(g, 340, 36)}</div>`;
    const body = `<div style="position:absolute;inset:0;background:var(--panelSolid);padding:16px 14px;display:flex;flex-direction:column;gap:10px">
      <div style="display:flex;justify-content:space-between;align-items:center"><span style="font-family:var(--font-label);font-weight:700;font-size:24px">Fleet</span><span class="mb">CLOSE</span></div>
      <div style="display:flex;gap:6px;overflow:hidden"><span class="chip">ALL</span><span class="chip">AZIPOD</span><span class="chip on">SHAFT + RUDDER</span><span class="chip">CPP</span><span class="chip">ASD</span><span class="chip">VSP</span><span class="chip">JET</span></div>
      ${row('vlcc', 'fpp', 'VLCC · KVLCC2 hull', '320 m · 1 × FPP · 2-stroke · rudder', 1)}
      ${row('container', 'fpp-bt', 'Container 14 000 TEU · DTC', '355 m · 1 × FPP · rudder · 2 BT', 0)}
      ${row('bulk', 'fpp', 'Panamax bulker', '225 m · 1 × FPP · rudder', 0)}
      <div class="tag" style="margin-top:2px">Load case</div>
      <div class="row"><span class="cb on" style="flex:1">LADEN</span><span class="cb" style="flex:1">BALLAST</span></div>
      <div style="height:44px;border:1.5px solid var(--own);border-radius:3px;display:flex;align-items:center;justify-content:center;font-family:var(--font-label);font-weight:700;letter-spacing:0.1em;margin-top:auto">LOAD SHIP</div></div>`;
    return page({ palette: 'night', w: W, h: H, body });
  })();
  const comp = page({ palette: 'night', w: 1440, h: 900, css: `.ph { position:absolute; top:28px; width:390px; height:844px; border-radius:36px; overflow:hidden; box-shadow: 0 0 0 10px #000, 0 0 0 11px var(--rule); }
    .cap { position:absolute; top:360px; width:380px; font-size:15px; line-height:1.5; } .cap h2 { font-family:var(--font-label); font-weight:700; font-size:26px; margin-bottom:8px; }`,
    body: `<iframe class="ph" style="left:290px;border:0" src="08-mobile-a.html"></iframe><iframe class="ph" style="left:760px;border:0" src="08-mobile-b.html"></iframe>
    <div class="cap" style="left:1190px;width:230px"><h2>Phone</h2>The station reflows rather than shrinks. Telegraph and helm stay full height for thumbs, gauges become readouts, and tug orders and coach notes move behind tabs. Touch targets are at least 44 px. The fleet becomes a bottom sheet filtered by propulsion.</div>
    <div class="cap" style="left:30px;width:230px"><h2>Same physics</h2>Phone, desktop and the offline file share the one model. Only the station layout changes with the viewport.</div>` });
  return [{ html: a, suffix: '-a', noshot: true }, { html: b, suffix: '-b', noshot: true }, { html: comp }];
}
