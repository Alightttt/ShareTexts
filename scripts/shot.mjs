// Screenshot the landing at several viewports for design review.
// Usage: node scripts/shot.mjs [outPrefix]  (URL=http://localhost:3010)
import { chromium } from 'playwright';

const URL = process.env.URL || 'http://localhost:3010';
const prefix = process.argv[2] || 'design';
const b = await chromium.launch();

const views = [
  ['desktop', 1280, 800, 'light'],
  ['mobile', 390, 844, 'light'],
  ['desktop-dark', 1280, 800, 'dark'],
];

for (const [name, w, h, scheme] of views) {
  const ctx = await b.newContext({ viewport: { width: w, height: h }, colorScheme: scheme });
  const p = await ctx.newPage();
  await p.addInitScript((s) => localStorage.setItem('sharetext.theme', s), scheme);
  await p.goto(URL, { waitUntil: 'networkidle' });
  await p.waitForTimeout(1800);
  await p.screenshot({ path: `scripts/shots/${prefix}-${name}.png` });
  // Scroll the landing to its end — the footer reveal state. Walk up from
  // #main-content to the first actually-scrollable ancestor (desktop scrolls
  // main itself; mobile scrolls an outer wrapper).
  const scrolled = await p.evaluate(() => {
    // Walk up to the first ACTUALLY scrollable ancestor: content taller than
    // the box AND overflow that permits scrolling (mobile has an inner
    // min-h-full wrapper that overflows but cannot itself scroll).
    const canScroll = (el) => {
      const oy = getComputedStyle(el).overflowY;
      return el.scrollHeight > el.clientHeight + 1 && (oy === 'auto' || oy === 'scroll');
    };
    let el = document.getElementById('main-content');
    while (el && !canScroll(el)) el = el.parentElement;
    const target = el || document.scrollingElement;
    target.scrollTo({ top: target.scrollHeight, behavior: 'instant' });
    return { tag: target.tagName, id: target.id, scrollTop: Math.round(target.scrollTop) };
  });
  console.log(`${name}: scroll -> ${JSON.stringify(scrolled)}`);
  await p.waitForTimeout(600);
  await p.screenshot({ path: `scripts/shots/${prefix}-${name}-bottom.png` });
  const meta = await p.evaluate(() => {
    const m = document.getElementById('main-content');
    return {
      docH: document.documentElement.scrollHeight,
      winH: innerHeight,
      overflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      innerScroll: m ? m.scrollHeight - m.clientHeight : 0,
    };
  });
  console.log(`${name}: docH=${meta.docH} winH=${meta.winH} overflowX=${meta.overflowX} innerScroll=${meta.innerScroll}`);
  await ctx.close();
}
await b.close();
console.log('done -> scripts/shots/' + prefix + '-*.png');
