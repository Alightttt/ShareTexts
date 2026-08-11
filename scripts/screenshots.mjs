// Capture screenshots of the redesigned landing (hero demo) at several sizes.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { launchBrowser, URL, sleep } from './lib.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, '..', 'shots');

fs.mkdirSync(OUT, { recursive: true });
const browser = await launchBrowser();

const viewports = [
  ['hero-desktop', 1280, 900],
  ['hero-wide', 1512, 982],
  ['hero-tablet', 768, 1024],
  ['hero-mobile', 390, 844],
];

for (const [name, w, h] of viewports) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h } });
  const page = await ctx.newPage();
  await page.goto(URL, { waitUntil: 'networkidle' });
  await sleep(1500); // let the demo choreography start
  await page.screenshot({ path: path.join(OUT, `${name}.png`) });
  console.log(`${name}.png`);
  await ctx.close();
}

await browser.close();
