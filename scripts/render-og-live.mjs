// Render the NEW OG image (og-3.png) from the LIVE hero animation:
//   1. Open the landing page, wait for a transfer "received" frame.
//   2. Screenshot the hero device scene at high fidelity.
//   3. Compose the final 1200x630 card: scene + headline + brand + URL.
// A brand-new filename (og-3.png) busts social crawler caches — Twitter/X
// ignore query-string bumps, so a fresh path is the reliable way to replace
// an old preview card.
// Run: URL=http://localhost:3000 node scripts/render-og-live.mjs
import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const URL = process.env.URL || 'http://localhost:3000';
const KNOWN_PATHS = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
];
const chrome = KNOWN_PATHS.find((p) => { try { return fs.existsSync(p); } catch { return false; } });

// 2x DPR so the captured scene stays crisp when scaled up to card width.
const browser = await chromium.launch(chrome ? { headless: true, executablePath: chrome } : { headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });

// Drive the hero deterministically instead of racing its auto-cycle: click
// the replay button (a real button in the phone composer), which plays a full
// ready -> sending -> received transfer of the CURRENT scene. Land the shot
// ~2.1s later, when the photo card is sitting on the laptop screen.
await page.goto(URL + '/', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(1200);
// Ensure the scene is the PHOTO (the app's hero story): if the auto-cycle
// has already flipped to link, click twice won't help — instead we re-click
// the replay button on whatever scene is current, then force photo by
// clicking again after the flip. Keep it simple: click replay, and if the
// laptop's received card shows a link (no filename span), click again next
// cycle. For the OG we accept whichever received card is up, but prefer
// photo by waiting for it within a few cycles.
const clicked = await page.evaluate(() => {
  const btn = [...document.querySelectorAll('button')].find(b => b.getAttribute('aria-label') === 'Replay transfer');
  if (btn) { btn.click(); return true; }
  return false;
});
if (!clicked) console.warn('⚠ replay button not found — falling back to auto-cycle wait');
// The transfer takes ~1.85s to reach the received frame; poll for the
// laptop's received PHOTO card (the "2.4 MB" size caption only exists on
// the received photo card). Up to 6 replay attempts across the auto-cycle.
let gotFrame = false;
for (let attempt = 0; attempt < 6 && !gotFrame; attempt++) {
  await page.waitForTimeout(2400);
  gotFrame = await page.evaluate(() => {
    const hasPhotoCard = [...document.querySelectorAll('span')].some(s => s.textContent.trim() === '2.4 MB');
    if (hasPhotoCard) return true;
    const btn = [...document.querySelectorAll('button')].find(b => b.getAttribute('aria-label') === 'Replay transfer');
    if (btn) btn.click();
    return false;
  });
}
if (!gotFrame) console.warn('⚠ never saw the received photo card — capturing whatever is up');

// Locate the HERO demo scene — the flex row holding both devices, near the
// top of the page (the ScrollStory section reuses the same labels further
// down, so restrict to the first viewport).
const scene = await page.evaluate(() => {
  const all = [...document.querySelectorAll('div')];
  const candidates = all.filter(el => {
    const t = el.textContent;
    if (!t.includes('Your phone') || !t.includes('Your laptop')) return false;
    const r = el.getBoundingClientRect();
    return r.width > 300 && r.height > 200 && r.top < 700;
  });
  if (candidates.length === 0) return null;
  // Smallest area = the tightest wrapper around the two device columns.
  candidates.sort((a, b) => {
    const ra = a.getBoundingClientRect(), rb = b.getBoundingClientRect();
    return ra.width * ra.height - rb.width * rb.height;
  });
  const r = candidates[0].getBoundingClientRect();
  return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) };
});

if (!scene) throw new Error('hero scene not found');
console.log('scene region:', JSON.stringify(scene));

