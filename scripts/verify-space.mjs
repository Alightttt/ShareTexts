// F14 Temporary Space — dev-backend contract suite.
//
// Spawns its own `tsx server.ts` on port 3311 with SPACE_TEST_CLOCK=1,
// then drives the same REST contract the Cloudflare Worker's Space DO
// serves (worker/src/space.ts): create/join auth, per-device membership,
// text items, direct + multipart uploads, per-request download auth,
// delete/close permissions, expiry semantics.
//
// Run: node scripts/verify-space.mjs
import { spawn, execSync } from 'node:child_process';
import crypto from 'node:crypto';

const PORT = process.env.SPACE_TEST_PORT || 3311;
const BASE = `http://localhost:${PORT}`;

let passed = 0;
let failed = 0;
function check(name, cond, extra = '') {
  if (cond) { passed++; console.log(`  ok  ${name}${extra ? ' — ' + extra : ''}`); }
  else { failed++; console.log(`FAIL  ${name}${extra ? ' — ' + extra : ''}`); }
}
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const uuid = () => crypto.randomUUID();

async function j(method, path, { token, deviceKey = 'suite', name, body, raw, atMs } = {}) {
  const headers = { 'x-device-key': deviceKey };
  if (atMs) headers['x-space-test-now'] = String(atMs);
  if (token) headers.authorization = `Bearer ${token}`;
  if (name) headers['x-device-name'] = name;
  let payload;
  if (raw) { payload = raw; headers['content-type'] = 'application/octet-stream'; }
  else if (body !== undefined) { payload = JSON.stringify(body); headers['content-type'] = 'application/json'; }
  let res;
  // One retry on transient connection resets (keep-alive races under load).
  for (let attempt = 0; attempt < 2; attempt++) {
    try { res = await fetch(BASE + path, { method, headers, body: payload }); break; }
    catch (e) {
      if (attempt === 1 || !/ECONNRESET|EPIPE|socket/i.test(String(e?.cause?.code || e?.cause || e))) throw e;
      await sleep(400);
    }
  }
  let data = null;
  try { data = await res.json(); } catch { /* binary */ }
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
child.stderr.on('data', (d) => { if (String(d).includes('Error')) console.error(String(d).slice(0, 300)); });

let up = false;
for (let i = 0; i < 60 && !up; i++) {
  await sleep(500);
  try { const r = await fetch(BASE + '/health'); up = r.ok; } catch { /* not yet */ }
}
if (!up) { console.error('server did not come up'); child.kill(); process.exit(1); }

try {
  // ── create / join / membership ────────────────────────────────────────
  const sid = uuid();
  const bad = await j('POST', `/space/${sid}/create`, { body: { durationMs: 12345 } });
  check('create rejects a non-menu duration', bad.status === 400);

  const noBody = await j('POST', `/space/${sid}/create`, { raw: 'x', body: undefined });
  check('create without a JSON body fails honestly', noBody.status === 400 || noBody.status === 500);

  const cr = await j('POST', `/space/${sid}/create`, { name: 'Suite <img>', deviceKey: 'creatorA', name2: null, body: { name: 'Suite <img>', durationMs: 6 * 3600_000 } });
  check('create returns token + manageKey + reminderAt', cr.status === 200 && !!cr.data.token && !!cr.data.manageKey && !!cr.data.reminderAt, `closes ${new Date(cr.data.expiresAt).toISOString()}`);
  check('space name is sanitized', cr.data.name === 'Suite img', cr.data.name);
  const T = cr.data.token, M = cr.data.manageKey;

  const again = await j('POST', `/space/${sid}/create`, { body: { durationMs: 6 * 3600_000 } });
  check('re-create is a 409', again.status === 409);

  const badJoin = await j('POST', `/space/${sid}/join`, { token: 'not-the-token-' + 'x'.repeat(20) });
  check('wrong-token join is 401 (no oracle detail)', badJoin.status === 401);

  const creator = await j('POST', `/space/${sid}/join`, { token: M, deviceKey: 'creatorA' });
  check('creator joins under manage key, isCreator', creator.status === 200 && creator.data.isCreator === true);
  check('creator counts once', creator.data.memberCount === 1, String(creator.data.memberCount));

  const d1 = await j('POST', `/space/${sid}/join`, { token: T, deviceKey: 'dev1', name: 'Pixel 8' });
  const d1again = await j('POST', `/space/${sid}/join`, { token: T, deviceKey: 'dev1', name: 'Pixel 8' });
  check('rejoin keeps the same participant id (no dupes)', d1.data.participantId === d1again.data.participantId);
  check('two devices → memberCount 2', d1.data.memberCount === 2, String(d1.data.memberCount));

  const d2 = await j('POST', `/space/${sid}/join`, { token: T, deviceKey: 'dev2', name: 'iPad' });
  check('third device has its own pid', d2.data.participantId !== d1.data.participantId && d2.data.memberCount === 3);

  const info = await j('GET', `/space/${sid}/info`, { token: T, deviceKey: 'dev1' });
  check('info requires auth and reports count', info.status === 200 && info.data.memberCount === 3);
  const infoNoAuth = await j('GET', `/space/${sid}/info`);
  check('info without credentials is 401', infoNoAuth.status === 401);

  // ── text items ────────────────────────────────────────────────────────
  const t1 = await j('POST', `/space/${sid}/items/text`, { token: T, deviceKey: 'dev1', body: { text: 'from pixel 8' } });
  check('text item is READY with uploader name', t1.status === 200 && t1.data.item.state === 'READY' && t1.data.item.addedByName === 'Pixel 8');
  const t2 = await j('POST', `/space/${sid}/items/text`, { token: T, deviceKey: 'dev2', body: { text: 'https://example.com/x', kind: 'link' } });
  check('link kind recognized', t2.data.item.kind === 'link');
  const tEmpty = await j('POST', `/space/${sid}/items/text`, { token: T, deviceKey: 'dev1', body: { text: '   ' } });
  check('blank text rejected', tEmpty.status === 400);
  const tBig = await j('POST', `/space/${sid}/items/text`, { token: T, deviceKey: 'dev1', body: { text: 'x'.repeat(520 * 1024) } });
  check('oversized text rejected (413)', tBig.status === 413);
  const list = await j('GET', `/space/${sid}/items`, { token: T, deviceKey: 'dev1' });
  check('list returns both READY items newest-first', list.data.items.length === 2 && list.data.items[0].text === 'https://example.com/x');

  // ── direct upload + integrity + download security ────────────────────
  const payload = crypto.randomBytes(4096);
  const sha = crypto.createHash('sha256').update(payload).digest('hex');
  const finit = await j('POST', `/space/${sid}/items/file/init`, { token: T, deviceKey: 'dev1', body: { name: 'docs/blob.bin', mime: 'application/octet-stream', size: payload.length, sha256: sha } });
  check('small file takes the direct path', finit.data.mode === 'direct');
  check('filename is sanitized (basename only)', finit.data.item.name === 'blob.bin', finit.data.item.name);
  const okUp = await j('PUT', `/space/${sid}/items/file/direct?itemId=${finit.data.itemId}`, { token: T, deviceKey: 'dev1', raw: payload });
  check('direct upload publishes READY', okUp.status === 200 && okUp.data.item.state === 'READY');

  const corrupt = crypto.randomBytes(4096);
  const finit2 = await j('POST', `/space/${sid}/items/file/init`, { token: T, deviceKey: 'dev1', body: { name: 'bad.bin', mime: 'application/octet-stream', size: 4096, sha256: crypto.createHash('sha256').update(corrupt).digest('hex') } });
  await j('PUT', `/space/${sid}/items/file/direct?itemId=${finit2.data.itemId}`, { token: T, deviceKey: 'dev1', raw: crypto.randomBytes(4096) });
  const afterBad = await j('GET', `/space/${sid}/items`, { token: T, deviceKey: 'dev1' });
  check('sha mismatch never publishes the item', !afterBad.data.items.some(i => i.name === 'bad.bin'));

  const dl = await fetch(`${BASE}/space/${sid}/items/${finit.data.itemId}/download`, { headers: { authorization: `Bearer ${T}`, 'x-device-key': 'dev2' } });
  const dlBytes = Buffer.from(await dl.arrayBuffer());
  check('download round-trips byte-exact', dl.status === 200 && dlBytes.equals(payload));
  check('download is attachment + nosniff', (dl.headers.get('content-disposition') || '').startsWith('attachment') && dl.headers.get('x-content-type-options') === 'nosniff');
  const dlNoAuth = await fetch(`${BASE}/space/${sid}/items/${finit.data.itemId}/download`);
  check('download without auth is 401', dlNoAuth.status === 401);

  // ── multipart (≥ DIRECT_MAX crosses the path) ─────────────────────────
  const bigSize = 95 * 1024 * 1024;
  const bigSha = crypto.createHash('sha256');
  const partSize = 8 * 1024 * 1024;
  const parts = [];
  for (let off = 0; off < bigSize; off += partSize) {
    const n = Math.min(partSize, bigSize - off);
    parts.push(crypto.randomBytes(n));
    bigSha.update(parts[parts.length - 1]);
  }
  const bigDigest = bigSha.digest('hex');
  const binit = await j('POST', `/space/${sid}/items/file/init`, { token: T, deviceKey: 'dev1', body: { name: 'big.bin', mime: 'application/octet-stream', size: bigSize, sha256: bigDigest } });
  check('large file takes the multipart path', binit.data.mode === 'multipart' && binit.data.partCount === Math.ceil(bigSize / partSize), `parts=${binit.data.partCount}`);

  // upload parts 2..N, SKIP part 1 → complete must 409; then resume.
  for (let n = 2; n <= parts.length; n++) {
    const r = await j('PUT', `/space/${sid}/items/file/part?itemId=${binit.data.itemId}&partNumber=${n}`, { token: T, deviceKey: 'dev1', raw: parts[n - 1] });
    if (r.status !== 200) { check(`part ${n} accepted`, false, JSON.stringify(r.data)); }
  }
  const st1 = await j('GET', `/space/${sid}/items/file/status?itemId=${binit.data.itemId}`, { token: T, deviceKey: 'dev1' });
  check('status reports exactly the arrived parts', st1.data.uploadedParts.length === parts.length - 1 && !st1.data.uploadedParts.includes(1));
  const early = await j('POST', `/space/${sid}/items/file/complete`, { token: T, deviceKey: 'dev1', body: { itemId: binit.data.itemId, parts: st1.data.uploadedParts.map(n => ({ partNumber: n })) } });
  check('premature complete is 409', early.status === 409);
  const stolen = await j('GET', `/space/${sid}/items/file/status?itemId=${binit.data.itemId}`, { token: T, deviceKey: 'dev2' });
  check('upload status is uploader-scoped', stolen.status === 401);
  const p1 = await j('PUT', `/space/${sid}/items/file/part?itemId=${binit.data.itemId}&partNumber=1`, { token: T, deviceKey: 'dev1', raw: parts[0] });
  check('missing part uploaded after resume', p1.status === 200);
  const done = await j('POST', `/space/${sid}/items/file/complete`, { token: T, deviceKey: 'dev1', body: { itemId: binit.data.itemId, parts: parts.map((_, i) => ({ partNumber: i + 1 })) } });
  check('multipart complete publishes READY', done.status === 200 && done.data.item.state === 'READY');
  const bigDl = await fetch(`${BASE}/space/${sid}/items/${binit.data.itemId}/download`, { headers: { authorization: `Bearer ${T}`, 'x-device-key': 'dev2' } });
  const bigBytes = Buffer.from(await bigDl.arrayBuffer());
  check('multipart round-trip byte-exact (95 MB)', bigBytes.length === bigSize && crypto.createHash('sha256').update(bigBytes).digest('hex') === bigDigest);

  // ── delete permissions ────────────────────────────────────────────────
  const delOther = await j('DELETE', `/space/${sid}/items/${t2.data.item.id}`, { token: T, deviceKey: 'dev1' });
  check('member cannot delete another member\'s item', delOther.status === 403);
  const delOwn = await j('DELETE', `/space/${sid}/items/${t2.data.item.id}`, { token: T, deviceKey: 'dev2' });
  check('member deletes their own item', delOwn.status === 200);
  const delCreator = await j('DELETE', `/space/${sid}/items/${t1.data.item.id}`, { token: M, deviceKey: 'creatorA' });
  check('creator (manage key) removes any item', delCreator.status === 200);

  // ── close + expiry semantics ──────────────────────────────────────────
  const memberClose = await j('POST', `/space/${sid}/close`, { token: T, deviceKey: 'dev1' });
  check('member cannot close the space', memberClose.status === 403);
  const closed = await j('POST', `/space/${sid}/close`, { token: M, deviceKey: 'creatorA' });
  check('creator closes early', closed.status === 200);
  const joinClosed = await j('POST', `/space/${sid}/join`, { token: T, deviceKey: 'dev9' });
  check('join after close is 410 Gone', joinClosed.status === 410 && joinClosed.data.closed === true);
  const dlClosed = await fetch(`${BASE}/space/${sid}/items/${finit.data.itemId}/download`, { headers: { authorization: `Bearer ${T}`, 'x-device-key': 'dev2' } });
  check('download after close is rejected', dlClosed.status === 401 || dlClosed.status === 410);

  // ── expiry via the test clock (x-space-test-now) ──────────────────────
  const sid2 = uuid();
  const cr2 = await j('POST', `/space/${sid2}/create`, { body: { durationMs: 6 * 3600_000 } });
  const future = cr2.data.expiresAt + 1000;
  const res = await fetch(`${BASE}/space/${sid2}/info`, { headers: { authorization: `Bearer ${cr2.data.token}`, 'x-device-key': 'clock', 'x-space-test-now': String(future) } });
  check('test clock pushes the space past expiry (410)', res.status === 410);
  const upAfter = await j('POST', `/space/${sid2}/items/text`, { token: cr2.data.token, deviceKey: 'clock', body: { text: 'too late' }, atMs: future });
  check('uploads are refused at the boundary', upAfter.status === 401 || upAfter.status === 410, String(upAfter.status));

  // ── reminder contract (observable in dev logs; here: schedule math) ──
  const rem6h = cr.data.reminderAt - cr.data.createdAt;
  check('6h space reminds 1h before', Math.round(rem6h / 3.6e6) === 5, `${rem6h / 3.6e6}h before close`);
} finally {
  // Windows: `npx` under shell:true wraps the real server in cmd.exe → node;
  // child.kill() would only take the wrapper, leaving the server orphaned
  // and still bound to PORT — every later run then collides (EADDRINUSE) or
  // reads a wedged zombie. Tree-kill the whole process group synchronously:
  // an async kill here races process.exit and never lands.
  if (process.platform === 'win32' && child.pid) {
    try { execSync(`taskkill /pid ${child.pid} /T /F`, { stdio: 'ignore' }); } catch { /* best effort */ }
  } else {
    child.kill();
  }
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
