// Procedural bridge audio (Web Audio, no samples) and haptics (Vibration API).
// Continuous layers follow the simulation: pod motors and propeller churn per pod (panned port /
// starboard), bow thruster, azimuth servo, water past the hull, wind. One-shot cues come from
// simulation events: landings and collisions, grounding, parted lines, alerts, lever detents.
import type { PodSpec } from '../physics/ship';
import type { PodState } from '../physics/sim';
import { SHIP } from '../physics/ship';
import { LINE } from '../physics/mooring';
import { S } from './state';

type Ctx = AudioContext;
let ac: Ctx | null = null, master: GainNode, noiseBuf: AudioBuffer, brownBuf: AudioBuffer;

// ---------------------------------------------------------------- building blocks
function makeNoise(c: Ctx, brown: boolean) {
  const b = c.createBuffer(1, c.sampleRate * 2, c.sampleRate), d = b.getChannelData(0);
  let last = 0;
  for (let i = 0; i < d.length; i++) {
    const w = Math.random() * 2 - 1;
    if (brown) { last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; } else d[i] = w;
  }
  return b;
}
function noise(c: Ctx, brown = false) {
  const s = c.createBufferSource(); s.buffer = brown ? brownBuf : noiseBuf; s.loop = true;
  s.playbackRate.value = 0.9 + Math.random() * 0.2; s.start(c.currentTime, Math.random() * 1.5);
  return s;
}
const filt = (c: Ctx, type: BiquadFilterType, f: number, q = 0.7) => { const b = c.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = q; return b; };
const gain = (c: Ctx, v = 0) => { const g = c.createGain(); g.gain.value = v; return g; };
const set = (p: AudioParam, v: number, tc = 0.12) => p.setTargetAtTime(v, ac!.currentTime, tc);

interface PodVoice { motor: OscillatorNode; motor2: OscillatorNode; whine: OscillatorNode; mg: GainNode; wg: GainNode; churn: GainNode; churnF: BiquadFilterNode; thrum: GainNode; lfo: OscillatorNode; servo: GainNode; servoO: OscillatorNode; pan: StereoPannerNode }
let pods: PodVoice[] = [];
let bt: { g: GainNode; f: BiquadFilterNode; o: OscillatorNode; og: GainNode };
let water: { g: GainNode; f: BiquadFilterNode }, wind: { g: GainNode; f: BiquadFilterNode };
let scrape: { g: GainNode; f: BiquadFilterNode }, rumble: { g: GainNode };

function build(c: Ctx) {
  noiseBuf = makeNoise(c, false); brownBuf = makeNoise(c, true);
  const comp = c.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 4;
  master = gain(c, 0); master.connect(comp).connect(c.destination);
  buildVoices(c);
  { // bow thruster: tunnel roar + motor tone, forward = centre
    const g = gain(c), f = filt(c, 'bandpass', 220, 1.1); noise(c, true).connect(f).connect(g).connect(master);
    const o = c.createOscillator(); o.type = 'sawtooth'; const og = gain(c), lp = filt(c, 'lowpass', 300);
    o.connect(lp).connect(og).connect(master); o.start();
    bt = { g, f, o, og };
  }
  { const g = gain(c), f = filt(c, 'lowpass', 500); noise(c, true).connect(f).connect(g).connect(master); water = { g, f }; }
  { const g = gain(c), f = filt(c, 'bandpass', 900, 0.5); noise(c).connect(f).connect(g).connect(master); wind = { g, f }; }
  { const g = gain(c), f = filt(c, 'bandpass', 1400, 1.5); noise(c).connect(f).connect(g).connect(master); scrape = { g, f }; }
  { const g = gain(c), f = filt(c, 'lowpass', 90); noise(c, true).connect(f).connect(g).connect(master); rumble = { g }; }
}

