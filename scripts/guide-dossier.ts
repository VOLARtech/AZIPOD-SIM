// Writes docs/TRAINING-CLAIMS.md from the guide's content. Run: npm run guide:dossier
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { CONTENT } from '../src/guide/content';
import { renderClaims } from '../src/guide/dossier';
import { SOURCES } from '../src/guide/sources';

const out = fileURLToPath(new URL('../docs/TRAINING-CLAIMS.md', import.meta.url));
writeFileSync(out, renderClaims(CONTENT, SOURCES));
console.log(`wrote ${out}: ${CONTENT.cards.length} cards, ${CONTENT.procedures.length} procedures, ${CONTENT.exercises.length} exercises`);
