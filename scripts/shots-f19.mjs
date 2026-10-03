// F19 visual pass: proof shots for this round's surfaces — Docs (DataFlow,
// PlatformStrip, FaqSection, SiteFooter), the static About's rich footer,
// the home skeleton's device-pair block, the format keys' tooltip, the
// offline banner, and the landing demo in light/dark/mobile/landscape.
// Saves to docs/audits/shots-f19/ and asserts overflow + console cleanliness.
import fs from 'fs';
import { launchBrowser, sleep, tapTargetIssues, TAP_TARGET_MIN } from './lib.mjs';

const BASE = process.env.URL || 'http://localhost:3010';
const OUT = 'docs/audits/shots-f19';
fs.mkdirSync(OUT, { recursive: true });

const errors = [];
const watch = (page, tag) => {
  page.on('console', m => { if (m.type() === 'error') errors.push(`[${tag}] ${m.text().slice(0, 200)}`); });
  page.on('pageerror', e => errors.push(`[${tag} pageerror] ${e.message.slice(0, 200)}`));
};
const overflow = (page) => page.evaluate(() => {
  const de = document.documentElement;
  return [...document.querySelectorAll('*')]
    .filter(el => { const r = el.getBoundingClientRect(); return r.width > 0 && (r.right > de.clientWidth + 1 || r.left < -1); })
    .slice(0, 3)
    .map(el => (el.tagName + '.' + (el.className || '').toString().split(' ').slice(0, 3).join('.')).slice(0, 80));
});

