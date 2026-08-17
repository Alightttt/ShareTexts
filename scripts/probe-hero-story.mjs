import { launchBrowser, URL, sleep } from './lib.mjs';

// Verify the interactive hero's full state story: type a message → click send
// → Sending…/Receiving… with progress bar → Sent ✓ on the phone, the exact
// text received on the laptop. No auto-loop — everything is user-driven.
const b = await launchBrowser();
try {
  const page = await b.newPage({ viewport: { width: 1280, height: 900 } });
  await page.goto(URL, { waitUntil: 'networkidle' });
  await page.locator('text=Move anything between your devices').first().waitFor({ timeout: 15000 });

  // The demo starts ready with a photo sample pre-attached. Clear it and type
  // a real message instead, to prove the typed text travels. (React tracks
  // the input value via its own setter, so drive it through the prototype
  // setter + input event — the same thing real keystrokes produce.)
  await page.evaluate(() => {
    const ta = document.querySelector('textarea[aria-label="Demo message"]');
    const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
    setter.call(ta, 'hello from the demo ✨');
    ta.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await sleep(200);
  // Remove the pre-attached photo sample so the TEXT is what travels.
  await page.evaluate(() => document.querySelector('button[aria-label="Remove attachment"]')?.click());
  await sleep(200);

  await page.evaluate(() => {
    const btn = document.querySelector('button[aria-label="Send demo"]');
    btn?.click();
  });

  // Sending frame (~0.8s after click): phone Sending…, laptop Receiving… + bar
  await sleep(750);
  const sending = await page.evaluate(() => {
    const texts = [...document.querySelectorAll('span')].map(s => s.textContent);
    return {
      phone: texts.includes('Sending…'),
      recv: texts.includes('Receiving…'),
      progressBar: [...document.querySelectorAll('div')].some(d => d.className?.includes?.('overflow-hidden') && d.querySelector('div[class*="bg-apple-blue"]')),
    };
  });

  // Received frame (~1.6s later): phone Sent, laptop Received, exact text landed
  await sleep(1500);
  const received = await page.evaluate(() => {
    const root = document.querySelector('[data-step]');
    const texts = [...document.querySelectorAll('span')].map(s => s.textContent);
    return {
      sent: texts.includes('Sent'),
      got: texts.includes('Received'),
      landedText: root?.getAttribute('data-landed-text') || '',
      laptopShowsText: [...document.querySelectorAll('p')].some(p => p.textContent?.includes('hello from the demo ✨')),
    };
  });

  console.log(JSON.stringify({ sending, received }, null, 2));
  const ok = sending.phone && sending.recv && sending.progressBar && received.sent && received.got
    && received.landedText === 'hello from the demo ✨' && received.laptopShowsText;
  console.log('expected landedText: hello from the demo ✨');
  console.log(ok ? 'HERO_STORY_OK' : 'HERO_STORY_FAIL');
} finally {
  await b.close();
}
