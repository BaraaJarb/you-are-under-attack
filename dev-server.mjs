// Local preview without Netlify: node dev-server.mjs  ->  http://localhost:8888
// Uses an in-memory store, so data resets when you stop it. HOST_PIN env var is honored.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHandler, memoryStore } from './netlify/functions/lib/handler.mjs';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), 'public');
const env = { ...process.env, HOST_PIN: process.env.HOST_PIN || '1234' };   // local default PIN: 1234
const handle = createHandler(memoryStore(), env);
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png' };

export function start(port = 8888) {
  const server = http.createServer(async (req, res) => {
    const u = new URL(req.url, 'http://x');
    if (u.pathname.startsWith('/api/')) {
      const chunks = [];
      for await (const c of req) chunks.push(c);
      const r = await handle(new Request(u, { method: req.method, headers: req.headers, body: ['GET', 'HEAD'].includes(req.method) ? undefined : Buffer.concat(chunks) }));
      res.writeHead(r.status, Object.fromEntries(r.headers));
      res.end(Buffer.from(await r.arrayBuffer()));
      return;
    }
    let p = u.pathname === '/' ? '/index.html' : u.pathname;
    if (p === '/host') p = '/host.html';
    const file = path.join(root, path.normalize(p));
    if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end('Not found'); return; }
    res.writeHead(200, { 'content-type': types[path.extname(file)] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise((ok) => server.listen(port, () => ok(server)));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  start(Number(process.env.PORT) || 8888).then(() => console.log('Preview on http://localhost:' + (process.env.PORT || 8888) + '  (leader page: /host.html, PIN ' + env.HOST_PIN + ')'));
}
