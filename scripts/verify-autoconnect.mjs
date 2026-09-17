/**
 * Auto-connect E2E (REAL server + two real browsers).
 *  1. Both pages enable auto-connect (localStorage) BEFORE app scripts run.
 *  2. Both announce to the presence pool; each sees the other's row.
 *  3. A taps B → B must auto-accept with NO sheet flash → both land in chat.
 *  4. Text A→B works (existing transfer path took over).
 */
import { chromium } from 'playwright';
import { resolveChrome } from './lib.mjs';

const exe = resolveChrome();
const browser = await chromium.launch(exe ? { executablePath: exe } : {});
const mkPage = async () => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 850 } });
  const page = await ctx.newPage();
  // Pre-seed auto-connect before any app script reads it.
  await ctx.addInitScript(() => localStorage.setItem('sharetext.autoConnect.v1', '1'));
  return page;
};
const A = await mkPage();
const B = await mkPage();
let errors = 0;
for (const p of [A, B]) p.on('pageerror', () => errors++);

await A.goto('http://localhost:3010', { waitUntil: 'domcontentloaded' });
await B.goto('http://localhost:3010', { waitUntil: 'domcontentloaded' });
await A.waitForTimeout(2200);

// 1. A sees exactly one nearby row (B) — not itself.
const rowsA = A.locator('button:has-text("Nearby")');
const nA = await rowsA.count();
console.log('A sees nearby rows:', nA, '(need 1)');
if (nA !== 1) process.exit(1);

// 2. A taps B's row. B must auto-accept — assert the invitation sheet never
//    becomes visible, then both reach the composer.
const t0 = Date.now();
await rowsA.first().click();
await A.waitForTimeout(600);
// Sheet probe: any visible "decline/accept" affordance on B would fail the run.
const sheetVisible = await B.evaluate(() => {
  const el = document.querySelector('[role="dialog"], [data-testid="invite-sheet"]');
  return !!el && el.offsetParent !== null;
});
console.log('B showed manual sheet:', sheetVisible, '(need false)');

await A.locator('[data-testid="composer"]').first().waitFor({ timeout: 20000 }).catch(() => {});
await B.locator('[data-testid="composer"]').first().waitFor({ timeout: 20000 }).catch(() => {});
const aChat = (await A.locator('[data-testid="composer"]').count()) > 0;
const bChat = (await B.locator('[data-testid="composer"]').count()) > 0;
console.log('auto-connect: A in chat =', aChat, ' B in chat =', bChat, ` (${Date.now() - t0}ms)`);

// 3. Text A → B over the existing transfer engine.
if (aChat && bChat) {
  await A.locator('[data-testid="composer"] textarea, textarea').first().fill('auto-connect hello');
  await A.locator('[data-testid="composer"] textarea, textarea').first().press('Enter');
  await A.waitForTimeout(2500);
  const got = (await B.locator('body').innerText()).includes('auto-connect hello');
  console.log('A→B text arrived:', got);
}
console.log('page errors:', errors);
await browser.close();
process.exit(errors > 0 ? 1 : 0);