/** One voice per propulsion unit, panned by side; rebuilt when the ship changes. */
let voiceShip = '', voicePans: StereoPannerNode[] = [];
function buildVoices(c: Ctx) {
  for (const p of voicePans) p.disconnect();
  voicePans = []; voiceShip = SHIP.id; lastAlpha = []; lastMode = [];
  pods = SHIP.pods.map((u, i) => {
    const pan = c.createStereoPanner(); pan.pan.value = SHIP.pods.length === 1 ? 0 : u.y < 0 || (u.y === 0 && i === 0) ? -0.55 : 0.55; pan.connect(master);
    voicePans.push(pan);
    // motor: low sawtooth pair through a low-pass, plus a faint converter whine
    const mg = gain(c), lp = filt(c, 'lowpass', 260, 1.2);
    const motor = c.createOscillator(); motor.type = 'sawtooth';
    const motor2 = c.createOscillator(); motor2.type = 'triangle';
    motor.connect(lp); motor2.connect(lp); lp.connect(mg).connect(pan);
    const whine = c.createOscillator(); whine.type = 'sine'; const wg = gain(c); whine.connect(wg).connect(pan);
    // propeller churn: brown noise, band-passed, amplitude-modulated at blade rate
    const churnF = filt(c, 'bandpass', 180, 0.9), churn = gain(c), thrum = gain(c, 0.6);
    noise(c, true).connect(churnF).connect(thrum).connect(churn).connect(pan);
    const lfo = c.createOscillator(); lfo.frequency.value = 4; const lfoG = gain(c, 0.4); lfo.connect(lfoG).connect(thrum.gain);
    // azimuth servo (hydraulic / electric steering motor)
    const servoO = c.createOscillator(); servoO.type = 'square'; servoO.frequency.value = 140;
    const servo = gain(c), sf = filt(c, 'bandpass', 700, 2); servoO.connect(sf).connect(servo).connect(pan);
    [motor, motor2, whine, lfo, servoO].forEach(o => o.start());
    return { motor, motor2, whine, mg, wg, churn, churnF, thrum, lfo, servo, servoO, pan };
  });
}

/** Create / resume the audio graph; must run inside a user gesture the first time. */
export function unlockAudio() {
  if (!S.disp.sound) return;
  try {
    if (!ac) { ac = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)(); build(ac); }
    if (ac.state === 'suspended') ac.resume();
  } catch { ac = null; }
}
export function suspendAudio() { if (ac && ac.state === 'running') ac.suspend(); }

// ---------------------------------------------------------------- one-shots
function burst(dur: number, f: number, type: BiquadFilterType, vol: number, pan = 0, brown = false, q = 0.8) {
  if (!ac) return;
  const c = ac, t = c.currentTime, s = noise(c, brown), fl = filt(c, type, f, q), g = gain(c), p = c.createStereoPanner();
  p.pan.value = pan; s.connect(fl).connect(g).connect(p).connect(master);
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0005, t + dur);
  s.stop(t + dur + 0.05);
}
function tone(freqs: number[], dur: number, vol: number, type: OscillatorType = 'sine', pan = 0, sweep = 1, at = 0) {
  if (!ac) return;
  const c = ac, t = c.currentTime + at, g = gain(c), p = c.createStereoPanner();
  p.pan.value = pan; g.connect(p).connect(master);
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.008); g.gain.exponentialRampToValueAtTime(0.0005, t + dur);
  for (const f of freqs) {
    const o = c.createOscillator(); o.type = type; o.frequency.setValueAtTime(f, t);
    if (sweep !== 1) o.frequency.exponentialRampToValueAtTime(f * sweep, t + dur);
    o.connect(g); o.start(t); o.stop(t + dur + 0.05);
  }
}
/** Hull meeting fenders or a wall; k = 0..1 severity, hard = steel on concrete / rock. */
function impact(k: number, hard: boolean, pan: number) {
  tone([42, 63], 0.9 + k, 0.25 + 0.6 * k, 'sine', pan, 0.7);                 // the ship's mass: low thud
  burst(0.35 + 0.4 * k, 140, 'lowpass', 0.4 + 0.8 * k, pan, true);
  if (hard) {
    tone([187, 431, 853, 1290], 1.2 + k, 0.08 + 0.18 * k, 'triangle', pan); // plating rings
    burst(0.5 + 0.6 * k, 2400, 'bandpass', 0.15 + 0.4 * k, pan, false, 0.6);  // crunch
  } else {
    tone([260], 0.25 + 0.3 * k, 0.05 + 0.1 * k, 'sawtooth', pan, 0.75);       // rubber squeal
  }
}

