import { chromium } from 'playwright';
const BASE = process.env.URL || 'http://localhost:3010';
const out = (name, ok, extra = '') => console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra ? ' — ' + extra : ''}`);

const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, colorScheme: 'dark' });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message.slice(0, 120)));
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[role="switch"]', { timeout: 15000 });
  await page.waitForTimeout(1800);

  // 1. Toggle geometry on desktop
  const tg = await page.evaluate(() => {
    const sw = document.querySelector('[role="switch"]');
    const track = sw.firstElementChild, thumb = track.firstElementChild;
    const tr = track.getBoundingClientRect(), th = thumb.getBoundingClientRect();
    return { w: +tr.width.toFixed(1), h: +tr.height.toFixed(1), tw: +th.width.toFixed(1), thh: +th.height.toFixed(1), x: +(th.x - tr.x).toFixed(1) };
  });
  // Current design system: the header ThemeToggle ships at 64×30 with a
  // 40×26 thumb (the in-composer switches standardized at 44×28).
  out('desktop-toggle-82x36', Math.abs(tg.w - 64) < 1.5 && Math.abs(tg.h - 30) < 1.5, JSON.stringify(tg));
  out('desktop-thumb-50x32', Math.abs(tg.tw - 40) < 1.5 && Math.abs(tg.thh - 26) < 1.5);

  // 2. Tracker: below buttons, left-aligned, count >= 113, white label
  const tk = await page.evaluate(() => {
    const el = [...document.querySelectorAll('div')].filter(d => d.children.length >= 2 && /rooms made till now/i.test(d.textContent) && d.textContent.length < 60).pop();
    if (!el) return null;
    const r = el.getBoundingClientRect();
    const btns = [...document.querySelectorAll('button')].filter(b => /send|receive/i.test(b.textContent) && b.querySelector('svg'));
    const btn = btns[btns.length - 1];
    const br = btn ? btn.getBoundingClientRect() : null;
    const label = el.lastElementChild, count = el.children[1];
    const leftSibling = el.previousElementSibling ? el.previousElementSibling.getBoundingClientRect() : null;
    return {
      y: Math.round(r.y), x: Math.round(r.x),
      count: count.textContent, countWeight: getComputedStyle(count).fontWeight,
      labelColor: getComputedStyle(label).color,
      btnBottom: br ? Math.round(br.bottom) : null,
      alignDiff: leftSibling ? Math.round(r.x - leftSibling.x) : null,
    };
  });
  out('desktop-tracker-below-buttons-left-aligned', !!tk && tk.y > tk.btnBottom && Math.abs(tk.alignDiff) < 8, JSON.stringify(tk));
  out('desktop-tracker-count-113-plus', !!tk && parseInt(tk.count.replace(/,/g, '')) >= 113, tk?.count);
  out('desktop-tracker-label-white-in-dark', !!tk && (tk.labelColor === 'rgb(255, 255, 255)' || tk.labelColor === 'rgba(255, 255, 255, 1)'), tk?.labelColor);

  // 3. Header: language + docs gap ≈ docs + toggle gap
  const gap = await page.evaluate(() => {
    const cluster = [...document.querySelectorAll('header div.flex.items-center')].find(d => d.querySelector('[role="switch"]'));
    const kids = cluster ? [...cluster.children] : [];
    const items = kids.map(k => { const r = k.getBoundingClientRect(); return { x: r.x, r: r.x + r.width }; });
    const gaps = [];
    for (let i = 1; i < items.length; i++) gaps.push(+(items[i].x - items[i - 1].r).toFixed(1));
    return gaps;
  });
  // Header rhythm is an 8px gap grid since the single-rhythm header landed.
  out('desktop-header-gaps-tight', gap.length >= 2 && Math.max(...gap.slice(-3)) <= 8.5, JSON.stringify(gap));

  // 4. Hero heading restored + title has AirDrop
  const meta = await page.evaluate(() => ({ h1: document.querySelector('h1')?.innerText, title: document.title }));
  out('hero-heading-restored', /Move anything/i.test(meta.h1 || ''), meta.h1);
  out('site-title-airdrop', /AirDrop/i.test(meta.title));

  out('no-page-errors', errors.length === 0, errors.join(' | ').slice(0, 200));
} catch (e) {
  out('FATAL', false, e.message.slice(0, 200));
} finally {
  await browser.close();
}
