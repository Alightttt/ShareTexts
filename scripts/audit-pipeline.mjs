import { launchBrowser, sleep } from './lib.mjs';
import fs from 'fs';
import crypto from 'crypto';
const browser = await launchBrowser();
const ctxA = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const A = await ctxA.newPage();
const ctxB = await browser.newContext({ viewport: { width: 390, height: 844 } });
const B = await ctxB.newPage();
const errs = [];
A.on('pageerror', e => errs.push('A:' + e.message.slice(0, 120)));
B.on('pageerror', e => errs.push('B:' + e.message.slice(0, 120)));
await A.goto('http://localhost:3000', { waitUntil: 'networkidle' });
await B.goto('http://localhost:3000', { waitUntil: 'networkidle' });
await sleep(900);
await A.getByRole('button', { name: 'Send', exact: true }).first().click();
await A.waitForSelector('[aria-label="Pairing code"]', { timeout: 8000 });
const code = await A.evaluate(() => { const g = document.querySelector('[aria-label="Pairing code"]'); return [...g.querySelectorAll('span')].map(e => e.textContent.trim()).filter(d => /^\d$/.test(d)).join(''); });
await B.getByRole('button', { name: 'Receive', exact: true }).first().click();
await sleep(300);
await B.locator('input[inputmode="numeric"]:visible').fill(code);
await B.waitForSelector('textarea', { timeout: 15000 });
await A.waitForSelector('textarea', { timeout: 15000 });
await sleep(500);

const filePath = '.audit-shots/p20.bin';
fs.writeFileSync(filePath, crypto.randomBytes(20 * 1024 * 1024));
const expectedSha = crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
console.log('expected sha256:', expectedSha.slice(0, 16) + '…');

async function sendAndVerify(mb, label, throttleRate) {
  const p = `.audit-shots/t${mb}.bin`;
  fs.writeFileSync(p, crypto.randomBytes(mb * 1024 * 1024));
  const expected = crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
  let cdp = null;
  if (throttleRate) {
    cdp = await ctxB.newCDPSession(B);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: throttleRate });
  }
  await B.locator('input[multiple]:not([accept])').setInputFiles(p);
  await B.waitForFunction(() => { const b = document.querySelector('button[data-testid="send"]'); return b && !b.disabled; }, { timeout: 5000 });
  const t0 = Date.now();
  const gaps = [];
  let last = null, lastT = t0;
  const iv = setInterval(async () => {
    const s = await A.evaluate(() => {
      const sc = document.querySelector('[data-app-state="connected"] .flex-1.overflow-y-auto');
      return sc ? sc.innerText.match(/Receiving… (\d+) (KB|MB) of/) : null;
    }).catch(() => null);
    if (s && s[2]) {
      const val = s[2] === 'MB' ? +s[1] * 1024 * 1024 : +s[1] * 1024;
      const now = Date.now();
      if (last !== null) gaps.push(now - lastT - 200);
      last = val; lastT = now;
    }
  }, 200);
  await B.locator('button[data-testid="send"]').click();
  await A.waitForFunction(() => {
    const msgs = window.__sharetextDebug?.getMessages?.() ?? [];
    const last = msgs[msgs.length - 1];
    return last?.attachment?.status === 'complete';
  }, { timeout: 90000 }).catch(() => {});
  clearInterval(iv);
  const ms = Date.now() - t0;
  // independent integrity check: hash the received blob in-page
  const gotSha = await A.evaluate(async () => {
    const msgs = window.__sharetextDebug?.getMessages?.() ?? [];
    const a = [...msgs].reverse().find(m => m.attachment && m.attachment.url);
    if (!a?.attachment?.url) return 'NO-URL';
    const blob = await (await fetch(a.attachment.url)).blob();
    const buf = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer());
    return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
  });
  const verified = gotSha === expected;
  if (cdp) await cdp.detach().catch(() => {});
  console.log(`${label}: ${mb}MB in ${(ms / 1000).toFixed(1)}s = ${(mb / (ms / 1000)).toFixed(1)} MB/s | sha match: ${verified} | stall-gaps>1s: ${gaps.filter(g => g > 1000).length}`);
  return { ms, verified };
}

await sendAndVerify(20, 'FAST', null);
await sendAndVerify(20, 'THROTTLED', 8);
console.log('page errors:', errs.length ? errs : 'none');

// ── interruption: B sends 60MB, dies mid-flight; A must stay in the room ──
const big = '.audit-shots/int.bin';
fs.writeFileSync(big, crypto.randomBytes(60 * 1024 * 1024));
await (await ctxB.newCDPSession(B)).send('Emulation.setCPUThrottlingRate', { rate: 1 }).catch(() => {});
await B.locator('input[multiple]:not([accept])').setInputFiles(big);
await B.waitForFunction(() => { const b = document.querySelector('button[data-testid="send"]'); return b && !b.disabled; }, { timeout: 5000 });
await B.locator('button[data-testid="send"]').click();
await sleep(1500);
await ctxB.close();
await sleep(3000);
const post = await A.evaluate(() => {
  const body = document.body.innerText;
  const sc = document.querySelector('[data-app-state="connected"] .flex-1.overflow-y-auto');
  return {
    roomMounted: !!sc,
    banner: body.includes('waiting to reconnect') || body.includes('Other device disconnected'),
    interruptedLabel: body.includes('reconnect to continue') || body.includes('interrupted'),
    reconnectBtn: !!document.querySelector('[data-testid="reconnect"]'),
    snippet: (sc?.innerText || body).replace(/\n+/g, ' | ').slice(-200),
  };
});
console.log('AFTER INTERRUPT:', JSON.stringify(post));
await browser.close();
