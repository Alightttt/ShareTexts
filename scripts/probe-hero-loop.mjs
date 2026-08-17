import { launchBrowser, URL, sleep } from './lib.mjs';

// The demo runs on its own AND yields to the visitor: send the pre-attached
// PHOTO (interrupting the auto-run), then send a typed TEXT. Each lands on
// the laptop in turn, the phone's stream accumulates both, and the auto-run
// resumes afterwards (data-auto flips back on).
const b = await launchBrowser();
try {
  const page = await b.newPage({ viewport: { width: 1280, height: 900 } });
  await page.goto(URL, { waitUntil: 'networkidle' });
  await page.locator('text=Move anything between your devices').first().waitFor({ timeout: 15000 });

  const waitComposer = async () => {
    for (let i = 0; i < 90; i++) {
      const up = await page.evaluate(() => !!document.querySelector('textarea[aria-label="Demo message"]'));
      if (up) return;
      await sleep(100);
    }
    throw new Error('composer never appeared');
  };
  const snap = () => page.evaluate(() => {
    const root = document.querySelector('[data-step]');
    const phone = document.querySelector('[data-device="phone"]');
    const laptop = document.querySelector('[data-device="laptop"]');
    const chip = (el) => [...el.querySelectorAll('span')].map(s => s.textContent).find(t => ['Sending…', 'Sent', 'Connected', 'Receiving…', 'Received'].includes(t)) || null;
    return {
      step: root?.getAttribute('data-step'),
      landedKind: root?.getAttribute('data-landed-kind') || '',
      landedText: root?.getAttribute('data-landed-text') || '',
      auto: root?.getAttribute('data-auto') || '',
      phoneChip: chip(phone),
      laptopChip: chip(laptop),
      phoneStreamText: (phone.innerText.match(/hello from the demo/g) || []).length,
      photoOnPhone: phone.innerText.includes('photo-2026.jpg'),
    };
  });

  // 1. Auto-run should be armed.
  await waitComposer();
  const autoBefore = await page.evaluate(() => document.querySelector('[data-step]')?.getAttribute('data-auto'));

  // 2. Send the pre-attached photo sample (interrupts the auto-run).
  await page.evaluate(() => document.querySelector('button[aria-label="Send demo"]')?.click());
  await sleep(2300);
  const afterPhoto = await snap();

  // 3. Wait for the composer to return, type text, send it.
  await waitComposer();
  await page.evaluate(() => {
    const ta = document.querySelector('textarea[aria-label="Demo message"]');
    const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
    setter.call(ta, 'hello from the demo');
    ta.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await sleep(200);
  await page.evaluate(() => document.querySelector('button[aria-label="Send demo"]')?.click());
  await sleep(2300);
  const afterText = await snap();

  // 4. The auto-run should resume (armed again) after the visitor's transfer.
  await sleep(3200);
  const resumed = await page.evaluate(() => {
    const root = document.querySelector('[data-step]');
    return { auto: root?.getAttribute('data-auto') || '', step: root?.getAttribute('data-step') };
  });

  console.log(JSON.stringify({ autoBefore, afterPhoto, afterText, resumed }, null, 2));
  const ok = autoBefore === 'on'
    && afterPhoto.step === 'received' && afterPhoto.landedKind === 'photo'
    && afterPhoto.phoneChip === 'Sent' && afterPhoto.laptopChip === 'Received'
    && afterPhoto.photoOnPhone
    && afterText.step === 'received' && afterText.landedKind === 'text'
    && afterText.landedText === 'hello from the demo' && afterText.phoneStreamText === 1
    && resumed.auto === 'on';
  console.log(ok ? 'HERO_LOOP_OK' : 'HERO_LOOP_FAIL');
} finally {
  await b.close();
}
