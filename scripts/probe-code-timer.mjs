// Measure the pairing-code countdown: what does the ring show on first
// arrival, and does the code ever rotate before a full 40s window elapses?
import { launchBrowser, URL, sleep, readLiveCode } from './lib.mjs';

const browser = await launchBrowser();
try {
  const results = [];
  for (let i = 0; i < 4; i++) {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await page.goto(URL, { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: 'Send' }).first().click();

    // Wait for LIVE CODE, then capture the ring number immediately.
    await page.getByText('LIVE CODE').waitFor({ timeout: 10000 });
    const readState = async () => {
      const code = await readLiveCode(page);
      const ringText = await page.evaluate(() => {
        const spans = Array.from(document.querySelectorAll('span'));
        const ring = spans.find(s => /^\d{1,2}$/.test(s.textContent.trim()) && (s.parentElement?.className?.toString() || '').includes('right-6'));
        return ring ? ring.textContent.trim() : null;
      });
      // Also read the code shown in the six tiles.
      const tiles = await page.evaluate(() => Array.from(document.querySelectorAll('span')).filter(s => /^\d$/.test(s.textContent.trim())).map(s => s.textContent.trim()).slice(-6).join(''));
      return { code, ringText, tiles };
    };
    const first = await readState();

    // Track the code over time; record how long until the first rotation.
    let rotatedAt = null;
    const start = Date.now();
    for (let t = 0; t < 50; t++) {
      await sleep(1000);
      const now = await readState();
      if (now.code !== first.code || now.tiles !== first.tiles) {
        rotatedAt = Date.now() - start;
        break;
      }
    }
    results.push({ first, rotatedAt: rotatedAt !== null ? (rotatedAt / 1000).toFixed(1) + 's' : '>50s' });
    await ctx.close();
  }
  console.log('first-arrival runs:', JSON.stringify(results, null, 1));

  // ---- Refresh mid-window: the code must re-anchor to a fresh ~40s ----
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto(URL, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Send' }).first().click();
  await page.getByText('LIVE CODE').waitFor({ timeout: 10000 });
  // Wait until the window is mostly over (remaining ~8s).
  await sleep(32000);
  const beforeCode = await readLiveCode(page);
  await page.reload({ waitUntil: 'networkidle' });
  await page.getByText('LIVE CODE').waitFor({ timeout: 10000 });
  // Give the refresh_code RPC (socket reconnect + round trip) time to land.
  await sleep(2500);
  const afterCode = await readLiveCode(page);
  // The real contract: the COUNTDOWN restarts fresh (~40s), even if the code
  // value is unchanged (same TOTP window). Read the ring number (the span
  // that is a sibling of the progress SVG).
  const ringAfter = await page.evaluate(() => {
    const spans = Array.from(document.querySelectorAll('span'));
    const ring = spans.find(s => /^\d{1,2}$/.test(s.textContent.trim()) && (s.parentElement?.className?.toString() || '').includes('top-6 right-6'));
    return ring ? Number(ring.textContent.trim()) : null;
  });
  const fresh = ringAfter !== null && ringAfter >= 30;
  const diag = await page.evaluate(() => (window.__sharetextDiag?.snapshot?.() ?? []).filter(e => /code_refresh|room.resume|room.join/.test(e.stage)).map(e => `${e.stage}:${e.ok}`));
  console.log('refresh-mid-window:', JSON.stringify({ beforeCode, afterCode, ringAfterReload: ringAfter, reAnchoredToFreshCountdown: fresh, diag }));
  await ctx.close();
} finally {
  await browser.close();
}
