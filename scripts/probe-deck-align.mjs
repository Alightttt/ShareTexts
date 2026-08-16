// Measure the HERO laptop's full structure: root, lid, screen, deck geometry.
import { launchBrowser, URL, sleep } from './lib.mjs';

async function main() {
  const browser = await launchBrowser();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await ctx.newPage();
  await page.goto(URL, { waitUntil: 'networkidle' });
  await sleep(2500);

  const out = await page.evaluate(() => {
    // Hero laptop: the largest 16/10 screen element on the page.
    const all = Array.from(document.querySelectorAll('div'));
    const screens = all.filter(el => {
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      return r.width >= 200 && cs.aspectRatio === '16 / 10';
    }).sort((a, b) => b.getBoundingClientRect().width - a.getBoundingClientRect().width);
    const screen = screens[0];
    if (!screen) return null;
    const sr = screen.getBoundingClientRect();
    // Walk up: screen -> screenpad (bg-[#121214]) -> lid (gradient) -> root (relative)
    let lid = screen.parentElement?.parentElement;
    let root = lid?.parentElement;
    const rect = (el) => {
      const r = el.getBoundingClientRect();
      return { x: Math.round(r.x), w: Math.round(r.width), right: Math.round(r.x + r.width), y: Math.round(r.y), h: Math.round(r.height) };
    };
    const deck = Array.from(all).find(el => {
      const cs = getComputedStyle(el);
      return cs.clipPath && cs.clipPath.includes('polygon') && el.getBoundingClientRect().y >= sr.y;
    });
    const dr = deck ? deck.getBoundingClientRect() : null;
    const cs = deck ? getComputedStyle(deck) : null;
    const m = cs && cs.clipPath.match(/polygon\(([\d.]+)% 0%, ([\d.]+)% 0%/);
    const topPct = m ? { left: parseFloat(m[1]), right: parseFloat(m[2]) } : null;
    return {
      screen: rect(screen),
      lid: lid ? rect(lid) : null,
      root: root ? rect(root) : null,
      deck: dr ? { x: Math.round(dr.x), w: Math.round(dr.width), right: Math.round(dr.x + dr.width), y: Math.round(dr.y), h: Math.round(dr.height) } : null,
      deckTopPct: topPct,
      deckVisibleTop: dr && topPct ? {
        left: Math.round(dr.x + dr.width * topPct.left / 100),
        right: Math.round(dr.x + dr.width * topPct.right / 100),
      } : null,
      deckMargin: deck ? getComputedStyle(deck).margin : null,
    };
  });

  console.log(JSON.stringify(out, null, 2));
  if (out) {
    const c = (r) => (r.x + r.right) / 2;
    console.log('screen center:', Math.round(c(out.screen)));
    console.log('lid center:', out.lid ? Math.round(c(out.lid)) : null);
    console.log('root center:', out.root ? Math.round(c(out.root)) : null);
    console.log('deck center:', Math.round(c(out.deck)));
    console.log('deck visible-top center:', out.deckVisibleTop ? Math.round((out.deckVisibleTop.left + out.deckVisibleTop.right) / 2) : null);
    console.log('lid width vs deck visible-top width:', `${out.lid.w} vs ${out.deckVisibleTop.right - out.deckVisibleTop.left}`);
    console.log('deck margin:', out.deckMargin);
  }
  await browser.close();
}

main().catch((e) => { console.error('FAIL', String(e).slice(0, 400)); process.exit(1); });
