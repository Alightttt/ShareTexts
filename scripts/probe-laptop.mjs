// Probe the laptop frame geometry in the landing hero at desktop width.
import { launchBrowser, URL, sleep } from './lib.mjs';

async function main() {
  const browser = await launchBrowser();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  await page.goto(URL, { waitUntil: 'networkidle' });
  await sleep(2500);

  const info = await page.evaluate(() => {
    const all = Array.from(document.querySelectorAll('div'));
    // Laptop screens: aspect 16/10-ish elements ≥120px wide.
    const laptops = all.filter(el => {
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      return r.width >= 120 && r.height > 0 && (cs.aspectRatio === '16 / 10' || (r.width / r.height > 1.45 && r.width / r.height < 1.75));
    }).map(el => {
      const r = el.getBoundingClientRect();
      return { w: Math.round(r.width), h: Math.round(r.height), x: Math.round(r.x), y: Math.round(r.y), cls: (el.className || '').toString().slice(0, 80) };
    }).slice(0, 4);

    // Deck: elements with a polygon clip-path (the trapezoid).
    const deck = all.filter(el => {
      const cs = getComputedStyle(el);
      return cs.clipPath && cs.clipPath.includes('polygon');
    }).map(el => {
      const r = el.getBoundingClientRect();
      return { w: Math.round(r.width), h: Math.round(r.height), x: Math.round(r.x), y: Math.round(r.y), clip: getComputedStyle(el).clipPath.slice(0, 80) };
    }).slice(0, 4);

    // Key spans inside the deck region.
    const deckR = deck[0] ? { x: deck[0].x, y: deck[0].y, w: deck[0].w, h: deck[0].h } : null;
    const keys = Array.from(document.querySelectorAll('span')).filter(el => {
      if (!deckR) return false;
      const r = el.getBoundingClientRect();
      return r.width > 4 && r.height >= 1 && r.height < 14 && r.width < 45 && r.y > deckR.y && r.y < deckR.y + deckR.h;
    }).slice(0, 18).map(el => {
      const r = el.getBoundingClientRect();
      return { w: Math.round(r.width), h: Math.round(r.height), y: Math.round(r.y) };
    });

    return { laptops, deck, keys };
  });

  console.log(JSON.stringify(info, null, 2));
  await page.screenshot({ path: '.audit-shots/laptop-probe.png' });
  await browser.close();
}

main().catch((e) => { console.error('PROBE FAIL', String(e).slice(0, 400)); process.exit(1); });
