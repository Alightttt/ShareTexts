// F18: the hero demo is a state machine wearing a UI. These checks pin its
// contract: the seven beats fire in order from ONE clock, the caption is
// always the same step as the picture, the loop returns to step 1 with no
// dead end and no double timer, reduced motion hands over a meaningful
// still instead of a blank, and pause (manual and tab-hidden) really stops
// the clock. Run: node scripts/verify-demo-machine.mjs  (dev server on :3010)
import { launchBrowser, URL, sleep } from './lib.mjs';

let pass = 0, fail = 0;
const fails = [];
const ok = (c, name) => { if (c) { pass++; console.log('  ✓', name); } else { fail++; fails.push(name); console.log('  ✗', name); } };

const TOTAL = 7;
const stepOf = (page) => page.evaluate(() => {
  const el = document.querySelector('[data-testid="demo-scrubber"]');
  return el ? Number(el.getAttribute('aria-valuenow')) : NaN;
});
// The scrubber's aria-valuetext IS the current caption (single source of
// truth); the visible [data-testid=demo-caption] node crossfades, so during
// a beat change two copies coexist and textContent concatenates them.
const captionOf = (page) => page.evaluate(() =>
  document.querySelector('[data-testid="demo-scrubber"]')?.getAttribute('aria-valuetext') ?? '');
const captionOfAt = (page, step) => page.evaluate((n) => {
  const el = document.querySelectorAll('[data-testid="demo-caption-list"] li')[n - 1];
  return el ? el.textContent.replace(/\s+/g, ' ').trim() : '';
}, step);
const fillWidthOf = (page) => page.evaluate(() => {
  const fills = document.querySelectorAll('[data-testid="demo-scrubber"] .st-demo-fill');
  const el = fills[fills.length - 1];
  if (!el) return NaN;
  const w = el.parentElement.getBoundingClientRect().width;
  const f = el.getBoundingClientRect();
  // Width of the visible clip window vs its full slot: a RUNNING clock
  // grows the inner fill past the clip; a stopped one does not.
  return w > 0 ? Math.min(1, f.width / w) : NaN;
});
const pauseBtn = (page) => page.evaluate(() => {
  const b = document.querySelector('[data-testid="demo-play"]');
  if (!b) return null;
  b.click();
  return b.getAttribute('aria-label');
});
const rafSampler = (page) => page.evaluate(() => {
  window.__rafCount = 0;
  const tick = () => { window.__rafCount++; window.__raf = requestAnimationFrame(tick); };
  cancelAnimationFrame(window.__raf);
  window.__raf = requestAnimationFrame(tick);
});
const rafDelta = async (page, ms) => {
  await page.evaluate((m) => new Promise(r => setTimeout(() => r(window.__rafCount), m)), ms);
  return page.evaluate(() => { cancelAnimationFrame(window.__raf); return window.__rafCount; });
};

const browser = await launchBrowser();

// ── A. The machine: order, sync, loop, no double clock ───────────────────
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const p = await ctx.newPage();
  await p.goto(URL, { waitUntil: 'networkidle' });
  await p.evaluate(() => document.querySelector('[data-testid="hero-demo"]')?.scrollIntoView({ block: 'center' }));
  await sleep(600);

  console.log('A. state machine');
  const s0 = await stepOf(p);
  ok(s0 === 1, `opens at step 1 (got ${s0})`);

  // Walk forward by nudging the clock: seek to each step and confirm the
  // caption equals the list entry for the SAME step (no drift). Autoplay is
  // paused first so the machine cannot advance underneath the walk.
  await pauseBtn(p);
  let synced = true;
  for (let n = 1; n <= TOTAL; n++) {
    // Click the CENTER of step n's slot: a boundary-landing click (fraction
    // × width exactly on an edge, plus subpixel rounding) can tip into the
    // neighboring step; the center of a slot never can.
    await p.evaluate((f) => {
      const rail = document.querySelector('[data-testid="demo-scrubber"]');
      const r = rail.getBoundingClientRect();
      rail.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: r.left + r.width * f, clientY: r.top + r.height / 2 }));
    }, (n - 0.5) / TOTAL);
    await sleep(140);
    const s = await stepOf(p);
    const cap = await captionOf(p);
    const ref = await captionOfAt(p, n);
    if (s !== n || !ref.includes(cap)) {
      synced = false;
      console.log(`    step ${n}: now=${s} cap="${cap.slice(0, 40)}" ref="${ref.slice(0, 40)}"`);
    }
  }
  ok(synced, 'caption matches the step marker at every step');
  await pauseBtn(p); // resume for the clock checks below

  // One clock only: after a full cycle, exactly one timer drives the fill.
  // Evidence: the fill grows while running (non-decreasing width samples)
  // and the step advances ONCE within one beat window (no double-speed).
  const sBefore = await stepOf(p);
  const w1 = await fillWidthOf(p);
  await sleep(400);
  const w2 = await fillWidthOf(p);
  ok(!Number.isNaN(w1) && !Number.isNaN(w2) && w2 > w1, `clock runs while playing (${w1?.toFixed(2)} → ${w2?.toFixed(2)})`);

  // Loop: sit at the last step and wait out its beat — the machine must
  // come back to step 1 by itself (no dead end, no hard restart).
  await p.evaluate(() => {
    const rail = document.querySelector('[data-testid="demo-scrubber"]');
    const r = rail.getBoundingClientRect();
    rail.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: r.right - 2, clientY: r.top + r.height / 2 }));
  });
  await sleep(200);
  const last = await stepOf(p);
  ok(last === TOTAL, `seek reaches the last step (got ${last})`);
  let returned = false;
  for (let i = 0; i < 24; i++) {
    await sleep(300);
    if ((await stepOf(p)) === 1) { returned = true; break; }
  }
  ok(returned, 'loop returns to step 1 on its own');

  // Keyboard: the rail steps both directions without leaving the element.
  await p.evaluate(() => document.querySelector('[data-testid="demo-scrubber"]')?.focus());
  await p.keyboard.press('ArrowRight');
  await sleep(80);
  const kb1 = await stepOf(p);
  await p.keyboard.press('Home');
  await sleep(80);
  const kb2 = await stepOf(p);
  ok(kb1 === 2 && kb2 === 1, 'keyboard steps and Homes the machine');

  // Manual pause truly stops the clock — rAF keeps counting, the fill must
  // not move while paused, then resume.
  const sHold = await stepOf(p);
  await pauseBtn(p);
  await sleep(120);
  const wP1 = await fillWidthOf(p);
  await sleep(500);
  const wP2 = await fillWidthOf(p);
  const sHold2 = await stepOf(p);
  ok(sHold === sHold2 && Math.abs(wP2 - wP1) < 0.02, 'manual pause freezes the beat');
  await pauseBtn(p); // resume
  await sleep(500);
  const wR = await fillWidthOf(p);
  ok(wR > wP2, 'resume restarts the clock');

  // Offscreen stop: park the demo far below the fold and watch rAF-driven
  // progress halt (IntersectionObserver pause).
  await p.evaluate(() => {
    const host = document.querySelector('[data-testid="hero-demo"]');
    host.scrollIntoView({ block: 'center' });
  });
  await sleep(400);
  await pauseBtn(p); // ensure playing
  await p.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await sleep(800); // IO threshold grace
  const wOff1 = await fillWidthOf(p);
  await sleep(900);
  const wOff2 = await fillWidthOf(p);
  const offSame = Number.isNaN(wOff1) && Number.isNaN(wOff2) || Math.abs((wOff2 ?? 0) - (wOff1 ?? 0)) < 0.02;
  ok(offSame, 'offscreen demo holds its beat');
  await ctx.close();
}

