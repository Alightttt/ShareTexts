import { launchBrowser, URL, sleep, readLiveCode, waitForChat } from './lib.mjs';
async function main() {
  const browser = await launchBrowser();
  const ctxA = await browser.newContext({ viewport: { width: 375, height: 812 } });
  const ctxB = await browser.newContext({ viewport: { width: 375, height: 812 } });
  const A = await ctxA.newPage(); const B = await ctxB.newPage();
  await A.goto(URL, { waitUntil: 'networkidle' }); await B.goto(URL, { waitUntil: 'networkidle' });
  await sleep(1200);
  await A.getByRole('button', { name: 'Send' }).first().click();
  await A.getByText('LIVE CODE').waitFor({ timeout: 10000 });
  const code = await readLiveCode(A);
  await B.getByRole('button', { name: 'Receive' }).first().click();
  await B.locator('input[inputmode="numeric"]').fill(code);
  await waitForChat(B, 'B'); await waitForChat(A, 'A');
  const geo = await A.evaluate(() => {
    const header = Array.from(document.querySelectorAll('div')).find(d => d.textContent && d.textContent.includes('End room') && d.className.toString().includes('backdrop-blur-xl'));
    if (!header) return null;
    const r = header.getBoundingClientRect();
    const overflow = document.documentElement.scrollWidth > document.documentElement.clientWidth;
    // chip + name alignment inside header button
    const btn = header.querySelector('button');
    let chipY = null, nameY = null;
    if (btn) {
      const spans = Array.from(btn.querySelectorAll('span'));
      const name = spans.find(s => /Guest|Other device/.test(s.textContent || ''));
      const chip = spans.find(s => /Connected|Offline/.test(s.textContent || ''));
      if (name && chip) { nameY = Math.round(name.getBoundingClientRect().y); chipY = Math.round(chip.getBoundingClientRect().y); }
    }
    return { headerW: Math.round(r.width), headerH: Math.round(r.height), overflow, nameY, chipY, docW: document.documentElement.scrollWidth, clientW: document.documentElement.clientWidth };
  });
  console.log(JSON.stringify(geo, null, 2));
  const ok = geo && !geo.overflow && geo.nameY === geo.chipY;
  console.log(ok ? 'CHAT-MOBILE-OK' : 'CHAT-MOBILE-FAIL');
  await A.screenshot({ path: '.audit-shots/chat-mobile-375.png' });
  await browser.close();
  process.exit(ok ? 0 : 1);
}
main().catch((e) => { console.error('FAIL', String(e).slice(0, 400)); process.exit(1); });
