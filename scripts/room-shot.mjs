// Desktop room inspection: pair two peers on the dev server, capture the room
// at 1440px in light + dark, plus the footer region, for the declutter pass.
import { chromium } from 'playwright';
import { mkdirSync } from 'fs';

const BASE = 'http://localhost:3010';
const OUT = 'docs/audits/shots-room-declutter';
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const ctxA = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const ctxB = await browser.newContext({ viewport: { width: 1440, height: 900 } });
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
await pb.waitForTimeout(3200);

// Seed realistic traffic: a text and a file.
await pa.getByTestId('composer').fill('Deck attached — review before the 3pm?');
await pa.keyboard.press('Enter');
await pb.waitForSelector('text=Deck attached', { timeout: 10000 });
await pa.locator('input[type=file]').first().setInputFiles({
  name: 'q3-brand-deck.pdf', mimeType: 'application/pdf', buffer: Buffer.alloc(2 * 1024 * 1024, 9),
});
await pa.waitForTimeout(600);
await pa.getByTestId('composer').press('Enter');
await pb.waitForSelector('text=q3-brand-deck.pdf', { timeout: 20000 });
await pb.waitForTimeout(1500);

await pa.screenshot({ path: `${OUT}/room-A-light-1440.png` });
// Footer region of A (the stats/cards area).
await pa.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
await pa.waitForTimeout(400);
await pa.screenshot({ path: `${OUT}/room-A-light-1440-footer.png` });

// Dark mode.
await pa.emulateMedia({ colorScheme: 'dark' });
await pa.evaluate(() => { document.documentElement.classList.add('dark'); localStorage.setItem('sharetext.theme', 'dark'); });
await pa.evaluate(() => window.scrollTo(0, 0));
await pa.waitForTimeout(300);
await pa.screenshot({ path: `${OUT}/room-A-dark-1440.png` });

await browser.close();
console.log('shots written to', OUT);
