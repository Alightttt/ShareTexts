/**
 * verify-quality.mjs — responsiveness / accessibility / resilience probe.
 * Numbers, not adjectives. Complements the existing suites (guide-taps gates
 * 40px targets on guides, locale-walk covers RTL pairing, theme covers dark
 * persistence) with what none of them measure:
 *
 *   A11Y  keyboard reachability + focus visibility, accessible names & labels,
 *         live-region text (state must not be color-only), WCAG contrast
 *         ratios sampled from computed styles (light + dark).
 *   INP   interaction latency in-page (click → first visual mutation) for the
 *         landing "create space" entry and the room Send button.
 *   NET   offline → visible recovery state → online → recovers, in a room.
 *   MOBILE landscape overflow, long-URL paste overflow, long-filename send.
 *   PWA   manifest validity, SW precache facts, cache-version presence.
 *
 * Run: URL=http://localhost:3010 node scripts/verify-quality.mjs
 */
import { chromium } from 'playwright';

const URL = process.env.URL || 'http://localhost:3010';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const results = [];
const out = (name, ok, extra = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra ? ' — ' + extra : ''}`); };

const browser = await chromium.launch();

// ── shared in-page helpers ────────────────────────────────────────────────
const HELPERS = () => {
  window.__contrast = (el) => {
    const lum = (c) => { const [r, g, b] = c.map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
    const parse = (s) => { const m = s.match(/rgba?\(([^)]+)\)/); if (!m) return null; const p = m[1].split(',').map(parseFloat); return { rgb: [p[0], p[1], p[2]], a: p.length > 3 ? p[3] : 1 }; };
    const effBg = (node) => {
      // A painted gradient (background-image) covers the solid bg — measure
      // its WORST stop, not the color underneath it.
      let n = node;
      while (n) {
        const cs = getComputedStyle(n);
        if (cs.backgroundImage && cs.backgroundImage.includes('gradient')) {
          const toRgb = (h) => { h = h.replace('#', ''); if (h.length === 3) h = h.split('').map(c => c + c).join(''); return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]; };
          const stops = [...cs.backgroundImage.matchAll(/#[0-9a-fA-F]{3,8}\b|rgba?\([^)]+\)/g)].map(m => m[0].startsWith('#') ? toRgb(m[0]) : parse(m[0])?.rgb).filter(Boolean);
          if (stops.length) return { multi: stops };
        }
        const c = parse(cs.backgroundColor);
        if (c && c.a > 0.92) return c.rgb;
        n = n.parentElement;
      }
      return [255, 255, 255];
    };
    const ratioOf = (fg, bg) => { const L1 = lum(fg), L2 = lum(bg); return (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05); };
    const cs = getComputedStyle(el);
    const fg = parse(cs.color); if (!fg) return null;
    const bg = effBg(el);
    const ratio = bg && bg.multi ? Math.min(...bg.multi.map(s => ratioOf(fg.rgb, s))) : ratioOf(fg.rgb, bg);
    const px = parseFloat(cs.fontSize), w = parseInt(cs.fontWeight) || 400;
    const large = px >= 24 || (px >= 18.66 && w >= 700);
    return { ratio: Math.round(ratio * 100) / 100, need: large ? 3 : 4.5, px, w, text: (el.textContent || '').trim().slice(0, 40), color: cs.color };
  };
  window.__sweepContrast = () => {
    const sels = 'h1,h2,h3,p,a,button,span,label,textarea,[role="status"],[role="button"]';
    const fails = [];
    for (const el of document.querySelectorAll(sels)) {
      if (!el.textContent?.trim()) continue;
      if (el.closest('[aria-hidden="true"]')) continue; // decorative = image-text, exempt
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      if ([...el.children].some(c => c.textContent?.trim())) continue; // own text only
      const c = window.__contrast(el);
      if (c && c.ratio < c.need) fails.push({ ...c, cls: (el.className || '').toString().slice(0, 50) });
    }
    return fails;
  };
};

// ═══ 1. LANDING — a11y + INP (light) ══════════════════════════════════════
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  await page.addInitScript(HELPERS);
  await page.goto(URL, { waitUntil: 'networkidle' });
  await sleep(800);

  // keyboard: primary actions reachable by Tab, focus visibly styled
  const kb = await page.evaluate(() => {
    const names = [];
    const els = [...document.querySelectorAll('button, a[href], input, [tabindex]:not([tabindex="-1"])')].filter(e => e.getBoundingClientRect().height > 0);
    return els.length;
  });
  await page.keyboard.press('Tab');
  const focus1 = await page.evaluate(() => {
    const a = document.activeElement; if (!a || a === document.body) return null;
    const cs = getComputedStyle(a);
    const ring = (cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) > 0) || (cs.boxShadow && cs.boxShadow !== 'none');
    return { tag: a.tagName, ring };
  });
  out('landing: first Tab lands on a real control with a visible focus ring', !!focus1 && focus1.ring, JSON.stringify(focus1));

  // walk up to 30 tabs; Send/Receive must both be keyboard-reachable
  const seen = new Set(); let sendKb = false, recvKb = false;
  for (let i = 0; i < 30; i++) {
    await page.keyboard.press('Tab');
    const t = await page.evaluate(() => (document.activeElement?.textContent || '').trim().slice(0, 30));
    if (/send/i.test(t)) sendKb = true;
    if (/receive/i.test(t)) recvKb = true;
    seen.add(t);
  }
  out('landing: Send + Receive reachable by keyboard', sendKb && recvKb, `${seen.size} stops`);

  // accessible names on every visible interactive control
  const unnamed = await page.evaluate(() =>
    [...document.querySelectorAll('button, a[href], input, [role="button"]')]
      .filter(e => e.getBoundingClientRect().height > 0)
      .filter(e => !(e.getAttribute('aria-label') || e.textContent?.trim() || e.getAttribute('title') || (e.labels && e.labels.length)))
      .map(e => (e.tagName + '.' + (e.className || '').toString().slice(0, 40))));
  out('landing: every interactive control has an accessible name', unnamed.length === 0, unnamed.join(' | '));

  // live regions carry TEXT (state not color-only)
  const live = await page.evaluate(() =>
    [...document.querySelectorAll('[aria-live], [role="status"], [role="alert"]')].map(e => (e.textContent || '').trim()).filter(Boolean).length);
  out('landing: live regions carry text', live > 0, `${live} non-empty`);

  // INP: click → first visual mutation of the space sheet
  const createBtn = page.locator('[data-testid="space-create-entry"], [data-testid="space-create-cta"]').first();
  if (await createBtn.count()) {
    const ms = await page.evaluate(() => new Promise(res => {
      const t0 = performance.now();
      const target = document.querySelector('[data-testid="space-create-entry"], [data-testid="space-create-cta"]');
      const obs = new MutationObserver(() => { if (document.querySelector('[data-testid="space-create"]')) { obs.disconnect(); res(performance.now() - t0); } });
      obs.observe(document.body, { childList: true, subtree: true });
      target.click();
      setTimeout(() => { obs.disconnect(); res(-1); }, 3000);
    }));
    out('INP: create-space entry → sheet visible', ms >= 0 && ms < 300, `${Math.round(ms)}ms (target <300ms)`);
  } else out('INP: create-space entry → sheet visible', false, 'entry not found');
  await page.keyboard.press('Escape');
  await sleep(400);

  // contrast (light)
  const failsL = await page.evaluate(() => window.__sweepContrast());
  out('contrast light: landing text meets WCAG AA', failsL.length === 0, failsL.length ? `${failsL.length} nodes: ` + JSON.stringify(failsL) : 'clean');

  await ctx.close();
}

// ═══ 2. LANDING — contrast dark ═══════════════════════════════════════════
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, colorScheme: 'dark' });
  const page = await ctx.newPage();
  await page.addInitScript(HELPERS);
  await page.goto(URL, { waitUntil: 'networkidle' });
  await sleep(800);
  const failsD = await page.evaluate(() => window.__sweepContrast());
  out('contrast dark: landing text meets WCAG AA', failsD.length === 0, failsD.length ? `${failsD.length} nodes: ` + JSON.stringify(failsD) : 'clean');
  await ctx.close();
}

// ═══ 3. ROOM — pairing, INP send, resilience, mobile edges ════════════════
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const A = await ctx.newPage(); const B = await ctx.newPage();
  await A.addInitScript(HELPERS); await B.addInitScript(HELPERS);
  const errs = [];
  for (const [tag, p] of [['A', A], ['B', B]]) p.on('pageerror', e => errs.push(`[${tag}] ${e.message.slice(0, 80)}`));

  await A.goto(URL, { waitUntil: 'networkidle' });
  await B.goto(URL, { waitUntil: 'networkidle' }); // land B BEFORE A pairs, else B resumes A's device state
  await A.getByRole('button', { name: /send/i }).first().click();
  const group = A.getByRole('group').first();
  await group.waitFor({ timeout: 15000 });
  let code = '';
  for (let i = 0; i < 12 && !/^\d{6}$/.test(code); i++) {
    code = (await group.locator('span').filter({ hasText: /^\d$/ }).allTextContents()).slice(-6).join('');
    if (!/^\d{6}$/.test(code)) await sleep(300);
  }
  await B.getByRole('button', { name: /receive/i }).first().click();
  const slots = B.locator('input[inputmode="numeric"]');
  await slots.first().waitFor({ timeout: 15000 });
  for (let i = 0; i < 6; i++) await slots.nth(i).fill(code[i]);
  await A.getByTestId('composer').first().waitFor({ timeout: 20000 });
  out('room: pairing works at 390x844', true, code);

  // landscape overflow
  await A.setViewportSize({ width: 844, height: 390 }); await sleep(600);
  const land = await A.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  out('room landscape 844x390: no horizontal overflow', land <= 1, `${land}px over`);
  await A.setViewportSize({ width: 390, height: 844 }); await sleep(400);

  // INP: Send click → message node appears (in-page rAF-accurate)
  const ta = A.locator('textarea').first();
  await ta.fill('latency probe');
  const sendMs = await A.evaluate(() => new Promise(res => {
    const t0 = performance.now();
    const before = document.querySelectorAll('[data-testid="message"], [data-bubble]').length;
    const obs = new MutationObserver(() => {
      const now = document.body.innerText.includes('latency probe') && document.querySelector('textarea')?.value === '';
      if (now) { obs.disconnect(); res(performance.now() - t0); }
    });
    obs.observe(document.body, { childList: true, subtree: true, characterData: true });
    document.querySelector('[data-testid="send"]')?.click();
    setTimeout(() => { obs.disconnect(); res(-1); }, 3000);
    void before;
  }));
  out('INP: Send click → message rendered', sendMs >= 0 && sendMs < 300, `${Math.round(sendMs)}ms (target <300ms)`);

  // long URL in composer: no overflow
  await ta.fill('https://example.com/' + 'a'.repeat(240) + '?x=' + 'b'.repeat(240));
  await sleep(400);
  const ov1 = await A.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  out('room: long-URL composer text causes no overflow', ov1 <= 1, `${ov1}px over`);
  await ta.fill('');

  // long filename send: no overflow, no freeze
  const longName = 'quarterly-report-' + 'x'.repeat(150) + '.txt';
  const tFile0 = performance.now();
  await A.locator('input[type="file"]').first().setInputFiles({ name: longName, mimeType: 'text/plain', buffer: Buffer.from('probe') });
  await sleep(1200);
  const ov2 = await A.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  out('room: 180-char filename causes no overflow', ov2 <= 1, `${ov2}px over, UI responsive ${Math.round(performance.now() - tFile0)}ms`);
  await A.evaluate(() => { document.querySelector('[data-testid="composer"] input[type="file"]')?.closest('form'); });
  await ta.fill('hello with file'); await A.getByTestId('send').click(); await sleep(1500);

  // resilience: offline → state visible → online → recovers
  await ctx.setOffline(true);
  let sawOffline = '';
  for (let i = 0; i < 20 && !sawOffline; i++) {
    await sleep(500);
    sawOffline = await A.evaluate(() => {
      const m = document.body.innerText.match(/offline|reconnect|connection (lost|restored)|trying/i);
      return m ? m[0] : '';
    });
  }
  out('resilience: offline state is communicated in text', !!sawOffline, sawOffline || 'nothing in 10s');
  await ctx.setOffline(false);
  let recovered = false;
  for (let i = 0; i < 24 && !recovered; i++) {
    await sleep(500);
    recovered = await A.evaluate(() => !/offline|reconnect/i.test(document.body.innerText));
  }
  out('resilience: reconnect restores a usable room', recovered, recovered ? 'recovered' : 'still degraded after 12s');
  out('room probes: no page errors', errs.length === 0, errs.join(' | '));
  await ctx.close();
}

// ═══ 4. PWA / SW facts (against the served origin) ════════════════════════
{
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto(URL, { waitUntil: 'networkidle' });
  const facts = await page.evaluate(async () => {
    const man = await fetch('/manifest.json').then(r => r.ok ? r.json() : null).catch(() => null);
    const sw = await fetch('/sw.js').then(r => r.ok ? r.text() : '').catch(() => '');
    return {
      manifest: !!man, name: man?.name || man?.short_name || '', theme: man?.theme_color || '',
      icons: (man?.icons || []).map(i => i.sizes).join(','),
      swCache: (sw.match(/const CACHE = '([^']+)'/) || [])[1] || '',
      swPrecachesOg: sw.includes('/og/sharetext-og.jpg'),
      swRegistered: !!navigator.serviceWorker?.controller,
    };
  });
  out('PWA: manifest served + valid with icons/theme', facts.manifest && facts.icons.includes('512') && !!facts.theme, JSON.stringify(facts));
  out('PWA: SW at v20 precaches the current og', facts.swCache === 'sharetexts-v20' && facts.swPrecachesOg, facts.swCache);
  console.log(`  note: SW controller active in page: ${facts.swRegistered} (registers on-demand for push reminders)`);
  await ctx.close();
}

await browser.close();
const failed = results.filter(r => !r).length;
console.log(`\nverify-quality: ${results.length - failed}/${results.length} passed`);
process.exit(failed === 0 ? 0 : 1);
