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
// The product scene: a phone sends, a laptop receives, a glowing packet
// mid-flight between them, a delivered check on the laptop screen. The
// headline names the job; the sub answers the first objection.
const ogPhone = `
<svg width="200" height="380" viewBox="0 0 200 380" fill="none" xmlns="http://www.w3.org/2000/svg">
  <rect x="18" y="6" width="164" height="368" rx="46" fill="#101A2E" stroke="rgba(255,255,255,0.18)" stroke-width="3"/>
  <rect x="28" y="18" width="144" height="344" rx="34" fill="#0B1222"/>
  <rect x="82" y="30" width="36" height="7" rx="3.5" fill="rgba(255,255,255,0.16)"/>
  <rect x="60" y="66" width="88" height="56" rx="18" fill="#1E3A66"/>
  <rect x="74" y="84" width="54" height="8" rx="4" fill="#7FB8FF"/>
  <rect x="74" y="100" width="38" height="8" rx="4" fill="rgba(255,255,255,0.38)"/>
  <rect x="28" y="146" width="100" height="60" rx="18" fill="#16233F"/>
  <rect x="42" y="162" width="62" height="8" rx="4" fill="rgba(255,255,255,0.5)"/>
  <rect x="42" y="178" width="46" height="8" rx="4" fill="rgba(255,255,255,0.32)"/>
  <path d="M58 196 l9 9 l20 -21" stroke="#34D399" stroke-width="6" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
  <rect x="72" y="336" width="56" height="6" rx="3" fill="rgba(255,255,255,0.24)"/>
</svg>`;

const ogLaptop = `
<svg width="360" height="244" viewBox="0 0 360 244" fill="none" xmlns="http://www.w3.org/2000/svg">
  <rect x="10" y="4" width="340" height="200" rx="16" fill="#0D1526" stroke="rgba(255,255,255,0.18)" stroke-width="3"/>
  <rect x="22" y="14" width="316" height="180" rx="8" fill="#0A101E"/>
  <rect x="34" y="38" width="150" height="70" rx="18" fill="#1B2B47"/>
  <rect x="50" y="56" width="100" height="8" rx="4" fill="rgba(255,255,255,0.55)"/>
  <rect x="50" y="74" width="72" height="8" rx="4" fill="rgba(255,255,255,0.36)"/>
  <path d="M62 98 l9 9 l20 -21" stroke="#34D399" stroke-width="6" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
  <path d="M30 204 h300 l-26 26 h-248 z" fill="#0D1526" stroke="rgba(255,255,255,0.14)" stroke-width="3" stroke-linejoin="round"/>
  <rect x="138" y="220" width="84" height="6" rx="3" fill="rgba(255,255,255,0.2)"/>
</svg>`;

const ogBeam = `
<svg width="150" height="70" viewBox="0 0 150 70" fill="none" xmlns="http://www.w3.org/2000/svg">
  <path d="M0 20 Q 75 8 150 34" stroke="rgba(77,157,255,0.28)" stroke-width="14" stroke-linecap="round"/>
  <path d="M0 20 Q 75 8 150 34" stroke="#4D9DFF" stroke-width="5" stroke-linecap="round"/>
  <circle cx="72" cy="17" r="9" fill="#A7C8FF"/>
  <circle cx="72" cy="17" r="16" stroke="rgba(167,200,255,0.35)" stroke-width="3" fill="none"/>
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
  .headline { position: absolute; top: 72px; left: 0; right: 0; text-align: center;
    font-size: 46px; font-weight: 700; letter-spacing: -0.03em; color: #FFFFFF; }
  .headline em { font-style: normal; color: #6FB4FF; }
  .sub { position: absolute; top: 540px; left: 0; right: 0; text-align: center;
    font-size: 21px; font-weight: 500; letter-spacing: -0.005em; color: rgba(250,250,250,0.62); }
  .scene { position: absolute; top: 150px; left: 50%; transform: translateX(-50%);
    width: 1020px; height: 380px; }
  .scene .phone { position: absolute; left: 330px; top: 0; filter: drop-shadow(0 24px 60px rgba(46,139,255,0.22)); }
  .scene .beam { position: absolute; left: 530px; top: 96px; filter: drop-shadow(0 0 18px rgba(77,157,255,0.45)); }
  .scene .laptop { position: absolute; left: 660px; top: 60px; filter: drop-shadow(0 24px 60px rgba(46,139,255,0.22)); }
  .foot { position: absolute; left: 96px; right: 96px; bottom: 44px; display: flex; align-items: center; justify-content: space-between; }
  .url { font-family: ui-monospace, "SF Mono", "Cascadia Mono", Consolas, monospace; font-size: 15px; letter-spacing: 0.02em; color: rgba(255,255,255,0.4); }
  .lock { display: flex; align-items: center; gap: 8px; font-size: 15px; letter-spacing: 0.01em; color: rgba(255,255,255,0.55); }
  .lock svg { width: 14px; height: 14px; }
</style></head><body>
  <div class="dots"></div>
  <div class="glow"></div>
  <div class="glow2"></div>
  <div class="headline">Share anything between <em>two devices</em>.</div>
  <div class="scene">
    <div class="phone">${ogPhone}</div>
    <div class="beam">${ogBeam}</div>
    <div class="laptop">${ogLaptop}</div>
  </div>
  <p class="sub">No app to install · No account · Nothing stored</p>
  <div class="foot">
    <span class="url">sharetexts.online</span>
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
    <div class="url">sharetexts.online</div>
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
  // Fallback copies for the social card. The LIVE hero-scene card (og-3.png)
  // is generated by scripts/render-og-live.mjs — run that after changing the
  // hero; og.png / og-2.png are the hand-composed fallbacks.
  fs.copyFileSync(path.join(root, 'public/og.png'), path.join(root, 'public/og-2.png'));
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
