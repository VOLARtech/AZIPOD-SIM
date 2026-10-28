// Settings sheet: pilot card / wheelhouse poster, validation, sea trials, model notes.
import MODELS from '../view3d/models/models.json';
import { SHIP, propulsionSummary } from '../physics/ship';
import type { Manoeuvre } from '../physics/validation-mmg';
import type { Poster, Path } from '../physics/poster';
import type { ValRow } from '../physics/validation';
import type { TrialResult } from '../physics/trials';
import { C } from './draw';

const $ = (id: string) => document.getElementById(id)!;
const f = (x: number, d = 0) => x.toFixed(d);

let lastPoster: Poster | null = null;
export function renderPoster(p: Poster) {
  lastPoster = p;
  const turn = p.turning.map(t => `<tr><td>${t.label}</td><td>${f(t.adv / SHIP.L, 2)} L</td><td>${f(t.tr / SHIP.L, 2)} L</td><td>${f(t.td / SHIP.L, 2)} L</td><td>${f(t.t90)} / ${f(t.t180)} / ${f(t.t360)} s</td></tr>`).join('');
  const stop = p.stopping.map(s => `<tr><td>${s.label}</td><td>${f(s.track / SHIP.L, 2)} L</td><td>${f(s.head / SHIP.L, 2)} L</td><td>${f(Math.abs(s.side) / SHIP.L, 2)} L ${s.side < 0 ? 'P' : 'S'}</td><td>${f(s.time)} s</td></tr>`).join('');
  const sh = SHIP.pods[0].shaft, tel = sh && !sh.prop.cpp ? ['Dead slow', 'Slow', 'Half', 'Full', 'Nav full'] : null;
  const spd = p.speedTable.map((s, i) => `<tr><td>${tel ? `${tel[i]} · ${f(s.rpm * sh!.engine.n * 60)} rpm` : `${f(s.rpm * 100)} %`}</td><td>${f(s.kn, 1)} kn</td></tr>`).join('');
  const thr = SHIP.bowThruster.Tmax > 0 ? p.thruster.map(t => `<tr><td>${t.kn} kn</td><td>${f(t.eff * 100)} %</td></tr>`).join('') : '';
  const helmWord = sh ? (sh.rudder ? `rudder ${f((sh.rudder.max * 180 / Math.PI))}°` : 'helm') : 'pods 35°';
  const pods = (SHIP.station ?? 'azipod') === 'azipod';
  const detail = pods
    ? ` · ${f(SHIP.pods[0].Tb / 9.81e3)} t bollard each · switchboard ${f(SHIP.powerAvail / 1e6, 1)} MW for propulsion · azimuth 7.5°/s · full ahead → full astern 60 s · astern max ${f(SHIP.asternMax * 100)} % · reversal blocked above ${f(SHIP.revInterlock * 100)} % rpm`
    : sh ? ` · ${sh.engine.type === 'direct2s' ? `direct-reversing, ${f(sh.engine.n * 60)} rpm MCR, minimum ${f(sh.engine.nMin * sh.engine.n * 60)} rpm${sh.engine.barred ? `, barred ${f(sh.engine.barred[0] * sh.engine.n * 60)}–${f(sh.engine.barred[1] * sh.engine.n * 60)} rpm` : ''}` : ''}${sh.rudder ? ` · rudder ${f(sh.rudder.A, 1)} m², ±${f(sh.rudder.max * 180 / Math.PI)}° at ${f(sh.rudder.rate * 180 / Math.PI, 1)} °/s` : ''}` : '';
  const sq12 = p.squatTable.filter(s => s.hT === 0), sq15 = p.squatTable.filter(s => s.hT === 1);
  const sq = sq12.map((s, i) => `<tr><td>${s.kn} kn</td><td>${f(s.sq, 2)} m</td><td>${f(sq15[i].sq, 2)} m</td></tr>`).join('');
  const wind = p.windDrift.map(w => `<tr><td>${w.kn} kn</td><td>${f(w.drift, 2)} kn</td></tr>`).join('');
  $('poster').innerHTML = `
    <p class="note">${SHIP.name} · LOA ${SHIP.LOA} m · Lpp ${SHIP.L} m · B ${SHIP.B} m · T ${SHIP.T} m even keel${SHIP.load ? ` (${SHIP.load})` : ''} · ${propulsionSummary(SHIP)}${detail}.</p>
    <div class="poster-grid">
      <div><h3>Turning circles · ${helmWord}</h3><canvas class="pcanvas" id="pc-turn"></canvas>
        <div class="tw"><table class="ptable"><tr><th></th><th>Advance</th><th>Transfer</th><th>Tactical Ø</th><th>90/180/360°</th></tr>${turn}</table></div></div>
      <div><h3>Stopping · track reach</h3><canvas class="pcanvas" id="pc-stop"></canvas>
        <div class="tw"><table class="ptable"><tr><th></th><th>Track</th><th>Head</th><th>Side</th><th>Time</th></tr>${stop}</table></div></div>
      <div><h3>Speed by ${tel ? 'telegraph' : 'lever'}</h3><table class="ptable"><tr><th>${tel ? 'Order' : sh?.prop.cpp ? 'Pitch' : 'rpm'}</th><th>Speed, deep</th></tr>${spd}</table>
        ${thr ? `<h3>Bow thruster vs speed</h3><table class="ptable"><tr><th>Ahead</th><th>Effect</th></tr>${thr}</table>` : ''}</div>
      <div><h3>Squat at h/T 1.2 (Barrass)</h3><table class="ptable"><tr><th>Speed</th><th>Open water</th><th>Confined channel</th></tr>${sq}</table>
        <h3>Dead-ship drift, beam wind</h3><table class="ptable"><tr><th>Wind</th><th>Drift</th></tr>${wind}</table></div>
    </div>
    <p class="note">Performance may differ from these figures in other loading, trim, wind, current and bottom conditions.</p>`;
  drawPosterPlots();
}
export function drawPosterPlots() {
  if (!lastPoster) return;
  const cols = [C.own, C.predict, C['alt-crash']];
  plot('pc-turn', lastPoster.paths.turn, cols);
  plot('pc-stop', lastPoster.paths.stop, cols);
}
function plot(id: string, paths: Path[], cols: string[]) {
  const cv = document.getElementById(id) as HTMLCanvasElement | null;
  if (!cv) return;
  const dpr = Math.min(2, devicePixelRatio || 1), Wc = cv.clientWidth, Hc = cv.clientHeight;
  cv.width = Wc * dpr; cv.height = Hc * dpr;
  const g = cv.getContext('2d')!;
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.fillStyle = C.water; g.fillRect(0, 0, Wc, Hc);
  let xmin = 0, xmax = 0, ymin = 0, ymax = 0;
  for (const p of paths) for (const [x, y] of p.pts) { xmin = Math.min(xmin, x); xmax = Math.max(xmax, x); ymin = Math.min(ymin, y); ymax = Math.max(ymax, y); }
  const pad = 26, span = Math.max(xmax - xmin, ymax - ymin, SHIP.L) * 1.1;
  const s = (Math.min(Wc, Hc) - 2 * pad) / span;
  const cx = (xmin + xmax) / 2, cy = (ymin + ymax) / 2;
  const X = (x: number) => Wc / 2 + (x - cx) * s, Y = (y: number) => Hc / 2 - (y - cy) * s;
  // grid in ship lengths
  g.strokeStyle = C.grid; g.lineWidth = 1; g.font = `11px ${C.fontNum}`; g.fillStyle = C.muted;
  for (let k = Math.ceil((cx - span / 2) / SHIP.L); k * SHIP.L <= cx + span / 2; k++) { g.beginPath(); g.moveTo(X(k * SHIP.L), 0); g.lineTo(X(k * SHIP.L), Hc); g.stroke(); }
  for (let k = Math.ceil((cy - span / 2) / SHIP.L); k * SHIP.L <= cy + span / 2; k++) { g.beginPath(); g.moveTo(0, Y(k * SHIP.L)); g.lineTo(Wc, Y(k * SHIP.L)); g.stroke(); }
  g.fillText('grid = 1 L', 6, Hc - 6);
  paths.forEach((p, i) => {
    g.strokeStyle = cols[i % cols.length]; g.lineWidth = 2;
    g.beginPath(); p.pts.forEach(([x, y], j) => (j ? g.lineTo(X(x), Y(y)) : g.moveTo(X(x), Y(y)))); g.stroke();
    g.fillStyle = cols[i % cols.length];
    for (const m of p.marks) { g.beginPath(); g.arc(X(m.x), Y(m.y), 3, 0, 7); g.fill(); g.fillText(m.label, X(m.x) + 5, Y(m.y) - 4); }
    g.fillText(p.label, 6, 14 + i * 14);
  });
  g.fillStyle = C.ink; g.beginPath(); g.arc(X(0), Y(0), 3.5, 0, 7); g.fill();
}

