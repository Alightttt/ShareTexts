// Emulator protocol test for the Cloudflare signaling worker.
//
// workerd can't run on every machine, so this bundles the REAL Room and
// Registry Durable Object classes with esbuild (aliasing `cloudflare:workers`
// to a small runtime shim) and drives them directly in Node:
//   create → lookup → code-join → peer_joined → signal → relay (text + binary)
//   → third-device rejection (ROOM_FULL) → wrong-code (INVALID_CODE) →
//   brute-force limit (RATE_LIMITED) → disconnect/resume → manual close, plus
//   the explicit state machine (WAITING→CONNECTED→TRANSFERRING→…→CLOSED),
//   live idle-timeout expiry, and Registry register/lookup.
// For a test against a real `wrangler dev` instance, see verify-worker-live.mjs.
import { build } from 'esbuild';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import * as OTPAuth from 'otpauth';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

let passed = 0;
let failed = 0;
function check(name, cond, extra = '') {
  if (cond) {
    passed++;
    console.log(`  ok  ${name}${extra ? ' — ' + extra : ''}`);
  } else {
    failed++;
    console.log(`FAIL  ${name}${extra ? ' — ' + extra : ''}`);
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const uuid = () => crypto.randomUUID();

// ---- build the real classes against the shim ------------------------------
const tmp = mkdtempSync(path.join(os.tmpdir(), 'sharetext-worker-'));
const shimPath = path.join(root, 'worker', 'test', 'cf-shim.ts');
const out = await build({
  entryPoints: {
    room: path.join(root, 'worker', 'src', 'room.ts'),
    registry: path.join(root, 'worker', 'src', 'registry.ts'),
    shim: shimPath,
  },
  bundle: true,
  format: 'esm',
  platform: 'neutral',
  alias: { 'cloudflare:workers': shimPath },
  outdir: tmp,
  write: false,
  logLevel: 'silent',
});
for (const f of out.outputFiles) writeFileSync(f.path, f.contents);

const cacheBust = '?t=' + Date.now();
const { FakeCtx } = await import(pathToFileURL(path.join(tmp, 'shim.js')).href + cacheBust);
const { Room, ROOM_TTL } = await import(pathToFileURL(path.join(tmp, 'room.js')).href + cacheBust);
const { Registry } = await import(pathToFileURL(path.join(tmp, 'registry.js')).href + cacheBust);

// Capture the pair created inside each DO fetch.
let lastPair = null;
const OrigPair = globalThis.WebSocketPair;
globalThis.WebSocketPair = class extends OrigPair {
  constructor() {
    super();
    lastPair = this;
  }
};

// Node's Response rejects status 101; emulate the Workers upgrade response.
const RealResponse = globalThis.Response;
globalThis.Response = class extends RealResponse {
  constructor(body, init = {}) {
    if (init.status === 101 && init.webSocket) {
      return { status: 101, webSocket: init.webSocket };
    }
    super(body, init);
  }
};

// ---- driver ---------------------------------------------------------------
let seq = 0;
async function connect(room, roomId) {
  const cid = uuid();
  await room.fetch(new Request(`http://x/ws?room=${roomId}&cid=${cid}`, { headers: { Upgrade: 'websocket' } }));
  const client = lastPair.client;
  const server = lastPair.server;
  const inbox = [];
  const binary = [];
  client.onmessage = (ev) => {
    if (typeof ev.data === 'string') inbox.push(JSON.parse(ev.data));
    else binary.push(ev.data);
  };
  const send = async (event, payload) => {
    const id = `r${seq++}`;
    await room.webSocketMessage(server, JSON.stringify({ v: 1, id, event, payload }));
    const ack = inbox.find((m) => m.type === 'ack' && m.id === id);
    return ack ? (ack.ok ? { success: true, ...ack } : { success: false, code: ack.code, error: ack.message }) : { success: false, error: 'no ack' };
  };
  const waitFor = async (pred, timeoutMs = 4000) => {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const hit = inbox.find(pred);
      if (hit) return hit.payload !== undefined ? hit.payload : hit;
      await sleep(25);
    }
    return null;
  };
  const close = () => {
    try { client.close(1000, 'test'); } catch { /* noop */ }
    try { room.webSocketClose(server); } catch { /* noop */ }
  };
  return { client, server, inbox, binary, send, waitFor, cid, close };
}

const codeFor = (secret, createdAt = 0) => new OTPAuth.TOTP({ issuer: 'ShareText', label: 'Session', algorithm: 'SHA1', digits: 6, period: 40, secret }).generate({ timestamp: Date.now() - createdAt });
const roomState = (ctx) => ctx.storage.map.get('room')?.state ?? null;
const assertState = (ctx, expected) => check(`state = ${expected}`, roomState(ctx) === expected, `got ${roomState(ctx)}`);

function makeEnv() {
  return { REGISTRY: { get: () => ({ fetch: async () => new Response(JSON.stringify({ ok: true })) }), idFromName: () => ({}) } };
}

async function runRoomProtocol() {
  const roomId = uuid();
  const ctx = new FakeCtx();
  const room = new Room(ctx, makeEnv());

  // create → WAITING
  const creator = await connect(room, roomId);
  const created = await creator.send('create_room');
  check('create_room ack', created.success === true && created.roomId === roomId, `room ${String(created.roomId).slice(0, 8)}`);
  const secret = created.secret;
  assertState(ctx, 'WAITING');

  // join → CONNECTED + peer_joined
  const code = codeFor(secret, created.createdAt);
  const joiner = await connect(room, roomId);
  const joined = await joiner.send('join_with_code', { code });
  check('join_with_code ack', joined.success === true && joined.roomId === roomId);
  const peerJoined = await creator.waitFor((m) => m.type === 'event' && m.event === 'peer_joined');
  check('creator receives peer_joined', !!peerJoined?.peerId, `peer ${String(peerJoined?.peerId).slice(0, 8)}`);
  const joinerCid = peerJoined.peerId;
  assertState(ctx, 'CONNECTED');

  // signal forwarding
  const sigPromise = creator.waitFor((m) => m.type === 'event' && m.event === 'signal');
  await joiner.send('signal', { to: creator.cid, signal: { type: 'offer', sdp: 'v=0 fake sdp' } });
  const sig = await sigPromise;
  check('signal forwarded to creator', sig?.from === joinerCid && sig?.signal?.type === 'offer');

  // relay text → TRANSFERRING
  const relayPromise = joiner.waitFor((m) => m.type === 'event' && m.event === 'relay_message');
  await creator.send('relay_message', { data: '{"enc":"ciphertext"}' });
  const relayed = await relayPromise;
  check('relay_message (text) forwarded', relayed?.data === '{"enc":"ciphertext"}');
  assertState(ctx, 'TRANSFERRING');

  // relay binary
  const binPromise = new Promise((resolve) => {
    const t0 = Date.now();
    const poll = () => {
      if (joiner.binary.length) return resolve(joiner.binary.shift());
      if (Date.now() - t0 > 4000) return resolve(null);
      setTimeout(poll, 25);
    };
    poll();
  });
  const chunk = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 99, 98]);
  await room.webSocketMessage(creator.server, chunk.buffer);
  const rb = await binPromise;
  check('relay_message (binary) forwarded intact', rb instanceof ArrayBuffer && new Uint8Array(rb)[21] === 98);

  // third device → ROOM_FULL
  const third = await connect(room, roomId);
  const thirdRes = await third.send('join_with_code', { code });
  check('third device rejected with ROOM_FULL', thirdRes.success === false && thirdRes.code === 'ROOM_FULL', thirdRes.error);
  third.close();

  // wrong code → INVALID_CODE; then brute-force → RATE_LIMITED
  const wrongCode = await connect(room, roomId);
  const bad = await wrongCode.send('join_with_code', { code: '000000' });
  check('wrong code → INVALID_CODE', bad.success === false && bad.code === 'INVALID_CODE', bad.error);
  let limited = null;
  for (let i = 0; i < 11; i++) {
    limited = await wrongCode.send('join_with_code', { code: '000000' });
  }
  check('brute-force limit → RATE_LIMITED', limited.success === false && limited.code === 'RATE_LIMITED', limited.error);
  wrongCode.close();

  // disconnect joiner → peer_disconnected; state → WAITING (1 peer)
  const discPromise = creator.waitFor((m) => m.type === 'event' && m.event === 'peer_disconnected');
  joiner.client.close(1000, 'test');
  await room.webSocketClose(joiner.server);
  const pd = await discPromise;
  check('creator sees peer_disconnected', pd?.peerId === joinerCid);
  assertState(ctx, 'WAITING');

  // resume → CONNECTED again
  const rejoiner = await connect(room, roomId);
  const resumed = await rejoiner.send('resume_room', { roomId, secret });
  check('resume_room ack', resumed.success === true);
  const rejoined = await creator.waitFor((m) => m.type === 'event' && m.event === 'peer_joined' && m.payload?.peerId !== joinerCid);
  check('creator sees peer_joined after resume', !!rejoined?.peerId);
  assertState(ctx, 'CONNECTED');

  // manual close → room_closed to both; storage cleared
  const closeA = creator.waitFor((m) => m.type === 'event' && m.event === 'room_closed');
  const closeB = rejoiner.waitFor((m) => m.type === 'event' && m.event === 'room_closed');
  await rejoiner.send('close_room');
  const [ca, cb] = [await closeA, await closeB];
  check('creator got room_closed', ca?.reason === 'manual_close');
  check('rejoiner got room_closed', cb?.reason === 'manual_close');
  check('storage cleared after close', ctx.storage.map.size === 0);

  // closed room rejects a fresh join
  const late = await connect(room, roomId);
  const lateRes = await late.send('join_with_code', { code });
  check('closed room rejects joins', lateRes.success === false, lateRes.error);
  late.close();
}

