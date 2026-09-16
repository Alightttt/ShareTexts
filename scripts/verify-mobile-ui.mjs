import { chromium, devices } from 'playwright';
import { readLiveCode } from './lib.mjs';
const URL = process.env.URL || 'http://localhost:3010';
const browser = await chromium.launch();
const ok = (name, cond) => console.log(`${cond ? 'PASS' : 'FAIL'} ${name}`);

// ── Mobile idle checks ────────────────────────────────────────────
const M = await browser.newContext({ ...devices['iPhone 13'] }).then(c => c.newPage());
const errors = [];
M.on('pageerror', e => errors.push('M: ' + e.message));
await M.goto(URL, { waitUntil: 'domcontentloaded' });
await M.waitForTimeout(1500);

// Theme toggle instant on mobile.
await M.evaluate(() => localStorage.setItem('sharetext.theme', 'light'));
await M.reload({ waitUntil: 'domcontentloaded' });
await M.waitForTimeout(1000);
const flipMs = await M.evaluate(async () => {
  const btn = document.querySelector('[role="switch"][aria-label="Toggle dark mode"]');
  const t0 = performance.now();
  btn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  return new Promise(res => {
    const tick = () => {
      if (document.documentElement.classList.contains('dark')) return res(performance.now() - t0);
      if (performance.now() - t0 > 2000) return res(-1);
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
});
ok(`mobile theme flip < 40ms (${flipMs.toFixed(1)}ms)`, flipMs >= 0 && flipMs < 40);

// Mobile header heights.
const headerHeights = await M.evaluate(() => {
  const header = document.querySelector('header');
  const controls = header.querySelectorAll('a[href="/docs"], button[aria-haspopup="listbox"], [role="switch"]');
  return Array.from(controls).map(c => Math.round(c.getBoundingClientRect().height));
});
ok(`mobile header uniform (${headerHeights.join(',')})`, headerHeights.length >= 3 && headerHeights.every(h => h === 40));

// ── Room flow on mobile: connect A(mobile) to B(desktop) ─────────
const D = await browser.newPage();
await D.goto(URL, { waitUntil: 'domcontentloaded' });
await D.waitForTimeout(1200);
await D.getByRole('button', { name: 'Send' }).click();
await D.getByRole('group', { name: 'Pairing code' }).waitFor({ timeout: 10000 });
const code = await readLiveCode(D);

await M.getByRole('button', { name: 'Receive' }).click();
await M.waitForTimeout(500);
await M.locator('input[inputmode="numeric"]').fill(code);
await M.waitForTimeout(3500);

const connected = await M.evaluate(() => !!document.querySelector('[data-app-state="connected"]'));
ok('mobile connected into room', connected);

// Composer autofocused after connect (caret in box).
const focused = await M.evaluate(() => document.activeElement?.tagName === 'TEXTAREA');
ok(`composer focused after connect (${focused})`, focused);

// + menu still opens (fix regression check on this fresh flow).
const plus = M.locator('[data-testid="add-attachment"]');
await plus.tap();
await M.waitForTimeout(700);
const menuOpen = await M.evaluate(() => !!document.querySelector('[role="menu"]'));
ok('+ menu opens on mobile (tap #1)', menuOpen);
await M.evaluate(() => document.querySelector('textarea')?.blur());
await M.keyboard.press('Escape');
await M.waitForTimeout(400);

// Composer geometry: single-line pill ~44px; + and send vertically centered.
const geo = await M.evaluate(() => {
  const plus = document.querySelector('[data-testid="add-attachment"]').getBoundingClientRect();
  const send = document.querySelector('[data-testid="send"]').getBoundingClientRect();
  const ta = document.querySelector('[data-testid="composer"]').getBoundingClientRect();
  return {
    pillH: Math.round(ta.height),
    dPlusSend: Math.abs((plus.top + plus.height / 2) - (send.top + send.height / 2)),
    dTaSend: Math.abs((ta.top + ta.height / 2) - (send.top + send.height / 2)),
  };
});
ok(`composer pill ~44px (${geo.pillH})`, geo.pillH >= 42 && geo.pillH <= 50);
ok(`+/send centers aligned (${geo.dPlusSend.toFixed(1)}px)`, geo.dPlusSend < 1.5);
ok(`textarea/send centers aligned (${geo.dTaSend.toFixed(1)}px)`, geo.dTaSend < 1.5);

// Stay badge appears instantly on BOTH devices when enabled from mobile.
await M.evaluate(() => document.querySelector('[data-testid="connection-details"]')?.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })));
await M.waitForTimeout(600);
const toggle = M.locator('[data-testid="stay-connected-toggle"]');
const hasToggle = await toggle.count();
if (hasToggle) {
  await toggle.click();
  await M.waitForTimeout(900);
  const badgeM = await M.evaluate(() => !!document.querySelector('[data-testid="stay-badge"]'));
  const badgeD = await D.evaluate(() => !!document.querySelector('[data-testid="stay-badge"]'));
  ok(`stay badge on mobile (${badgeM})`, badgeM);
  ok(`stay badge echoed to desktop (${badgeD})`, badgeD);
} else {
  console.log('WARN: no stay toggle found in details sheet');
}

// Screenshots for typography/spacing review.
await M.screenshot({ path: 'scripts/tmp-mobile-room.png' });
await D.screenshot({ path: 'scripts/tmp-desktop-room.png' });

console.log('PAGE ERRORS:', errors.length ? errors.join(' | ') : 'none');
await browser.close();
