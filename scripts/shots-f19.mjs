// F19 visual foundation reset: BEFORE/AFTER baseline with identical framing.
// Real product state everywhere: a real two-device room with a real message,
// the real pairing screen, the real QR overlay, the real settings overlay,
// the real empty space, the real error fallback (lazy-chunk abort).
// Output: docs/audits/shots-f19-{before,after}/ (untracked by convention).
// Run: F19_PHASE=after node scripts/shots-f19.mjs
import { launchBrowser, URL, sleep } from './lib.mjs';
import { mkdirSync } from 'node:fs';
import crypto from 'node:crypto';

const PHASE = process.env.F19_PHASE === 'after' ? 'after' : 'before';
const OUT = `docs/audits/shots-f19-${PHASE}`;
mkdirSync(OUT, { recursive: true });

const DESK = { width: 1440, height: 900 };
const DESK2 = { width: 1280, height: 800 };
const MOB = (w) => ({ width: w, height: 812, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
const LAND = { width: 844, height: 390, isMobile: true, hasTouch: true };

let failures = 0;
async function shot(page, name) {
  try { await page.screenshot({ path: `${OUT}/${name}.png` }); console.log('shot', name); }
  catch (e) { failures++; console.log('FAIL', name, e.message.split('\n')[0]); }
}

async function setDark(page, on) {
  await page.evaluate((d) => {
    document.documentElement.classList.toggle('dark', d);
    try { localStorage.setItem('sharetext.theme', JSON.stringify(d ? 'dark' : 'light')); } catch {}
  }, on);
  await sleep(420);
}

async function setLang(page, lang) {
  await page.evaluate((l) => { try { localStorage.setItem('sharetext.locale', l); } catch {} }, lang);
}

// A demo shot must be deterministic: from `open`, tap Send and hold the
// machine on the sending beat; if it already walked, hold on the arrived
// still instead — both are fixed, short states of the same story.
async function pinDemo(page, _fraction) {
  const state = await page.evaluate(() => document.querySelector('[data-testid="hero-demo"]')?.getAttribute('data-state'));
  if (state === 'open') {
    await page.evaluate(() => { document.querySelector('[data-testid="demo-send"]')?.click(); });
    await page.waitForFunction(
      () => document.querySelector('[data-testid="hero-demo"]')?.getAttribute('data-state') === 'sending',
      null, { timeout: 8000 },
    );
    await sleep(650); // settle: springs land before the shutter
  } else {
    await page.waitForFunction(
      () => ['received', 'done'].includes(document.querySelector('[data-testid="hero-demo"]')?.getAttribute('data-state') || ''),
      null, { timeout: 8000 },
    ).catch(() => {});
    await sleep(300);
  }
}

async function seedSpace() {
  const spaceId = crypto.randomUUID();
  const deviceKey = crypto.randomBytes(8).toString('hex');
  const H = { 'content-type': 'application/json', 'x-device-key': deviceKey, 'x-device-name': 'Seed' };
  const cr = await fetch(`${URL}/space/${spaceId}/create`, { method: 'POST', headers: H, body: JSON.stringify({ name: 'Weekend trip', durationMs: 86400000 }) }).then(r => r.json());
  return { spaceId, token: cr.token };
}

async function main() {
  const browser = await launchBrowser();
  const errs = [];
  const pageErrors = (tag) => (e) => errs.push(`${tag}: ${e.message}`);

  // ── HOME: 375 light · 390 dark · 430 light · 1280 light · 1440 dark/light ──
  const homeShots = [
    [MOB(375), '375-light', false],
    [MOB(390), '390-dark', true],
    [MOB(430), '430-light', false],
    [DESK2, '1280-light', false],
    [DESK, '1440-dark', true],
    [DESK, '1440-light', false],
  ];
  for (const [vp, tag, dark] of homeShots) {
    const ctx = await browser.newContext({ viewport: vp });
    const p = await ctx.newPage();
    p.on('pageerror', pageErrors(`home-${tag}`));
    await p.goto(URL, { waitUntil: 'networkidle' }); await sleep(1100);
    if (dark) await setDark(p, true);
    await pinDemo(p, 0.62);
    await shot(p, `home-${tag}`);
    if (!vp.isMobile) { // landscape proof on the home as well
      await p.setViewportSize({ width: 844, height: 390 });
      await sleep(700); await pinDemo(p, 0.62);
      await shot(p, `home-landscape-${tag}`);
    }
    await ctx.close();
  }

  // ── PAIRING + QR (real Send flow) ──────────────────────────────────────
  for (const [vp, tag] of [[DESK2, '1280'], [MOB(375), '375']]) {
    const ctx = await browser.newContext({ viewport: vp });
    const p = await ctx.newPage();
    p.on('pageerror', pageErrors(`pairing-${tag}`));
    await p.goto(URL, { waitUntil: 'networkidle' }); await sleep(900);
    await p.getByRole('button', { name: 'Send', exact: true }).click();
    await p.waitForTimeout(1800);
    await shot(p, `pairing-${tag}`);
    // QR overlay: the real "Show QR" control.
    const qr = p.locator('[data-testid="show-qr"]').first();
    if (await qr.count()) {
      await qr.click(); await sleep(800);
      await shot(p, `qr-${tag}`);
    }
    await ctx.close();
  }

  // ── ROOM: real two-device room with a real message ─────────────────────
  {
    const ctxA = await browser.newContext({ viewport: DESK });
    const ctxB = await browser.newContext({ viewport: MOB(375) });
    const pa = await ctxA.newPage(); const pb = await ctxB.newPage();
    pa.on('pageerror', pageErrors('room-a')); pb.on('pageerror', pageErrors('room-b'));

    await pa.goto(URL, { waitUntil: 'domcontentloaded' });
    await pa.getByRole('button', { name: 'Send', exact: true }).click();
    await pa.waitForFunction(() => !!localStorage.getItem('sharetext.session.v1'), null, { timeout: 20000 });
    const { roomId } = await pa.evaluate(() => JSON.parse(localStorage.getItem('sharetext.session.v1')));
    const short = roomId.replace(/-/g, '').slice(0, 8);
    await sleep(1500);
    await shot(pa, `pairing-1440`);

    await pb.goto(URL, { waitUntil: 'domcontentloaded' }); await pb.waitForTimeout(1200);
    await pb.evaluate((code) => { location.href = '/s/' + code; }, short);
    await pb.waitForTimeout(3500);
    await pa.waitForTimeout(3500);

    // Real content: a message from the creator.
    await pa.getByTestId('composer').first().fill('hello room');
    await pa.getByTestId('composer').first().press('Enter');
    await pb.waitForTimeout(2500);
    await pa.waitForTimeout(1500);

    await shot(pa, `room-1440-light`);
    await setDark(pa, true);
    await shot(pa, `room-1440-dark`);
    await shot(pb, `room-375-light`);
    await setDark(pb, true);
    await shot(pb, `room-390-dark`);

    // Settings overlay: real control, real surface.
    const gear = pa.locator('[data-testid="open-settings"]').first();
    if (await gear.count()) {
      await setDark(pa, false);
      await gear.click(); await sleep(900);
      await shot(pa, `settings-1440`);
    }
    await ctxA.close(); await ctxB.close();
  }

  // ── SPACE (empty state, real backend) ──────────────────────────────────
  {
    const { spaceId, token } = await seedSpace();
    const url = `${URL}/space/${spaceId}#k=${token}`;
    for (const [vp, tag] of [[DESK2, '1280'], [MOB(375), '375']]) {
      const ctx = await browser.newContext({ viewport: vp });
      const p = await ctx.newPage();
      p.on('pageerror', pageErrors(`space-${tag}`));
      await p.goto(url, { waitUntil: 'networkidle' });
      await p.getByTestId('space-empty').first().waitFor({ timeout: 12000 }).catch(() => {});
      await sleep(1200);
      await shot(p, `space-${tag}`);
      await ctx.close();
    }
  }

  // ── DOCS / ABOUT / 404: desktop 1280 + mobile 375, light ──────────────
  for (const route of ['docs', 'about', 'no-such-page']) {
    const name = route === 'no-such-page' ? '404' : route;
    for (const [vp, tag] of [[DESK2, '1280'], [MOB(375), '375']]) {
      const ctx = await browser.newContext({ viewport: vp });
      const p = await ctx.newPage();
      p.on('pageerror', pageErrors(`${name}-${tag}`));
      await p.goto(`${URL}/${route}`, { waitUntil: 'networkidle' }); await sleep(900);
      await shot(p, `${name}-${tag}`);
      await ctx.close();
    }
  }

  // ── ERROR: abort the lazy Docs chunk — the real ErrorFallback ─────────
  for (const dark of [false, true]) {
    const ctx = await browser.newContext({ viewport: DESK2 });
    const p = await ctx.newPage();
    p.on('pageerror', pageErrors('error'));
    if (dark) await p.addInitScript(() => { try { localStorage.setItem('sharetext.theme', JSON.stringify('dark')); } catch {} });
    await p.route('**/src/views/Docs.tsx*', r => r.abort());
    await p.goto(`${URL}/docs`, { waitUntil: 'domcontentloaded' });
    await sleep(2000);
    const isError = await p.evaluate(() => document.body.textContent.includes('Something went wrong'));
    if (isError) await shot(p, `error-1280-${dark ? 'dark' : 'light'}`);
    else console.log('error screen did not trigger for', dark ? 'dark' : 'light');
    await ctx.close();
  }

  // ── RTL: home · room · docs (desktop, ar) ──────────────────────────────
  {
    const ctxA = await browser.newContext({ viewport: DESK });
    const pa = await ctxA.newPage();
    pa.on('pageerror', pageErrors('rtl-home'));
    await pa.goto(URL, { waitUntil: 'networkidle' }); await sleep(900);
    await setLang(pa, 'ar'); await pa.reload({ waitUntil: 'networkidle' }); await sleep(1100);
    await pinDemo(pa, 0.62);
    await shot(pa, `rtl-home-1440`);
    // Real RTL room: create + self-join in the same context is not the real
    // path; reuse the short-link join with a second context.
    await pa.getByRole('button', { name: 'إرسال', exact: true }).click().catch(async () => {
      await pa.getByRole('button', { name: 'Send', exact: true }).click().catch(() => {});
    });
    await pa.waitForFunction(() => !!localStorage.getItem('sharetext.session.v1'), null, { timeout: 20000 });
    const { roomId } = await pa.evaluate(() => JSON.parse(localStorage.getItem('sharetext.session.v1')));
    const short = roomId.replace(/-/g, '').slice(0, 8);
    const ctxB = await browser.newContext({ viewport: DESK });
    const pb = await ctxB.newPage();
    pb.on('pageerror', pageErrors('rtl-room'));
    await pb.goto(URL, { waitUntil: 'domcontentloaded' });
    await pb.evaluate((l) => { try { localStorage.setItem('sharetext.locale', l); } catch {} }, 'ar');
    await pb.evaluate((code) => { location.href = '/s/' + code; }, short);
    await pb.waitForTimeout(4000);
    await shot(pb, `rtl-room-1440`);
    await ctxA.close(); await ctxB.close();

    const ctxC = await browser.newContext({ viewport: DESK2 });
    const pc = await ctxC.newPage();
    pc.on('pageerror', pageErrors('rtl-docs'));
    await pc.goto(`${URL}/docs`, { waitUntil: 'domcontentloaded' });
    await pc.evaluate((l) => { try { localStorage.setItem('sharetext.locale', l); } catch {} }, 'ar');
    await pc.reload({ waitUntil: 'networkidle' }); await sleep(1000);
    await shot(pc, `rtl-docs-1280`);
    await ctxC.close();
  }

  console.log('page errors:', errs.length ? errs.join(' | ') : '(none)');
  await browser.close();
  console.log(`F19 ${PHASE} shots → ${OUT}/ (failures: ${failures})`);
  if (failures > 0) process.exit(1);
}

main().catch(e => { console.error('SHOTS FAILED', e); process.exit(1); });
