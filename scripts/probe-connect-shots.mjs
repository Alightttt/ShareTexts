// Quick visual check of the connect screen (RoomHub) at mobile + desktop.
import { chromium } from 'playwright';
import fs from 'fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const KNOWN = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe', '/usr/bin/google-chrome', '/usr/bin/chromium'];
const chrome = KNOWN.find((p) => { try { return fs.existsSync(p); } catch { return false; } });
const URL = process.env.URL || 'http://localhost:3000/';

const browser = await chromium.launch(chrome ? { headless: true, executablePath: chrome } : { headless: true });

for (const [w, h] of [[375, 812], [1440, 900]]) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, isMobile: w < 500, hasTouch: w < 500 });
  const page = await ctx.newPage();
  await page.goto(URL, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Send' }).first().click();
  await page.getByText('LIVE CODE').waitFor({ timeout: 10000 });
  await page.waitForTimeout(600);
  await page.screenshot({ path: path.join(root, `scripts/connect-${w}.png`), fullPage: false });
  // Check for overlap: header vs heading.
  const overlap = await page.evaluate(() => {
    const rect = (el) => el.getBoundingClientRect();
    const header = Array.from(document.querySelectorAll('header, [class*="top-4"], [class*="fixed"]'))
      .map((e) => rect(e)).find((r) => r.width > 60 && r.height > 20);
    const heading = Array.from(document.querySelectorAll('h1, h2'))
      .map((e) => rect(e)).find((r) => r.width > 100);
    if (!header || !heading) return 'unknown';
    const x = Math.max(0, Math.min(header.right, heading.right) - Math.max(header.left, heading.left));
    const y = Math.max(0, Math.min(header.bottom, heading.bottom) - Math.max(header.top, heading.top));
    return { overlaps: x > 10 && y > 10, header: { top: header.top, left: header.left }, heading: { top: heading.top, left: heading.left } };
  });
  console.log(`${w}px overlap:`, JSON.stringify(overlap));
  await ctx.close();
}
await browser.close();
