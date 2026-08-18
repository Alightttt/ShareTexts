import { launchBrowser, URL, sleep } from './lib.mjs';
// Check layout survives browser text scaling (zoom) at 125/150/200% on the
// landing + pairing screens — overflow is the failure mode.
const b = await launchBrowser();
try {
  const results = [];
  for (const scale of [1.25, 1.5, 2.0]) {
    const ctx = await b.newContext({ viewport: { width: 390, height: 844 } });
    const page = await ctx.newPage();
    await page.goto(URL, { waitUntil: 'networkidle' });
    await page.locator('text=Move anything between your devices').first().waitFor({ timeout: 15000 });
    const cdp = await ctx.newCDPSession(page);
    await cdp.send('Emulation.setPageScaleFactor', { pageScaleFactor: scale });
    await sleep(400);
    const landing = await page.evaluate(() => {
      const doc = document.documentElement;
      return { overflow: doc.scrollWidth > window.innerWidth + 1, scrollW: doc.scrollWidth, winW: window.innerWidth };
    });
    // RoomHub
    await page.getByRole('button', { name: 'Send' }).first().click();
    await page.getByText('LIVE CODE').waitFor({ timeout: 10000 });
    await sleep(400);
    const hub = await page.evaluate(() => {
      const doc = document.documentElement;
      return { overflow: doc.scrollWidth > window.innerWidth + 1, scrollW: doc.scrollWidth, winW: window.innerWidth };
    });
    results.push({ scale, landing, hub });
    await ctx.close();
  }
  console.log(JSON.stringify(results, null, 1));
  const ok = results.every(r => !r.landing.overflow && !r.hub.overflow);
  console.log(ok ? 'TEXTSCALE_OK' : 'TEXTSCALE_FAIL');
} finally { await b.close(); }
