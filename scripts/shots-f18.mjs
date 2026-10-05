// F18 visual proof: the product showcase round. BEFORE/AFTER with identical
// framing. Output: docs/audits/shots-f18-{before,after}/ (untracked by
// convention). Run: F18_PHASE=after node scripts/shots-f18.mjs
import { launchBrowser, URL, sleep } from './lib.mjs';
import { mkdirSync } from 'node:fs';
import crypto from 'node:crypto';
import zlib from 'node:zlib';

const PHASE = process.env.F18_PHASE === 'after' ? 'after' : 'before';
const OUT = `docs/audits/shots-f18-${PHASE}`;
mkdirSync(OUT, { recursive: true });

const DESK = { width: 1440, height: 900 };
const MOB = { width: 375, height: 812, isMobile: true, hasTouch: true, deviceScaleFactor: 2 };

async function shot(page, name) {
  try { await page.screenshot({ path: `${OUT}/${name}.png` }); console.log('shot', name); }
  catch (e) { console.log('FAIL', name, e.message); }
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

// A demo shot must be deterministic: seek to the transfer beat, then pause,
// so BEFORE and AFTER freeze on the same frame of the same story.
async function pinDemo(page, fraction) {
  await page.evaluate((f) => {
    const rail = document.querySelector('[data-testid="demo-scrubber"]');
    if (!rail) return;
    const r = rail.getBoundingClientRect();
    rail.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: r.left + r.width * f, clientY: r.top + r.height / 2 }));
  }, fraction);
  await sleep(700);
  await page.evaluate(() => {
    const b = document.querySelector('[data-testid="demo-play"]');
    if (b) b.click();
  });
  await sleep(500);
}

function png1x1() {
  const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const body = Buffer.concat([Buffer.from(type), data]); const t = [...Array(256)].map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; }); let crc = 0xffffffff; for (const b of body) crc = t[(crc ^ b) & 0xff] ^ (crc >>> 8); crc = (crc ^ 0xffffffff) >>> 0; const cb = Buffer.alloc(4); cb.writeUInt32BE(crc); return Buffer.concat([len, body, cb]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(1, 0); ihdr.writeUInt32BE(1, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(Buffer.from([0x00, 0xff, 0x00, 0x00]))), chunk('IEND', Buffer.alloc(0))]);
}

async function seedSpace() {
  const spaceId = crypto.randomUUID();
  const deviceKey = crypto.randomBytes(8).toString('hex');
  const H = { 'content-type': 'application/json', 'x-device-key': deviceKey, 'x-device-name': 'Seed' };
  // Empty space for the empty-state shot, plus a filled one for context.
  const crEmpty = await fetch(`${URL}/space/${spaceId}/create`, { method: 'POST', headers: H, body: JSON.stringify({ name: 'Weekend trip', durationMs: 86400000 }) }).then(r => r.json());
  return { spaceId, token: crEmpty.token };
}

