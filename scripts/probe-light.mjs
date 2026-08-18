// Light-mode visual check: landing hero + connect screen.
import { launchBrowser, URL, sleep } from './lib.mjs';

async function main() {
  const browser = await launchBrowser();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, colorScheme: 'light' });
  const page = await ctx.newPage();
  await page.goto(URL, { waitUntil: 'networkidle' });
  await sleep(2500);
  await page.screenshot({ path: '.audit-shots/landing-light.png' });
  console.log('shot: landing-light');
  await ctx.close();

  const ctx2 = await browser.newContext({ viewport: { width: 390, height: 844 }, colorScheme: 'light' });
  const p2 = await ctx2.newPage();
  await p2.goto(URL, { waitUntil: 'networkidle' });
  await p2.getByRole('button', { name: 'Send' }).first().click();
  await p2.getByText('LIVE CODE').waitFor({ timeout: 10000 });
  await sleep(600);
  await p2.screenshot({ path: '.audit-shots/connect-light-mobile.png' });
  console.log('shot: connect-light-mobile');
  await ctx2.close();

  // Join screen in light at mobile
  const ctx3 = await browser.newContext({ viewport: { width: 390, height: 844 }, colorScheme: 'light' });
  const p3 = await ctx3.newPage();
  await p3.goto(URL, { waitUntil: 'networkidle' });
  await p3.getByRole('button', { name: 'Receive' }).first().click();
  await sleep(800);
  await p3.screenshot({ path: '.audit-shots/join-light-mobile.png' });
  console.log('shot: join-light-mobile');
  await ctx3.close();

  await browser.close();
}

main().catch((e) => { console.error('PROBE FAIL', String(e).slice(0, 400)); process.exit(1); });
