import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, relative, resolve, sep } from 'node:path';

const root = resolve(new URL('..', import.meta.url).pathname);
const port = Number(process.env.ARC_WEB_PORT ?? 3007);

const contentTypes = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
};

export function createApp() {
  return async (req, res) => {
    const requestPath = req.url === '/' ? '/index.html' : decodeURIComponent(req.url);
    const resolved = resolve(join(root, requestPath));
    const rel = relative(root, resolved);

    if (rel === '..' || rel.startsWith(`..${sep}`)) {
      res.writeHead(403);
      res.end('Forbidden');
      return;
    }

    try {
      const body = await readFile(resolved);
      res.writeHead(200, { 'Content-Type': contentTypes[extname(resolved)] ?? 'application/octet-stream' });
      res.end(body);
    } catch {
      res.writeHead(404);
      res.end('Not found');
    }
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  createServer(createApp()).listen(port, () => {
    console.log(`Dev server running at http://localhost:${port}`);
  });
}
