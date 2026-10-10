// F21 space-code UI suite — drives the REAL code-first flow in a browser.
//
// Needs the dev server on :3012 (npm run dev / start-preview.ps1):
//
//   URL=http://localhost:3012 node scripts/verify-space-ui.mjs
//
// create (typed code, live availability) → header chip → 2nd device joins
// by typing the code → cross-device item sync → honest unknown-code copy.
// create (custom code) → header chip → 2nd device joins by typing the code →
// item added by joiner → both see it. Mirrors what a human does.
import { chromium } from 'playwright';
import crypto from 'node:crypto';

// Fresh valid code per run (27-char alphabet, no 0/O/1/I/L/5/S/B).
const ALPHA = 'ACDEFGHJKMNPQRTUVWXYZ234679';
const freshCode = () => Array.from(crypto.randomBytes(8)).map(b => ALPHA[b % ALPHA.length]).join('');
const CODE = freshCode();
const CODE_DASH = `${CODE.slice(0, 4)}-${CODE.slice(4)}`;
const UNKNOWN = freshCode(); // random 8, never created

// Default 3010 like the rest of the battery — the old 3012 server no
// longer exists and only produced connection-refused phantom failures.
const BASE = process.env.URL || 'http://localhost:3010';
let pass = 0, fail = 0;
const ok = (n, c, x = '') => { if (c) { pass++; console.log(`  ok  ${n}${x ? ' — ' + x : ''}`); } else { fail++; console.log(`FAIL  ${n}${x ? ' — ' + x : ''}`); } };

const browser = await chromium.launch();
const errors = [];
const mk = async () => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 } });
  const page = await ctx.newPage();
  page.on('pageerror', e => errors.push(String(e)));
  return { ctx, page };
};

try {
  // ── creator device ────────────────────────────────────────────────────
  const A = await mk();
  await A.page.goto(BASE + '/space/create', { waitUntil: 'domcontentloaded' });
  await A.page.waitForSelector('[data-testid="space-code-input"]', { timeout: 15000 });
  ok('create sheet shows the code field first', await A.page.locator('[data-testid="space-code-input"]').isVisible());

  await A.page.fill('[data-testid="space-code-input"]', CODE_DASH.toLowerCase());
  ok('input formats the code as typed', await A.page.inputValue('[data-testid="space-code-input"]') === CODE_DASH, await A.page.inputValue('[data-testid="space-code-input"]'));
  await A.page.waitForTimeout(700); // availability debounce (350ms) + roundtrip
  const status = await A.page.locator('[data-testid="space-code-status"]').textContent().catch(() => '');
  ok('availability check runs live', /available/i.test(status || ''), status);

  await A.page.locator('[data-testid="space-create-cta"]').click();
  await A.page.waitForURL(/\/space\/[0-9a-f-]{36}#k=/, { timeout: 15000 });
  const url = A.page.url();
  const spaceId = url.match(/\/space\/([0-9a-f-]{36})/)[1];
  ok('create lands in the space', true, spaceId.slice(0, 8));
  await A.page.waitForSelector('[data-testid="space-code-chip"]', { timeout: 15000 });
  const chip = (await A.page.locator('[data-testid="space-code-chip"]').textContent()).trim();
  ok('header chip shows the code', chip === CODE_DASH, chip);

  // ── joiner device ─────────────────────────────────────────────────────
  const B = await mk();
  await B.page.goto(BASE + '/space/join', { waitUntil: 'domcontentloaded' });
  await B.page.waitForSelector('[data-testid="space-join-code-input"]', { timeout: 15000 });
  await B.page.type('[data-testid="space-join-code-input"]', CODE);
  // Auto-submit fires on the 8th valid char — just wait for the landing.
  await B.page.waitForURL(/\/space\/[0-9a-f-]{36}/, { timeout: 15000 });
  ok('join-by-code lands in the same space', B.page.url().includes(spaceId), B.page.url().slice(0, 60));
  await B.page.waitForSelector('[data-testid="space-code-chip"]', { timeout: 15000 });
  ok('joiner sees the code chip too', (await B.page.locator('[data-testid="space-code-chip"]').textContent()).trim() === CODE_DASH);

  // joiner adds text; both devices should show it
  await B.page.locator('textarea, [contenteditable="true"], input[type="text"]').last().fill('hello from device B');
  await B.page.keyboard.press('Enter');
  await A.page.waitForTimeout(1200);
  const onA = await A.page.getByText('hello from device B').count();
  ok('joiner text appears on the creator device', onA >= 1, `count=${onA}`);

  // unknown-code path in the UI
  const C = await mk();
  await C.page.goto(BASE + '/space/join', { waitUntil: 'domcontentloaded' });
  await C.page.waitForSelector('[data-testid="space-join-code-input"]', { timeout: 15000 });
  await C.page.type('[data-testid="space-join-code-input"]', UNKNOWN);
  await C.page.waitForSelector('text=/no space with that code/i', { timeout: 15000 }).catch(() => {});
  const notFound = await C.page.getByText(/no space with that code/i).count();
  ok('unknown code shows the honest no-oracle message', notFound >= 1);

  ok('no page errors across all devices', errors.length === 0, errors.slice(0, 2).join(' | '));
} finally {
  await browser.close();
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
