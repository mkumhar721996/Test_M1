const fs = require('fs');
const html = fs.readFileSync('.arc/designs/TEST-M1-STORY-103-design.html', 'utf8');
const scripts = [...html.matchAll(/<script(?:\s+[^>]*)?>([\s\S]*?)<\/script>/g)].map(m => m[1]);
console.log('script blocks found:', scripts.length);
scripts.forEach((s, i) => {
  if (s.trim().startsWith('[')) { console.log(i, 'json block, skipping'); return; }
  try { new Function(s); console.log(i, 'OK'); } catch (e) { console.log(i, 'ERROR', e.message); }
});
