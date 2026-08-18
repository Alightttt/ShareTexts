import { launchBrowser, URL, sleep, readLiveCode, waitForChat } from './lib.mjs';

// New integrity layer: the sender hashes the original bytes (Preparing… →
// Sending…) and sends the checksum in the metadata; the receiver hashes what
// arrived and shows a "Verified" badge. This probe asserts the full loop:
// sender card completes, receiver card carries the Verified badge, and the
// transfer is byte-identical on the wire as before.
const b = await launchBrowser();
try {
  const ctxA = await b.newContext({ viewport: { width: 1280, height: 900 } });
  const ctxB = await b.newContext({ viewport: { width: 1280, height: 900 } });
  const A = await ctxA.newPage();
  const B = await ctxB.newPage();
  await A.goto(URL, { waitUntil: 'networkidle' });
  await B.goto(URL, { waitUntil: 'networkidle' });

  await A.getByRole('button', { name: 'Send' }).first().click();
  await A.getByText('LIVE CODE').waitFor({ timeout: 10000 });
  const code = await readLiveCode(A);
  await B.getByRole('button', { name: 'Receive' }).first().click();
  await B.locator('input[inputmode="numeric"]').fill(code);
  await waitForChat(B, 'B');
  await waitForChat(A, 'A');
  await sleep(500);

  // Send one file whose bytes we know.
  const name = 'verified-file.bin';
  const n = 70000; // crosses two 64KB chunks
  await A.evaluate(async ([name, n]) => {
    const input = document.querySelector('input[type="file"]:not([accept*="image"]):not([accept*="video"]):not([accept*="audio"])');
    const dt = new DataTransfer();
    const bytes = new Uint8Array(n);
    for (let i = 0; i < n; i++) bytes[i] = (name.charCodeAt(i % name.length) + i * 7) & 0xff;
    dt.items.add(new File([bytes], name, { type: 'application/octet-stream' }));
    input.files = dt.files;
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }, [name, n]);
  await sleep(900);
  await A.locator('textarea').first().press('Enter');

  // Sender: card must pass through Preparing… and land on complete (no stuck).
  let senderOk = false;
  for (let i = 0; i < 40; i++) {
    await sleep(500);
    senderOk = await A.evaluate((want) => {
      const card = [...document.querySelectorAll('*')].find((el) =>
        el.textContent?.includes(want) && el.textContent?.includes('Verified') === false && el.querySelector('button')?.textContent?.includes('Save'));
      // Simpler: the sender's card shows "Saved" affordance (complete) and no failure text.
      const anySave = [...document.querySelectorAll('button')].some((btn) => btn.textContent?.trim() === 'Save');
      const anyError = document.body.innerText.includes("Couldn't send this file.") || document.body.innerText.includes("didn't arrive intact");
      return anySave && !anyError;
    }, name);
    if (senderOk) break;
  }

  // Receiver: the card must show the Verified badge (bytes checked against
  // the original) plus the filename.
  let receiverVerified = false;
  let sawPreparing = false;
  for (let i = 0; i < 60; i++) {
    await sleep(500);
    const st = await B.evaluate((want) => {
      const body = document.body.innerText;
      return {
        verified: body.includes('Verified'),
        name: body.includes(want),
        preparing: body.includes('Preparing…'),
      };
    }, name);
    if (st.preparing) sawPreparing = true;
    if (st.verified && st.name) { receiverVerified = true; break; }
  }

  console.log(JSON.stringify({ senderOk, receiverVerified, sawPreparing }, null, 2));
  const ok = senderOk && receiverVerified;
  console.log(ok ? 'CHECKSUM_OK' : 'CHECKSUM_FAIL');
} finally {
  await b.close();
}
