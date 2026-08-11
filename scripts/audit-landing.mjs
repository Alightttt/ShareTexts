// Audit the redesigned landing: overflow, demo sanity, button visibility.
import { launchBrowser, URL, sleep } from './lib.mjs';

const browser = await launchBrowser();

for (const [w, h, label] of [[320, 700, '320'], [390, 844, '390'], [768, 1024, '768'], [1280, 900, '1280'], [1512, 982, '1512']]) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(URL, { waitUntil: 'networkidle' });
  await sleep(1200);
  const r = await page.evaluate(() => {
    const doc = document.documentElement;
    const demo = document.querySelector('[class*="max-w-[880px]"]');
    const createBtn = [...document.querySelectorAll('button')].find(b => b.textContent.includes('Create Session'));
    const joinBtn = [...document.querySelectorAll('button')].find(b => b.textContent.includes('Join Session'));
    const createVisible = createBtn ? createBtn.getBoundingClientRect().height > 0 : false;
    const joinVisible = joinBtn ? joinBtn.getBoundingClientRect().height > 0 : false;
    const scrollHeight = doc.scrollHeight;
    return {
      overflowX: doc.scrollWidth - doc.clientWidth,
      demoPresent: !!demo,
      demoHeight: demo ? Math.round(demo.getBoundingClientRect().height) : 0,
      createVisible, joinVisible,
      scrollHeight,
    };
  });
  console.log(`${label}px:`, JSON.stringify(r), errors.length ? `ERRORS: ${errors.join(' | ')}` : 'no errors');
  await ctx.close();
}

await browser.close();
