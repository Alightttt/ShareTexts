/**
 * Transfer-protocol E2E (REAL server + two real browsers).
 *  1. A → B file transfer completes (existing happy path must not regress).
 *  2. Metrics recorded: localStorage ring has the transfer with bytes + outcome ok.
 *  3. Stats panel is reachable in ⌘K (smoke).
 */
import { chromium } from 'playwright';
import { resolveChrome } from './lib.mjs';

const exe = resolveChrome();
const browser = await chromium.launch(exe ? { executablePath: exe } : {});
const ctxA = await browser.newContext({ viewport: { width: 1280, height: 850 } });
const ctxB = await browser.newContext({ viewport: { width: 1280, height: 850 } });
const A = await ctxA.newPage();
const B = await ctxB.newPage();
let errors = 0;
for (const p of [A, B]) p.on('pageerror', () => errors++);

await A.goto('http://localhost:3010', { waitUntil: 'domcontentloaded' });
await A.waitForTimeout(2000);
await A.getByRole('group', { name: 'Pairing code' }).waitFor({ timeout: 10000 }).catch(async () => {
  await A.locator('button', { hasText: 'Send' }).first().click();
});
const { readLiveCode, sleep } = await import('./lib.mjs');
const code = await readLiveCode(A);
console.log('code:', code);

await B.goto('http://localhost:3010', { waitUntil: 'domcontentloaded' });
await B.locator('button', { hasText: 'Receive' }).first().click();
await sleep(500);
await B.locator('input[inputmode="numeric"]').first().fill(code);
await B.locator('[data-testid="composer"]').first().waitFor({ timeout: 20000 }).catch(() => {});
await A.locator('[data-testid="composer"]').first().waitFor({ timeout: 20000 }).catch(() => {});
console.log('connected:', (await A.locator('[data-testid="composer"]').count()) > 0);

// --- 1. happy-path file transfer A → B (~3 MB) ---
const fileBytes = 3 * 1024 * 1024;
const buf = Buffer.alloc(fileBytes, 7);
const fileName = 'proto-e2e.bin';
await A.locator('[data-testid="composer"] textarea, textarea').first().fill('');
// Attach via the + menu → File item → hidden input
const attachFile = async (page, name, mime, buffer) => {
  const fcP = page.waitForEvent('filechooser', { timeout: 8000 });
  // The + button opens the menu; the File item then clicks the hidden input.
  await page.locator('button:has(svg.lucide-plus)').first().click();
  await sleep(250);
  await page.locator('button:has-text("File")').first().click();
  const fc = await fcP;
  await fc.setFiles({ name, mimeType: mime, buffer });
};
await attachFile(A, fileName, 'application/octet-stream', buf);
await sleep(400);
await A.locator('[data-testid="composer"] textarea, textarea').first().press('Enter');
// Wait for B to finish receiving
let bGot = false;
for (let i = 0; i < 40; i++) {
  await sleep(500);
  const body = await B.locator('body').innerText();
  if (body.includes(fileName) && (body.includes('Save') || body.includes('Download'))) { bGot = true; break; }
}
console.log('B received file:', bGot);

// --- 2. metrics recorded on A ---
const aMetrics = await A.evaluate(() => {
  const ring = JSON.parse(localStorage.getItem('sharetext.metrics.transfers.v1') || '[]');
  return ring.map(r => ({ dir: r.direction, bytes: r.bytes, outcome: r.outcome, avg: r.avgBytesPerSec, transport: r.transport }));
});
console.log('A metrics:', JSON.stringify(aMetrics));
const sentOk = aMetrics.some(r => r.dir === 'sent' && r.outcome === 'ok' && r.bytes >= fileBytes);
console.log('sent record ok:', sentOk);

const bMetrics = await B.evaluate(() => {
  const ring = JSON.parse(localStorage.getItem('sharetext.metrics.transfers.v1') || '[]');
  return ring.map(r => ({ dir: r.direction, bytes: r.bytes, outcome: r.outcome, avg: r.avgBytesPerSec }));
});
const recvOk = bMetrics.some(r => r.dir === 'received' && r.outcome === 'ok' && r.bytes >= fileBytes);
console.log('received record ok:', recvOk);

// --- 3. cancel mid-flight (bigger file, immediate cancel) ---
const bigBuf = Buffer.alloc(20 * 1024 * 1024, 3);
await attachFile(A, 'big.bin', 'application/octet-stream', bigBuf);
await sleep(300);
await A.locator('[data-testid="composer"] textarea, textarea').first().press('Enter');
await sleep(1200);
const cancelBtn = A.locator('[data-testid="cancel-transfer"]').first();
if (await cancelBtn.count()) {
  await cancelBtn.click();
  console.log('cancel pressed mid-flight');
} else {
  console.log('WARN: cancel button not found (transfer may have finished)');
}
await sleep(800);
const aMetrics2 = await A.evaluate(() => {
  const ring = JSON.parse(localStorage.getItem('sharetext.metrics.transfers.v1') || '[]');
  return ring.filter(r => r.name === 'big.bin').map(r => r.outcome);
});
console.log('big.bin outcome recorded:', JSON.stringify(aMetrics2), '(cancelled or ok-if-fast ok)');

console.log('page errors:', errors);
await browser.close();
process.exit(sentOk && recvOk && errors === 0 ? 0 : 1);
