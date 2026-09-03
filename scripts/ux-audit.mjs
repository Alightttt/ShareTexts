// UX audit: real two-device flow against the local full server.
// Usage: node scripts/ux-audit.mjs [viewportLabel]
import { launchBrowser, sleep } from './lib.mjs';
import fs from 'fs';

const URL = process.env.URL || 'http://localhost:3210';
const SHOTS = '.audit-shots';
fs.mkdirSync(SHOTS, { recursive: true });

const viewports = {
  desktop: { w: 1440, h: 900, light: true },
  mobile: { w: 390, h: 844, light: true },
  dark: { w: 1280, h: 800, light: false },
};
const label = process.argv[2] || 'desktop';
const vp = viewports[label] || viewports.desktop;

const browser = await launchBrowser();
const failures = [];

function fail(what) { failures.push(what); console.log(`❌ ${what}`); }

// ── Device A: creator (large) ────────────────────────────────────────────
const ctxA = await browser.newContext({ viewport: { width: vp.w, height: vp.h }, colorScheme: vp.light ? 'light' : 'dark' });
const A = await ctxA.newPage();
const errsA = [];
A.on('pageerror', e => errsA.push('A:' + e.message));
A.on('console', m => { if (m.type() === 'error') errsA.push('A-console:' + m.text()); });
await A.goto(URL, { waitUntil: 'networkidle' });
await sleep(600);

// ── Device B: joiner (phone) ─────────────────────────────────────────────
const ctxB = await browser.newContext({ viewport: { width: 390, height: 844 }, colorScheme: 'light' });
const B = await ctxB.newPage();
const errsB = [];
B.on('pageerror', e => errsB.push('B:' + e.message));
B.on('console', m => { if (m.type() === 'error') errsB.push('B-console:' + m.text()); });
await B.goto(URL, { waitUntil: 'networkidle' });
await sleep(500);

const overflow = (page) => page.evaluate(() => ({
  x: document.documentElement.scrollWidth - document.documentElement.clientWidth,
  y: document.documentElement.scrollHeight - document.documentElement.clientHeight,
}));

// ── Idle state ────────────────────────────────────────────────────────────
let o = await overflow(A);
if (o.x > 0) fail(`[${label}] idle horizontal overflow ${o.x}px`);
await A.waitForSelector('h1', { timeout: 10000 }).catch(() => fail(`[${label}] h1 never appeared`));
console.log(`[${label}] idle overflow=${o.x} h1="${(await A.locator('h1').first().textContent().catch(() => ''))?.trim()}"`);
await A.screenshot({ path: `${SHOTS}/ux-${label}-idle.png` });

// ── Pair ──────────────────────────────────────────────────────────────────
await A.getByRole('button', { name: 'Send' }).first().click();
await A.waitForSelector('text=Open ShareText on the other device', { timeout: 8000 });
await sleep(300);
o = await overflow(A);
if (o.x > 0) fail(`[${label}] connect screen horizontal overflow ${o.x}px`);
console.log(`[${label}] connect overflow=${o.x}`);
await A.screenshot({ path: `${SHOTS}/ux-${label}-connect.png` });

// read the 6-digit code from the pairing code group
const code = await A.evaluate(() => {
  const group = document.querySelector('[role="group"][aria-label="Pairing code"]');
  if (!group) return '';
  return [...group.querySelectorAll('span')].map(el => el.textContent.trim()).filter(d => /^\d$/.test(d)).join('');
});
if (!/^\d{6}$/.test(code)) fail(`[${label}] could not read 6-digit code (got "${code}")`);

await B.getByRole('button', { name: 'Receive' }).first().click();
await sleep(250);
await B.locator('input[inputmode="numeric"]:visible').fill(code);
console.log(`[${label}] code entered: ${code}`);
await B.waitForSelector('textarea', { timeout: 15000 }).catch(async () => {
  fail(`[${label}] B did not reach room in 15s`);
  console.log('B body:', (await B.evaluate(() => document.body.innerText.slice(0, 400))).replace(/\n+/g, ' | '));
});
await A.waitForSelector('textarea', { timeout: 15000 }).catch(() => console.log(`[${label}] WARN A did not reach room in 15s`));
await sleep(1200);
await A.screenshot({ path: `${SHOTS}/ux-${label}-connected-A.png` });
await B.screenshot({ path: `${SHOTS}/ux-${label}-connected-B.png` });
o = await overflow(A);
if (o.x > 0) fail(`[${label}] connected A horizontal overflow ${o.x}px`);
o = await overflow(B);
if (o.x > 0) fail(`[${label}] connected B horizontal overflow ${o.x}px`);
console.log(`[${label}] both connected; A overflow=${o.x}`);

