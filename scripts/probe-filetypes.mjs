import { launchBrowser, URL, sleep, readLiveCode, waitForChat } from './lib.mjs';

// Real two-device transfer: send a PDF, a ZIP, and an unknown extension,
// then verify the receiver's cards use the typed icon system (colored tiles)
// and expose a Share button next to Save.
const b = await launchBrowser();
try {
  const ctxA = await b.newContext({ viewport: { width: 1280, height: 900 } });
  const ctxB = await b.newContext({ viewport: { width: 1280, height: 900 } });
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

  // Stage 3 files via the hidden file input: report.pdf, bundle.zip, weird.xyz
  await A.evaluate(async () => {
    const input = document.querySelector('input[type="file"]:not([accept*="image"]):not([accept*="video"]):not([accept*="audio"])');
    const make = (name, bytes) => new File([new Uint8Array(bytes)], name, { type: 'application/octet-stream' });
    const dt = new DataTransfer();
    dt.items.add(make('report.pdf', new Array(512).fill(7)));
    dt.items.add(make('bundle.zip', new Array(512).fill(9)));
    dt.items.add(make('weird.xyz', new Array(512).fill(3)));
    input.files = dt.files;
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await sleep(600);
  await A.locator('textarea').first().press('Enter');
  await sleep(2500);

  const icons = await B.evaluate(() => {
    const tiles = [...document.querySelectorAll('span[class*="rounded-[10px]"]')]
      .map(s => ({ cls: s.className, glyph: !!s.querySelector('svg') }));
    const share = [...document.querySelectorAll('button')].filter(b => b.textContent?.includes('Share')).length;
    return { tileCount: tiles.filter(t => t.glyph).length, shareButtons: share };
  });

  console.log(JSON.stringify(icons, null, 2));
  const ok = icons.tileCount >= 3 && icons.shareButtons >= 1;
  console.log(ok ? 'FILETYPES_OK' : 'FILETYPES_FAIL');
} finally {
  await b.close();
}
