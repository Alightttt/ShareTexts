// Dark-mode audit: same flow as audit-all.mjs but with prefers-color-scheme: dark.
// Reports overflow, page errors, and samples body/card/text colors to catch contrast bugs.
import { launchBrowser, URL, sleep } from './lib.mjs';

const browser = await launchBrowser();
const viewports = [[320, 700, '320'], [390, 844, '390'], [768, 1024, '768'], [1280, 900, '1280'], [1512, 982, '1512']];
let failures = 0;

for (const [w, h, label] of viewports) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, colorScheme: 'dark' });
  const A = await ctx.newPage();
  const errors = [];
  A.on('pageerror', e => errors.push(e.message));
  await A.goto(URL, { waitUntil: 'networkidle' });
  await sleep(800);

  const sample = () => A.evaluate(() => {
    const body = getComputedStyle(document.body);
    const h1 = document.querySelector('h1');
    const card = [...document.querySelectorAll('div')].find(d => {
      const s = getComputedStyle(d);
      return s.backgroundColor === 'rgb(28, 28, 30)' || s.backgroundColor === 'rgb(28,28,30)';
    });
    return {
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      bodyBg: body.backgroundColor,
      bodyText: body.color,
      h1Color: h1 ? getComputedStyle(h1).color : null,
    };
  });

  let r = await sample();
  console.log(`[${label}] landing overflow=${r.overflow} bodyBg=${r.bodyBg} bodyText=${r.bodyText} h1=${r.h1Color}`);

  await A.getByRole('button', { name: 'Start a transfer' }).first().click();
  await A.waitForSelector('text=Live Code', { timeout: 8000 });
  await sleep(400);
  r = await sample();
  console.log(`[${label}] roomhub overflow=${r.overflow} bodyBg=${r.bodyBg} bodyText=${r.bodyText}`);

  // Chat with a message
  const ctxB = await browser.newContext({ viewport: { width: w, height: h }, colorScheme: 'dark' });
  const B = await ctxB.newPage();
  await B.goto(URL, { waitUntil: 'networkidle' });
  await sleep(500);
  await B.getByRole('button', { name: 'Already have a code?' }).first().click();
  await B.waitForSelector('text=Scan QR instead', { timeout: 8000 });
  const code = await A.evaluate(() =>
    [...document.querySelectorAll('[class*=font-mono]')].map(el => el.textContent).join('') || '');
  if (code.length === 6) await B.locator('input[inputmode="numeric"]').fill(code);
  await sleep(2000);
  const ta = A.locator('textarea').first();
  await ta.fill('dark mode audit');
  await A.getByRole('button', { name: 'Send' }).click();
  await sleep(800);
  await B.waitForSelector('text=dark mode audit', { timeout: 8000 }).catch(() => {});
  await sleep(300);
  r = await A.evaluate(() => {
    const bubble = [...document.querySelectorAll('div')].find(d =>
      d.className && typeof d.className === 'string' && d.className.includes('bg-azure-600') && d.className.includes('rounded'));
    const bubbleText = bubble ? getComputedStyle(bubble).color : null;
    return {
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      bubbleText,
    };
  });
  console.log(`[${label}] chat overflow=${r.overflow} bubbleText=${r.bubbleText}`);

  if (errors.length) { failures++; console.log(`[${label}] PAGE ERRORS: ${errors.join(' | ')}`); }
  if (r.overflow > 0) failures++;
  await ctxB.close();
  await ctx.close();
}

await browser.close();
console.log(failures ? `DARK FAILURES: ${failures}` : 'DARK MODE CLEAN');
