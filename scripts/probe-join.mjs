// Diagnostic probe: create in A, join with code in B, report both states.
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
const A = await browser.newPage();
const B = await browser.newPage();
const logs = [];
B.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warn' || m.text().includes('[ShareText]')) logs.push(`[B:${m.type()}] ${m.text()}`); });
B.on('pageerror', (e) => logs.push(`[B:pageerror] ${e.message}`));

// A: create
await A.goto(URL, { waitUntil: 'networkidle' });
await A.getByRole('button', { name: 'Start a transfer' }).first().click();
await A.getByText('LIVE CODE').waitFor({ timeout: 15000 });
const codeDigits = await A.locator('span').filter({ hasText: /^\d$/ }).allTextContents();
const code = codeDigits.slice(-6).join('');
console.log('Code:', code);

// B: join
await B.goto(URL, { waitUntil: 'networkidle' });
await B.getByRole('button', { name: 'Already have a code?' }).first().click();
await B.locator('input[inputmode="numeric"]').fill(code);
await B.waitForTimeout(12000);

console.log('--- B BODY ---');
console.log((await B.locator('body').innerText()).slice(0, 600).replace(/\n+/g, ' | '));
console.log('--- B CONSOLE ---');
console.log(logs.join('\n'));
await browser.close();
