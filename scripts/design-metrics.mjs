// Design-metrics audit: drives the full two-device flow and extracts exact
// computed styles per screen (type scale, radii, shadows, gradients, spacing)
// plus structural facts (button counts, touch targets, overflow). Saves
// full-page screenshots to .audit-shots/ for human review.
// Usage: node scripts/design-metrics.mjs   (URL=http://localhost:3000 default)
import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const URL = process.env.URL || 'http://localhost:3000';
const SHOTS = path.join(__dirname, '..', '.audit-shots');
fs.mkdirSync(SHOTS, { recursive: true });
const ASSETS = path.join(__dirname, '..', '.audit-assets');
fs.mkdirSync(ASSETS, { recursive: true });

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

// ---- asset generation (photo / audio / binary) ----
function crc32(buf) {
  let table = crc32.table;
  if (!table) {
    table = crc32.table = new Int32Array(256);
    for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; table[n] = c; }
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
    raw[y * (width * 4 + 1)] = 0;
    for (let x = 0; x < width; x++) {
      const i = y * (width * 4 + 1) + 1 + x * 4;
      const t = (x + y) / (width + height);
      raw[i] = Math.round(30 + 150 * t); raw[i + 1] = Math.round(70 + 120 * (1 - t)); raw[i + 2] = Math.round(160 + 90 * Math.sin(t * Math.PI)); raw[i + 3] = 255;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  fs.writeFileSync(file, Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', ihdr), pngChunk('IDAT', zlib.deflateSync(raw, { level: 6 })), pngChunk('IEND', Buffer.alloc(0)),
  ]));
}
function makeWav(seconds, freq, file) {
  const rate = 44100, n = Math.floor(seconds * rate), data = Buffer.alloc(n * 2);
  for (let i = 0; i < n; i++) data.writeInt16LE(Math.round(Math.sin(2 * Math.PI * freq * i / rate) * 12000 * (1 - i / n)), i * 2);
  const h = Buffer.alloc(44);
  h.write('RIFF', 0); h.writeUInt32LE(36 + data.length, 4); h.write('WAVE', 8);
  h.write('fmt ', 12); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22);
  h.writeUInt32LE(rate, 24); h.writeUInt32LE(rate * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34);
  h.write('data', 36); h.writeUInt32LE(data.length, 40);
  fs.writeFileSync(file, Buffer.concat([h, data]));
}
const photoPath = path.join(ASSETS, 'audit-photo.png');
const wavPath = path.join(ASSETS, 'audit-tone.wav');
const binPath = path.join(ASSETS, 'audit-bundle.bin');
makePng(960, 600, photoPath);
makeWav(2, 440, wavPath);
fs.writeFileSync(binPath, crypto.randomBytes(2 * 1024 * 1024));

// ---- measurement ----
async function measure(page, label, pairs) {
  const out = await page.evaluate(({ pairs }) => {
    const find = (sel) => {
      if (typeof sel === 'string') return document.querySelector(sel);
      if (sel && sel.text) {
        const tag = sel.tag || 'button';
        return [...document.querySelectorAll(tag)].find(el => el.textContent.trim().includes(sel.text));
      }
      return null;
    };
    const result = {};
    for (const [name, sel] of pairs) {
      const el = find(sel);
      if (!el) { result[name] = '(missing)'; continue; }
      const s = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      result[name] = {
        rect: `${Math.round(r.width)}x${Math.round(r.height)}`,
        font: `${s.fontSize}/${s.lineHeight} ${s.fontWeight} ${s.fontFamily.split(',')[0]}`,
        tracking: s.letterSpacing,
        color: s.color,
        bg: s.backgroundColor,
        radius: s.borderRadius,
        shadow: s.boxShadow === 'none' ? 'none' : 'shadow',
        border: s.borderWidth !== '0px' ? `${s.borderColor} ${s.borderWidth}` : 'none',
        bgImage: s.backgroundImage !== 'none' ? s.backgroundImage.slice(0, 90) : 'none',
        pad: s.padding,
      };
    }
    return result;
  }, { pairs });
  console.log(`\n===== ${label} =====`);
  for (const [k, v] of Object.entries(out)) console.log(`  ${k}: ${JSON.stringify(v)}`);
}

