// Verifies the generated brand assets render as designed by sampling pixels
// off the live server (Playwright + canvas getImageData). No image files are
// touched — this is a read-only contract check.
// Usage: node scripts/verify-brand-assets.mjs   (URL=http://localhost:3001 to override)
import { launchBrowser } from './lib.mjs';

const URL = process.env.URL || 'http://localhost:3010';

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

// Tolerant predicates. Cream allows the designed warm glow tints (blue- or
// red-dominant but still light); ember and ink stay strict.
const at = (d, w, x, y) => { const i = (y * w + x) * 4; return [d[i], d[i + 1], d[i + 2], d[i + 3]]; };
const count = (d, w, x0, y0, x1, y1, pred, step = 3) => {
  let n = 0;
  for (let y = y0; y < y1; y += step) for (let x = x0; x < x1; x += step) if (pred(at(d, w, x, y))) n++;
  return n;
};
const cream = (p) => p[0] >= 220 && p[1] >= 205 && p[2] <= 250 && p[0] >= p[2] - 40;
const violet = (p) => p[2] > p[0] + 25 && p[2] > p[1] + 25;
const ink = (p) => p[0] < 130 && p[1] < 130 && p[2] < 130;
// Ember field: warm orange — red dominant over blue, mid-high luminance.
const ember = (p) => p[0] > 150 && p[0] > p[2] + 60 && p[1] > p[2] && p[1] < p[0];
// Flat ember field pixel (the maskable background, EMBER #f06413).
const emberField = (p) => Math.abs(p[0] - 240) < 14 && Math.abs(p[1] - 100) < 18 && Math.abs(p[2] - 19) < 20;
// Honey highlight from the glyph gradient.
const honey = (p) => p[0] > 240 && p[1] > 140 && p[2] < 100;
const alpha = (p) => p[3] < 10;

const checks = [];
const check = (name, cond) => checks.push([name, cond]);

// ── OG card 1200x630 ──
const og = await sample('/og/sharetext-og-v9.png');
check('og is 1200x630', og.w === 1200 && og.h === 630);
for (const [x, y] of [[600, 315]]) {
  // Center may be cream canvas or the ink CTA pill — both by design; it
  // must never be a mid-tone artifact.
  const p = at(og.data, og.w, x, y);
  check(`og point (${x},${y}) cream or ink`, cream(p) || ink(p));
}
check('og ember glyph in brand mark', count(og.data, og.w, 80, 70, 140, 135, ember) > 0);
check('og ember glyph in side art', count(og.data, og.w, 800, 150, 1150, 480, ember) > 0);
const inkHeadline = count(og.data, og.w, 84, 190, 700, 360, ink);
check(`og ink headline present (${inkHeadline} px)`, inkHeadline > 2000);
check('og nothing clipped at right/bottom 4px strips',
  count(og.data, og.w, og.w - 4, 0, og.w, og.h, ink) === 0 &&
  count(og.data, og.w, 0, og.h - 4, og.w, og.h, ink) === 0);

// ── Maskable icon: glyph must stay inside the central safe zone ──
const mk = await sample('/icon-maskable-512.png');
check('maskable is 512x512', mk.w === 512 && mk.h === 512);
for (const [x, y] of [[8, 8], [504, 8], [8, 504], [504, 504]]) {
  check(`maskable corner (${x},${y}) flat ember field`, emberField(at(mk.data, mk.w, x, y)));
}
check('maskable gradient glyph inside safe zone', count(mk.data, mk.w, 96, 96, 416, 416, honey, 4) > 0);

// ── Favicon 16: transparent background, ember glyph ──
const f16 = await sample('/favicon-16.png');
check('favicon-16 is 16x16', f16.w === 16 && f16.h === 16);
check('favicon-16 transparent background', count(f16.data, 16, 0, 0, 16, 16, alpha, 1) > 0);
check('favicon-16 ember glyph', count(f16.data, 16, 0, 0, 16, 16, ember, 1) > 0);

await b.close();

const failed = checks.filter(([, c]) => !c);
if (failed.length) {
  console.error(`\n${failed.length} BRAND CHECK(S) FAILED:`);
  for (const [name] of failed) console.error('  - ' + name);
  process.exit(1);
}
console.log(`\nALL BRAND CHECKS GREEN (${checks.length})`);