// Focused CF-transport join probe: create on A, read the live code, join on B,
// then dump B's rendered screen + console + network errors.
import { chromium } from 'playwright';
import fs from 'fs';

const URL = process.env.URL || 'http://localhost:3311';

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
const A = await browser.newPage();
const B = await browser.newPage();
const logs = [];
A.on('pageerror', e => logs.push(`[A:ERROR] ${e.message}`));
B.on('pageerror', e => logs.push(`[B:ERROR] ${e.message}`));
B.on('console', m => { if (m.type() === 'error') logs.push(`[B:console] ${m.text()}`); });
B.on('requestfailed', r => logs.push(`[B:reqfail] ${r.url()} ${r.failure()?.errorText}`));

await A.goto(URL, { waitUntil: 'networkidle' });
await A.getByRole('button', { name: 'Send' }).first().click();
await A.getByText('LIVE CODE').waitFor({ timeout: 10000 });
const code = await A.evaluate(() => {
  const spans = [...document.querySelectorAll('span')].filter(s => /^\d$/.test(s.textContent || ''));
  return spans.slice(-6).map(s => s.textContent).join('');
});
console.log('code from A screen:', code);
// Also read the client-computed code + createdAt from A's localStorage
const stored = await A.evaluate(() => localStorage.getItem('sharetext.session.v1'));
console.log('A stored session:', stored);

await B.goto(URL, { waitUntil: 'networkidle' });
await B.getByRole('button', { name: 'Receive' }).first().click();
await B.locator('input[inputmode="numeric"]').fill(code);
await B.waitForTimeout(6000);
const bBody = await B.locator('body').innerText();
console.log('--- B body after join ---');
console.log(bBody.slice(0, 600).replace(/\n/g, ' | '));
console.log('--- console/errors ---');
console.log(logs.length ? logs.join('\n') : '(none)');

await browser.close();
