// One-screen landing check across desktop sizes: the document must not
// scroll, and the demo + caption + scrubber must be fully inside the fold.
import { launchBrowser, sleep } from './lib.mjs';

const BASE = process.env.URL || 'http://localhost:3010';
const SIZES = [[1920, 1080], [1600, 900], [1440, 900], [1366, 768], [1280, 800], [1152, 700], [1024, 768]];
const browser = await launchBrowser();
let bad = 0;
for (const [w, h] of SIZES) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h } });
  const p = await ctx.newPage();
  await p.goto(BASE, { waitUntil: 'domcontentloaded' });
  await p.locator('[data-testid="hero-demo"]').first().waitFor({ timeout: 20000 });
  await sleep(1200);
  const r = await p.evaluate(() => {
    const de = document.documentElement;
    const main = document.getElementById('main-content');
    const demo = document.querySelector('[data-testid="hero-demo"]')?.getBoundingClientRect();
    const scrub = document.querySelector('[role="slider"]')?.getBoundingClientRect();
    return {
      pageScroll: de.scrollHeight - de.clientHeight,
      innerScroll: main ? main.scrollHeight - main.clientHeight : 0,
      demoBottom: demo ? Math.round(demo.bottom) : null,
      scrubBottom: scrub ? Math.round(scrub.bottom) : null,
      vh: window.innerHeight,
      headerSticky: (() => { const hd = document.querySelector('header'); return hd ? getComputedStyle(hd).position : null; })(),
    };
  });
  const clipped = r.demoBottom !== null && r.demoBottom > r.vh + 1;
  const scrubClipped = r.scrubBottom !== null && r.scrubBottom > r.vh + 1;
  const ok = r.pageScroll === 0 && !clipped && !scrubClipped;
  if (!ok) bad++;
  console.log(`${w}x${h}: ${ok ? 'ok' : 'PROBLEM'} pageScroll=${r.pageScroll} innerScroll=${r.innerScroll} demoBottom=${r.demoBottom} scrubBottom=${r.scrubBottom} vh=${r.vh} header=${r.headerSticky}`);
  await ctx.close();
}
console.log('sizes failing one-screen:', bad, 'of', SIZES.length);
await browser.close();
process.exit(bad === 0 ? 0 : 1);
