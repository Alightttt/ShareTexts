// Capture landing hero + full page at several viewports for visual inspection.
import { launchBrowser, URL, sleep } from './lib.mjs';

async function main() {
  const browser = await launchBrowser();
  for (const vp of [{ w: 1440, h: 1000, name: 'desktop' }, { w: 390, h: 844, name: 'mobile' }, { w: 1024, h: 768, name: 'tablet' }]) {
    const ctx = await browser.newContext({ viewport: { width: vp.w, height: vp.h } });
    const page = await ctx.newPage();
    await page.goto(URL, { waitUntil: 'networkidle' });
    await sleep(2600);
    await page.screenshot({ path: `.audit-shots/landing-${vp.name}.png` });
    console.log(`shot: landing-${vp.name}`);
    await ctx.close();
  }
  await browser.close();
}

main().catch((e) => { console.error('PROBE FAIL', String(e).slice(0, 400)); process.exit(1); });
