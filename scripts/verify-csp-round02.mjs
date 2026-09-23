import { chromium } from 'playwright';
import { createServer } from 'http';
import { readFileSync, existsSync, statSync } from 'fs';
import { join, extname, resolve } from 'path';

// Round 02 probe: serve dist/ with the EXACT Content-Security-Policy from
// vercel.json (not the dev hash-pinned helmet one) and verify in a real
// Chromium that (a) the pre-paint theme script executes — no CSP violation,
// (b) html.dark is applied pre-paint when localStorage forces dark,
// (c) html.dark is absent pre-paint when localStorage forces light.

const dist = resolve('dist');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.json': 'application/json', '.txt': 'text/plain', '.woff2': 'font/woff2' };

const vercelJson = JSON.parse(readFileSync('vercel.json', 'utf8'));
const CSP = vercelJson.headers[0].headers.find(h => h.key === 'Content-Security-Policy').value;

const srv = createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/') p = '/index.html';
  let f = join(dist, p);
  if (!existsSync(f) || statSync(f).isDirectory()) f = join(dist, 'index.html');
  res.writeHead(200, { 'Content-Type': MIME[extname(f)] || 'application/octet-stream', 'Content-Security-Policy': CSP });
  res.end(readFileSync(f));
});

await new Promise(r => srv.listen(4519, r));

const results = { dark: null, light: null };
for (const theme of ['dark', 'light']) {
  const ctx = await chromium.launchPersistentContext('', { viewport: { width: 1280, height: 800 } });
  await ctx.addInitScript(t => { try { localStorage.setItem('sharetext.theme', t); } catch {} }, theme);
  const page = await ctx.newPage();
  const cspErrors = [];
  page.on('console', m => { if (m.type() === 'error' && /Content Security Policy|CSP/i.test(m.text())) cspErrors.push(m.text()); });
  page.on('pageerror', e => { if (/Content Security Policy|CSP/i.test(e.message)) cspErrors.push(e.message); });
  await page.goto('http://localhost:4519/', { waitUntil: 'domcontentloaded' });
  // Pre-paint evidence: read html.dark as early as possible (before React hydrates the DOM shell fully)
  const earlyDark = await page.evaluate(() => document.documentElement.classList.contains('dark'));
  await page.waitForSelector('#root', { timeout: 10000 });
  await page.waitForTimeout(1200); // let the app mount
  const lateDark = await page.evaluate(() => document.documentElement.classList.contains('dark'));
  const mounted = await page.evaluate(() => !!document.querySelector('#root') && !document.querySelector('#loading-shell'));
  results[theme] = { earlyDark, lateDark, mounted, cspErrors };
  await ctx.close();
}
srv.close();

const ok =
  results.dark.earlyDark === true && results.dark.lateDark === true && results.dark.cspErrors.length === 0 &&
  results.light.earlyDark === false && results.light.cspErrors.length === 0 && results.dark.mounted && results.light.mounted;

console.log(JSON.stringify(results, null, 2));
console.log(ok ? 'CSP-PROBE: ALL GREEN — theme script executes under vercel.json CSP, zero violations, pre-paint dark+light correct' : 'CSP-PROBE: FAILED');
process.exit(ok ? 0 : 1);
