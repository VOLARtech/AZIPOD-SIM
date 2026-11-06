// Chart symbols for aids to navigation, paper-chart style (IHO INT 1, simplified): the buoy or beacon in its
// shape and colours (bands or stripes), its topmark, a light flare in the light's colour, and light sectors.
// Drawn in screen space, (x, y) the position of the mark.
import type { Aid } from './model';
import { TOP } from './marks';
import { lightText } from './lights';

type Ctx = CanvasRenderingContext2D;
export interface SymbolPalette { ink: string; port: string; stbd: string; light: string; muted: string; fontNum: string; panel: string }
const HUE: Record<string, string> = { red: '#d6312b', green: '#2e9e4f', yellow: '#f0c419', black: '#1a1a1a', white: '#ffffff', orange: '#f08a24', blue: '#2f6fd6', grey: '#8a8f93', brown: '#7a5233', amber: '#f2a33a', violet: '#7d4bb3', magenta: '#c0399b', pink: '#ef8fb4' };
export const hue = (c: string, P: SymbolPalette) => (c === 'red' ? P.port : c === 'green' ? P.stbd : HUE[c] ?? P.ink);

/** Fill the current path's box [x0, y0, w, h] with the mark's colours: bands (top down) or stripes. */
function paint(ctx: Ctx, cols: string[], pat: number | undefined, x0: number, y0: number, w: number, h: number, P: SymbolPalette) {
  if (!cols.length) { ctx.fillStyle = 'rgba(0,0,0,0)'; return; }
  if (cols.length === 1) { ctx.fillStyle = hue(cols[0], P); ctx.fill(); return; }
  ctx.save(); ctx.clip();
  if (pat === 2) {
    // vertical stripes: alternate the colours across the width
    const n = Math.max(4, cols.length * 2), sw = w / n;
    for (let i = 0; i < n; i++) { ctx.fillStyle = hue(cols[i % cols.length], P); ctx.fillRect(x0 + i * sw, y0, sw + 0.5, h); }
  } else {
    const bh = h / cols.length;
    cols.forEach((c, i) => { ctx.fillStyle = hue(c, P); ctx.fillRect(x0, y0 + i * bh, w, bh + 0.5); });
  }
  ctx.restore();
}
const cone = (ctx: Ctx, x: number, y: number, s: number, up: boolean) => { ctx.moveTo(x - s, up ? y : y - 2 * s); ctx.lineTo(x + s, up ? y : y - 2 * s); ctx.lineTo(x, up ? y - 2 * s : y); ctx.closePath(); };

/** The topmark, standing on (x, y). Returns its height. */
function topmark(ctx: Ctx, a: Aid, x: number, y: number, P: SymbolPalette) {
  const t = a.top; if (t === undefined) return 0;
  const col = hue(a.topCol?.[0] ?? 'black', P), s = 3;
  ctx.fillStyle = col; ctx.strokeStyle = P.ink; ctx.lineWidth = 0.8;
  ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y - 2); ctx.stroke();
  const b = y - 2;
  ctx.beginPath();
  switch (t) {
    case TOP.coneUp: cone(ctx, x, b, s, true); break;
    case TOP.coneDown: cone(ctx, x, b, s, false); break;
    case TOP.sphere: ctx.arc(x, b - s, s, 0, Math.PI * 2); break;
    case TOP.spheres2: ctx.arc(x, b - s, s * 0.85, 0, Math.PI * 2); ctx.moveTo(x + s * 0.85, b - 3.4 * s); ctx.arc(x, b - 3.4 * s, s * 0.85, 0, Math.PI * 2); break;
    case TOP.can: ctx.rect(x - s, b - 2 * s, 2 * s, 2 * s); break;
    case TOP.x: ctx.moveTo(x - s, b); ctx.lineTo(x + s, b - 2 * s); ctx.moveTo(x + s, b); ctx.lineTo(x - s, b - 2 * s); ctx.lineWidth = 2; ctx.strokeStyle = col; ctx.stroke(); return 2 * s + 2;
    case TOP.cones2Up: cone(ctx, x, b, s, true); cone(ctx, x, b - 2 * s - 1, s, true); break;
    case TOP.cones2Down: cone(ctx, x, b - 2 * s - 1, s, false); cone(ctx, x, b, s, false); break;
    case TOP.cones2BaseToBase: cone(ctx, x, b, s, false); cone(ctx, x, b - 2 * s, s, true); break;                 // ◆: E
    case TOP.cones2PointToPoint: cone(ctx, x, b, s, true); cone(ctx, x, b - 2 * s, s, false); break;               // ⧗: W
    default: ctx.rect(x - s, b - 2 * s, 2 * s, 2 * s);
  }
  ctx.fill(); ctx.stroke();
  return t === TOP.spheres2 ? 4.4 * s + 2 : t === TOP.cones2Up || t === TOP.cones2Down || t === TOP.cones2PointToPoint || t === TOP.cones2BaseToBase ? 4 * s + 3 : 2 * s + 2;
}

