import { launchBrowser, URL, sleep, readLiveCode, waitForChat } from './lib.mjs';
import { io } from 'socket.io-client';

// Two-peer room enforcement:
//  A creates → B joins → connected.
//  C (UI) enters the code → human message, no roomId/secret/error codes leaked.
//  C1+C2 simultaneously → both rejected.
//  Raw socket.io client emits join_with_link with the real roomId (bypassing
//  the UI) → server still rejects with ROOM_FULL.
const b = await launchBrowser();
try {
  const ctxA = await b.newContext({ viewport: { width: 1280, height: 900 } });
  const ctxB = await b.newContext({ viewport: { width: 1280, height: 900 } });
  const ctxC = await b.newContext({ viewport: { width: 1280, height: 900 } });
  const A = await ctxA.newPage();
  const B = await ctxB.newPage();
  const C = await ctxC.newPage();
  await A.goto(URL, { waitUntil: 'networkidle' });
  await B.goto(URL, { waitUntil: 'networkidle' });
  await C.goto(URL, { waitUntil: 'networkidle' });

  await A.getByRole('button', { name: 'Send text' }).first().click();
  await A.getByText('LIVE CODE').waitFor({ timeout: 10000 });
  const code = await readLiveCode(A);
  await B.getByRole('button', { name: 'Receive text' }).first().click();
  await B.locator('input[inputmode="numeric"]').fill(code);
  await waitForChat(B, 'B');
  await waitForChat(A, 'A');
  await sleep(400);

  // --- C: the UI path ---
  await C.getByRole('button', { name: 'Receive text' }).first().click();
  await C.locator('input[inputmode="numeric"]').fill(code);
  await sleep(2500);
  const uiState = await C.evaluate(() => ({
    body: document.body.innerText.slice(0, 500),
    errorShown: document.body.innerText.includes('This session already has two devices.'),
    joining: document.body.innerText.includes('Connecting') || document.body.innerText.includes('Verifying'),
  }));
  const roomId = await A.evaluate(() => {
    try { return JSON.parse(localStorage.getItem('sharetext.session.v1')).roomId; } catch { return null; }
  });
  const secret = await A.evaluate(() => {
    try { return JSON.parse(localStorage.getItem('sharetext.session.v1')).secret; } catch { return null; }
  });
  // Nothing internal may leak into the third device's DOM.
  const noLeak = !uiState.body.includes(roomId) && !uiState.body.includes(secret) && !/ROOM_FULL|EADDRINUSE|stack|WebSocket/.test(uiState.body);
  const uiOk = uiState.errorShown && noLeak && !uiState.joining;

  // --- Simultaneous third-device attempts (C1 + C2 at once) ---
  const C1 = await ctxC.newPage();
  const C2 = await ctxC.newPage();
  await C1.goto(URL, { waitUntil: 'networkidle' });
  await C2.goto(URL, { waitUntil: 'networkidle' });
  await C1.getByRole('button', { name: 'Receive text' }).first().click();
  await C2.getByRole('button', { name: 'Receive text' }).first().click();
  await Promise.all([
    C1.locator('input[inputmode="numeric"]').fill(code),
    C2.locator('input[inputmode="numeric"]').fill(code),
  ]);
  await sleep(2500);
  const c1ok = await C1.evaluate(() => document.body.innerText.includes('This session already has two devices.'));
  const c2ok = await C2.evaluate(() => document.body.innerText.includes('This session already has two devices.'));

  // --- Raw client bypass: direct socket join_with_link with the real roomId ---
  const raw = io('http://localhost:3000', { transports: ['websocket'] });
  const rawRes = await new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('timeout')), 8000);
    raw.on('connect', () => {
      raw.emit('join_with_link', { roomId }, (res) => { clearTimeout(t); resolve(res); });
    });
    raw.on('connect_error', (e) => { clearTimeout(t); reject(e); });
  });
  raw.close();
  const bypassBlocked = rawRes && rawRes.success === false && (rawRes.code === 'ROOM_FULL' || rawRes.error === 'This session already has two devices.');
  const bypassClean = rawRes && rawRes.roomId === undefined && rawRes.secret === undefined;

  console.log(JSON.stringify({
    uiMessage: uiState.errorShown,
    joining: uiState.joining,
    noLeak: noLeak && !noLeak === false,
    c1Rejected: c1ok,
    c2Rejected: c2ok,
    bypassBlocked,
    bypassClean,
    rawResponse: rawRes && { success: rawRes.success, code: rawRes.code || null, hasRoom: !!rawRes.roomId, hasSecret: !!rawRes.secret },
  }, null, 2));
  const ok = uiOk && c1ok && c2ok && bypassBlocked && bypassClean;
  console.log(ok ? 'PEER_LIMIT_OK' : 'PEER_LIMIT_FAIL');
} finally {
  await b.close();
}
