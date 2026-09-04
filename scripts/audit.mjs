// Layout / accessibility audit: horizontal overflow, touch-target sizes, console errors.
// Anchored to the single-screen app: idle home hero → sending panel (pairing code +
// QR overlay) → receiving/join panel → connected chat (desktop + mobile).
import { launchBrowser, URL, sleep, readLiveCode, tapTargetIssues } from './lib.mjs';

const browser = await launchBrowser();
const errors = [];

async function auditPage(page, label, minTarget = 40) {
  const overflowX = await page.evaluate(() => {
    const doc = document.documentElement;
    return doc.scrollWidth - doc.clientWidth;
  });
  const issues = (await page.evaluate(tapTargetIssues, { minTarget }))
    .map(i => `small touch target: "${i.name}" ${i.width}x${i.height}`);
  if (overflowX > 2) issues.unshift(`horizontal overflow: ${overflowX}px`);
  return { label, issues };
}

async function auditSendingPanel(page) {
  await page.goto(URL, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Send' }).first().click();
  await page.getByRole('group', { name: 'Pairing code' }).waitFor({ timeout: 10000 });
}

// --- Mobile: idle home → sending panel (with QR overlay) ---
const ctxM = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
const m = await ctxM.newPage();
m.on('pageerror', e => errors.push(`[mobile:ERROR] ${e.message}`));
await m.goto(URL, { waitUntil: 'networkidle' });
console.log('mobile home:', JSON.stringify(await auditPage(m, 'home')));
await m.getByRole('button', { name: 'Send' }).first().click();
await m.getByRole('group', { name: 'Pairing code' }).waitFor({ timeout: 10000 });
console.log('mobile sending:', JSON.stringify(await auditPage(m, 'sending')));
await m.getByRole('button', { name: 'Show QR' }).click();
await sleep(600);
console.log('mobile qr overlay:', JSON.stringify(await auditPage(m, 'qr')));
await m.getByRole('button', { name: 'Close QR code' }).click().catch(() => {});
await sleep(300);

// --- Mobile: receiving / join panel ---
const ctxJ = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
const j = await ctxJ.newPage();
j.on('pageerror', e => errors.push(`[join:ERROR] ${e.message}`));
await j.goto(URL, { waitUntil: 'networkidle' });
await j.getByRole('button', { name: 'Receive' }).first().click();
await j.getByTestId('join-code-input').waitFor({ timeout: 5000 });
await sleep(800);
console.log('mobile join:', JSON.stringify(await auditPage(j, 'join')));

// --- Chat view (desktop A, mobile B) ---
const ctxA = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const ctxB = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
const A = await ctxA.newPage();
const B = await ctxB.newPage();
A.on('pageerror', e => errors.push(`[chatA:ERROR] ${e.message}`));
B.on('pageerror', e => errors.push(`[chatB:ERROR] ${e.message}`));
await auditSendingPanel(A);
const code = await readLiveCode(A);
await B.goto(URL, { waitUntil: 'networkidle' });
await B.getByRole('button', { name: 'Receive' }).first().click();
await B.locator('input[inputmode="numeric"]').fill(code);
await B.getByTestId('composer').first().waitFor({ timeout: 20000 }).catch(() => {});
await A.getByTestId('composer').first().waitFor({ timeout: 20000 }).catch(() => {});  // Two messages (A → B twice) so Copy All — which needs ≥2 messages — is
  // part of the audited inventory on BOTH sides, not just a walk-layouts
  // check. If the pair never reached chat, fail loudly instead of auditing
  // an empty room as "clean".
  for (const text of [
    'Hello from desktop with a fairly long message that should wrap nicely on mobile screens.',
    'A second message, so Copy All appears on both devices.',
  ]) {
    await A.locator('textarea').first().fill(text);
    await A.getByRole('button', { name: 'Send', exact: true }).click();
    await sleep(1500);
  }
  const bHasTwo = await B.evaluate(() => document.body.innerText.includes('Copy All'));
  if (!bHasTwo) throw new Error('chat never reached two messages on B — pairing failed; rerun the audit');
  console.log('desktop chat:', JSON.stringify(await auditPage(A, 'chat-desktop')));
  console.log('mobile chat:', JSON.stringify(await auditPage(B, 'chat-mobile')));

console.log('\n--- PAGE ERRORS ---');
console.log(errors.length ? errors.join('\n') : '(none)');
await browser.close();