async function runRefreshCode() {
  const roomId = uuid();
  const ctx = new FakeCtx();
  const room = new Room(ctx, makeEnv());
  const creator = await connect(room, roomId);
  const created = await creator.send('create_room');
  const beforeAnchor = created.createdAt;

  const refreshed = await creator.send('refresh_code', { roomId, secret: created.secret });
  check('refresh_code ack', refreshed.success === true && typeof refreshed.createdAt === 'number');
  check('refresh_code re-anchors to a later time', refreshed.createdAt >= beforeAnchor);

  // The new anchor produces a fresh window; the OLD code is still accepted
  // within the ±1 validation grace, so a joiner mid-typing isn't cut off.
  const newCode = codeFor(created.secret, refreshed.createdAt);
  const joiner = await connect(room, roomId);
  const joined = await joiner.send('join_with_code', { code: newCode });
  check('fresh code joins after refresh_code', joined.success === true, joined.error);
  const oldCode = codeFor(created.secret, beforeAnchor);
  if (oldCode !== newCode) {
    const graceJoiner = await connect(room, roomId);
    const joinedOld = await graceJoiner.send('join_with_code', { code: oldCode });
    check('old code still joins within the ±1 grace window', joinedOld.success === true, joinedOld.error);
    graceJoiner.close();
  } else {
    check('old code still joins within the ±1 grace window', true, 'same TOTP window — value identical');
  }
  joiner.close();
  creator.close();
}