// Inventory pass — surfacing visual-system facts the code hides.
async function inventory(page, label) {
  const facts = await page.evaluate(() => {
    const els = [...document.querySelectorAll('*')].filter(e => {
      const r = e.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    });
    const radii = new Map(), fonts = new Map(), shadows = new Map(), grads = new Set(), blurs = new Set();
    for (const el of els) {
      const s = getComputedStyle(el);
      if (s.borderRadius !== '0px') {
        const k = s.borderRadius;
        radii.set(k, (radii.get(k) || 0) + 1);
      }
      const fs = s.fontSize + '/' + s.fontWeight;
      if (el.textContent && el.textContent.trim()) fonts.set(fs, (fonts.get(fs) || 0) + 1);
      if (s.boxShadow !== 'none') shadows.set(s.boxShadow.split('),').length > 1 ? 'multi-layer' : s.boxShadow.slice(0, 60), (shadows.get(s.boxShadow) || 0) + 1);
      if (s.backgroundImage && s.backgroundImage !== 'none') grads.add(s.backgroundImage.slice(0, 80));
      if (s.backdropFilter && s.backdropFilter !== 'none') blurs.add(s.backdropFilter.slice(0, 40));
    }
    const top = (m, n = 6) => [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, n);
    return {
      radii: top(radii), fonts: top(fonts), shadows: top(shadows),
      grads: [...grads].slice(0, 6), blurs: [...blurs].slice(0, 6),
    };
  });
  console.log(`[inventory ${label}] radii=${JSON.stringify(facts.radii)}`);
  console.log(`[inventory ${label}] fonts=${JSON.stringify(facts.fonts)}`);
  console.log(`[inventory ${label}] shadows=${JSON.stringify(facts.shadows)}`);
  console.log(`[inventory ${label}] grads=${JSON.stringify(facts.grads)} blurs=${JSON.stringify(facts.blurs)}`);
}

async function shot(page, name) {
  await page.screenshot({ path: path.join(SHOTS, name + '.png'), fullPage: name.startsWith('landing') });
  console.log(`[shot] ${name}`);
}

// ---- flow ----
const browser = await chromium.launch({ headless: true, executablePath: resolveChrome() });
const ctxA = await browser.newContext({ viewport: { width: 1280, height: 900 }, colorScheme: 'dark' });
const ctxB = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, colorScheme: 'dark' });
const A = await ctxA.newPage();
const B = await ctxB.newPage();
const errors = [];
A.on('pageerror', e => errors.push(`[A] ${e.message}`));
B.on('pageerror', e => errors.push(`[B] ${e.message}`));

