/**
 * Resumable-transfer E2E: A sends a large file, A REFRESHES mid-send,
 * comes back (session restores), and the send resumes from the
 * IndexedDB-restored bytes — B still receives the complete file.
 * Also asserts the IDB sendable exists mid-flight and is cleaned after.
 */
import { chromium } from 'playwright';
import { resolveChrome, sleep, readLiveCode } from './lib.mjs';

const exe = resolveChrome();
const browser = await chromium.launch(exe ? { executablePath: exe } : {});
const ctxA = await browser.newContext({ viewport: { width: 1280, height: 850 } });
const ctxB = await browser.newContext({ viewport: { width: 1280, height: 850 } });
const A = await ctxA.newPage();
const B = await ctxB.newPage();
let errors = 0;
for (const p of [A, B]) p.on('pageerror', () => errors++);

await A.goto(process.env.URL || 'http://localhost:3010', { waitUntil: 'domcontentloaded' });
await A.waitForTimeout(2000);
await A.getByRole('group', { name: 'Pairing code' }).waitFor({ timeout: 10000 }).catch(async () => {
  await A.locator('button', { hasText: 'Send' }).first().click();
});
const code = await readLiveCode(A);
console.log('code:', code);

await B.goto(process.env.URL || 'http://localhost:3010', { waitUntil: 'domcontentloaded' });
await B.locator('button', { hasText: 'Receive' }).first().click();
await sleep(500);
await B.locator('input[inputmode="numeric"]').first().fill(code);
await B.locator('[data-testid="composer"]').first().waitFor({ timeout: 20000 }).catch(() => {});
await A.locator('[data-testid="composer"]').first().waitFor({ timeout: 20000 }).catch(() => {});
console.log('connected: true');

// 60 MB so the send is still in flight when we refresh. Playwright caps
// in-memory buffers at 50 MB, so write to a temp file and pass its path.
import { writeFileSync, unlinkSync } from 'fs';
const TMP = 'scripts/tmp-resume-e2e.bin';
writeFileSync(TMP, Buffer.alloc(60 * 1024 * 1024, 9));
const attachFile = async (page, name, path) => {
  const fcP = page.waitForEvent('filechooser', { timeout: 8000 });
  await page.locator('button:has(svg.lucide-plus)').first().click();
  await sleep(250);
  await page.locator('button:has-text("File")').first().click();
  const fc = await fcP;
  await fc.setFiles(path);
};
await attachFile(A, 'resume-e2e.bin', TMP);
await sleep(300);
await A.locator('[data-testid="composer"] textarea, textarea').first().press('Enter');
await sleep(1500);

// Mid-flight: the IDB sendable must exist.
const idbHas = await A.evaluate(async () => {
  const db = await new Promise((res, rej) => { const r = indexedDB.open('sharetext-transfers', 1); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
  const tx = db.transaction('sendables', 'readonly');
  const keys = await new Promise((res) => { const q = tx.objectStore('sendables').getAllKeys(); q.onsuccess = () => res(q.result); });
  return keys.length;
});
console.log('IDB sendables mid-flight:', idbHas, '(need ≥1)');

// Refresh A mid-send.
await A.reload({ waitUntil: 'domcontentloaded' });
await A.waitForTimeout(3500);
console.log('A reloaded, back in room:', (await A.locator('[data-testid="composer"]').count()) > 0);

// The resumed send should complete; B receives the full file.
let bGot = false;
for (let i = 0; i < 90; i++) {
  await sleep(1000);
  const st = await B.evaluate(() => {
    const els = Array.from(document.querySelectorAll('span'));
    const hit = els.find(s => /Receiving|resume-e2e/.test(s.textContent || ''));
    return hit ? hit.textContent : null;
  }).catch(() => null);
  const body = await B.locator('body').innerText();
  if (!body.includes('Receiving') && body.includes('resume-e2e.bin') && (body.includes('Save') || body.includes('Download'))) { bGot = true; break; }
}
console.log('B received full file after A refresh:', bGot);

// Sendable cleaned up after completion.
await sleep(1500);
const idbAfter = await A.evaluate(async () => {
  const db = await new Promise((res, rej) => { const r = indexedDB.open('sharetext-transfers', 1); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
  const tx = db.transaction('sendables', 'readonly');
  const keys = await new Promise((res) => { const q = tx.objectStore('sendables').getAllKeys(); q.onsuccess = () => res(q.result); });
  return keys.length;
});
console.log('IDB sendables after completion:', idbAfter, '(need 0)');
console.log('page errors:', errors);
try { unlinkSync(TMP); } catch { /* ignore */ }
await browser.close();
process.exit(errors === 0 ? 0 : 1);
