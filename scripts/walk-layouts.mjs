// Fresh-eyes interactive walk of the restructured layouts (commit cf8ee92).
// Mobile 375×667 idle geometry → sending/QR/cancel → wrong code → real pairing
// → connected placement + name edit + notice dismiss → chat both ways →
// disconnect → desktop 1280 + 1920 split geometry → focus states → disabled
// send warmth. Exits non-zero with a named failure list.
import { launchBrowser, URL, sleep, readLiveCode, waitForChat } from './lib.mjs';

const browser = await launchBrowser();
const fails = [];
const ok = (cond, label) => { console.log(`${cond ? 'OK  ' : 'FAIL'} ${label}`); if (!cond) fails.push(label); };

async function smallTargets(page) {
  return page.evaluate(() => [...document.querySelectorAll('button')]
    .filter(b => { const r = b.getBoundingClientRect(); return r.width > 0 && r.height > 0 && (r.width < 40 || r.height < 40); })
    .map(b => { const r = b.getBoundingClientRect(); return `${(b.getAttribute('aria-label') || b.textContent.trim() || '(icon)').slice(0, 24)} ${Math.round(r.width)}x${Math.round(r.height)}`; }));
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
      roomCard: !!document.querySelector('[data-testid="room-panel"]'),
      docY: document.documentElement.scrollHeight - document.documentElement.clientHeight,
    };
  });
  ok(idle.footerBottom === idle.vh && idle.docY === 0, `idle: footer at column bottom (${idle.footerBottom}/${idle.vh}, scrollY ${idle.docY})`);
  ok(idle.footerVisible, 'idle: footer visible');
  ok(!idle.roomCard, 'idle: no room card in DOM');
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
  ok((await M.locator('[data-testid="room-panel"]').count()) === 0, 'no room card after cancel');

  // Sending → QR overlay → close
  await M.getByRole('button', { name: 'Send', exact: true }).click();
  await M.getByRole('group', { name: 'Pairing code' }).waitFor({ timeout: 8000 });
  await M.getByRole('button', { name: 'Show QR' }).click();
  await M.getByRole('dialog', { name: 'QR code' }).waitFor({ timeout: 5000 });
  await M.getByRole('button', { name: 'Close QR code' }).click();
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

  // Connected placement on M
  const conn = await M.evaluate(() => {
    const room = document.querySelector('[data-testid="room-panel"]');
    const footer = document.querySelector('footer');
    const slot = room?.parentElement;
    const prev = slot?.previousElementSibling;
    const rb = slot?.getBoundingClientRect(), pb = prev?.getBoundingClientRect();
    return {
      roomCard: !!room,
      footerHidden: footer ? getComputedStyle(footer).display === 'none' : null,
      gap: rb && pb ? Math.round(rb.top - pb.bottom) : null,
    };
  });
  ok(conn.roomCard, 'connected: room card mounted');
  // Footer must be GONE (unmounted) or hidden while connected — either is correct.
  ok(conn.footerHidden !== false, 'connected: footer removed/hidden');
  ok(conn.gap !== null && conn.gap >= -6 && conn.gap <= 48, `connected: chat starts under summary (gap ${conn.gap})`);

  // Same-platform defaults → joiner auto-renamed + notice; dismiss works
  const mBody = await M.locator('body').innerText();
  ok(mBody.includes('Guest Windows PC 2'), 'joiner auto-renamed (same defaults)');
  ok(mBody.includes('Both devices had the same name'), 'auto-name notice shown');
  await M.getByRole('button', { name: 'Dismiss' }).click();
  await sleep(300);
  ok(!(await M.locator('body').innerText()).includes('Both devices had the same name'), 'notice dismisses');

  // Tap-to-edit name on M, Enter saves, A sees it
  await M.getByRole('button', { name: /This device is named/ }).click();
  await M.getByLabel('Rename this device').fill('Walk Phone');
  await M.getByLabel('Rename this device').press('Enter');
  await sleep(1500);
  ok((await A.locator('body').innerText()).includes('Walk Phone'), 'rename propagates to A live');

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

  // Embedded chrome (single-screen room header, not ChatView's own header):
  // mobile fullscreen toggle expands/contracts the room card.
  await M.getByRole('button', { name: 'Fullscreen' }).click();
  await sleep(600);
  const fs = await M.evaluate(() => {
    const room = document.querySelector('[data-testid="room-panel"]');
    const r = room?.getBoundingClientRect();
    return { w: r ? Math.round(r.width) : null, h: r ? Math.round(r.height) : null, vw: window.innerWidth, vh: window.innerHeight };
  });
  ok(fs.w === fs.vw && fs.h === fs.vh, `fullscreen expands room to viewport (${fs.w}x${fs.h})`);
  await M.getByRole('button', { name: 'Minimize' }).click();
  await sleep(500);
  const back = await M.evaluate(() => {
    const room = document.querySelector('[data-testid="room-panel"]');
    const r = room?.getBoundingClientRect();
    return r ? Math.round(r.height) : null;
  });
  ok(back !== null && back < 667, `fullscreen minimizes again (h=${back})`);

  // Small targets inventory on connected mobile
  const smallM = await smallTargets(M);
  const smallA = await smallTargets(A);
  console.log('  small targets M:', JSON.stringify(smallM));
  console.log('  small targets A:', JSON.stringify(smallA));

  // Disconnect from the embedded room header → idle again, footer back
  await M.locator('button[aria-label="Disconnect"]').click();
  await sleep(1200);
  const backIdle = await M.evaluate(() => ({
    roomCard: !!document.querySelector('[data-testid="room-panel"]'),
    footerVisible: document.querySelector('footer') ? getComputedStyle(document.querySelector('footer')).display !== 'none' : false,
    sendVisible: !!document.querySelector('button'),
  }));
  ok(!backIdle.roomCard && backIdle.footerVisible, 'after disconnect: idle again, footer back, no room card');

  // ── DESKTOP 1920×1080 idle geometry ──
  const ctxD = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const D = await ctxD.newPage();
  D.on('pageerror', e => fails.push(`[D pageerror] ${e.message}`));
  await D.goto(URL, { waitUntil: 'networkidle' });
  await D.getByRole('heading', { level: 1 }).waitFor({ timeout: 20000 });
  await sleep(600);
  const split1920 = await D.evaluate(() => {
    const left = document.querySelector('header')?.closest('div[class*="w-1/2"]');
    const right = left?.nextElementSibling;
    const block = document.querySelector('h1')?.closest('.max-w-md');
    const lb = left?.getBoundingClientRect(), rb = right?.getBoundingClientRect(), bb = block?.getBoundingClientRect();
    return {
      leftW: lb ? Math.round(lb.width) : null, rightW: rb ? Math.round(rb.width) : null,
      vw: window.innerWidth,
      blockCenter: bb ? Math.round(bb.left + bb.width / 2) : null,
      leftCenter: lb ? Math.round(lb.left + lb.width / 2) : null,
      docX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      docY: document.documentElement.scrollHeight - document.documentElement.clientHeight,
    };
  });
  ok(split1920.leftW === 960 && split1920.rightW === 960, `1920: 50/50 split (${split1920.leftW}/${split1920.rightW})`);
  ok(Math.abs(split1920.blockCenter - split1920.leftCenter) <= 4, '1920: hero block centered in left half');
  ok(split1920.docX === 0 && split1920.docY === 0, '1920: no overflow at all');

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

  // ── DESKTOP 1280 idle: 50/50 split (resize the idle D page) ──
  await D.setViewportSize({ width: 1280, height: 800 });
  await sleep(600);
  const split1280 = await D.evaluate(() => {
    const left = document.querySelector('header')?.closest('div[class*="w-1/2"]');
    const right = left?.nextElementSibling;
    const block = document.querySelector('h1')?.closest('.max-w-md');
    const lb = left?.getBoundingClientRect(), rb = right?.getBoundingClientRect(), bb = block?.getBoundingClientRect();
    return {
      leftW: lb ? Math.round(lb.width) : null, rightW: rb ? Math.round(rb.width) : null,
      vw: window.innerWidth,
      blockCenter: bb ? Math.round(bb.left + bb.width / 2) : null,
      leftCenter: lb ? Math.round(lb.left + lb.width / 2) : null,
      docX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    };
  });
  ok(split1280.leftW === 640 && split1280.rightW === 640, `1280: 50/50 split (${split1280.leftW}/${split1280.rightW})`);
  ok(Math.abs(split1280.blockCenter - split1280.leftCenter) <= 4, `1280: hero block centered in left half (${split1280.blockCenter} vs ${split1280.leftCenter})`);
  ok(split1280.docX === 0, '1280: no horizontal overflow');

  await browser.close();
  if (fails.length) { console.log('\nFAILURES:'); fails.forEach(f => console.log(' -', f)); process.exit(1); }
  console.log('\nWalk complete: all checks passed.');
}

main().catch(e => { console.error('WALK ERROR:', e.message); process.exit(1); });