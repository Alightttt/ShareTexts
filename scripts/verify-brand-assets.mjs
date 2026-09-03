// Verifies the generated brand assets render as designed by sampling pixels
// off the live server (Playwright + canvas getImageData). No image files are
// touched — this is a read-only contract check.
// Usage: node scripts/verify-brand-assets.mjs   (URL=http://localhost:3001 to override)
import { launchBrowser } from './lib.mjs';

const URL = process.env.URL || 'http://localhost:3000';

const b = await launchBrowser();
const page = await b.newPage();

async function sample(asset) {
  await page.goto(URL + asset, { waitUntil: 'load' });
  const r = await page.evaluate(() => {
    const img = new Image();
    img.src = location.href;
    return img.decode().then(() => {
      const c = document.createElement('canvas');
      c.width = img.naturalWidth;
      c.height = img.naturalHeight;
      const ctx = c.getContext('2d');
      ctx.drawImage(img, 0, 0);
      return { w: c.width, h: c.height, data: Array.from(ctx.getImageData(0, 0, c.width, c.height).data) };
    });
  });
  return { w: r.w, h: r.h, data: new Uint8ClampedArray(r.data) };
}

// Tolerant predicates. Cream allows the designed lavender/peach glow tints
// (blue- or red-dominant but still light); violet and ink stay strict.
const at = (d, w, x, y) => { const i = (y * w + x) * 4; return [d[i], d[i + 1], d[i + 2], d[i + 3]]; };
const count = (d, w, x0, y0, x1, y1, pred, step = 3) => {
  let n = 0;
  for (let y = y0; y < y1; y += step) for (let x = x0; x < x1; x += step) if (pred(at(d, w, x, y))) n++;
  return n;
};
const cream = (p) => p[0] >= 220 && p[1] >= 205 && p[2] <= 250 && p[0] >= p[2] - 40;
const violet = (p) => p[2] > p[0] + 25 && p[2] > p[1] + 25;
const ink = (p) => p[0] < 130 && p[1] < 130 && p[2] < 130;
const plum = (p) => p[0] < 90 && p[1] < 90 && p[2] >= 40 && p[2] <= 95;
const alpha = (p) => p[3] < 10;

const checks = [];
const check = (name, cond) => checks.push([name, cond]);

// ── OG card 1200x630 ──
const og = await sample('/og/sharetext-og-v8.png');
check('og is 1200x630', og.w === 1200 && og.h === 630);
for (const [x, y] of [[4, 4], [1195, 4], [4, 625], [1195, 625], [600, 315]]) {
  check(`og point (${x},${y}) warm cream family`, cream(at(og.data, og.w, x, y)));
}
check('og violet glyph in brand mark', count(og.data, og.w, 80, 70, 140, 135, violet) > 0);
check('og violet glyph in side art', count(og.data, og.w, 800, 150, 1150, 480, violet) > 0);
const inkHeadline = count(og.data, og.w, 84, 190, 700, 360, ink);
check(`og ink headline present (${inkHeadline} px)`, inkHeadline > 2000);
check('og nothing clipped at right/bottom 4px strips',
  count(og.data, og.w, og.w - 4, 0, og.w, og.h, ink) === 0 &&
  count(og.data, og.w, 0, og.h - 4, og.w, og.h, ink) === 0);

// ── Maskable icon: glyph must stay inside the central safe zone ──
const mk = await sample('/icon-maskable-512.png');
check('maskable is 512x512', mk.w === 512 && mk.h === 512);
for (const [x, y] of [[8, 8], [504, 8], [8, 504], [504, 504]]) {
  check(`maskable corner (${x},${y}) plum`, plum(at(mk.data, mk.w, x, y)));
}
check('maskable glyph inside safe zone', count(mk.data, mk.w, 96, 96, 416, 416, violet) > 0);
check('maskable no violet at corners', !violet(at(mk.data, mk.w, 8, 8)) && !violet(at(mk.data, mk.w, 504, 504)));

// ── Favicon 16: transparent background, violet glyph ──
const f16 = await sample('/favicon-16.png');
check('favicon-16 is 16x16', f16.w === 16 && f16.h === 16);
check('favicon-16 transparent background', count(f16.data, 16, 0, 0, 16, 16, alpha, 1) > 0);
check('favicon-16 violet glyph', count(f16.data, 16, 0, 0, 16, 16, violet, 1) > 0);

await b.close();

const failed = checks.filter(([, c]) => !c);
if (failed.length) {
  console.error(`\n${failed.length} BRAND CHECK(S) FAILED:`);
  for (const [name] of failed) console.error('  - ' + name);
  process.exit(1);
}
console.log(`\nALL BRAND CHECKS GREEN (${checks.length})`);