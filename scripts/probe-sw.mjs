// Verify the service worker registers and takes control in a production build.
import { chromium } from 'playwright';
import fs from 'fs';

const URL = process.env.URL || 'http://localhost:3311';

function resolveChrome() {
  if (process.env.CHROME) return process.env.CHROME;
  const candidates = [
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  ];
  for (const p of candidates) {
    try { if (fs.existsSync(p)) return p; } catch { /* noop */ }
  }
  return undefined;
}

const browser = await chromium.launch({ headless: true, executablePath: resolveChrome() });
const page = await browser.newPage();
const swLogs = [];
page.on('console', (m) => { if (m.text().toLowerCase().includes('serviceworker')) swLogs.push(m.text()); });

await page.goto(URL, { waitUntil: 'networkidle' });
await page.waitForTimeout(2000);

const state1 = await page.evaluate(async () => {
  if (!('serviceWorker' in navigator)) return { supported: false };
  const reg = await navigator.serviceWorker.getRegistration();
  return {
    supported: true,
    registered: !!reg,
    scope: reg?.scope || null,
    state: reg?.active?.state || null,
    controlled: !!navigator.serviceWorker.controller,
  };
});
console.log('after first load:', JSON.stringify(state1));

// Reload — the page should now be controlled by the SW.
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(1500);
const state2 = await page.evaluate(async () => {
  const reg = await navigator.serviceWorker.getRegistration();
  return {
    registered: !!reg,
    state: reg?.active?.state || null,
    controlled: !!navigator.serviceWorker.controller,
  };
});
console.log('after reload:', JSON.stringify(state2));
console.log('sw console lines:', swLogs.length ? swLogs.join(' | ') : '(none)');
await browser.close();
