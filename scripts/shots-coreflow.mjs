/**
 * Core-flow evidence shots (this phase): the surfaces the audit changed,
 * across the environments the brief demands — light, dark, mobile, RTL,
 * reduced motion, and the short-desktop window where nearby discovery used
 * to be hidden outright. Writes PNGs to docs/audits/shots-coreflow/.
 * Run: URL=http://localhost:3010 node scripts/shots-coreflow.mjs
 */
import { chromium } from 'playwright';
import fs from 'fs';

const URL = process.env.URL || 'http://localhost:3010';
const OUT = 'docs/audits/shots-coreflow';
fs.mkdirSync(OUT, { recursive: true });

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

// 1. Light landing, canonical desktop
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: 'light' });
  const p = await ctx.newPage(); watch(p, 'light');
  await p.goto(URL, { waitUntil: 'domcontentloaded' });
  await p.locator('[data-testid="hero-demo"]').first().waitFor({ timeout: 20000 });
  await p.waitForTimeout(1600);
  await shot(p, 'landing-light-1440x900');
  await ctx.close();
}

// 2. Dark landing — OS-driven theme
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: 'dark' });
  const p = await ctx.newPage(); watch(p, 'dark');
  await p.goto(URL, { waitUntil: 'domcontentloaded' });
  await p.locator('[data-testid="hero-demo"]').first().waitFor({ timeout: 20000 });
  await p.waitForTimeout(1600);
  await shot(p, 'landing-dark-1440x900');
  await ctx.close();
}

// 3. Short desktop (1152x700) — nearby discovery in the INITIAL view
//    (order swap at max-height:767) plus its scrolled-to bottom state.
{
  const ctx = await browser.newContext({ viewport: { width: 1152, height: 700 }, colorScheme: 'light' });
  const p = await ctx.newPage(); watch(p, 'short');
  await p.goto(URL, { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(1800);
  await shot(p, 'landing-short-1152x700-nearby-initial');
  await p.evaluate(() => {
    const m = document.querySelector('main');
    m.style.scrollBehavior = 'auto';
    m.scrollTop = m.scrollHeight;
  });
  await p.waitForTimeout(400);
  await shot(p, 'landing-short-1152x700-scrolled-bottom');
  await ctx.close();
}

// 4. Mobile landing (phone layout)
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, colorScheme: 'light', isMobile: true, hasTouch: true });
  const p = await ctx.newPage(); watch(p, 'mobile');
  await p.goto(URL, { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(2000);
  await shot(p, 'landing-mobile-390x844');
  await ctx.close();
}

// 5. RTL (Arabic) landing — dir=rtl proof
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: 'light' });
  await ctx.addInitScript(() => { try { localStorage.setItem('sharetext.locale', 'ar'); } catch { /* ignore */ } });
  const p = await ctx.newPage(); watch(p, 'rtl');
  await p.goto(URL, { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(1800);
  await shot(p, 'landing-rtl-ar-1440x900');
  await ctx.close();
}

// 6. Reduced motion — the demo opens on its captioned still, no autoplay
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: 'light', reducedMotion: 'reduce' });
  const p = await ctx.newPage(); watch(p, 'reduced');
  await p.goto(URL, { waitUntil: 'domcontentloaded' });
  await p.locator('[data-testid="hero-demo"]').first().waitFor({ timeout: 20000 });
  await p.waitForTimeout(1600);
  await shot(p, 'landing-reduced-motion-still');
  await ctx.close();
}

// 7. Connected room, light and dark — one real pair, both themes
for (const scheme of ['light', 'dark']) {
  const ctxA = await browser.newContext({ viewport: { width: 1280, height: 850 }, colorScheme: scheme });
  const ctxB = await browser.newContext({ viewport: { width: 900, height: 900 }, colorScheme: scheme });
  const A = await ctxA.newPage(); watch(A, `room-${scheme}-A`);
  const B = await ctxB.newPage(); watch(B, `room-${scheme}-B`);
  await A.goto(URL, { waitUntil: 'domcontentloaded' });
  await A.getByTestId('home-send').click();
  await A.getByTestId('pairing-code').waitFor({ timeout: 15000 });
  const digits = await A.getByTestId('pairing-code').locator('span').filter({ hasText: /^\d$/ }).allTextContents();
  const code = digits.slice(-6).join('');
  await B.goto(URL, { waitUntil: 'domcontentloaded' });
  await B.getByTestId('home-receive').click();
  await B.waitForTimeout(400);
  await B.locator('input[inputmode="numeric"]').first().fill(code);
  await B.getByTestId('composer').first().waitFor({ timeout: 25000 }).catch(() => {});
  await A.getByTestId('composer').first().waitFor({ timeout: 25000 }).catch(() => {});
  await A.waitForTimeout(1200);
  await shot(A, `room-${scheme}-1280x850`);
  await ctxA.close(); await ctxB.close();
}

console.log('page errors:', errors.length ? errors.join(' | ') : '(none)');
await browser.close();
process.exit(errors.length === 0 ? 0 : 1);
