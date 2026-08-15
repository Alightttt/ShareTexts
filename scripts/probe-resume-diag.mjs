import { launchBrowser, URL, pairDevices } from './lib.mjs';
import fs from 'fs';
import os from 'os';
import path from 'path';

const FILE_SIZE = 32 * 1024 * 1024;
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

  const filePath = path.join(os.tmpdir(), 'sharetext-resume-diag.bin');
  const chunk = Buffer.alloc(1 * 1024 * 1024);
  for (let i = 0; i < chunk.length; i++) chunk[i] = i % 251;
  const fd = fs.openSync(filePath, 'w');
  for (let i = 0; i < FILE_SIZE / chunk.length; i++) fs.writeSync(fd, chunk);
  fs.closeSync(fd);

  await B.evaluate(() => {
    window.__probe = new Promise(res => {
      const obs = new MutationObserver(() => {
        const m = document.body.innerText.match(/Receiving… (\d+)%/);
        if (m && Number(m[1]) >= 1) { obs.disconnect(); res(Number(m[1])); }
      });
      obs.observe(document.body, { subtree: true, childList: true, characterData: true });
    });
  });

  await A.locator('input[type=file]').last().setInputFiles(filePath);
  await A.getByRole('button', { name: 'Send' }).first().click();
  const firstPct = await B.evaluate(() => window.__probe, { timeout: 60000 }).catch(() => null);
  console.log('first tick at', firstPct, '%');
  await B.evaluate(() => {
    const dbg = window.__sharetextDebug;
    dbg.peerManager()?.getDataChannel()?.close();
    dbg.requestReconnect();
  });

  // Wait 60s, then dump everything.
  await new Promise(r => setTimeout(r, 60000));
  const dump = async (page, name) => {
    const state = await page.evaluate(() => {
      const msgs = (window.__sharetextDebug?.getMessages?.() ?? []).map(m => m.attachment ? {
        sender: m.sender, status: m.attachment.status, progress: m.attachment.progress,
        name: m.attachment.name, size: m.attachment.size,
      } : null).filter(Boolean);
      const pm = window.__sharetextDebug?.peerManager?.();
      const pc = pm?.getPc?.();
      const dc = pm?.getDataChannel?.();
      const diag = (window.__sharetextDiag?.snapshot?.() ?? []).map(e => `${e.ok ? '+' : '-'} ${e.stage}${e.detail ? ' ' + e.detail : ''}`).slice(-25);
      const attachInfo = (window.__sharetextDebug?.getMessages?.() ?? []).map(m => m.attachment).find(Boolean);
      const partial = attachInfo ? (window.__sharetextDebug?.getPartialInfo?.(attachInfo.id) ?? null) : null;
      return {
        msgs,
        pcState: pc?.connectionState ?? null,
        dcState: dc?.readyState ?? null,
        hasPm: !!pm,
        attachId: attachInfo?.id ?? null,
        partial,
        diag,
      };
    });
    console.log(`\n===== ${name} =====`);
    console.log(JSON.stringify(state, null, 2));
  };
  await dump(A, 'A');
  await dump(B, 'B');
} finally {
  await browser.close();
}
