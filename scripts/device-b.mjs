// Device B — joins a ShareText room created by the preview (device A) and
// sends text + image + file + audio with progress markers so the audit can
// screenshot device A at each state.
// Usage: node scripts/device-b.mjs <code>
import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import { fileURLToPath } from 'url';
import crypto from 'crypto';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const URL = process.env.URL || 'http://localhost:3000';
const code = process.argv[2];
if (!code) { console.error('usage: node scripts/device-b.mjs <code>'); process.exit(1); }

// ---------- asset generation ----------
const ASSETS = path.join(__dirname, '..', '.audit-assets');
fs.mkdirSync(ASSETS, { recursive: true });

function crc32(buf) {
  let table = crc32.table;
  if (!table) {
    table = crc32.table = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      table[n] = c;
    }
  }
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = table[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function pngChunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const typeBuf = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])));
  return Buffer.concat([len, typeBuf, data, crc]);
}
function makePng(width, height, file) {
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0; // filter: none
    for (let x = 0; x < width; x++) {
      const i = y * (width * 4 + 1) + 1 + x * 4;
      const t = (x + y) / (width + height);
      raw[i] = Math.round(30 + 150 * t);
      raw[i + 1] = Math.round(70 + 120 * (1 - t));
      raw[i + 2] = Math.round(160 + 90 * Math.sin(t * Math.PI));
      raw[i + 3] = 255;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', zlib.deflateSync(raw, { level: 6 })),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
  fs.writeFileSync(file, png);
}
function makeWav(seconds, freq, file) {
  const rate = 44100, n = Math.floor(seconds * rate), data = Buffer.alloc(n * 2);
  for (let i = 0; i < n; i++) {
    const env = 1 - (i / n); // fade out
    data.writeInt16LE(Math.round(Math.sin(2 * Math.PI * freq * i / rate) * 12000 * env), i * 2);
  }
  const header = Buffer.alloc(44);
  header.write('RIFF', 0); header.writeUInt32LE(36 + data.length, 4); header.write('WAVE', 8);
  header.write('fmt ', 12); header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20); header.writeUInt16LE(1, 22);
  header.writeUInt32LE(rate, 24); header.writeUInt32LE(rate * 2, 28); header.writeUInt16LE(2, 32); header.writeUInt16LE(16, 34);
  header.write('data', 36); header.writeUInt32LE(data.length, 40);
  fs.writeFileSync(file, Buffer.concat([header, data]));
}

const photoPath = path.join(ASSETS, 'audit-photo.png');
const wavPath = path.join(ASSETS, 'audit-tone.wav');
const binPath = path.join(ASSETS, 'audit-bundle.bin');
makePng(960, 600, photoPath);
makeWav(2, 440, wavPath);
fs.writeFileSync(binPath, crypto.randomBytes(2 * 1024 * 1024));

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

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

const browser = await chromium.launch({ headless: true, executablePath: resolveChrome() });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const logs = [];

async function sendAttachment(label, filePath, menuLabel) {
  await page.getByRole('button', { name: 'Add attachment' }).click();
  await page.getByText(menuLabel, { exact: true }).click();
  const input = page.locator('input[type="file"]');
  await input.setInputFiles(filePath);
  // Small settle for the preview card animation
  await sleep(400);
  await page.getByRole('button', { name: 'Send' }).click();
  logs.push(label + ' sent');
  console.log('MARK:' + label.toUpperCase() + '_SENT');
}

try {
  await page.goto(URL, { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: 'Receive text' }).first().click();
  await page.locator('input[inputmode="numeric"]').fill(code);
  await page.getByText(/Paste or type|Your private clipboard|End room/).first().waitFor({ timeout: 25000 });
  console.log('MARK:CHAT_READY');
  await sleep(2500); // empty-chat screenshot window

  // Text
  const ta = page.locator('textarea').first();
  await ta.fill('Here\'s that PDF — check page 4');
  await page.getByRole('button', { name: 'Send' }).click();
  console.log('MARK:TEXT_SENT');
  await sleep(4000);

  await ta.fill('Also — I finished the deck. Sending it now.');
  await page.getByRole('button', { name: 'Send' }).click();
  console.log('MARK:TEXT2_SENT');
  await sleep(2500);

  await sendAttachment('image', photoPath, 'Photo');
  await sleep(4500);

  await sendAttachment('file', binPath, 'File');
  await sleep(4500);

  await sendAttachment('audio', wavPath, 'Audio');
  console.log('MARK:AUDIO_SENT');
  await sleep(9000); // completion screenshots

  console.log('DONE');
} catch (e) {
  console.error('ERROR:', e.message);
  process.exit(1);
} finally {
  await browser.close();
  process.exit(0);
}
