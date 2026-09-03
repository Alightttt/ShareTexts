// One-shot deterministic brand asset generator. Renders the warm-brand OG
// card (1200x630) and the PWA/favicon icon set from the current tokens in
// src/index.css using headless Chromium. No image generators.
// Run: node scripts/gen-brand-assets.mjs
import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pub = path.join(root, 'public');

const CANVAS = '#f6f0e6';   // --color-apple-canvas
const INK = '#241d14';      // --color-apple-ink
const MUTED = '#6f665a';    // --color-apple-ink-muted
const VIOLET = '#8b7cf6';   // --color-azure-600
const VIOLET_DK = '#7765e6';
const PLUM = '#1b1430';     // --color-apple-tile-1 (dark canvas)
const LILAC = '#c4adf9';    // --color-azure-400 (dark accent)

// The ShareText glyph: two rounded tiles joined by a diagonal beam.
function glyphSVG(size, color, scale = 1) {
  const s = scale;
  return `<svg width="${size}" height="${size}" viewBox="0 0 256 256" fill="none" xmlns="http://www.w3.org/2000/svg">
  <rect x="${40 * s + (256 - 256 * s) / 2}" y="${36 * s + (256 - 256 * s) / 2}" width="${84 * s}" height="${84 * s}" rx="${24 * s}" fill="${color}"/>
  <rect x="${132 * s + (256 - 256 * s) / 2}" y="${136 * s + (256 - 256 * s) / 2}" width="${84 * s}" height="${84 * s}" rx="${24 * s}" fill="${color}"/>
  <path d="M${110 * s + (256 - 256 * s) / 2} ${106 * s + (256 - 256 * s) / 2} L${146 * s + (256 - 256 * s) / 2} ${142 * s + (256 - 256 * s) / 2}" stroke="${color}" stroke-width="28" stroke-linecap="round"/>
</svg>`;
}

const ogHtml = `<!doctype html><html><head><meta charset="utf-8"><style>
  * { margin: 0; box-sizing: border-box; }
  body { width: 1200px; height: 630px; overflow: hidden; background: ${CANVAS};
         font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
         position: relative; }
  .dots { position: absolute; inset: 0;
    background-image: radial-gradient(rgba(139,124,246,0.10) 1px, transparent 1px);
    background-size: 26px 26px; }
  .glow-a { position: absolute; top: -140px; left: -120px; width: 480px; height: 480px; border-radius: 9999px;
    background: rgba(139,124,246,0.16); filter: blur(90px); }
  .glow-b { position: absolute; top: 320px; right: -140px; width: 460px; height: 460px; border-radius: 9999px;
    background: rgba(250,162,118,0.20); filter: blur(100px); }
  .content { position: relative; padding: 74px 84px; display: flex; flex-direction: column; justify-content: center; height: 100%; }
  .brand { display: flex; align-items: center; gap: 14px; margin-bottom: 30px; }
  .brand svg { display: block; }
  .brand-name { font-size: 34px; font-weight: 800; letter-spacing: -0.02em; color: ${INK}; }
  h1 { font-size: 66px; font-weight: 800; line-height: 1.04; letter-spacing: -0.035em; color: ${INK}; }
  .tag { margin-top: 22px; font-size: 24px; font-weight: 500; line-height: 1.35; color: ${MUTED}; max-width: 720px; }
  .url { margin-top: 34px; display: inline-flex; align-items: center; gap: 10px; padding: 12px 22px; border-radius: 999px;
    background: ${VIOLET}; color: #fff; font-size: 20px; font-weight: 700; letter-spacing: -0.01em; }
  .art { position: absolute; right: 96px; top: 50%; transform: translateY(-50%); width: 300px; opacity: 0.92; }
</style></head><body>
  <div class="dots"></div><div class="glow-a"></div><div class="glow-b"></div>
  <div class="content">
    <div class="brand">${glyphSVG(52, VIOLET)}<span class="brand-name">ShareText</span></div>
    <h1>Move anything<br/>between two devices.</h1>
    <p class="tag">Phone to laptop, or laptop to phone.<br/>No app to install, no account to make. Gone when you close the tab.</p>
    <span class="url">sharetexts.online</span>
  </div>
  <div class="art">
    <svg viewBox="0 0 220 220" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="18" y="18" width="82" height="82" rx="24" fill="${VIOLET}" opacity="0.16" stroke="${VIOLET}" stroke-width="6"/>
      <rect x="120" y="120" width="82" height="82" rx="24" fill="${VIOLET}" opacity="0.16" stroke="${VIOLET}" stroke-width="6"/>
      <path d="M86 84 L132 130" stroke="${VIOLET}" stroke-width="14" stroke-linecap="round"/>
      <path d="M92 92 L112 84 L104 104 Z" fill="${VIOLET_DK}"/>
      <path d="M126 126 L104 136 L114 116 Z" fill="${VIOLET_DK}"/>
    </svg>
  </div>
</body></html>`;

