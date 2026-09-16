import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, resolve, sep } from 'node:path';

const PORT = process.env.PORT ?? 5173;

const CONTENT_TYPES = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
};

export function resolveStaticPath(root, url) {
  const requestPath = url === '/' ? '/index.html' : url;
  const relativePath = requestPath.replace(/^\/+/, '');
  const resolvedRoot = resolve(root);
  const filePath = resolve(join(resolvedRoot, relativePath));
  if (filePath !== resolvedRoot && !filePath.startsWith(resolvedRoot + sep)) {
    return null;
  }
  return filePath;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const root = process.cwd();
  createServer(async (req, res) => {
    const filePath = resolveStaticPath(root, req.url);
    if (!filePath) {
      res.writeHead(403);
      res.end('Forbidden');
      return;
    }
    try {
      const body = await readFile(filePath);
      res.writeHead(200, { 'Content-Type': CONTENT_TYPES[extname(filePath)] ?? 'application/octet-stream' });
      res.end(body);
    } catch {
      res.writeHead(404);
      res.end('Not found');
    }
  }).listen(PORT, () => {
    console.log(`Serving on http://localhost:${PORT}`);
  });
}
