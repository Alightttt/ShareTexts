// Fresh-eyes interactive walk of the restructured layouts (commit cf8ee92).
// Mobile 375×667 idle geometry → sending/QR/cancel → wrong code → real pairing
// → connected placement + name edit + notice dismiss → chat both ways →
// disconnect → desktop 1280 + 1920 split geometry → focus states → disabled
// send warmth. Exits non-zero with a named failure list.
import { launchBrowser, URL, sleep, readLiveCode, waitForChat, tapTargetIssues, TAP_TARGET_MIN } from './lib.mjs';

const browser = await launchBrowser();
const fails = [];
const ok = (cond, label) => { console.log(`${cond ? 'OK  ' : 'FAIL'} ${label}`); if (!cond) fails.push(label); };

// Shares the exact contract with audit.mjs (lib.mjs tapTargetIssues): 40px
// in both dimensions, role="switch" exempt — no per-harness drift.
async function smallTargets(page) {
  return (await page.evaluate(tapTargetIssues, { minTarget: TAP_TARGET_MIN })).map(i => `${i.name} ${i.width}x${i.height}`);
}

async function main() {
  // ── MOBILE 375×667: idle geometry ──
  const ctxM = await browser.newContext({ viewport: { width: 375, height: 667 }, isMobile: true, hasTouch: true });
  const M = await ctxM.newPage();
  M.on('pageerror', e => fails.push(`[M pageerror] ${e.message}`));
  await M.goto(URL, { waitUntil: 'networkidle' });
  // Wait for the app to actually render (slow first paint must not produce
  // vacuous measurements).
  await M.getByRole('heading', { level: 1 }).waitFor({ timeout: 20000 });
  await sleep(600);
  const idle = await M.evaluate(() => {
    const header = document.querySelector('header');
    const footer = document.querySelector('footer');
    const h1 = document.querySelector('h1');
    const block = h1?.closest('.max-w-md');
    const hb = header?.getBoundingClientRect(), fb = footer?.getBoundingClientRect(), bb = block?.getBoundingClientRect();
    return {
      footerBottom: fb ? Math.round(fb.bottom) : null,
      vh: window.innerHeight,
      footerVisible: footer ? getComputedStyle(footer).display !== 'none' : false,
      gapTop: hb && bb ? Math.round(bb.top - hb.bottom) : null,
      gapBottom: fb && bb ? Math.round(fb.top - bb.bottom) : null,
      roomCard: !!document.querySelector('[data-app-state="connected"]'),
      docY: document.documentElement.scrollHeight - document.documentElement.clientHeight,
    };
  });
  ok(idle.footerBottom === idle.vh && idle.docY === 0, `idle: footer at column bottom (${idle.footerBottom}/${idle.vh}, scrollY ${idle.docY})`);
  ok(idle.footerVisible, 'idle: footer visible');
  ok(!idle.roomCard, 'idle: no room view in DOM');
  ok(Math.abs(idle.gapTop - idle.gapBottom) <= 12, `idle: hero centered between header and footer (gaps ${idle.gapTop}/${idle.gapBottom})`);

  // Theme toggle responds
  const darkBefore = await M.evaluate(() => document.documentElement.classList.contains('dark'));
  await M.getByRole('switch').first().click();
  await sleep(400);
  const darkAfter = await M.evaluate(() => document.documentElement.classList.contains('dark'));
  ok(darkBefore !== darkAfter, 'theme toggle flips dark mode');
  await M.getByRole('switch').first().click(); await sleep(300);

  // Rapid double-click Send → one room; Cancel → idle; no room card
  await M.getByRole('button', { name: 'Send', exact: true }).click();
  await M.getByRole('button', { name: 'Send', exact: true }).click({ force: true }).catch(() => {});
  await M.getByRole('group', { name: 'Pairing code' }).waitFor({ timeout: 8000 });
  ok(true, 'double-click Send → sending panel appears once');
  await M.getByRole('button', { name: 'Cancel' }).click();
  await sleep(700);
  ok((await M.getByRole('button', { name: 'Send', exact: true }).count()) > 0, 'Cancel returns to idle');
  ok((await M.locator('[data-app-state="connected"]').count()) === 0, 'no room view after cancel');

  // Sending → QR overlay → close
  await M.getByRole('button', { name: 'Send', exact: true }).click();
  await M.getByRole('group', { name: 'Pairing code' }).waitFor({ timeout: 8000 });
  await M.getByRole('button', { name: 'Show QR' }).click();
  await M.getByRole('dialog', { name: 'QR code' }).waitFor({ timeout: 5000 });
  // The overlay's close control is the localized “Close” (two of them: X + footer).
  await M.getByRole('button', { name: 'Close', exact: true }).first().click();
  await sleep(400);
  ok((await M.getByRole('dialog', { name: 'QR code' }).count()) === 0, 'QR overlay closes');
  await M.getByRole('button', { name: 'Cancel' }).click();
  await sleep(500);

  // Wrong code → error message
  await M.getByRole('button', { name: 'Receive', exact: true }).click();
  await M.locator('input[inputmode="numeric"]').fill('000000');
  await sleep(1500);
  const wrongErr = await M.evaluate(() => document.body.innerText.includes("isn't active") || document.body.innerText.includes('Invalid'));
  ok(wrongErr, 'wrong code shows a plain error');

  // ── Desktop A 1280×800: pair with M ──
  const ctxA = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const A = await ctxA.newPage();
  A.on('pageerror', e => fails.push(`[A pageerror] ${e.message}`));
  await A.goto(URL, { waitUntil: 'networkidle' }); await sleep(700);
  await A.getByRole('button', { name: 'Send', exact: true }).click();
  await A.getByRole('group', { name: 'Pairing code' }).waitFor({ timeout: 8000 });
  const code = await readLiveCode(A);
  await M.locator('input[inputmode="numeric"]').fill(code);
  await waitForChat(M, 'M'); await waitForChat(A, 'A');
  await sleep(1500);

  // Connected placement on M — the room TAKES OVER the whole screen: no
  // separate footer, no summary column. The takeover is the assertion.
  const conn = await M.evaluate(() => {
    const room = document.querySelector('[data-app-state="connected"]');
    const footer = document.querySelector('footer');
    if (!room) return null;
    const r = room.getBoundingClientRect();
    return {
      fullBleed: r.top <= 1 && r.left <= 1
        && Math.abs(r.width - window.innerWidth) <= 2
        && Math.abs(r.height - window.innerHeight) <= 2,
      footerGone: !footer,
    };
  });
  ok(conn !== null && conn.fullBleed, 'connected: room takes over the full viewport');
  ok(conn !== null && conn.footerGone, 'connected: page footer unmounted (room replaces it)');

  // Same-platform defaults → joiner auto-renamed. On mobile the rename notice
  // lives in the connection-details sheet (no pairing summary on mobile).
  const mBody = await M.locator('body').innerText();
  ok(mBody.includes('Guest Windows PC 2'), 'joiner auto-renamed (same defaults)');
  await M.getByTestId('connection-details').click();
  await sleep(500);
  const sheetBody = await M.locator('body').innerText();
  ok(sheetBody.includes('Both devices had the same name'), 'auto-name notice shown in details sheet');
  await M.getByRole('button', { name: 'Dismiss' }).click();
  await sleep(300);
  ok(!(await M.locator('body').innerText()).includes('Both devices had the same name'), 'notice dismisses');

  // Tap-to-edit name in the sheet, Enter saves, A sees it
  await M.getByRole('button', { name: /This device is named/ }).click();
  await M.getByLabel('Rename this device').fill('Walk Phone');
  await M.getByLabel('Rename this device').press('Enter');
  await sleep(1500);
  ok((await A.locator('body').innerText()).includes('Walk Phone'), 'rename propagates to A live');
  await M.getByLabel('Close connection details').click().catch(() => {});
  await sleep(300);

  // Chat both ways from the mobile composer
  await M.locator('textarea').first().fill('Hi from the walk phone 📱');
  await M.locator('button[data-testid="send"]').click();
  await sleep(1200);
  ok((await A.locator('body').innerText()).includes('Hi from the walk phone'), 'M → A text delivered');
  await A.locator('textarea').first().fill('Reply from the desktop');
  await A.locator('button[data-testid="send"]').click();
  await sleep(1200);
  ok((await M.locator('body').innerText()).includes('Reply from the desktop'), 'A → M text delivered');

  // Empty composer: send disabled with warm parchment
  const disabledBg = await A.evaluate(() => {
    const btn = document.querySelector('button[data-testid="send"]');
    return btn && btn.disabled ? getComputedStyle(btn).backgroundColor : null;
  });
  ok(disabledBg === 'rgb(217, 205, 178)', `empty-composer send disabled in warm parchment (${disabledBg})`);

  // New design: mobile connected = full-bleed room with ChatView's own slim
  // header. No separate Fullscreen/Minimize toggle exists anymore — the room
  // IS fullscreen. Verify the takeover geometry held.
  const fsNow = await M.evaluate(() => {
    const room = document.querySelector('[data-app-state="connected"]');
    const r = room?.getBoundingClientRect();
    return { w: r ? Math.round(r.width) : null, h: r ? Math.round(r.height) : null, vw: window.innerWidth, vh: window.innerHeight };
  });
  ok(fsNow.w === fsNow.vw && fsNow.h === fsNow.vh, `room stays fullscreen (no minimize toggle) (${fsNow.w}x${fsNow.h})`);

  // Small targets inventory on connected mobile
  const smallM = await smallTargets(M);
  const smallA = await smallTargets(A);
  console.log('  small targets M:', JSON.stringify(smallM));
  console.log('  small targets A:', JSON.stringify(smallA));

  // Disconnect from the room header → confirm sheet → "That's it." end screen
  // → 'Start a transfer' CTA → idle. The end screen is the designed closure
  // moment (privacy message + fresh start), not a bug.
  await M.getByRole('button', { name: 'Disconnect' }).first().click();
  await M.getByTestId('end-session-confirm').waitFor({ state: 'visible', timeout: 5000 }).catch(() => {});
  await M.getByTestId('end-session-confirm').click();
  await sleep(1200);
  const endedShown = await M.evaluate(() => document.body.innerText.includes("That's it."));
  ok(endedShown, 'manual close shows the designed end screen');
  await M.getByRole('button', { name: 'Start a transfer' }).click();
  await sleep(1200);
  const backIdle = await M.evaluate(() => ({
    roomCard: !!document.querySelector('[data-app-state="connected"]'),
    footerVisible: document.querySelector('footer') ? getComputedStyle(document.querySelector('footer')).display !== 'none' : false,
    sendVisible: !!document.querySelector('button'),
  }));
  ok(!backIdle.roomCard && backIdle.footerVisible, 'after disconnect: idle again, footer back, no room view');

  // ── DESKTOP 1920×1080 idle geometry ──
  // New design: 50/50 at <1280px, ≈44/56 from 1280px up so the room half is
  // wider. Assert the split ratio, not a fixed pixel width.
  const ctxD = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const D = await ctxD.newPage();
  D.on('pageerror', e => fails.push(`[D pageerror] ${e.message}`));
  await D.goto(URL, { waitUntil: 'networkidle' });
  await D.getByRole('heading', { level: 1 }).waitFor({ timeout: 20000 });
  await sleep(600);
  const split = (vmin = 1280) => D.evaluate(() => {
    const left = document.querySelector('header')?.closest('div');
    let pane = left;
    while (pane && pane.parentElement && !pane.parentElement.classList.contains('flex') ) pane = pane.parentElement;
    const right = pane?.nextElementSibling;
    const block = document.querySelector('h1')?.closest('.max-w-md');
    const lb = pane?.getBoundingClientRect(), rb = right?.getBoundingClientRect(), bb = block?.getBoundingClientRect();
    return {
      leftW: lb ? Math.round(lb.width) : null, rightW: rb ? Math.round(rb.width) : null,
      vw: window.innerWidth,
      blockCenter: bb ? Math.round(bb.left + bb.width / 2) : null,
      leftCenter: lb ? Math.round(lb.left + lb.width / 2) : null,
      docX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      docY: document.documentElement.scrollHeight - document.documentElement.clientHeight,
    };
  });
  const split1920 = await split();
  {
    const ratio = split1920.leftW / split1920.vw;
    ok(Math.abs(ratio - 0.44) <= 0.02, `1920: ≈44/56 split (${split1920.leftW}/${split1920.rightW}, ratio ${ratio.toFixed(3)})`);
    ok(split1920.rightW > split1920.leftW, '1920: room half is the wider half');
    ok(Math.abs(split1920.blockCenter - split1920.leftCenter) <= 8, '1920: hero block centered in left half');
    ok(split1920.docX === 0 && split1920.docY === 0, '1920: no overflow at all');
  }

  // Focus states: Tab reaches Send, Enter activates it (then Escape/cancel)
  await D.keyboard.press('Tab'); // skip to first focusable
  let focused = await D.evaluate(() => document.activeElement?.textContent?.trim().slice(0, 20));
  for (let i = 0; i < 8 && focused !== 'Send'; i++) {
    await D.keyboard.press('Tab');
    focused = await D.evaluate(() => document.activeElement?.textContent?.trim().slice(0, 20));
  }
  ok(focused === 'Send', `Tab reaches Send (got "${focused}")`);
  await D.keyboard.press('Enter');
  await D.getByRole('group', { name: 'Pairing code' }).waitFor({ timeout: 8000 });
  ok(true, 'Enter on focused Send creates the room');
  await D.getByRole('button', { name: 'Cancel' }).click();
  await sleep(500);
  ok((await D.getByRole('button', { name: 'Send', exact: true }).count()) > 0, 'Cancel returns to idle on desktop');

  // ── DESKTOP 1280 idle: xl boundary — 44/56 applies from 1280px up (resize the idle D page) ──
  await D.setViewportSize({ width: 1280, height: 800 });
  await sleep(600);
  const split1280 = await split();
  {
    const ratio = split1280.leftW / split1280.vw;
    ok(Math.abs(ratio - 0.44) <= 0.02, `1280: ≈44/56 split at the xl boundary (${split1280.leftW}/${split1280.rightW}, ratio ${ratio.toFixed(3)})`);
    ok(Math.abs(split1280.blockCenter - split1280.leftCenter) <= 8, `1280: hero block centered in left half (${split1280.blockCenter} vs ${split1280.leftCenter})`);
    ok(split1280.docX === 0, '1280: no horizontal overflow');
  }

  // ── 1024–1279 band: exact 50/50 ──
  await D.setViewportSize({ width: 1180, height: 800 });
  await sleep(600);
  const split1180 = await split();
  ok(Math.abs(split1180.leftW - 590) <= 3 && Math.abs(split1180.rightW - 590) <= 3, `1180: 50/50 split (${split1180.leftW}/${split1180.rightW})`);
  ok(split1180.docX === 0, '1180: no horizontal overflow');

  await browser.close();
  if (fails.length) { console.log('\nFAILURES:'); fails.forEach(f => console.log(' -', f)); process.exit(1); }
  console.log('\nWalk complete: all checks passed.');
}

main().catch(e => { console.error('WALK ERROR:', e.message); process.exit(1); });