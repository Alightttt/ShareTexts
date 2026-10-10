// Does the hero demo's animation loop delay the rendering update where the
// View Transition captures? Measure capture (dispatch → VT cb) on '/' vs a
// route with no demo animations, VT on and reduced-motion (instant) paths.
import { chromium, devices } from 'playwright';

const URL = process.env.URL || 'http://localhost:3010';
const b = await chromium.launch();

async function capture(path, label, reduced = false) {
  const ctx = await b.newContext({ ...devices['iPhone 13'], ...(reduced ? { reducedMotion: 'reduce' } : {}) });
  const p = await ctx.newPage();
  await p.goto(URL + path, { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(1200);
  if (path === '/') {
    await p.evaluate(() => localStorage.setItem('sharetext.theme', 'light'));
    await p.reload({ waitUntil: 'domcontentloaded' });
    await p.waitForTimeout(1000);
  } else {
    await p.evaluate(() => localStorage.setItem('sharetext.theme', 'light'));
    await p.reload({ waitUntil: 'domcontentloaded' });
    await p.waitForTimeout(800);
  }
  const r = await p.evaluate(async () => {
    const btn = document.querySelector('[data-testid="theme-toggle"]');
    if (!btn) return { err: 'no toggle' };
    let stCall = 0, cbIn = 0;
    const orig = document.startViewTransition.bind(document);
    document.startViewTransition = (cb) => {
      stCall = performance.now();
      return orig(() => { cbIn = performance.now(); cb(); });
    };
    const t0 = performance.now();
    btn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    const classSet = await new Promise((res) => {
      const mo = new MutationObserver(() => {
        if (document.documentElement.classList.contains('dark')) { mo.disconnect(); res(performance.now()); }
      });
      mo.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
      setTimeout(() => { mo.disconnect(); res(-1); }, 3000);
    });
    return {
      app: stCall ? +(stCall - t0).toFixed(1) : -1,
      capture: cbIn ? +(cbIn - t0).toFixed(1) : -1,
      classSet: classSet > 0 ? +(classSet - t0).toFixed(1) : -1,
    };
  });
  console.log(`${label}: app=${r.app}ms capture=${r.capture}ms classSet=${r.classSet}ms${r.err ? ' (' + r.err + ')' : ''}`);
  await ctx.close();
  return r;
}

for (let i = 0; i < 3; i++) await capture('/', `/'  VT   #${i + 1}`);
for (let i = 0; i < 2; i++) await capture('/docs', `/docs VT   #${i + 1}`);
for (let i = 0; i < 2; i++) await capture('/', `/'  inst #${i + 1}`, true);
await b.close();
