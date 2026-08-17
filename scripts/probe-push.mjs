// E2E probe: Agent Push API against the live dev server (Node transport).
//   create room → push text via HTTP → arrives in the browser
//   → push a binary file → reassembles byte-identical on the device
//   → wrong secret / missing room are rejected cleanly
import { chromium } from 'playwright';
import { URL, resolveChrome, sleep } from './lib.mjs';
import crypto from 'node:crypto';

const BASE = URL;
let pass = 0, fail = 0;
const check = (name, cond, extra = '') => {
  if (cond) { pass++; console.log(`  ok  ${name}${extra ? ' — ' + extra : ''}`); }
  else { fail++; console.log(`FAIL  ${name}${extra ? ' — ' + extra : ''}`); }
};

const browser = await chromium.launch(resolveChrome() ? { headless: true, executablePath: resolveChrome() } : { headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
page.on('pageerror', (e) => console.log('PAGE ERROR:', e.message));
page.on('console', (m) => { if (m.type() === 'error') console.log('CONSOLE ERROR:', m.text().slice(0, 300)); });

try {
  // --- create a room as the creator --------------------------------------
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: 'Send text' }).first().click();
  await page.getByText('LIVE CODE').waitFor({ timeout: 15000 });

  const stored = await page.evaluate(() => {
    const raw = localStorage.getItem('sharetext.session.v1');
    return raw ? JSON.parse(raw) : null;
  });
  check('room stored with credentials', !!stored?.roomId && !!stored?.secret, stored?.roomId?.slice(0, 8));

  // --- push text ---------------------------------------------------------
  const textRes = await fetch(`${BASE}/api/push`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${stored.secret}` },
    body: JSON.stringify({ roomId: stored.roomId, text: 'Hello from an AI agent 🚀' }),
  });
  const textJson = await textRes.json().catch(() => ({}));
  check('text push → 200', textRes.status === 200 && textJson.ok === true, JSON.stringify(textJson));

  await page.waitForFunction(() => {
    const msgs = window.__sharetextDebug?.getMessages?.() ?? [];
    return msgs.some(m => m.source === 'push' && m.text.includes('Hello from an AI agent'));
  }, { timeout: 10000 }).then(
    () => check('pushed text visible in the room (push source)', true),
    () => check('pushed text visible in the room (push source)', false)
  );

  // The push inbox card on the connect screen should also list it.
  const inbox = page.getByText('From your push link').first();
  check('push inbox card on connect screen', await inbox.isVisible().catch(() => false));

  // --- push a binary file (multi-chunk) ----------------------------------
  const payload = Buffer.alloc(100 * 1024);
  for (let i = 0; i < payload.length; i++) payload[i] = (i * 31 + 7) & 0xff;
  payload.write('PUSHFILE-HEADER', 0, 'utf8');

  const fileRes = await fetch(`${BASE}/api/push`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${stored.secret}`,
    },
    body: JSON.stringify({
      roomId: stored.roomId,
      name: 'probe.bin',
      mimeType: 'application/octet-stream',
      dataBase64: payload.toString('base64'),
    }),
  });
  check('file push → 200', fileRes.status === 200);

  // NOTE: waitForFunction returns a JSHandle for object results, so the
  // predicate returns a boolean; the byte-for-byte hash is verified in a
  // separate evaluate afterward.
  const arrived = await page.waitForFunction(() => {
    const msgs = window.__sharetextDebug?.getMessages?.() ?? [];
    return msgs.some(m => m.source === 'push' && m.attachment?.name === 'probe.bin' && m.attachment?.status === 'complete');
  }, { timeout: 15000 }).then(() => true, () => false);
  check('pushed file arrives on the device', arrived);

  if (arrived) {
    const want = crypto.createHash('sha256').update(payload).digest('hex');
    const got = await page.evaluate(async () => {
      const msgs = window.__sharetextDebug?.getMessages?.() ?? [];
      const a = msgs.find(m => m.source === 'push' && m.attachment?.name === 'probe.bin')?.attachment;
      const res = await fetch(a.url);
      const buf = await res.arrayBuffer();
      const hash = await crypto.subtle.digest('SHA-256', buf);
      return [...new Uint8Array(hash)].map(b => b.toString(16).padStart(2, '0')).join('');
    });
    check('pushed file reassembles byte-identical (SHA-256)', got === want, `${got.slice(0, 12)}…`);
  } else {
    check('pushed file reassembles byte-identical (SHA-256)', false, 'no attachment');
  }

  // --- rejection paths -----------------------------------------------------
  const badSecret = await fetch(`${BASE}/api/push`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: 'Bearer WRONGSECRET' },
    body: JSON.stringify({ roomId: stored.roomId, text: 'nope' }),
  });
  check('wrong secret → 401', badSecret.status === 401);

  const badRoom = await fetch(`${BASE}/api/push`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${stored.secret}` },
    body: JSON.stringify({ roomId: '00000000-0000-0000-0000-000000000000', text: 'nope' }),
  });
  check('missing room → 404', badRoom.status === 404);

  const badBody = await fetch(`${BASE}/api/push`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${stored.secret}` },
    body: JSON.stringify({ roomId: stored.roomId }),
  });
  check('empty body → 400', badBody.status === 400);

  // --- binary body variant (curl --data-binary) ---------------------------
  const binFile = Buffer.from('curl-binary-variant-body');
  const binRes = await fetch(`${BASE}/api/push?roomId=${stored.roomId}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/octet-stream',
      authorization: `Bearer ${stored.secret}`,
      'x-file-name': 'from-curl.txt',
      'x-file-mime': 'text/plain',
    },
    body: binFile,
  });
  check('binary body variant → 200', binRes.status === 200);
  const binOk = await page.waitForFunction(() => {
    const msgs = window.__sharetextDebug?.getMessages?.() ?? [];
    return msgs.some(m => m.source === 'push' && m.attachment?.name === 'from-curl.txt' && m.attachment?.status === 'complete');
  }, { timeout: 10000 }).then(() => true, () => false);
  check('binary-variant file arrives on the device', binOk);

  await sleep(500);
} finally {
  await browser.close();
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
