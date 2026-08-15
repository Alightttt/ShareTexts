import { launchBrowser, URL, pairDevices } from './lib.mjs';

const browser = await launchBrowser();
try {
  const ctx = await browser.newContext();
  const A = await ctx.newPage();
  const B = await ctx.newPage();
  await A.goto(URL, { waitUntil: 'networkidle' });
  await B.goto(URL, { waitUntil: 'networkidle' });
  await pairDevices(A, B);
  const info = await B.evaluate(() => {
    const dbg = window.__sharetextDebug;
    const pm = dbg?.peerManager?.();
    const pc = pm?.getPc?.();
    return {
      hasDebug: !!dbg,
      hasPm: !!pm,
      pmCtor: pm?.constructor?.name,
      hasGetPc: typeof pm?.getPc === 'function',
      pcCtor: pc ? (pc.constructor?.name || Object.prototype.toString.call(pc)) : null,
      hasGetDataChannels: typeof pc?.getDataChannels === 'function',
      channels: (typeof pc?.getDataChannels === 'function' ? pc.getDataChannels().length : -1),
    };
  });
  console.log(JSON.stringify(info, null, 2));
} finally {
  await browser.close();
}
