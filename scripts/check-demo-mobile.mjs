// Verify the hero demo animates on mobile (vertical stack, downward flight).
import { launchBrowser, URL, sleep } from './lib.mjs';

const browser = await launchBrowser();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', e => errors.push(e.message));
await page.goto(URL, { waitUntil: 'networkidle' });

const samples = await page.evaluate(() => new Promise((resolve) => {
  const samples = [];
  let i = 0;
  const tick = () => {
    const flying = document.querySelector('[class*="z-20"]');
    const demo = document.querySelector('[class*="max-w-[880px]"]');
    const copied = demo && [...demo.querySelectorAll('span')].some(s => s.textContent.trim() === 'Copied');
    const pos = flying ? (() => { const r = flying.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y) }; })() : null;
    samples.push({ t: i * 0.7, flying: !!flying, copied: !!copied, pos });
    i++;
    if (i < 12) setTimeout(tick, 700);
    else resolve(samples);
  };
  tick();
}));

console.log('mobile demo samples:', JSON.stringify(samples, null, 0).slice(0, 600));
const moved = samples.some((s, i) => s.pos && samples[i - 1]?.pos && (Math.abs(s.pos.y - samples[i - 1].pos.y) > 20));
console.log('flight moves vertically on mobile:', moved);
console.log('page errors:', errors.length ? errors.join(' | ') : 'none');
await browser.close();
