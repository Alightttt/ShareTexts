// E2E: short share links (/s/<code>), send-back, and the marketing bits.
import { launchBrowser, URL, sleep, waitForChat } from './lib.mjs';

const results = [];
const check = (name, ok, extra = '') => {
  results.push({ name, ok, extra });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  — ' + extra : ''}`);
};

async function main() {
  const browser = await launchBrowser();
  const ctxA = await browser.newContext({ viewport: { width: 1280, height: 900 }, permissions: ['clipboard-read', 'clipboard-write'] });
  const ctxB = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const A = await ctxA.newPage();
  const B = await ctxB.newPage();
  await A.goto(URL, { waitUntil: 'networkidle' });
  await B.goto(URL, { waitUntil: 'networkidle' });
  await sleep(1200);

  // --- Create + find the short share link on the connect screen ---
  await A.getByRole('button', { name: 'Start a transfer' }).first().click();
  await A.getByText('LIVE CODE').waitFor({ timeout: 10000 });
  // Headless Chromium exposes navigator.share but it never settles — disable
  // it so the button's copy fallback runs (what desktop browsers do anyway).
  await A.evaluate(() => { Object.defineProperty(navigator, 'share', { value: undefined, configurable: true }); });
  await A.getByRole('button', { name: /Share Nearby|Copy Link/ }).first().click();
  await sleep(400);
  const copiedUrl = await A.evaluate(() => navigator.clipboard.readText().catch(() => ''));
  const shortMatch = copiedUrl ? copiedUrl.match(/\/s\/([0-9a-f]{8})/) : null;
  check('share link is a short /s/<code> URL', !!shortMatch, copiedUrl || 'nothing copied');
  const shortCode = shortMatch ? shortMatch[1] : null;

  // --- Open the short URL on device B (fresh context) ---
  await B.goto(copiedUrl, { waitUntil: 'networkidle' });
  await sleep(1200);
  const confirmVisible = await B.getByText('Join this room?').count();
  check('B sees the join-confirm screen from /s/ link', confirmVisible === 1);
  await B.getByRole('button', { name: 'Connect' }).click();
  await waitForChat(B, 'B');
  await waitForChat(A, 'A');
  check('both devices connected via short link', true);

  // --- Send back: B receives a text, sends it straight back ---
  await A.getByPlaceholder('Paste or type text…').fill('round trip test');
  await A.getByRole('button', { name: 'Send' }).click();
  await sleep(1500);
  const sendBackBtn = await B.getByRole('button', { name: 'Send back' }).count();
  check('receiver has Send back action', sendBackBtn === 1);
  if (sendBackBtn === 1) {
    await B.getByRole('button', { name: 'Send back' }).first().click();
    await sleep(1500);
    const backText = await A.evaluate(() => {
      const hits = Array.from(document.querySelectorAll('div[class*="rounded-[18px]"]')).filter(d => d.textContent && d.textContent.includes('round trip test'));
      return hits.length >= 2;
    });
    check('sender received the sent-back message', backText);
  }

  // --- Trust strip on a fresh landing (no stored session) ---
  const ctxC = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const C = await ctxC.newPage();
  await C.goto(URL, { waitUntil: 'networkidle' });
  await sleep(1000);
  const trust = await C.evaluate(() => {
    const body = document.body.textContent || '';
    return body.includes('End-to-end encrypted') && body.includes('Nothing stored') && body.includes('Open source');
  });
  check('landing trust strip renders', trust);
  await ctxC.close();

  await A.screenshot({ path: '.audit-shots/shortlink-A.png' });
  await B.screenshot({ path: '.audit-shots/shortlink-B.png' });
  await browser.close();

  const fails = results.filter(r => !r.ok);
  console.log(`\n${results.length - fails.length}/${results.length} passed`);
  process.exit(fails.length ? 1 : 0);
}

main().catch((e) => { console.error('PROBE FAIL', String(e).slice(0, 500)); process.exit(1); });
