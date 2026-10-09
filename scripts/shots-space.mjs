/**
 * Space-experience evidence shots (this phase): the redesigned surfaces the
 * brief changes — create sheet (progressive disclosure), share sheet (code →
 * QR), the connected-devices roster, dark, RTL, mobile, the closed screen,
 * the no-oracle invalid-code state, the landing's recent-space row, and the
 * secondary routes (guides template + inline pages) in light and dark.
 * Writes PNGs to docs/audits/shots-space/.
 * Run: URL=http://localhost:3010 node scripts/shots-space.mjs
 */
import { chromium } from 'playwright';
import fs from 'fs';
import crypto from 'node:crypto';

const URL = process.env.URL || 'http://localhost:3010';
const OUT = 'docs/audits/shots-space';
fs.mkdirSync(OUT, { recursive: true });

const ALPHA = 'ACDEFGHJKMNPQRTUVWXYZ234679';
const freshCode = () => Array.from(crypto.randomBytes(8)).map(b => ALPHA[b % ALPHA.length]).join('');
const UNKNOWN = freshCode();

const browser = await chromium.launch();
const errors = [];
const watch = (p, tag) => {
  p.on('console', m => { if (m.type() === 'error') errors.push(`[${tag}] ${m.text().slice(0, 140)}`); });
  p.on('pageerror', e => errors.push(`[${tag} pageerror] ${e.message.slice(0, 140)}`));
};

const shot = async (page, name) => {
  await page.screenshot({ path: `${OUT}/${name}.png` });
  console.log('shot:', name);
};
const mk = async ({ viewport = { width: 1440, height: 900 }, colorScheme = 'light', locale } = {}) => {
  const ctx = await browser.newContext({ viewport, colorScheme, ...(locale ? { locale } : {}) });
  const page = await ctx.newPage();
  watch(page, `${colorScheme}`);
  return { ctx, page };
};

