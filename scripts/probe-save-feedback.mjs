import { launchBrowser, URL, sleep, pairDevices } from './lib.mjs';
const b = await launchBrowser();
try {
  const ctxA = await b.newContext({ viewport: { width: 1280, height: 900 } });
  const ctxB = await b.newContext({ viewport: { width: 1280, height: 900 } });
  const A = await ctxA.newPage();
  const B = await ctxB.newPage();
  await A.goto(URL, { waitUntil: 'networkidle' });
  await A.locator('text=Move anything between your devices').first().waitFor({ timeout: 15000 });

  // Landing button colors (light mode): Send = blue, Receive = ink.
  const colors = await A.evaluate(() => {
    const btn = (t) => [...document.querySelectorAll('button')].find(b => b.textContent.trim() === t);
    const s = btn('Send'), r = btn('Receive');
    const cs = getComputedStyle(s), cr = getComputedStyle(r);
    return { sendBg: cs.backgroundColor, recvBg: cr.backgroundColor };
  });
  console.log('LIGHT button colors:', JSON.stringify(colors));

  await B.goto(URL, { waitUntil: 'networkidle' });
  await pairDevices(A, B);

  // Send a small file from A, wait for completion, click Save, expect "Saved".
  await A.getByRole('button', { name: 'Add attachment' }).click();
  await A.getByRole('button', { name: 'File' }).click();
  await A.locator('input[type="file"]').last().setInputFiles({
    name: 'report.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 hello'),
  });
  await sleep(300);
  await A.getByRole('button', { name: 'Send' }).click();
  // Wait for the card to complete — the Save action only exists then.
  let complete = false;
  for (let i = 0; i < 80; i++) {
    complete = await A.evaluate(() => [...document.querySelectorAll('button')].some(b => b.textContent?.trim() === 'Save'));
    if (complete) break;
    await sleep(150);
  }
  await sleep(300);
  await A.getByRole('button', { name: 'Save' }).click();
  await sleep(300);
  const savedShown = await A.evaluate(() => [...document.querySelectorAll('button')].some(b => b.textContent?.trim() === 'Saved'));
  await sleep(2200);
  const reverted = await A.evaluate(() => [...document.querySelectorAll('button')].some(b => b.textContent?.trim() === 'Save'));
  console.log('SAVE feedback: complete=' + complete + ' savedShown=' + savedShown + ' reverted=' + reverted);

  // Dark mode button colors on a fresh page.
  const ctxD = await b.newContext({ viewport: { width: 1280, height: 900 }, colorScheme: 'dark' });
  const D = await ctxD.newPage();
  await D.goto(URL, { waitUntil: 'networkidle' });
  await D.locator('text=Move anything between your devices').first().waitFor({ timeout: 15000 });
  const dark = await D.evaluate(() => {
    const btn = (t) => [...document.querySelectorAll('button')].find(b => b.textContent.trim() === t);
    const s = btn('Send'), r = btn('Receive');
    return { sendBg: getComputedStyle(s).backgroundColor, recvBg: getComputedStyle(r).backgroundColor, recvColor: getComputedStyle(r).color };
  });
  console.log('DARK button colors:', JSON.stringify(dark));
  await ctxD.close();

  const ok = complete && savedShown && reverted
    && colors.sendBg === 'rgb(10, 102, 240)' && colors.recvBg === 'rgb(29, 29, 31)'
    && dark.sendBg === 'rgb(10, 102, 240)' && dark.recvBg === 'rgb(255, 255, 255)';
  console.log(ok ? 'SAVE_FEEDBACK_OK' : 'SAVE_FEEDBACK_FAIL');
} finally { await b.close(); }
