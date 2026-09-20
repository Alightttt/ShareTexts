// Auto-connect regression: two pages flip Auto-connect ON and meet — the
// any-device auto-invite must connect them with ZERO taps, on first
// encounter AND again after a reload (returning/trusted case).
import { chromium } from 'playwright';

const URL = process.env.URL || 'http://localhost:3013';
const sleep = ms => new Promise(r => setTimeout(r, ms));

const browser = await chromium.launch();
const A = await browser.newPage({ viewport: { width: 1100, height: 800 } });
const B = await browser.newPage({ viewport: { width: 1100, height: 800 } });
const errs = [];
for (const [tag, p] of [['A', A], ['B', B]]) p.on('pageerror', e => errs.push(`[${tag}] ${String(e).slice(0, 120)}`));

await A.goto(URL, { waitUntil: 'networkidle' });
await sleep(1500);

// A flips Auto-connect ON through the real UI while it's still alone —
// the toggle lives inside the expandable "Why isn't my device showing?"
// helper, which renders exactly while no devices are around. This also
// verifies the relocated toggle is reachable and writes its setting.
await A.getByTestId('nearby-why-toggle').click();
await A.getByTestId('auto-connect-toggle').click();
await sleep(300);
const autoSaved = await A.evaluate(() => localStorage.getItem('sharetext.autoConnect.v1'));
console.log('step 0 — toggle writes the setting:', autoSaved === '1' ? 'OK' : 'FAIL');

// B seeds the same setting before load (once devices are visible the
// helper is gone by design — the setting, not the panel, is what counts).
await B.addInitScript(() => localStorage.setItem('sharetext.autoConnect.v1', '1'));
await B.goto(URL, { waitUntil: 'networkidle' });
await sleep(1500);

// THE TEST (first encounter): zero taps. With auto-connect ON on both
// sides, one side must auto-invite and the other auto-accept.
let connected = false;
for (let i = 0; i < 24; i++) {
  await sleep(1000);
  connected = (await A.evaluate(() => !!document.querySelector('textarea')))
    && (await B.evaluate(() => !!document.querySelector('textarea')));
  if (connected) break;
}
console.log('step 1 — first encounter, ZERO taps:', connected ? 'OK' : 'FAIL');

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
