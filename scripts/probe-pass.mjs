import { launchBrowser, URL, sleep, readLiveCode, waitForChat } from './lib.mjs';

const b = await launchBrowser();
try {
  const ctxA = await b.newContext({ viewport: { width: 1440, height: 900 } });
  const ctxB = await b.newContext({ viewport: { width: 1440, height: 900 } });
  const A = await ctxA.newPage();
  const B = await ctxB.newPage();
  await A.goto(URL, { waitUntil: 'networkidle' });
  await B.goto(URL, { waitUntil: 'networkidle' });

  // Landing CTAs
  const landing = await A.evaluate(() => ({
    start: [...document.querySelectorAll('button')].some(b => b.textContent?.includes('Start a transfer')),
    haveCode: [...document.querySelectorAll('button')].some(b => b.textContent?.includes('Already have a code?')),
  }));

  await A.getByRole('button', { name: 'Start a transfer' }).first().click();
  await A.getByText('LIVE CODE').waitFor({ timeout: 10000 });
  // Rotation message: dynamic countdown, not the static 40s line
  const rotText = await A.evaluate(() => [...document.querySelectorAll('p')].map(p => p.textContent).find(t => t && t.includes('refreshes in')));
  const code = await readLiveCode(A);
  await B.getByRole('button', { name: 'Already have a code?' }).first().click();
  await B.locator('input[inputmode="numeric"]').fill(code);
  await waitForChat(B, 'B');
  await waitForChat(A, 'A');
  await sleep(800);

  // Connected room: no pairing code card in the rail; code lives in details
  const chat = await A.evaluate(() => {
    const visible = [...document.querySelectorAll('div')].filter(d => d.className?.includes?.('xl:flex') && d.className?.includes?.('hidden')).length;
    const railText = [...document.querySelectorAll('div')].map(d => d.textContent).filter(t => t && t.includes('Pairing code') || t.includes('Rejoin code'));
    const hasHint = [...document.querySelectorAll('kbd')].some(k => k.textContent === 'Enter');
    return { railPairingCards: railText.length, keyboardHint: hasHint };
  });
  // Open connection details → Rejoin code should be there
  await A.getByRole('button', { name: /connection details/i }).last().click().catch(() => {});
  await sleep(500);
  const details = await A.evaluate(() => ({
    rejoinVisible: [...document.querySelectorAll('div')].some(d => d.textContent?.includes('Rejoin code') && d.getBoundingClientRect().height > 0),
  }));

  console.log(JSON.stringify({ landing, rotText, chat, details }, null, 2));
  const ok = landing.start && landing.haveCode && !!rotText && chat.keyboardHint && details.rejoinVisible;
  console.log(ok ? 'PASS_OK' : 'PASS_FAIL');
} finally {
  await b.close();
}
