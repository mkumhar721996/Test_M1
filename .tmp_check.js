const fs = require('fs');
const html = fs.readFileSync('.arc/designs/TEST-M1-STORY-096-design.html', 'utf8');
const scripts = [...html.matchAll(/<script(?![^>]*type="application\/json")[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1]);
console.log('script blocks found:', scripts.length);
scripts.forEach((s, i) => {
  try { new Function(s); console.log('block', i, 'OK'); }
  catch (e) { console.log('block', i, 'ERROR:', e.message); }
});
const fixtureMatch = html.match(/<script id="fixture-data" type="application\/json">([\s\S]*?)<\/script>/);
try { JSON.parse(fixtureMatch[1]); console.log('fixture JSON OK'); }
catch (e) { console.log('fixture JSON ERROR:', e.message); }