/** The body of a buoy or beacon on (x, y). Returns the height of its top (where a topmark goes). */
function body(ctx: Ctx, a: Aid, x: number, y: number, P: SymbolPalette) {
  ctx.lineWidth = 1; ctx.strokeStyle = P.ink;
  const beacon = a.k.startsWith('BCN');
  ctx.beginPath();
  let bx = x - 5, by = y - 10, bw = 10, bh = 10, top = 10;
  if (beacon) {
    if (a.shp === 3 || a.shp === 4) { ctx.moveTo(x - 4, y); ctx.lineTo(x + 4, y); ctx.lineTo(x + 2, y - 14); ctx.lineTo(x - 2, y - 14); ctx.closePath(); bx = x - 4; by = y - 14; bw = 8; bh = 14; top = 14; }   // tower, lattice
    else { ctx.rect(x - 1.5, y - 14, 3, 14); bx = x - 1.5; by = y - 14; bw = 3; bh = 14; top = 14; }                                                                         // stake, pile, withy
  } else switch (a.shp) {
    case 1: ctx.moveTo(x - 5, y); ctx.lineTo(x + 5, y); ctx.lineTo(x, y - 12); ctx.closePath(); bh = 12; by = y - 12; top = 12; break;                                     // conical (nun)
    case 2: ctx.moveTo(x - 5, y); ctx.lineTo(x + 5, y); ctx.lineTo(x + 4, y - 9); ctx.lineTo(x - 4, y - 9); ctx.closePath(); bh = 9; by = y - 9; top = 9; break;             // can
    case 3: ctx.arc(x, y - 5, 5, 0, Math.PI * 2); top = 10; break;                                                                                                        // spherical
    case 5: ctx.rect(x - 1.5, y - 14, 3, 14); bx = x - 1.5; bw = 3; by = y - 14; bh = 14; top = 14; break;                                                                // spar
    case 6: ctx.ellipse(x, y - 4, 7, 4, 0, 0, Math.PI * 2); bx = x - 7; bw = 14; by = y - 8; bh = 8; top = 8; break;                                                       // barrel
    case 7: ctx.rect(x - 7, y - 6, 14, 6); bx = x - 7; bw = 14; by = y - 6; bh = 6; top = 6; break;                                                                        // super-buoy
    default: ctx.moveTo(x - 4.5, y); ctx.lineTo(x + 4.5, y); ctx.lineTo(x + 2, y - 14); ctx.lineTo(x - 2, y - 14); ctx.closePath(); bx = x - 4.5; bw = 9; by = y - 14; bh = 14; top = 14;   // pillar
  }
  paint(ctx, a.col, a.colpat, bx, by, bw, bh, P);
  ctx.stroke();
  // the position: a small circle at the base, as on a chart
  ctx.beginPath(); ctx.arc(x, y, 1.6, 0, Math.PI * 2); ctx.fillStyle = P.ink; ctx.fill();
  return top;
}

