// Two-browser connect flow: verifies the "Connected" toast fires on room
// ENTRY (not on send), and that a brief tab close doesn't kill the other
// device's room (60s server-side disconnect grace).
import { chromium } from 'playwright';

const BASE = process.env.URL || 'http://localhost:3010';
const TOAST = 'Connected. You can start sending';
const results = [];
const out = (name, ok, extra = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra ? ' — ' + extra : ''}`); };

const browser = await chromium.launch();
try {
  const ctxA = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const ctxB = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const pa = await ctxA.newPage();
  const pb = await ctxB.newPage();

  // --- Creator: create a room ---
  await pa.goto(BASE, { waitUntil: 'domcontentloaded' });
  await pa.waitForSelector('[data-testid]', { timeout: 20000 }).catch(() => {});
  await pa.getByRole('button', { name: 'Send', exact: true }).click();
  await pa.waitForFunction(() => !!localStorage.getItem('sharetext.session.v1'), null, { timeout: 20000 });
  const { roomId } = await pa.evaluate(() => JSON.parse(localStorage.getItem('sharetext.session.v1')));
  out('creator room created', !!roomId);
  const short = roomId.replace(/-/g, '').slice(0, 8);

  // --- Joiner: join through the /s/ short link (the real UI path) ---
  await pb.goto(BASE, { waitUntil: 'domcontentloaded' });
  await pb.waitForTimeout(1500);
  await pb.evaluate((code) => {
    // Drive the same in-app join the link flow uses (joinWithShortCode).
    // It is exposed only through the UI, so navigate to /s/<code> and let
    // the app's route handler join.
    location.href = '/s/' + code;
  }, short);
  await pb.waitForTimeout(3000);

  // Wait for BOTH devices to see the connected toast (fires on entry).
  // The toast is name-aware ("Connected to Windows PC", generic fallback)
  // and auto-dismisses after 2.8s — so POLL from the instant of join
  // instead of waiting for a fixed string that may already be gone.
  const toastSeen = async (page) => {
    for (let i = 0; i < 130; i++) {
      const hit = await page.evaluate(() =>
        /Connected\. You can start sending|Connected to \S/.test(document.body.textContent)
      ).catch(() => false);
      if (hit) return true;
      await page.waitForTimeout(200);
    }
    return false;
  };
  const [toastOnEntryB, toastOnEntryA] = await Promise.all([toastSeen(pb), toastSeen(pa)]);
  out('joiner sees Connected toast on ENTRY', toastOnEntryB);
  out('creator sees Connected toast on ENTRY', toastOnEntryA);

  // Wait for the entry toast to fully clear BEFORE sending, so a still-
  // visible entry toast can't be miscounted as a re-fire.
  await pa.waitForSelector(`text=${TOAST}`, { state: 'detached', timeout: 10000 }).catch(() => {});
  await pb.waitForSelector(`text=${TOAST}`, { state: 'detached', timeout: 10000 }).catch(() => {});
  await pa.waitForSelector('[data-testid="composer"]', { timeout: 20000 });
  await pb.waitForSelector('[data-testid="composer"]', { timeout: 20000 });
  out('both devices in the room', true);

  // --- Send a message: toast must NOT reappear ---
  await pa.getByTestId('composer').fill('hello room');
  await pa.keyboard.press('Enter');
  await pb.waitForSelector('text=hello room', { timeout: 10000 });
  await pa.waitForTimeout(1500);
  const toastA = await pa.locator(`text=${TOAST}`).count();
  const toastB = await pb.locator(`text=${TOAST}`).count();
  out('no toast re-fire on send', toastA === 0 && toastB === 0, `a=${toastA} b=${toastB}`);

  // --- A GRACEFUL departure is not a blip: closing the tab fires pagehide,
  //     the client sends a real goodbye (notifyLeaving), and the OTHER side
  //     is told the truth without waiting out the grace window. The grace
  //     window exists for SILENT drops (tested at the end of this script) —
  //     expecting silence here tested the opposite of the contract.
  await pb.close();
  let bannerAppeared = false;
  for (let i = 0; i < 24; i++) {
    if ((await pa.locator('[data-testid="disconnect-banner"]').count()) > 0) { bannerAppeared = true; break; }
    await pa.waitForTimeout(500);
  }
  out('graceful tab close shows the true disconnected state', bannerAppeared);
  const roomSurvives = await pa.evaluate(() => {
    const s = JSON.parse(localStorage.getItem('sharetext.session.v1') || 'null');
    return !!s?.roomId;
  });
  out('room stays open for the device that remains', roomSurvives);

  // --- B returns via stored session (fresh page, same context) ---
  const pb2 = await ctxB.newPage();
  await pb2.goto(BASE, { waitUntil: 'domcontentloaded' });
  let bBackInRoom = false;
  try {
    await pb2.waitForFunction(() => {
      const s = JSON.parse(localStorage.getItem('sharetext.session.v1') || 'null');
      return !!s?.roomId;
    }, null, { timeout: 15000 });
    bBackInRoom = true;
  } catch {}
  out('joiner session persisted across reopen', bBackInRoom);
  // Room heals: A's potential banner clears once B is back.
  let healed = (await pa.locator('[data-testid="disconnect-banner"]').count()) === 0;
  if (!healed) {
    try {
      await pa.waitForSelector('[data-testid="disconnect-banner"]', { state: 'detached', timeout: 30000 });
      healed = true;
    } catch {}
  }
  out('room reconnects after joiner returns', healed);

  // --- SILENT drop (no goodbye): the 60s grace window must keep A calm.
  //     Offline-ing context B kills the transport without unloading the
  //     page, so no notifyLeaving() is sent — exactly the case the grace
  //     window was built for (a refresh or a dead Wi-Fi minute).
  await ctxB.setOffline(true);
  await pa.waitForTimeout(10000);
  const silentBanner = await pa.locator('[data-testid="disconnect-banner"]').count();
  out('silent network drop: no banner inside the grace window', silentBanner === 0, `banners=${silentBanner}`);
  await ctxB.setOffline(false);
  let healedAgain = (await pa.locator('[data-testid="disconnect-banner"]').count()) === 0;
  if (!healedAgain) {
    try {
      await pa.waitForSelector('[data-testid="disconnect-banner"]', { state: 'detached', timeout: 30000 });
      healedAgain = true;
    } catch { /* reported below */ }
  }
  out('silent drop heals when the network returns', healedAgain);

  const passed = results.filter(Boolean).length;
  console.log(`\n${passed}/${results.length} checks passed`);
  process.exitCode = passed === results.length ? 0 : 1;
} finally {
  await browser.close();
}