// ---------------------------------------------------------------- haptics
let lastBuzz = 0;
export function haptic(p: number | number[], min = 40) {
  if (!S.disp.haptics || !('vibrate' in navigator)) return;
  const now = performance.now(); if (now - lastBuzz < min) return; lastBuzz = now;
  try { navigator.vibrate(p); } catch { /* ignored */ }
}
/** Detent and step feedback from the levers and dials. */
export function uiTick(kind: 'step' | 'detent' | 'cardinal') {
  if (kind === 'detent') { haptic(22, 0); if (ac) tone([1650], 0.05, 0.08, 'square'); }
  else if (kind === 'cardinal') { haptic(14, 0); if (ac) tone([1250], 0.035, 0.05, 'square'); }
  else { haptic(6, 25); if (ac) tone([2100], 0.02, 0.025, 'square'); }
}

// ---------------------------------------------------------------- per frame
let lastContact = -1, lastAlert: unknown = null, lastAlpha: number[] = [], lastMode: string[] = [], wasAground = false, creakT = 0, chimeT = -99;
export function updateAudio(dtReal: number) {
  const rt = S.rt; if (!rt) return;
  const sheetOpen = !document.getElementById('sheet')!.hidden;
  // events (haptics fire even with sound off)
  const ev = rt.contactLog[0];
  if (ev && ev.t !== lastContact && rt.ci.active) {
    lastContact = ev.t;
    const k = Math.min(1, ev.vn / 0.3), q = rt.ci.points[0], st0 = rt.state;
    // pan toward the side of the ship that touched
    const pan = q ? Math.sign(-(q.n - st0.n) * Math.sin(st0.psi) + (q.e - st0.e) * Math.cos(st0.psi)) * 0.6 : 0;
    impact(k, ev.hard, pan);
    haptic(ev.hard ? [120 + 180 * k, 60, 160 + 200 * k] : k > 0.6 ? [90, 40, 120] : [25 + 50 * k], 0);
  }
  const ag = (rt.world.aground ?? 0) > 0.02;
  if (ag && !wasAground) { impact(0.8, false, 0); burst(1.6, 70, 'lowpass', 0.9, 0, true); haptic([300, 80, 300], 0); }
  wasAground = ag;
  const al = rt.alerts[0];
  if (al && al !== lastAlert) {
    lastAlert = al;
    if (/PARTED/.test(al.text)) { burst(0.09, 3000, 'highpass', 1.0); tone([95], 0.6, 0.3, 'sine', 0, 0.5); haptic([40, 30, 40], 0); }
    else if (/ashore|fast/i.test(al.text)) tone([880, 1320], 0.25, 0.06);
    else if (al.cls === 'heavy' && rt.state.t - chimeT > 4) { chimeT = rt.state.t; tone([988], 0.22, 0.12, 'square'); tone([740], 0.3, 0.12, 'square', 0, 1, 0.25); }
  }
  if (!ac) return;
  const on = S.disp.sound && !S.paused && !sheetOpen && !document.hidden;
  set(master.gain, on ? S.disp.vol * 0.9 : 0, on ? 0.15 : 0.05);
  if (!on) return;

  const st = rt.state, spd = Math.hypot(st.u, st.v);
  if (voiceShip !== SHIP.id) buildVoices(ac);
  st.pods.forEach((p, i) => {
    const v = pods[i]; if (!v) return;
    const u = SHIP.pods[i];
    if (u.kind === 'shaft') { shaftVoice(v, u, p, i, dtReal, spd); return; }
    if (u.kind === 'waterjet') { jetVoice(v, u, p, i, dtReal); return; }
    const r = Math.abs(p.rpm), load = Math.min(1, rt.status.podPower[i] / SHIP.pods[i].P);
    const cmd = S.cmd.pods[i]?.rpm ?? 0, reversing = cmd * p.rpm < 0 && r > 0.03;
    set(v.motor.frequency, 22 + 48 * r); set(v.motor2.frequency, 33 + 72 * r);
    set(v.mg.gain, r < 0.01 ? 0 : 0.05 + 0.22 * Math.sqrt(r) + 0.12 * load);
    set(v.whine.frequency, 420 + 900 * r); set(v.wg.gain, r < 0.01 ? 0 : 0.006 + 0.014 * load);
    // churn: louder and rougher under load and while the prop fights the flow (reversal, crash stop)
    set(v.churn.gain, r < 0.02 ? 0.02 * Math.min(1, spd / 4) : 0.08 + 0.35 * load + (reversing ? 0.3 : 0));
    set(v.churnF.frequency, 120 + 260 * r + (reversing ? 250 : 0));
    set(v.lfo.frequency, 1.5 + 9 * r);                                    // 4-blade pass rate, scaled into audibility
    // servo: when the pod is slewing
    const a = p.alpha, da = lastAlpha[i] === undefined ? 0 : Math.abs(Math.atan2(Math.sin(a - lastAlpha[i]), Math.cos(a - lastAlpha[i]))) / Math.max(1e-3, dtReal);
    lastAlpha[i] = a;
    const slewing = Math.min(1, da / (SHIP.podSlew * 0.6));
    set(v.servo.gain, 0.035 * slewing, 0.06); set(v.servoO.frequency, 120 + 60 * slewing);
  });
  const b = Math.abs(st.bt);
  set(bt.g.gain, 0.45 * b); set(bt.f.frequency, 160 + 180 * b); set(bt.o.frequency, 30 + 60 * b); set(bt.og.gain, 0.08 * b);
  set(water.g.gain, 0.05 + 0.06 * Math.min(1, spd / 5)); set(water.f.frequency, 250 + 120 * spd);
  const w = rt.env.windSpeed / 15;
  set(wind.g.gain, 0.012 * Math.min(2, w * w)); set(wind.f.frequency, 700 + 500 * Math.random(), 0.8);
  // structure contact: scraping while steel slides along a wall; rumble while aground
  const ci = rt.ci, hard = ci.active && ci.points.length > ci.fenders.length;
  set(scrape.g.gain, hard ? Math.min(0.5, 0.1 + 0.6 * spd) : 0, 0.05); set(scrape.f.frequency, 900 + 900 * Math.min(1, spd));
  set(rumble.g.gain, ag ? Math.min(1, 0.3 + (rt.world.aground ?? 0) + spd * 0.4) : 0, 0.1);
  // mooring lines creak under load
  creakT -= dtReal;
  const maxT = Math.max(0, ...rt.lines.filter(l => l.state === 'fast').map(l => l.T));
  if (maxT > 0.35 * LINE.MBL && creakT <= 0) {
    creakT = 0.6 + Math.random() * 1.6 * (1 - maxT / LINE.MBL);
    tone([95 + Math.random() * 60], 0.18, 0.04 + 0.08 * maxT / LINE.MBL, 'sawtooth', 0, 1.4);
  }
}

