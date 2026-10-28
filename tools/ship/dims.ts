// Dump each ship's fit box for gltf_to_ship.py: stem and stern as the hull outline draws them, beam, draught.
import { SHIPS } from '../../src/physics/ship';
const out: Record<string, { stem: number; stern: number; beam: number; draught: number; bridgeX: number }> = {};
for (const [id, s] of Object.entries(SHIPS)) {
  const over = Math.max(5, s.LOA - s.L);
  out[id] = { stem: s.L / 2 + over * 0.8 - s.xg, stern: -s.L / 2 - over * 0.2 - s.xg, beam: s.B, draught: s.T, bridgeX: s.bridgeX };
}
console.log(JSON.stringify(out, null, 1));
