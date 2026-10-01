// F13 multi-device room E2E.
//   A creates → B joins by code → C joins by code (THREE devices, one room —
//   the old "room full" cap is gone). Verifies:
//   · the roster shows 3 devices on every member (picker device count)
//   · a single-recipient A→B text arrives verbatim (1-to-1 stays fast/simple)
//   · multi-recipient fan-out: A selects B + C, sends text + file once, BOTH
//     receive it, and the sender sees ONE message with a per-recipient strip
//   · a recipient leaving does not break the room: C closes → A still talks
//     to B (no cascade), and C's row drops without duplicating anyone
//   · refresh converges: B reloads and remains the SAME participant
// Run: URL=http://localhost:3010 node scripts/verify-multi-device.mjs
import { launchBrowser, URL, sleep, readLiveCode, waitForChat } from './lib.mjs';

let failures = 0;
function ok(name, cond, detail = '') {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
  if (!cond) failures++;
}

async function bodyText(page) {
  return page.evaluate(() => document.body.innerText);
}

async function main() {
  const browser = await launchBrowser();
  const ctxA = await browser.newContext();
  const ctxB = await browser.newContext();
  const ctxC = await browser.newContext();
  const A = await ctxA.newPage();
  const B = await ctxB.newPage();
  const C = await ctxC.newPage();
  const logs = [];
  for (const [n, p] of [['A', A], ['B', B], ['C', C]]) {
    p.on('pageerror', (e) => logs.push(`[${n}:ERROR] ${e.message}`));
  }

  // --- A creates; B and C join with the code (no ROOM_FULL rejection) -----
  await A.goto(URL, { waitUntil: 'networkidle' });
  await A.getByRole('button', { name: 'Send' }).first().click();
  await A.getByRole('group', { name: 'Pairing code' }).waitFor({ timeout: 15000 });
  const code = await readLiveCode(A);
  ok('A created a room and shows a pairing code', /^\d{6}$/.test(code), code);

  await B.goto(URL, { waitUntil: 'networkidle' });
  await B.getByRole('button', { name: 'Receive' }).first().click();
  await B.locator('input[inputmode="numeric"]').fill(code);
  await waitForChat(B, 'B');
  await waitForChat(A, 'A');
  ok('B joined the room', true);

  // C joins the SAME room — the core multi-device assertion.
  await C.goto(URL, { waitUntil: 'networkidle' });
  await C.getByRole('button', { name: 'Receive' }).first().click();
  const { TOTP } = await import('otpauth');
  const stored = await A.evaluate(() => localStorage.getItem('sharetext.session.v1'));
  const { secret, createdAt } = JSON.parse(stored);
  const totp = new TOTP({ issuer: 'ShareText', label: 'Session', algorithm: 'SHA1', digits: 6, period: 40, secret });
  const freshCode = totp.generate({ timestamp: Date.now() - (createdAt || 0) });
  await C.locator('input[inputmode="numeric"]').fill(freshCode);
  const cOk = await waitForChat(C, 'C').then(() => true).catch(() => false);
  ok('C joined the same room (no product cap)', cOk);
  if (!cOk) {
    const cBody = await bodyText(C);
    ok('C rejection copy is honest if present', !cBody.includes('already has two devices'), cBody.slice(0, 160).replace(/\n/g, ' | '));
  }

  // --- Roster: the room header reports 3 devices on every member ----------
  await sleep(2500);
  for (const [n, p] of [['A', A], ['B', B]]) {
    const t = await bodyText(p);
    ok(`${n} header counts the room's devices`, /3 devices/i.test(t), t.slice(0, 100).replace(/\n/g, ' | '));
  }

  // --- Recipient picker: opens, lists the two other devices, selectable ---
  await A.getByTestId('recipient-row').getByRole('button').first().click();
  await sleep(400);
  const pickerBody = await bodyText(A);
  ok('A\u2019s picker lists 2 other devices', /2 devices in this room/i.test(pickerBody));
  const options = A.getByRole('option');
  ok('A\u2019s picker renders two selectable rows', (await options.count()) === 2);
  // Select BOTH (multi-recipient fan-out preparation).
  await options.nth(0).click();
  await options.nth(1).click();
  await sleep(300);
  const selBody = await bodyText(A);
  ok('A\u2019s composer shows the multi-recipient summary', /To: 2 devices/i.test(selBody));
  // Close the picker with its own close button — NEVER Escape (the room maps
  // Escape to the disconnect confirmation, which would block the composer).
  await A.getByRole('button', { name: 'Close' }).click().catch(async () => {
    await A.getByTestId('recipient-row').getByRole('button').first().click();
  });
  await sleep(250);
  ok('picker closed', (await A.getByRole('dialog').count()) === 0);

  // --- Fan-out send: text only first (control lane) -----------------------
  await A.locator('textarea').first().fill('Fan-out hello to both devices');
  await A.getByRole('button', { name: 'Send', exact: true }).click();
  await sleep(2500);
  const bBody = await bodyText(B);
  const cBody = await bodyText(C);
  ok('B received the fan-out text', bBody.includes('Fan-out hello to both devices'));
  ok('C received the fan-out text', cBody.includes('Fan-out hello to both devices'));
  const aBody = await bodyText(A);
  ok('A sees ONE message with a per-recipient summary', /Sent to all 2 devices|Sending to 2 devices/i.test(aBody));

  // --- Fan-out file: A sends one file to B + C ----------------------------
  const fs = await import('node:fs');
  const tmp = fs.mkdtempSync('st-fanout-');
  const p1 = `${tmp}/fanout-file.txt`;
  fs.writeFileSync(p1, 'fanout file body '.repeat(400));
  await A.locator('input[multiple]:not([accept])').setInputFiles([p1]);
  await sleep(600);
  await A.getByRole('button', { name: /send/i }).first().click();
  let bFile = false;
  let cFile = false;
  for (let i = 0; i < 30; i++) {
    await sleep(1000);
    if (!bFile && (await bodyText(B)).includes('fanout-file.txt')) bFile = true;
    if (!cFile && (await bodyText(C)).includes('fanout-file.txt')) cFile = true;
    if (bFile && cFile) break;
  }
  ok('B received the fan-out file', bFile);
  ok('C received the fan-out file', cFile);
  const aAfterFile = await bodyText(A);
  ok('A\u2019s file card reports per-recipient delivery', /Sent to all 2 devices|Sent to 2 of 2/i.test(aAfterFile));

  // --- Isolation: C leaves; A↔B keep working (no cascade) -----------------
  await C.close();
  await sleep(6500); // server grace is 60s, but the C tab closing should not disturb A/B
  await A.locator('textarea').first().fill('Still here after C left');
  await A.getByRole('button', { name: 'Send', exact: true }).click();
  await sleep(2500);
  ok('A→B still works after C left', (await bodyText(B)).includes('Still here after C left'));

  // --- Refresh B: same participant, room survives, history intact ---------
  await B.reload({ waitUntil: 'networkidle' });
  await sleep(6000);
  const bComposer = await B.getByTestId('composer').count();
  ok('B reconnected after refresh', bComposer > 0);
  const bHistory = await bodyText(B);
  ok('B kept its history after refresh', bHistory.includes('Fan-out hello to both devices'));
  await B.locator('textarea').first().fill('B back after refresh');
  // After a reload the re-offer cycle can take a few seconds; wait until the
  // send button is enabled (link restored / recipients seated) before click.
  await B.getByRole('button', { name: 'Send', exact: true }).click({ timeout: 20000 });
  await sleep(2500);
  ok('A received B\u2019s post-refresh message', (await bodyText(A)).includes('B back after refresh'));

  // --- No ghost duplicates: picker shows one row per device (unique ids) ---
  // C's tab closed seconds ago; the 60s disconnect grace correctly HOLDS its
  // seat, so the row count may be 2 or 3 — what must never happen is two
  // rows for the SAME participant (join/resume churn once duplicated seats).
  await A.getByTestId('recipient-row').getByRole('button').first().click();
  await sleep(300);
  const rowCount = await A.getByRole('option').count();
  const rowIds = await A.getByRole('option').evaluateAll((els) =>
    els.map((el) => el.getAttribute('data-participant-id') || el.textContent || ''));
  const uniqueIds = new Set(rowIds);
  ok('no duplicate roster rows after churn', uniqueIds.size === rowIds.length && rowCount >= 2, `rows=${rowCount} unique=${uniqueIds.size}`);

  console.log('\n--- PAGE ERRORS ---');
  console.log(logs.length ? logs.slice(0, 20).join('\n') : '(none)');
  await browser.close();
  if (failures > 0) {
    console.log(`\n${failures} check(s) failed`);
    process.exit(1);
  }
  console.log('\nALL MULTI-DEVICE CHECKS PASSED');
}

main().catch((e) => { console.error('TEST FAILED:', e.message); process.exit(1); });
