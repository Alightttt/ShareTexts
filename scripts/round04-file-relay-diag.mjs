import { launchBrowser, readLiveCode, sleep, URL } from './lib.mjs';

/**
 * ROUND 04 diagnostic — file over pure relay. Full console on both sides,
 * per-side diag snapshots dumped at the end.
 */
const browser = await launchBrowser();
try {
  const a = await browser.newContext();
  const A = await a.newPage();
  A.on('console', m => { const t = m.text(); if (/diag|webrtc|relay|transfer|error|crash/i.test(t)) console.log('A|', t.slice(0, 200)); });
  A.on('pageerror', e => console.log('A|PAGEERROR', e.message));
  await A.goto(URL + '/', { waitUntil: 'domcontentloaded' });
  await A.getByTestId('cta-send').click().catch(async () => {
    await A.getByRole('button', { name: /send/i }).first().click();
  });
  await sleep(1200);

  const b = await browser.newContext();
  await b.addInitScript(() => {
    class BrokenPC { constructor() { throw new Error('WebRTC disabled for relay probe'); } }
    window.RTCPeerConnection = BrokenPC;
    window.RTCSessionDescription = class { constructor(d) { Object.assign(this, d); } };
    window.RTCIceCandidate = class { constructor(d) { Object.assign(this, d); } };
  });
  const B = await b.newPage();
  B.on('console', m => { const t = m.text(); if (/diag|webrtc|relay|transfer|error|crash/i.test(t)) console.log('B|', t.slice(0, 200)); });
  B.on('pageerror', e => console.log('B|PAGEERROR', e.message));
  await B.goto(URL + '/', { waitUntil: 'domcontentloaded' });
  await B.getByRole('button', { name: /^receive/i }).first().click();
  await sleep(400);
  const code = await readLiveCode(A);
  const inputs = B.locator('input');
  const n = await inputs.count();
  if (n >= 6) { for (let i = 0; i < 6; i++) await inputs.nth(i).fill(code[i]); }
  else { await inputs.first().fill(code); }
  await B.keyboard.press('Enter');
  await A.getByTestId('composer').first().waitFor({ timeout: 25000 });
  await B.getByTestId('composer').first().waitFor({ timeout: 15000 });
  console.log('--- both in chat; attaching file on A via the composer file input ---');

  const fileInput = A.locator('input[multiple]:not([accept])');
  const cnt = await fileInput.count();
  console.log('file inputs on A:', cnt);
  if (cnt) {
    const buf = Buffer.alloc(512 * 1024).fill(7);
    await fileInput.setInputFiles({ name: 'relay-file.bin', mimeType: 'application/octet-stream', buffer: buf });
    await sleep(1200);
    await A.getByRole('button', { name: /send/i }).first().click();
    await sleep(15000);
    const aText = await A.evaluate(() => document.body.innerText.replace(/\s+/g, ' ').slice(0, 500));
    const bText = await B.evaluate(() => document.body.innerText.replace(/\s+/g, ' ').slice(0, 500));
    console.log('A BODY:', aText);
    console.log('B BODY:', bText);
    const aDiag = await A.evaluate(() => { try { return JSON.stringify(window.__sharetextDiag?.snapshot?.() ?? window.__sharetextDiag?.events?.().slice(-25) ?? [], null, 0); } catch (e) { return 'diag-err:' + e; } });
    console.log('A DIAG tail:', String(aDiag).slice(0, 1500));
  }
} finally {
  await browser.close();
}
