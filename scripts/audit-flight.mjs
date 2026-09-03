import { launchBrowser, sleep } from './lib.mjs';
import fs from 'fs';
import crypto from 'crypto';
import path from 'path';

const OUT = '.audit-shots';
fs.mkdirSync(OUT, { recursive: true });
const browser = await launchBrowser();

async function pair() {
  const ctxA = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const A = await ctxA.newPage();
  const ctxB = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const B = await ctxB.newPage();
  const errs = [];
  A.on('pageerror', e => errs.push('A:' + String(e).slice(0, 100)));
  B.on('pageerror', e => errs.push('B:' + String(e).slice(0, 100)));
  await A.goto('http://localhost:3000', { waitUntil: 'networkidle' });
  await B.goto('http://localhost:3000', { waitUntil: 'networkidle' });
  await sleep(900);
  await A.getByRole('button', { name: 'Send', exact: true }).first().click();
  await A.waitForSelector('[aria-label="Pairing code"]', { timeout: 8000 });
  const code = await A.evaluate(() => {
    const g = document.querySelector('[aria-label="Pairing code"]');
    return [...g.querySelectorAll('span')].map(e => e.textContent.trim()).filter(d => /^\d$/.test(d)).join('');
  });
  await B.getByRole('button', { name: 'Receive', exact: true }).first().click();
  await sleep(300);
  await B.locator('input[inputmode="numeric"]:visible').fill(code);
  await B.waitForSelector('textarea', { timeout: 15000 });
  await A.waitForSelector('textarea', { timeout: 15000 });
  await sleep(500);
  return { ctxA, ctxB, A, B, errs };
}

const flightState = (page) => page.evaluate(() => {
  const chip = document.querySelector('[data-testid="transfer-flight"]');
  const line = document.querySelector('[data-testid="transfer-line"]');
  const body = document.body;
  return {
    chip: !!chip,
    line: !!line,
    chipText: chip?.textContent?.trim() ?? null,
    chipTransform: chip ? getComputedStyle(chip).transform : null,
    lineTransform: line ? getComputedStyle(line).transform : null,
    overflowX: body.scrollWidth - body.clientWidth,
    overflowY: body.scrollHeight - body.clientHeight,
  };
});

