/**
 * Serves dist/portal under /games/floor-42/ with gzip, as a portal would (a sub-path, never the site root):
 * node scripts/portal-serve.mjs [port] (default 3215). For checking the build by hand or with a browser script.
 */
import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { join, extname } from 'node:path';

const root = new URL('../dist/portal', import.meta.url).pathname;
const port = Number(process.argv[2] ?? 3215);
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.m4a': 'audio/mp4' };
createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]).replace(/^\/games\/floor-42/, '');
  if (p === '' || p.endsWith('/')) p += 'index.html';
  const f = join(root, p);
  if (!f.startsWith(root) || !existsSync(f) || statSync(f).isDirectory()) {
    res.writeHead(404);
    return res.end();
  }
  let body = readFileSync(f);
  const h = { 'content-type': types[extname(f)] ?? 'application/octet-stream' };
  if (/gzip/.test(req.headers['accept-encoding'] ?? '') && /\.(js|css|html)$/.test(f)) {
    body = gzipSync(body);
    h['content-encoding'] = 'gzip';
  }
  res.writeHead(200, h);
  res.end(body);
}).listen(port, () => console.log(`http://localhost:${port}/games/floor-42/`));
