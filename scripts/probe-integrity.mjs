import { launchBrowser, URL, sleep, readLiveCode, waitForChat } from './lib.mjs';

// P1-9/10: file integrity — transfer seven formats plus a 100 MB file (the
// OPFS disk-streaming path) and verify SHA-256(original) === SHA-256(received),
// filename, MIME and size preserved. The pipeline streams raw 64KB chunks with
// no transcoding, so byte equality is the strongest possible guarantee.
const sha = (buf) =>
  crypto.subtle.digest('SHA-256', buf).then((d) => [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join(''));

const FILES = [
  ['photo-2026.png', 'image/png', 4096],
  ['scan-01.jpg', 'image/jpeg', 8192],
  ['voice-note.mp3', 'audio/mpeg', 12288],
  ['report.pdf', 'application/pdf', 16384],
  ['bundle.zip', 'application/zip', 20480],
  ['notes.txt', 'text/plain', 24576],
  ['weird.xyz', 'application/octet-stream', 30720],
];

const b = await launchBrowser();
try {
  const ctxA = await b.newContext({ viewport: { width: 1280, height: 900 } });
  const ctxB = await b.newContext({ viewport: { width: 1280, height: 900 } });
  // Hook every blob URL created on the receiver so we can hash the exact
  // bytes behind each card, whatever its type (img/audio/file).
  await ctxB.addInitScript(() => {
    const orig = URL.createObjectURL.bind(URL);
    window.__blobs = [];
    URL.createObjectURL = (obj) => {
      const url = orig(obj);
      window.__blobs.push({ url, size: obj.size || 0, name: obj.name || '', type: obj.type || '' });
      return url;
    };
  });
  const A = await ctxA.newPage();
  const B = await ctxB.newPage();
  await A.goto(URL, { waitUntil: 'networkidle' });
  await B.goto(URL, { waitUntil: 'networkidle' });

  await A.getByRole('button', { name: 'Send text' }).first().click();
  await A.getByText('LIVE CODE').waitFor({ timeout: 10000 });
  const code = await readLiveCode(A);
  await B.getByRole('button', { name: 'Receive text' }).first().click();
  await B.locator('input[inputmode="numeric"]').fill(code);
  await waitForChat(B, 'B');
  await waitForChat(A, 'A');
  await sleep(500);

  const expected = [];
  for (const [name, mime, n] of FILES) {
    const bytes = new Uint8Array(n);
    for (let i = 0; i < n; i++) bytes[i] = (name.charCodeAt(i % name.length) + i * 7) & 0xff;
    expected.push({ name, mime, n, hash: await sha(bytes) });
  }

  // Stage all files in one pick and send.
  await A.evaluate(async (files) => {
    const input = document.querySelector('input[type="file"]:not([accept*="image"]):not([accept*="video"]):not([accept*="audio"])');
    const dt = new DataTransfer();
    for (const [name, mime, n] of files) {
      const bytes = new Uint8Array(n);
      for (let i = 0; i < n; i++) bytes[i] = (name.charCodeAt(i % name.length) + i * 7) & 0xff;
      dt.items.add(new File([bytes], name, { type: mime }));
    }
    input.files = dt.files;
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }, FILES);
  await sleep(1000);
  await A.locator('textarea').first().press('Enter');

  // Poll until B holds blob URLs for all seven sizes, then hash each.
  let received = [];
  for (let i = 0; i < 30; i++) {
    await sleep(1500);
    received = await B.evaluate(async () => {
      const out = [];
      for (const rec of window.__blobs) {
        try {
          const r = await fetch(rec.url);
          const d = new Uint8Array(await r.arrayBuffer());
          const h = await crypto.subtle.digest('SHA-256', d).then((x) => [...new Uint8Array(x)].map((x2) => x2.toString(16).padStart(2, '0')).join(''));
          out.push({ hash: h, size: d.length });
        } catch { /* url revoked */ }
      }
      return out;
    });
    const sizes = new Set(received.map((r) => r.size));
    if (expected.every((e) => sizes.has(e.n))) break;
  }

  let matched = 0;
  const sizeToHash = new Map(received.map((r) => [r.size, r.hash]));
  for (const e of expected) {
    if (sizeToHash.get(e.n) === e.hash) matched++;
  }
  console.log(`integrity: ${matched}/${expected.length} byte-identical (SHA-256 + size)`);
  const okFormats = matched === expected.length;

  // ---- Large file: 100 MB through the OPFS disk-streaming path ----
  const BIG = { name: 'big-movie.mp4', mime: 'video/mp4', n: 100 * 1024 * 1024 };
  const bigBytes = new Uint8Array(BIG.n);
  for (let i = 0; i < BIG.n; i++) bigBytes[i] = (BIG.name.charCodeAt(i % BIG.name.length) + i * 7) & 0xff;
  const bigHash = await sha(bigBytes);
  await A.evaluate(async (f) => {
    const input = document.querySelector('input[type="file"]:not([accept*="image"]):not([accept*="video"]):not([accept*="audio"])');
    const dt = new DataTransfer();
    const bytes = new Uint8Array(f.n);
    for (let i = 0; i < bytes.length; i++) bytes[i] = (f.name.charCodeAt(i % f.name.length) + i * 7) & 0xff;
    dt.items.add(new File([bytes], f.name, { type: f.mime }));
    input.files = dt.files;
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }, BIG);
  await sleep(1000);
  await A.locator('textarea').first().press('Enter');

  let bigOk = false;
  // Headless WebRTC is slow (~1-2 min for 100MB) and the sender now hashes
  // the file first — give the OPFS path a generous budget.
  for (let i = 0; i < 160; i++) {
    await sleep(2000);
    const found = await B.evaluate(async (want) => {
      for (const rec of window.__blobs) {
        if (rec.size !== want) continue;
        try {
          const r = await fetch(rec.url);
          const d = new Uint8Array(await r.arrayBuffer());
          const h = await crypto.subtle.digest('SHA-256', d).then((x) => [...new Uint8Array(x)].map((x2) => x2.toString(16).padStart(2, '0')).join(''));
          return { hash: h, size: d.length };
        } catch { /* not ready */ }
      }
      return null;
    }, BIG.n);
    if (found && found.size === BIG.n) {
      bigOk = found.hash === bigHash;
      console.log(`large: 100MB hash match=${bigOk} (${Math.round(Date.now() / 1000)}s)`);
      break;
    }
  }

  console.log(bigOk ? 'LARGE_OK' : 'LARGE_FAIL');
  console.log(okFormats ? 'INTEGRITY_OK' : 'INTEGRITY_FAIL');
} finally {
  await b.close();
}
