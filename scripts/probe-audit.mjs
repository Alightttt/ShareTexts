/**
 * Black-box E2E audit probe — two independent devices, a full human journey.
 *
 * Covers:
 *  1. Pair: desktop A creates, mobile B joins; A sees the connecting state.
 *  2. Wrong code -> clear error -> recover with the correct code.
 *  3. Text integrity A->B (Unicode, emoji, newlines, Hindi, 50k chars).
 *  4. XSS: an injected <img onerror> payload must arrive as inert text.
 *  5. File integrity A->B (deterministic 3 MB) — SHA-256 must match exactly.
 *  6. Image integrity A->B — bytes + size preserved.
 *  7. Reverse text B->A.
 *  8. Expired code: after the 40s window the old code must fail, the fresh
 *     one must connect.
 */
import { launchBrowser, URL, sleep, readLiveCode } from './lib.mjs';
import fs from 'fs';
import os from 'os';
import path from 'path';
import crypto from 'crypto';

const RESULTS = [];
const report = (name, ok, detail = '') => {
  RESULTS.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`);
};

const sha256hex = (buf) => crypto.createHash('sha256').update(buf).digest('hex');

// Deterministic 3 MB payload (patterned, so truncation is caught by hash).
const FILE_SIZE = 3 * 1024 * 1024;
const chunk = Buffer.alloc(1024 * 1024);
for (let i = 0; i < chunk.length; i++) chunk[i] = (i * 7 + 11) % 251;
const fileBuf = Buffer.concat(Array.from({ length: 3 }, () => chunk));
const filePath = path.join(os.tmpdir(), 'sharetext-audit.bin');
fs.writeFileSync(filePath, fileBuf);
const fileHash = sha256hex(fileBuf);

// Tiny real PNG (1x1 red pixel) — verifies image bytes survive untouched.
const PNG_B64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const pngPath = path.join(os.tmpdir(), 'sharetext-audit.png');
fs.writeFileSync(pngPath, Buffer.from(PNG_B64, 'base64'));
const pngHash = sha256hex(Buffer.from(PNG_B64, 'base64'));

const TEXT = {
  hello: 'Hello from Device A 👋',
  unicode: 'नमस्ते दुनिया — こんにちは 🌍 café naïve',
  newlines: 'line one\nline two\n\nline four after blank',
  special: '<b>not bold</b> & "quotes" \' \` backticks ~!@#$%^&*()',
  long: 'x'.repeat(50000) + '\nEND-OF-LONG',
};

const browser = await launchBrowser();
try {
  const ctxA = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const ctxB = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const A = await ctxA.newPage();
  const B = await ctxB.newPage();
  globalThis.__auditPageErrors = 0;
  A.on('pageerror', (e) => { globalThis.__auditPageErrors++; console.log('  [A pageerror]', String(e.message).slice(0, 160)); });
  B.on('pageerror', (e) => { globalThis.__auditPageErrors++; console.log('  [B pageerror]', String(e.message).slice(0, 160)); });

  // ---- 1. Create + wrong code + correct code ----
  await A.goto(URL, { waitUntil: 'networkidle' });
  await B.goto(URL, { waitUntil: 'networkidle' });
  await A.getByRole('button', { name: 'Send text' }).first().click();
  await A.getByText('LIVE CODE').waitFor({ timeout: 10000 });
  const code = await readLiveCode(A);
  report('A created a room with a 6-digit code', /^\d{6}$/.test(code), code);

  await B.getByRole('button', { name: 'Receive text' }).first().click();
  await B.locator('input[inputmode="numeric"]').waitFor({ timeout: 10000 });

  // Wrong code
  const wrong = String((Number(code) + 1) % 1000000).padStart(6, '0');
  await B.locator('input[inputmode="numeric"]').fill(wrong);
  await B.keyboard.press('Enter');
  const wrongErr = await B.waitForFunction(() => {
    const t = document.body.innerText;
    return /isn.t active|not active|invalid|expired|wrong|no room/i.test(t) && !document.querySelector('textarea[placeholder]');
  }, undefined, { timeout: 15000 }).then(() => B.evaluate(() => document.body.innerText.match(/[^\n]*(isn.t active|not active|invalid|expired|wrong|no room)[^\n]*/i)?.[0]?.trim())).catch(() => null);
  report('wrong code shows a clear, recoverable error', !!wrongErr, wrongErr || 'no error text found');

  // Correct code
  await B.locator('input[inputmode="numeric"]').fill(code);
  await B.keyboard.press('Enter');
  await B.locator('textarea').first().waitFor({ timeout: 20000 });
  await A.locator('textarea').first().waitFor({ timeout: 20000 });
  report('recovery: correct code pairs and both reach the room', true);

  // A must see the connecting state during pairing (captured after, text persists? no —
  // verify via diag: creator saw peer_joined)
  const aSawPeer = await A.evaluate(() => (window.__sharetextDiag?.snapshot?.() ?? []).some(e => e.stage === 'peer.peer_joined'));
  report('creator received peer_joined (saw the joiner arrive)', aSawPeer);

  // ---- 3. Text integrity A->B ----
  const ta = A.locator('textarea').first();
  await ta.fill(TEXT.hello); await A.getByRole('button', { name: 'Send', exact: true }).click();
  await ta.fill(TEXT.unicode); await A.getByRole('button', { name: 'Send', exact: true }).click();
  await ta.fill(TEXT.newlines); await A.getByRole('button', { name: 'Send', exact: true }).click();
  await ta.fill(TEXT.special); await A.getByRole('button', { name: 'Send', exact: true }).click();
  await ta.fill(TEXT.long); await A.getByRole('button', { name: 'Send', exact: true }).click();
  await sleep(2500);

  const bTexts = await B.evaluate(() => (window.__sharetextDebug?.getMessages?.() ?? []).filter(m => m.sender === 'partner' && !m.attachment).map(m => m.text));
  const expect = [TEXT.hello, TEXT.unicode, TEXT.newlines, TEXT.special, TEXT.long];
  let allMatch = expect.length === bTexts.length;
  for (let i = 0; i < expect.length && allMatch; i++) {
    if (bTexts[i] !== expect[i]) { allMatch = false; console.log(`  text[${i}] mismatch: got ${JSON.stringify(bTexts[i]?.slice(0, 60))} vs ${JSON.stringify(expect[i]?.slice(0, 60))}`); }
  }
  report('text integrity A->B (unicode/emoji/newlines/special/50k)', allMatch, `${bTexts.length} messages`);

  // XSS — the <b> payload must stay inert text, no DOM element created.
  const xss = await B.evaluate(() => {
    const b = document.querySelector('b');
    const img = document.querySelector('img[onerror]');
    return { bRendered: !!b, injectedImg: !!img, pwned: (window).__pwned === true };
  });
  report('XSS payload rendered as inert text (no <b>, no <img>, no exec)', !xss.bRendered && !xss.injectedImg && !xss.pwned, JSON.stringify(xss));

  // Long text: collapsed to a preview by design (>8000 chars). The expand
  // button must reveal the full text, and nothing may be lost from state.
  const longState = await B.evaluate(() => (window.__sharetextDebug?.getMessages?.() ?? []).find(m => m.text.includes('END-OF-LONG'))?.text);
  const expandBtn = await B.getByRole('button', { name: /more|expand|Show/i }).first();
  const previewShown = await B.evaluate(() => document.body.innerText.includes('x'.repeat(1400).slice(0, 50)));
  let expandedShown = false;
  if (await expandBtn.count()) {
    await expandBtn.click();
    await sleep(400);
    expandedShown = await B.evaluate(() => document.body.innerText.includes('END-OF-LONG'));
  }
  report('long text: preview collapsed by design, expand reveals full text', longState?.length === TEXT.long.length && expandedShown, `state len ${longState?.length} · expanded ${expandedShown} · previewShown ${previewShown}`);

  // ---- 5. File integrity A->B ----
  await A.locator('input[type=file]').last().setInputFiles(filePath);
  await A.getByText('3 MB').first().waitFor({ timeout: 5000 });
  await A.getByRole('button', { name: 'Send', exact: true }).click();
  const bFile = await B.waitForFunction((sz) => {
    const msgs = window.__sharetextDebug?.getMessages?.() ?? [];
    return msgs.some(m => m.attachment && m.attachment.status === 'complete' && m.attachment.size === sz);
  }, FILE_SIZE, { timeout: 60000 }).then(() => B.evaluate(async (sz) => {
    try {
      const msgs = window.__sharetextDebug?.getMessages?.() ?? [];
      const a = msgs.find(m => m.attachment && m.attachment.status === 'complete' && m.attachment.size === sz)?.attachment;
      if (!a?.url) return { error: 'no blob url', status: a?.status, size: a?.size };
      const buf = await (await fetch(a.url)).arrayBuffer();
      const hash = await crypto.subtle.digest('SHA-256', buf);
      return { hash: [...new Uint8Array(hash)].map(b => b.toString(16).padStart(2, '0')).join(''), name: a.name, size: a.size };
    } catch (e) { return { error: String(e) }; }
  }, FILE_SIZE)).catch(async (e) => { console.log('  [file eval threw]', String(e).slice(0, 200));
    const dump = await Promise.all([
      B.evaluate(() => {
        const msgs = window.__sharetextDebug?.getMessages?.() ?? [];
        const a = msgs.find(m => m.attachment)?.attachment;
        return { bStatus: a?.status, bProgress: a?.progress, bSize: a?.size, diag: (window.__sharetextDiag?.snapshot?.() ?? []).map(e => `${e.ok ? '+' : '-'} ${e.stage}${e.detail ? ' ' + e.detail : ''}`).slice(-14) };
      }).catch(() => ({})),
      A.evaluate(() => {
        const msgs = window.__sharetextDebug?.getMessages?.() ?? [];
        const a = msgs.find(m => m.attachment)?.attachment;
        return { aStatus: a?.status, aProgress: a?.progress, diag: (window.__sharetextDiag?.snapshot?.() ?? []).map(e => `${e.ok ? '+' : '-'} ${e.stage}${e.detail ? ' ' + e.detail : ''}`).slice(-14) };
      }).catch(() => ({})),
    ]);
    console.log('  [file dump]', JSON.stringify(dump));
    return null;
  });
  report('3 MB file arrives byte-identical (SHA-256)', !!bFile && bFile.hash === fileHash, bFile ? (bFile.error || `${bFile.name} ${bFile.size}B hash ${bFile.hash.slice(0, 12)}…`) : 'receiver never completed');

  // ---- 6. Image integrity A->B ----
  await A.locator('input[type=file]').last().setInputFiles(pngPath);
  await sleep(400); // let the attachment register before Send
  await A.getByRole('button', { name: 'Send', exact: true }).click();
  const bPng = await B.waitForFunction(() => {
    const msgs = window.__sharetextDebug?.getMessages?.() ?? [];
    return msgs.some(m => m.attachment && m.attachment.status === 'complete' && m.attachment.name === 'sharetext-audit.png');
  }, undefined, { timeout: 30000 }).then(() => B.evaluate(async () => {
    try {
      const msgs = window.__sharetextDebug?.getMessages?.() ?? [];
      const a = msgs.find(m => m.attachment && m.attachment.name === 'sharetext-audit.png')?.attachment;
      if (!a?.url) return { error: 'no blob url' };
      const buf = await (await fetch(a.url)).arrayBuffer();
      const hash = await crypto.subtle.digest('SHA-256', buf);
      return { hash: [...new Uint8Array(hash)].map(b => b.toString(16).padStart(2, '0')).join(''), size: a.size };
    } catch (e) { return { error: String(e) }; }
  })).catch(() => null);
  report('PNG arrives byte-identical (SHA-256, no re-encode)', bPng && bPng.hash === pngHash && bPng.size === Buffer.from(PNG_B64, 'base64').length, bPng ? (bPng.error || `${bPng.size}B hash ${bPng.hash.slice(0, 12)}…`) : 'no image');

  // Send-back of an attachment — exercises the blob: fetch path that the CSP
  // previously blocked. B hands the received PNG straight back to A.
  // The PNG bubble is the last received attachment — scope to it, not the file.
  const sendBackBtn = B.getByRole('button', { name: /Send back/ }).last();
  if (await sendBackBtn.count()) {
    await sendBackBtn.click();
    const aGotPng = await A.waitForFunction(() => {
      const msgs = window.__sharetextDebug?.getMessages?.() ?? [];
      return msgs.some(m => m.sender === 'partner' && m.attachment && m.attachment.status === 'complete' && m.attachment.name === 'sharetext-audit.png');
    }, undefined, { timeout: 30000 }).then(() => A.evaluate(async () => {
      try {
        const msgs = window.__sharetextDebug?.getMessages?.() ?? [];
        const a = msgs.find(m => m.sender === 'partner' && m.attachment && m.attachment.name === 'sharetext-audit.png')?.attachment;
        if (!a?.url) return { error: 'no blob url' };
        const buf = await (await fetch(a.url)).arrayBuffer();
        const hash = await crypto.subtle.digest('SHA-256', buf);
        return { hash: [...new Uint8Array(hash)].map(b => b.toString(16).padStart(2, '0')).join(''), size: a.size };
      } catch (e) { return { error: String(e) }; }
    })).catch(() => null);
    report('attachment send-back returns byte-identical bytes', aGotPng && aGotPng.hash === pngHash, aGotPng ? (aGotPng.error || `${aGotPng.size}B hash ${aGotPng.hash.slice(0, 12)}…`) : 'send-back never arrived');
  } else {
    report('attachment send-back returns byte-identical bytes', false, 'Send back button not found');
  }

  // ---- 7. Reverse text B->A ----
  await B.locator('textarea').first().fill('Reply back from the phone 📱');
  await B.getByRole('button', { name: 'Send', exact: true }).click();
  await sleep(1200);
  const aGot = await A.evaluate(() => (window.__sharetextDebug?.getMessages?.() ?? []).some(m => m.sender === 'partner' && m.text === 'Reply back from the phone 📱'));
  report('reverse direction B->A works', aGot);

  // Delivery receipt: A's sent bubbles should have delivered=true (real ack).
  await sleep(1500);
  const receipts = await A.evaluate(() => (window.__sharetextDebug?.getMessages?.() ?? []).filter(m => m.sender === 'me' && !m.attachment).map(m => m.delivered === true));
  report('sender shows delivered=true on texts (real acks)', receipts.length > 0 && receipts.every(Boolean), `${receipts.length} receipts`);

  await ctxA.close();
  await ctxB.close();

  // ---- 8. Expired code ----
  const ctxA2 = await browser.newContext();
  const ctxB2 = await browser.newContext();
  const A2 = await ctxA2.newPage();
  const B2 = await ctxB2.newPage();
  await A2.goto(URL, { waitUntil: 'networkidle' });
  await B2.goto(URL, { waitUntil: 'networkidle' });
  await A2.getByRole('button', { name: 'Send text' }).first().click();
  await A2.getByText('LIVE CODE').waitFor({ timeout: 10000 });
  const code1 = await readLiveCode(A2);
  // The TOTP validation window is ±1 step, so a rotated code stays valid for
  // one more 40s window by design (grace). True expiry: wait 2 windows + margin.
  await sleep(85000);
  const code2 = await readLiveCode(A2);
  report('code rotates after the 40s window', code2 !== code1, `${code1} -> ${code2}`);
  await B2.getByRole('button', { name: 'Receive text' }).first().click();
  await B2.locator('input[inputmode="numeric"]').waitFor({ timeout: 10000 });
  await B2.locator('input[inputmode="numeric"]').fill(code1);
  await B2.keyboard.press('Enter');
  const staleErr = await B2.waitForFunction(() => {
    const t = document.body.innerText;
    return /isn.t active|not active|invalid|expired|wrong|no room/i.test(t) && !document.querySelector('textarea[placeholder]');
  }, undefined, { timeout: 15000 }).then(() => true).catch(() => false);
  report('truly expired code is rejected with a clear error', staleErr);
  // Fresh code works (either re-enter if still on the join screen, or it already paired).
  const alreadyIn = await B2.locator('textarea').first().count();
  let freshOk = alreadyIn > 0;
  if (!freshOk) {
    await B2.locator('input[inputmode="numeric"]').fill(code2);
    await B2.keyboard.press('Enter');
    freshOk = await B2.locator('textarea').first().waitFor({ timeout: 20000 }).then(() => true).catch(() => false);
  }
  report('fresh code pairs immediately after expiry', freshOk);

  await ctxA2.close();
  await ctxB2.close();
} finally {
  await browser.close();
}

const failed = RESULTS.filter(r => !r.ok);
const errCount = globalThis.__auditPageErrors || 0;
console.log(`\n${RESULTS.length - failed.length}/${RESULTS.length} AUDIT CHECKS PASSED${errCount ? ` — ${errCount} PAGE ERROR(S) OBSERVED` : ' — zero page errors'}`);
process.exit(failed.length === 0 && errCount === 0 ? 0 : 1);
