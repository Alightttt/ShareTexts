// Screenshot each new landing section at desktop width for visual inspection.
import { launchBrowser, URL, sleep } from './lib.mjs';

const TARGETS = [
  ['how-it-works', 'Two screens. One page.'],
  ['instead-of', 'Every other way comes with a catch.'],
  ['privacy', 'What happens to your text?'],
  ['faq', 'Questions people actually ask.'],
];

async function main() {
  const browser = await launchBrowser();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await ctx.newPage();
  await page.goto(URL, { waitUntil: 'networkidle' });
  await sleep(2000);

  for (const [name, heading] of TARGETS) {
    const found = await page.evaluate((h) => {
      const els = Array.from(document.querySelectorAll('h2'));
      const el = els.find((e) => e.textContent.includes(h));
      if (!el) return false;
      el.scrollIntoView({ block: 'start' });
      return true;
    }, heading);
    if (!found) { console.log(`MISS: ${name}`); continue; }
    await sleep(1200);
    await page.screenshot({ path: `.audit-shots/section-${name}.png` });
    console.log(`shot: section-${name}`);
  }
  await ctx.close();
  await browser.close();
}

main().catch((e) => { console.error('PROBE FAIL', String(e).slice(0, 400)); process.exit(1); });
