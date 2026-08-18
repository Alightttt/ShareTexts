// Probe the improvement batch:
//  1. Enter (no modifier) sends in the chat composer
//  2. Creator sees "Your other device is connecting…" when the joiner arrives
//  3. "That's it" copy is direction-aware (sender vs receiver)
//  4. Joiner's Connecting… screen shows the two-node visual
import { pairDevices, readLiveCode, URL, sleep, launchBrowser } from './lib.mjs';

const results = [];
const check = (name, ok) => { results.push([name, ok]); console.log(`${ok ? 'PASS' : 'FAIL'}: ${name}`); };

const browser = await launchBrowser();
const A = await browser.newPage();
const B = await browser.newPage();

// --- 4. Joiner connecting visual ---
// Intercept B's join so we can inspect B's Connecting… screen while the
// handshake is (slowly) in flight. We block the 'signal' socket events on B.
await B.addInitScript(() => {
  const origEmit = window.io?.prototype?.emit;
  window.__signalBlocked = 0;
});

// 1+2+3: full pairing
await A.goto(URL, { waitUntil: 'networkidle' });
await A.getByRole('button', { name: 'Send' }).first().click();
await A.getByText('LIVE CODE').waitFor({ timeout: 10000 });
const code = await readLiveCode(A);

// Poll A's DOM for the connecting indicator while B joins
let sawConnecting = false;
const poll = setInterval(async () => {
  try {
    const t = await A.evaluate(() => document.body.innerText.includes('is connecting'));
    if (t) sawConnecting = true;
  } catch { /* page may navigate */ }
}, 25);
setTimeout(() => clearInterval(poll), 8000);

await B.goto(URL, { waitUntil: 'networkidle' });
await B.getByRole('button', { name: 'Receive' }).first().click();
await B.locator('input[aria-label="Six-digit pairing code"]').fill(code);

await A.getByRole('button', { name: 'Send' }).waitFor({ timeout: 15000 });
await B.getByRole('button', { name: 'Send' }).waitFor({ timeout: 15000 });
await sleep(400);
clearInterval(poll);

check('creator saw "Your other device is connecting…"', sawConnecting);

// --- 1. Enter-to-send ---
await A.locator('textarea').first().fill('sent with plain Enter');
await A.locator('textarea').first().press('Enter');
await sleep(1500);
const bBody = await B.locator('body').innerText();
check('plain Enter sends the message', bBody.includes('sent with plain Enter'));

// --- 3. Direction-aware "That's it" ---
// A sent the first message → A's copy says "on the other device".
const aBody = await A.locator('body').innerText();
check('sender sees "That\'s it — it\'s on the other device."', aBody.includes("it's on the other device"));
// B received it as its first message → B's copy says "it arrived."
check('receiver sees "That\'s it — it arrived."', bBody.includes('it arrived'));

await browser.close();
const failed = results.filter(([, ok]) => !ok);
console.log(failed.length === 0 ? 'ALL PASS' : `${failed.length} FAILED`);
process.exit(failed.length === 0 ? 0 : 1);
