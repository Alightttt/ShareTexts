import { launchBrowser, URL, sleep, pairDevices } from './lib.mjs';
const b = await launchBrowser();
try {
  const ctxA = await b.newContext({ viewport: { width: 1280, height: 900 } });
  const ctxB = await b.newContext({ viewport: { width: 1280, height: 900 }, permissions: ['clipboard-read', 'clipboard-write'] });
  const A = await ctxA.newPage();
  const B = await ctxB.newPage();
  const blobErrors = [];
  B.on('console', m => { if (m.text().includes('blob:') && (m.type() === 'error' || m.text().includes('ERR'))) blobErrors.push(m.text().slice(0, 160)); });
  B.on('requestfailed', r => { if (r.url().startsWith('blob:')) blobErrors.push('REQFAIL: ' + r.url().slice(0, 90)); });
  await A.goto(URL, { waitUntil: 'networkidle' });
  await B.goto(URL, { waitUntil: 'networkidle' });
  await pairDevices(A, B);

  // A sends a small image to B.
  await A.getByRole('button', { name: 'Add attachment' }).click();
  await A.getByRole('button', { name: 'Photo' }).click();
  await A.locator('input[type="file"][accept^="image"]').setInputFiles({
    name: 'pic.png', mimeType: 'image/png',
    buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64'),
  });
  await sleep(300);
  await A.getByRole('button', { name: 'Send' }).click();
  await sleep(2500);
  const gotOnB = await B.evaluate(() => [...document.querySelectorAll('img')].some(i => i.src.startsWith('blob:')));
  const brokenBefore = await B.evaluate(() => [...document.querySelectorAll('img')].filter(i => i.src.startsWith('blob:')).map(i => ({ broken: i.complete && i.naturalWidth === 0, src: i.src.slice(0, 60) })));
  console.log('B got image (blob):', gotOnB, 'broken-before:', JSON.stringify(brokenBefore));

  // COPY on the received image must put real image bytes on the clipboard —
  // never the raw blob: URL text (which is dead outside the page).
  await sleep(600);
  await B.bringToFront();
  await B.getByRole('button', { name: 'Copy' }).first().click();
  await sleep(600);
  const clip = await B.evaluate(async () => {
    try {
      const items = await navigator.clipboard.read();
      return { types: items.map(i => [...i.types]), text: await navigator.clipboard.readText().catch(() => '') };
    } catch (e) { return { types: ['ERR:' + String(e)], text: '' }; }
  });
  console.log('clipboard after Copy:', JSON.stringify(clip));
  const copyIsImage = clip.types.some(t => t.some(x => x.startsWith('image/')));
  const copyIsDeadUrl = clip.text.startsWith('blob:');

  // Now RELOAD B — the stored session must restore WITHOUT a dead blob URL,
  // then ask the still-open sender (A) to re-send the bytes, and the image
  // must come back intact. No broken images, no REQFAIL for a stale URL.
  blobErrors.length = 0;
  await B.reload({ waitUntil: 'domcontentloaded' });
  let restored = null;
  for (let i = 0; i < 24; i++) {
    await sleep(500);
    restored = await B.evaluate(() => {
      const imgs = [...document.querySelectorAll('img')].filter(x => x.src.startsWith('blob:'));
      return { count: imgs.length, broken: imgs.filter(x => x.complete && x.naturalWidth === 0).map(x => x.src.slice(0, 50)) };
    });
    if (restored.count > 0 && restored.broken.length === 0) break;
  }
  console.log('after reload restore:', JSON.stringify(restored), 'blob errors:', JSON.stringify(blobErrors, null, 1));
  const ok = !gotOnB ? false : copyIsImage && !copyIsDeadUrl && !!restored && restored.count > 0 && restored.broken.length === 0 && blobErrors.length === 0;
  console.log(ok ? 'BLOB_RELOAD_OK' : 'BLOB_RELOAD_FAIL');
} finally { await b.close(); }
