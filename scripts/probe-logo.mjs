// Verifies the ShareText mark's actual rendered pixels: the rounded screen
// is azure, and the arrow shaft/head + rounded corners are transparent holes.
// Renders public/favicon.svg at 64px, screenshots it, decodes the PNG with
// node:zlib (no deps), and samples key points.
// Usage: node scripts/probe-logo.mjs
import { chromium } from 'playwright';
import fs from 'fs';
import zlib from 'zlib';

function resolveChrome() {
  if (process.env.CHROME) return process.env.CHROME;
  for (const p of [
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  ]) if (fs.existsSync(p)) return p;
  return undefined;
}

/** Minimal PNG decode (RGBA, no interlace) via zlib — returns Uint8ClampedArray. */
function decodePng(buf) {
  const sig = [137, 80, 78, 71, 13, 10, 26, 10];
  for (let i = 0; i < 8; i++) if (buf[i] !== sig[i]) throw new Error('not a png');
  let off = 8;
  let width = 0, height = 0, bitDepth = 0, colorType = 0;
  const idat = [];
  while (off < buf.length) {
    const len = buf.readUInt32BE(off);
    const type = buf.toString('ascii', off + 4, off + 8);
    if (type === 'IHDR') {
      width = buf.readUInt32BE(off + 8);
      height = buf.readUInt32BE(off + 12);
      bitDepth = buf[off + 16];
      colorType = buf[off + 17];
    } else if (type === 'IDAT') {
      idat.push(buf.subarray(off + 8, off + 8 + len));
    } else if (type === 'IEND') break;
    off += 12 + len;
  }
  if ((colorType !== 6 && colorType !== 2) || bitDepth !== 8) throw new Error(`unsupported png colorType=${colorType} depth=${bitDepth}`);
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const channels = colorType === 6 ? 4 : 3;
  const stride = width * channels;
  const out = new Uint8ClampedArray(width * height * 4);
  const bpp = channels;
  let prev = new Uint8Array(stride);
  let pos = 0;
  for (let y = 0; y < height; y++) {
    const filter = raw[pos++];
    if (filter > 4) throw new Error('bad filter ' + filter + ' at y=' + y);
    const line = new Uint8Array(stride);
    for (let x = 0; x < stride; x++) {
      const rawByte = raw[pos++];
      const a = x >= bpp ? line[x - bpp] : 0;
      const b = prev[x];
      const c = x >= bpp ? prev[x - bpp] : 0;
      let val;
      switch (filter) {
        case 0: val = rawByte; break;
        case 1: val = rawByte + a; break;
        case 2: val = rawByte + b; break;
        case 3: val = rawByte + ((a + b) >> 1); break;
        case 4: {
          const p = a + b - c;
          const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
          val = rawByte + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c);
          break;
        }
      }
      line[x] = val & 0xff;
    }
    // Expand to RGBA.
    for (let x = 0; x < width; x++) {
      const si = x * channels;
      const di = (y * width + x) * 4;
      out[di] = line[si];
      out[di + 1] = line[si + 1];
      out[di + 2] = line[si + 2];
      out[di + 3] = channels === 4 ? line[si + 3] : 255;
    }
    prev = line;
  }
  return { width, height, data: out };
}

const svg = fs.readFileSync('public/favicon.svg', 'utf8');
const browser = await chromium.launch({ headless: true, executablePath: resolveChrome() });
const page = await browser.newPage();
await page.setContent(`<html><body style="margin:0;background:transparent">${svg.replace('<svg', '<svg style="width:64px;height:64px"')}</body></html>`);
const png = await page.screenshot({ clip: { x: 0, y: 0, width: 64, height: 64 }, omitBackground: true });
await browser.close();

const { width, height, data } = decodePng(png);
if (width !== 64 || height !== 64) throw new Error(`unexpected ${width}x${height}`);
// viewBox 0..256 → 0..63 px: scale = 64/256 = 0.25
const S = 0.25;
const px = (x, y) => {
  const sx = Math.round(x * S), sy = Math.round(y * S);
  const i = (sy * width + sx) * 4;
  return [data[i], data[i + 1], data[i + 2], data[i + 3]];
};
const isAzure = ([r, g, b, a]) => a > 200 && Math.abs(r - 10) < 40 && Math.abs(g - 102) < 40 && Math.abs(b - 240) < 40;
const isHole = ([, , , a]) => a < 30;

let pass = true;
const expect = (name, got, want) => {
  const ok = got === want;
  if (!ok) pass = false;
  console.log(`${ok ? '  ok ' : 'FAIL '} ${name}: ${got} (want ${want})`);
};
expect('screen painted azure (above arrow)', isAzure(px(128, 70)) ? 'azure' : 'other', 'azure');
expect('screen painted azure (below arrow)', isAzure(px(128, 205)) ? 'azure' : 'other', 'azure');
expect('shaft is transparent hole', isHole(px(110, 128)) ? 'hole' : 'painted', 'hole');
expect('head is transparent hole', isHole(px(170, 128)) ? 'hole' : 'painted', 'hole');
expect('rounded corner transparent', isHole(px(40, 40)) ? 'hole' : 'painted', 'hole');
expect('outside transparent', isHole(px(20, 20)) ? 'hole' : 'painted', 'hole');

console.log(pass ? '\nLOGO GEOMETRY OK' : '\nLOGO GEOMETRY FAILED');
process.exit(pass ? 0 : 1);
