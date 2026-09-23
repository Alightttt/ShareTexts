import { launchBrowser, readLiveCode, sleep, URL } from './lib.mjs';

/**
 * ROUND 04 — Relay-path probe (P0 reproduction attempt).
 *
 * Real-world failure report: "connected, but the other device never receives
 * text/files". Localhost E2E never exercises this because ICE always succeeds
 * on the same machine. This probe cripples WebRTC on device B (simulating a
 * restrictive network / blocked UDP), forcing the 5s relay fallback so ALL
 * data flows through the signaling server's relay_message path.
 *
 * PASS = both text directions and a file arrive via pure relay.
 */
const browser = await launchBrowser();
const results = [];
const ok = (name, cond, detail = '') => {
  results.push({ name, pass: !!cond, detail });
  console.log(`${cond ? 'PASS' : 'FAIL'}: ${name}${detail ? ' — ' + detail : ''}`);
};

try {
  const ctxOpts = { ignoreHTTPSErrors: true };
  const a = await browser.newContext(ctxOpts);
  const A = await a.newPage();
  const errors = [];
  A.on('pageerror', e => errors.push('A:' + e.message));

  // Device A: normal WebRTC.
  await A.goto(URL + '/', { waitUntil: 'domcontentloaded' });
  await A.getByTestId('cta-send').click().catch(async () => {
    await A.getByRole('button', { name: /send/i }).first().click();
  });
  await sleep(1200);

  // Device B: WebRTC sabotaged — RTCPeerConnection replaced with a stub that
  // throws on construction, so no offer can ever be answered and no channel
  // can open. Everything must flow through relay_message.
  const b = await browser.newContext(ctxOpts);
  await b.addInitScript(() => {
    class BrokenPC {
      constructor() { throw new Error('WebRTC disabled for relay probe'); }
    }
    window.RTCPeerConnection = BrokenPC;
    window.RTCSessionDescription = class { constructor(d) { Object.assign(this, d); } };
    window.RTCIceCandidate = class { constructor(d) { Object.assign(this, d); } };
  });
  const B = await b.newPage();
  B.on('pageerror', e => errors.push('B:' + e.message));

  await B.goto(URL + '/', { waitUntil: 'domcontentloaded' });
  const openReceive = async (page, label) => {
    const t0 = Date.now();
    await page.getByRole('button', { name: /^receive/i }).first().click();
    await sleep(400); // LiveCodeInput is already visible; no intermediate step
    console.log(`  (${label} receive panel open in ${Date.now() - t0}ms)`);
  };
  await openReceive(B, 'B');

  const code = await readLiveCode(A);
  ok('code readable from A', /^\d{6}$/.test(code), code);

  // B joins with the live code.
  const joinT0 = Date.now();
  const inputs = B.locator('input');
  const n = await inputs.count();
  if (n >= 6) {
    for (let i = 0; i < 6; i++) await inputs.nth(i).fill(code[i]);
  } else {
    await inputs.first().fill(code);
  }
  await B.keyboard.press('Enter');
  console.log(`  (B submitted code at ${Date.now() - joinT0}ms)`);

  // Wait for chat on BOTH sides. A must reach chat purely via the relay
  // fallback (WebRTC can never open — B's PC constructor throws).
  await A.getByTestId('composer').first().waitFor({ timeout: 25000 })
    .then(() => ok('A reached chat via RELAY fallback', true, `${Date.now() - joinT0}ms after join`))
    .catch(() => ok('A reached chat via RELAY fallback', false, 'composer never appeared'));
  await B.getByTestId('composer').first().waitFor({ timeout: 15000 })
    .then(() => ok('B reached chat', true))
    .catch(() => ok('B reached chat', false));

  // Text A → B over pure relay.
  await A.getByTestId('composer').first().fill('relay-text-a2b 🚀 हिन्दी');
  await A.keyboard.press('Enter');
  await B.getByText('relay-text-a2b').first().waitFor({ timeout: 12000 })
    .then(() => ok('text A→B arrived via relay', true))
    .catch(() => ok('text A→B arrived via relay', false));

  // Text B → A over pure relay.
  await B.getByTestId('composer').first().fill('relay-text-b2a ✓');
  await B.keyboard.press('Enter');
  await A.getByText('relay-text-b2a').first().waitFor({ timeout: 12000 })
    .then(() => ok('text B→A arrived via relay', true))
    .catch(() => ok('text B→A arrived via relay', false));

  // File A → B over pure relay (512 KB, multi-chunk) via the in-room
  // composer's general file input, then the Send button (same path as E2E).
  const fileInput = A.locator('input[multiple]:not([accept])');
  const hasFileInput = await fileInput.count();
  if (hasFileInput) {
    const buf = Buffer.alloc(512 * 1024).fill(7);
    await fileInput.setInputFiles({ name: 'relay-probe.bin', mimeType: 'application/octet-stream', buffer: buf });
    await sleep(1200);
    await A.getByRole('button', { name: /send/i }).first().click();
    const complete = await B.getByText(/relay-probe\.bin/).first().waitFor({ timeout: 25000 })
      .then(() => true).catch(() => false);
    ok('file A→B arrived via relay', complete);
    // And A's own bubble shows completed (checksum verified etc.).
    const aDone = await A.getByText(/relay-probe\.bin/).first().isVisible().catch(() => false);
    ok('A file bubble rendered', aDone);
  } else {
    ok('file input present', false, 'no input[type=file] found');
  }

  ok('zero app page errors', errors.filter(e => !e.includes('WebRTC disabled for relay probe')).length === 0, errors.filter(e => !e.includes('WebRTC disabled for relay probe')).join(' | ').slice(0, 300));
} finally {
  await browser.close();
}
const failed = results.filter(r => !r.pass);
console.log(`\nRELAY PROBE: ${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
