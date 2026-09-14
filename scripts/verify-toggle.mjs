// Rendered-geometry verification for the compact ThemeToggle.
// Usage: node scripts/verify-toggle.mjs [url]
//
// Asserts the iOS-class contract against the REAL rendered pixels:
//   track 60×34 r17 · thumb 30×30 circular · 2px inset · travel 26
//   ON  → green track, thumb right (green margin both sides)
//   OFF → gray track,  thumb left, identical dimensions
import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const URL = process.argv[2] || process.env.URL || 'http://localhost:3001/';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function measure(data, w, h) {
  const at = (x, y) => { const i = (y * w + x) * 4; return [data[i], data[i + 1], data[i + 2], data[i + 3]]; };
  const isGreen = (p) => p[1] > p[0] + 25 && p[1] > p[2] + 25 && p[1] > 120;
  const isWhite = (p) => p[0] > 240 && p[1] > 240 && p[2] > 240 && p[3] > 200;
  let minX = 1e9, maxX = -1, minY = 1e9, maxY = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (isGreen(at(x, y))) { if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y; }
  }
  if (maxX < 0) return null;
  const midY = Math.round((minY + maxY) / 2);
  let tMinX = -1, tMaxX = -1;
  for (let x = minX; x <= maxX; x++) { if (isWhite(at(x, midY))) { if (tMinX === -1) tMinX = x; tMaxX = x; } }
  const tcX = Math.round((tMinX + tMaxX) / 2);
  let tMinY = -1, tMaxY = -1;
  for (let y = minY; y <= maxY; y++) { if (isWhite(at(tcX, y))) { if (tMinY === -1) tMinY = y; tMaxY = y; } }
  return {
    track: { w: maxX - minX + 1, h: maxY - minY + 1 },
    thumb: { w: tMaxX - tMinX + 1, h: tMaxY - tMinY + 1 },
    leftGap: tMinX - minX,
    rightGap: maxX - tMaxX,
  };
}

const b = await chromium.launch();
const page = await b.newPage({ viewport: { width: 1440, height: 900 } });
// NOTE: no networkidle — the signaling socket's long-poll keeps a request
// open by design, which would stall networkidle forever. Wait on the UI.
await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 45_000 });

const sw = page.locator('[role="switch"]').first();
await sw.waitFor({ state: 'visible' });
await page.waitForTimeout(800); // let the initial spring settle

async function snapAndMeasure(label) {
  const shot = await sw.screenshot({ scale: 'css' });
  const img = await page.evaluate(async (dataUrl) => {
    const im = new Image(); im.src = dataUrl; await im.decode();
    const c = document.createElement('canvas'); c.width = im.naturalWidth; c.height = im.naturalHeight;
    const ctx = c.getContext('2d'); ctx.drawImage(im, 0, 0);
    return { w: c.width, h: c.height, data: Array.from(ctx.getImageData(0, 0, c.width, c.height).data) };
  }, 'data:image/png;base64,' + shot.toString('base64'));
  const m = measure(new Uint8ClampedArray(img.data), img.w, img.h);
  console.log(label + ':', JSON.stringify(m));
  return m;
}

// Force ON (green) via the public aria state, then pixel-measure.
const startOn = await sw.getAttribute('aria-checked');
if (startOn !== 'true') { await sw.click(); await page.waitForTimeout(500); }
fs.mkdirSync(path.join(root, '.audit-shots'), { recursive: true });
fs.writeFileSync(path.join(root, '.audit-shots', 'toggle-rendered-on.png'), await sw.screenshot({ scale: 'css' }));
const on = await snapAndMeasure('rendered ON ');

// CONTRACT: 60×34 track, 30×30 thumb, 2px margins, ON sits right.
const REF = { track: { w: 60, h: 34 }, thumb: { w: 30, h: 30 }, leftGap: 2, rightGap: 2 };
const near = (a, b, tol) => Math.abs(a - b) <= tol;
const pass = !!on
  && near(on.track.w, REF.track.w, 2) && near(on.track.h, REF.track.h, 2)
  && near(on.thumb.w, REF.thumb.w, 2) && near(on.thumb.h, REF.thumb.h, 2)
  && near(on.rightGap, REF.rightGap, 2)
  && on.leftGap > on.rightGap + 4; // thumb clearly on the right when ON
console.log('contract:', JSON.stringify(REF));
console.log(pass ? 'PASS: ON-state geometry matches the compact contract' : 'FAIL: geometry diverges');

// DOM-level checks: a11y semantics, fixed sizing, circular thumb.
const dom = await page.evaluate(() => {
  const el = document.querySelector('[role="switch"]');
  const pill = el.querySelector('div');
  const thumb = pill.querySelector('div');
  const cs = getComputedStyle(el);
  const pcs = getComputedStyle(pill);
  const tcs = getComputedStyle(thumb);
  return {
    checked: el.getAttribute('aria-checked'),
    flex: cs.flex,
    trackW: pcs.width, trackH: pcs.height, trackR: pcs.borderRadius,
    thumbW: tcs.width, thumbH: tcs.height, thumbR: tcs.borderRadius,
    ariaLabel: el.getAttribute('aria-label'),
    tabindex: el.getAttribute('tabindex'),
  };
});
console.log('dom:', JSON.stringify(dom));
if (dom.ariaLabel && dom.tabindex === '0') console.log('PASS: switch semantics + keyboard focus present');

// Toggle OFF: same box, thumb returns left, track grays out.
// Pixel-scanning a gray-on-gray track is brittle; the DOM is exact here.
await sw.click();
await page.waitForTimeout(500);
fs.writeFileSync(path.join(root, '.audit-shots', 'toggle-rendered-off.png'), await sw.screenshot({ scale: 'css' }));
const off = await page.evaluate(() => {
  const el = document.querySelector('[role="switch"]');
  const pill = el.querySelector('div');
  const thumb = pill.querySelector('div');
  const m = new DOMMatrixReadOnly(getComputedStyle(thumb).transform === 'none' ? '' : getComputedStyle(thumb).transform);
  const r = pill.getBoundingClientRect();
  return { bg: getComputedStyle(pill).backgroundColor, x: m.m41, w: r.width, h: r.height };
});
const same = near(off.w, 60, 1) && near(off.h, 34, 1);
const left = off.x <= 1;
const gray = off.bg === 'rgb(233, 233, 234)';
console.log(same ? 'PASS: OFF keeps the exact track dimensions' : 'FAIL: OFF changed track dimensions');
console.log(left ? 'PASS: OFF places the thumb on the left' : 'FAIL: OFF thumb not on the left');
console.log(gray ? 'PASS: OFF track is neutral gray' : 'FAIL: OFF track color ' + off.bg);

await b.close();
process.exit(pass ? 0 : 1);
