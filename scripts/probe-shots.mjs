// Capture mobile screenshots to inspect layout issues visually.
import { launchBrowser, URL, sleep, readLiveCode } from './lib.mjs';

async function main() {
  const browser = await launchBrowser();
  const ctxA = await browser.newContext({ viewport: { width: 375, height: 812 } });
  const ctxB = await browser.newContext({ viewport: { width: 375, height: 812 } });
  const A = await ctxA.newPage();
  const B = await ctxB.newPage();

  // A: create session → connect screen
  await A.goto(URL, { waitUntil: 'networkidle' });
  await A.getByRole('button', { name: 'Send text' }).first().click();
  await A.getByText('LIVE CODE').waitFor({ timeout: 10000 });
  await sleep(800);
  await A.screenshot({ path: '.audit-shots/mobile-connect.png' });
  console.log('shot: connect screen');

  // B: join screen (code entry)
  await B.goto(URL, { waitUntil: 'networkidle' });
  await B.getByRole('button', { name: 'Receive text' }).first().click();
  await sleep(800);
  await B.screenshot({ path: '.audit-shots/mobile-join.png' });
  console.log('shot: join screen');

  // B: enter 3 digits → mid-entry look
  await B.locator('input[inputmode="numeric"]').pressSequentially('123', { delay: 120 });
  await sleep(400);
  await B.screenshot({ path: '.audit-shots/mobile-join-partial.png' });
  console.log('shot: join screen partial entry');

  // B: full code → connecting moment
  const code = await readLiveCode(A);
  await B.locator('input[inputmode="numeric"]').fill(code);
  await sleep(2500);
  await B.screenshot({ path: '.audit-shots/mobile-joining.png' });
  console.log('shot: connecting moment');

  // A: creator's screen while B connects
  await sleep(1500);
  await A.screenshot({ path: '.audit-shots/mobile-connect-connecting.png' });
  console.log('shot: creator connecting');

  await browser.close();
}

main().catch((e) => { console.error('PROBE FAIL', e); process.exit(1); });
