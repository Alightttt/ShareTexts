// Verify a deployed ShareText deployment end-to-end:
//   1. GET /health on the signaling server.
//   2. Two browser contexts (two "devices") pair through the deployed
//      frontend: create → join with code → chat opens → message lands.
//
// Usage:
//   FRONTEND_URL=https://share-texts.vercel.app \
//   VERIFY_SERVER=https://your-server.onrender.com \
//   node scripts/verify-production.mjs
//
// For a real-device test, repeat the same steps manually on two devices on
// different networks — this script approximates that with two contexts.
import { launchBrowser, readLiveCode, waitForChat, sleep } from './lib.mjs';

const FRONTEND = process.env.FRONTEND_URL || 'https://share-texts.vercel.app';
const SERVER = process.env.VERIFY_SERVER;
let failures = 0;

// 1. Server health ----------------------------------------------------------
if (SERVER) {
  try {
    const res = await fetch(`${SERVER}/health`);
    const body = await res.json();
    const ok = res.ok && body.ok === true && body.service === 'sharetext-signaling';
    console.log(`[1] /health ${ok ? 'OK' : 'FAIL'} →`, JSON.stringify(body));
    if (!ok) failures++;
  } catch (e) {
    console.log(`[1] /health FAIL →`, e.message);
    failures++;
  }
} else {
  console.log('[1] /health skipped (set VERIFY_SERVER to the signaling server URL)');
}

// 2. Pair two devices through the deployed frontend --------------------------
const browser = await launchBrowser();
const ctxA = await browser.newContext();
const ctxB = await browser.newContext();
const A = await ctxA.newPage();
const B = await ctxB.newPage();
const errors = [];
A.on('pageerror', e => errors.push('A: ' + e.message));
B.on('pageerror', e => errors.push('B: ' + e.message));

try {
  console.log(`[2] opening ${FRONTEND} …`);
  await A.goto(FRONTEND, { waitUntil: 'networkidle', timeout: 30000 });
  await B.goto(FRONTEND, { waitUntil: 'networkidle', timeout: 30000 });

  // Create
  await A.getByRole('button', { name: 'Send' }).first().click();
  await A.getByText('LIVE CODE').waitFor({ timeout: 15000 });
  console.log('[3] room created — waiting screen shown');

  const code = await readLiveCode(A);
  if (!code || code.length !== 6) {
    console.log('[3] FAIL — could not read the live code');
    failures++;
  } else {
    console.log(`[4] code read (${code})`);

    // Join
    await B.getByRole('button', { name: 'Receive' }).first().click();
    await B.locator('input[inputmode="numeric"]').fill(code);
    await waitForChat(B, 'B');
    await waitForChat(A, 'A');
    console.log('[5] both devices reached the room');

    // Transfer
    const ta = A.locator('textarea').first();
    await ta.fill('production verification');
    await A.getByRole('button', { name: 'Send' }).click();
    await B.waitForSelector('text=production verification', { timeout: 10000 });
    console.log('[6] message transferred A → B');
  }
} catch (e) {
  console.log('[2–6] FAIL →', e.message);
  failures++;
} finally {
  if (errors.length) {
    console.log('PAGE ERRORS:', errors.join(' | '));
    failures++;
  }
  await browser.close();
}

console.log(failures ? `\nVERIFICATION FAILED (${failures} issue${failures > 1 ? 's' : ''})` : '\nVERIFICATION PASSED');
process.exit(failures ? 1 : 0);