async function runLiveIdleExpiry() {
  const roomId = uuid();
  const ctx = new FakeCtx();
  const room = new Room(ctx, makeEnv());
  const creator = await connect(room, roomId);
  const created = await creator.send('create_room');
  const code = codeFor(created.secret, created.createdAt);
  const joiner = await connect(room, roomId);
  const joined = await joiner.send('join_with_code', { code });
  if (!joined.success) { check('expiry: join', false, joined.error); return; }
  assertState(ctx, 'CONNECTED');

  // Simulate the idle TTL elapsing, then fire the alarm on a fresh instance.
  ctx.storage.map.set('room', { ...ctx.storage.map.get('room'), lastActive: Date.now() - ROOM_TTL - 1000 });
  const closeA = creator.waitFor((m) => m.type === 'event' && m.event === 'room_closed');
  const closeB = joiner.waitFor((m) => m.type === 'event' && m.event === 'room_closed');
  const fresh = new Room(ctx, makeEnv());
  await fresh.alarm();
  const [ca, cb] = [await closeA, await closeB];
  check('live idle-timeout → room_closed(idle_timeout)', ca?.reason === 'idle_timeout' && cb?.reason === 'idle_timeout');
  check('expired room storage cleared', ctx.storage.map.size === 0);
}

async function runDisconnectedState() {
  const roomId = uuid();
  const ctx = new FakeCtx();
  const room = new Room(ctx, makeEnv());
  const a = await connect(room, roomId);
  const created = await a.send('create_room');
  const joiner = await connect(room, roomId);
  await joiner.send('join_with_code', { code: codeFor(created.secret, created.createdAt) });
  assertState(ctx, 'CONNECTED');

  a.client.close(1000, 'test');
  await room.webSocketClose(a.server);
  assertState(ctx, 'WAITING');
  joiner.client.close(1000, 'test');
  await room.webSocketClose(joiner.server);
  assertState(ctx, 'DISCONNECTED');

  // Empty room expires via alarm (no peers to notify).
  const fresh = new Room(ctx, makeEnv());
  await fresh.alarm();
  check('empty room storage cleared by alarm', ctx.storage.map.size === 0);
}

