import { launchBrowser, readLiveCode, sleep, URL } from './lib.mjs';

/**
 * ROUND 04 diagnostic — why does the JOINER stall while the CREATOR escapes
 * via relay fallback? Full state capture on B: console, unhandled rejections,
 * session flags (via debug hook), and the visible UI.
 */
const browser = await launchBrowser();
try {
  const a = await browser.newContext();
  const A = await a.newPage();
  A.on('console', m => { const t = m.text(); if (/diag|webrtc|relay|peer/i.test(t)) console.log('A|', t.slice(0, 160)); });
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
    window.addEventListener('unhandledrejection', e => {
      console.log('[UNHANDLED-REJECTION]', String(e.reason && e.reason.message || e.reason).slice(0, 200), (e.reason && e.reason.stack || '').split('\n')[1] || '');
    });
    window.addEventListener('error', e => {
      console.log('[WINDOW-ERROR]', e.message, (e.error && e.error.stack || '').split('\n').slice(0, 4).join(' | ').slice(0, 400));
    });
  });
  const B = await b.newPage();
  B.on('console', m => { const t = m.text(); if (/diag|webrtc|relay|peer|UNHANDLED|crash|error/i.test(t)) console.log('B|', t.slice(0, 200)); });
  await B.goto(URL + '/', { waitUntil: 'domcontentloaded' });

  await B.getByRole('button', { name: /^receive/i }).first().click();
  await B.getByRole('button', { name: /code/i }).first().click().catch(() => {});
  await sleep(400);
  const code = await readLiveCode(A);
  const inputs = B.locator('input');
  const n = await inputs.count();
  if (n >= 6) { for (let i = 0; i < 6; i++) await inputs.nth(i).fill(code[i]); }
  else { await inputs.first().fill(code); }
  await B.keyboard.press('Enter');
  console.log(`--- code ${code} submitted; waiting 12s to observe both sides ---`);

  await sleep(12000);

  for (const [label, page] of [['A', A], ['B', B]]) {
    const state = await page.evaluate(() => {
      const text = document.body.innerText.replace(/\s+/g, ' ').slice(0, 400);
      const hasComposer = !!document.querySelector('[data-testid="composer"]');
      return { hasComposer, text };
    });
    console.log(`${label}| composer=${state.hasComposer} | ${state.text}`);
  }
} finally {
  await browser.close();
}
