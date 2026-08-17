import { launchBrowser, URL, sleep } from './lib.mjs';

async function main() {
  const browser = await launchBrowser();
  const ctxA = await browser.newContext({ viewport: { width: 1280, height: 900 }, permissions: ['clipboard-read', 'clipboard-write'] });
  const A = await ctxA.newPage();
  await A.goto(URL, { waitUntil: 'networkidle' });
  await sleep(1200);
  await A.getByRole('button', { name: 'Send text' }).first().click();
  await A.getByText('LIVE CODE').waitFor({ timeout: 10000 });
  await sleep(600);

  const buttons = await A.evaluate(() =>
    Array.from(document.querySelectorAll('button')).map(b => b.textContent.replace(/\s+/g, ' ').trim()).filter(Boolean).slice(0, 12)
  );
  console.log('buttons:', JSON.stringify(buttons));

  // Try every likely copy button and read the clipboard after each.
  for (const name of ['Copy Link', 'Share Nearby', 'Copy Code']) {
    const btn = A.getByRole('button', { name: new RegExp(name) }).first();
    if (await btn.count()) {
      await btn.click();
      await sleep(500);
      const clip = await A.evaluate(() => navigator.clipboard.readText().catch((e) => 'ERR:' + e.message));
      console.log(`after clicking "${name}":`, JSON.stringify(clip));
    }
  }

  // Check the QR svg presence + try decoding nothing — just note it.
  const qr = await A.evaluate(() => !!document.querySelector('svg').parentElement?.textContent?.includes('vercel'));
  console.log('qr present:', qr);
  await browser.close();
}

main().catch((e) => { console.error('FAIL', String(e).slice(0, 400)); process.exit(1); });