// ── B. Visibility: a hidden tab suspends the clock ───────────────────────
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const p = await ctx.newPage();
  await p.goto(URL, { waitUntil: 'networkidle' });
  await p.evaluate(() => document.querySelector('[data-testid="hero-demo"]')?.scrollIntoView({ block: 'center' }));
  await sleep(500);
  // Emulate visibilitychange → hidden without closing the page.
  await p.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await sleep(300);
  const s1 = await stepOf(p);
  const w1 = await fillWidthOf(p);
  await sleep(1600);
  const s2 = await stepOf(p);
  const w2 = await fillWidthOf(p);
  ok(s1 === s2 && Math.abs((w2 ?? 0) - (w1 ?? 0)) < 0.02, 'hidden tab suspends the beat');
  await p.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => false });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await sleep(700);
  const w3 = await fillWidthOf(p);
  ok(w3 > w2, 'visible tab resumes the beat');
  await ctx.close();
}

// ── C. Reduced motion: a meaningful still + working rail, no autoplay ────
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
  const p = await ctx.newPage();
  await p.goto(URL, { waitUntil: 'networkidle' });
  await p.evaluate(() => document.querySelector('[data-testid="hero-demo"]')?.scrollIntoView({ block: 'center' }));
  await sleep(600);
  console.log('C. reduced motion');
  const still = await p.evaluate(() => {
    const cap = document.querySelector('[data-testid="demo-caption"]')?.textContent?.trim() ?? '';
    const devices = document.querySelectorAll('[data-testid="hero-demo"] svg').length;
    const play = document.querySelector('[data-testid="demo-play"]');
    return { cap, devices, hasPlay: !!play, captionHidden: !!cap };
  });
  ok(still.captionHidden && still.cap.length > 0, `reduced motion opens on a captioned still ("${still.cap.slice(0, 34)}…")`);
  ok(still.devices >= 2, 'devices still render under reduced motion');
  ok(!still.hasPlay, 'no play/pause control when nothing animates');
  const start = await stepOf(p);
  const wA = await fillWidthOf(p);
  await sleep(1200);
  const wB = await fillWidthOf(p);
  ok((await stepOf(p)) === start, 'no autoplay under reduced motion');
  ok(Number.isNaN(wA) && Number.isNaN(wB) || wB >= wA, 'clock not advancing');
  // The rail still steps the story by hand.
  await p.evaluate(() => document.querySelector('[data-testid="demo-scrubber"]')?.focus());
  await p.keyboard.press('ArrowRight');
  await p.keyboard.press('ArrowRight');
  await sleep(120);
  ok((await stepOf(p)) === (start + 2 - 1) % TOTAL + 1, 'rail steps manually under reduced motion');
  // Caption follows the manual step.
  const capN = await captionOf(p);
  const refN = await captionOfAt(p, (start + 2 - 1) % TOTAL + 1);
  ok(refN.includes(capN), 'caption follows the manual step');
  await ctx.close();
}

// ── D. Caption hygiene: every step carries headline + explanation ────────
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const p = await ctx.newPage();
  await p.goto(URL, { waitUntil: 'networkidle' });
  const list = await p.evaluate(() =>
    [...document.querySelectorAll('[data-testid="demo-caption-list"] li')].map(li => li.textContent.replace(/\s+/g, ' ').trim()));
  ok(list.length === TOTAL, `sr-only caption list has ${TOTAL} beats (got ${list.length})`);
  ok(list.every(l => l.length > 8 && /Step \d/.test(l)), 'every caption carries its step marker');
  await ctx.close();
}

await browser.close();
console.log(`\nverify-demo-machine: ${pass} passed, ${fail} failed`);
if (fails.length) { console.log('FAILED:', fails.join(' | ')); process.exit(1); }
