import { SHIP, deriveHydro } from '../src/physics/ship';
import { runTrials } from '../src/physics/trials';
const h = deriveHydro(SHIP, Infinity);
console.log('m', (h.m/1e3).toFixed(0),'t  Iz',h.Iz.toExponential(2),' Xud',h.Xud.toExponential(2),' Yvd',h.Yvd.toExponential(2),' Yrd',h.Yrd.toExponential(2),' Nrd',h.Nrd.toExponential(2));
console.log('prime', Object.fromEntries(Object.entries(h.prime).map(([k,v])=>[k,+v.toExponential(3)])));
for (const d of [Infinity, 9]) {
  const t0 = Date.now(); const { rows } = runTrials(SHIP, d);
  console.log(`\n== depth ${d} (${Date.now()-t0} ms)`);
  for (const r of rows) console.log(r.label.padEnd(44), r.value.padEnd(26), (r.limit??'').padEnd(8), r.pass===undefined?'':(r.pass?'PASS':'FAIL'), r.note??'');
}