export function renderValidation(v: { rows: ValRow[]; serviceKn: number; approachRpm: number; rankOk: boolean }, mmg?: Manoeuvre[] | null) {
  const mm = mmg ? `<p class="note"><b>${SHIP.name}: this simulator against the published MMG model.</b> The hull, propeller and rudder coefficients are the KVLCC2 captive-test values of Yasukawa &amp; Yoshimura (2015). An independent implementation of their equations (no code shared with the simulator) and the simulator run the same manoeuvres from 15.5 kn at constant propeller revolutions, rudder at 2.32 °/s.</p>
    <div class="tw"><table class="trials"><tr><td class="n">Manoeuvre</td><td class="n">MMG</td><td class="n">Simulator</td><td class="n">Diff.</td></tr>${mmg.map(r => `<tr><td>${r.label}</td><td>${f(r.ref, 2)} ${r.unit}</td><td>${f(r.sim, 2)} ${r.unit}</td><td class="${Math.abs(r.sim - r.ref) <= 0.03 * Math.abs(r.ref) + 0.3 ? 'pass' : 'fail'}">${r.sim >= r.ref ? '+' : ''}${f((r.sim - r.ref) / r.ref * 100, 1)} %</td></tr>`).join('')}</table></div>
    <p class="note">The rudder normal force in the simulator is capped where a real rudder stalls (about 35° effective angle for this one); the published model has no stall, so the two part only when the inflow angle is very large. Below about 1.5 m/s, at drift beyond about 35° and in very tight turns the simulator hands over from the MMG polynomials to its low-speed cross-flow model, which the MMG coefficients were never measured for.</p><h3>Azipod stopping tests (277 m)</h3>` : '';
  const max = Math.max(...v.rows.map(r => Math.max(r.published, r.model)));
  const rows = v.rows.map(r => {
    const ok = Math.abs(r.err) <= 0.15, mid = Math.abs(r.err) <= 0.3;
    return `<tr><td>${r.label}</td><td>${f(r.published, 1)}</td><td>${f(r.model, 2)}</td>
      <td class="${ok ? 'pass' : mid ? '' : 'fail'}">${r.err >= 0 ? '+' : ''}${f(r.err * 100)} %</td>
      <td style="min-width:110px"><span class="vbar" style="width:${(r.published / max * 100).toFixed(0)}px;background:${C.muted}"></span><br><span class="vbar" style="width:${(r.model / max * 100).toFixed(0)}px;background:${C.own}"></span></td></tr>`;
  }).join('');
  $('validation').innerHTML = mm + `
    <p class="note">The same code, built for the published 277.5 × 43.2 × 12.0 m, Cb 0.79 test ship, approaching at 12 kn (rpm ${f(v.approachRpm * 100)} %, service ${f(v.serviceKn, 1)} kn). Track reach to 0.5 kn, in ship lengths. Grey bars are the model tests, orange is this simulator.</p>
    <div class="tw"><table class="trials"><tr><td class="n">Method</td><td class="n">Tests</td><td class="n">Model</td><td class="n">Error</td><td></td></tr>${rows}</table></div>
    <p class="note">Methods that reverse the propellers land within 5 %. Swinging the pods through 180° stops about 20 % long. The two cases that hold rpm with the pods athwartships stop 50–65 % long: the model still under-predicts the braking force of a working propeller in pure cross-flow, which makes the pods-across method look less effective here than in the tank. The paper leaves the rpm after the swing and for the reversal open; this run reads both as full rpm.</p>`;
}

