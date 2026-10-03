// Two-browser emoji reactions: a reaction dropped on one device must appear
// under the same message on the other, and the tally must keep "how many
// OTHER devices picked it" separate from "did I pick it" — a room where both
// sides tap the same emoji shows 1 + own-chip-lit on each device, never 2.
import { chromium } from 'playwright';

const BASE = 'http://localhost:3010';
const results = [];
const out = (name, ok, extra = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra ? ' — ' + extra : ''}`); };

const chipText = async (page) => page.evaluate(() => {
  const chip = document.querySelector('button[aria-pressed]');
  return chip ? chip.textContent.trim() : null;
});

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
  const short = roomId.replace(/-/g, '').slice(0, 8);

  // --- Joiner: real /s/ link path ---
  await pb.goto(BASE, { waitUntil: 'domcontentloaded' });
  await pb.waitForTimeout(1500);
  await pb.evaluate((code) => { location.href = '/s/' + code; }, short);

  await pa.waitForSelector('[data-testid="composer"]', { timeout: 30000 });
  await pb.waitForSelector('[data-testid="composer"]', { timeout: 30000 });
  out('both devices in the room', true);

  // --- One message, so exactly one reaction bar exists on screen ---
  await pa.getByTestId('composer').fill('react to me');
  await pa.keyboard.press('Enter');
  await pb.waitForSelector('text=react to me', { timeout: 15000 });
  await pa.waitForTimeout(800);

  const noChipsYet = (await pa.locator('button[aria-pressed]').count()) === 0
    && (await pb.locator('button[aria-pressed]').count()) === 0;
  out('no reaction chips before anyone reacts', noChipsYet);

  // --- B reacts to A's message ---
  await pb.locator('button[aria-label="React"]').first().click();
  await pb.locator('button[aria-label="React with ❤️"]').last().click();
  await pa.waitForFunction(() => !!document.querySelector('button[aria-pressed]'), null, { timeout: 10000 }).catch(() => {});
  await pa.waitForTimeout(600);

  const bChip = await pb.locator('button[aria-pressed]').first().count();
  const bPressed = bChip ? await pb.locator('button[aria-pressed]').first().getAttribute('aria-pressed') : null;
  out('reactor sees its own chip lit', bPressed === 'true', `pressed=${bPressed}`);

  const aChipCount = await pa.locator('button[aria-pressed]').count();
  const aChipText = await chipText(pa);
  const aPressed = aChipCount ? await pa.locator('button[aria-pressed]').first().getAttribute('aria-pressed') : null;
  out('other device sees the reaction arrive', aChipCount === 1 && (aChipText || '').includes('❤️'), `text=${aChipText}`);
  out('arriving reaction counts as the OTHER device\'s', (aChipText || '').includes('1') && aPressed === 'false', `text=${aChipText} pressed=${aPressed}`);

  // --- A taps the same emoji: both sides now hold it, each lit for itself ---
  await pa.locator('button[aria-label="React"]').first().click();
  await pa.locator('button[aria-label="React with ❤️"]').last().click();
  await pb.waitForTimeout(1200);
  const aText2 = await chipText(pa);
  const aPressed2 = await pa.locator('button[aria-pressed]').first().getAttribute('aria-pressed');
  const bText2 = await chipText(pb);
  const bPressed2 = await pb.locator('button[aria-pressed]').first().getAttribute('aria-pressed');
  out('both taps: each device lights its own chip', aPressed2 === 'true' && bPressed2 === 'true', `a=${aPressed2} b=${bPressed2}`);
  out('both taps: each counts the other once', (aText2 || '').includes('1') && (bText2 || '').includes('1'), `a=${aText2} b=${bText2}`);

  // --- A removes its own tap: the row survives on B's reaction alone ---
  await pa.locator('button[aria-pressed]').first().click();
  await pb.waitForTimeout(900);
  const aAfterOwn = await chipText(pa);
  const aAfterOwnPressed = await pa.locator('button[aria-pressed]').first().getAttribute('aria-pressed');
  out('removing my own tap keeps the other device\'s count', (aAfterOwn || '').includes('❤️') && aAfterOwnPressed === 'false', `text=${aAfterOwn} pressed=${aAfterOwnPressed}`);

  // --- B removes its tap too: nobody means it, so the row disappears ---
  await pb.locator('button[aria-pressed]').first().click();
  let gone = false;
  try {
    await pa.waitForFunction(() => !document.querySelector('button[aria-pressed]'), null, { timeout: 10000 });
    gone = true;
  } catch { /* reported below */ }
  const bGone = (await pb.locator('button[aria-pressed]').count()) === 0;
  out('last reaction removed clears the row on both devices', gone && bGone, `a-cleared=${gone} b-cleared=${bGone}`);

  const passed = results.filter(Boolean).length;
  console.log(`\n${passed}/${results.length} checks passed`);
  process.exitCode = passed === results.length ? 0 : 1;
} finally {
  await browser.close();
}
