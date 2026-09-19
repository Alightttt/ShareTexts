// Auto-connect regression: two pages pair once (become trusted), then
// reload — the trusted auto-invite must reconnect them with ZERO taps.
// Original probe: two fresh pages, both flip Auto-connect ON, both pair
// once manually (to become trusted), disconnect, then reload → the trusted
// auto-invite must reconnect them WITHOUT any taps.
import { chromium } from 'playwright';

const URL = process.env.URL || 'http://localhost:3013';
const sleep = ms => new Promise(r => setTimeout(r, ms));

const browser = await chromium.launch();
const A = await browser.newPage({ viewport: { width: 1100, height: 800 } });
const B = await browser.newPage({ viewport: { width: 1100, height: 800 } });
const errs = [];
for (const [tag, p] of [['A', A], ['B', B]]) p.on('pageerror', e => errs.push(`[${tag}] ${String(e).slice(0, 120)}`));

await A.goto(URL, { waitUntil: 'networkidle' });
await B.goto(URL, { waitUntil: 'networkidle' });
await sleep(1500);

// Flip Auto-connect ON on both.
for (const p of [A, B]) {
  await p.getByTestId('auto-connect-toggle').click();
}
await sleep(500);

// Pair once manually: A invites B, B auto-accepts (auto-connect ON).
await A.locator('button:has-text("Nearby")').first().click();
let connected = false;
for (let i = 0; i < 20; i++) {
  await sleep(800);
  connected = await A.evaluate(() => !!document.querySelector('textarea'));
  const bConn = await B.evaluate(() => !!document.querySelector('textarea'));
  if (connected && bConn) break;
}
console.log('step 1 — manual pair with auto-accept:', connected ? 'OK' : 'FAIL');

// Disconnect both and reload so both go back to the idle landing.
for (const p of [A, B]) {
  const btn = p.getByRole('button', { name: /disconnect/i }).first();
  try { await btn.click({ timeout: 3000 }); } catch { /* already out */ }
}
await sleep(1200);
await A.reload({ waitUntil: 'networkidle' });
await B.reload({ waitUntil: 'networkidle' });
await sleep(2500);

// THE TEST: zero taps. Trusted auto-invite must fire on at least one side
// and auto-accept on the other.
let zeroTap = false;
for (let i = 0; i < 24; i++) {
  await sleep(1000);
  zeroTap = (await A.evaluate(() => !!document.querySelector('textarea')))
    && (await B.evaluate(() => !!document.querySelector('textarea')));
  if (zeroTap) break;
}
console.log('step 2 — auto-reconnect with ZERO taps:', zeroTap ? 'OK' : 'FAIL');
console.log('page errors:', errs.length ? errs.join(' | ') : 'none');
await browser.close();