/** A diesel on a shaft: firing pulses (shaft speed × cylinders), turbocharger with load,
 *  a blast of starting air on every start, propeller churn, steering-gear hum. */
function shaftVoice(v: PodVoice, u: PodSpec, p: PodState, i: number, dtReal: number, spd: number) {
  const sh = u.shaft!, e = sh.engine, rt = S.rt, es = p.eng;
  const n = Math.abs(p.rpm) * e.n, load = Math.min(1, rt.status.podPower[i] / e.P);
  const firing = es ? es.mode === 'run' : n > 0.05;
  const fireHz = e.type === 'direct2s' ? n * 7 : e.type === 'electric' ? 0 : n * 16;   // 7-cyl two-stroke; geared medium-speed
  set(v.motor.frequency, Math.max(4, fireHz)); set(v.motor2.frequency, Math.max(8, fireHz * 2));
  set(v.mg.gain, firing && fireHz > 0 ? 0.12 + 0.3 * Math.sqrt(load) : 0);
  // turbocharger: rises with load (electric drive: converter whine instead)
  set(v.whine.frequency, e.type === 'electric' ? 420 + 900 * Math.abs(p.rpm) : 900 + 2600 * load);
  set(v.wg.gain, firing ? 0.004 + 0.012 * load : 0);
  const drive = p.pitch ?? p.rpm, r = Math.abs(drive);
  const fighting = (p.pitch === undefined ? p.rpm : drive) * (rt.state.u > 0 ? 1 : -1) < 0 && spd > 1;
  set(v.churn.gain, r < 0.02 ? 0.02 * Math.min(1, spd / 4) : 0.08 + 0.3 * load + (fighting ? 0.3 : 0));
  set(v.churnF.frequency, 90 + 200 * Math.min(1, n / e.n) + (fighting ? 220 : 0));
  set(v.lfo.frequency, Math.max(0.5, n * 4));                       // blade rate
  // starting air: a hiss and the first thump as she fires
  const mode = es?.mode ?? '';
  if (mode === 'start' && lastMode[i] !== 'start') { burst(1.4, 2600, 'highpass', 0.35, v.pan.pan.value); tone([38, 57], 0.6, 0.25, 'sine', v.pan.pan.value, 0.8, 0.9); }
  lastMode[i] = mode;
  // steering gear hum while the rudder moves
  const a = p.alpha, da = lastAlpha[i] === undefined ? 0 : Math.abs(a - lastAlpha[i]) / Math.max(1e-3, dtReal);
  lastAlpha[i] = a;
  const moving = sh.rudder ? Math.min(1, da / (sh.rudder.rate * 0.6)) : 0;
  set(v.servo.gain, 0.03 * moving, 0.06); set(v.servoO.frequency, 95 + 40 * moving);
}

