const fs = require('fs');
const html = fs.readFileSync('.arc/designs/TEST-M1-STORY-136-design.html', 'utf8');

const idsDefined = [...html.matchAll(/id="([^"]+)"/g)].map(m => m[1]);
const counts = {};
idsDefined.forEach(i => counts[i] = (counts[i]||0)+1);
const dupes = Object.keys(counts).filter(k => counts[k] > 1);
console.log('Duplicate IDs:', dupes);

const refs = [...html.matchAll(/getElementById\(['"]([^'"]+)['"]\)/g)].map(m => m[1]);
const missing = [...new Set(refs)].filter(r => !idsDefined.includes(r));
console.log('Missing direct refs:', missing);

const dynamicRefs = [...html.matchAll(/getElementById\(`([^`]*)`\)/g)].map(m => m[1]);
console.log('Dynamic ref patterns:', [...new Set(dynamicRefs)]);

const divOpens = (html.match(/<div\b/g) || []).length;
const divCloses = (html.match(/<\/div>/g) || []).length;
console.log('div opens:', divOpens, 'div closes:', divCloses);
