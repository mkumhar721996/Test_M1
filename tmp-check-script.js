const fs = require('fs');
const html = fs.readFileSync('.arc/designs/TEST-M1-STORY-079-design.html', 'utf8');
const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);
console.log('script blocks found:', scripts.length);
scripts.forEach((s, i) => {
  try {
    new Function(s);
    console.log('block', i, 'OK');
  } catch (e) {
    console.log('block', i, 'SYNTAX ERROR:', e.message);
  }
});
