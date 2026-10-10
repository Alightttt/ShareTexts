// Ground truth: does nearby discovery work on the REAL deployed site?
// Two fresh browser contexts (different origins allowed), autoConnect seeded.
// Usage: node scripts/probe-live-site.mjs  (URL=https://sharetexts.online)
import { chromium } from 'playwright';

const URL = process.env.URL || 'https://sharetexts.online';
const b = await chromium.launch();
const pages = [];
for (const tag of ['A', 'B']) {
  const ctx = await b.newContext();
  const p = await ctx.newPage();
  pages.push(p);
  await p.addInitScript(() => localStorage.setItem('sharetext.autoConnect.v1', '1'));
  p.on('console', (m) => {
    const t = m.text();
    if (/presence|conn\.state|transport|redirect|announce|nearby/i.test(t)) console.log(`[${tag}] ${t.slice(0, 150)}`);
  });
  p.on('pageerror', (e) => console.log(`[${tag}] PAGEERROR ${String(e).slice(0, 150)}`));
  await p.goto(URL, { waitUntil: 'domcontentloaded' });
}

await new Promise((r) => setTimeout(r, 15000));
const state = [];
for (const p of pages) {
  state.push(await p.evaluate(() => ({
    overlay: !!document.querySelector('[data-testid="nearby-detect-overlay"]'),
    hint: !!document.querySelector('[data-testid="nearby-why-toggle"]'),
  })));
}
console.log('after 15s:', JSON.stringify(state));
await b.close();
