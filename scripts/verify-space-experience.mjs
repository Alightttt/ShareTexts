// Space experience suite (§12) — the redesigned journey through the REAL UI.
//
// Needs the dev server (default :3010):
//   URL=http://localhost:3010 node scripts/verify-space-experience.mjs
//
// Covers what the brief asks and verify-space-ui doesn't already own:
//   create (generated code + advanced options collapsed) → collision
//   feedback → share sheet order (code → QR → copy, real QR, copy state) →
//   2nd device joins → device roster + count → refresh → reopen from the
//   landing (no token in the URL) → mobile viewport → dark theme → RTL →
//   close (creator AND joiner see the closed screen) → invalid code with
//   one-gesture recovery. Expiry/collision/rate-limit are owned by the
//   server suites (verify-space, verify-space-code) under the test clock.
import { launchBrowser, URL } from './lib.mjs';
import crypto from 'node:crypto';

const ALPHA = 'ACDEFGHJKMNPQRTUVWXYZ234679';
const freshCode = () => Array.from(crypto.randomBytes(8)).map(b => ALPHA[b % ALPHA.length]).join('');
const UNKNOWN = freshCode(); // random 8 — never created

let pass = 0, fail = 0;
const ok = (n, c, x = '') => {
  if (c) { pass++; console.log(`  ok  ${n}${x ? ' — ' + x : ''}`); }
  else { fail++; console.log(`FAIL  ${n}${x ? ' — ' + x : ''}`); }
};

const browser = await launchBrowser();
const errors = [];
const mk = async ({ viewport = { width: 1366, height: 900 }, theme, locale } = {}) => {
  const ctx = await browser.newContext({ viewport });
  try { await ctx.grantPermissions(['clipboard-read', 'clipboard-write']); } catch { /* best effort */ }
  if (theme) await ctx.addInitScript(k => { try { localStorage.setItem('sharetext.theme', k); } catch { /* private mode */ } }, theme);
  if (locale) await ctx.addInitScript(l => { try { localStorage.setItem('sharetext.locale', l); } catch { /* private mode */ } }, locale);
  const page = await ctx.newPage();
  page.on('pageerror', e => errors.push(String(e)));
  page.on('console', m => {
    if (m.type() !== 'error') return;
    const url = (m.location && m.location()?.url) || '';
    // The invalid-code journey provokes a DELIBERATE no-oracle 404 from
    // /space/join-code — Chromium logs every 4xx resource to the console,
    // but that response IS the designed behaviour under test.
    if (/\/space\/join-code/.test(url)) return;
    errors.push(`[console] ${url || '?'} ${m.text().slice(0, 120)}`);
  });
  return { ctx, page };
};

