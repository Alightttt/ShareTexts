// Screenshots of the connected room: composer (light+dark), attachment menu open, exit icon.
import { chromium } from 'playwright';
const BASE = 'http://localhost:3010';
const OUT = 'docs/audits/shots-roomflow';
import { mkdirSync } from 'fs';
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
try {
  const ctxA = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const ctxB = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const pa = await ctxA.newPage();
  const pb = await ctxB.newPage();

  await pa.goto(BASE, { waitUntil: 'domcontentloaded' });
  await pa.getByRole('button', { name: 'Send', exact: true }).click();
  await pa.waitForFunction(() => !!localStorage.getItem('sharetext.session.v1'), null, { timeout: 20000 });
  const { roomId } = await pa.evaluate(() => JSON.parse(localStorage.getItem('sharetext.session.v1')));
  const short = roomId.replace(/-/g, '').slice(0, 8);

  await pb.goto(`${BASE}/s/${short}`, { waitUntil: 'domcontentloaded' });
  await pa.waitForSelector('[data-testid="composer"]', { timeout: 25000 });
  await pb.waitForSelector('[data-testid="composer"]', { timeout: 25000 });
  await pb.waitForTimeout(3200); // entry toast clears

  // Seed a message + a text bubble on both sides
  await pa.getByTestId('composer').fill('Hey, sending the design files now');
  await pa.keyboard.press('Enter');
  await pb.waitForSelector('text=Hey, sending the design files now', { timeout: 10000 });

  // Light-mode composer shot (creator desktop)
  await pa.screenshot({ path: `${OUT}/composer-light.png` });

  // Attachment menu open
  await pa.getByTestId('add-attachment').click();
  await pa.waitForTimeout(500);
  await pa.screenshot({ path: `${OUT}/attach-menu-light.png` });
  await pa.keyboard.press('Escape');
  await pa.waitForTimeout(300);

  // Dark mode (toggle in header)
  await pa.locator('[role="switch"]').click();
  await pa.waitForTimeout(600);
  await pa.screenshot({ path: `${OUT}/composer-dark.png` });
  await pa.getByTestId('add-attachment').click();
  await pa.waitForTimeout(500);
  await pa.screenshot({ path: `${OUT}/attach-menu-dark.png` });

  // Joiner side (received bubble) dark
  await pb.locator('[role="switch"]').click();
  await pb.waitForTimeout(600);
  await pb.screenshot({ path: `${OUT}/room-receiver-dark.png` });

  console.log('shots done');
} finally {
  await browser.close();
}
