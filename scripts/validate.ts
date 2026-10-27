import { runValidation } from '../src/physics/validation';
const t0 = Date.now();
const v = runValidation();
console.log(`service ${v.serviceKn.toFixed(1)} kn, approach rpm ${(v.approachRpm*100).toFixed(0)} %, ${Date.now()-t0} ms, rank match ${v.rankOk}`);
for (const r of v.rows) console.log(r.label.padEnd(44), r.published.toFixed(1).padStart(5), r.model.toFixed(2).padStart(6), `${(r.err*100).toFixed(0)}%`.padStart(6), `${r.time.toFixed(0)}s`, `hdg ${r.heading.toFixed(1)}`);
