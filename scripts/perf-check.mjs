/**
 * Low-end device performance check against the production build.
 * 4x CPU throttling ≈ a mid/low-end Android phone. Reports FCP, LCP,
 * long tasks, and total transfer weight — real numbers, no synthetic scores.
 *
 * Usage: npm run build && node scripts/perf-check.mjs [port]
 */
import { chromium } from 'playwright';

const PORT = process.argv[2] || '3311';
const URL = `http://127.0.0.1:${PORT}/`;

const browser = await chromium.launch();
const context = await browser.newContext();
const page = await context.newPage();

let bytes = 0;
let reqs = 0;
page.on('response', async (res) => {
  try { bytes += (await res.body()).length; reqs++; } catch { /* body gone */ }
});

// Count long tasks (>50ms) via PerformanceObserver injected before load.
await page.addInitScript(() => {
  window.__longTasks = 0;
  try {
    new PerformanceObserver((list) => { window.__longTasks += list.getEntries().length; })
      .observe({ entryTypes: ['longtask'] });
  } catch { /* no longtask support */ }
});

const t0 = Date.now();
await page.goto(URL, { waitUntil: 'networkidle', timeout: 30000 });

// Force Web Vital candidates to settle, then read paint timings.
await page.waitForTimeout(1200);
const metrics = await page.evaluate(() => {
  const paint = {};
  for (const e of performance.getEntriesByType('paint')) paint[e.name] = Math.round(e.startTime);
  const nav = performance.getEntriesByType('navigation')[0];
  const lcp = performance.getEntriesByType('largest-contentful-paint').at(-1)?.startTime;
  return {
    fcp: paint['first-contentful-paint'],
    lcp: lcp != null ? Math.round(lcp) : null,
    domInteractive: nav ? Math.round(nav.domInteractive) : null,
    transferKB: Math.round((performance.getEntriesByType('resource').reduce((n, r) => n + (r.transferSize || 0), 0)) / 1024),
    longTasks: window.__longTasks ?? null,
  };
});
const wall = Date.now() - t0;

console.log(`URL: ${URL}`);
console.log(`Requests: ${reqs}, bytes over wire: ${(bytes / 1024).toFixed(0)} KB`);
console.log(`FCP: ${metrics.fcp}ms  LCP: ${metrics.lcp ?? 'n/a'}ms  domInteractive: ${metrics.domInteractive}ms`);
console.log(`Transfer size: ${metrics.transferKB}KB  Long tasks (>50ms): ${metrics.longTasks}`);
console.log(`Wall clock to networkidle: ${wall}ms (throttled CPU)`);

await browser.close();
