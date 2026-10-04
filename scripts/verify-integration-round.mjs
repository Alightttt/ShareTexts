// Integration-round verification:
//   1. hero demo "Room closed" stamp is legible in dark mode (not white-on-white)
//   2. ShareMenu ships the real dropdown anatomy: caption, rail cells, copy footer
//   3. room header carries NO theme toggle (the "two toggles" complaint)
//   4. Settings shows the real SegmentedToggleButton (Light/System/Dark) and it drives theme
import { chromium } from 'playwright';

const BASE = 'http://localhost:3010';
const results = [];
const out = (name, ok, extra = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra ? ' — ' + extra : ''}`); };

const browser = await chromium.launch();
try {
  // ── 1. Landing: closed-veil stamp legibility ─────────────────────────────
  // Dark is where the bug lived (white-on-white), so emulate it explicitly.
  const p = await browser.newPage({ viewport: { width: 1440, height: 900 }, colorScheme: 'dark' });
  await p.goto(BASE, { waitUntil: 'domcontentloaded' });
  await p.waitForSelector('[data-testid="demo-scrubber"]', { timeout: 20000 });
  await p.evaluate(() => {
    const play = document.querySelector('[data-testid="demo-play"]');
    if (play && /pause/i.test(play.getAttribute('aria-label') || '')) play.click();
    const scrubber = document.querySelector('[data-testid="demo-scrubber"]');
    scrubber?.focus();
    scrubber?.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }));
  });
  await p.waitForFunction(() => (document.querySelector('[data-testid="demo-caption"]')?.textContent || '').includes('Close the room'), null, { timeout: 5000 });
  const veil = await p.evaluate(() => {
    const spans = [...document.querySelectorAll('span')].filter(s => (s.getAttribute('class') || '').includes('dark:bg-white/90'));
    return spans.map(s => ({ text: s.textContent, color: getComputedStyle(s).color }));
  });
  out('closed-veil stamp reads "Room closed"', veil.length === 2 && veil.every(v => (v.text || '').includes('Room closed')), JSON.stringify(veil[0] || null));
  out('closed-veil stamp is NOT white-on-white (dark mode)', veil.length === 2 && veil.every(v => v.color !== 'rgb(255, 255, 255)'), veil[0]?.color);
  const inDark = await p.evaluate(() => document.documentElement.classList.contains('dark'));
  out('check actually ran in dark scope', inDark);
  await p.close();

  // ── Creator: create a room (still PAIRING — share menu lives here) ───────
  const ctxA = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const ctxB = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  await ctxA.grantPermissions(['clipboard-read', 'clipboard-write']).catch(() => {});
  const pa = await ctxA.newPage();
  const pb = await ctxB.newPage();

  await pa.goto(BASE, { waitUntil: 'domcontentloaded' });
  await pa.waitForTimeout(1200);
  await pa.getByRole('button', { name: 'Send', exact: true }).click();
  await pa.waitForFunction(() => !!localStorage.getItem('sharetext.session.v1'), null, { timeout: 20000 });
  const { roomId } = await pa.evaluate(() => JSON.parse(localStorage.getItem('sharetext.session.v1')));
  const short = roomId.replace(/-/g, '').slice(0, 8);
  out('creator room created', !!roomId);

  // ── 2. ShareMenu anatomy via the QR overlay's pill trigger ───────────────
  await pa.waitForSelector('[data-testid="show-qr"]', { timeout: 15000 });
  await pa.click('[data-testid="show-qr"]');
  await pa.waitForSelector('[data-testid="qr-share"]', { timeout: 8000 });
  await pa.click('[data-testid="qr-share"]');
  await pa.waitForSelector('[role="menu"]', { timeout: 5000 });
  const menu = await pa.evaluate(() => {
    const m = document.querySelector('[role="menu"]');
    const caption = m.querySelector('p');
    const rail = m.querySelector('[class*="justify-between"]');
    const cells = rail ? [...rail.querySelectorAll('[role="menuitem"]')] : [];
    const items = [...m.querySelectorAll('[role="menuitem"]')];
    const footer = items[items.length - 1];
    return {
      caption: caption ? caption.textContent.trim() : null,
      railCells: cells.length,
      cellLabels: cells.map(c => c.textContent.trim()),
      footerLabel: footer ? footer.textContent.trim() : null,
      footerInRail: rail ? rail.contains(footer) : false,
    };
  });
  out('share menu has micro-caption', !!menu.caption && /share/i.test(menu.caption), menu.caption);
  out('share menu has horizontal rail cells', menu.railCells >= 1, JSON.stringify(menu.cellLabels));
  out('share menu footer is Copy link (outside rail)', !menu.footerInRail && /copy|link|copier|copiar|enlace|kopier/i.test(menu.footerLabel || ''), menu.footerLabel);

  // Copy → menu STAYS open and flips to Copied (the original's behavior).
  await pa.evaluate(() => { const items = [...document.querySelectorAll('[role="menu"] [role="menuitem"]')]; items[items.length - 1]?.click(); });
  await pa.waitForTimeout(400);
  const copied = await pa.evaluate(() => /cop/i.test(document.querySelector('[role="menu"]')?.textContent || ''));
  out('footer copy flips to Copied (menu stays open)', copied);

  await pa.keyboard.press('Escape');
  await pa.waitForTimeout(300);
  out('Escape closes the share menu', await pa.evaluate(() => !document.querySelector('[role="menu"]')));
  // Close the QR overlay if Escape also dismissed it (or not).
  await pa.evaluate(() => { document.querySelector('[aria-label="Close"]')?.click(); document.querySelector('[data-testid="show-qr"]')?.focus(); });
  await pa.keyboard.press('Escape').catch(() => {});
  await pa.waitForTimeout(400);

  // ── Connect the second device ────────────────────────────────────────────
  await pb.goto(BASE, { waitUntil: 'domcontentloaded' });
  await pb.waitForTimeout(1200);
  await pb.evaluate((code) => { location.href = '/s/' + code; }, short);
  await pb.waitForSelector('[data-testid="composer"]', { timeout: 25000 }).catch(() => {});
  await pa.waitForSelector('[data-testid="composer"]', { timeout: 25000 });
  out('both devices connected', !!(await pa.$('[data-testid="composer"]')) && !!(await pb.$('[data-testid="composer"]')));

  // ── 3. Room header: exactly zero theme toggles ───────────────────────────
  const toggles = await pa.evaluate(() => document.querySelectorAll('[data-testid="theme-toggle"]').length);
  out('room header carries NO theme toggle', toggles === 0, `count=${toggles}`);

  // ── 4. Settings: real segmented control drives the theme ─────────────────
  await pa.click('[data-testid="open-settings"]');
  await pa.waitForSelector('[data-testid="settings-theme-segmented"]', { timeout: 8000 });
  const seg = await pa.evaluate(() => {
    const group = document.querySelector('[data-testid="settings-theme-segmented"]');
    const radios = [...group.querySelectorAll('[role="radio"]')];
    return {
      role: group.getAttribute('role'),
      labels: radios.map(r => r.textContent),
      checked: radios.map(r => r.getAttribute('aria-checked')).join(','),
      slot: group.getAttribute('data-slot'),
      thumb: !!group.querySelector('[class*="translate-x"]'),
    };
  });
  out('settings uses segmented radiogroup', seg.role === 'radiogroup' && seg.slot === 'segmented-toggle-button' && seg.labels.length === 3, JSON.stringify(seg.labels));
  out('segmented has sliding thumb', seg.thumb);

  const stored = await pa.evaluate(() => localStorage.getItem('sharetext.theme'));
  const expectIdx = stored === 'light' ? 'true,false,false' : stored === 'dark' ? 'false,false,true' : 'false,true,false';
  out(`aria-checked matches stored theme (${stored})`, seg.checked === expectIdx, seg.checked);

  await pa.evaluate(() => { [...document.querySelectorAll('[data-testid="settings-theme-segmented"] [role="radio"]')].find(b => b.textContent === 'Dark')?.click(); });
  await pa.waitForTimeout(300);
  const dark = await pa.evaluate(() => ({ cls: document.documentElement.classList.contains('dark'), stored: localStorage.getItem('sharetext.theme') }));
  out('segmented Dark applies dark theme', dark.cls && dark.stored === 'dark', JSON.stringify(dark));

  await pa.evaluate(() => { [...document.querySelectorAll('[data-testid="settings-theme-segmented"] [role="radio"]')].find(b => b.textContent === 'System')?.click(); });
  await pa.waitForTimeout(300);
  const sys = await pa.evaluate(() => localStorage.getItem('sharetext.theme'));
  out('segmented System follows OS again', sys === 'system', sys);

  const settingsToggles = await pa.evaluate(() => document.querySelectorAll('[data-testid="theme-toggle"]').length);
  out('settings row replaced the switch (no stray toggle)', settingsToggles === 0, `count=${settingsToggles}`);

  await ctxA.close();
  await ctxB.close();
} catch (err) {
  console.error('ERROR:', err.message);
  results.push(false);
} finally {
  await browser.close();
}

const fails = results.filter(r => !r).length;
console.log(`\n${results.length - fails}/${results.length} passed`);
process.exit(fails ? 1 : 0);
