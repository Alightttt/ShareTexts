import { launchBrowser, URL, sleep } from './lib.mjs';

// The loop must feel continuous: after a photo lands, the phone composes the
// LINK (step=composing, phone chip Connected) while the laptop STILL shows the
// photo card with its chip reading Received — one transfer leads into the
// next. Only when the link completes does the laptop swap objects.
const b = await launchBrowser();
try {
  const page = await b.newPage({ viewport: { width: 1280, height: 900 } });
  await page.goto(URL, { waitUntil: 'networkidle' });
  await page.locator('text=Move something between your devices').first().waitFor({ timeout: 15000 });
  await sleep(500);

  const seen = new Set();
  let composingContinuity = false;
  let sawLaptopSwap = false;
  let lastLanded = null;
  for (let i = 0; i < 50; i++) {
    await sleep(250);
    const snap = await page.evaluate(() => {
      const root = document.querySelector('[data-step]');
      const step = root?.getAttribute('data-step');
      const scene = root?.getAttribute('data-scene');
      const landed = root?.getAttribute('data-landed');
      const phone = document.querySelector('[data-device="phone"]');
      const laptop = document.querySelector('[data-device="laptop"]');
      const chip = (el) => [...el.querySelectorAll('span')].map(s => s.textContent).find(t => ['Sending…', 'Sent', 'Connected', 'Receiving…', 'Received'].includes(t)) || null;
      const photoCard = [...laptop.querySelectorAll('span')].some(s => s.textContent === 'photo-2026.jpg' && s.getBoundingClientRect().height > 0 && getComputedStyle(s).opacity !== '0');
      const linkCard = [...laptop.querySelectorAll('span')].some(s => s.textContent === 'example.com/a/very-long-link' && s.getBoundingClientRect().height > 0);
      return { step, scene, landed, phoneChip: chip(phone), laptopChip: chip(laptop), photoCard, linkCard };
    });
    if (!snap.step) continue;
    seen.add(snap.step);
    // Composing the next object while the laptop keeps the landed card.
    if (snap.step === 'composing' && snap.laptopChip === 'Received' && (snap.photoCard || snap.linkCard)) {
      composingContinuity = true;
    }
    // Laptop swaps to the other object only when the next transfer completes.
    if (lastLanded && snap.landed && snap.landed !== lastLanded && snap.laptopChip === 'Received') {
      sawLaptopSwap = true;
    }
    if (snap.landed) lastLanded = snap.landed;
  }

  console.log(JSON.stringify({ composingContinuity, sawLaptopSwap, steps: [...seen] }, null, 2));
  const ok = composingContinuity && sawLaptopSwap && ['ready', 'sending', 'received', 'composing'].every(s => seen.has(s));
  console.log(ok ? 'HERO_LOOP_OK' : 'HERO_LOOP_FAIL');
} finally {
  await b.close();
}
