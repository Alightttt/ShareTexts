// Locale playtest: real pairing with the UI in Arabic (RTL) and Spanish.
// Verifies: <html lang/dir> sync, RTL geometry, translated surfaces, and that
// a full transfer still works end-to-end in a non-English locale.
import { launchBrowser, URL, sleep } from './lib.mjs';

const browser = await launchBrowser();
const fails = [];
const ok = (cond, label) => { console.log(`${cond ? 'OK  ' : 'FAIL'} ${label}`); if (!cond) fails.push(label); };

async function setLocale(page, lang) {
  await page.evaluate((l) => {
    localStorage.setItem('sharetext.locale', l);
    const el = document.documentElement;
    el.lang = l === 'zh' ? 'zh-Hans' : l;
    el.dir = l === 'ar' ? 'rtl' : 'ltr';
  }, lang);
}

async function runLocale(lang, labels) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const A = await ctx.newPage();
  const B = await ctx.newPage();
  const errs = [];
  A.on('pageerror', e => errs.push(`[A] ${e.message}`));
  B.on('pageerror', e => errs.push(`[B] ${e.message}`));

  // Seed the locale before the app boots (localStorage is read at mount).
  await A.goto(URL, { waitUntil: 'domcontentloaded' });
  await setLocale(A, lang);
  await B.goto(URL, { waitUntil: 'domcontentloaded' });
  await setLocale(B, lang);
  await A.reload({ waitUntil: 'networkidle' });
  await B.reload({ waitUntil: 'networkidle' });

  // ── html attrs ──
  const attrs = await A.evaluate(() => ({ lang: document.documentElement.lang, dir: document.documentElement.dir }));
  ok(attrs.lang === lang, `${lang}: <html lang> = ${attrs.lang}`);
  ok(attrs.dir === (lang === 'ar' ? 'rtl' : 'ltr'), `${lang}: <html dir> = ${attrs.dir}`);

  // ── idle: translated hero buttons ──
  await A.getByRole('button', { name: labels.send }).first().waitFor({ timeout: 15000 });
  ok(true, `${lang}: idle hero shows translated Send ("${labels.send}")`);
  const recvBtn = await B.getByRole('button', { name: labels.receive }).first().isVisible({ timeout: 15000 }).catch(() => false);
  ok(recvBtn, `${lang}: idle hero shows translated Receive ("${labels.receive}")`);

  // ── RTL geometry (Arabic only) ──
  if (lang === 'ar') {
    const rtl = await A.evaluate(() => {
      const h1 = document.querySelector('h1');
      const hb = h1?.getBoundingClientRect();
      const vw = window.innerWidth;
      const cs = h1 ? getComputedStyle(h1) : null;
      return {
        docX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        bodyDir: getComputedStyle(document.body).direction,
        h1LeftGap: hb ? Math.round(hb.left) : null,
        h1RightGap: hb ? Math.round(vw - hb.right) : null,
      };
    });
    ok(rtl.bodyDir === 'rtl', 'ar: body computes direction rtl');
    ok(rtl.docX === 0, 'ar: no horizontal overflow under RTL');
    // Under RTL the text-align flips to the right; the right gap should be
    // smaller than the left gap for the left-aligned-by-default hero text.
    ok(rtl.h1RightGap !== null && rtl.h1RightGap < rtl.h1LeftGap, `ar: hero hugs the right edge (${rtl.h1LeftGap} left vs ${rtl.h1RightGap} right)`);
  }

  // ── pair: A creates, B joins — the pairing group's accessible name is translated ──
  await A.getByRole('button', { name: labels.send }).first().click();
  await A.getByRole('group', { name: labels.pairingCode }).waitFor({ timeout: 15000 });
  ok(true, `${lang}: pairing group announced as "${labels.pairingCode}"`);
  const group = A.getByRole('group', { name: labels.pairingCode });
  let code = '';
  for (let i = 0; i < 10 && !/^\d{6}$/.test(code); i++) {
    const digits = await group.locator('span').filter({ hasText: /^\d$/ }).allTextContents();
    code = digits.slice(-6).join('');
    if (!/^\d{6}$/.test(code)) await sleep(300);
  }
  ok(/^\d{6}$/.test(code), `${lang}: read a stable 6-digit code (${code})`);

  await B.getByRole('button', { name: labels.receive }).first().click();
  await B.locator('input[inputmode="numeric"]').fill(code);
  await B.getByTestId('composer').first().waitFor({ timeout: 20000 });
  await A.getByTestId('composer').first().waitFor({ timeout: 20000 });
  ok(true, `${lang}: paired — both devices in the room`);

  // ── connected: translated chat marker + transfer works ──
  const chatMarker = await B.evaluate((m) => document.body.innerText.includes(m), labels.readyMarker);
  ok(chatMarker, `${lang}: connected room shows translated "${labels.readyMarker}"`);

  await A.locator('textarea').first().fill(labels.testMsg);
  await A.getByTestId('send').click();
  await sleep(1800);
  const got = await B.evaluate((m) => document.body.innerText.includes(m), labels.testMsg);
  ok(got, `${lang}: text transferred end-to-end in ${lang}`);

  // ── screenshots: idle + connected at 375 and 1280 (only for these two locales) ──
  if (labels.shots) {
    const idleA = await ctx.newPage();
    await idleA.setViewportSize({ width: 375, height: 812 });
    await idleA.goto(URL, { waitUntil: 'networkidle' });
    await sleep(700);
    await idleA.screenshot({ path: `.audit-shots/locale-${lang}-idle-375.png`, fullPage: true });
    await idleA.setViewportSize({ width: 1280, height: 900 });
    await sleep(700);
    await idleA.screenshot({ path: `.audit-shots/locale-${lang}-idle-1280.png` });
    await idleA.close();
    await B.screenshot({ path: `.audit-shots/locale-${lang}-connected-375.png` });
    await B.setViewportSize({ width: 375, height: 812 });
    await sleep(700);
    await B.screenshot({ path: `.audit-shots/locale-${lang}-connected-375.png`, fullPage: true });
    await B.setViewportSize({ width: 1280, height: 900 });
    await sleep(700);
    await A.screenshot({ path: `.audit-shots/locale-${lang}-connected-1280.png` });
  }

  if (errs.length) ok(false, `${lang}: page errors — ${errs.slice(0, 3).join(' | ')}`);
  else ok(true, `${lang}: no page errors`);
  await ctx.close();
}

await runLocale('ar', {
  send: 'إرسال', receive: 'استقبال', pairingCode: 'رمز الاقتران',
  readyMarker: 'جاهز وقتما تشاء', // chat.ready (exact ar string)
  testMsg: 'مرحبا من الجهاز الأول',
  shots: true,
});
await runLocale('es', {
  send: 'Enviar', receive: 'Recibir', pairingCode: 'Código de emparejamiento',
  readyMarker: 'Listo cuando lo estés', // chat.ready
  testMsg: 'Hola desde el dispositivo uno',
  shots: true,
});

await browser.close();
if (fails.length) { console.log('\nFAILURES:'); fails.forEach(f => console.log(' -', f)); process.exit(1); }
console.log('\nLocale walk complete: all checks passed.');
