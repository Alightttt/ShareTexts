// Renders PWA icons (192/512 any + maskable, apple-touch-icon) from the
// ShareText logo SVG using headless Chromium + canvas.
import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'public');
const CHROME = 'C:/Users/DELL-PC/AppData/Local/ms-playwright/chromium-1208/chrome-win64/chrome.exe';

const logo = `<svg width="256" height="256" viewBox="0 0 256 256" fill="none" xmlns="http://www.w3.org/2000/svg">
  <rect x="40" y="40" width="136" height="176" rx="24" stroke="#1D1D1F" stroke-width="20" stroke-linejoin="round"/>
  <rect x="100" y="80" width="116" height="156" rx="24" fill="#6b84f0"/>
  <path d="M136 158H176L156 138M176 158L156 178" stroke="white" stroke-width="16" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;

// Maskable: solid background filling the whole icon, logo scaled into the
// central 80% safe zone.
const maskableLogo = `<svg width="512" height="512" viewBox="0 0 512 512" fill="none" xmlns="http://www.w3.org/2000/svg">
  <rect width="512" height="512" fill="#FFFFFF"/>
  <g transform="translate(512,512) scale(1.5) translate(-256,-256)">
    <rect x="40" y="40" width="136" height="176" rx="24" stroke="#1D1D1F" stroke-width="20" stroke-linejoin="round"/>
    <rect x="100" y="80" width="116" height="156" rx="24" fill="#6b84f0"/>
    <path d="M136 158H176L156 138M176 158L156 178" stroke="white" stroke-width="16" stroke-linecap="round" stroke-linejoin="round"/>
  </g>
</svg>`;

async function renderToPng(browser, svg, size) {
  const page = await browser.newPage({ viewport: { width: size, height: size } });
  const svgData = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  const dataUrl = await page.evaluate(async ({ svgData, size }) => {
    const img = new Image();
    img.src = svgData;
    await img.decode();
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, size, size);
    ctx.drawImage(img, 0, 0, size, size);
    return canvas.toDataURL('image/png');
  }, { svgData, size });
  await page.close();
  return Buffer.from(dataUrl.split(',')[1], 'base64');
}

const targets = [
  ['icon-192.png', logo, 192],
  ['icon-512.png', logo, 512],
  ['icon-maskable-192.png', maskableLogo, 192],
  ['icon-maskable-512.png', maskableLogo, 512],
  ['apple-touch-icon.png', logo, 180],
];

const browser = await chromium.launch({ headless: true, executablePath: CHROME });
for (const [name, svg, size] of targets) {
  const png = await renderToPng(browser, svg, size);
  fs.writeFileSync(path.join(OUT, name), png);
  console.log(`wrote public/${name} (${size}x${size}, ${png.length} bytes)`);
}
await browser.close();
