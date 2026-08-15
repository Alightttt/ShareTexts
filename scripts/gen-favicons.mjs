// Rasters public/favicon.svg at small sizes to transparent PNGs by rendering
// the SVG as a DOM element and screenshotting a clip (no canvas needed).
// Usage: node scripts/gen-favicons.mjs [baseUrl]
import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUB = path.join(__dirname, '..', 'public');
const base = process.argv[2] || 'http://localhost:3000';

function resolveChrome() {
  if (process.env.CHROME) return process.env.CHROME;
  const candidates = [
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  ];
  for (const p of candidates) if (fs.existsSync(p)) return p;
  return undefined;
}

const browser = await chromium.launch({ headless: true, executablePath: resolveChrome() });
const page = await browser.newPage();
await page.goto(base, { waitUntil: 'domcontentloaded' });
const res = await page.request.get(base + '/favicon.svg');
const svg = await res.text();
if (!svg.includes('<svg')) throw new Error('favicon.svg not found at ' + base);
await page.setContent(`<html><body style="margin:0">${svg}</body></html>`);

for (const size of [16, 32, 48]) {
  await page.evaluate((size) => {
    const svg = document.querySelector('svg');
    svg.style.width = size + 'px';
    svg.style.height = size + 'px';
  }, size);
  const buf = await page.screenshot({ clip: { x: 0, y: 0, width: size, height: size }, omitBackground: true });
  const file = path.join(PUB, `favicon-${size}.png`);
  fs.writeFileSync(file, buf);
  console.log('wrote', file, size + 'x' + size);
}
await browser.close();