export function renderTrials(deep: TrialResult[], shallow: TrialResult[], depth: number) {
  const byKey = new Map(shallow.map(r => [r.key, r] as [string, TrialResult]));
  $('trials').innerHTML = `<thead><tr><td></td><td class="n">Deep</td><td class="n">h/T ${f(depth / SHIP.T, 1)}</td><td class="n">IMO</td></tr></thead><tbody>` +
    deep.map(r => `<tr><td>${r.label}${r.note ? `<div class="n">${r.note}</div>` : ''}</td><td class="v">${r.value}</td><td class="v n">${byKey.get(r.key)?.value ?? ''}</td><td>${r.limit ? `<span class="${r.pass ? 'pass' : 'fail'}">${r.pass ? 'PASS' : 'FAIL'}</span><div class="n">${r.limit}</div>` : ''}</td></tr>`).join('') + '</tbody>';
}

export function renderModel(h: { m: number; Xud: number; Yvd: number; Nrd: number; Yrd: number; prime: Record<string, number> }) {
  const p = h.prime, e = (x: number) => x.toExponential(3).replace('e', ' e');
  $('shipline').textContent = `${SHIP.name} · Lpp ${SHIP.L} m · B ${SHIP.B} m · T ${SHIP.T} m · Cb ${SHIP.Cb.toFixed(2)} · Δ ${f(h.m / 1e3)} t · ${propulsionSummary(SHIP)}`;
  const shaft = SHIP.pods.find(q => q.kind === 'shaft')?.shaft;
  $('model').innerHTML = `
    <p>Three degrees of freedom in body axes: (M<sub>RB</sub> + M<sub>A</sub>) ν̇ = τ − C<sub>RB</sub>(ν)ν − C<sub>A</sub>(ν<sub>r</sub>)ν<sub>r</sub> − D(ν<sub>r</sub>) + M<sub>A</sub>ν̇<sub>c</sub>, ν<sub>r</sub> through the water. Added mass and linear derivatives from Clarke, Gedling and Hine (1983); C<sub>A</sub> carries the Munk moment, so only the viscous remainder of Clarke's derivatives goes into D. Cross-flow drag along 26 strips uses the local current. ITTC-57 resistance. RK4 at 20 Hz.</p>
    ${SHIP.note ? `<p><b>This ship.</b> ${SHIP.note}</p>` : ''}
    ${modelCredit(SHIP.id)}
    ${SHIP.mmg ? `<p><b>Hull (MMG).</b> At manoeuvring speed the hull forces are the MMG standard method's third-order polynomials in v′ and r′ with this ship's published captive-test derivatives (${SHIP.mmg.source}); body origin at midship, CG ${SHIP.mmg.xG} m ahead. Below about 1.5 m/s, beyond about 35° drift and in very tight turns the simulator blends into the low-speed model (MMG linear derivatives with the ideal-fluid part removed, plus strip cross-flow drag).</p>` : ''}
    ${shaft ? `<p><b>Propeller and rudder.</b> Four-quadrant propeller from the MMG thrust curve K<sub>T</sub>(J) = k₀ + k₁J + k₂J², written so a stopped propeller in flow is a drag, a reversed one meeting headway brakes harder, and going astern on astern turns loses thrust; the same form for torque, so a stopped engine's propeller windmills. Transverse thrust (paddle-wheel effect) ${f(shaft.prop.kTTas * 100)} % of thrust astern, a right-hand fixed propeller walking the stern to port. MMG rudder: inflow from the propeller slipstream on D/H of the span, flow straightening γ<sub>R</sub>, hull interaction t<sub>R</sub>, a<sub>H</sub>, x<sub>H</sub>; normal force capped where a ${shaft.rudder?.type ?? 'conventional'} rudder stalls. With sternway the rudder works backwards and weaker; with the propeller astern it sits in blanketed flow.</p>
    ${shaft.engine.type === 'direct2s' ? `<p><b>Engine.</b> Direct-reversing two-stroke. The telegraph sets a governor speed; it never settles in the barred range and does not run below its minimum speed. Stop and reverse means fuel off, wait until the shaft is slow enough, then starting air in the new direction until firing speed. Each start takes air from the receivers (${shaft.engine.air!.pMax} bar, no start below ${shaft.engine.air!.pMin} bar, refilling at ${shaft.engine.air!.refill} bar/min); three failed starts block the sequence. Against heavy headway an astern start can stall. Shaft speed comes from engine torque against the propeller's, through the shaft-line inertia.</p>` : ''}` : ''}
    ${(SHIP.station ?? 'azipod') === 'azipod' ? `<p><b>Pods.</b> Linear K<sub>T</sub>(J) thrust; a reversed propeller meeting oncoming flow brakes like a blocked disk; strut and pod body act as a plate in cross-flow; the propeller destroys the cross-flow momentum of the water it swallows (oblique actuator disk, coefficient calibrated on the 277 m stopping tests); hull-wash and pod-to-pod wake losses; build tolerances (starboard unit slews 5 % faster, 2.5 % less thrust, 0.5° azimuth offset) so crash stops sheer. Control system: 7.5°/s azimuth, 60 s reversal, reverse interlock, astern cap, shared switchboard, berthing split.</p>` : ''}
    <p><b>Harbour.</b> Barrass squat feeds the under-keel clearance and the shallow-water factors; grounding is soft-bottom friction. Bank suction draws the stern toward a near bank, rising with U² and in shallow water. Pod wash striking a wall reflects onto the hull. Six mooring lines (HMPE, 100 t MBL) on winches that stall at 16 t, render at 61 t. Two 40 t tugs with power ramps, a 60 s push/pull swap and loss of grip above 6 kn. Fenders are discrete cone units with a buckling curve and hysteresis; steel on concrete loses most of its energy.</p>
    <p><b>What the bridge sees.</b> Readouts and the drawn ship come from simulated sensors: DGNSS at the bridge antenna with noise and a wandering bias, gyro with lag, rate-of-turn gyro, doppler log, anemometer, and a current estimated from ground and water velocity. The AIS feed option adds smoothing and 2 s latency, as on a PPU plugged into the AIS pilot plug. The onboard predictor runs from those readings with a model a few percent off.</p>
    <div class="tw"><table>
      <tr><td>X<sub>u̇</sub>, Y<sub>v̇</sub>, N<sub>ṙ</sub></td><td>${e(h.Xud)} kg, ${e(h.Yvd)} kg, ${e(h.Nrd)} kg·m²</td></tr>
      <tr><td>Y<sub>ṙ</sub> = N<sub>v̇</sub></td><td>${e(h.Yrd)} kg·m</td></tr>
      <tr><td>Clarke N′<sub>v</sub>, N′<sub>r</sub></td><td>${e(p.Nv_p)}, ${e(p.Nr_p)}</td></tr>
      <tr><td>Munk part (Y′<sub>v̇</sub> − X′<sub>u̇</sub>)</td><td>${e(p.munk)}</td></tr>
      <tr><td>Viscous N′<sub>v</sub>, N′<sub>r</sub></td><td>${e(p.NvD)}, ${e(p.NrD)}</td></tr>
    </table></div>`;
}

/** Credit line for the 3D model a ship is drawn with (CC Attribution: title, author, source, licence). */
export function modelCredit(id: string) {
  const m = Object.values(MODELS as Record<string, { ships: string[]; credit: { title: string; author: string; license: string; url: string } }>).find(x => x.ships.includes(id));
  if (!m) return '';
  const c = m.credit;
  return `<p><b>3D model.</b> “<a href="${c.url}" target="_blank" rel="noopener">${c.title}</a>” by ${c.author} on Sketchfab, ${c.license === 'CC Attribution' ? '<a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noopener">CC BY 4.0</a>' : c.license}; fitted to this ship's length, beam and draught, simplified, its own propellers and rudders replaced by the simulator's. It shows the type, not this exact ship. Offline single-file copy: drawn procedurally.</p>`;
}