/** A waterjet: high-speed diesel firing and turbo whine, the roar of the jet itself (broadband, rising with
 *  jet speed), a harsher rattle when the pump runs at its cavitation limit or the bucket is down. */
function jetVoice(v: PodVoice, u: PodSpec, p: PodState, i: number, dtReal: number) {
  const rt = S.rt, r = Math.max(0, p.rpm), load = Math.min(1, rt.status.podPower[i] / u.P);
  const fireHz = r * 1800 / 60 * 10;                                // 20-cylinder high-speed diesel through a gearbox
  set(v.motor.frequency, Math.max(20, fireHz * 0.25)); set(v.motor2.frequency, Math.max(30, fireHz * 0.5));
  set(v.mg.gain, 0.08 + 0.2 * Math.sqrt(load));
  set(v.whine.frequency, 1400 + 3200 * load); set(v.wg.gain, 0.004 + 0.016 * load);
  const reversed = (p.bucket ?? 1) < 0.9, cav = rt.status.msg[i] === 'CAVITATION LIMIT';
  set(v.churn.gain, 0.05 + 0.4 * load + (reversed ? 0.15 : 0) + (cav ? 0.15 : 0));
  set(v.churnF.frequency, 300 + 900 * r + (cav ? 600 : 0));
  set(v.lfo.frequency, cav ? 23 : 0.7 + 2 * r);
  const a = p.alpha, da = lastAlpha[i] === undefined ? 0 : Math.abs(a - lastAlpha[i]) / Math.max(1e-3, dtReal);
  lastAlpha[i] = a;
  const moving = Math.min(1, da / (u.jet!.nozzleMax / u.jet!.respT * 0.6));
  set(v.servo.gain, 0.03 * moving, 0.05); set(v.servoO.frequency, 160 + 60 * moving);
}
