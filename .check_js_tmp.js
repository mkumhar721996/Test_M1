const fs = require('fs');
const html = fs.readFileSync('/workspace/.arc/designs/TEST-M1-STORY-101-design.html', 'utf8');
const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);
scripts.forEach((s, i) => {
  try { new Function(s); console.log('script', i, 'OK'); }
  catch (e) { console.log('script', i, 'ERROR', e.message); }
});
