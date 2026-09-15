// Mobile + desktop landing and room shots for final visual verification.
import { chromium } from 'playwright';
const BASE = 'http://localhost:3010';
const OUT = 'docs/audits/shots-roomflow';
import { mkdirSync } from 'fs';
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
try {
  // ── Desktop landing (toggle, logo, tracker) ──
  const d = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const pd = await d.newPage();
  await pd.goto(BASE, { waitUntil: 'domcontentloaded' });
  await pd.waitForTimeout(2500);
  await pd.screenshot({ path: `${OUT}/landing-desktop.png` });

  // ── Mobile landing ──
  const m = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const pm = await m.newPage();
  await pm.goto(BASE, { waitUntil: 'domcontentloaded' });
  await pm.waitForTimeout(2500);
  await pm.screenshot({ path: `${OUT}/landing-mobile.png` });

  // ── Mobile room: create on desktop, join on mobile ──
  await pd.getByRole('button', { name: 'Send', exact: true }).click();
  await pd.waitForFunction(() => !!localStorage.getItem('sharetext.session.v1'), null, { timeout: 20000 });
  const { roomId } = await pd.evaluate(() => JSON.parse(localStorage.getItem('sharetext.session.v1')));
  await pm.goto(`${BASE}/s/${roomId.replace(/-/g, '').slice(0, 8)}`, { waitUntil: 'domcontentloaded' });
  await pd.waitForSelector('[data-testid="composer"]', { timeout: 25000 });
  await pm.waitForSelector('[data-testid="composer"]', { timeout: 25000 });
  await pm.waitForTimeout(3200);
  await pd.getByTestId('composer').fill('Mobile check');
  await pd.keyboard.press('Enter');
  await pm.waitForSelector('text=Mobile check', { timeout: 10000 });
  await pm.screenshot({ path: `${OUT}/room-mobile.png` });

  console.log('mobile+desktop shots done');
} finally {
  await browser.close();
}
