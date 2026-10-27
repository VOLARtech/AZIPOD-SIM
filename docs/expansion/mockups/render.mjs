// Render the expansion-plan mockups: node docs/expansion/mockups/render.mjs [name…]
// Needs `npm ci` (fonts come from node_modules/@fontsource) and Playwright's Chromium.
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import * as P from './pages.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const { chromium } = createRequire(import.meta.url)('playwright');

export const SHOTS = [
  ['01-fleet-picker', P.fleet],
  ['02-vlcc-telegraph-helm', P.vlcc],
  ['03-ropax-twin-cpp', P.ropax],
  ['04-tug-asd-escort', P.tug],
  ['05-fast-ferry-waterjets', P.ferry],
  ['06-dp-offshore', P.dp],
  ['07-control-library', P.library],
  ['08-mobile', P.mobile],
].filter(([, fn]) => typeof fn === 'function');

const only = process.argv.slice(2);
mkdirSync(join(here, 'html'), { recursive: true });
const browser = await chromium.launch();
for (const [name, fn] of SHOTS) {
  if (only.length && !only.some(o => name.includes(o))) continue;
  const out = fn();
  const pages = Array.isArray(out) ? out : [{ html: out }];
  for (const [i, pg] of pages.entries()) {
    const file = join(here, 'html', `${name}${pg.suffix ?? ''}.html`);
    writeFileSync(file, pg.html ?? pg);
    if (pg.noshot) continue;
    const vp = pg.viewport ?? { width: 1440, height: 900 };
    const p = await browser.newPage({ viewport: vp, deviceScaleFactor: pg.scale ?? 1.5 });
    await p.goto(pathToFileURL(file).href);
    await p.evaluate(() => document.fonts.ready);
    await p.waitForTimeout(300);
    await p.screenshot({ path: join(here, `${name}${pg.suffix ?? ''}.png`) });
    await p.close();
    console.log('rendered', name, i);
  }
}
await browser.close();
