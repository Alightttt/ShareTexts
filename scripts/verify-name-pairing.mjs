// Verify the P3 name fix end-to-end on a REAL pairing:
//   1. Two devices with the SAME platform user agent both default to
//      "Guest iPhone" — the joiner must auto-rename to "Guest iPhone 2"
//      while the creator's name stays the anchor.
//   2. The connected panel must show both names and a one-time notice on
//      the joiner.
//   3. Renaming via the UI (tap name → type → Enter) must update the
//      peer's label live through a re-announced hello.
// Exits non-zero with a named failure list. Read-only against the app.
import { launchBrowser, URL, sleep, readLiveCode, waitForChat } from './lib.mjs';

const IPHONE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
const NAME_KEY = 'sharetext.deviceName';
const failures = [];
const ok = (cond, label) => {
  console.log(`${cond ? 'OK  ' : 'FAIL'} ${label}`);
  if (!cond) failures.push(label);
};

async function deviceName(page) {
  return page.evaluate((k) => localStorage.getItem(k), NAME_KEY);
}

async function main() {
  const browser = await launchBrowser();
  const ctxA = await browser.newContext({ userAgent: IPHONE_UA });
  const ctxB = await browser.newContext({ userAgent: IPHONE_UA });
  const A = await ctxA.newPage();
  const B = await ctxB.newPage();
  const errors = [];
  A.on('pageerror', e => errors.push(`[A] ${e.message}`));
  B.on('pageerror', e => errors.push(`[B] ${e.message}`));

  // --- Pair two same-platform devices ---
  await A.goto(URL, { waitUntil: 'networkidle' });
  await B.goto(URL, { waitUntil: 'networkidle' });
  await A.getByRole('button', { name: 'Send' }).first().click();
  await A.getByRole('group', { name: 'Pairing code' }).waitFor({ timeout: 10000 });
  const code = await readLiveCode(A);
  await B.getByRole('button', { name: 'Receive' }).first().click();
  await B.locator('input[inputmode="numeric"]').fill(code);
  await waitForChat(B, 'B');
  await waitForChat(A, 'A');

  // --- 1. Auto-disambiguation: joiner renames, creator stays anchor ---
  // The re-announced hello must have landed by the time both are connected.
  await B.getByText('Guest iPhone 2', { exact: false }).first().waitFor({ timeout: 10000 }).catch(() => {});
  await sleep(1500);
  ok((await deviceName(A)) === 'Guest iPhone', `A (creator) kept its default name, got "${await deviceName(A)}"`);
  ok((await deviceName(B)) === 'Guest iPhone 2', `B (joiner) auto-renamed to "Guest iPhone 2", got "${await deviceName(B)}"`);

  // --- 2. Connected panels show both names; notice only on the joiner ---
  const aBody = await A.locator('body').innerText();
  const bBody = await B.locator('body').innerText();
  ok(aBody.includes('Guest iPhone 2'), 'A sees the joiner as "Guest iPhone 2"');
  ok(bBody.includes('Guest iPhone') && bBody.includes('Guest iPhone 2'), 'B sees both names (own + partner)');
  ok(bBody.includes('Both devices had the same name'), 'B got the one-time auto-adjust notice');
  ok(!aBody.includes('Both devices had the same name'), 'A (unchanged) got no notice');

  // --- 3. Rename via the UI propagates to the peer's label ---
  await B.getByRole('button', { name: /This device is named/ }).click();
  await B.getByLabel('Rename this device').fill('Bobs phone');
  await B.getByLabel('Rename this device').press('Enter');
  await sleep(1500);
  ok((await deviceName(B)) === 'Bobs phone', 'B persisted its custom name');
  const aBody2 = await A.locator('body').innerText();
  ok(aBody2.includes('Bobs phone'), 'A saw B\'s rename live ("Bobs phone" in A\'s panel)');
  const bBody2 = await B.locator('body').innerText();
  ok(bBody2.includes('Bobs phone'), 'B shows its own renamed label');

  // --- 4. A custom name never gets auto-adjusted ---
  ok(!bBody2.includes('Bobs phone 2'), 'custom name untouched by disambiguation');

  if (errors.length) {
    console.log('\nPAGE ERRORS:');
    errors.forEach(e => console.log(' ', e));
    failures.push('page errors: ' + errors.join('; '));
  }

  await browser.close();
  if (failures.length) {
    console.log(`\n${failures.length} FAILURE(S):`);
    failures.forEach(f => console.log(' -', f));
    process.exit(1);
  }
  console.log('\nAll name-pairing checks passed.');
}

main().catch(e => { console.error('SCRIPT ERROR:', e); process.exit(1); });