try {
  // ---- landing (dark) ----
  await A.goto(URL, { waitUntil: 'networkidle' });
  await measure(A, 'LANDING (dark, desktop)', [
    ['h1', 'h1'],
    ['subtitle', 'header + section p'],
    ['cta-primary', { text: 'Send text' }],
    ['cta-secondary', { text: 'Receive text' }],
    ['kicker', { text: 'No account required', tag: 'p' }],
    ['header', 'header'],
  ]);
  await inventory(A, 'landing');
  await shot(A, 'landing-dark');

  // ---- light landing for reference ----
  const ctxL = await browser.newContext({ viewport: { width: 1280, height: 900 }, colorScheme: 'light' });
  const L = await ctxL.newPage();
  await L.goto(URL, { waitUntil: 'networkidle' });
  await shot(L, 'landing-light');
  await ctxL.close();

  // ---- room hub ----
  await A.getByRole('button', { name: 'Send text' }).first().click();
  await A.getByText('LIVE CODE').waitFor({ timeout: 10000 });
  const digits = await A.locator('span').filter({ hasText: /^\d$/ }).allTextContents();
  const code = digits.slice(-6).join('');
  await measure(A, 'ROOM HUB (creator waiting)', [
    ['heading', 'h1'],
    ['sub', { text: 'Open ShareText on the other device', tag: 'p' }],
    ['code-card', { text: 'Live Code', tag: 'p' }],
    ['digit', 'span.font-mono'],
    ['copy-code', { text: 'Copy Code' }],
    ['show-qr', { text: 'Show QR Code' }],
    ['share-nearby', { text: 'Share Nearby' }],
    ['device-name', 'button[title="Edit device name"]'],
  ]);
  await inventory(A, 'roomhub');
  await shot(A, 'roomhub');
  await A.getByRole('button', { name: 'Show QR Code' }).click();
  await sleep(600);
  await shot(A, 'roomhub-qr');
  await A.getByRole('button', { name: 'Hide QR Code' }).click().catch(() => {});
  await A.getByRole('button', { name: 'How this works' }).click();
  await sleep(500);
  await shot(A, 'roomhub-how');

  // ---- join screen ----
  await B.goto(URL, { waitUntil: 'networkidle' });
  await B.getByRole('button', { name: 'Receive text' }).first().click();
  await sleep(600);
  await measure(B, 'JOIN (mobile)', [
    ['heading', 'h1'],
    ['code-input', 'input[inputmode="numeric"]'],
    ['scan-qr', { text: 'Scan QR instead' }],
  ]);
  await shot(B, 'join-empty');

  // ---- join error state ----
  await B.locator('input[inputmode="numeric"]').fill('000000');
  await sleep(1200);
  await shot(B, 'join-error');

  // ---- join for real ----
  await B.locator('input[inputmode="numeric"]').fill(code);
  await B.getByText(/Paste or type|Your private clipboard|End session/).first().waitFor({ timeout: 25000 });
  await sleep(2000);
  await shot(A, 'chat-empty');

  // ---- text ----
  await A.locator('textarea').first().fill('Here\'s that PDF — check page 4');
  await A.getByRole('button', { name: 'Send' }).click();
  await sleep(2500);
  await measure(A, 'CHAT (text)', [
    ['header-title', 'h2'],
    ['conn-badge', { text: 'Connected' }],
    ['sent-bubble', 'div.bg-azure-600'],
    ['recv-bubble', 'div.dark\\:bg-surface-dark'],
    ['ts', 'span.text-\\[12px\\]'],
    ['input-bar', 'form textarea'],
    ['send-btn', 'button[aria-label="Send"]'],
  ]);
  await inventory(A, 'chat-text');
  await shot(A, 'chat-text');
  await shot(B, 'chat-text-mobile');

  // ---- image ----
  await B.getByRole('button', { name: 'Add attachment' }).click();
  await B.getByText('Photo', { exact: true }).click();
  await B.locator('input[type="file"][accept="image/*"]').setInputFiles(photoPath);
  await sleep(400);
  await B.getByRole('button', { name: 'Send' }).click();
  await sleep(3500);
  await shot(A, 'chat-image');
  await sleep(2000);

  // ---- file ----
  await B.getByRole('button', { name: 'Add attachment' }).click();
  await B.getByText('File', { exact: true }).click();
  await B.locator('input[type="file"]:not([accept])').setInputFiles(binPath);
  await sleep(400);
  await B.getByRole('button', { name: 'Send' }).click();
  await sleep(3500);
  await shot(A, 'chat-file');
  await sleep(2000);

  // ---- audio (staged via the generic File picker; menu is Photo/File only) ----
  await B.getByRole('button', { name: 'Add attachment' }).click();
  await B.getByText('File', { exact: true }).click();
  await B.locator('input[type="file"]:not([accept])').setInputFiles(wavPath);
  await sleep(400);
  await B.getByRole('button', { name: 'Send' }).click();
  await sleep(3500);
  await shot(A, 'chat-audio');
  await shot(A, 'chat-full');

  console.log('\n--- PAGE ERRORS ---');
  console.log(errors.length ? errors.join('\n') : '(none)');
} finally {
  await browser.close();
}
