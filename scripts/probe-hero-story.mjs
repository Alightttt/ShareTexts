import { launchBrowser, URL, sleep } from './lib.mjs';

// Verify the hero's full state story: Connected → Sending…/Receiving… (with
// progress bar) → Sent ✓/Received ✓. Clicks the replay button (a real
// button, fires onClick) and samples the device headers at the right frames.
const b = await launchBrowser();
try {
  const page = await b.newPage({ viewport: { width: 1280, height: 900 } });
  await page.goto(URL, { waitUntil: 'networkidle' });
  await page.locator('text=Move something between your devices').first().waitFor({ timeout: 15000 });

  // Wait for the auto-cycle to return to the "ready" frame (that's when the
  // replay button exists), then click it. The phone idles with an infinite
  // float, so Playwright's stability check refuses to click it — dispatch a
  // real click from JS instead.
  await page.locator('button[aria-label="Replay transfer"]').first().waitFor({ timeout: 20000 });
  await sleep(1200); // let the ready frame settle
  await page.evaluate(() => {
    const btn = document.querySelector('button[aria-label="Replay transfer"]');
    btn?.click();
  });

  // Sending frame (~1s after click): phone shows Sending…, laptop Receiving… + bar
  await sleep(900);
  const sending = await page.evaluate(() => {
    const phone = [...document.querySelectorAll('span')].map(s => s.textContent).find(t => t === 'Sending…');
    const recv = [...document.querySelectorAll('span')].map(s => s.textContent).find(t => t === 'Receiving…');
    const bar = !!document.querySelector('.bg-apple-blue.rounded-full') || !!document.querySelector('span[class*="Receiving"]');
    const progressBar = [...document.querySelectorAll('div')].some(d => d.className?.includes?.('overflow-hidden') && d.querySelector('div[class*="bg-apple-blue"]'));
    return { phone: !!phone, recv: !!recv, progressBar };
  });

  // Received frame (~2.8s after click): phone shows Sent, laptop Received
  await sleep(1900);
  const received = await page.evaluate(() => {
    const sent = [...document.querySelectorAll('span')].map(s => s.textContent).find(t => t === 'Sent');
    const got = [...document.querySelectorAll('span')].map(s => s.textContent).find(t => t === 'Received');
    return { sent: !!sent, got: !!got };
  });

  console.log(JSON.stringify({ sending, received }, null, 2));
  const ok = sending.phone && sending.recv && received.sent && received.got;
  console.log(ok ? 'HERO_STORY_OK' : 'HERO_STORY_FAIL');
} finally {
  await b.close();
}
