import { chromium } from 'playwright';
import fs from 'fs';

export const URL = process.env.URL || 'http://localhost:3311';

const KNOWN_PATHS = [
  'C:/Users/DELL-PC/AppData/Local/ms-playwright/chromium-1208/chrome-win64/chrome.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
];

export function resolveChrome() {
  if (process.env.CHROME) return process.env.CHROME;
  for (const p of KNOWN_PATHS) {
    try {
      if (fs.existsSync(p)) return p;
    } catch { /* ignore */ }
  }
  return undefined; // let playwright find its own bundled browser
}

export async function launchBrowser() {
  const executablePath = resolveChrome();
  return chromium.launch(executablePath ? { headless: true, executablePath } : { headless: true });
}

export const sleep = (ms) => new Promise(r => setTimeout(r, ms));

export async function readLiveCode(page) {
  const codeDigits = await page.locator('span').filter({ hasText: /^\d$/ }).allTextContents();
  return codeDigits.slice(-6).join('');
}

export async function waitForChat(page, label) {
  await page.getByText(/Connection secure|Paste or type|Your private clipboard|Close Room/).first().waitFor({ timeout: 20000 })
    .catch(() => console.log(`WARN: ${label} did not reach chat view in 20s`));
}

export async function pairDevices(A, B) {
  await A.getByRole('button', { name: 'Create Session' }).first().click();
  await A.getByText('LIVE CODE').waitFor({ timeout: 10000 });
  const code = await readLiveCode(A);
  await B.getByRole('button', { name: 'Join Session' }).first().click();
  await B.locator('input[inputmode="numeric"]').fill(code);
  await waitForChat(B, 'B');
  await waitForChat(A, 'A');
  return code;
}
