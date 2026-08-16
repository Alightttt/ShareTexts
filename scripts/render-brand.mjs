// Render ShareText brand assets with the system Chromium (Playwright):
//   - public/og.png                1200×630 social preview (dark, minimal, brand mark)
//   - public/social-avatar.png     1024×1024 mark + wordmark (social profiles)
//   - public/icon-192.png, icon-512.png, icon-maskable-*.png, apple-touch-icon.png
//   - public/favicon-16/32/48.png  raster favicons
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
 * The ShareText mark: two device screens on the diagonal joined by a
 * connection beam — the whole transfer story in one silhouette. One color
 * throughout so it reads on any background and holds shape down to 16px.
 * Must match src/components/ShareTextLogo.tsx and public/favicon.svg.
 */
const MARK_SHAPES = (fill) => `
  <rect x="40" y="36" width="84" height="84" rx="24" fill="${fill}"/>
  <rect x="132" y="136" width="84" height="84" rx="24" fill="${fill}"/>
  <path d="M110 106 L146 142" stroke="${fill}" stroke-width="28" stroke-linecap="round"/>`;

const brandSvg = (size, fill) =>
  `<svg width="${size}" height="${size}" viewBox="0 0 256 256" fill="none" xmlns="http://www.w3.org/2000/svg">${MARK_SHAPES(fill)}</svg>`;

// ---- OG image (1200×630) --------------------------------------------------
// Converting card: the product story (two devices, a beam, a delivered check)
// + the promise that answers the first objection. After Snapdrop got bought
// and paywalled, "no app / no account / nothing stored" is the trust wedge.
const ogMark = (size) => `
  <svg width="${size}" height="${size}" viewBox="0 0 256 256" fill="none" xmlns="http://www.w3.org/2000/svg">
    ${MARK_SHAPES('#4D9DFF')}
    <circle cx="140" cy="136" r="7" fill="#A7C8FF"/>
    <path d="M153 177 l12 12 l24 -26" stroke="#34D399" stroke-width="15" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
  </svg>`;

const ogHtml = `<!doctype html><html><head><meta charset="utf-8"><style>
  * { margin: 0; box-sizing: border-box; }
  html, body { width: 1200px; height: 630px; overflow: hidden; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    background: linear-gradient(180deg, #0E1728 0%, #070B14 100%);
    color: #FAFAFA;
    -webkit-font-smoothing: antialiased;
    position: relative;
    display: flex; align-items: center; justify-content: center;
  }
  /* texture: faint dot grid */
  .dots { position: absolute; inset: 0;
    background-image: radial-gradient(rgba(255,255,255,0.05) 1px, transparent 1px);
    background-size: 34px 34px;
    mask-image: radial-gradient(70% 62% at 50% 40%, black 20%, transparent 78%);
    -webkit-mask-image: radial-gradient(70% 62% at 50% 40%, black 20%, transparent 78%);
  }
  .glow { position: absolute; inset: 0; background: radial-gradient(56% 46% at 50% 12%, rgba(46,139,255,0.22), transparent 70%); }
  .glow2 { position: absolute; inset: 0; background: radial-gradient(44% 38% at 82% 96%, rgba(52,211,153,0.10), transparent 70%); }
  .halo { position: absolute; width: 720px; height: 720px; left: 50%; top: 44%; transform: translate(-50%,-50%);
          background: radial-gradient(circle, rgba(46,139,255,0.12) 0%, transparent 60%); }
  .wrap { position: relative; display: flex; flex-direction: column; align-items: center; }
  .mark { filter: drop-shadow(0 20px 50px rgba(46,139,255,0.38)); }
  .headline { margin-top: 34px; font-size: 44px; font-weight: 700; letter-spacing: -0.03em; color: #FFFFFF; }
  .headline em { font-style: normal; color: #6FB4FF; }
  .sub { margin-top: 14px; font-size: 21px; font-weight: 500; letter-spacing: -0.005em; color: rgba(250,250,250,0.62); }
  .foot { position: absolute; left: 96px; right: 96px; bottom: 46px; display: flex; align-items: center; justify-content: space-between; }
  .url { font-family: ui-monospace, "SF Mono", "Cascadia Mono", Consolas, monospace; font-size: 15px; letter-spacing: 0.02em; color: rgba(255,255,255,0.4); }
  .lock { display: flex; align-items: center; gap: 8px; font-size: 15px; letter-spacing: 0.01em; color: rgba(255,255,255,0.55); }
  .lock svg { width: 14px; height: 14px; }
</style></head><body>
  <div class="dots"></div>
  <div class="glow"></div>
  <div class="glow2"></div>
  <div class="halo"></div>
  <div class="wrap">
    <div class="mark">${ogMark(216)}</div>
    <div class="headline">Share anything between <em>two devices</em>.</div>
    <p class="sub">No app to install · No account · Nothing is stored</p>
  </div>
  <div class="foot">
    <span class="url">share-texts.vercel.app</span>
    <span class="lock">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>
      End-to-end encrypted in your browser
    </span>
  </div>
</body></html>`;

// ---- Social avatar (1024×1024, mark + wordmark on brand background) -------
const avatarHtml = `<!doctype html><html><head><meta charset="utf-8"><style>
  * { margin: 0; box-sizing: border-box; }
  html, body { width: 1024px; height: 1024px; overflow: hidden; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    background: radial-gradient(120% 90% at 50% 0%, #101C33 0%, #0B1220 55%, #060A13 100%);
    color: #FAFAFA;
    -webkit-font-smoothing: antialiased;
    display: flex; align-items: center; justify-content: center;
  }
  .inner { display: flex; flex-direction: column; align-items: center; gap: 34px; }
  .wordmark { font-size: 74px; font-weight: 600; letter-spacing: -0.03em; color: #F5F5F5; }
  .url { font-family: ui-monospace, "SF Mono", Consolas, monospace; font-size: 22px; letter-spacing: 0.02em; color: rgba(255,255,255,0.4); }
</style></head><body>
  <div class="inner">
    ${brandSvg(320, '#4D9DFF')}
    <div class="wordmark">ShareText</div>
    <div class="url">share-texts.vercel.app</div>
  </div>
</body></html>`;

// ---- PWA icons -------------------------------------------------------------
const blueSvg = (size) => brandSvg(size, '#4D9DFF');
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
  await shot(browser, avatarHtml, [1024, 1024], 'public/social-avatar.png');
  // The mark spans ~70% of its viewBox — keep it inside the maskable safe
  // zone (80% centre) at these scales.
  await shot(browser, iconHtml(192, 128), [192, 192], 'public/icon-192.png');
  await shot(browser, iconHtml(512, 340), [512, 512], 'public/icon-512.png');
  await shot(browser, maskableHtml(192, 116), [192, 192], 'public/icon-maskable-192.png');
  await shot(browser, maskableHtml(512, 310), [512, 512], 'public/icon-maskable-512.png');
  await shot(browser, iconHtml(180, 120), [180, 180], 'public/apple-touch-icon.png');
  // Raster favicons at exact target sizes (zero-margin page so the mark is
  // flush, exactly 16/32/48px of painted mark).
  const plain = (size, fill) => `<!doctype html><html><head><meta charset="utf-8"><style>*{margin:0}</style></head><body>${brandSvg(size, fill)}</body></html>`;
  await shot(browser, plain(16, '#0a66f0'), [16, 16], 'public/favicon-16.png');
  await shot(browser, plain(32, '#0a66f0'), [32, 32], 'public/favicon-32.png');
  await shot(browser, plain(48, '#0a66f0'), [48, 48], 'public/favicon-48.png');
} finally {
  await browser.close();
}
console.log('done');
