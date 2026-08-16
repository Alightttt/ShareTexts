// Privacy/network audit: what endpoints are contacted, what's in localStorage,
// and whether content appears outside the WebRTC channel during a session.
import { launchBrowser, URL, sleep, pairDevices } from './lib.mjs';
import fs from 'fs';
import os from 'os';
import path from 'path';

const PNG_B64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const pngPath = path.join(os.tmpdir(), 'sharetext-priv.png');
fs.writeFileSync(pngPath, Buffer.from(PNG_B64, 'base64'));

const browser = await launchBrowser();
try {
  const ctx = await browser.newContext();
  const A = await ctx.newPage();
  const B = await ctx.newPage();

  const reqs = [];
  const record = (page) => page.on('request', (r) => {
    const url = r.url();
    reqs.push({ url, resourceType: r.resourceType() });
  });
  record(A); record(B);

  // Landing only — what third parties load?
  await A.goto(URL, { waitUntil: 'networkidle' });
  await sleep(1500);

  // Pair + transfer.
  await B.goto(URL, { waitUntil: 'networkidle' });
  await pairDevices(A, B);
  await A.locator('textarea').first().fill('privacy check secret text 🔒');
  await A.getByRole('button', { name: 'Send', exact: true }).click();
  await A.locator('input[type=file]').last().setInputFiles(pngPath);
  await sleep(400);
  await A.getByRole('button', { name: 'Send', exact: true }).click();
  await sleep(2000);

  // Dump distinct endpoints + resource types.
  const distinct = [...new Set(reqs.map(r => {
    try { const u = new URL(r.url); return u.origin + u.pathname; } catch { return r.url; }
  }))];
  const types = [...new Set(reqs.map(r => r.resourceType))];

  const storage = await A.evaluate(() => {
    const ls = {};
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      const v = localStorage.getItem(k);
      ls[k] = { len: v?.length ?? 0, preview: String(v).slice(0, 60) };
    }
    const ss = {};
    for (let i = 0; i < sessionStorage.length; i++) {
      const k = sessionStorage.key(i);
      ss[k] = String(sessionStorage.getItem(k)).slice(0, 60);
    }
    const cookies = document.cookie;
    return { localStorage: ls, sessionStorage: ss, cookies };
  });

  // Does any request carry the message text or the PNG filename?
  const contentInRequests = reqs.filter(r => r.url.includes('privacy check') || r.url.includes('sharetext-priv') || r.url.includes('secret')).length;

  // WebRTC transport type.
  const transport = await A.evaluate(() => (window.__sharetextDiag?.snapshot?.() ?? []).find(e => e.stage === 'transport.choose')?.detail || (window.__sharetextDiag?.snapshot?.() ?? []).find(e => e.stage === 'webrtc.channel_open')?.stage || 'unknown');

  console.log(JSON.stringify({
    distinctEndpoints: distinct,
    resourceTypes: types,
    contentInRequestURLs: contentInRequests,
    transport,
    localStorageKeys: Object.keys(storage.localStorage),
    storagePreview: storage,
    cookies: storage.cookies,
  }, null, 1));

  // Assertions
  const thirdParty = distinct.filter(u => !u.includes('localhost') && !u.includes('127.0.0.1'));
  console.log('\nThird-party endpoints:', thirdParty.length ? thirdParty : '(none)');
  console.log('Analytics/trackers:', reqs.some(r => /analytics|gtag|segment|mixpanel|amplitude|sentry|hotjar|clarity/i.test(r.url)) ? 'FOUND' : '(none)');
} finally {
  await browser.close();
}
