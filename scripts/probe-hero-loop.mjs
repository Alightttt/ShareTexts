import { launchBrowser, URL, sleep } from './lib.mjs';

// The interactive demo must stay coherent across successive transfers:
// send the pre-attached PHOTO, then send a typed TEXT message. The phone's
// stream accumulates both sent items (newest last) and the laptop shows the
// LATEST received object — the photo lands first, the text replaces it.
const b = await launchBrowser();
try {
  const page = await b.newPage({ viewport: { width: 1280, height: 900 } });
  await page.goto(URL, { waitUntil: 'networkidle' });
  await page.locator('text=Move anything between your devices').first().waitFor({ timeout: 15000 });
  await sleep(500);

  const snap = () => page.evaluate(() => {
    const root = document.querySelector('[data-step]');
    const phone = document.querySelector('[data-device="phone"]');
    const laptop = document.querySelector('[data-device="laptop"]');
    const chip = (el) => [...el.querySelectorAll('span')].map(s => s.textContent).find(t => ['Sending…', 'Sent', 'Connected', 'Receiving…', 'Received'].includes(t)) || null;
    return {
      step: root?.getAttribute('data-step'),
      landedKind: root?.getAttribute('data-landed-kind') || '',
      landedText: root?.getAttribute('data-landed-text') || '',
      phoneChip: chip(phone),
      laptopChip: chip(laptop),
      phoneStreamText: (phone.innerText.match(/hello from the demo/g) || []).length,
      photoOnPhone: phone.innerText.includes('photo-2026.jpg'),
    };
  });

  // 1. Send the pre-attached photo sample.
  await page.evaluate(() => document.querySelector('button[aria-label="Send demo"]')?.click());
  await sleep(2200);
  const afterPhoto = await snap();

  // 2. Type a text message and send it — the laptop should swap to the text.
  await page.evaluate(() => {
    const ta = document.querySelector('textarea[aria-label="Demo message"]');
    const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
    setter.call(ta, 'hello from the demo');
    ta.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await sleep(200);
  await page.evaluate(() => document.querySelector('button[aria-label="Send demo"]')?.click());
  await sleep(2200);
  const afterText = await snap();

  console.log(JSON.stringify({ afterPhoto, afterText }, null, 2));
  const ok = afterPhoto.step === 'received' && afterPhoto.landedKind === 'photo'
    && afterPhoto.phoneChip === 'Sent' && afterPhoto.laptopChip === 'Received'
    && afterPhoto.photoOnPhone
    && afterText.step === 'received' && afterText.landedKind === 'text'
    && afterText.landedText === 'hello from the demo' && afterText.phoneStreamText === 1;
  console.log(ok ? 'HERO_LOOP_OK' : 'HERO_LOOP_FAIL');
} finally {
  await b.close();
}