// Screenshot just the scene (a little padding top/bottom for the beam glow).
// Coordinates are CSS px; at DPR 2 the screenshot comes out 2x.
const pad = 40;
const clip = {
  x: Math.max(0, scene.x),
  y: Math.max(0, scene.y - pad),
  width: scene.w,
  height: scene.h + pad * 2,
  scale: 1,
};
fs.mkdirSync(path.join(root, 'scripts/shots'), { recursive: true });
await page.screenshot({ path: path.join(root, 'scripts/shots/hero-scene.png'), clip });
await page.close();
await browser.close();

// ---- Compose the final 1200x630 OG card ----------------------------------
const scenePng = fs.readFileSync(path.join(root, 'scripts/shots/hero-scene.png')).toString('base64');
const markPng = fs.readFileSync(path.join(root, 'public/icon-192.png')).toString('base64');

const ogHtml = `<!doctype html><html><head><meta charset="utf-8"><style>
  * { margin: 0; box-sizing: border-box; }
  html, body { width: 1200px; height: 630px; overflow: hidden; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    background: linear-gradient(180deg, #0E1728 0%, #070B14 100%);
    color: #FAFAFA; -webkit-font-smoothing: antialiased; position: relative;
  }
  .dots { position: absolute; inset: 0;
    background-image: radial-gradient(rgba(255,255,255,0.05) 1px, transparent 1px);
    background-size: 34px 34px;
    mask-image: radial-gradient(70% 62% at 50% 40%, black 20%, transparent 78%);
    -webkit-mask-image: radial-gradient(70% 62% at 50% 40%, black 20%, transparent 78%);
  }
  .glow { position: absolute; inset: 0; background: radial-gradient(56% 46% at 50% 10%, rgba(46,139,255,0.22), transparent 70%); }
  .headline { position: absolute; top: 56px; left: 0; right: 0; text-align: center;
    font-size: 48px; font-weight: 700; letter-spacing: -0.03em; color: #FFFFFF; }
  .headline em { font-style: normal; color: #6FB4FF; }
  .sub { position: absolute; top: 536px; left: 0; right: 0; text-align: center;
    font-size: 21px; font-weight: 500; letter-spacing: -0.005em; color: rgba(250,250,250,0.62); }
  .scene { position: absolute; top: 124px; left: 50%; transform: translateX(-50%);
    width: 1210px; text-align: center; }
  .scene img { width: 1210px; height: auto; border-radius: 22px;
    box-shadow: 0 30px 80px rgba(0,0,0,0.55); }
  .foot { position: absolute; left: 96px; right: 96px; bottom: 34px; display: flex; align-items: center; justify-content: space-between; }
  .brand { display: flex; align-items: center; gap: 12px; }
  .brand img { width: 30px; height: 30px; border-radius: 8px; }
  .brand span { font-size: 19px; font-weight: 600; letter-spacing: -0.01em; color: rgba(255,255,255,0.92); }
  .url { font-family: ui-monospace, "SF Mono", "Cascadia Mono", Consolas, monospace; font-size: 15px; letter-spacing: 0.02em; color: rgba(255,255,255,0.4); }
  .lock { display: flex; align-items: center; gap: 8px; font-size: 15px; letter-spacing: 0.01em; color: rgba(255,255,255,0.55); }
  .lock svg { width: 14px; height: 14px; }
</style></head><body>
  <div class="dots"></div>
  <div class="glow"></div>
  <div class="headline">Move something between <em>two devices</em>.</div>
  <div class="scene"><img src="data:image/png;base64,${scenePng}" /></div>
  <p class="sub">Text · Photos · Videos · Files — no app, no account, nothing stored</p>
  <div class="foot">
    <span class="brand"><img src="data:image/png;base64,${markPng}" /><span>ShareText</span></span>
    <span class="url">share-texts.vercel.app</span>
    <span class="lock">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>
      End-to-end encrypted
    </span>
  </div>
</body></html>`;

const comp = await chromium.launch(chrome ? { headless: true, executablePath: chrome } : { headless: true });
const ogPage = await comp.newPage({ viewport: { width: 1200, height: 630 } });
await ogPage.setContent(ogHtml);
await ogPage.screenshot({ path: path.join(root, 'public/og-3.png'), type: 'png' });
await comp.close();
console.log('wrote public/og-3.png');
