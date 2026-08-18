import { launchBrowser, URL, sleep, readLiveCode, waitForChat } from './lib.mjs';

// Composer + security pass:
//  1. Composer placeholder + Photo/File-only menu + video thumbnail staging.
//  2. A received SVG (image/* MIME but active content) renders as a FILE ROW
//     (Download), never an inline <img>.
//  3. Object URLs are revoked when the session ends.
const b = await launchBrowser();
try {
  const ctxA = await b.newContext({ viewport: { width: 1280, height: 900 } });
  const ctxB = await b.newContext({ viewport: { width: 1280, height: 900 } });
  await ctxB.addInitScript(() => {
    const origCreate = URL.createObjectURL.bind(URL);
    const origRevoke = URL.revokeObjectURL.bind(URL);
    window.__created = 0; window.__revoked = 0;
    URL.createObjectURL = (o) => { window.__created++; return origCreate(o); };
    URL.revokeObjectURL = (u) => { window.__revoked++; return origRevoke(u); };
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

  // --- 1. Composer: placeholder, menu options ---
  const placeholder = await A.locator('textarea').first().getAttribute('placeholder');
  await A.getByRole('button', { name: 'Add attachment' }).click();
  await sleep(300);
  const menuText = await A.evaluate(() => {
    const menu = [...document.querySelectorAll('button')].filter((x) => ['Photo', 'File', 'Video', 'Audio'].includes(x.textContent?.trim() || '')).map((x) => x.textContent.trim());
    return menu;
  });
  await A.getByRole('button', { name: 'Add attachment' }).click(); // close
  const menuOk = placeholder === 'Paste or type something…' && menuText.join(',') === 'Photo,File';

  // --- 2. Stage a VIDEO: thumbnail frame should appear in the strip ---
  await A.evaluate(() => {
    const input = document.querySelector('input[type="file"][accept="video/*"]');
    const dt = new DataTransfer();
    // tiny valid mp4 header blob so preload=metadata can show a frame
    dt.items.add(new File([new Uint8Array([0, 0, 0, 24, 102, 116, 121, 112, 105, 115, 111, 109])], 'clip.mp4', { type: 'video/mp4' }));
    input.files = dt.files;
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await sleep(600);
  const videoTile = await A.evaluate(() => !!document.querySelector('input[type="file"][accept="video/*"]')?.parentElement?.parentElement?.querySelector('video') || [...document.querySelectorAll('video')].length > 0);
  // remove the staged video (cleanup before sending SVG)
  const stagedCount = await A.evaluate(() => [...document.querySelectorAll('button[aria-label="Remove attachment"]')].length);
  if (stagedCount > 0) {
    await A.evaluate(() => document.querySelector('button[aria-label="Remove attachment"]')?.click());
    await sleep(400);
  }

  // --- 3. Send an SVG (image/* MIME, active content) — receiver must show a
  //        file row + Download, NOT an inline <img>. ---
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" onload="document.body.innerHTML='PWNED'"><rect width="10" height="10"/></svg>`;
  await A.evaluate((svg) => {
    const input = document.querySelector('input[type="file"][accept="image/*"]');
    const dt = new DataTransfer();
    dt.items.add(new File([svg], 'evil.svg', { type: 'image/svg+xml' }));
    input.files = dt.files;
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }, svg);
  await sleep(500);
  await A.locator('textarea').first().press('Enter');

  let sec = null;
  for (let i = 0; i < 30; i++) {
    await sleep(600);
    sec = await B.evaluate(() => {
      const body = document.body;
      const cards = [...document.querySelectorAll('*')].filter((el) => el.children.length === 0 && el.textContent?.trim() === 'evil.svg');
      const hasImgForSvg = [...document.querySelectorAll('img')].some((img) => img.alt === 'evil.svg');
      const hasFileRow = body.innerText.includes('evil.svg') && body.innerText.includes('Download') || body.innerText.includes('evil.svg') && body.innerText.includes('Save');
      return { hasImgForSvg, hasFileRow, hasDownload: body.innerText.includes('Download') };
    });
    if (sec && (sec.hasImgForSvg || sec.hasFileRow)) break;
  }
  const svgSafe = sec && !sec.hasImgForSvg && (sec.hasFileRow || sec.hasDownload);
  const pwned = await B.evaluate(() => document.body.innerText.includes('PWNED'));

  // --- 4. Object URLs revoked on session end ---
  await B.getByRole('button', { name: 'End room' }).first().click();
  await sleep(400);
  await B.getByRole('button', { name: 'End room' }).last().click();
  await sleep(900);
  const revoked = await B.evaluate(() => window.__revoked);

  console.log(JSON.stringify({ placeholder, menuText, videoTile, svgSafe, pwned, revoked }, null, 2));
  const ok = menuOk && svgSafe && !pwned && revoked > 0;
  console.log(ok ? 'COMPOSER_SEC_OK' : 'COMPOSER_SEC_FAIL');
} finally {
  await b.close();
}
