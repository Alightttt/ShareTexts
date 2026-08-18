// Layout / accessibility audit: horizontal overflow, touch-target sizes, console errors.
import { launchBrowser, URL, sleep } from './lib.mjs';

const browser = await launchBrowser();
const errors = [];

function auditPage(page, label, minTarget = 40) {
  return page.evaluate(({ label, minTarget }) => {
    const issues = [];
    const doc = document.documentElement;
    const overflowX = doc.scrollWidth - doc.clientWidth;
    if (overflowX > 2) issues.push(`horizontal overflow: ${overflowX}px`);
    document.querySelectorAll('button').forEach(b => {
      const r = b.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) return;
      if (r.height < minTarget && !b.classList.contains('hidden')) {
        issues.push(`small touch target: "${b.textContent.trim().slice(0, 30)}" ${r.width.toFixed(0)}x${r.height.toFixed(0)}`);
      }
    });
    return { label, issues };
  }, { label, minTarget });
}

// --- Mobile landing + waiting + join ---
const ctxM = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
const m = await ctxM.newPage();
m.on('pageerror', e => errors.push(`[mobile:ERROR] ${e.message}`));
await m.goto(URL, { waitUntil: 'networkidle' });
console.log('mobile landing:', JSON.stringify(await auditPage(m, 'landing')));
await m.getByRole('button', { name: 'Send' }).first().click();
await m.getByText('LIVE CODE').waitFor({ timeout: 10000 });
console.log('mobile waiting:', JSON.stringify(await auditPage(m, 'waiting')));
await m.getByRole('button', { name: 'Show QR Code' }).click();
await sleep(600);
console.log('mobile QR:', JSON.stringify(await auditPage(m, 'qr')));
await m.getByRole('button', { name: 'Hide QR Code' }).click().catch(() => {});
await m.getByRole('button', { name: 'How this works' }).click();
await sleep(400);
console.log('mobile how-it-works open:', JSON.stringify(await auditPage(m, 'how')));

// --- Join screen mobile ---
const ctxJ = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
const j = await ctxJ.newPage();
j.on('pageerror', e => errors.push(`[join:ERROR] ${e.message}`));
await j.goto(URL, { waitUntil: 'networkidle' });
await j.getByRole('button', { name: 'Receive' }).first().click();
await sleep(800);
console.log('mobile join:', JSON.stringify(await auditPage(j, 'join')));

// --- Chat view (desktop) ---
const ctxA = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const ctxB = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
const A = await ctxA.newPage();
const B = await ctxB.newPage();
A.on('pageerror', e => errors.push(`[chatA:ERROR] ${e.message}`));
B.on('pageerror', e => errors.push(`[chatB:ERROR] ${e.message}`));
await A.goto(URL, { waitUntil: 'networkidle' });
await A.getByRole('button', { name: 'Send' }).first().click();
await A.getByText('LIVE CODE').waitFor({ timeout: 10000 });
const digits = await A.locator('span').filter({ hasText: /^\d$/ }).allTextContents();
const code = digits.slice(-6).join('');
await B.goto(URL, { waitUntil: 'networkidle' });
await B.getByRole('button', { name: 'Receive' }).first().click();
await B.locator('input[inputmode="numeric"]').fill(code);
await sleep(4000);
await A.locator('textarea').first().fill('Hello from desktop with a fairly long message that should wrap nicely on mobile screens.');
await A.getByRole('button', { name: 'Send' }).click();
await sleep(2000);
console.log('desktop chat:', JSON.stringify(await auditPage(A, 'chat-desktop')));
console.log('mobile chat:', JSON.stringify(await auditPage(B, 'chat-mobile')));

console.log('\n--- PAGE ERRORS ---');
console.log(errors.length ? errors.join('\n') : '(none)');
await browser.close();