const pageHtml = (size, bg, glyph, radiusPx) => `<!doctype html><html><head><meta charset="utf-8"><style>
  * { margin: 0; } body { width: ${size}px; height: ${size}px; background: ${bg}; overflow: hidden;
  border-radius: ${radiusPx}px; } svg { display: block; width: ${size}px; height: ${size}px; }
</style></head><body>${glyph}</body></html>`;

function glyphAt(size, color, scale) {
  return glyphSVG(size, color, scale);
}

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const write = async (pathOut, html, w, h) => {
    await page.setViewportSize({ width: w, height: h });
    await page.setContent(html, { waitUntil: 'load' });
    await page.screenshot({ path: pathOut, clip: { x: 0, y: 0, width: w, height: h }, omitBackground: true });
  };

  // --- OG card 1200x630 ---
  await write(path.join(pub, 'og', 'sharetext-og-v8.png'), ogHtml, 1200, 630);

  // --- PWA icons (plum field, lilac glyph; maskable glyph inside safe zone) ---
  await write(path.join(pub, 'icon-512.png'), pageHtml(512, PLUM, glyphAt(512, LILAC, 0.72), 0), 512, 512);
  await write(path.join(pub, 'icon-192.png'), pageHtml(192, PLUM, glyphAt(192, LILAC, 0.72), 0), 192, 192);
  await write(path.join(pub, 'icon-maskable-512.png'), pageHtml(512, PLUM, glyphAt(512, LILAC, 0.55), 0), 512, 512);
  await write(path.join(pub, 'icon-maskable-192.png'), pageHtml(192, PLUM, glyphAt(192, LILAC, 0.55), 0), 192, 192);
  await write(path.join(pub, 'apple-touch-icon.png'), pageHtml(180, PLUM, glyphAt(180, LILAC, 0.72), 0), 180, 180);

  // --- Favicons: transparent background, violet glyph (reads on any tab theme) ---
  const favHtml = (size) => `<!doctype html><html><head><meta charset="utf-8"><style>
    * { margin: 0; } body { width: ${size}px; height: ${size}px; background: transparent; overflow: hidden; }
    svg { display: block; width: ${size}px; height: ${size}px; }
  </style></head><body>${glyphAt(size, VIOLET, 0.78)}</body></html>`;
  for (const s of [16, 32, 48]) {
    await write(path.join(pub, `favicon-${s}.png`), favHtml(s), s, s);
  }

  await browser.close();

  // Verify PNG dimensions from their headers (bytes 16..24 = width/height).
  const png = (p) => { const b = fs.readFileSync(p); return { w: b.readUInt32BE(16), h: b.readUInt32BE(20), kb: Math.round(b.length / 1024) }; };
  for (const p of ['og/sharetext-og-v8.png', 'icon-512.png', 'icon-192.png', 'icon-maskable-512.png', 'icon-maskable-192.png', 'apple-touch-icon.png', 'favicon-16.png', 'favicon-32.png', 'favicon-48.png']) {
    const f = path.join(pub, p);
    const r = png(f);
    console.log(`${p}: ${r.w}x${r.h} ${r.kb}KB`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