// ── Send text ─────────────────────────────────────────────────────────────
const TA = 'Hello from the desktop device — Unicode ✅ हिन्दी 😀';
await A.locator('textarea').first().fill(TA);
await A.getByRole('button', { name: 'Send' }).last().click();
await sleep(900);
const got = await B.evaluate((t) => document.body.innerText.includes(t), TA);
if (!got) fail(`[${label}] B did not receive text message`);
await sleep(500);
await A.screenshot({ path: `${SHOTS}/ux-${label}-text-sent.png` });
await B.screenshot({ path: `${SHOTS}/ux-${label}-text-received.png` });

// ── Send an image ─────────────────────────────────────────────────────────
const pngPath = `${SHOTS}/ux-${label}-test-image.png`;
{
  // 1x1 lavender PNG
  const b64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
  fs.writeFileSync(pngPath, Buffer.from(b64, 'base64'));
}
await A.locator('input[accept="image/*"]').first().setInputFiles(pngPath);
await sleep(400);
await A.getByRole('button', { name: 'Send' }).last().click();
await B.waitForFunction(() => {
  const imgs = [...document.querySelectorAll('img')];
  return imgs.some(i => i.src.startsWith('blob:') && i.complete && i.naturalWidth > 0);
}, { timeout: 10000 }).catch(() => fail(`[${label}] B did not render received image`));
await sleep(600);
await B.screenshot({ path: `${SHOTS}/ux-${label}-image-received.png` });

// ── Send a file ───────────────────────────────────────────────────────────
const filePath = `${SHOTS}/ux-${label}-test-file.bin`;
fs.writeFileSync(filePath, Buffer.alloc(2 * 1024 * 1024, 7));
await A.locator('input[multiple]:not([accept])').setInputFiles(filePath);
await sleep(400);
await A.getByRole('button', { name: 'Send' }).last().click();
const fileDone = await B.waitForFunction(() => {
  return [...document.querySelectorAll('*')].some(el => el.textContent.includes('ux-') && el.textContent.includes('test-file.bin') && el.textContent.includes('MB'));
}, { timeout: 15000 }).catch(() => null);
if (!fileDone) fail(`[${label}] B did not receive file card`);
await sleep(800);
await B.screenshot({ path: `${SHOTS}/ux-${label}-file-received.png` });
await A.screenshot({ path: `${SHOTS}/ux-${label}-file-sent.png` });

// ── Composer + attachment menu ────────────────────────────────────────────
await A.getByRole('button', { name: 'Add attachment' }).click();
await sleep(400);
await A.screenshot({ path: `${SHOTS}/ux-${label}-attach-menu.png` });
await A.keyboard.press('Escape'); // close — tests Escape handling
await sleep(200);

// ── Disconnect cleanly ────────────────────────────────────────────────────
await A.getByRole('button', { name: 'Disconnect' }).last().click().catch(async () => {
  await A.getByRole('button', { name: 'Disconnect' }).click();
});
await sleep(600);

// report
const finalA = await A.evaluate(() => ({ x: document.documentElement.scrollWidth - document.documentElement.clientWidth, msgs: (window.__sharetextDebug?.getMessages?.() ?? []).length }));
console.log(`[${label}] final A overflow=${finalA.x} messages=${finalA.msgs}`);
if (errsA.length) { console.log('A page errors:'); errsA.slice(0, 8).forEach(e => console.log('  ', e)); if (errsA.length > 4) fail(`[${label}] A console/page errors: ${errsA.length}`); }
if (errsB.length) { console.log('B page errors:'); errsB.slice(0, 8).forEach(e => console.log('  ', e)); if (errsB.length > 4) fail(`[${label}] B console/page errors: ${errsB.length}`); }

await ctxB.close();
await ctxA.close();
await browser.close();
console.log(failures.length ? `FAILURES (${failures.length})` : 'ALL CLEAN ✅');
process.exit(failures.length ? 1 : 0);