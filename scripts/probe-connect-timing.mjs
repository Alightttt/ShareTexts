// Measure pairing speed: code entry -> joiner "connecting" -> both in room.
import { launchBrowser, URL, sleep, readLiveCode } from './lib.mjs';

async function main() {
  const browser = await launchBrowser();
  const ctxA = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const ctxB = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const A = await ctxA.newPage();
  const B = await ctxB.newPage();

  // A: create
  await A.goto(URL, { waitUntil: 'networkidle' });
  await A.getByRole('button', { name: 'Start a transfer' }).first().click();
  await A.getByText('LIVE CODE').waitFor({ timeout: 10000 });

  // B: receive -> code entry
  await B.goto(URL, { waitUntil: 'networkidle' });
  await B.getByRole('button', { name: 'Already have a code?' }).first().click();
  await B.locator('input[inputmode="numeric"]').waitFor({ timeout: 10000 });

  const code = await readLiveCode(A);
  const t0 = Date.now();

  // Fill code on B
  await B.locator('input[inputmode="numeric"]').fill(code);
  const tEntry = Date.now() - t0;
  await sleep(150);

  // Poll: when does the joiner leave "Verifying code…" (i.e. isJoining clears / room routes)?
  let tJoinerConnecting = null;
  let tJoinerInRoom = null;
  let tCreatorSeesPeer = null;
  let tCreatorInRoom = null;

  // Poll both pages every 100ms
  const poll = async () => {
    for (let i = 0; i < 80; i++) {
      const [bState, aState] = await Promise.all([
        B.evaluate(() => {
          const t = document.body.innerText;
          return {
            verifying: t.includes('Verifying code'),
            connecting: t.includes('Connecting') || t.includes('Verifying code'),
            inRoom: !!document.querySelector('textarea[placeholder]'),
          };
        }).catch(() => ({})),
        A.evaluate(() => {
          const t = document.body.innerText;
          return {
            peerConnecting: /connecting/i.test(t),
            inRoom: !!document.querySelector('textarea[placeholder]'),
          };
        }).catch(() => ({})),
      ]);
      if (tJoinerConnecting === null && !bState.verifying) tJoinerConnecting = Date.now() - t0;
      if (tJoinerInRoom === null && bState.inRoom) tJoinerInRoom = Date.now() - t0;
      if (tCreatorSeesPeer === null && aState.peerConnecting) tCreatorSeesPeer = Date.now() - t0;
      if (tCreatorInRoom === null && aState.inRoom) tCreatorInRoom = Date.now() - t0;
      if (tJoinerInRoom && tCreatorInRoom) break;
      await sleep(25);
    }
  };
  await poll();

  // The creator's "Connecting to your other device…" flash can be <100ms on
  // a fast local pair — rAF-poll waitForFunction catches it precisely.
  if (tCreatorSeesPeer === null) {
    const caught = await A.waitForFunction(() => /Connecting to your other device/i.test(document.body.innerText), undefined, { timeout: 5000, polling: 'raf' }).then(() => true).catch(() => false);
    if (caught) tCreatorSeesPeer = Date.now() - t0;
  }

  console.log(JSON.stringify({
    codeEntry: tEntry + 'ms',
    joinerConnectingShown: tJoinerConnecting ? tJoinerConnecting + 'ms' : 'never',
    joinerInRoom: tJoinerInRoom ? tJoinerInRoom + 'ms' : 'never',
    creatorSeesPeerConnecting: tCreatorSeesPeer ? tCreatorSeesPeer + 'ms' : 'never',
    creatorInRoom: tCreatorInRoom ? tCreatorInRoom + 'ms' : 'never',
  }, null, 1));

  await browser.close();
}

main().catch((e) => { console.error('PROBE FAIL', String(e).slice(0, 400)); process.exit(1); });
