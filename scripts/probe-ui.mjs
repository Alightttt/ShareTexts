// Checks the landing CTAs (Send text / Receive text), the back arrow +
// positioning line on RoomHub, and the 40s timer UI.
import { chromium } from 'playwright';
import fs from 'fs';

const URL = process.env.URL || 'http://localhost:3000';
function resolveChrome() {
  if (process.env.CHROME) return process.env.CHROME;
  for (const p of [
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  ]) if (fs.existsSync(p)) return p;
  return undefined;
}

const browser = await chromium.launch({ headless: true, executablePath: resolveChrome() });
const page = await browser.newPage();

// 1. Landing buttons
await page.goto(URL, { waitUntil: 'networkidle' });
const landing = await page.evaluate(() => {
  const btns = [...document.querySelectorAll('button')].map(b => b.textContent.trim().replace(/\s+/g, ' '));
  return {
    hasSendText: btns.some(t => t.includes('Send text')),
    hasReceiveText: btns.some(t => t.includes('Receive text')),
    hasOldCreate: btns.some(t => t.includes('Create Session')),
    hasOldJoin: btns.some(t => t.includes('Join Session')),
    heroCopy: document.querySelector('section p')?.textContent?.slice(0, 120) ?? '',
    heroH1: document.querySelector('h1')?.textContent?.slice(0, 60) ?? '',
  };
});
console.log('LANDING:', JSON.stringify(landing, null, 1));

// 2. Create session → RoomHub
await page.getByRole('button', { name: 'Send text' }).first().click();
await page.getByText('LIVE CODE').waitFor({ timeout: 10000 });
const hub = await page.evaluate(() => {
  const body = document.body.innerText;
  const timer = [...document.querySelectorAll('span')].find(s => /^\d{1,2}$/.test(s.textContent || ''));
  return {
    timerShown: timer ? timer.textContent : null,
    refreshCopy: body.includes('Code refreshes in') || body.includes('New code in'),
    backArrow: !!document.querySelector('button[aria-label="Back to home"]'),
    positioningLine: body.includes('Any two devices with a browser'),
    hasCopyCode: body.includes('Copy Code'),
  };
});
console.log('ROOMHUB:', JSON.stringify(hub, null, 1));

// 3. Back arrow → landing
await page.getByRole('button', { name: 'Back to home' }).click();
await page.waitForTimeout(1200);
const afterBack = await page.evaluate(() => ({
  onLanding: document.body.innerText.includes('Move anything between your devices'),
  sessionCleared: !localStorage.getItem('sharetext.session.v1'),
}));
console.log('AFTER BACK:', JSON.stringify(afterBack, null, 1));

await browser.close();
