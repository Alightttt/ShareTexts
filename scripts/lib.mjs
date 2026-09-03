import { chromium } from 'playwright';
import fs from 'fs';

export const URL = process.env.URL || 'http://localhost:3000';

const KNOWN_PATHS = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
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
  // Connected chat mounts the composer (SingleScreenApp renders ChatView once
  // the pair is connected); the composer textarea is the reliable marker.
  await page.getByTestId('composer').first().waitFor({ timeout: 20000 })
    .catch(() => console.log(`WARN: ${label} did not reach chat view in 20s`));
}

export async function pairDevices(A, B) {
  await A.getByRole('button', { name: 'Send' }).first().click();
  await A.getByRole('group', { name: 'Pairing code' }).waitFor({ timeout: 10000 });
  const code = await readLiveCode(A);
  await B.getByRole('button', { name: 'Receive' }).first().click();
  await B.locator('input[inputmode="numeric"]').fill(code);
  await waitForChat(B, 'B');
  await waitForChat(A, 'A');
  return code;
}
