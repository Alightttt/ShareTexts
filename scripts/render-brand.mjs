// Render ShareText brand assets with the system Chromium (Playwright):
//   - public/og.png        1200×630 social preview (dark, minimal, brand mark)
//   - public/icon-192.png, icon-512.png, icon-maskable-*.png, apple-touch-icon.png
// Run: node scripts/render-brand.mjs
import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const KNOWN_PATHS = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
];
const chrome = KNOWN_PATHS.find((p) => { try { return fs.existsSync(p); } catch { return false; } });

/**
 * The ShareText mark: a rounded device screen with the transfer arrow
 * knocked straight through it (mask knockout, so the arrow shows whatever
 * background it sits on — light, dark, or accent). Must match
 * src/components/ShareTextLogo.tsx and public/favicon.svg.
 */
const MARK =
  `<defs><mask id="hole"><rect x="0" y="0" width="256" height="256" fill="white"/><rect x="84" y="112" width="64" height="32" fill="black"/><path d="M148 94l48 34-48 34z" fill="black"/></mask></defs>` +
  `<rect x="36" y="36" width="184" height="184" rx="44" fill="__FILL__" mask="url(#hole)"/>`;

const brandSvg = (size, fill) =>
  `<svg width="${size}" height="${size}" viewBox="0 0 256 256" fill="none" xmlns="http://www.w3.org/2000/svg">${MARK.replace('__FILL__', fill)}</svg>`;

// ---- OG image (1200×630) --------------------------------------------------
const ogHtml = `<!doctype html><html><head><meta charset="utf-8"><style>
  * { margin: 0; box-sizing: border-box; }
  html, body { width: 1200px; height: 630px; overflow: hidden; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    background: linear-gradient(180deg, #0B1220 0%, #060A13 100%);
    color: #FAFAFA;
    -webkit-font-smoothing: antialiased;
    position: relative;
  }
  .glow { position: absolute; inset: 0; background: radial-gradient(58% 44% at 50% 0%, rgba(46,139,255,0.13), transparent 70%); }
  .wrap { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; padding: 74px 96px 0; }
  .brand { display: flex; align-items: center; gap: 16px; }
  .wordmark { font-size: 34px; font-weight: 600; letter-spacing: -0.02em; color: #F5F5F5; }
  h1 { margin-top: 46px; text-align: center; font-size: 64px; font-weight: 600; line-height: 1.06; letter-spacing: -0.035em; color: #FAFAFA; }
  .sub { margin-top: 28px; font-size: 26px; letter-spacing: -0.01em; color: rgba(250,250,250,0.58); }
  .foot { position: absolute; left: 96px; right: 96px; bottom: 58px; display: flex; align-items: center; justify-content: space-between; }
  .url { font-family: ui-monospace, "SF Mono", "Cascadia Mono", Consolas, monospace; font-size: 17px; letter-spacing: 0.02em; color: rgba(255,255,255,0.38); }
  .beam { display: flex; align-items: center; gap: 10px; }
  .beam .line { width: 56px; height: 1px; background: rgba(255,255,255,0.16); }
  .beam .dot { width: 7px; height: 7px; border-radius: 50%; background: #2E8BFF; box-shadow: 0 0 14px rgba(46,139,255,0.8); }
</style></head><body>
  <div class="glow"></div>
  <div class="wrap">
    <div class="brand">${brandSvg(48, '#F5F5F5')}<span class="wordmark">ShareText</span></div>
    <h1>Move something<br/>between your devices.</h1>
    <p class="sub">Text, photos and files. No app. No account.</p>
  </div>
  <div class="foot">
    <span class="url">share-texts.vercel.app</span>
    <span class="beam"><span class="line"></span><span class="dot"></span><span class="line"></span></span>
  </div>
</body></html>`;

// ---- PWA icons -------------------------------------------------------------
const blueSvg = (size) => brandSvg(size, '#0a66f0');
const ICON_BG = '#0A0F1A';
const iconHtml = (size, markSize) =>
  `<!doctype html><html><head><meta charset="utf-8"><style>*{margin:0}</style></head><body>
     <div style="width:${size}px;height:${size}px;background:${ICON_BG};display:flex;align-items:center;justify-content:center">${blueSvg(markSize)}</div>
   </body></html>`;
const maskableHtml = (size, markSize) =>
  `<!doctype html><html><head><meta charset="utf-8"><style>*{margin:0}</style></head><body>
     <div style="width:${size}px;height:${size}px;background:${ICON_BG};display:flex;align-items:center;justify-content:center;border-radius:${Math.round(size * 0.22)}px">${blueSvg(markSize)}</div>
   </body></html>`;

async function shot(browser, html, size, out) {
  const page = await browser.newPage({ viewport: { width: size[0], height: size[1] }, deviceScaleFactor: 1 });
  await page.setContent(html);
  await page.screenshot({ path: path.join(root, out), type: 'png' });
  await page.close();
  console.log(`wrote ${out} (${size[0]}×${size[1]})`);
}

const browser = await chromium.launch(chrome ? { headless: true, executablePath: chrome } : { headless: true });
try {
  await shot(browser, ogHtml, [1200, 630], 'public/og.png');
  // The new mark is denser (fills ~72% of its viewBox), so scale it a touch
  // smaller than the old page-mark to keep optical weight.
  await shot(browser, iconHtml(192, 116), [192, 192], 'public/icon-192.png');
  await shot(browser, iconHtml(512, 300), [512, 512], 'public/icon-512.png');
  await shot(browser, maskableHtml(192, 106), [192, 192], 'public/icon-maskable-192.png');
  await shot(browser, maskableHtml(512, 280), [512, 512], 'public/icon-maskable-512.png');
  await shot(browser, iconHtml(180, 112), [180, 180], 'public/apple-touch-icon.png');
} finally {
  await browser.close();
}
console.log('done');
