// Discovery pipeline probe: two pages, autoConnect seeded, dump the signaling
// console chatter from both. Usage: URL=http://localhost:3013 node scripts/probe-discovery.mjs
import { chromium } from 'playwright';

const URL = process.env.URL || 'http://localhost:3013';
const b = await chromium.launch();

const pages = [];
for (const tag of ['A', 'B']) {
  const p = await b.newPage({ viewport: { width: 1100, height: 800 } });
  pages.push(p);
  await p.addInitScript(() => localStorage.setItem('sharetext.autoConnect.v1', '1'));
  p.on('console', (m) => {
    const t = m.text();
    if (/presence|conn\.state|transport|discover|nearby|overlay|announce/i.test(t)) console.log(`[${tag}] ${t.slice(0, 160)}`);
  });
  p.on('pageerror', (e) => console.log(`[${tag}] PAGEERROR ${String(e).slice(0, 160)}`));
  await p.goto(URL, { waitUntil: 'domcontentloaded' });
}

await new Promise((r) => setTimeout(r, 12000));
const overlays = [];
for (const p of pages) {
  overlays.push(await p.evaluate(() => !!document.querySelector('[data-testid="nearby-detect-overlay"]')));
}
console.log('overlays after 12s:', JSON.stringify(overlays));
await b.close();
