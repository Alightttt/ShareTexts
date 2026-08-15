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
  await A.goto(URL, { waitUntil: 'networkidle' });
  await B.goto(URL, { waitUntil: 'networkidle' });
  await pairDevices(A, B);

  const filePath = path.join(os.tmpdir(), 'sharetext-throughput.bin');
  const chunk = Buffer.alloc(4 * 1024 * 1024);
  for (let i = 0; i < chunk.length; i++) chunk[i] = i % 251;
  const fd = fs.openSync(filePath, 'w');
  for (let i = 0; i < FILE_SIZE / chunk.length; i++) fs.writeSync(fd, chunk);
  fs.closeSync(fd);

  const t0 = Date.now();
  await A.locator('input[type=file]').last().setInputFiles(filePath);
  await A.getByRole('button', { name: 'Send' }).first().click();
  const done = await B.waitForFunction(() => {
    const msgs = window.__sharetextDebug?.getMessages?.() ?? [];
    return msgs.some(m => m.attachment?.status === 'complete');
  }, undefined, { timeout: 180000 }).then(() => true).catch(() => false);
  const dt = Date.now() - t0;
  const Bstate = await B.evaluate(() => {
    const msgs = window.__sharetextDebug?.getMessages?.() ?? [];
    const a = msgs.find(m => m.attachment)?.attachment;
    return { status: a?.status, size: a?.size };
  });
  console.log(`completed=${done} in ${dt}ms (${(FILE_SIZE / 1024 / 1024 / (dt / 1000)).toFixed(1)} MB/s)`);
  console.log('B state:', JSON.stringify(Bstate));
  process.exit(done && Bstate?.status === 'complete' && Bstate?.size === FILE_SIZE ? 0 : 1);
} finally {
  await browser.close();
}