async function main() {
  const browser = await launchBrowser();
  const errs = [];
  const variants = [['light', false], ['dark', true], ['ar', 'ar']];

  // ── HOME + DEMO (desktop & mobile) ───────────────────────────────────
  for (const [vp, tag] of [[DESK, 'desktop'], [MOB, 'mobile']]) {
    for (const [vname, darkOrAr] of variants) {
      const ctx = await browser.newContext({ viewport: vp });
      const p = await ctx.newPage();
      p.on('pageerror', e => errs.push(`home-${tag}-${vname}: ${e.message}`));
      await p.goto(URL, { waitUntil: 'networkidle' }); await sleep(1100);
      if (darkOrAr === 'ar') { await setLang(p, 'ar'); await p.reload({ waitUntil: 'networkidle' }); await sleep(1100); }
      else if (darkOrAr) await setDark(p, true);
      await shot(p, `home-${tag}-${vname}`);
      // Demo element shot (desktop: full scene; mobile: phone-only variant).
      const demo = p.locator('[data-testid="hero-demo"]').first();
      try {
        await demo.scrollIntoViewIfNeeded();
        await pinDemo(p, 0.62); // transfer beat
        await demo.screenshot({ path: `${OUT}/demo-${tag}-${vname}.png` });
        console.log('shot', `demo-${tag}-${vname}`);
      } catch (e) { console.log('FAIL demo', tag, vname, e.message.split('\n')[0]); }
      await ctx.close();
    }
  }

  // ── DOCS ─────────────────────────────────────────────────────────────
  for (const [vp, tag] of [[DESK, 'desktop'], [MOB, 'mobile']]) {
    for (const [vname, darkOrAr] of variants) {
      const ctx = await browser.newContext({ viewport: vp });
      const p = await ctx.newPage();
      p.on('pageerror', e => errs.push(`docs-${tag}-${vname}: ${e.message}`));
      await p.goto(`${URL}/docs`, { waitUntil: 'networkidle' }); await sleep(900);
      if (darkOrAr === 'ar') { await setLang(p, 'ar'); await p.reload({ waitUntil: 'networkidle' }); await sleep(900); }
      else if (darkOrAr) await setDark(p, true);
      await shot(p, `docs-${tag}-${vname}`);
      await ctx.close();
    }
  }

  // ── SPACE (empty state, real backend) ────────────────────────────────
  {
    const { spaceId, token } = await seedSpace();
    const url = `${URL}/space/${spaceId}#k=${token}`;
    for (const [vp, tag] of [[DESK, 'desktop'], [MOB, 'mobile']]) {
      for (const [vname, darkOrAr] of variants) {
        const ctx = await browser.newContext({ viewport: vp });
        const p = await ctx.newPage();
        p.on('pageerror', e => errs.push(`space-${tag}-${vname}: ${e.message}`));
        await p.goto(url, { waitUntil: 'networkidle' });
        await p.getByTestId('space-empty').first().waitFor({ timeout: 12000 }).catch(() => {});
        await sleep(1200);
        if (darkOrAr === 'ar') { await setLang(p, 'ar'); await p.reload({ waitUntil: 'networkidle' }); await p.getByTestId('space-empty').first().waitFor({ timeout: 12000 }).catch(() => {}); await sleep(1200); }
        else if (darkOrAr) await setDark(p, true);
        await shot(p, `space-${tag}-${vname}`);
        await ctx.close();
      }
    }
  }

  // ── 404 ──────────────────────────────────────────────────────────────
  for (const [vp, tag] of [[DESK, 'desktop'], [MOB, 'mobile']]) {
    for (const [vname, darkOrAr] of variants) {
      const ctx = await browser.newContext({ viewport: vp });
      const p = await ctx.newPage();
      p.on('pageerror', e => errs.push(`404-${tag}-${vname}: ${e.message}`));
      await p.goto(`${URL}/no-such-page`, { waitUntil: 'networkidle' }); await sleep(800);
      if (darkOrAr === 'ar') { await setLang(p, 'ar'); await p.reload({ waitUntil: 'networkidle' }); await sleep(800); }
      else if (darkOrAr) await setDark(p, true);
      await shot(p, `404-${tag}-${vname}`);
      await ctx.close();
    }
  }

  // ── ERROR: abort the lazy Docs chunk so React.lazy throws during render
  // inside the boundary — the real ErrorFallback, triggered for real.
  for (const [vname, darkOrAr] of variants) {
    const ctx = await browser.newContext({ viewport: DESK });
    const p = await ctx.newPage();
    p.on('pageerror', e => errs.push(`error-${vname}: ${e.message}`));
    await p.route('**/src/views/Docs.tsx*', r => r.abort());
    await p.goto(`${URL}/docs`, { waitUntil: 'domcontentloaded' });
    await sleep(2000);
    const isError = await p.evaluate(() => document.body.textContent.includes('Something went wrong'));
    if (isError) await shot(p, `error-desktop-${vname}`);
    else console.log('error screen did not trigger for', vname);
    await ctx.close();
  }

  console.log('page errors:', errs.length ? errs.join(' | ') : '(none)');
  await browser.close();
  console.log(`F18 ${PHASE} shots → ${OUT}/`);
}

main().catch(e => { console.error('SHOTS FAILED', e); process.exit(1); });
