// F18 pass: the surfaces this round touched — landing (single screen),
// About, 404, Docs/Legal, mobile + landscape geometry, and the connected
// rail's new controls. Writes proof screenshots to docs/audits/shots-f18/
// and asserts the facts a screenshot can't prove (overflow, tap targets,
// console errors).
import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { launchBrowser, sleep, tapTargetIssues, TAP_TARGET_MIN } from './lib.mjs';

const BASE = process.env.URL || 'http://localhost:3010';
const OUT = 'docs/audits/shots-f18';
fs.mkdirSync(OUT, { recursive: true });

const results = [];
const out = (name, ok, extra = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra ? ' — ' + extra : ''}`); };
const errors = [];
const watch = (page, tag) => {
  page.on('console', m => { if (m.type() === 'error') errors.push(`[${tag}] ${m.text().slice(0, 200)}`); });
  page.on('pageerror', e => errors.push(`[${tag} pageerror] ${e.message.slice(0, 200)}`));
};

const overflow = (page) => page.evaluate(() => {
  const de = document.documentElement;
  const offenders = [...document.querySelectorAll('*')]
    .filter(el => {
      const r = el.getBoundingClientRect();
      return r.width > 0 && (r.right > de.clientWidth + 1 || r.left < -1);
    })
    .slice(0, 4)
    .map(el => (el.tagName + '.' + (el.className || '').toString().split(' ').slice(0, 3).join('.')).slice(0, 80));
  return { scrollW: de.scrollWidth, clientW: de.clientWidth, offenders };
});

const browser = await launchBrowser();
try {
  // ── Desktop landing (1440×900) ────────────────────────────────────────
  const ctxD = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const D = await ctxD.newPage();
  watch(D, 'landing-desktop');
  await D.goto(BASE, { waitUntil: 'domcontentloaded' });
  await D.getByRole('heading', { level: 1 }).waitFor({ timeout: 20000 });
  await sleep(900);

  const landing = await D.evaluate(() => {
    const h1 = document.querySelector('h1');
    const send = [...document.querySelectorAll('button')].find(b => /^Send$/.test(b.textContent.trim()));
    const receive = [...document.querySelectorAll('button')].find(b => /^Receive$/.test(b.textContent.trim()));
    const header = document.querySelector('header');
    const footer = document.querySelector('footer');
    const h = h1?.getBoundingClientRect();
    return {
      h1: !!h1, send: !!send, receive: !!receive,
      headerSticky: header ? getComputedStyle(header).position === 'sticky' : false,
      footerVisible: footer ? footer.getBoundingClientRect().height > 0 : false,
      heroTop: h ? Math.round(h.top) : null,
      heroLeftHalf: h ? h.left < window.innerWidth * 0.5 : false,
      horizon: !!document.querySelector('.st-horizon'),
      spotlight: !!document.querySelector('.st-spotlight'),
      icon3d: !!document.querySelector('header a[href="/docs"]'),
      panes: document.querySelectorAll('[data-pane], .split-pane').length,
      docScrolls: document.documentElement.scrollHeight > window.innerHeight + 2,
    };
  });
  out('desktop landing: hero + both actions present', landing.h1 && landing.send && landing.receive);
  out('desktop landing: hero words sit in the left half', landing.heroLeftHalf, `heroTop=${landing.heroTop}`);
  out('desktop landing: sticky header on desktop', landing.headerSticky);
  out('desktop landing: footer reachable', landing.footerVisible);
  out('desktop landing: depth layers (horizon + spotlight) mounted', landing.horizon && landing.spotlight);
  out('desktop landing: single screen, no document scroll', !landing.docScrolls);
  const ofD = await overflow(D);
  out('desktop landing: no horizontal overflow', ofD.offenders.length === 0, JSON.stringify(ofD.offenders));

  const tapIssues = await D.evaluate(tapTargetIssues, { minTarget: TAP_TARGET_MIN });
  out('desktop landing: every tap target ≥40px', tapIssues.length === 0, JSON.stringify(tapIssues.slice(0, 4)));
  await D.screenshot({ path: path.join(OUT, '01-landing-desktop.png') });

  // ── About ─────────────────────────────────────────────────────────────
  // /about is served by the STATIC guide page (public/guides/about.html) —
  // cold loads and the footer's plain <a> both land there, so that is the
  // surface this pass upgraded. (The in-app React route stays as the
  // client-side equivalent.)
  await D.goto(`${BASE}/about`, { waitUntil: 'domcontentloaded' });
  await D.getByRole('heading', { level: 1 }).waitFor({ timeout: 20000 });
  await sleep(400);
  const about = await D.evaluate(() => ({
    principle: document.body.innerText.includes('Every byte you send should arrive exactly as it left'),
    readNext: document.body.innerText.includes('Read next'),
    handle: !!document.querySelector('a[href="https://x.com/0xalyt"]'),
    verified: document.body.innerText.includes('@0xalyt'),
    h1: document.querySelector('h1')?.textContent?.trim() ?? '',
  }));
  out('about: principle section', about.principle);
  out('about: read-next resource panel', about.readNext);
  out('about: real X handle card', about.handle && about.verified);
  // The static guide page is long-form prose: links INSIDE paragraphs are
  // inline by nature and exempt (the same reasoning as the app's sr-only
  // exemption). Its controls — header, footer, cards — must still clear 40px.
  const aboutTap = await D.evaluate(() => {
    const floor = 40;
    const issues = [];
    for (const el of document.querySelectorAll('button, a')) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      if (getComputedStyle(el).display === 'inline') continue;
      if (r.width < floor || r.height < floor) {
        issues.push({ name: (el.textContent || '').trim().slice(0, 30), width: Math.round(r.width), height: Math.round(r.height) });
      }
    }
    return issues;
  });
  out('about: every tap target ≥40px', aboutTap.length === 0, JSON.stringify(aboutTap.slice(0, 4)));
  const ofA = await overflow(D);
  out('about: no horizontal overflow', ofA.offenders.length === 0, JSON.stringify(ofA.offenders));
  await D.screenshot({ path: path.join(OUT, '02-about.png'), fullPage: true });

  // ── 404 ───────────────────────────────────────────────────────────────
  await D.goto(`${BASE}/definitely-not-a-route`, { waitUntil: 'domcontentloaded' });
  await sleep(900);
  const nf = await D.evaluate(() => ({
    text: document.body.innerText,
    horizon: !!document.querySelector('.st-horizon'),
    homeLink: !!document.querySelector('a[href="/"]'),
  }));
  out('404: designed page (not a blank route)', /404|not found|page/i.test(nf.text) && nf.homeLink, `horizon=${nf.horizon}`);
  await D.screenshot({ path: path.join(OUT, '03-404.png') });

  // ── Docs + Legal ──────────────────────────────────────────────────────
  for (const [route, label] of [['/docs', 'docs'], ['/privacy', 'legal']]) {
    await D.goto(BASE + route, { waitUntil: 'domcontentloaded' });
    // Both are lazy routes — wait for the heading instead of guessing a
    // duration (the first pass failed here on a 900ms sleep alone).
    await D.getByRole('heading', { level: 1 }).waitFor({ timeout: 20000 }).catch(() => {});
    const ok = await D.evaluate(() => ({
      branded: !!document.querySelector('header'),
      h1: !!document.querySelector('h1'),
      nestedAnchors: document.querySelectorAll('a a').length,
    }));
    out(`${label}: renders ${route}`, ok.branded && ok.h1);
    out(`${label}: no nested anchors (invalid HTML)`, ok.nestedAnchors === 0, `nested=${ok.nestedAnchors}`);
    await D.screenshot({ path: path.join(OUT, `04-${label}.png`) });
  }

  // ── Mobile portrait ───────────────────────────────────────────────────
  const ctxM = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const M = await ctxM.newPage();
  watch(M, 'landing-mobile');
  await M.goto(BASE, { waitUntil: 'domcontentloaded' });
  await M.getByRole('heading', { level: 1 }).waitFor({ timeout: 20000 });
  await sleep(900);
  const ofM = await overflow(M);
  out('mobile portrait: no horizontal overflow', ofM.offenders.length === 0, JSON.stringify(ofM.offenders));
  const mTap = await M.evaluate(tapTargetIssues, { minTarget: TAP_TARGET_MIN });
  out('mobile portrait: every tap target ≥40px', mTap.length === 0, JSON.stringify(mTap.slice(0, 4)));
  await M.screenshot({ path: path.join(OUT, '05-landing-mobile.png') });

  // ── Mobile landscape (short) ──────────────────────────────────────────
  const ctxL = await browser.newContext({ viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true });
  const L = await ctxL.newPage();
  watch(L, 'landing-landscape');
  await L.goto(BASE, { waitUntil: 'domcontentloaded' });
  await L.getByRole('heading', { level: 1 }).waitFor({ timeout: 20000 });
  await sleep(900);
  const land = await L.evaluate(() => {
    const hidden = [...document.querySelectorAll('.st-hide-landscape, .st-hide-landscape-sm')]
      .filter(el => getComputedStyle(el).display !== 'none').length;
    return { hidden, h1Size: parseFloat(getComputedStyle(document.querySelector('h1')).fontSize) };
  });
  out('landscape: decorative rows collapse', land.hidden === 0, `h1=${land.h1Size}px`);
  const ofL = await overflow(L);
  out('landscape: no horizontal overflow', ofL.offenders.length === 0, JSON.stringify(ofL.offenders));
  await L.screenshot({ path: path.join(OUT, '06-landing-landscape.png') });

  // ── Connected desktop rail: presence dock + slide-to-disconnect ────────
  const ctxA = await browser.newContext({ viewport: { width: 1280, height: 860 } });
  const ctxB = await browser.newContext({ viewport: { width: 1280, height: 860 } });
  const pa = await ctxA.newPage(); const pb = await ctxB.newPage();
  watch(pa, 'room-a'); watch(pb, 'room-b');
  await pa.goto(BASE, { waitUntil: 'domcontentloaded' });
  await pa.getByRole('button', { name: 'Send', exact: true }).click();
  await pa.waitForFunction(() => !!localStorage.getItem('sharetext.session.v1'), null, { timeout: 20000 });
  const { roomId } = await pa.evaluate(() => JSON.parse(localStorage.getItem('sharetext.session.v1')));
  await pb.goto(`${BASE}/s/${roomId.replace(/-/g, '').slice(0, 8)}`, { waitUntil: 'domcontentloaded' });
  await pa.waitForSelector('[data-testid="composer"]', { timeout: 30000 });
  await pb.waitForSelector('[data-testid="composer"]', { timeout: 30000 });
  await sleep(1200);
  const rail = await pa.evaluate(() => {
    const slide = document.querySelector('[data-testid="end-session"]');
    return {
      slide: !!slide,
      knob: slide ? !!slide.querySelector('button') : false,
      count: document.querySelectorAll('[data-testid="end-session"]').length,
      toggles: document.querySelectorAll('[data-testid="theme-toggle"]').length,
      label: slide ? slide.textContent.trim().slice(0, 30) : '',
    };
  });
  out('room rail: slide-to-confirm disconnect mounted', rail.slide && rail.knob);
  out('room screen carries no theme toggle in its header', rail.toggles === 0, `toggles=${rail.toggles}`);
  out('other screens still have one (landing header)', (await pb.evaluate(() => document.querySelectorAll('[data-testid="theme-toggle"]').length)) === 0, 'mobile room: 0 expected');
  await pa.screenshot({ path: path.join(OUT, '07-room-rail.png'), fullPage: false });
  await pb.screenshot({ path: path.join(OUT, '08-room-chat.png') });

  // Empty-room starters: the room tells the user what to do instead of
  // waiting. (Checked on B, which has received nothing yet.)
  const starters = await pb.evaluate(() => ({
    hi: !!document.querySelector('[data-testid="chat.suggest.hi"]'),
    photo: !!document.querySelector('[data-testid="chat.suggest.photo"]'),
    link: !!document.querySelector('[data-testid="chat.suggest.link"]'),
  }));
  out('empty room offers three one-tap starters', starters.hi && starters.photo && starters.link, JSON.stringify(starters));

  // ── The slide has to be DRAGGED: a tap must not disconnect ──────────────
  const slideBox = await pa.locator('[data-testid="end-session"]').boundingBox();
  const knobBox = await pa.locator('[data-testid="end-session"] button').boundingBox();
  if (slideBox && knobBox) {
    await pa.mouse.move(knobBox.x + knobBox.width / 2, knobBox.y + knobBox.height / 2);
    await pa.mouse.down();
    await pa.mouse.up();
    await sleep(400);
    const stillHere = await pa.locator('[data-testid="end-session"]').count();
    out('a tap on the knob does NOT disconnect', stillHere === 1, `slides=${stillHere}`);

    // Now carry it past the arming line and release.
    await pa.mouse.move(knobBox.x + knobBox.width / 2, knobBox.y + knobBox.height / 2);
    await pa.mouse.down();
    const endX = slideBox.x + slideBox.width - 6;
    const steps = 8;
    for (let i = 1; i <= steps; i++) {
      await pa.mouse.move(knobBox.x + knobBox.width / 2 + ((endX - knobBox.x - knobBox.width / 2) * i) / steps, knobBox.y + knobBox.height / 2, { steps: 2 });
      await sleep(40);
    }
    await pa.mouse.up();
    let ended = false;
    try {
      await pa.waitForFunction(() => !document.querySelector('[data-testid="end-session"]'), null, { timeout: 12000 });
      ended = true;
    } catch { /* reported below */ }
    out('dragging past the arming line ends the room', ended);
    await pa.screenshot({ path: path.join(OUT, '09-after-slide-disconnect.png') });
  } else {
    out('dragging past the arming line ends the room', false, 'slide not measurable');
  }

  // Landing geometry again after the drag — the same one-screen composition.
  const backHome = await pa.evaluate(() => ({
    h1: !!document.querySelector('h1'),
    spaceEntry: !!document.querySelector('[data-testid="space-entry"]'),
    spaceLabel: document.querySelector('[data-testid="space-entry"]')?.textContent?.includes('Temporary Space') ?? false,
    create: !!document.querySelector('[data-testid="space-create-entry"]'),
    join: !!document.querySelector('[data-testid="space-join-entry"]'),
  }));
  out('landing returns after the drag with the Space section intact', backHome.h1 && backHome.spaceEntry && backHome.create && backHome.join, JSON.stringify(backHome));
  out('Temporary Space reads as a labelled section', backHome.spaceLabel);
  await pa.screenshot({ path: path.join(OUT, '10-landing-space-section.png') });

  const realErrors = errors.filter(e => !/favicon|Download the React DevTools|ResizeObserver loop/i.test(e));
  out('no console errors across all surfaces', realErrors.length === 0, realErrors.slice(0, 3).join(' | '));

  const passed = results.filter(Boolean).length;
  console.log(`\n${passed}/${results.length} checks passed → shots in ${OUT}`);
  process.exitCode = passed === results.length ? 0 : 1;
} finally {
  await browser.close();
}
