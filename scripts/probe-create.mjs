// Diagnostic probe: click "Create Session" and report exactly what the app shows.
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
const logs = [];
page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));

await page.goto(URL, { waitUntil: 'networkidle' });
await page.getByRole('button', { name: 'Create Session' }).first().click();
await page.waitForTimeout(15000);

const body = await page.locator('body').innerText();
console.log('--- PAGE BODY ---');
console.log(body.slice(0, 800).replace(/\n+/g, ' | '));
console.log('--- CONSOLE ---');
console.log(logs.slice(0, 25).join('\n'));
await browser.close();
