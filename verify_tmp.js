const fs = require('fs');
const html = fs.readFileSync('/workspace/.arc/designs/TEST-M1-STORY-016-design.html', 'utf8');
const m = html.match(/<script>([\s\S]*)<\/script>/);
new Function(m[1]);
console.log('JS syntax OK');
console.log('section count:', (html.match(/<section/g)||[]).length);
console.log('screen ids:', [...html.matchAll(/id="(screen-\d)"/g)].map(x=>x[1]));
console.log('has tokens.css link:', html.includes('/api/projects/proj_d0fc291d/designs/tokens.css'));
console.log('has prototype-utils.css link:', html.includes('/api/projects/proj_d0fc291d/designs/prototype-utils.css'));
