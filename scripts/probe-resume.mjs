/**
 * Probe: resumable transfers.
 *
 * 1. Pair two devices (A = sender, B = receiver).
 * 2. A sends a large file.
 * 3. The instant B's first progress tick lands, B's data channel is closed
 *    (a WebRTC drop) and B immediately reconnects — the real-world blip cycle.
 * 4. Assert: both sides show "Connection interrupted", the transfer completes,
 *    and B received the full byte count (dedupe + resume from the confirmed
 *    position, never restarting from zero).
 *
 * Requires the dev-only debug hook (window.__sharetextDebug) — runs against
 * the local dev servers.
 */
import { launchBrowser, URL, pairDevices, sleep } from './lib.mjs';
import fs from 'fs';
import os from 'os';
import path from 'path';

const FILE_SIZE = 8 * 1024 * 1024; // 8 MB — big enough to interrupt mid-flight
const RESULTS = [];

function report(name, ok, detail = '') {
  RESULTS.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`);
}

const browser = await launchBrowser();

try {
  const ctx = await browser.newContext();
  const A = await ctx.newPage();
  const B = await ctx.newPage();
  A.on('pageerror', e => console.log('  [A pageerror]', e.message));
  B.on('pageerror', e => console.log('  [B pageerror]', e.message));

  await A.goto(URL, { waitUntil: 'networkidle' });
  await B.goto(URL, { waitUntil: 'networkidle' });
  await pairDevices(A, B);
  report('pair', true);

  // Build the payload file.
  const filePath = path.join(os.tmpdir(), 'sharetext-resume-probe.bin');
  const chunk = Buffer.alloc(1 * 1024 * 1024);
  for (let i = 0; i < chunk.length; i++) chunk[i] = i % 251;
  const fd = fs.openSync(filePath, 'w');
  for (let i = 0; i < FILE_SIZE / chunk.length; i++) fs.writeSync(fd, chunk);
  fs.closeSync(fd);

  // Arm a page-side observer that resolves at the FIRST progress tick —
  // deterministic interruption, no polling race.
  await B.evaluate(() => {
    window.__probe = new Promise(res => {
      const obs = new MutationObserver(() => {
        const m = document.body.innerText.match(/Receiving… (\d+)%/);
        if (m && Number(m[1]) >= 1) {
          obs.disconnect();
          res(Number(m[1]));
        }
      });
      obs.observe(document.body, { subtree: true, childList: true, characterData: true });
    });
  });

  // A attaches the file and sends.
  await A.locator('input[type=file]').last().setInputFiles(filePath);
  await A.getByText('8 MB').first().waitFor({ timeout: 5000 });
  await A.getByRole('button', { name: 'Send' }).first().click();

  // Wait for the first progress tick, then cut the channel + reconnect B.
  const firstPct = await B.evaluate(() => window.__probe, { timeout: 60000 }).catch(() => null);
  report('mid-flight progress observed', firstPct !== null, firstPct !== null ? `first tick at ${firstPct}%` : 'transfer never showed progress');

  if (firstPct !== null) {
    await B.evaluate(() => {
      const dbg = window.__sharetextDebug;
      // Close the WebRTC data channel on B — the peer's channel closes too.
      dbg.peerManager()?.getDataChannel()?.close();
      // Rejoin the room: server tells A to re-offer, channel reopens, resume.
      dbg.requestReconnect();
    });
    report('channel cut + reconnect issued', true);
  }

  // Interrupted state must appear on both devices.
  const interruptedBoth = await Promise.all([
    A.waitForFunction(() => (window.__sharetextDiag?.snapshot?.() ?? []).some(e => e.stage === 'transfer.interrupted'), undefined, { timeout: 20000 }).then(() => true).catch(() => false),
    B.waitForFunction(() => (window.__sharetextDiag?.snapshot?.() ?? []).some(e => e.stage === 'transfer.interrupted'), undefined, { timeout: 20000 }).then(() => true).catch(() => false),
  ]);
  report('interrupted state on both devices', interruptedBoth[0] && interruptedBoth[1], `A:${interruptedBoth[0]} B:${interruptedBoth[1]}`);

  // Give resume / relay time to finish.
  const senderDone = await A.waitForFunction((expectedSize) => {
    const msgs = window.__sharetextDebug?.getMessages?.() ?? [];
    return msgs.some(m => m.attachment?.status === 'complete' && m.attachment?.size === expectedSize);
  }, FILE_SIZE, { timeout: 180000 }).then(() => true).catch(() => false);
  report('sender transfer completed', senderDone, senderDone ? '' : 'never reached complete');
  if (!senderDone) {
    const Adump = await A.evaluate(() => {
      const msgs = (window.__sharetextDebug?.getMessages?.() ?? []).map(m => m.attachment ? { sender: m.sender, status: m.attachment.status, progress: m.attachment.progress, size: m.attachment.size } : null).filter(Boolean);
      const diag = (window.__sharetextDiag?.snapshot?.() ?? []).map(e => `${e.ok ? '+' : '-'} ${e.stage}${e.detail ? ' ' + e.detail : ''}`).slice(-12);
      const pm = window.__sharetextDebug?.peerManager?.();
      return { msgs, dcState: pm?.getDataChannel?.()?.readyState ?? null, diag };
    });
    console.log('  [A dump]', JSON.stringify(Adump));
  }

  const Bdone = await B.waitForFunction((expectedSize) => {
    const msgs = window.__sharetextDebug?.getMessages?.() ?? [];
    const a = msgs.find(m => m.attachment)?.attachment;
    return !!a && a.status === 'complete' && a.size === expectedSize;
  }, FILE_SIZE, { timeout: 120000 }).then(() => true).catch(() => false);
  const Bstate = await B.evaluate(() => {
    const msgs = window.__sharetextDebug?.getMessages?.() ?? [];
    const a = msgs.find(m => m.attachment)?.attachment;
    return { status: a?.status, size: a?.size, progress: a?.progress };
  });
  report('receiver completed with intact bytes', Bdone, JSON.stringify(Bstate));

  const Bdiag = await B.evaluate(() => (window.__sharetextDiag?.snapshot?.() ?? []).map(e => e.stage));
  const Adiag = await A.evaluate(() => (window.__sharetextDiag?.snapshot?.() ?? []).map(e => e.stage));
  const usedResume = Bdiag.includes('transfer.resuming') || Adiag.includes('transfer.resuming');
  report('resume path exercised', usedResume, usedResume ? 'resume from confirmed position' : 'completed via continuous fallback (still interrupted → complete)');

  await A.getByRole('button', { name: 'End session' }).first().click({ timeout: 5000 }).catch(() => {});
} finally {
  await browser.close();
}

const failed = RESULTS.filter(r => !r.ok);
console.log(failed.length === 0 ? '\nALL RESUME PROBES PASSED' : `\n${failed.length} RESUME PROBE(S) FAILED`);
process.exit(failed.length === 0 ? 0 : 1);
