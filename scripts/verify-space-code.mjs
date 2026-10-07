// F21 Temporary Space codes — dev-backend contract suite.
//
// Spawns its own `tsx server.ts` on port 3312 with SPACE_TEST_CLOCK=1 and
// drives the F21 code surface end to end, mirroring what the Cloudflare
// Worker serves in production (worker/src/registry.ts + space.ts):
//
//   availability check · custom code create · collision 409 · invalid 400 ·
//   generated-code create · join by code (messy input) · token handoff ·
//   item upload + download by the code-joined device · refresh/rejoin ·
//   no-oracle 404s (unknown ≡ invalid ≡ expired ≡ closed) · code retirement
//   on close · space-code rate limit (30/60s per IP, tested last).
//
// Run: node scripts/verify-space-code.mjs
import { spawn, execSync } from 'node:child_process';
import crypto from 'node:crypto';

const PORT = process.env.SPACE_TEST_PORT || 3312;
const BASE = `http://localhost:${PORT}`;
const NO_ORACLE_MSG = 'No space with that code is open right now.';

let passed = 0;
let failed = 0;
function check(name, cond, extra = '') {
  if (cond) { passed++; console.log(`  ok  ${name}${extra ? ' — ' + extra : ''}`); }
  else { failed++; console.log(`FAIL  ${name}${extra ? ' — ' + extra : ''}`); }
}
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const uuid = () => crypto.randomUUID();

const UUID8 = '^[ACDEFGHJKMNPQRTUVWXYZ234679]{8}$'; // normalized wire form — the client adds the dash

async function j(method, path, { token, deviceKey = 'suite', name, body, raw, atMs } = {}) {
  const headers = { 'x-device-key': deviceKey };
  if (atMs) headers['x-space-test-now'] = String(atMs);
  if (token) headers.authorization = `Bearer ${token}`;
  if (name) headers['x-device-name'] = name;
  let payload;
  if (raw) { payload = raw; headers['content-type'] = 'application/octet-stream'; }
  else if (body !== undefined) { payload = JSON.stringify(body); headers['content-type'] = 'application/json'; }
  const res = await fetch(BASE + path, { method, headers, body: payload });
  let data = null;
  try { data = await res.json(); } catch { /* no body */ }
  return { status: res.status, data, headers: res.headers };
}

// ── boot the dev server ─────────────────────────────────────────────────
console.log('booting dev server on :' + PORT + ' (SPACE_TEST_CLOCK=1)…');
const child = spawn('npx', ['tsx', 'server.ts'], {
  cwd: new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'),
  env: { ...process.env, PORT: String(PORT), SPACE_TEST_CLOCK: '1', ALLOWED_ORIGINS: `http://localhost:${PORT}` },
  stdio: ['ignore', 'pipe', 'pipe'],
  shell: true,
});
child.stdout.on('data', () => {});
child.stderr.on('data', (d) => { const s = String(d); if (s.includes('Error')) console.error(s.slice(0, 300)); });

let up = false;
for (let i = 0; i < 60 && !up; i++) {
  await sleep(500);
  try { const r = await fetch(BASE + '/health'); up = r.ok; } catch { /* not yet */ }
}
if (!up) { console.error('server did not come up'); child.kill(); process.exit(1); }