try {
  // ── creator: generated-code path + progressive disclosure ─────────────
  const A = await mk();
  await A.page.goto(URL + '/space/create', { waitUntil: 'domcontentloaded' });
  await A.page.waitForSelector('[data-testid="space-code-input"]', { timeout: 15000 });

  const optOpen = await A.page.locator('[data-testid="space-create-optional"]').evaluate(el => el.open);
  ok('create: advanced options collapsed by default', optOpen === false);

  await A.page.locator('[data-testid="space-code-generate"]').click();
  const gen = await A.page.inputValue('[data-testid="space-code-input"]');
  ok('create: generate fills a 4+4 formatted code', /^[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(gen), gen);
  await A.page.waitForFunction(
    () => /available/i.test(document.querySelector('[data-testid="space-code-status"]')?.textContent || ''),
    { timeout: 10000 },
  ).catch(() => {});
  const genStatus = (await A.page.locator('[data-testid="space-code-status"]').textContent() || '').trim();
  ok('create: generated code availability resolves', /available/i.test(genStatus), genStatus);

  await A.page.locator('[data-testid="space-create-cta"]').click();
  await A.page.waitForURL(/\/space\/[0-9a-f-]{36}#k=/, { timeout: 15000 });
  const spaceUrl = A.page.url();
  const spaceId = spaceUrl.match(/\/space\/([0-9a-f-]{36})/)[1];
  await A.page.waitForSelector('[data-testid="space-code-chip"]', { timeout: 15000 });
  const chip0 = (await A.page.locator('[data-testid="space-code-chip"]').textContent()).trim();
  ok('create lands in the space with the code in the header', chip0 === gen, chip0);
  ok('space is empty and honest about it', await A.page.locator('[data-testid="space-empty"]').isVisible());

  // ── share sheet: CODE first, then QR → share → copy ──────────────────
  await A.page.locator('[data-testid="space-share-btn"]').click();
  await A.page.waitForSelector('[data-testid="space-share"]', { timeout: 10000 });
  const shareCode = (await A.page.locator('[data-testid="space-share-code"]').textContent()).trim();
  ok('share sheet leads with the human code', shareCode === gen, shareCode);
  const order = await A.page.evaluate(() => {
    const sheet = document.querySelector('[data-testid="space-share"]');
    const q = s => (sheet ? sheet.querySelector(s) : null);
    const code = q('[data-testid="space-share-code"]'), qr = q('[data-testid="space-share-qr"]'), copy = q('[data-testid="space-share-copy-code"]');
    if (!code || !qr || !copy) return 'missing';
    const codeFirst = !!(code.compareDocumentPosition(qr) & Node.DOCUMENT_POSITION_FOLLOWING);
    const qrFirst = !!(qr.compareDocumentPosition(copy) & Node.DOCUMENT_POSITION_FOLLOWING);
    return codeFirst && qrFirst;
  });
  ok('share order: code → QR → copy', order === true, String(order));

  await A.page.locator('[data-testid="space-share-qr"]').click();
  await A.page.waitForSelector('[data-testid="space-share"] svg[width="208"]', { timeout: 10000 }).catch(() => {});
  ok('QR toggle renders a real QR', await A.page.locator('[data-testid="space-share"] svg[width="208"]').count() >= 1);

  await A.page.locator('[data-testid="space-share-copy-code"]').click();
  await A.page.waitForTimeout(500);
  const copiedLabel = (await A.page.locator('[data-testid="space-share-copy-code"]').textContent() || '').trim();
  ok('copy code flips to copied', /copied/i.test(copiedLabel), copiedLabel);
  await A.page.keyboard.press('Escape');
  await A.page.waitForSelector('[data-testid="space-share"]', { state: 'hidden', timeout: 5000 }).catch(() => {});

  // ── collision feedback in the create sheet (2nd device) ──────────────
  const B = await mk();
  await B.page.goto(URL + '/space/create', { waitUntil: 'domcontentloaded' });
  await B.page.waitForSelector('[data-testid="space-code-input"]', { timeout: 15000 });
  await B.page.fill('[data-testid="space-code-input"]', gen.toLowerCase());
  await B.page.waitForFunction(
    () => /already in use/i.test(document.querySelector('[data-testid="space-code-status"]')?.textContent || ''),
    { timeout: 10000 },
  ).catch(() => {});
  const taken = (await B.page.locator('[data-testid="space-code-status"]').textContent() || '').trim();
  ok('collision: taken code says so inline', /already in use/i.test(taken), taken);

  // ── join by typing the code (auto-submit on the 8th char) ────────────
  await B.page.goto(URL + '/space/join', { waitUntil: 'domcontentloaded' });
  await B.page.waitForSelector('[data-testid="space-join-code-input"]', { timeout: 15000 });
  await B.page.type('[data-testid="space-join-code-input"]', gen.replace('-', ''));
  await B.page.waitForURL(new RegExp(spaceId.replace(/-/g, '-')), { timeout: 15000 });
  ok('join lands in the same space', B.page.url().includes(spaceId), B.page.url().slice(0, 60));

  // ── connected-devices roster (§6) ────────────────────────────────────
  await A.page.waitForSelector('[data-testid="space-devices"]', { timeout: 20000 });
  const rowsA = await A.page.locator('[data-testid="space-devices"] li').count();
  ok('creator sees the device roster', rowsA === 2, `rows=${rowsA}`);
  const countA = (await A.page.locator('[data-testid="space-members"]').textContent() || '').trim();
  ok('count agrees with the roster', /2\s*devices/i.test(countA), countA);

  await B.page.waitForSelector('[data-testid="space-devices"]', { timeout: 20000 });
  const selfRows = await B.page.locator('[data-testid="space-devices"] li:has-text("This device")').count();
  ok('joiner roster marks this device', selfRows === 1, `self=${selfRows}`);

  // ── refresh keeps the space (fragment token) ─────────────────────────
  await A.page.reload({ waitUntil: 'domcontentloaded' });
  await A.page.waitForSelector('[data-testid="space-code-chip"]', { timeout: 15000 });
  ok('refresh keeps you in the space', A.page.url().includes(spaceId));
  await A.page.waitForSelector('[data-testid="space-devices"]', { timeout: 20000 });
  const rowsRefresh = await A.page.locator('[data-testid="space-devices"] li').count();
  ok('roster survives the refresh', rowsRefresh === 2, `rows=${rowsRefresh}`);

  // ── reopen from the landing recent list (no token in the URL) ────────
  // The row is identified by the space's own name (it appears in h1 and in
  // the recent row); the action label itself is `space.reopen` ("Open").
  const spaceName = (await A.page.locator('h1').first().textContent() || '').trim();
  await A.page.goto(URL + '/', { waitUntil: 'domcontentloaded' });
  await A.page.waitForSelector('[data-testid="space-entry"]', { timeout: 15000 });
  const reopenBtn = A.page.locator('[data-testid="space-entry"] button').filter({ hasText: spaceName }).first();
  ok('landing offers the recent space', await reopenBtn.isVisible());
  await reopenBtn.click();
  await A.page.waitForURL(/\/space\/[0-9a-f-]{36}/, { timeout: 15000 });
  await A.page.waitForSelector('[data-testid="space-code-chip"]', { timeout: 15000 });
  ok('reopen re-enters without a token in the URL',
    A.page.url().includes(spaceId) && !A.page.url().includes('#k='),
    A.page.url().replace(URL, ''));

  // ── mobile viewport ──────────────────────────────────────────────────
  await A.page.setViewportSize({ width: 390, height: 844 });
  await A.page.waitForTimeout(300);
  const mob = await A.page.evaluate(() => {
    const send = document.querySelector('[data-testid="space-send"]')?.getBoundingClientRect();
    return {
      overflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      sendRight: send ? send.right : null,
      sendBottom: send ? send.bottom : null,
      vh: window.innerHeight, vw: window.innerWidth,
    };
  });
  ok('mobile: composer + share + send visible',
    await A.page.locator('[data-testid="space-composer"]').isVisible()
    && await A.page.locator('[data-testid="space-share-btn"]').isVisible()
    && await A.page.locator('[data-testid="space-send"]').isVisible());
  ok('mobile: no horizontal overflow', mob.overflowX === 0, `ox=${mob.overflowX}`);
  ok('mobile: send button inside the viewport',
    mob.sendRight !== null && mob.sendRight <= mob.vw + 1 && mob.sendBottom <= mob.vh + 1,
    `right=${mob.sendRight} bottom=${mob.sendBottom} vp=${mob.vw}x${mob.vh}`);
  await A.page.setViewportSize({ width: 1366, height: 900 });

  // ── dark theme (fresh device, seeded before paint) ───────────────────
  // NOTE: a link joiner never sees the code chip — the server stores only
  // sha256(code) (F21 no-plaintext rule), so readiness = the members count.
  const D = await mk({ theme: 'dark' });
  await D.page.goto(spaceUrl, { waitUntil: 'domcontentloaded' });
  await D.page.waitForSelector('[data-testid="space-members"]', { timeout: 15000 });
  ok('link joiner lands in the space', await D.page.locator('[data-testid="space-composer"]').isVisible());
  const dark = await D.page.evaluate(() => ({
    cls: document.documentElement.classList.contains('dark'),
    composerBg: getComputedStyle(document.querySelector('[data-testid="space-composer"]')).backgroundColor,
  }));
  ok('dark: html.dark applied before paint', dark.cls === true);
  ok('dark: composer switches to the dark surface',
    dark.composerBg.includes('0.05') && !dark.composerBg.startsWith('rgb(255, 255, 255)'), dark.composerBg);

  // ── RTL (Arabic device on the space view) ────────────────────────────
  const R = await mk({ locale: 'ar' });
  await R.page.goto(spaceUrl, { waitUntil: 'domcontentloaded' });
  await R.page.waitForSelector('[data-testid="space-members"]', { timeout: 15000 });
  const rt = await R.page.evaluate(() => ({
    dir: document.documentElement.dir,
    lang: document.documentElement.lang,
    overflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
  }));
  ok('RTL: space view is dir=rtl lang=ar', rt.dir === 'rtl' && rt.lang === 'ar', `${rt.dir}/${rt.lang}`);
  ok('RTL: no sideways scroll', rt.overflowX === 0, `ox=${rt.overflowX}`);

  // ── close: creator confirms, BOTH devices see the closed screen ──────
  await A.page.getByRole('button', { name: /close now/i }).click();
  await A.page.waitForSelector('text=/close this space/i', { timeout: 8000 });
  await A.page.getByRole('button', { name: /close space/i }).click();
  await A.page.waitForSelector('text=/this space is closed/i', { timeout: 15000 });
  ok('creator lands on the closed screen', true);
  const homeBtn = await A.page.getByRole('button', { name: /home|back|start/i }).first().isVisible().catch(() => false);
  ok('closed screen offers a way back', homeBtn);
  await B.page.waitForSelector('text=/this space is closed/i', { timeout: 20000 });
  ok('joiner is told the space closed', true);

  // ── invalid code: no-oracle message + one-gesture recovery ───────────
  const C = await mk();
  await C.page.goto(URL + '/space/join', { waitUntil: 'domcontentloaded' });
  await C.page.waitForSelector('[data-testid="space-join-code-input"]', { timeout: 15000 });
  await C.page.type('[data-testid="space-join-code-input"]', UNKNOWN);
  await C.page.waitForSelector('text=/no space with that code/i', { timeout: 15000 });
  ok('invalid code: one no-oracle message', true);
  const rec = await C.page.evaluate(() => {
    const el = document.querySelector('[data-testid="space-join-code-input"]');
    return { focused: document.activeElement === el, sel: el.selectionEnd - el.selectionStart, len: el.value.length };
  });
  ok('invalid code: failed code selected for a one-gesture retry',
    rec.focused && rec.len > 0 && rec.sel === rec.len, JSON.stringify(rec));
  ok('invalid code: join stays available for retry',
    await C.page.locator('[data-testid="space-join-cta"]').isEnabled());

  // ── nothing anywhere should have crashed ─────────────────────────────
  ok('zero page/console errors', errors.length === 0, errors.slice(0, 3).join(' | '));
} catch (e) {
  fail++;
  console.log('FAIL  suite aborted —', e && e.message ? e.message : e);
  if (errors.length) console.log('  errors:', errors.slice(0, 5).join(' | '));
} finally {
  await browser.close().catch(() => {});
}

console.log(`\nspace-experience: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
