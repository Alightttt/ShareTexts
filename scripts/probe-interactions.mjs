import { launchBrowser, URL, sleep, pairDevices } from './lib.mjs';

const b = await launchBrowser();
try {
  const ctxA = await b.newContext({ viewport: { width: 1280, height: 900 } });
  const ctxB = await b.newContext({ viewport: { width: 1280, height: 900 } });
  const A = await ctxA.newPage();
  const B = await ctxB.newPage();
  A.on('pageerror', e => console.log('A-ERR', e.message.slice(0, 100)));
  await A.goto(URL, { waitUntil: 'networkidle' });
  await B.goto(URL, { waitUntil: 'networkidle' });
  const code = await pairDevices(A, B);
  console.log('paired with', code);

  // 1. Send button states: disabled empty, enabled with text.
  const sendDisabled = await A.evaluate(() => {
    const btn = document.querySelector('button[aria-label="Send"]');
    return btn.disabled;
  });
  await A.locator('textarea[aria-label="Message"]').fill('hello');
  const sendEnabled = await A.evaluate(() => {
    const btn = document.querySelector('button[aria-label="Send"]');
    return !btn.disabled;
  });
  console.log('SEND states: disabled-empty=' + sendDisabled + ' enabled-with-text=' + sendEnabled);

  // 2. Attach a file, verify tile + remove, then remove it.
  await A.getByRole('button', { name: 'Add attachment' }).click();
  await A.getByRole('button', { name: 'File' }).click();
  await A.locator('input[type="file"]').last().setInputFiles({
    name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('hello notes'),
  });
  await sleep(400);
  const tileShown = await A.evaluate(() => [...document.querySelectorAll('span')].some(s => s.textContent === 'notes.txt'));
  const removeBtn = A.getByRole('button', { name: 'Remove attachment' });
  const hasRemove = await removeBtn.count();
  await removeBtn.click();
  await sleep(400);
  const tileGone = await A.evaluate(() => ![...document.querySelectorAll('span')].some(s => s.textContent === 'notes.txt'));
  console.log('ATTACH: tile=' + tileShown + ' removeBtn=' + hasRemove + ' goneAfterRemove=' + tileGone);

  // 3. End-session dialog: autofocus should land on Keep Session.
  await A.getByRole('button', { name: 'End session' }).first().click();
  await sleep(500);
  const focused = await A.evaluate(() => document.activeElement?.textContent?.trim() || 'none');
  console.log('DIALOG focused:', JSON.stringify(focused));
  await A.keyboard.press('Escape');
  await sleep(700); // let the dialog's exit animation fully unmount it
  const dialogClosed = await A.evaluate(() => ![...document.querySelectorAll('h3')].some(h => h.textContent === 'End this session?'));
  console.log('DIALOG escaped-close:', dialogClosed);

  // 4. Composer keyboard hint visible on desktop.
  const hint = await A.evaluate(() => document.body.innerText.includes('Enter') && document.body.innerText.includes('Shift+Enter'));
  console.log('KEYBOARD hint:', hint);

  const parts = {
    sendDisabledEmpty: sendDisabled, sendEnabled, tileShown, hasRemoveOne: hasRemove === 1,
    tileGone, focusedKeep: focused === 'Keep Session', dialogClosed, hint,
  };
  const ok = Object.values(parts).every(Boolean);
  console.log('PARTS:', JSON.stringify(parts));
  console.log(ok ? 'INTERACTIONS_OK' : 'INTERACTIONS_FAIL');
} finally { await b.close(); }
