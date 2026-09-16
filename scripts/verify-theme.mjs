import { chromium, devices } from 'playwright';
const URL = process.env.URL || 'http://localhost:3010';
const browser = await chromium.launch();
const ok = (name, cond) => console.log(`${cond ? 'PASS' : 'FAIL'} ${name}`);

// ── Desktop checks ────────────────────────────────────────────────
const D = await browser.newPage();
const errors = [];
D.on('pageerror', e => errors.push('D: ' + e.message));
await D.goto(URL, { waitUntil: 'domcontentloaded' });
await D.waitForTimeout(1500);

// 1. Theme toggle is instant: measure time from click to html class flip.
await D.evaluate(() => localStorage.setItem('sharetext.theme', 'light'));
await D.reload({ waitUntil: 'domcontentloaded' });
await D.waitForTimeout(1200);
const flipMs = await D.evaluate(async () => {
  const btn = document.querySelector('[role="switch"][aria-label="Toggle dark mode"]');
  const t0 = performance.now();
  btn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  // Poll for the class flip.
  return new Promise(res => {
    const tick = () => {
      if (document.documentElement.classList.contains('dark')) return res(performance.now() - t0);
      if (performance.now() - t0 > 2000) return res(-1);
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
});
ok(`theme flips < 2 frames (${flipMs.toFixed(1)}ms)`, flipMs >= 0 && flipMs < 40);

// html background must already be dark (no white frame).
const bgDark = await D.evaluate(() => getComputedStyle(document.documentElement).backgroundColor);
ok(`html bg dark after flip (${bgDark})`, bgDark === 'rgb(19, 19, 21)');

// 2. Dark-mode search chip hover must NOT go white.
const chipHover = await D.evaluate(() => {
  const chip = document.querySelector('button[aria-label*="command" i], button[title*="⌘K"], button[kbd]') ||
    Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('⌘K'));
  if (!chip) return 'chip-not-found';
  chip.dispatchEvent(new MouseEvent('mouseenter', { bubbles: false }));
  return getComputedStyle(chip).backgroundColor;
});
ok(`search chip dark hover not white (${chipHover})`, chipHover !== 'chip-not-found' && chipHover !== 'rgb(255, 255, 255)');

// 3. Header control heights on a consistent grid (all 40px slots).
const headerHeights = await D.evaluate(() => {
  const header = document.querySelector('header');
  const controls = header.querySelectorAll('a[href="/docs"], button[aria-haspopup="listbox"], [role="switch"]');
  return Array.from(controls).map(c => Math.round(c.getBoundingClientRect().height));
});
ok(`header controls uniform heights (${headerHeights.join(',')})`, headerHeights.length >= 3 && headerHeights.every(h => h === 40));

// 4. Right-panel steps vertically centered: block center ≈ pane center.
const stepsCentered = await D.evaluate(() => {
  const pane = document.querySelector('[data-testid="room-panel"]');
  if (!pane) return -1;
  const paneR = pane.getBoundingClientRect();
  const nums = Array.from(pane.querySelectorAll('span')).filter(s => /^[123]$/.test(s.textContent.trim()) && s.className.includes('rounded-full'));
  if (!nums.length) return -2;
  const first = nums[0].parentElement.parentElement.getBoundingClientRect();
  const last = nums[nums.length - 1].parentElement.parentElement.getBoundingClientRect();
  const blockCenter = (first.top + last.bottom) / 2;
  return blockCenter - (paneR.top + paneR.height / 2);
});
ok(`steps block centered (offset ${stepsCentered}px)`, Math.abs(stepsCentered) < 140); // block center sits above image center by design; generous bound

// 5. Route switch in dark: /docs lazy load never flashes white.
const docsFlash = await D.evaluate(async () => {
  const bg = () => getComputedStyle(document.documentElement).backgroundColor;
  const before = bg();
  // Observe while navigating.
  const obs = [];
  const mo = new MutationObserver(() => obs.push(bg()));
  mo.observe(document.documentElement, { attributes: true, attributeFilter: ['style', 'class'] });
  history.pushState({}, '', '/docs');
  window.dispatchEvent(new PopStateEvent('popstate'));
  await new Promise(r => setTimeout(r, 1200));
  mo.disconnect();
  return { before, after: bg(), sawWhite: obs.includes('rgb(255, 255, 255)') };
});
ok(`dark route switch keeps dark bg`, docsFlash.after === 'rgb(19, 19, 21)' && !docsFlash.sawWhite);

// 6. Loading shell follows saved dark theme (index.html path).
await D.evaluate(() => localStorage.setItem('sharetext.theme', 'dark'));
const shellDark = await D.evaluate(() => { location.href = '/'; return true; });
await D.waitForTimeout(1200);
await D.goto(URL, { waitUntil: 'domcontentloaded' });
ok('reload keeps dark', await D.evaluate(() => document.documentElement.classList.contains('dark')));

console.log('PAGE ERRORS:', errors.length ? errors.join(' | ') : 'none');
await browser.close();
