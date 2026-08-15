// Renders public/og.png — the 1200×630 Open Graph / Twitter card — using the
// app's own design language (night surfaces, azure accent, device mockups).
// Usage: node scripts/gen-og.mjs [outPath]
import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const out = process.argv[2] || path.join(__dirname, '..', 'public', 'og.png');

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

// New mark: rounded device screen with the transfer arrow knocked through it
// (matches src/components/ShareTextLogo.tsx and public/favicon.svg).
const svgLogo = `<svg width="44" height="44" viewBox="0 0 256 256" fill="none" xmlns="http://www.w3.org/2000/svg">
  <defs><mask id="hole"><rect x="0" y="0" width="256" height="256" fill="white"/><rect x="84" y="112" width="64" height="32" fill="black"/><path d="M148 94l48 34-48 34z" fill="black"/></mask></defs>
  <rect x="36" y="36" width="184" height="184" rx="44" fill="#2E8BFF" mask="url(#hole)"/>
</svg>`;

const html = `<!doctype html><html><head><meta charset="utf-8"><style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { width: 1200px; height: 630px; overflow: hidden; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    background: #060a13; color: #fff;
    display: flex; align-items: center; padding: 0 72px;
    position: relative;
  }
  .glow {
    position: absolute; inset: 0;
    background: radial-gradient(60% 80% at 85% -20%, rgba(46,139,255,0.22), transparent 70%);
  }
  .left { position: relative; z-index: 2; width: 52%; }
  .brand { display: flex; align-items: center; gap: 14px; margin-bottom: 26px; }
  .brand-name { font-size: 30px; font-weight: 700; letter-spacing: -0.02em; }
  h1 { font-size: 58px; font-weight: 700; letter-spacing: -0.035em; line-height: 1.08; max-width: 12ch; }
  .sub { margin-top: 18px; font-size: 26px; font-weight: 500; color: rgba(255,255,255,0.65); }
  .chips { display: flex; gap: 10px; margin-top: 28px; }
  .chip { font-size: 18px; font-weight: 600; color: rgba(255,255,255,0.9); border: 1px solid rgba(255,255,255,0.18); background: rgba(255,255,255,0.05); padding: 9px 18px; border-radius: 999px; }
  .right { position: relative; z-index: 2; width: 48%; display: flex; align-items: center; justify-content: flex-end; gap: 0; }
  .phone {
    width: 148px; height: 296px; background: #161617; border: 1px solid rgba(255,255,255,0.12);
    border-radius: 26px; padding: 8px; position: relative;
  }
  .phone .screen { width: 100%; height: 100%; background: #060a13; border-radius: 18px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px; }
  .code { display: flex; gap: 5px; }
  .code span { width: 20px; height: 26px; background: #1c1c1e; border: 1px solid #2a2a2c; border-radius: 6px; display: flex; align-items: center; justify-content: center; font-size: 15px; font-weight: 700; font-variant-numeric: tabular-nums; color: #fff; }
  .code-label { font-size: 10px; font-weight: 600; letter-spacing: 0.14em; color: rgba(255,255,255,0.5); }
  .beam { position: relative; width: 90px; height: 2px; background: rgba(255,255,255,0.14); margin: 0 -14px; z-index: 3; display: flex; align-items: center; justify-content: center; }
  .beam .node { width: 54px; height: 54px; border-radius: 16px; background: #1c1c1e; border: 1px solid #2a2a2c; display: flex; align-items: center; justify-content: center; box-shadow: 0 12px 32px -8px rgba(0,0,0,0.6); }
  .laptop {
    width: 236px; background: #232326; border: 1px solid rgba(255,255,255,0.12);
    border-radius: 14px; padding: 9px; position: relative;
  }
  .laptop .screen { width: 100%; aspect-ratio: 16/10; background: #060a13; border-radius: 8px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 10px; }
  .laptop .base { height: 9px; background: linear-gradient(#3a3a3d, #2a2a2c); border-radius: 0 0 10px 10px; margin: 5px -12px 0; }
  .bubble { background: #1c1c1e; border: 1px solid #2a2a2c; border-radius: 12px; padding: 14px 18px; display: flex; align-items: center; gap: 10px; }
  .bubble .dot { width: 8px; height: 8px; border-radius: 999px; background: #2E8BFF; }
  .bubble span { font-size: 14px; font-weight: 600; color: rgba(255,255,255,0.9); }
  .copied { display: flex; align-items: center; gap: 7px; padding: 7px 14px; border-radius: 999px; background: rgba(52,199,89,0.12); }
  .copied span { font-size: 13px; font-weight: 700; color: #34c759; }
  .label { margin-top: 12px; text-align: center; font-size: 12px; font-weight: 500; color: rgba(255,255,255,0.45); }
</style></head><body>
  <div class="glow"></div>
  <div class="left">
    <div class="brand">${svgLogo.replace('<svg', '<svg style="width:44px;height:44px"').replace('width="44" height="44"', '')}<span class="brand-name">ShareText</span></div>
    <h1>Move something between your devices.</h1>
    <p class="sub">Text, photos and files. No app. No account.</p>
    <div class="chips"><span class="chip">Text</span><span class="chip">Photos</span><span class="chip">Files</span></div>
  </div>
  <div class="right">
    <div class="phone">
      <div class="screen">
        <span class="code-label">LIVE CODE</span>
        <div class="code"><span>8</span><span>2</span><span>7</span><span>&nbsp;</span><span>4</span><span>4</span><span>1</span></div>
      </div>
      <p class="label">Your phone</p>
    </div>
    <div class="beam">
      <div class="node">${svgLogo.replace('<svg', '<svg style="width:30px;height:30px"').replace('width="44" height="44"', '')}</div>
    </div>
    <div class="laptop">
      <div class="screen">
        <div class="bubble"><span class="dot"></span><span>example.com/a/link</span></div>
        <div class="copied"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#34c759" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg><span>Copied</span></div>
      </div>
      <div class="base"></div>
      <p class="label">Your laptop</p>
    </div>
  </div>
</body></html>`;

const browser = await chromium.launch({ headless: true, executablePath: resolveChrome() });
const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
await page.setContent(html, { waitUntil: 'networkidle' });
await page.screenshot({ path: out });
console.log('wrote', out, '1200x630');
await browser.close();
