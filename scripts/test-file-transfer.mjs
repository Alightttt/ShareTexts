// Binary file transfer test: A sends a generated file to B, B downloads it,
// and we verify byte-for-byte integrity.
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { launchBrowser, URL, sleep } from './lib.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Build a ~2MB file with random binary content
const big = Buffer.alloc(2 * 1024 * 1024);
crypto.randomFillSync(big);
const filePath = path.join(__dirname, 'fixture-2mb.bin');
fs.writeFileSync(filePath, big);
const expectedHash = crypto.createHash('sha256').update(big).digest('hex');

const browser = await launchBrowser();
const ctxA = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const ctxB = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
const A = await ctxA.newPage();
const B = await ctxB.newPage();
const errors = [];
A.on('pageerror', e => errors.push(`[A:ERROR] ${e.message}`));
B.on('pageerror', e => errors.push(`[B:ERROR] ${e.message}`));

// A creates, B joins
await A.goto(URL, { waitUntil: 'networkidle' });
await A.getByRole('button', { name: 'Start a transfer' }).first().click();
await A.getByText('LIVE CODE').waitFor({ timeout: 10000 });
const digits = await A.locator('span').filter({ hasText: /^\d$/ }).allTextContents();
const code = digits.slice(-6).join('');
await B.goto(URL, { waitUntil: 'networkidle' });
await B.getByRole('button', { name: 'Already have a code?' }).first().click();
await B.locator('input[inputmode="numeric"]').fill(code);
await sleep(4000);

// A attaches the file via the + menu
await A.getByRole('button', { name: 'Add attachment' }).click();
await A.getByRole('button', { name: 'File' }).click();
await A.locator('input[type="file"]').last().setInputFiles(filePath);
console.log('STEP 1 OK: file attached on A');

// Send
await A.getByRole('button', { name: 'Send' }).click();
console.log('STEP 2: sending 2MB binary file…');

// Wait for B to show the received file with a Save action
let received = false;
for (let i = 0; i < 60; i++) {
  await sleep(1000);
  const saveBtn = B.getByRole('button', { name: 'Save' });
  if (await saveBtn.count()) { received = true; break; }
}
if (!received) {
  console.log('STEP 3 FAIL: B never got a complete file. B body:', (await B.locator('body').innerText()).slice(0, 400).replace(/\n/g, ' | '));
  await browser.close();
  process.exit(1);
}
console.log('STEP 3 OK: file transfer completed on B');

// Download the file on B and verify integrity
const [download] = await Promise.all([
  B.waitForEvent('download'),
  B.getByRole('button', { name: 'Save' }).click()
]);
const savedPath = path.join(__dirname, 'received.bin');
await download.saveAs(savedPath);
const receivedHash = crypto.createHash('sha256').update(fs.readFileSync(savedPath)).digest('hex');
const receivedSize = fs.statSync(savedPath).size;

if (receivedHash === expectedHash && receivedSize === big.length) {
  console.log(`STEP 4 OK: byte-for-byte integrity verified (${receivedSize} bytes, sha256 ${receivedHash.slice(0, 16)}…)`);
} else {
  console.log(`STEP 4 FAIL: hash mismatch expected ${expectedHash} got ${receivedHash}`);
}

console.log('\n--- PAGE ERRORS ---');
console.log(errors.length ? errors.join('\n') : '(none)');

fs.unlinkSync(filePath);
fs.unlinkSync(savedPath);
await browser.close();
