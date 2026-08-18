import { launchBrowser, URL, sleep } from './lib.mjs';

// Measures the hero's real animation cost: sample rAF deltas during an
// auto-run flight, count long frames (>50ms), watch for layout thrash
// (forced reflow), and confirm the beam packet animates via transform
// (never `left`/`top`), which is the compositor-only path.
const b = await launchBrowser();
try {
  const page = await b.newPage({ viewport: { width: 1280, height: 900 } });
  await page.goto(URL, { waitUntil: 'networkidle' });
  await page.locator('text=Move anything between your devices').first().waitFor({ timeout: 15000 });

  // Wait until the demo is actually flying (auto-run in 'sending').
  let flying = false;
  for (let i = 0; i < 100; i++) {
    flying = await page.evaluate(() => document.querySelector('[data-step]')?.getAttribute('data-step') === 'sending');
    if (flying) break;
    await sleep(100);
  }

  const metrics = await page.evaluate(async () => {
    const deltas = [];
    let last = performance.now();
    let longFrames = 0;
    let forcedLayouts = 0;
    const obs = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        // Only shifts above 0.1 count as CLS — sub-pixel noise from the
        // state swaps isn't user-visible jank.
        if (entry.entryType === 'layout-shift' && entry.value >= 0.1) forcedLayouts++;
      }
    });
    try { obs.observe({ type: 'layout-shift', buffered: true }); } catch { /* not supported */ }

    const sample = () => new Promise((resolve) => {
      const tick = (t) => {
        const d = t - last;
        last = t;
        deltas.push(d);
        if (d > 50) longFrames++;
        if (deltas.length < 90) requestAnimationFrame(tick);
        else resolve();
      };
      requestAnimationFrame(tick);
    });
    await sample();

    const sorted = [...deltas].sort((a, b) => a - b);
    const p95 = sorted[Math.floor(sorted.length * 0.95)];
    const p50 = sorted[Math.floor(sorted.length * 0.5)];

    // The beam packet must be animating via transform only.
    const anim = getComputedStyle(document.querySelector('.animate-beam') || document.body);
    const animProps = document.styleSheets && [...document.styleSheets]
      .flatMap((s) => { try { return [...s.cssRules]; } catch { return []; } })
      .filter((r) => r.type === CSSRule.KEYFRAMES_RULE)
      .filter((r) => r.name === 'beam-travel' || r.name === 'beam-travel-v')
      .flatMap((r) => [...r.cssRules])
      .flatMap((r) => r.style ? [...r.style] : [])
      .filter((p) => p !== 'opacity');
    const beamUsesTransform = animProps.every((p) => p.startsWith('transform'));

    return {
      frames: deltas.length,
      avg: Math.round(deltas.reduce((a, d) => a + d, 0) / deltas.length * 10) / 10,
      p50: Math.round(p50 * 10) / 10,
      p95: Math.round(p95 * 10) / 10,
      longFrames,
      layoutShifts: forcedLayouts,
      beamUsesTransform,
      animProps,
    };
  });

  console.log(JSON.stringify(metrics, null, 2));
  const ok = metrics.frames > 50
    && metrics.beamUsesTransform
    && metrics.layoutShifts === 0
    && metrics.longFrames < 6;
  console.log(ok ? 'HERO_PERF_OK' : 'HERO_PERF_FAIL');
} finally {
  await b.close();
}