const browser = await launchBrowser();
try {
  // ── Desktop 1440×900 ──────────────────────────────────────────────────
  const ctxD = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const D = await ctxD.newPage();
  watch(D, 'desktop');

  await D.goto(BASE, { waitUntil: 'domcontentloaded' });
  await D.locator('[data-testid="hero-demo"]').first().waitFor({ timeout: 20000 });
  await D.evaluate(() => document.querySelector('[data-testid="hero-demo"]').scrollIntoView({ block: 'center' }));
  await sleep(1400); // let the demo reach a mid-loop beat
  await D.screenshot({ path: `${OUT}/01-landing-demo-light.png` });

  // Theme cross-fade end state (dark)
  await D.evaluate(() => { document.querySelector('button[aria-label*="theme" i], button[aria-label*="mode" i]')?.click(); });
  await sleep(700);
  await D.screenshot({ path: `${OUT}/02-landing-demo-dark.png` });

  // Docs: overview with DataFlow + PlatformStrip
  await D.goto(`${BASE}/docs`, { waitUntil: 'domcontentloaded' });
  await D.getByRole('heading', { level: 1 }).waitFor({ timeout: 20000 });
  await D.evaluate(() => document.querySelector('[aria-labelledby="flow-title"]')?.scrollIntoView({ block: 'start' }));
  await sleep(400);
  await D.screenshot({ path: `${OUT}/03-docs-dataflow.png` });

  // Docs: FAQ
  await D.goto(`${BASE}/docs#faq`, { waitUntil: 'domcontentloaded' });
  await sleep(600);
  await D.screenshot({ path: `${OUT}/04-docs-faq.png` });

  // Static About: rich footer (dark carries over via theme.js)
  await D.goto(`${BASE}/about`, { waitUntil: 'domcontentloaded' });
  await sleep(500);
  await D.evaluate(() => document.querySelector('.footer-rich')?.scrollIntoView({ block: 'end' }));
  await sleep(300);
  await D.screenshot({ path: `${OUT}/05-about-footer.png` });
  const aboutTap = await D.evaluate(tapTargetIssues, { minTarget: TAP_TARGET_MIN });
  console.log('about tap targets ≥40px:', aboutTap.length === 0 ? 'ok' : JSON.stringify(aboutTap.slice(0, 3)));

  // Offline banner (dispatch the event the window listener hears)
  await D.goto(BASE, { waitUntil: 'domcontentloaded' });
  await sleep(600);
  await D.evaluate(() => window.dispatchEvent(new Event('offline')));
  await sleep(500);
  const bannerUp = await D.locator('[data-testid="offline-banner"]').count();
  console.log('offline banner rendered on event:', bannerUp > 0 ? 'ok' : 'MISSING');
  await D.screenshot({ path: `${OUT}/06-offline-banner.png` });
  await D.evaluate(() => window.dispatchEvent(new Event('online')));
  await sleep(500);
  const bannerGone = await D.locator('[data-testid="offline-banner"]').count();
  console.log('offline banner clears on reconnect:', bannerGone === 0 ? 'ok' : 'STILL VISIBLE');

  // ── Room: format keys + tooltip ───────────────────────────────────────
  // A room's composer exists only once a peer has joined, so create a room
  // and join it from a second page — the same entry verify-room-flow uses.
  await D.getByRole('button', { name: 'Send', exact: true }).click();
  await D.waitForFunction(() => !!localStorage.getItem('sharetext.session.v1'), null, { timeout: 20000 });
  const { roomId } = await D.evaluate(() => JSON.parse(localStorage.getItem('sharetext.session.v1')));
  const short = roomId.replace(/-/g, '').slice(0, 8);
  const ctxR = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const R = await ctxR.newPage();
  watch(R, 'joiner');
  await R.goto(`${BASE}/s/${short}`, { waitUntil: 'domcontentloaded' });
  await R.locator('[data-testid="composer"]').waitFor({ timeout: 20000 });
  await D.locator('[data-testid="composer"]').waitFor({ timeout: 20000 });
  await D.locator('[data-testid="composer"]').fill('Formatting **works** here');
  await sleep(300);
  await D.locator('[data-testid="format-bold"]').hover();
  await sleep(650); // past the 350ms tooltip delay
  const tip = await D.locator('[role="tooltip"]').count();
  console.log('format tooltip appears on hover:', tip > 0 ? 'ok' : 'MISSING');
  await D.screenshot({ path: `${OUT}/07-format-tooltip.png` });
  await ctxR.close();

  // ── Mobile 375×812 ────────────────────────────────────────────────────
  const ctxM = await browser.newContext({ viewport: { width: 375, height: 812 } });
  const M = await ctxM.newPage();
  watch(M, 'mobile');
  await M.goto(BASE, { waitUntil: 'domcontentloaded' });
  await M.locator('[data-testid="hero-demo"]').first().waitFor({ timeout: 20000 });
  await M.evaluate(() => document.querySelector('[data-testid="hero-demo"]').scrollIntoView({ block: 'center' }));
  await sleep(1200);
  await M.screenshot({ path: `${OUT}/08-mobile-demo-light.png` });
  await M.evaluate(() => {
    document.documentElement.classList.add('st-dark');
    document.documentElement.setAttribute('data-theme', 'dark');
    document.documentElement.style.colorScheme = 'dark';
  });
  await sleep(400);
  await M.screenshot({ path: `${OUT}/09-mobile-demo-dark.png` });
  const mOver = await overflow(M);
  console.log('mobile overflow:', mOver.length === 0 ? 'none' : JSON.stringify(mOver));

  // ── Landscape 740×360 ─────────────────────────────────────────────────
  const ctxL = await browser.newContext({ viewport: { width: 740, height: 360 } });
  const L = await ctxL.newPage();
  watch(L, 'landscape');
  await L.goto(BASE, { waitUntil: 'domcontentloaded' });
  await sleep(900);
  await L.screenshot({ path: `${OUT}/10-landscape-landing.png` });
  const lOver = await overflow(L);
  console.log('landscape overflow:', lOver.length === 0 ? 'none' : JSON.stringify(lOver));

  await ctxD.close(); await ctxM.close(); await ctxL.close();
} finally {
  await browser.close();
}

console.log('console/page errors:', errors.length === 0 ? 'none' : errors.slice(0, 5));
process.exit(errors.length === 0 ? 0 : 1);
