import { SHIPS, deriveHydro } from '../src/physics/ship';
import { runTrials } from '../src/physics/trials';
// usage: npm run trials -- [becancour|lady]
const spec = SHIPS[process.argv[2] ?? 'becancour'];
const h = deriveHydro(spec, Infinity);
console.log(`${spec.name}: Δ ${(h.m / 1e3).toFixed(0)} t, Lpp ${spec.L} m`);
for (const d of [Infinity, 1.2 * spec.T]) {
  const t0 = Date.now(); const { rows } = runTrials(spec, d);
  console.log(`\n== depth ${d === Infinity ? 'deep' : d.toFixed(1) + ' m'} (${Date.now() - t0} ms)`);
  for (const r of rows) console.log(r.label.padEnd(46), r.value.padEnd(26), (r.limit ?? '').padEnd(8), r.pass === undefined ? '' : (r.pass ? 'PASS' : 'FAIL'), r.note ?? '');
}