try {
  // ── availability check endpoint ───────────────────────────────────────
  const invalid = await j('GET', '/space-code/check?code=AB12-34XY'); // 1, B, X… invalid shapes normalize to invalid
  check('invalid shape → available:false + reason', invalid.status === 200 && invalid.data.available === false && invalid.data.reason === 'invalid', JSON.stringify(invalid.data));
  const tooShort = await j('GET', '/space-code/check?code=K7QT');
  check('short code is invalid too', tooShort.data.available === false && tooShort.data.reason === 'invalid');
  const free = await j('GET', '/space-code/check?code=K7QT-2M4X');
  check('fresh code is available', free.status === 200 && free.data.available === true && !free.data.suggestion, JSON.stringify(free.data));
  const lower = await j('GET', '/space-code/check?code=k7qt.2m4x');
  check('messy input normalizes before checking', lower.data.available === true, JSON.stringify(lower.data));

  // ── create with a custom code ─────────────────────────────────────────
  const sid = uuid();
  const cr = await j('POST', `/space/${sid}/create`, { body: { name: 'Trip shelf', durationMs: 6 * 3600_000, code: 'K7QT-2M4X' } });
  check('create with custom code returns it (normalized)', cr.status === 200 && cr.data.code === 'K7QT2M4X', JSON.stringify({ code: cr.data.code }));
  check('create still returns token + manageKey', !!cr.data.token && !!cr.data.manageKey);
  const T = cr.data.token, M = cr.data.manageKey;

  const nowTaken = await j('GET', '/space-code/check?code=K7QT2M4X');
  check('taken code → available:false + suggestion', nowTaken.data.available === false && new RegExp(UUID8).test(nowTaken.data.suggestion || ''), JSON.stringify(nowTaken.data));

  // ── collision + invalid create ────────────────────────────────────────
  const sid2 = uuid();
  const dup = await j('POST', `/space/${sid2}/create`, { body: { durationMs: 6 * 3600_000, code: 'k7qt-2m4x' } });
  check('duplicate code create is 409 codeTaken', dup.status === 409 && dup.data.codeTaken === true && /already in use/i.test(dup.data.error || ''), JSON.stringify(dup.data));
  const badCreate = await j('POST', `/space/${sid2}/create`, { body: { durationMs: 6 * 3600_000, code: 'HAS-A-0' } });
  check('create with invalid code is 400 (no silent swap)', badCreate.status === 400, JSON.stringify(badCreate.data));
  // sid2 was never created (both attempts failed) — prove the space really doesn't exist.
  const ghost = await j('POST', `/space/${sid2}/join`, { token: 'x'.repeat(43) });
  check('failed creates leave no orphan space', ghost.status === 401);

  const gen = await j('POST', `/space/${uuid()}/create`, { body: { durationMs: 6 * 3600_000 } });
  check('create without a code mints one', gen.status === 200 && new RegExp(UUID8).test(gen.data.code || ''), gen.data.code);

  // ── join by code (the 2nd-device flow) ────────────────────────────────
  const messy = await j('POST', '/space/join-code', { deviceKey: 'pixel9', name: 'Pixel 9', body: { code: '  k7qt_2m4x ' } });
  check('join by messy code resolves the space', messy.status === 200 && !!messy.data.participantId, JSON.stringify(messy.data).slice(0, 120));
  check('join-code hands back x-space-token', (messy.headers.get('x-space-token') || '').length >= 32);
  check('join envelope reports memberCount 2', messy.data.memberCount === 2, String(messy.data.memberCount));
  check('code-joined device is not the creator', messy.data.isCreator === false);

  const tok = messy.headers.get('x-space-token');
  const rejoin = await j('POST', `/space/${sid}/join`, { token: tok, deviceKey: 'pixel9', name: 'Pixel 9' });
  check('refresh/rejoin with the handed token keeps identity', rejoin.status === 200 && rejoin.data.participantId === messy.data.participantId);

  // ── content flows through the code-joined device ──────────────────────
  const text = await j('POST', `/space/${sid}/items/text`, { token: tok, deviceKey: 'pixel9', body: { text: 'dropped from the phone' } });
  check('code-joined device can add text', text.status === 200 && text.data.item.state === 'READY');

  const payload = crypto.randomBytes(2048);
  const sha = crypto.createHash('sha256').update(payload).digest('hex');
  const finit = await j('POST', `/space/${sid}/items/file/init`, { token: tok, deviceKey: 'pixel9', body: { name: 'photo.jpg', mime: 'image/jpeg', size: payload.length, sha256: sha } });
  const upl = await j('PUT', `/space/${sid}/items/file/direct?itemId=${finit.data.itemId}`, { token: tok, deviceKey: 'pixel9', raw: payload });
  check('code-joined device uploads a file', upl.status === 200 && upl.data.item.state === 'READY');

  const dl = await fetch(`${BASE}/space/${sid}/items/${finit.data.itemId}/download`, { headers: { authorization: `Bearer ${T}`, 'x-device-key': 'creatorA' } });
  const dlBytes = Buffer.from(await dl.arrayBuffer());
  check('creator downloads the joined device\u2019s file byte-exact', dl.status === 200 && dlBytes.equals(payload));
  const list = await j('GET', `/space/${sid}/items`, { token: tok, deviceKey: 'pixel9' });
  check('both items visible to the code-joined device', list.status === 200 && list.data.items.length === 2);

  // ── no-oracle 404s: unknown ≡ invalid ─────────────────────────────────
  const unknown = await j('POST', '/space/join-code', { body: { code: 'W4YT-9QKD' } });
  check('unknown code is 404', unknown.status === 404 && unknown.data.error === NO_ORACLE_MSG, JSON.stringify(unknown.data));
  const garbage = await j('POST', '/space/join-code', { body: { code: 'not a code!!' } });
  check('invalid code is the SAME 404 (no oracle)', garbage.status === 404 && JSON.stringify(garbage.data) === JSON.stringify(unknown.data));

  // ── expiry + close retire the code ────────────────────────────────────
  const expired = await j('POST', '/space/join-code', { body: { code: 'K7QT-2M4X' }, atMs: cr.data.expiresAt + 1000 });
  check('expired space → identical 404 under the test clock', expired.status === 404 && JSON.stringify(expired.data) === JSON.stringify(unknown.data));

  const close = await j('POST', `/space/${sid}/close`, { token: M, deviceKey: 'creatorA' });
  check('creator closes early', close.status === 200);
  const afterClose = await j('POST', '/space/join-code', { body: { code: 'K7QT-2M4X' } });
  check('closed space → identical 404, code dead', afterClose.status === 404 && JSON.stringify(afterClose.data) === JSON.stringify(unknown.data));
  const freedCheck = await j('GET', '/space-code/check?code=K7QT-2M4X');
  check('retired code is available again', freedCheck.data.available === true, JSON.stringify(freedCheck.data));

  // ── rate limit (LAST — the whole suite shares one IP bucket) ──────────
  let saw429 = false;
  for (let i = 0; i < 45; i++) {
    const r = await fetch(`${BASE}/space-code/check?code=W4YT-9QKD`);
    if (r.status === 429) { saw429 = true; break; }
    await sleep(10);
  }
  check('space-code scope throttles at 30/60s per IP', saw429);
} finally {
  // Windows: tree-kill the whole process group (see verify-space.mjs note).
  if (process.platform === 'win32' && child.pid) {
    try { execSync(`taskkill /pid ${child.pid} /T /F`, { stdio: 'ignore' }); } catch { /* best effort */ }
  } else {
    child.kill();
  }
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