// ── 1. Desktop receive: B (mobile) sends 12MB → A (desktop) receives ──
console.log('== DESKTOP RECEIVE (12MB) ==');
{
  const { ctxA, ctxB, A, B, errs } = await pair();
  const p = path.join(OUT, 'flight12.bin');
  fs.writeFileSync(p, crypto.randomBytes(12 * 1024 * 1024));
  await B.locator('input[multiple]:not([accept])').setInputFiles(p);
  await B.waitForFunction(() => { const b = document.querySelector('button[data-testid="send"]'); return b && !b.disabled; }, null, { timeout: 5000 });
  const t0 = Date.now();
  await B.locator('button[data-testid="send"]').click();

  // wait for mid-flight (chip visible with a progress between 15-85%)
  let mid = null;
  for (let i = 0; i < 60; i++) {
    await sleep(300);
    mid = await flightState(A);
    if (mid.chip && mid.line) {
      const m = mid.chipTransform.match(/matrix\([^,]+, [^,]+, [^,]+, [^,]+, (-?[\d.]+), (-?[\d.]+)\)/);
      if (m) {
        const x = parseFloat(m[1]);
        const feedLeft = await A.evaluate(() => document.querySelector('.flex-1.overflow-y-auto')?.getBoundingClientRect().left ?? 0);
        const span = x - feedLeft;
        if (span > 80 && span < 900) { console.log(`mid-flight at t+${((Date.now() - t0) / 1000).toFixed(1)}s — chip x-offset ${span.toFixed(0)}px, text: ${mid.chipText}`); break; }
      }
    }
    if (Date.now() - t0 > 60000) break;
  }
  if (!mid?.chip) console.log('WARN: no flight chip observed on A');
  await A.screenshot({ path: path.join(OUT, 'flight-desktop-mid.png') });
  await B.screenshot({ path: path.join(OUT, 'flight-mobile-sender-mid.png') });
  console.log('mid state:', JSON.stringify(mid));

  // wait for completion + flight gone (3-arg waitForFunction: fn, arg, options)
  await A.waitForFunction(() => {
    const msgs = window.__sharetextDebug?.getMessages?.() ?? [];
    return msgs.some(m => m.attachment?.status === 'complete');
  }, null, { timeout: 120000 }).catch(() => {});
  await sleep(1200);
  const landed = await flightState(A);
  await A.screenshot({ path: path.join(OUT, 'flight-desktop-landed.png') });
  console.log('landed state:', JSON.stringify(landed), '| chip gone:', !landed.chip);
  const cardOk = await A.evaluate(() => {
    const sc = document.querySelector('[data-app-state="connected"] .flex-1.overflow-y-auto');
    return /Received/.test(sc?.innerText ?? '');
  });
  console.log('card shows Received:', cardOk);
  console.log('page errors:', errs.length ? errs : 'none');

  // ── cancel path: B sends another file, A cancels it mid-flight ──
  console.log('== CANCEL PATH ==');
  fs.writeFileSync(p, crypto.randomBytes(30 * 1024 * 1024));
  await B.locator('input[multiple]:not([accept])').setInputFiles(p);
  await B.waitForFunction(() => { const b = document.querySelector('button[data-testid="send"]'); return b && !b.disabled; }, null, { timeout: 5000 });
  await B.locator('button[data-testid="send"]').click();
  let sawCancelChip = false;
  for (let i = 0; i < 40; i++) {
    await sleep(250);
    const s = await flightState(A);
    if (s.chip) { sawCancelChip = true; }
    // click Cancel once the receiving card is present
    const cancelBtn = A.locator('[data-app-state="connected"] button:has-text("Cancel")').first();
    if (await cancelBtn.count()) { await cancelBtn.click({ timeout: 3000 }).catch(() => {}); break; }
  }
  await sleep(1000);
  const afterCancel = await flightState(A);
  const cancelState = await A.evaluate(() => {
    const msgs = window.__sharetextDebug?.getMessages?.() ?? [];
    const last = msgs[msgs.length - 1];
    return { status: last?.attachment?.status, chipGone: !document.querySelector('[data-testid="transfer-flight"]') };
  });
  console.log('cancel: sawChipDuringFlight=' + sawCancelChip, '| after:', JSON.stringify(cancelState), '| overflow:', afterCancel.overflowX, afterCancel.overflowY);

  // ── disconnect path: B sends, then B's tab dies mid-flight ──
  console.log('== DISCONNECT PATH ==');
  fs.writeFileSync(p, crypto.randomBytes(40 * 1024 * 1024));
  await B.locator('input[multiple]:not([accept])').setInputFiles(p);
  await B.waitForFunction(() => { const b = document.querySelector('button[data-testid="send"]'); return b && !b.disabled; }, null, { timeout: 5000 });
  await B.locator('button[data-testid="send"]').click();
  let sawKillChip = false;
  for (let i = 0; i < 40; i++) {
    await sleep(250);
    const s = await flightState(A);
    if (s.chip) sawKillChip = true;
  }
  await ctxB.close();
  await sleep(1500);
  const afterKill = await flightState(A);
  const killState = await A.evaluate(() => {
    const body = document.body.innerText;
    const msgs = window.__sharetextDebug?.getMessages?.() ?? [];
    const last = msgs[msgs.length - 1];
    return {
      chipGone: !document.querySelector('[data-testid="transfer-flight"]'),
      banner: body.includes('waiting to reconnect') || body.includes('Other device disconnected'),
      lastStatus: last?.attachment?.status,
    };
  });
  await A.screenshot({ path: path.join(OUT, 'flight-desktop-disconnect.png') });
  console.log('disconnect: sawChipDuringFlight=' + sawKillChip, '| after:', JSON.stringify(killState), '| overflow:', afterKill.overflowX, afterKill.overflowY);
  await ctxA.close();
}

// ── 2. Desktop sends (reverse direction) on desktop viewport ──
console.log('== DESKTOP SEND (A sends, B receives) ==');
{
  const { ctxA, ctxB, A, B, errs } = await pair();
  const p = path.join(OUT, 'flight-fwd.bin');
  fs.writeFileSync(p, crypto.randomBytes(8 * 1024 * 1024));
  await A.locator('input[multiple]:not([accept])').setInputFiles(p);
  await A.waitForFunction(() => { const b = document.querySelector('button[data-testid="send"]'); return b && !b.disabled; }, { timeout: 5000 });
  await A.locator('button[data-testid="send"]').click();
  let saw = false;
  for (let i = 0; i < 50; i++) {
    await sleep(250);
    const s = await flightState(A);
    if (s.chip) { saw = true; break; }
  }
  console.log('A send flight visible:', saw);
  await B.waitForFunction(() => {
    const msgs = window.__sharetextDebug?.getMessages?.() ?? [];
    return msgs.some(m => m.attachment?.status === 'complete');
  }, null, { timeout: 120000 }).catch(() => {});
  await sleep(800);
  const final = await flightState(A);
  await B.screenshot({ path: path.join(OUT, 'flight-mobile-landed.png') });
  console.log('final:', JSON.stringify({ chipGone: !final.chip, overflowX: final.overflowX, overflowY: final.overflowY }), '| errors:', errs.length ? errs : 'none');
  await ctxA.close(); await ctxB.close();
}

await browser.close();
console.log('DONE');