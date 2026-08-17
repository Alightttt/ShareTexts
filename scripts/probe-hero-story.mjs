import { launchBrowser, URL, sleep } from './lib.mjs';

// Verify the hero's full state story: Connected → Sending…/Receiving… (with
// progress bar) → Sent ✓/Received ✓. Clicks the replay button the moment it
// exists (it unmounts during flight), then samples the device headers at the
// right frames. The manual tap must interrupt the auto-cycle cleanly.
const b = await launchBrowser();
try {
  const page = await b.newPage({ viewport: { width: 1280, height: 900 } });
  await page.goto(URL, { waitUntil: 'networkidle' });
  await page.locator('text=Move something between your devices').first().waitFor({ timeout: 15000 });

  // Click the instant the ready composer is on screen.
  for (let i = 0; i < 60; i++) {
    const present = await page.evaluate(() => !!document.querySelector('button[aria-label="Replay transfer"]'));
    if (present) break;
    await sleep(100);
  }
  await sleep(150); // let the ready frame settle
  await page.evaluate(() => {
    const btn = document.querySelector('button[aria-label="Replay transfer"]');
    btn?.click();
  });

  // Sending frame (~0.9s after click): phone Sending…, laptop Receiving… + bar
  await sleep(800);
  const sending = await page.evaluate(() => {
    const texts = [...document.querySelectorAll('span')].map(s => s.textContent);
    return {
      phone: texts.includes('Sending…'),
      recv: texts.includes('Receiving…'),
      progressBar: [...document.querySelectorAll('div')].some(d => d.className?.includes?.('overflow-hidden') && d.querySelector('div[class*="bg-apple-blue"]')),
    };
  });

  // Received frame (~2.6s after click): phone Sent, laptop Received
  await sleep(1800);
  const received = await page.evaluate(() => {
    const texts = [...document.querySelectorAll('span')].map(s => s.textContent);
    return { sent: texts.includes('Sent'), got: texts.includes('Received') };
  });

  console.log(JSON.stringify({ sending, received }, null, 2));
  const ok = sending.phone && sending.recv && sending.progressBar && received.sent && received.got;
  console.log(ok ? 'HERO_STORY_OK' : 'HERO_STORY_FAIL');
} finally {
  await b.close();
}
