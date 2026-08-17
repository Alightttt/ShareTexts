// Verify the SessionEndedScreen: create, pair, end session, check the new UI.
import { launchBrowser, URL, sleep, readLiveCode } from './lib.mjs';

async function main() {
  const browser = await launchBrowser();
  const ctxA = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const ctxB = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const A = await ctxA.newPage();
  const B = await ctxB.newPage();

  await A.goto(URL, { waitUntil: 'networkidle' });
  await A.getByRole('button', { name: 'Send text' }).first().click();
  await A.getByText('LIVE CODE').waitFor({ timeout: 10000 });

  await B.goto(URL, { waitUntil: 'networkidle' });
  await B.getByRole('button', { name: 'Receive text' }).first().click();
  await B.locator('input[inputmode="numeric"]').waitFor({ timeout: 10000 });

  const code = await readLiveCode(A);
  await B.locator('input[inputmode="numeric"]').fill(code);

  // Both in room
  await B.locator('textarea[placeholder]').waitFor({ timeout: 15000 });
  await A.locator('textarea[placeholder]').waitFor({ timeout: 15000 });
  await sleep(500);

  // A ends the session (header button opens the confirm modal, then confirm)
  await A.getByRole('button', { name: 'End session' }).first().click();
  await sleep(400);
  await A.getByRole('button', { name: 'End session' }).last().click();
  await sleep(1500);

  const checks = await A.evaluate(() => {
    const t = document.body.innerText;
    return {
      showsEndedHeading: t.includes('That\u2019s it.'),
      showsHomeBtn: !![...document.querySelectorAll('button')].find(b => (b.textContent || '').includes('Back to Home')),
      showsTransferBtn: !![...document.querySelectorAll('button')].find(b => (b.textContent || '').includes('Start a transfer')),
    };
  });
  console.log('A ended-screen:', JSON.stringify(checks));

  // Click Start a transfer — should land on a fresh RoomHub with LIVE CODE
  await A.getByRole('button', { name: /Start a transfer/ }).click();
  await sleep(2500);
  const aNew = await A.evaluate(() => document.body.innerText);
  console.log('after Start a transfer -> LIVE CODE:', aNew.includes('LIVE CODE'), '| connect copy:', aNew.includes('Connect your other device'));

  await browser.close();
}

main().catch((e) => { console.error('PROBE FAIL', String(e).slice(0, 400)); process.exit(1); });
