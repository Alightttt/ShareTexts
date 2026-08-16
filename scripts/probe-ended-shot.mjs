// Screenshot the session-ended screen for visual inspection.
import { launchBrowser, URL, sleep, readLiveCode } from './lib.mjs';

async function main() {
  const browser = await launchBrowser();
  for (const vp of [{ w: 390, h: 844, name: 'mobile' }, { w: 1280, h: 800, name: 'desktop' }]) {
    const ctxA = await browser.newContext({ viewport: { width: vp.w, height: vp.h } });
    const ctxB = await browser.newContext({ viewport: { width: vp.w, height: vp.h } });
    const A = await ctxA.newPage();
    const B = await ctxB.newPage();
    await A.goto(URL, { waitUntil: 'networkidle' });
    await A.getByRole('button', { name: 'Send text' }).first().click();
    await A.getByText('LIVE CODE').waitFor({ timeout: 10000 });
    await B.goto(URL, { waitUntil: 'networkidle' });
    await B.getByRole('button', { name: 'Receive text' }).first().click();
    await B.locator('input[inputmode="numeric"]').waitFor({ timeout: 10000 });
    const code = await readLiveCode(A);
    await B.locator('input[inputmode="numeric"]').fill(code);
    await A.locator('textarea[placeholder]').waitFor({ timeout: 15000 });
    await sleep(400);
    await A.getByRole('button', { name: 'End session' }).first().click();
    await sleep(400);
    await A.getByRole('button', { name: 'End session' }).last().click();
    await sleep(1500);
    await A.screenshot({ path: `.audit-shots/ended-${vp.name}.png` });
    console.log(`shot: ended-${vp.name}`);
    await ctxA.close();
    await ctxB.close();
  }
  await browser.close();
}

main().catch((e) => { console.error('PROBE FAIL', String(e).slice(0, 400)); process.exit(1); });