// ── creator journey (light desktop): create → share+QR → roster → recent → mobile → close ──
const A = await mk();
let spaceId = '';
let codeDash = '';
{
  const p = A.page;
  await p.goto(URL + '/space/create', { waitUntil: 'domcontentloaded' });
  await p.waitForSelector('[data-testid="space-code-input"]', { timeout: 20000 });
  await p.waitForTimeout(400);
  await shot(p, 'create-sheet-progressive-light');

  await p.locator('[data-testid="space-create-optional"]').evaluate(el => { el.open = true; });
  await p.waitForTimeout(350);
  await shot(p, 'create-sheet-optional-open');

  await p.locator('[data-testid="space-create-optional"]').evaluate(el => { el.open = false; });
  await p.locator('[data-testid="space-code-generate"]').click();
  await p.waitForFunction(() => /available/i.test(document.querySelector('[data-testid="space-code-status"]')?.textContent || ''), { timeout: 10000 }).catch(() => {});
  codeDash = await p.inputValue('[data-testid="space-code-input"]');
  await p.locator('[data-testid="space-create-cta"]').click();
  await p.waitForURL(/\/space\/[0-9a-f-]{36}#k=/, { timeout: 20000 });
  spaceId = p.url().match(/\/space\/([0-9a-f-]{36})/)[1];
  await p.waitForSelector('[data-testid="space-code-chip"]', { timeout: 20000 });

  // Share sheet: code first, QR open
  await p.locator('[data-testid="space-share-btn"]').click();
  await p.waitForSelector('[data-testid="space-share"]', { timeout: 10000 });
  await p.locator('[data-testid="space-share-qr"]').click();
  await p.waitForSelector('[data-testid="space-share"] svg[width="208"]', { timeout: 10000 }).catch(() => {});
  await p.waitForTimeout(350);
  await shot(p, 'share-sheet-code-qr');
  await p.keyboard.press('Escape');
  await p.waitForSelector('[data-testid="space-share"]', { state: 'hidden', timeout: 5000 }).catch(() => {});
}

// Second device joins → roster shot on the creator
const B = await mk();
{
  const p = B.page;
  await p.goto(URL + '/space/join', { waitUntil: 'domcontentloaded' });
  await p.waitForSelector('[data-testid="space-join-code-input"]', { timeout: 20000 });
  await p.type('[data-testid="space-join-code-input"]', codeDash.replace('-', ''));
  await p.waitForURL(new RegExp(spaceId), { timeout: 20000 });
}
{
  const p = A.page;
  await p.waitForSelector('[data-testid="space-devices"]', { timeout: 20000 });
  await p.waitForTimeout(350);
  await shot(p, 'space-roster-two-devices');
}

// Landing recent-space row (persistence) — taken before the space closes
{
  const p = A.page;
  await p.goto(URL + '/', { waitUntil: 'domcontentloaded' });
  await p.waitForSelector('[data-testid="space-entry"]', { timeout: 20000 });
  await p.waitForTimeout(700);
  await shot(p, 'landing-recent-space-row');
  await p.locator('[data-testid="space-entry"] button').first().click();
  await p.waitForURL(/\/space\/[0-9a-f-]{36}/, { timeout: 20000 });
  await p.waitForSelector('[data-testid="space-members"]', { timeout: 20000 });
}

// Mobile
{
  const p = A.page;
  await p.setViewportSize({ width: 390, height: 844 });
  await p.waitForTimeout(400);
  await shot(p, 'space-mobile-390x844');
  await p.setViewportSize({ width: 1440, height: 900 });
  await p.waitForTimeout(300);
}

// Invalid code, one-gesture recovery (fresh device)
{
  const { page: p } = await mk();
  await p.goto(URL + '/space/join', { waitUntil: 'domcontentloaded' });
  await p.waitForSelector('[data-testid="space-join-code-input"]', { timeout: 20000 });
  await p.type('[data-testid="space-join-code-input"]', UNKNOWN);
  await p.waitForSelector('text=/no space with that code/i', { timeout: 15000 });
  await p.waitForTimeout(300);
  await shot(p, 'join-invalid-code-no-oracle');
  await p.context().close();
}

// Close → closed screen (creator)
{
  const p = A.page;
  await p.getByRole('button', { name: /close now/i }).click();
  await p.waitForSelector('text=/close this space/i', { timeout: 8000 });
  await p.waitForTimeout(350);
  await shot(p, 'space-close-confirm');
  await p.getByRole('button', { name: /close space/i }).click();
  await p.waitForSelector('text=/this space is closed/i', { timeout: 15000 });
  await p.waitForTimeout(300);
  await shot(p, 'space-closed-screen');
}
await A.ctx.close();
await B.ctx.close();

// ── dark space view (fresh device, OS dark → theme system default) ──────
{
  const { ctx, page: p } = await mk({ colorScheme: 'dark' });
  await p.goto(URL + '/space/create', { waitUntil: 'domcontentloaded' });
  await p.waitForSelector('[data-testid="space-code-input"]', { timeout: 20000 });
  await p.locator('[data-testid="space-code-generate"]').click();
  await p.waitForFunction(() => /available/i.test(document.querySelector('[data-testid="space-code-status"]')?.textContent || ''), { timeout: 10000 }).catch(() => {});
  await p.locator('[data-testid="space-create-cta"]').click();
  await p.waitForURL(/\/space\/[0-9a-f-]{36}#k=/, { timeout: 20000 });
  await p.waitForSelector('[data-testid="space-code-chip"]', { timeout: 20000 });
  await p.waitForTimeout(400);
  await shot(p, 'space-dark');
  await ctx.close();
}

// ── RTL (Arabic) space view ─────────────────────────────────────────────
{
  const { ctx, page: p } = await mk({ locale: 'ar' });
  await p.goto(URL + '/space/create', { waitUntil: 'domcontentloaded' });
  await p.waitForSelector('[data-testid="space-code-input"]', { timeout: 20000 });
  await p.locator('[data-testid="space-code-generate"]').click();
  await p.waitForFunction(() => /available/i.test(document.querySelector('[data-testid="space-code-status"]')?.textContent || ''), { timeout: 10000 }).catch(() => {});
  await p.locator('[data-testid="space-create-cta"]').click();
  await p.waitForURL(/\/space\/[0-9a-f-]{36}#k=/, { timeout: 20000 });
  await p.waitForSelector('[data-testid="space-code-chip"]', { timeout: 20000 });
  await p.waitForTimeout(400);
  await shot(p, 'space-rtl-ar');
  await ctx.close();
}

// ── secondary routes: guides template + inline, light and dark ──────────
for (const [file, tag] of [['temporary-spaces.html', 'template'], ['security.html', 'inline']]) {
  for (const scheme of ['light', 'dark']) {
    const { ctx, page: p } = await mk({ colorScheme: scheme });
    await p.goto(`${URL}/guides/${file}`, { waitUntil: 'domcontentloaded' });
    await p.waitForSelector('h1', { timeout: 20000 });
    await p.waitForTimeout(500);
    await shot(p, `guide-${tag}-${scheme}`);
    await ctx.close();
  }
}

console.log(errors.length ? `console/page errors:\n${errors.join('\n')}` : 'console/page errors: none');
await browser.close();
