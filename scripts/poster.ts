import { SHIP } from '../src/physics/ship';
import { buildPoster } from '../src/physics/poster';
const t=Date.now(); const p = buildPoster(SHIP); console.log(Date.now()-t,'ms');
console.log(JSON.stringify({speed:p.speedTable, turning:p.turning, stopping:p.stopping, squat:p.squatTable.slice(0,5), wind:p.windDrift}, (k,v)=>typeof v==='number'?+v.toFixed(2):v));
console.log('path pts', p.paths.turn.map(x=>x.pts.length), p.paths.stop.map(x=>x.pts.length));