/** A light flare, from the mark's position. */
function flare(ctx: Ctx, a: Aid, x: number, y: number, P: SymbolPalette) {
  const l = a.light!, c = l.sectors?.length ? 'white' : l.col[0] ?? 'white';
  ctx.save(); ctx.translate(x, y); ctx.rotate(Math.PI * 0.75);
  ctx.fillStyle = c === 'red' ? P.port : c === 'green' ? P.stbd : c === 'yellow' ? HUE.yellow : P.light; ctx.globalAlpha = 0.85;
  ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(4, 7, 0, 15); ctx.quadraticCurveTo(-4, 7, 0, 0); ctx.fill();
  ctx.restore(); ctx.globalAlpha = 1;
}

/** Sector arcs and legs of a sectored light (radius r px). Bearings are from seaward toward the light. */
function sectors(ctx: Ctx, a: Aid, x: number, y: number, r: number, P: SymbolPalette) {
  for (const s of a.light!.sectors!) {
    // a bearing toward the light of B means the observer sits at B + 180 from it; screen angle of true bearing θ is θ − 90°
    const a0 = (s.from + 180 - 90) * Math.PI / 180, a1 = (s.to + 180 - 90) * Math.PI / 180;
    ctx.strokeStyle = hue(s.col, P); ctx.lineWidth = 3; ctx.globalAlpha = 0.8;
    ctx.beginPath(); ctx.arc(x, y, r, a0, a1 < a0 ? a1 + 2 * Math.PI : a1); ctx.stroke();
    ctx.globalAlpha = 1; ctx.strokeStyle = P.muted; ctx.lineWidth = 0.8; ctx.setLineDash([3, 3]);
    ctx.beginPath(); for (const b of [a0, a1]) { ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(b) * r * 1.3, y + Math.sin(b) * r * 1.3); } ctx.stroke(); ctx.setLineDash([]);
  }
}

/** One aid: body, topmark, light flare; with its light's characteristic and name once zoomed in. `rot`: the
 *  chart's rotation (head-up), so sectors keep their true bearings. */
export function drawAid(ctx: Ctx, a: Aid, x: number, y: number, P: SymbolPalette, zoom: number, rot = 0, room?: (box: [number, number, number, number]) => boolean) {
  if (a.k === 'MORFAC') { ctx.beginPath(); ctx.arc(x, y, 3, 0, Math.PI * 2); ctx.strokeStyle = P.ink; ctx.lineWidth = 1; ctx.stroke(); return; }
  if (a.light?.sectors?.length && zoom > 0.12) { ctx.save(); ctx.translate(x, y); ctx.rotate(-rot); sectors(ctx, a, 0, 0, 34, P); ctx.restore(); }
  if (a.light) flare(ctx, a, x, y, P);
  if (a.k === 'LIGHTS') {
    // a light on its own: the star-point position mark
    ctx.beginPath(); ctx.arc(x, y, 2.2, 0, Math.PI * 2); ctx.fillStyle = P.ink; ctx.fill();
  } else if (a.k !== 'FOGSIG' && a.k !== 'LNDMRK') {
    const h = body(ctx, a, x, y, P);
    topmark(ctx, a, x, y - h, P);
  }
  if (zoom > 0.3) {
    const t = [a.light ? lightText(a.light) : '', a.fog ? 'Horn' : ''].filter(Boolean).join(' · ');
    const nm = a.name?.replace(/^(Miami (Harbor|Main Channel)|Port of [A-Z][a-z]+) /, '').slice(0, 26);
    ctx.font = `italic 500 10px ${P.fontNum}`; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillStyle = P.ink;
    // where names crowd, the characteristic is kept and the name dropped, and nothing written over another
    const w = Math.max(nm ? ctx.measureText(nm).width : 0, t ? ctx.measureText(t).width : 0);
    const both = !!nm && !!t && (!room || room([x + 8, y - 12, x + 10 + w, y + 11]));
    if (both) { ctx.fillText(nm!, x + 9, y - 6); ctx.fillStyle = P.muted; ctx.fillText(t, x + 9, y + 5); }
    else if (t && (!room || room([x + 8, y - 10, x + 10 + ctx.measureText(t).width, y + 2]))) { ctx.fillStyle = P.muted; ctx.fillText(t, x + 9, y - 4); }
    else if (nm && !t && (!room || room([x + 8, y - 12, x + 10 + w, y]))) ctx.fillText(nm, x + 9, y - 6);
  }
}
