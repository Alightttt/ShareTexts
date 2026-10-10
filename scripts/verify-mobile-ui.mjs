import { chromium, devices } from 'playwright';
import { readLiveCode } from './lib.mjs';
const URL = process.env.URL || 'http://localhost:3010';
const browser = await chromium.launch();
// Exit-gating: a FAIL line must fail the run. The old logger printed FAILs
// but exited 0, so this suite could go red on screen and green in CI.
let failures = 0;
const ok = (name, cond) => {
  console.log(`${cond ? 'PASS' : 'FAIL'} ${name}`);
  if (!cond) failures++;
};

// ── Mobile idle checks ────────────────────────────────────────────
const M = await browser.newContext({ ...devices['iPhone 13'] }).then(c => c.newPage());
const errors = [];
M.on('pageerror', e => errors.push('M: ' + e.message));
await M.goto(URL, { waitUntil: 'domcontentloaded' });
await M.waitForTimeout(1500);

// ── Theme flip responsiveness ─────────────────────────────────────────
// The perceptible moment is the .dark class landing on <html> — that frame
// is when the new theme can paint. Measured with a MutationObserver, which
// fires at the mutation itself; the old check polled the NEXT rAF after the
// flip, silently adding a sampling frame that no user experiences.
//
// Two lanes, both real contracts:
//   • blur-fade lane (shipped in 61e4e5e): the View Transition waits for the
//     next rendering update before flipping — budget 100ms (RAIL input
//     response; observed 12–66ms idle on dev AND prod, app code 1–9ms).
//   • reduced-motion lane: themeTransition.ts rule 1 — no code path waits on
//     an animation — so the flip must be instant (<40ms; observed ~5ms).
// The original "<40ms sampled a frame late" assertion predates the
// cross-fade (83df350 < 61e4e5e) and failed by construction against it.
const measureFlip = (page) => page.evaluate(async () => {
  const btn = document.querySelector('[data-testid="theme-toggle"]');
  if (!btn) return -2;
  const t0 = performance.now();
  const flipAt = await new Promise((res) => {
    const mo = new MutationObserver(() => {
      if (document.documentElement.classList.contains('dark')) {
        mo.disconnect();
        res(performance.now());
      }
    });
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    btn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    setTimeout(() => { mo.disconnect(); res(-1); }, 3000);
  });
  return +(flipAt - t0).toFixed(1);
});

await M.evaluate(() => localStorage.setItem('sharetext.theme', 'light'));
await M.reload({ waitUntil: 'domcontentloaded' });
await M.waitForTimeout(1000);
const flipMs = await measureFlip(M);
ok(`mobile theme flip perceptible < 100ms (${flipMs}ms)`, flipMs >= 0 && flipMs < 100);

// Reduced-motion lane: no View Transition is allowed to gate the flip.
const RM = await browser.newContext({ ...devices['iPhone 13'], reducedMotion: 'reduce' });
const RMp = await RM.newPage();
await RMp.goto(URL, { waitUntil: 'domcontentloaded' });
await RMp.waitForTimeout(1200);
await RMp.evaluate(() => localStorage.setItem('sharetext.theme', 'light'));
await RMp.reload({ waitUntil: 'domcontentloaded' });
await RMp.waitForTimeout(800);
const rmFlipMs = await measureFlip(RMp);
ok(`reduced-motion flip instant < 40ms (${rmFlipMs}ms)`, rmFlipMs >= 0 && rmFlipMs < 40);
await RM.close();

// Mobile header heights. NOTE: the header intentionally has NO Docs link
// anymore (usability audit #10 — it lives in the footer only), so the
// uniform-slot check covers language menu + theme toggle + command chip.
const headerHeights = await M.evaluate(() => {
  const header = document.querySelector('header');
  const controls = header.querySelectorAll('button[aria-haspopup="listbox"], [role="switch"], button');
  return Array.from(controls).filter(c => c.getBoundingClientRect().height > 0).map(c => Math.round(c.getBoundingClientRect().height));
});
ok(`mobile header uniform (${headerHeights.join(',')})`, headerHeights.length >= 2 && headerHeights.every(h => h === 40));

