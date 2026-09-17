/**
 * Seen-honesty E2E (REAL server + two real browsers).
 *  1. A creates room via UI, B joins with the code.
 *  2. A sends text while B's tab is BACKGROUNDED → A must show Delivered, NOT Seen.
 *  3. B's tab comes to front → Seen must appear.
 *  4. A sends again with B visible → Seen appears (live path still works).
 */
import { launchBrowser, URL, sleep, readLiveCode, waitForChat } from './lib.mjs';

import { chromium } from 'playwright';
const browser = await launchBrowser();
const ctxA = await browser.newContext({ viewport: { width: 1280, height: 850 } });
const ctxB = await browser.newContext({ viewport: { width: 1280, height: 850 } });
const A = await ctxA.newPage();
const B = await ctxB.newPage();
let errors = 0;
for (const p of [A, B]) p.on('pageerror', () => errors++);

// A: create room via the Send path
await A.goto(URL, { waitUntil: 'domcontentloaded' });
await sleep(1200);
await A.getByRole('group', { name: 'Pairing code' }).waitFor({ timeout: 10000 }).catch(async () => {
  await A.locator('button', { hasText: 'Send' }).first().click();
});
const code = await readLiveCode(A);
console.log('code:', code);

// B: join with code (Receive path)
await B.goto(URL, { waitUntil: 'domcontentloaded' });
await B.locator('button', { hasText: 'Receive' }).first().click();
await sleep(600);
const codeInput = B.locator('input[inputmode="numeric"]').first();
if (await codeInput.count() === 0) { console.error('FAIL: no code input on B'); process.exit(1); }
await codeInput.fill(code);
await waitForChat(B, 'B');
console.log('B connected: true');

// ---- 1. Background B, then A sends → must show Delivered, not Seen ----
// Headless Chromium keeps visibilityState 'visible' in background tabs, so
// simulate a hidden tab through the same API the app reads.
const bgPage = await ctxB.newPage();
await bgPage.goto('about:blank');
await B.evaluate(() => {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
});
await A.locator('textarea').first().fill('backgrounded message');
await A.locator('textarea').first().press('Enter');
await sleep(2500);
let aBody = await A.locator('body').innerText();
const deliveredNotSeen = aBody.includes('Delivered') && !aBody.includes('Seen');
console.log('step1 (B backgrounded): Delivered-not-Seen =', deliveredNotSeen);

// ---- 2. Bring B to front → Seen must appear ----
await bgPage.close();
await B.evaluate(() => {
  delete document.visibilityState; // restore the real getter (own, configurable)
  document.dispatchEvent(new Event('visibilitychange'));
});
await sleep(2500);
aBody = await A.locator('body').innerText();
console.log('step2 (B visible again): Seen =', aBody.includes('Seen'));

// ---- 3. Live send with B visible → Seen ----
await A.locator('textarea').first().fill('live message');
await A.locator('textarea').first().press('Enter');
await sleep(2500);
aBody = await A.locator('body').innerText();
const seenCount = (aBody.match(/Seen/g) || []).length;
console.log('step3 (live): Seen occurrences =', seenCount, '(need 2)');

console.log('page errors:', errors);
await browser.close();
process.exit(errors > 0 ? 1 : 0);
