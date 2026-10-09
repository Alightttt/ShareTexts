/**
 * RTL journey (Arabic) — behavior, not screenshots. shots-f19 proves the
 * pixels; this suite proves the CONTRACT:
 *   1. The landing in `ar` sets <html lang dir=rtl> and does not overflow
 *      horizontally (no sideways page scroll in RTL).
 *   2. Two Arabic devices pair (send → code → join) through the REAL UI and
 *      reach the connected room — with dir still rtl and no overflow.
 *   3. A text transfer lands B→A inside the RTL room.
 *   4. Zero page errors throughout.
 * Run: URL=http://localhost:3010 node scripts/verify-rtl.mjs
 */
import { launchBrowser, URL, sleep, readLiveCode, waitForChat } from './lib.mjs';

const failures = [];
const ok = (cond, label, extra = '') => {
  console.log(`${cond ? 'OK  ' : 'FAIL'} ${label}${extra ? ' — ' + extra : ''}`);
  if (!cond) failures.push(label);
};

/** Seed the locale on the TARGET origin before any page script runs.
 *  Setting localStorage from a fresh about:blank page writes the wrong
 *  origin — the app never sees it and dir stays ltr. */
const seedAr = async (context) => {
  await context.addInitScript(() => {
    try { localStorage.setItem('sharetext.locale', 'ar'); } catch { /* private mode */ }
  });
};

/** dir/lang/horizontal-overflow facts for the current document. */
const dirFacts = (page) => page.evaluate(() => ({
  dir: document.documentElement.dir,
  lang: document.documentElement.lang,
  // A horizontal scrollbar anywhere on the document = broken RTL layout.
  overflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
}));

const browser = await launchBrowser();
const errors = [];
try {
  const ctxA = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const ctxB = await browser.newContext({ viewport: { width: 900, height: 900 } });
  const A = await ctxA.newPage();
  const B = await ctxB.newPage();
  await seedAr(ctxA);
  await seedAr(ctxB);
  for (const [tag, p] of [['A', A], ['B', B]]) {
    p.on('pageerror', e => errors.push(`[${tag}] ${e.message}`));
    p.on('console', m => { if (m.type() === 'error') errors.push(`[${tag}:console] ${m.text().slice(0, 160)}`); });
  }

  /* ---- 1. landing in Arabic: dir + no horizontal overflow ---- */
  await A.goto(URL, { waitUntil: 'networkidle' });
  await A.waitForTimeout(800);
  const land = await dirFacts(A);
  ok(land.dir === 'rtl', 'landing html dir=rtl', land.dir);
  ok(land.lang === 'ar', 'landing html lang=ar', land.lang);
  ok(land.overflowX <= 0, 'landing: no horizontal overflow in RTL', `+${land.overflowX}px`);

  /* ---- 2. pair two Arabic devices through the real UI ---- */
  await A.getByTestId('home-send').click();
  await A.getByTestId('pairing-code').waitFor({ timeout: 15000 });
  const code = await readLiveCode(A);
  console.log('code:', code);

  await B.goto(URL, { waitUntil: 'domcontentloaded' });
  await B.getByTestId('home-receive').click();
  await sleep(400);
  await B.locator('input[inputmode="numeric"]').first().fill(code);
  await waitForChat(B, 'B');
  await waitForChat(A, 'A');
  ok(true, 'both Arabic devices reached the connected room');

  const roomA = await dirFacts(A);
  const roomB = await dirFacts(B);
  ok(roomA.dir === 'rtl' && roomB.dir === 'rtl', 'room keeps dir=rtl on both sides');
  ok(roomA.overflowX <= 0, 'A room: no horizontal overflow in RTL', `+${roomA.overflowX}px`);
  ok(roomB.overflowX <= 0, 'B room: no horizontal overflow in RTL', `+${roomB.overflowX}px`);

  /* ---- 3. text transfer inside the RTL room (B → A) ---- */
  await B.locator('[data-testid="composer"] textarea, textarea').first().fill('مرحبا من اليمين إلى اليسار');
  await B.getByTestId('send').click();
  await sleep(2500);
  const aBody = await A.locator('body').innerText();
  ok(aBody.includes('مرحبا من اليمين إلى اليسار'), 'B→A Arabic text arrived in A');

  await ctxA.close();
  await ctxB.close();
} catch (e) {
  failures.push('script error: ' + e.message);
  console.log('SCRIPT ERROR:', e.message);
} finally {
  await browser.close();
}

if (errors.length) {
  console.log('\nPAGE/CONSOLE ERRORS:');
  errors.forEach(e => console.log(' ', e));
  failures.push('page errors: ' + errors.join('; '));
}
console.log(`\nverify-rtl: ${failures.length === 0 ? 'ALL CHECKS PASSED' : failures.length + ' FAILURE(S)'}`);
if (failures.length) { failures.forEach(f => console.log(' -', f)); process.exit(1); }