// ── Room flow on mobile: connect A(mobile) to B(desktop) ─────────
const D = await browser.newPage();
await D.goto(URL, { waitUntil: 'domcontentloaded' });
await D.waitForTimeout(1200);
// The landing has TWO buttons named "Send" since the visitor-driven demo:
// the real hero CTA (home-send) and the demo's control (demo-send). This
// suite drives the real app entry — pin it by testid.
await D.getByTestId('home-send').click();
await D.getByRole('group', { name: 'Pairing code' }).waitFor({ timeout: 10000 });
const code = await readLiveCode(D);

await M.getByRole('button', { name: 'Receive' }).click();
await M.waitForTimeout(500);
// The join code is now Rare UI's OtpInput: six slots, six inputs. Fill the
// first slot — its paste/fill-forward path distributes the code across all
// six and completes, which is exactly what a human paste does.
await M.locator('[data-testid="join-code-input"] input[inputmode="numeric"]').first().fill(code);
// Wait for the real condition, not a fixed 3.5s sleep: under load the sleep
// was too short, the connect MISS then cascaded into a tap timeout that
// crashed the whole run (an uncaught locator error, not a reported failure).
await M.locator('[data-app-state="connected"]').first().waitFor({ timeout: 15000 }).catch(() => {});

const connected = await M.evaluate(() => !!document.querySelector('[data-app-state="connected"]'));
ok('mobile connected into room', connected);

// Composer autofocused after connect (caret in box). The caret lands AFTER
// the takeover panel settles — ChatView deliberately schedules its first
// attempt at connect+380ms and retries through remounts — so poll for the
// outcome instead of sampling one instant at connect (which raced the
// delay and flaked ~50%). Bound: 3s, far under the 8s retry chain.
const focusWait = await M.evaluate(async () => {
  const t0 = performance.now();
  return await new Promise((res) => {
    const tick = () => {
      if (document.activeElement?.tagName === 'TEXTAREA') return res(Math.round(performance.now() - t0));
      if (performance.now() - t0 > 3000) return res(-1);
      setTimeout(tick, 50);
    };
    tick();
  });
});
ok(`composer focused after connect (${focusWait >= 0 ? focusWait + 'ms' : 'never'})`, focusWait >= 0);

// + menu still opens (fix regression check on this fresh flow). A missing
// composer (connect failed above) must be reported as FAIL, not crash the run.
const plus = M.locator('[data-testid="add-attachment"]');
let menuOpen = false;
if (await plus.count()) {
  try { await plus.tap({ timeout: 5000 }); } catch { /* reported as FAIL below */ }
  await M.waitForTimeout(700);
  menuOpen = await M.evaluate(() => !!document.querySelector('[role="menu"]'));
}
ok('+ menu opens on mobile (tap #1)', menuOpen);
await M.evaluate(() => document.querySelector('textarea')?.blur());
await M.keyboard.press('Escape');
await M.waitForTimeout(400);

// Composer geometry: single-line pill ~44px; + and send vertically centered.
const geo = await M.evaluate(() => {
  const plus = document.querySelector('[data-testid="add-attachment"]')?.getBoundingClientRect();
  const send = document.querySelector('[data-testid="send"]')?.getBoundingClientRect();
  const ta = document.querySelector('[data-testid="composer"]')?.getBoundingClientRect();
  if (!plus || !send || !ta) return null;
  return {
    pillH: Math.round(ta.height),
    dPlusSend: Math.abs((plus.top + plus.height / 2) - (send.top + send.height / 2)),
    dTaSend: Math.abs((ta.top + ta.height / 2) - (send.top + send.height / 2)),
  };
});
ok(`composer pill ~44px (${geo ? geo.pillH : 'composer missing'})`, !!geo && geo.pillH >= 42 && geo.pillH <= 50);
ok(`+/send centers aligned (${geo ? geo.dPlusSend.toFixed(1) + 'px' : 'missing'})`, !!geo && geo.dPlusSend < 1.5);
ok(`textarea/send centers aligned (${geo ? geo.dTaSend.toFixed(1) + 'px' : 'missing'})`, !!geo && geo.dTaSend < 1.5);

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
if (errors.length) failures++;
await browser.close();
if (failures) {
  console.log(`\n${failures} CHECK(S) FAILED`);
  process.exit(1);
}
console.log('\nALL MOBILE UI CHECKS GREEN');
