// Network chaos tests against the Cloudflare transport (frontend :3311 → worker
// :8787). Simulating a client "outage" with CDP offline is a no-op for
// established WebSockets in this environment, so the real transport-drop test
// is a full worker restart — the DO's persisted state must let both devices
// re-seat themselves and keep the room alive (the "server restart" scenario).
// Scenarios:
//   1. Worker restart mid-session → clients auto-recover, message flows after
//   2. Cancel a large transfer mid-flight → both sides show Cancelled, completed
//      transfers survive, and the channel keeps working
//   3. Peer refresh → rejoin restores room + history
// Usage: node scripts/chaos-test.mjs
import { spawn, execSync } from 'child_process';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { launchBrowser, pairDevices, URL, sleep } from './lib.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.join(__dirname, '..');
const WORKER_PORT = 8787;
const SHOTS = path.join(REPO, '.audit-shots');
fs.mkdirSync(SHOTS, { recursive: true });

// ---- worker process control (start/stop the local wrangler dev) ----
function findWorkerPid() {
  try {
    const out = execSync('netstat -ano', { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });
    for (const line of out.split(/\r?\n/)) {
      if (line.includes(':' + WORKER_PORT) && /LISTENING/i.test(line)) {
        const m = line.match(/(\d+)\s*$/);
        if (m) return m[1];
      }
    }
  } catch { /* no worker */ }
  return null;
}
function stopWorker() {
  const pid = findWorkerPid();
  if (pid) {
    execSync(`taskkill /F /PID ${pid} /T`, { stdio: 'ignore' });
    console.log('worker stopped (pid ' + pid + ')');
  }
  // wrangler's workerd child can survive the parent kill — sweep any leftovers.
  try { execSync('taskkill /F /IM workerd.exe', { stdio: 'ignore' }); } catch { /* none */ }
  // Wait for the port to free up.
  for (let i = 0; i < 30; i++) {
    if (!findWorkerPid()) return;
    sleepSync(500);
  }
}
function startWorker() {
  const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';
  const child = spawn(npx, ['wrangler', 'dev', '--config', 'worker/wrangler.toml', '--port', String(WORKER_PORT)], {
    cwd: REPO, detached: true, stdio: 'ignore', shell: true,
  });
  child.unref();
  console.log('worker restarting…');
}
function sleepSync(ms) { const t = Date.now(); while (Date.now() - t < ms) { /* busy wait */ } }
async function waitForWorkerHealth(timeoutMs = 90000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`http://localhost:${WORKER_PORT}/health`);
      if (res.ok) { console.log('worker healthy'); return true; }
    } catch { /* not up yet */ }
    await sleep(1500);
  }
  throw new Error('worker did not come back within ' + timeoutMs + 'ms');
}

// ---- helpers ----
const browser = await launchBrowser();
const ctxA = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const ctxB = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
const A = await ctxA.newPage();
const B = await ctxB.newPage();
const errors = [];
A.on('pageerror', e => errors.push(`[A] ${e.message}`));
B.on('pageerror', e => errors.push(`[B] ${e.message}`));

let passed = 0;
function assert(cond, label) {
  if (!cond) throw new Error('ASSERT FAILED: ' + label);
  passed++;
  console.log('PASS: ' + label);
}
async function send(page, text) {
  await page.locator('textarea').first().fill(text);
  await page.getByRole('button', { name: 'Send' }).click();
}
const bigFile = path.join(SHOTS, '..', '.audit-assets', 'chaos-big.bin');
fs.mkdirSync(path.dirname(bigFile), { recursive: true });
fs.writeFileSync(bigFile, crypto.randomBytes(200 * 1024 * 1024));

try {
  await A.goto(URL, { waitUntil: 'domcontentloaded' });
  await B.goto(URL, { waitUntil: 'domcontentloaded' });
  await pairDevices(A, B);
  console.log('--- paired ---');

  await send(A, 'baseline');
  await sleep(2000);
  assert((await B.getByText('baseline').count()) >= 1, 'baseline delivered to B');

  // ---- Scenario 1: worker restart mid-session ----
  console.log('--- scenario 1: worker restart mid-session ---');
  // On localhost the direct WebRTC channel survives a signaling-server death
  // (correctly — the user never sees a drop), so the meaningful assertion is:
  // after the restart, a device that re-joins (which forces fresh signaling)
  // can re-establish against the *restarted* worker. That proves the DO's
  // persisted state kept the room alive — the "server restart" resilience.
  stopWorker();
  await sleep(1500);
  startWorker();
  await waitForWorkerHealth();

  // A reloads → its WebSocket is gone → it must resume_room against the
  // restarted worker. If the DO state survived, the room is still there.
  await A.reload({ waitUntil: 'domcontentloaded' });
  await A.getByText('Close Room').first().waitFor({ timeout: 25000 });
  await sleep(5000); // re-offer handshake

  await send(B, 'after-restart');
  await sleep(5000);
  assert((await A.getByText('after-restart').count()) >= 1, 'post-restart message B→A delivered (DO state survived)');
  assert((await A.getByText('baseline').count()) >= 1, 'pre-restart message preserved on A');

  // ---- Scenario 2: cancel a 40MB transfer mid-flight + state independence ----
  console.log('--- scenario 2: cancel mid-transfer ---');
  await send(A, 'keep-me');
  await sleep(1500);
  assert((await B.getByText('keep-me').count()) >= 1, 'keep-me delivered');

  await B.getByRole('button', { name: 'Add attachment' }).click();
  await B.getByText('File', { exact: true }).click();
  await B.locator('input[type="file"]:not([accept])').setInputFiles(bigFile);
  await sleep(400);
  await B.getByRole('button', { name: 'Send' }).click();
  await sleep(300); // mid-flight (200MB takes seconds to encrypt+send)
  await B.getByRole('button', { name: 'Cancel' }).first().click({ timeout: 15000 });

  await sleep(4000); // control packet + UI settle
  assert((await B.getByText('Cancelled').count()) >= 1, 'sender shows Cancelled');
  assert((await A.getByText('Cancelled').count()) >= 1, 'receiver shows Cancelled');
  assert((await B.getByText('keep-me').count()) >= 1, 'completed transfer survived the cancel on B');
  assert((await A.getByText('keep-me').count()) >= 1, 'completed transfer survived the cancel on A');

  // Channel still works after the cancellation.
  await send(B, 'final');
  await sleep(3000);
  assert((await A.getByText('final').count()) >= 1, 'message flows after cancellation');

  // ---- Scenario 3: peer refresh ----
  console.log('--- scenario 3: peer refresh ---');
  await A.reload({ waitUntil: 'domcontentloaded' });
  await A.getByText('Close Room').first().waitFor({ timeout: 20000 });
  await sleep(5000);

  await send(B, 'after-refresh');
  await sleep(4000);
  assert((await A.getByText('after-refresh').count()) >= 1, 'message delivered after A refreshed');
  assert((await A.getByText('keep-me').count()) >= 1, 'history restored on A after refresh');

  console.log(`\nALL ${passed} CHAOS ASSERTIONS PASSED`);
} catch (e) {
  console.error('\nFAILED:', e.message);
  await A.screenshot({ path: path.join(SHOTS, 'chaos-A-fail.png') }).catch(() => {});
  await B.screenshot({ path: path.join(SHOTS, 'chaos-B-fail.png') }).catch(() => {});
  process.exitCode = 1;
} finally {
  if (errors.length) console.log('\nPAGE ERRORS:\n' + errors.join('\n'));
  await browser.close();
}
