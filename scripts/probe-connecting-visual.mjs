// Verify the joiner's Connecting… screen shows the two-node visual:
// block signaling on B so WebRTC can't open, then assert the visual + hint render.
import { readLiveCode, URL, sleep, launchBrowser } from './lib.mjs';

const browser = await launchBrowser();
const A = await browser.newPage();
const B = await browser.newPage();

// Drop signaling packets → the data channel can never open on B.
await B.addInitScript(() => {
  const orig = WebSocket.prototype.send;
  WebSocket.prototype.send = function (data) {
    try {
      const s = typeof data === 'string' ? data : '';
      if (s.includes('"signal"') || s.includes('"offer"') || s.includes('"candidate"')) return;
    } catch { /* keep */ }
    return orig.call(this, data);
  };
});

await A.goto(URL, { waitUntil: 'networkidle' });
await A.getByRole('button', { name: 'Send' }).first().click();
await A.getByText('LIVE CODE').waitFor({ timeout: 10000 });
const code = await readLiveCode(A);

await B.goto(URL, { waitUntil: 'networkidle' });
await B.getByRole('button', { name: 'Receive' }).first().click();
await B.locator('input[aria-label="Six-digit pairing code"]').fill(code);
await sleep(2500);

const state = await B.evaluate(() => ({
  body: document.body.innerText,
  hasBeamPulse: !!document.querySelector('.animate-beam'),
  hasTwoNodes: document.querySelectorAll('.w-44.h-12 .w-9').length,
}));

const hasConnecting = state.body.includes('Connecting…');
const hasVisual = state.hasBeamPulse && state.hasTwoNodes >= 2;
console.log(`${hasConnecting ? 'PASS' : 'FAIL'}: joiner shows "Connecting…"`);
console.log(`${hasVisual ? 'PASS' : 'FAIL'}: joiner shows two-node connecting visual`);
console.log('sample:', JSON.stringify(state.body.slice(0, 120)));

await browser.close();
process.exit(hasConnecting && hasVisual ? 0 : 1);