async function runRegistry() {
  const ctx = new FakeCtx();
  const reg = new Registry(ctx, {});
  const roomId = uuid();
  const secret = 'AABBCCDDEEFFGGHHJJKKLLMMNNOOPPQQ';
  const createdAt = Date.now();
  await reg.fetch(new Request('http://x/register', { method: 'POST', body: JSON.stringify({ roomId, secret, createdAt, expiresAt: Date.now() + 3600e3 }) }));
  const code = codeFor(secret, createdAt);
  const ok = await reg.fetch(new Request('http://x/lookup', { method: 'POST', body: JSON.stringify({ code }) }));
  const found = await ok.json();
  check('registry lookup finds room by code', ok.status === 200 && found.roomId === roomId);
  const miss = await reg.fetch(new Request('http://x/lookup', { method: 'POST', body: JSON.stringify({ code: '000000' }) }));
  check('registry rejects a wrong code', miss.status === 404);

  // Stable short-code share links: /s/<8 chars> resolves to full credentials.
  const shortCode = roomId.replace(/-/g, '').slice(0, 8);
  const short = await reg.fetch(new Request('http://x/resolve-short', { method: 'POST', body: JSON.stringify({ code: shortCode }) }));
  const shortFound = await short.json();
  check('registry resolves a short share code to the room', short.status === 200 && shortFound.roomId === roomId && shortFound.secret === secret && shortFound.createdAt === createdAt);
  const shortMiss = await reg.fetch(new Request('http://x/resolve-short', { method: 'POST', body: JSON.stringify({ code: 'deadbeef' }) }));
  check('registry rejects an unknown short code', shortMiss.status === 404);
  const shortBad = await reg.fetch(new Request('http://x/resolve-short', { method: 'POST', body: JSON.stringify({ code: 'not-a-code' }) }));
  check('registry rejects a malformed short code', shortBad.status === 404);
}

await runRoomProtocol();
await runRefreshCode();
await runLiveIdleExpiry();
await runDisconnectedState();
await runRegistry();

rmSync(tmp, { recursive: true, force: true });
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
