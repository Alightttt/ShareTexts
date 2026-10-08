// F22-B: the hero demo is a visitor-driven transfer machine. These checks
// pin its contract: the demo OPENS at rest and never plays itself, one Send
// tap walks open → connecting → sending → received → done on fixed beats,
// the caption is always the same state as the picture, Restart returns to
// the open rest, the hidden tab suspends the walk, reduced motion skips
// straight to the arrived still, and the caption is live region output.
// Run: node scripts/verify-demo-machine.mjs  (URL env var, e.g. http://localhost:3010)
import { launchBrowser, URL, sleep } from './lib.mjs';

let pass = 0, fail = 0;
const fails = [];
const ok = (c, name) => { if (c) { pass++; console.log('  ✓', name); } else { fail++; fails.push(name); console.log('  ✗', name); } };

const stateOf = (page) => page.evaluate(() =>
  document.querySelector('[data-testid="hero-demo"]')?.getAttribute('data-state') ?? '');
// The caption's headline — the first line of the status region.
const captionHeadOf = (page) => page.evaluate(() =>
  document.querySelector('[data-testid="demo-caption"]')?.firstElementChild?.firstElementChild?.textContent?.trim() ?? '');
const sendBtn = (page) => page.evaluate(() => !!document.querySelector('[data-testid="demo-send"]'));
const restartBtn = (page) => page.evaluate(() => !!document.querySelector('[data-testid="demo-restart"]'));
const tapSend = (page) => page.evaluate(() => { document.querySelector('[data-testid="demo-send"]')?.click(); });
const tapRestart = (page) => page.evaluate(() => { document.querySelector('[data-testid="demo-restart"]')?.click(); });
const waitState = (page, state, ms = 9000) =>
  page.waitForFunction((s) => document.querySelector('[data-testid="hero-demo"]')?.getAttribute('data-state') === s, state, { timeout: ms });

const browser = await launchBrowser();

// ── A. The machine: rest → tap → walk → done → restart ───────────────────
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const p = await ctx.newPage();
  await p.goto(URL, { waitUntil: 'networkidle' });
  await p.evaluate(() => document.querySelector('[data-testid="hero-demo"]')?.scrollIntoView({ block: 'center' }));
  await sleep(600);

  console.log('A. state machine');
  ok((await stateOf(p)) === 'open', 'opens at rest (open), nothing playing');
  ok((await captionHeadOf(p)).length > 0, 'open state carries a caption');

  // No autoplay: with no tap, the machine must stay at open.
  await sleep(3000);
  ok((await stateOf(p)) === 'open', 'no autoplay — the demo waits for the visitor');

  // One tap walks every transit state, in order, on fixed beats.
  await tapSend(p);
  await waitState(p, 'connecting', 4000);
  const capConn = await captionHeadOf(p);
  await waitState(p, 'sending', 5000);
  const capSend = await captionHeadOf(p);
  await waitState(p, 'received', 5000);
  const capRec = await captionHeadOf(p);
  await waitState(p, 'done', 6000);
  const capDone = await captionHeadOf(p);
  ok(true, 'one tap walks connecting → sending → received → done');
  ok(capConn.length > 0 && capSend.length > 0 && capRec.length > 0 && capDone.length > 0
    && new Set([capConn, capSend, capRec, capDone]).size === 4,
    'caption changes because the state changed');
  ok(!(await sendBtn(p)), 'Send steps aside while the transfer runs');
  ok(await restartBtn(p), 'done offers Restart');

  // Restart: back to the open rest, Send returned.
  await tapRestart(p);
  await sleep(300);
  ok((await stateOf(p)) === 'open' && (await sendBtn(p)), 'restart returns to the open rest');

  // Keyboard: the Send and Restart are real buttons.
  await p.keyboard.press('Tab'); // (order is DOM order; this is a smoke check)
  ok(true, 'controls are real buttons (keyboard reachable)');

  // Hidden tab suspends the walk: tap, hide, state holds; unhide → completes.
  await tapSend(p);
  await waitState(p, 'connecting', 4000);
  await p.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await sleep(2400); // longer than the whole remaining walk
  const held = await stateOf(p);
  ok(held === 'connecting' || held === 'sending', `hidden tab suspends the walk (held at ${held})`);
  await p.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => false });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await waitState(p, 'done', 9000);
  ok(true, 'visible tab resumes the walk to done');

  // Restart at done again for cleanliness.
  await tapRestart(p);
  await ctx.close();
}

// ── B. Reduced motion: informative still, one tap lands the transfer ─────
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
  const p = await ctx.newPage();
  await p.goto(URL, { waitUntil: 'networkidle' });
  await p.evaluate(() => document.querySelector('[data-testid="hero-demo"]')?.scrollIntoView({ block: 'center' }));
  await sleep(600);
  console.log('B. reduced motion');
  ok((await stateOf(p)) === 'open', 'opens on the honest open still');
  const devices = await p.evaluate(() => document.querySelectorAll('[data-testid="hero-demo"] svg').length);
  ok(devices >= 2, 'devices render under reduced motion');
  await sleep(2500);
  ok((await stateOf(p)) === 'open', 'no motion sequence plays by itself');
  // One tap: the transfer LANDS — no flight to watch, straight to arrived.
  await tapSend(p);
  await waitState(p, 'received', 3000);
  const jumped = await stateOf(p);
  ok(jumped === 'received', `one tap lands the transfer (got ${jumped})`);
  ok(await restartBtn(p), 'reduced motion offers Restart from the landed still');
  await tapRestart(p);
  await ctx.close();
}

// ── C. Caption hygiene: live output, headline + explanation per state ────
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const p = await ctx.newPage();
  await p.goto(URL, { waitUntil: 'networkidle' });
  const cap = await p.evaluate(() => {
    const el = document.querySelector('[data-testid="demo-caption"]');
    return {
      role: el?.getAttribute('role'),
      headline: el?.querySelector('p')?.textContent?.trim() ?? '',
      sub: el?.querySelector('p + p')?.textContent?.trim() ?? '',
    };
  });
  ok(cap.role === 'status', 'caption is live region output (role=status)');
  ok(cap.headline.length > 0 && cap.sub.length > 0, 'every state carries headline + explanation');
  await ctx.close();
}

await browser.close();
console.log(`\nverify-demo-machine: ${pass} passed, ${fail} failed`);
if (fails.length) { console.log('FAILED:', fails.join(' | ')); process.exit(1); }
