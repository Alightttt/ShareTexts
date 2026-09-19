/**
 * Browser E2E for nearby device discovery, against a REAL server on :3010.
 * Driven entirely through the live UI — no protocol shims.
 *
 *   1. Two contexts open the landing page → both announce.
 *   2. Each sees the other's device row; searching row present (the old
 *      standalone hero hint line was removed in the de-clutter — the
 *      searching row now carries that instruction).
 *   3. A invites B → B sees the accept sheet → accepts.
 *   4. Inviter auto-joins via joinWithLink; invitee holds the room.
 *   5. Both land in the normal connected room; text transfers BOTH ways.
 *   6. Console/page errors are watched throughout.
 */
import { chromium } from 'playwright';

const URL = process.env.URL || 'http://localhost:3010';
const results = [];
const pageErrors = [];
const out = (name, ok, extra = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra ? ' — ' + extra : ''}`); };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const browser = await chromium.launch();
try {
  const ctxA = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const ctxB = await browser.newContext({ viewport: { width: 900, height: 900 } });
  const A = await ctxA.newPage();
  const B = await ctxB.newPage();
  for (const [tag, p] of [['A', A], ['B', B]]) {
    p.on('pageerror', e => pageErrors.push(`[${tag}] ${e.message}`));
    p.on('console', m => { if (m.type() === 'error') pageErrors.push(`[${tag}:console] ${m.text().slice(0, 160)}`); });
  }

  /* ---- 0. searching row with no peers (the single instruction) ---- */
  await A.goto(URL, { waitUntil: 'domcontentloaded' });
  await A.waitForTimeout(1500);
  const hintText = await A.getByText('Looking for nearby devices…').count();
  out('searching row visible with no peers', hintText >= 1);
  const rows0 = await A.locator('button', { hasText: 'Nearby' }).count();
  out('no device rows when alone', rows0 === 0, `rows=${rows0}`);

  /* ---- 1. second device announces; rows appear both ways ---- */
  await B.goto(URL, { waitUntil: 'domcontentloaded' });
  await B.waitForTimeout(1800);
  const rowOnA = A.locator('button:has-text("Nearby")');
  const rowOnB = B.locator('button:has-text("Nearby")');
  let seenA = false, seenB = false;
  try { await rowOnA.first().waitFor({ timeout: 8000 }); seenA = true; } catch {}
  try { await rowOnB.first().waitFor({ timeout: 4000 }); seenB = true; } catch {}
  out('A sees B\'s device row', seenA);
  out('B sees A\'s device row', seenB);
  const nameA = seenA ? (await rowOnA.first().innerText()).replace(/\s+/g, ' ').trim() : '';
  out('row shows a device label + Nearby badge', /Nearby/.test(nameA) && nameA.length > 8, nameA);

  /* ---- 2. invite → accept sheet on B ---- */
  await rowOnA.first().click();
  let sheetOnB = false;
  try { await B.getByRole('dialog').waitFor({ timeout: 10000 }); sheetOnB = true; } catch {}
  out('B receives the accept sheet', sheetOnB);
  const sheetText = sheetOnB ? (await B.getByRole('dialog').innerText()).replace(/\s+/g, ' ') : '';
  out('sheet names the inviting device', /wants to connect/.test(sheetText), sheetText.slice(0, 90));

  /* ---- 3. accept → both land in the normal room ---- */
  if (sheetOnB) {
    await B.getByRole('button', { name: 'Accept' }).click();
    // B (invitee) created the room; A joins through the normal link path.
    const bInRoom = await B.waitForFunction(
      () => !!localStorage.getItem('sharetext.session.v1'), null, { timeout: 20000 }
    ).then(() => true).catch(() => false);
    out('B (invitee) created and holds the room', bInRoom);
    const aInRoom = await A.waitForFunction(
      () => !!(JSON.parse(localStorage.getItem('sharetext.session.v1') || 'null')?.roomId)
        && !!(JSON.parse(localStorage.getItem('sharetext.session.v1') || 'null')?.secret), null, { timeout: 20000 }
    ).then(() => true).catch(() => false);
    out('A (inviter) joined with credentials', aInRoom);

    // The real connect experience: both reach the chat/composer surface.
    const aChat = await A.locator('textarea').first().waitFor({ timeout: 25000 }).then(() => true).catch(() => false);
    const bChat = await B.locator('textarea').first().waitFor({ timeout: 25000 }).then(() => true).catch(() => false);
    out('A reached the connected room UI', aChat);
    out('B reached the connected room UI', bChat);

    /* ---- 4. text transfers BOTH ways ---- */
    await A.locator('textarea').first().fill('Nearby hello from A 🚀');
    await A.getByRole('button', { name: 'Send', exact: true }).click();
    await sleep(2000);
    const bGot = (await B.locator('body').innerText()).includes('Nearby hello from A 🚀');
    out('B received A\'s text', bGot);

    await B.locator('textarea').first().fill('Reply from B via nearby');
    await B.getByRole('button', { name: 'Send', exact: true }).click();
    await sleep(2000);
    const aGot = (await A.locator('body').innerText()).includes('Reply from B via nearby');
    out('A received B\'s text', aGot);
  }
} catch (e) {
  results.push(false);
  console.error('E2E ERROR:', e);
} finally {
  await browser.close();
}
const passed = results.filter(Boolean).length;
console.log(`\n${passed}/${results.length} checks passed`);
console.log('--- CONSOLE/PAGE ERRORS ---');
if (pageErrors.length === 0) console.log('(none)');
else for (const e of pageErrors.slice(0, 12)) console.log(e);
process.exit(passed === results.length && pageErrors.length === 0 ? 0 : 1);
