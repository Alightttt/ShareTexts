// Verify the queue's 'Waiting…' state is visible: 3 big files fill all slots,
// files 4-5 must show Waiting… on the sender, then everything completes.
import { launchBrowser, URL, sleep, readLiveCode, waitForChat } from './lib.mjs';
import fs from 'node:fs';
import crypto from 'node:crypto';

const browser = await launchBrowser();
const ctxA = await browser.newContext();
const ctxB = await browser.newContext();
const A = await ctxA.newPage();
const B = await ctxB.newPage();
const errs = [];
A.on('pageerror', e => errs.push(e.message));
B.on('pageerror', e => errs.push(e.message));

await A.goto(URL, { waitUntil: 'networkidle' });
await A.getByRole('button', { name: 'Send', exact: true }).first().click();
await sleep(3000);
const code = await readLiveCode(A);
await B.goto(URL, { waitUntil: 'networkidle' });
await B.getByRole('button', { name: 'Receive', exact: true }).first().click();
await B.locator('input[inputmode="numeric"]').fill(code);
await sleep(6000);
await waitForChat(A); await waitForChat(B);

// 3 × 8 MB (occupy slots for seconds) + 2 tiny (must wait)
const tmp = fs.mkdtempSync('st-qvis-');
const paths = [];
for (let i = 0; i < 3; i++) {
  const p = `${tmp}/big-${i}.bin`;
  fs.writeFileSync(p, crypto.randomBytes(30 * 1024 * 1024));
  paths.push(p);
}
for (let i = 0; i < 2; i++) {
  const p = `${tmp}/small-${i}.txt`;
  fs.writeFileSync(p, 'tiny body ' + i);
  paths.push(p);
}
await A.locator('input[multiple]:not([accept])').setInputFiles(paths);
await sleep(500);
await A.locator('button[data-testid="send"]').click();
await A.waitForFunction(() => document.body.innerText.includes("Waiting…"), null, { timeout: 30000 }).catch(() => {});
const aMid = await A.locator('body').innerText();
const bMid = await B.locator('body').innerText();
const aWaiting = (aMid.match(/Waiting…/g) || []).length;
const bWaiting = (bMid.match(/Waiting…/g) || []).length;
console.log('sender Waiting count:', aWaiting, '| receiver Waiting count:', bWaiting);
// wait for all to finish
await B.waitForFunction(() => !document.body.innerText.includes('Waiting…') && !document.body.innerText.includes('Receiving…'), null, { timeout: 120000 }).catch(() => {});
await A.waitForFunction(() => !document.body.innerText.includes('Waiting…') && !document.body.innerText.includes('Sending…'), null, { timeout: 120000 }).catch(() => {});
const aEnd = await A.locator('body').innerText();
const bEnd = await B.locator('body').innerText();
const allSent = ['big-0.bin','big-1.bin','big-2.bin','small-0.txt','small-1.txt'].every(n => aEnd.includes(n));
const allRcv = ['big-0.bin','big-1.bin','big-2.bin','small-0.txt','small-1.txt'].every(n => bEnd.includes(n));
console.log('all sent (A):', allSent, '| all received (B):', allRcv);
console.log('page errors:', errs.length ? errs.join(' | ') : '(none)');
fs.rmSync(tmp, { recursive: true, force: true });
await browser.close();
if (!(aWaiting >= 2 && bWaiting >= 1 && allSent && allRcv && errs.length === 0)) { console.error('QUEUE-VISUAL FAIL'); process.exit(1); }
console.log('QUEUE-VISUAL PASS');
