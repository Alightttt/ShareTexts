// Perf probe: landing paint metrics + end-to-end interaction latencies.
// Runs against a local dev server; treat absolute numbers as dev-stack figures
// (the production bundle is the source of truth for size — see the build
// output / performance audit).
import { launchBrowser, pairDevices, URL, sleep } from './lib.mjs';

const browser = await launchBrowser();
const ctxA = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const ctxB = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
const A = await ctxA.newPage();
const B = await ctxB.newPage();

// --- landing paint ---
const marks = {};
await A.goto(URL + '/?probe=1', { waitUntil: 'domcontentloaded' });
marks.nav = await A.evaluate(() => {
  const nav = performance.getEntriesByType('navigation')[0];
  const paint = performance.getEntriesByType('paint');
  const fcp = paint.find(p => p.name === 'first-contentful-paint');
  return {
    dcl: Math.round(nav.domContentLoadedEventEnd),
    load: Math.round(nav.loadEventEnd),
    fcp: fcp ? Math.round(fcp.startTime) : null,
  };
});
await A.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
console.log('landing:', JSON.stringify(marks.nav));

// --- interaction latencies (Node-side clocks) ---
let t0 = Date.now();
await A.getByRole('button', { name: 'Start a transfer' }).first().click();
await A.getByText('LIVE CODE').waitFor({ timeout: 10000 });
console.log('create → live code:', Date.now() - t0, 'ms');

await B.goto(URL, { waitUntil: 'domcontentloaded' });
let t1 = Date.now();
await B.getByRole('button', { name: 'Already have a code?' }).first().click();
const digits = await A.locator('span').filter({ hasText: /^\d$/ }).allTextContents();
const code = digits.slice(-6).join('');
await B.locator('input[inputmode="numeric"]').fill(code);
await B.getByText(/Paste or type|Your private clipboard|End session/).first().waitFor({ timeout: 25000 });
console.log('join (code entry → chat):', Date.now() - t1, 'ms');

await A.getByText(/Paste or type|Your private clipboard|End session/).first().waitFor({ timeout: 10000 });
let t2 = Date.now();
await A.locator('textarea').first().fill('latency check');
await A.getByRole('button', { name: 'Send' }).click();
await B.getByText('latency check').first().waitFor({ timeout: 10000 });
console.log('A send → B received:', Date.now() - t2, 'ms');

await browser.close();
