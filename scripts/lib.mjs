import { chromium } from 'playwright';
import fs from 'fs';

export const URL = process.env.URL || 'http://localhost:3000';

// ── Shared touch-target contract (single source for audit.mjs + walk) ──
// Every button and link needs a ≥40px hit box in both dimensions. Exempt:
// iOS-style switches (role="switch", ~28px tall by design) and sr-only
// elements (skip links — keyboard targets revealed on focus, not thumbs).
// Self-contained (DOM + params only) so it can be injected into evaluate.
export const TAP_TARGET_MIN = 40;
// NOTE: minTarget cannot default to TAP_TARGET_MIN here — the function is
// serialized into the page via page.evaluate, where module consts don't
// exist. Callers pass { minTarget: TAP_TARGET_MIN } (audit.mjs, walk).
export function tapTargetIssues({ minTarget } = {}) {
  const floor = minTarget ?? 40;
  const issues = [];
  for (const el of document.querySelectorAll('button, a')) {
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    if (el.getAttribute('role') === 'switch') continue;
    if (el.classList.contains('sr-only')) continue;
    if ((r.width < floor || r.height < floor) && !el.classList.contains('hidden')) {
      issues.push({
        name: (el.getAttribute('aria-label') || el.textContent.trim() || '(icon)').slice(0, 30),
        width: Math.round(r.width),
        height: Math.round(r.height),
      });
    }
  }
  return issues;
}

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
  // Scope to the pairing-code group and require a stable read: the digit
  // tiles animate code rotation (AnimatePresence popLayout briefly renders
  // the OLD digits while the new ones enter), and an unscoped read can pick
  // up countdown or mid-animation digits and produce a hybrid code. Two
  // consecutive identical reads after the animation settles are trustworthy.
  const group = page.getByRole('group', { name: 'Pairing code' });
  for (let attempt = 0; attempt < 10; attempt++) {
    const digits = await group.locator('span').filter({ hasText: /^\d$/ }).allTextContents();
    if (digits.length >= 6) {
      const code = digits.slice(-6).join('');
      if (/^\d{6}$/.test(code)) {
        await sleep(250);
        const again = (await group.locator('span').filter({ hasText: /^\d$/ }).allTextContents()).slice(-6).join('');
        if (again === code) return code;
      }
    }
    await sleep(300);
  }
  throw new Error('could not read a stable pairing code');
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
