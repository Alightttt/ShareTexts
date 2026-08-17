// Dump geometry of the join + connect screens at 375px to find overlaps.
import { launchBrowser, URL, sleep } from './lib.mjs';

async function main() {
  const browser = await launchBrowser();
  const ctxA = await browser.newContext({ viewport: { width: 375, height: 812 } });
  const ctxB = await browser.newContext({ viewport: { width: 375, height: 812 } });
  const A = await ctxA.newPage();
  const B = await ctxB.newPage();

  await A.goto(URL, { waitUntil: 'networkidle' });
  await A.getByRole('button', { name: 'Start a transfer' }).first().click();
  await A.getByText('LIVE CODE').waitFor({ timeout: 10000 });
  await sleep(800);

  // Connect screen (RoomHub) — key elements
  const geom = await A.evaluate(() => {
    const vis = (el) => {
      if (!el) return null;
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden') return null;
      return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height), right: Math.round(r.right), bottom: Math.round(r.bottom) };
    };
    const out = {};
    const byText = (t) => [...document.querySelectorAll('h1,h2,h3,p,span,button')].find((e) => e.textContent.trim() === t);
    out.vw = window.innerWidth;
    out.bodyScrollW = document.body.scrollWidth;
    out.heading = vis(byText('Connect your other device'));
    out.code = vis(document.querySelector('[data-live-code]') || [...document.querySelectorAll('div')].find((d) => d.textContent.trim() === 'LIVE CODE'));
    out.qrArea = vis(document.querySelector('[data-qr]') || [...document.querySelectorAll('div')].find((d) => d.getAttribute('aria-label')?.includes('QR')));
    out.bottomNote = vis(byText('No account required'));
    return out;
  });
  console.log('CONNECT GEOM:', JSON.stringify(geom, null, 1));

  await B.goto(URL, { waitUntil: 'networkidle' });
  await B.getByRole('button', { name: 'Already have a code?' }).first().click();
  await sleep(800);
  const jg = await B.evaluate(() => {
    const vis = (el) => {
      if (!el) return null;
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden') return null;
      return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height), right: Math.round(r.right), bottom: Math.round(r.bottom) };
    };
    const byText = (t) => [...document.querySelectorAll('h1,h2,h3,p,span,button')].find((e) => e.textContent.trim() === t);
    const boxes = [...document.querySelectorAll('div')].filter((d) => d.className && String(d.className).includes('aspect-[3/4]'));
    return {
      vw: window.innerWidth,
      bodyScrollW: document.body.scrollWidth,
      heading: vis(byText('Enter the code')),
      sub: vis(byText('It changes every 40 seconds — use the latest one.')),
      cancel: vis(byText('Cancel')),
      firstBox: vis(boxes[0]),
      lastBox: vis(boxes[5]),
      anyBoxOutside: boxes.some((b) => { const r = b.getBoundingClientRect(); return r.left < 0 || r.right > window.innerWidth; }),
    };
  });
  console.log('JOIN GEOM:', JSON.stringify(jg, null, 1));

  await browser.close();
}

main().catch((e) => { console.error('PROBE FAIL', e); process.exit(1); });
