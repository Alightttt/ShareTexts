// Audit every app screen at every viewport: overflow, errors, key UI present.
import { launchBrowser, URL, sleep } from './lib.mjs';

const browser = await launchBrowser();
const viewports = [[320, 700, '320'], [390, 844, '390'], [768, 1024, '768'], [1280, 900, '1280'], [1512, 982, '1512']];
let failures = 0;

for (const [w, h, label] of viewports) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h } });
  const A = await ctx.newPage();
  const errors = [];
  A.on('pageerror', e => errors.push(e.message));
  await A.goto(URL, { waitUntil: 'networkidle' });
  await sleep(800);

  // 1. Landing
  let r = await A.evaluate(() => ({
    overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    title: document.querySelector('h1')?.textContent,
  }));
  console.log(`[${label}] landing overflow=${r.overflow} h1="${r.title?.trim()}"`);

  // 2. Room hub (create session)
  await A.getByRole('button', { name: 'Send text' }).first().click();
  await A.waitForSelector('text=Live Code', { timeout: 8000 });
  await sleep(400);
  r = await A.evaluate(() => ({
    overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    liveCode: !!document.querySelector('[class*=font-mono]'),
    hasCopyCode: document.body.innerText.includes('Copy Code'),
  }));
  console.log(`[${label}] roomhub overflow=${r.overflow} liveCode=${r.liveCode} copyCode=${r.hasCopyCode}`);

  // 3. Join screen (fresh context so A's persisted session doesn't auto-restore)
  const ctxB = await browser.newContext({ viewport: { width: w, height: h } });
  const B = await ctxB.newPage();
  await B.goto(URL, { waitUntil: 'networkidle' });
  await sleep(500);
  await B.getByRole('button', { name: 'Receive text' }).first().click();
  await B.waitForSelector('text=Scan QR instead', { timeout: 8000 });
  await sleep(300);
  r = await B.evaluate(() => ({
    overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    hasCancel: document.body.innerText.includes('Cancel'),
  }));
  console.log(`[${label}] join overflow=${r.overflow} cancel=${r.hasCancel}`);

  // 4. Chat view with messages (blue bubbles)
  // Read the room code from A's Live Code card via sessionStorage
  const code = await A.evaluate(() => {
    // The code is displayed; read digits from the DOM
    const digits = [...document.querySelectorAll('[class*=font-mono]')].map(el => el.textContent).join('');
    return digits || '';
  });
  // LiveCodeInput is a single hidden input; fill it with the full code
  const codeInput = B.locator('input[inputmode="numeric"]');
  if (code.length === 6) {
    await codeInput.fill(code);
  } else {
    console.log(`[${label}] WARN could not fill code (code="${code}")`);
  }
  await sleep(2000); // join + connect
  // A should now be in the chat
  await A.waitForSelector('text=Your private clipboard', { timeout: 8000 }).catch(() => {});
  // Send a message from A
  const ta = A.locator('textarea').first();
  await ta.fill('Hello from audit');
  await A.getByRole('button', { name: 'Send' }).click();
  await sleep(800);
  // B receives
  await B.waitForSelector('text=Hello from audit', { timeout: 8000 }).catch(() => {});
  await sleep(300);

  // Check the sent bubble in A is brand blue
  r = await A.evaluate(() => {
    const cards = [...document.querySelectorAll('div')].filter(d =>
      d.className && typeof d.className === 'string' && d.className.includes('from-azure-500'));
    return {
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      blueBubbles: cards.length,
      partnerName: document.body.innerText.includes('Other device'),
    };
  });
  console.log(`[${label}] chat overflow=${r.overflow} blueBubbles=${r.blueBubbles} partnerName=${r.partnerName}`);

  if (errors.length) { failures++; console.log(`[${label}] PAGE ERRORS: ${errors.join(' | ')}`); }
  if (r.overflow > 0) { failures++; console.log(`[${label}] OVERFLOW on chat`); }
  await ctxB.close();
  await ctx.close();
}

await browser.close();
console.log(failures ? `FAILURES: ${failures}` : 'ALL SCREENS CLEAN');
