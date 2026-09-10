// Connecting-state checks (scripts/connecting-state.test.mjs)
// Covers the 'connecting' PanelMode added in SingleScreenApp:
//   1. Joiner (mobile) sees the connecting screen after the code is accepted,
//      then lands in the room — never a dead end.
//   2. Creator (desktop) sees the "Room open" pointer while the peer connects.
//   3. Reconnect guard: a peer_joined after the channel has opened (refresh /
//      drop) must NOT yank the room back to the connecting screen.
//   4. Cancel from connecting:
//      a) the joiner abandons back to the landing page;
//      b) the creator keeps the room — both devices still reach the room.
// Notes:
//   · abandonSession closes the room for BOTH devices, which is why (a) and
//     (b) need separate rooms.
//   · On localhost the WebRTC handshake can finish in <100ms, leaving no
//     window to click Cancel while connecting. Scenario (a) freezes C's
//     RTCPeerConnection so the connecting state persists deterministically.
import { launchBrowser, URL, sleep, readLiveCode } from './lib.mjs';

async function waitFor(page, fn, { timeout = 8000, step = 25 } = {}) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    if (await fn()) return true;
    await sleep(step);
  }
  return false;
}

/** Resolves as soon as the page shows the given hero text at any instant. */
function heroVisible(page, heroText, timeout = 20000) {
  return page.waitForFunction(
    (needle) => (document.body?.innerText || '').includes(needle),
    heroText, { timeout, polling: 'raf' },
  ).then(() => true).catch(() => false);
}

/** Resolves once the hero text is up AND exactly one Cancel button exists
 *  (the AnimatePresence crossfade briefly shows both heroes' buttons). */
function stableHero(page, heroText, timeout = 20000) {
  return page.waitForFunction(
    (needle) => {
      const body = document.body?.innerText || '';
      const cancels = [...document.querySelectorAll('button')]
        .filter(b => b.textContent.trim() === 'Cancel').length;
      return body.includes(needle) && cancels === 1;
    },
    heroText, { timeout, polling: 'raf' },
  ).then(() => true).catch(() => false);
}

