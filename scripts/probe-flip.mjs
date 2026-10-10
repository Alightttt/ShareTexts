// Probe: how long does the theme flip (click → .dark class on <html>) actually
// take, and is the cost the View Transition path or just slow frames?
// Usage: node scripts/probe-flip.mjs  (URL=http://localhost:3010 to override)
import { chromium, devices } from 'playwright';

const URL = process.env.URL || 'http://localhost:3010';
const b = await chromium.launch();

async function measure(ctx, label) {
  const page = await ctx.newPage();
  await page.goto(URL, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1200);
  await page.evaluate(() => localStorage.setItem('sharetext.theme', 'light'));
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1000);
  const r = await page.evaluate(async () => {
    const btn = document.querySelector('[data-testid="theme-toggle"]');
    const nav = navigator;
    const hasVT = typeof document.startViewTransition === 'function';
    // idle frame cadence baseline: 6 rAFs
    const t0 = performance.now();
    const gaps = [];
    let last = t0;
    await new Promise((res) => {
      let n = 0;
      const tick = () => {
        const now = performance.now();
        gaps.push(Math.round(now - last));
        last = now;
        if (++n >= 6) return res();
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    const baselineGaps = gaps.slice(1); // first gap includes setup
    // the actual flip measurement (same as verify-mobile-ui)
    const s0 = performance.now();
    btn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    const flipMs = await new Promise((res) => {
      const tick = () => {
        if (document.documentElement.classList.contains('dark')) return res(performance.now() - s0);
        if (performance.now() - s0 > 2000) return res(-1);
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    return {
      flipMs: Math.round(flipMs * 10) / 10,
      hasVT,
      cores: nav.hardwareConcurrency,
      memory: nav.deviceMemory,
      reduced: matchMedia('(prefers-reduced-motion: reduce)').matches,
      baselineGaps,
      vtAttr: document.documentElement.hasAttribute('st-theme-vt'),
    };
  });
  await page.close();
  console.log(`${label}: flip=${r.flipMs}ms vt=${r.hasVT} cores=${r.cores} mem=${r.memory} reduced=${r.reduced} vtAttrAfter=${r.vtAttr} frameGaps=${r.baselineGaps.join(',')}`);
  return r;
}

// A: iPhone 13 emulation — the check's own environment
const mob = await b.newContext({ ...devices['iPhone 13'] });
await measure(mob, 'mobile  VT-on  ');
await mob.close();

const mob2 = await b.newContext({ ...devices['iPhone 13'], reducedMotion: 'reduce' });
await measure(mob2, 'mobile  reduced(instant path)');
await mob2.close();

// C: desktop viewport, VT on
const desk = await b.newContext({ viewport: { width: 1280, height: 800 } });
await measure(desk, 'desktop VT-on  ');
await desk.close();

await b.close();
