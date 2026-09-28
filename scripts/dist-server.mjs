// Deterministic static server for the production build (vite preview binds
// IPv6-only on some Windows setups, which Chromium can't reach).
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = process.env.DIST_ROOT || path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'dist');
const port = Number(process.argv[2] || 3311);
const types = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp',
  '.json': 'application/json', '.woff2': 'font/woff2', '.ico': 'image/x-icon',
  '.map': 'application/json', '.txt': 'text/plain',
};
const server = http.createServer((req, res) => {
  const urlPath = decodeURIComponent(req.url.split('?')[0]);
  let rel = urlPath.replace(/^\/+/, '') || 'index.html';
  let p = path.join(root, rel);
  if (!p.startsWith(root)) { res.writeHead(403); return res.end(); }
  if (!fs.existsSync(p) || fs.statSync(p).isDirectory()) {
    // SPA fallback: extensionless routes serve the app shell.
    p = path.join(root, 'index.html');
  }
  fs.readFile(p, (err, data) => {
    if (err) { res.writeHead(404); return res.end('not found'); }
    res.writeHead(200, { 'Content-Type': types[path.extname(p).toLowerCase()] || 'application/octet-stream' });
    res.end(data);
  });
});
server.listen(port, '127.0.0.1', () => console.log(`dist server on http://127.0.0.1:${port}`));
