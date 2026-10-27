// Strip the document skeleton so the artifact host can wrap the page itself.
import fs from 'fs';
let h = fs.readFileSync('dist/index.html', 'utf8');
h = h.replace(/<!doctype html>/i, '').replace(/<\/?html[^>]*>/gi, '').replace(/<\/?head>/gi, '').replace(/<\/?body>/gi, '')
     .replace(/<meta charset[^>]*>/i, '').replace(/<meta name="viewport"[^>]*>/i, '');
fs.writeFileSync('dist/azipod-shiphandler.html', h.trim() + '\n');
console.log('fragment bytes', h.length);