async function main() {
  const browser = await launchBrowser();
  let failed = 0;
  const check = (ok, name, extra = '') => {
    console.log(`${ok ? 'OK  ' : 'FAIL'} ${name}${ok || !extra ? '' : ' — ' + extra}`);
    if (!ok) failed++;
  };

  // A = creator, desktop viewport. B = joiner, phone-sized (touch so the
  // mobile layout engages). C = frozen-PC joiner; F = real joiner. Every
  // joiner gets its own fresh context: ctxC's init script freezes WebRTC
  // for every page created in it, and used contexts auto-resume stored
  // sessions on goto.
  const ctxA = await browser.newContext(); // 1280x720 → desktop layout
  const ctxB = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const ctxC = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const A = await ctxA.newPage();
  const B = await ctxB.newPage();
  const errors = [];
  A.on('pageerror', e => errors.push(`[A] ${e.message}`));
  B.on('pageerror', e => errors.push(`[B] ${e.message}`));

  // --- 1+2: creator on desktop, joiner on mobile ---
  await A.goto(URL, { waitUntil: 'networkidle' });
  await A.getByRole('button', { name: 'Send' }).first().click();
  await A.getByRole('group', { name: 'Pairing code' }).waitFor({ timeout: 10000 });
  const code = await readLiveCode(A);

  // Arm the creator-side watcher BEFORE the joiner acts: on localhost the
  // whole handshake can complete in well under a second, so the desktop
  // "Room open" window is only catchable if we're already watching.
  const aRoomOpenPromise = heroVisible(A, 'Room open');

  await B.goto(URL, { waitUntil: 'networkidle' });
  await B.getByRole('button', { name: 'Receive' }).first().click();
  await B.locator('input[inputmode="numeric"]').fill(code);

  // B: the connecting screen must appear after the code is accepted…
  const sawBConnecting = await heroVisible(B, 'Connecting to your device', 6000);
  check(sawBConnecting, 'B (joiner, mobile) shows the connecting screen after joining');

  // …and it must hand off to the room (no dead end).
  const bInRoom = await waitFor(B, () => B.locator('textarea').count().then(c => c > 0), { timeout: 15000 });
  check(bInRoom, 'B lands in the room after connecting');

  const sawARoomOpen = await aRoomOpenPromise;
  check(sawARoomOpen, 'A (creator, desktop) shows the roomOpen pointer while peer connects');
  const aInRoom = await waitFor(A, () => A.locator('textarea').count().then(c => c > 0), { timeout: 15000 });
  check(aInRoom, 'A lands in the room after peer connects');

  // --- 3: reconnect guard — refresh A; must return to the ROOM, not the
  // connecting screen (peer_joined fires again after the channel opened) ---
  await A.reload({ waitUntil: 'networkidle' });
  const aBack = await waitFor(A, () => A.locator('textarea').count().then(c => c > 0), { timeout: 15000 });
  const aText = aBack ? '' : (await A.locator('body').innerText()).slice(0, 200).replace(/\n/g, ' | ');
  check(aBack, 'A returns to the room after refresh (reconnect guard)', aText);

  // --- 4a: joiner cancel path (fresh room, frozen handshake) ---
  // Freeze C's WebRTC: createOffer never resolves, so no channel opens and C
  // stays on the connecting screen until we click Cancel. Page-scoped, so
  // later pages (F) keep real WebRTC.
  const C = await ctxC.newPage();
  C.on('pageerror', e => errors.push(`[C] ${e.message}`));
  await C.addInitScript(() => {
    class FrozenPC {
      createOffer() { return new Promise(() => {}); }
      createAnswer() { return new Promise(() => {}); }
      setLocalDescription() { return Promise.resolve(); }
      setRemoteDescription() { return Promise.resolve(); }
      addIceCandidate() { return Promise.resolve(); }
      addEventListener() {}
      removeEventListener() {}
      close() {}
      get signalingState() { return 'have-local-offer'; }
      get iceConnectionState() { return 'new'; }
      get connectionState() { return 'new'; }
    }
    window.RTCPeerConnection = FrozenPC;
    window.webkitRTCPeerConnection = FrozenPC;
  });

  // Fresh context: A's context holds a stored session that auto-resumes, so
  // the "second creator" must get its own origin-clean context.
  const ctxD = await browser.newContext(); // 1280x720 → desktop layout
  const A2 = await ctxD.newPage();
  A2.on('pageerror', e => errors.push(`[A2] ${e.message}`));
  await A2.goto(URL, { waitUntil: 'networkidle' });
  await A2.getByRole('button', { name: 'Send' }).first().click();
  await A2.getByRole('group', { name: 'Pairing code' }).waitFor({ timeout: 10000 });
  const code2 = await readLiveCode(A2);

  const a2RoomOpenPromise = heroVisible(A2, 'Room open');
  await C.goto(URL, { waitUntil: 'networkidle' });
  await C.getByRole('button', { name: 'Receive' }).first().click();
  await C.locator('input[inputmode="numeric"]').fill(code2);

  check(await heroVisible(C, 'Connecting to your device', 10000), 'C shows the connecting screen after joining');
  check(await a2RoomOpenPromise, 'A2 shows the roomOpen pointer while C connects');

  // C (joiner) cancels while connecting → back to the landing page (code
  // entry gone, session abandoned). The frozen PC keeps this state stable:
  // wait out the hero crossfade (exactly one Cancel) and click.
  check(await stableHero(C, 'Connecting to your device', 6000), 'C connecting screen settles (single Cancel)');
  await C.getByRole('button', { name: 'Cancel' }).click();
  const cHome = await waitFor(C, () =>
    C.getByRole('button', { name: 'Receive' }).count().then(c => c > 0), { timeout: 6000 });
  const cUrl = C.url().replace(/\/$/, '');
  check(cHome && cUrl === URL.replace(/\/$/, ''), 'C cancel returns to a clean landing page', `url=${cUrl}`);

  // --- 4b: creator cancel path (fresh room, real handshake) ---
  // C's abandon closed the room (A2 shows the ended screen). Start a NEW
  // room and have F join it; then A2 dismisses its connecting screen.
  // dismissConnecting must NOT abandon: the room survives and both devices
  // still reach the transfer room. F gets a fresh context (real WebRTC,
  // no stored session).
  const ctxE = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  await A2.getByRole('button', { name: 'Back to Home' }).click();
  await A2.getByRole('button', { name: 'Send' }).first().click();
  await A2.getByRole('group', { name: 'Pairing code' }).waitFor({ timeout: 10000 });
  const code3 = await readLiveCode(A2);

  const F = await ctxE.newPage();
  F.on('pageerror', e => errors.push(`[F] ${e.message}`));
  const a2RoomOpen2 = heroVisible(A2, 'Room open');
  await F.goto(URL, { waitUntil: 'networkidle' });
  await F.getByRole('button', { name: 'Receive' }).first().click();
  await F.locator('input[inputmode="numeric"]').fill(code3);

  check(await a2RoomOpen2, 'A2 shows the roomOpen pointer for the fresh room');
  check(await stableHero(A2, 'Room open', 6000), 'A2 connecting screen settles (single Cancel)');
  // Scope to the connecting panel: if the handshake completes between the
  // visibility check and the click, a detached-element retry that re-resolves
  // an unscoped 'Cancel' can hit the SENDING hero's Cancel instead — which
  // abandons the room. The panel-scoped locator can only ever match the
  // connecting screen's button (and the panel disappears when dismissed).
  await A2.getByTestId('connecting-panel').getByRole('button', { name: 'Cancel' }).click({ timeout: 5000 });
  const a2Connected = await waitFor(A2, () => A2.locator('textarea').count().then(c => c > 0), { timeout: 20000 });
  check(a2Connected, 'A2 reaches the room after dismissing connecting (creator room survives)');
  const fInRoom = await waitFor(F, () => F.locator('textarea').count().then(c => c > 0), { timeout: 20000 });
  check(fInRoom, 'F (joiner) reaches the room after the creator dismissed connecting');

  await browser.close();
  if (errors.length) {
    console.log('--- PAGE ERRORS ---');
    for (const e of errors) console.log(e);
    failed++;
  }
  console.log(failed === 0 ? '\nALL CONNECTING-STATE CHECKS PASSED' : `\n${failed} CHECK(S) FAILED`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch(e => { console.error(e); process.exit(1); });
