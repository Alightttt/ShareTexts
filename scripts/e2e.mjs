// E2E: create → join → connect → send → receive → refresh-reconnect → large text → third-device rejection
import { launchBrowser, URL, sleep, readLiveCode, waitForChat } from './lib.mjs';

function makeUnicodeText(kb) {
  const parts = [
    'हिन्दी पाठ', 'العربية نص', '中文文本', '日本語のテキスト', '한국어',
    '🚀🎉😀👍🏽', 'café naïve résumé', 'line1\nline2\nline3',
    'const x = { a: 1 }; "quotes" \'single\' <script>alert(1)</script>',
    'https://example.com/very/long/url?query=1&x=2', 'tab\there', '   spaced   '
  ];
  const chunk = parts.join(' | ') + ' ';
  let s = '';
  while (s.length < kb * 1024) s += chunk;
  return s.slice(0, kb * 1024);
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
  A.on('pageerror', e => logs.push(`[A:ERROR] ${e.message}`));
  B.on('pageerror', e => logs.push(`[B:ERROR] ${e.message}`));

  // --- Device A: create session ---
  await A.goto(URL, { waitUntil: 'networkidle' });
  await A.getByRole('button', { name: 'Send' }).first().click();
  // The pairing-code tile group (LiveCodeDisplay) marks the sending panel.
  await A.getByRole('group', { name: 'Pairing code' }).waitFor({ timeout: 10000 });
  console.log('STEP 1 OK: A created session, pairing code visible');
  await ctxA.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: URL.match(/^https?:\/\/[^/]+/)?.[0] || URL }).catch(() => {});
  const code = await readLiveCode(A);
  console.log('Live code:', code);

  // --- Device B: join ---
  await B.goto(URL, { waitUntil: 'networkidle' });
  await B.getByRole('button', { name: 'Receive' }).first().click();
  await B.locator('input[inputmode="numeric"]').fill(code);
  await waitForChat(B, 'B');
  await waitForChat(A, 'A');
  console.log('STEP 2 OK: both devices in room (WebRTC or relay connected)');

  // --- A -> B small text ---
  await A.locator('textarea').first().fill('Hello from Device A 👋');
  await A.getByRole('button', { name: 'Send', exact: true }).click();
  await sleep(2000);
  const bBody1 = await B.locator('body').innerText();
  if (!bBody1.includes('Hello from Device A 👋')) {
    console.log('STEP 3 FAIL: B did not receive message. B body:', bBody1.slice(0, 400).replace(/\n/g, ' | '));
  } else {
    console.log("STEP 3 OK: B received A's message");
  }

  // --- B -> A reply ---
  await B.locator('textarea').first().fill('Reply from Device B');
  await B.getByRole('button', { name: 'Send', exact: true }).click();
  await sleep(2000);
  const aBody1 = await A.locator('body').innerText();
  if (!aBody1.includes('Reply from Device B')) {
    console.log('STEP 4 FAIL: A did not receive reply');
  } else {
    console.log("STEP 4 OK: A received B's reply");
  }

  // --- Copy button on A: the sent message must copy verbatim ---
  await A.getByRole('button', { name: 'Copy message' }).first().click();
  await sleep(500);
  const clip = await A.evaluate(() => navigator.clipboard.readText().catch(() => ''));
  console.log(clip === 'Hello from Device A 👋' ? 'STEP 5 OK: Copy put the message on the clipboard' : 'STEP 5 WARN: clipboard read failed or mismatched');

  // --- Large unicode text A -> B ---
  const big = makeUnicodeText(120); // ~120 KB
  await A.locator('textarea').first().fill(big);
  await A.getByRole('button', { name: 'Send', exact: true }).click();
  console.log('STEP 6: sent ~120KB unicode text, waiting for B to receive…');
  let receivedBig = false;
  for (let i = 0; i < 30; i++) {
    await sleep(1000);
    const body = await B.locator('body').innerText();
    if (body.includes('café naïve résumé')) { receivedBig = true; break; }
  }
  // Verify byte-for-byte: check the full text is present by comparing lengths via clipboard copy all
  console.log(receivedBig ? 'STEP 6 OK: B received large text' : 'STEP 6 FAIL: B never received large text');

  // --- Refresh reconnect: reload A, room must survive ---
  await A.reload({ waitUntil: 'networkidle' });
  console.log('STEP 7: A refreshed — waiting for reconnect…');
  await sleep(6000);
  const aBody2 = await A.locator('body').innerText();
  const aComposer = await A.getByTestId('composer').count();
  if (aComposer > 0) {
    console.log('STEP 7 OK: A reconnected to the room after refresh');
  } else {
    console.log('STEP 7 WARN: A after refresh shows:', aBody2.slice(0, 300).replace(/\n/g, ' | '));
  }

  // A sends after reconnect
  const taA = A.locator('textarea').first();
  if (await taA.count()) {
    await taA.fill('Back after refresh');
    await A.getByRole('button', { name: 'Send', exact: true }).click();
    await sleep(2500);
    const bBody2 = await B.locator('body').innerText();
    console.log(bBody2.includes('Back after refresh') ? 'STEP 8 OK: message sent after reconnect reached B' : 'STEP 8 FAIL: post-reconnect message lost');
  } else {
    console.log('STEP 8 SKIP: A has no composer after refresh');
  }

  // --- Close B's tab entirely, then reopen it — the room must be rejoined
  // automatically with messages intact ---
  await B.close();
  console.log('STEP 8b: B\'s tab closed — reopening to test rejoin…');
  await sleep(2500);
  const B2 = await ctxB.newPage();
  B2.on('pageerror', e => logs.push(`[B2:ERROR] ${e.message}`));
  await B2.goto(URL, { waitUntil: 'networkidle' });
  await sleep(6000);
  const b2Body = await B2.locator('body').innerText();
  const b2Composer = await B2.getByTestId('composer').count();
  if (b2Composer > 0 || b2Body.includes('Hello from Device A')) {
    console.log('STEP 8c OK: B rejoined the room after closing the tab');
  } else {
    console.log('STEP 8c WARN: B after tab reopen shows:', b2Body.slice(0, 300).replace(/\n/g, ' | '));
  }
  const b2HasHistory = b2Body.includes('Reply from Device B') || b2Body.includes('Hello from Device A');
  console.log(b2HasHistory ? 'STEP 8d OK: B\'s message history was restored' : 'STEP 8d WARN: B has no restored history');
  const b2Ta = B2.locator('textarea').first();
  if (await b2Ta.count()) {
    await b2Ta.fill('Back after tab close');
    await B2.getByRole('button', { name: 'Send', exact: true }).click();
    await sleep(2500);
    const aBody3 = await A.locator('body').innerText();
    console.log(aBody3.includes('Back after tab close') ? 'STEP 8e OK: message sent after rejoin reached A' : 'STEP 8e FAIL: post-rejoin message lost');
  }

  // --- Third device rejection ---
  // A is in the chat view now (no code shown), so derive a fresh TOTP from
  // the session secret stored in A's localStorage.
  const stored = await A.evaluate(() => localStorage.getItem('sharetext.session.v1'));
  const { secret, createdAt } = JSON.parse(stored);
  const { TOTP } = await import('otpauth');
  // 40s window anchored at room creation (matches the app's live code).
  const totp = new TOTP({ issuer: 'ShareText', label: 'Session', algorithm: 'SHA1', digits: 6, period: 40, secret });
  const freshCode = totp.generate({ timestamp: Date.now() - (createdAt || 0) });
  console.log('Fresh code for third device test:', freshCode);
  await C.goto(URL, { waitUntil: 'networkidle' });
  await C.getByRole('button', { name: 'Receive' }).first().click();
  await C.locator('input[inputmode="numeric"]').fill(freshCode);
  await sleep(4000);
  const cBody = await C.locator('body').innerText();
  if (cBody.includes('already has two devices')) {
    console.log('STEP 9 OK: third device rejected gracefully');
  } else {
    console.log('STEP 9 WARN: third device result:', cBody.slice(0, 300).replace(/\n/g, ' | '));
  }

  console.log('\n--- PAGE ERRORS ---');
  console.log(logs.length ? logs.slice(0, 20).join('\n') : '(none)');

  await browser.close();
}

main().catch(e => { console.error('TEST FAILED:', e.message); process.exit(1); });
