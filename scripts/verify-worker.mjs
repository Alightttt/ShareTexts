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
    metrics: path.join(root, 'worker', 'src', 'metrics.ts'),
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
const { Metrics } = await import(pathToFileURL(path.join(tmp, 'metrics.js')).href + cacheBust);

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
async function connect(room, roomId, forceCid) {
  const cid = forceCid ?? uuid();
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

  // relay text → TRANSFERRING. Payload must look like ciphertext (the OWASP
  // message-validation gate rejects non-base64 broadcast attempts).
  const relayPromise = joiner.waitFor((m) => m.type === 'event' && m.event === 'relay_message');
  await creator.send('relay_message', { data: 'enc:AAAA' });
  const relayed = await relayPromise;
  check('relay_message (text) forwarded', relayed?.data === 'enc:AAAA');
  // Non-ciphertext payloads (e.g. a plaintext JSON broadcast) are rejected.
  await creator.send('relay_message', { data: '{"hello":"world"}' });
  const rejected = await joiner.waitFor((m) => m.type === 'event' && m.event === 'relay_message' && m.payload?.data === '{"hello":"world"}', 300);
  check('malformed relay payload rejected', !rejected);
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

  // abuse control: text frames over the per-connection rate limit are dropped
  const before = joiner.inbox.length;
  for (let i = 0; i < 80; i++) await room.webSocketMessage(creator.server, JSON.stringify({ v: 1, id: `f${i}`, event: 'relay_message', payload: { data: 'enc:AAAA' } }));
  await sleep(120);
  const forwardedAfterFlood = joiner.inbox.length - before;
  check('frame flood throttled (≤60 forwarded of 80)', forwardedAfterFlood <= 61, `forwarded ${forwardedAfterFlood}`);

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

  // disconnect joiner → 60s disconnect grace: the seat is HELD (no scary
  // "disconnected" banner for a tab refresh or a network blip)
  const discPromise = creator.waitFor((m) => m.type === 'event' && m.event === 'peer_disconnected', 400);
  joiner.client.close(1000, 'test');
  await room.webSocketClose(joiner.server);
  const early = await discPromise;
  check('no immediate peer_disconnected during grace', !early);
  assertState(ctx, 'TRANSFERRING');

  // resume with the same cid within the grace window → seat reclaimed
  // silently (peer_recovered, not peer_joined)
  const preSt = ctx.storage.map.get('room');
  console.log('  [dbg] pre-resume: peerA', preSt.peerA?.slice(0,8), 'peerB', preSt.peerB?.slice(0,8), 'grace keys', preSt.grace ? Object.keys(preSt.grace).length : 0, 'joinerCid', joinerCid?.slice(0,8));
  const rejoiner = await connect(room, roomId, joinerCid);
  const resumed = await rejoiner.send('resume_room', { roomId, secret });
  check('resume_room ack', resumed.success === true);
  const recovered = await creator.waitFor((m) => m.type === 'event' && m.event === 'peer_recovered');
  check('creator sees peer_recovered (silent reconnect)', recovered?.peerId === joinerCid);
  assertState(ctx, 'CONNECTED');
  check('seat reclaimed by the same cid', ctx.storage.map.get('room')?.peerB === joinerCid);
  // waitFor re-scans the whole inbox — the initial peer_joined is still in
  // it, so look only at messages received AFTER the peer_recovered event.
  const recoveredIdx = creator.inbox.findIndex((m) => m.type === 'event' && m.event === 'peer_recovered');
  const noJoinNoise = creator.inbox.slice(recoveredIdx + 1).find((m) => m.type === 'event' && m.event === 'peer_joined');
  check('recovery does not emit a redundant peer_joined', !noJoinNoise);

  // A different device cannot steal the grace-held seat
  const intruder = await connect(room, roomId);
  const intruderRes = await intruder.send('resume_room', { roomId, secret });
  check('stranger cannot steal the seat within grace', intruderRes.success === false && intruderRes.code === 'ROOM_FULL', intruderRes.error);
  intruder.close();

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

  // Grace: a closed seat is HELD for 60s (tab refresh / network blip must not
  // look like a disconnect), so the state stays CONNECTED after each close.
  a.client.close(1000, 'test');
  await room.webSocketClose(a.server);
  assertState(ctx, 'CONNECTED');
  check('creator seat grace-held', (ctx.storage.map.get('room')?.grace?.[a.cid] ?? 0) > Date.now());
  joiner.client.close(1000, 'test');
  await room.webSocketClose(joiner.server);
  assertState(ctx, 'CONNECTED');

  // Expire both grace deadlines → alarm confirms the evictions.
  const st = ctx.storage.map.get('room');
  ctx.storage.map.set('room', { ...st, grace: Object.fromEntries(Object.entries(st.grace ?? {}).map(([k, v]) => [k, Date.now() - 10])) });
  const fresh = new Room(ctx, makeEnv());
  await fresh.alarm();
  assertState(ctx, 'DISCONNECTED');
  check('evicted seats cleared', ctx.storage.map.get('room')?.peerA === null && ctx.storage.map.get('room')?.peerB === null);

  // Empty room expires via alarm (no peers to notify) once past its TTL.
  // A fresh instance reads the back-dated state from storage — the cached
  // `fresh` object still holds the pre-eviction room in memory.
  ctx.storage.map.set('room', { ...ctx.storage.map.get('room'), lastActive: Date.now() - ROOM_TTL - 1000 });
  const fresh2 = new Room(ctx, makeEnv());
  await fresh2.alarm();
  check('empty room storage cleared by alarm', ctx.storage.map.size === 0);
}

// Stay Connected: room-wide promise flips, BOTH peers get the echo, the
// state persists, and a non-member cannot flip someone else's room.
async function runStayConnected() {
  const roomId = uuid();
  const ctx = new FakeCtx();
  const room = new Room(ctx, makeEnv());
  const creator = await connect(room, roomId);
  await creator.send('create_room');
  const secret = ctx.storage.map.get('room').secret;
  const joiner = await connect(room, roomId);
  const codeRes = await creator.send('refresh_code', { roomId, secret });
  const code = codeFor(secret, ctx.storage.map.get('room').codeAnchor);
  const joined = await joiner.send('join_with_code', { code });
  check('stay: joiner seated', joined.success === true);

  const echoC = creator.waitFor((m) => m.type === 'event' && m.event === 'stay_connected_state');
  const echoJ = joiner.waitFor((m) => m.type === 'event' && m.event === 'stay_connected_state');
  const ack = await joiner.send('stay_connected_enable');
  const [ec, ej] = [await echoC, await echoJ];
  check('stay: enable acked', ack.success === true && ack.enabled === true, JSON.stringify(ack));
  check('stay: creator echoed enabled', ec?.enabled === true);
  check('stay: joiner echoed enabled', ej?.enabled === true);
  check('stay: persisted on room state', ctx.storage.map.get('room')?.stayConnected === true);

  const offC = creator.waitFor((m) => m.type === 'event' && m.event === 'stay_connected_state' && m.payload?.enabled === false);
  await joiner.send('stay_connected_disable');
  check('stay: disable echoed', (await offC)?.enabled === false);
  check('stay: disabled persisted', ctx.storage.map.get('room')?.stayConnected === false);

  // A socket that never joined cannot flip the room's promise.
  const stranger = await connect(room, roomId);
  const denied = await stranger.send('stay_connected_enable');
  check('stay: non-member rejected', denied.success === false, denied.error);
  stranger.close();
  creator.close();
  joiner.close();
}

// Stay Connected must outlive BOTH devices going away — that is the promise's
// entire point. The empty room keeps accepting a remembered member (or a
// fresh device holding the secret when no snapshot exists), never a stranger;
// only a member can close it in that phase.
async function runStayEmptySurvival() {
  const roomId = uuid();
  const ctx = new FakeCtx();
  const room = new Room(ctx, makeEnv());
  const creator = await connect(room, roomId);
  const created = await creator.send('create_room');
  const secret = created.secret;
  const joiner = await connect(room, roomId);
  const codeRes = await creator.send('refresh_code', { roomId, secret });
  const code = codeFor(secret, ctx.storage.map.get('room').codeAnchor);
  const joined = await joiner.send('join_with_code', { code });
  check('stay-empty: joiner seated', joined.success === true);
  await joiner.send('stay_connected_enable');

  // Both devices go away (the exact "closed both tabs" case).
  creator.close();
  joiner.close();
  await sleep(50);
  check('stay-empty: room survives both tabs closing', ctx.storage.map.get('room') != null);

  // A stranger (no secret knowledge, fresh cid) must NOT get the empty seat.
  const stranger = await connect(room, roomId);
  const strangerJoin = await stranger.send('resume_room', { roomId, secret: 'wrong-secret-xxxxxxxxxxxxxxx' });
  check('stay-empty: stranger rejected with bad secret', strangerJoin.success === false, strangerJoin.error);
  stranger.close();

  // The creator returns with the right secret — recognized via the persisted
  // membership snapshot even though its seat was freed.
  const returning = await connect(room, roomId);
  const resumed = await returning.send('resume_room', { roomId, secret });
  check('stay-empty: member re-enters empty room', resumed.success === true, resumed.error || '');
  check('stay-empty: promise still on', resumed.stayConnected === true);

  // A socket that never joined (fresh cid, no seat, no membership) cannot
  // close someone else's promise room even by sending close_room directly.
  const outside = await connect(room, roomId);
  await outside.send('close_room');
  check('stay-empty: outsider close did not destroy room', ctx.storage.map.get('room') != null);
  outside.close();

  // The member who IS part of the room can end it for everyone.
  await returning.send('close_room');
  check('stay-empty: member close ends the room', ctx.storage.map.get('room') == null);
  returning.close();
}

// Regression for the "rejoin doesn't always work" bug: a device whose
// connection id CHANGED (every real reconnect after the old socket dies)
// must be able to re-enter a room it holds the secret for — stay promise or
// not. The 128-bit secret is the room's credential; the old snapshot gate
// wrongly demanded a remembered cid and answered ROOM_FULL instead.
async function runFreshCidRejoin() {
  // Non-stay room: creator seats, both sockets die (seats freed), a brand-new
  // cid presents the correct secret — must be let back in, not ROOM_FULL.
  const roomId = uuid();
  const ctx = new FakeCtx();
  const room = new Room(ctx, makeEnv());
  const creator = await connect(room, roomId);
  const created = await creator.send('create_room');
  const secret = created.secret;
  creator.close();
  await sleep(50);
  check('rejoin: room survives creator leaving', ctx.storage.map.get('room') != null);
  const fresh = await connect(room, roomId);
  const resumed = await fresh.send('resume_room', { roomId, secret });
  check('rejoin: fresh cid + correct secret enters empty room', resumed.success === true, resumed.error || '');
  check('rejoin: room seated again', ctx.storage.map.get('room')?.peerA != null || ctx.storage.map.get('room')?.peerB != null);
  // ...and the security half: a WRONG secret still gets nothing.
  const intruder = await connect(room, roomId);
  const denied = await intruder.send('resume_room', { roomId, secret: 'WRONG-SECRET-WRONG-SECRET-1' });
  check('rejoin: wrong secret still rejected', denied.success === false, denied.error);
  intruder.close();
  await fresh.send('close_room');
  fresh.close();
}

async function runPush() {
  const roomId = uuid();
  const ctx = new FakeCtx();
  const room = new Room(ctx, makeEnv());
  const creator = await connect(room, roomId);
  const created = await creator.send('create_room');
  const secret = created.secret;

  // Unauthenticated / wrong-secret push → 401.
  const noAuth = await room.fetch(new Request('http://x/push', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ roomId, text: 'hi' }) }));
  check('push without secret → 401', noAuth.status === 401);
  const badAuth = await room.fetch(new Request('http://x/push', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: 'Bearer WRONG' },
    body: JSON.stringify({ roomId, text: 'hi' }),
  }));
  check('push with wrong secret → 401', badAuth.status === 401);

  // Text push → creator receives push_message(kind=text).
  const textPromise = creator.waitFor((m) => m.type === 'event' && m.event === 'push_message');
  const textRes = await room.fetch(new Request('http://x/push', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: 'Bearer ' + secret },
    body: JSON.stringify({ roomId, text: 'Hello from an agent' }),
  }));
  check('text push → 200', textRes.status === 200);
  const textMsg = await textPromise;
  check('creator receives push_message text', textMsg?.kind === 'text' && textMsg?.text === 'Hello from an agent', textMsg?.text);

  // File push (multi-chunk) → creator receives every chunk intact, in order.
  const fileBytes = Buffer.from('\x00\x01 payload '.repeat(50) + '\xff\xfe', 'utf8'); // ~700 bytes → 1 chunk
  const big = Buffer.alloc(90 * 1024, 7); // 90KB → 2 chunks (45KB each)
  big.set(fileBytes, 0);
  const b64 = big.toString('base64');
  const chunkPromise = creator.waitFor((m) => m.type === 'event' && m.event === 'push_message' && m.payload?.kind === 'file' && m.payload?.chunkIndex === 1, 6000);
  const fileRes = await room.fetch(new Request('http://x/push', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: 'Bearer ' + secret },
    body: JSON.stringify({ roomId, name: 'payload.bin', mimeType: 'application/octet-stream', dataBase64: b64 }),
  }));
  check('file push → 200', fileRes.status === 200);
  const lastChunk = await chunkPromise;
  check('file push chunked (2 chunks)', lastChunk?.chunkCount === 2, `count ${lastChunk?.chunkCount}`);
  const fileEvents = creator.inbox.filter((m) => m.type === 'event' && m.event === 'push_message' && m.payload?.kind === 'file' && m.payload?.id === lastChunk?.id);
  const joined = Buffer.concat(fileEvents.map((e) => Buffer.from(e.payload.dataBase64, 'base64')));
  check('file push reassembles byte-identical', joined.length === big.length && joined.equals(big), `${joined.length} bytes`);

  // Push to a closed/missing room → 404.
  const gone = await room.fetch(new Request('http://x/push', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: 'Bearer ' + secret },
    body: JSON.stringify({ roomId, text: 'hi' }),
  }));
  await creator.send('close_room');
  const afterClose = await room.fetch(new Request('http://x/push', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: 'Bearer ' + secret },
    body: JSON.stringify({ roomId, text: 'hi' }),
  }));
  check('push before close ok, after close → 404', gone.status === 200 && afterClose.status === 404);
  creator.close();
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

  // Edge-side abuse protection: the per-IP sliding window (lookup limit is
  // 20/60s in RATE_LIMITS) must 429 once exhausted and reset on the next
  // window. Shared networks aren't broken because real deployments always
  // present a client IP; unknown/absent IPs are deliberately not limited.
  let limited = false;
  for (let i = 0; i < 25; i++) {
    const r = await reg.fetch(new Request('http://x/rate-check', { method: 'POST', body: JSON.stringify({ ip: '203.0.113.7', scope: 'lookup' }) }));
    const out = await r.json();
    if (!out.ok) limited = true;
  }
  check('rate limit 429s after 20 lookups from one IP', limited);
  const fresh = await reg.fetch(new Request('http://x/rate-check', { method: 'POST', body: JSON.stringify({ ip: '203.0.113.8', scope: 'lookup' }) }));
  check('rate limit is per-IP (fresh IP allowed)', (await fresh.json()).ok === true);
  const unknown = await reg.fetch(new Request('http://x/rate-check', { method: 'POST', body: JSON.stringify({ ip: 'unknown', scope: 'lookup' }) }));
  check('rate limit skips unknown IPs (dev/test)', (await unknown.json()).ok === true);
}

/**
 * The landing-page "rooms made" tracker must NEVER go backwards: the
 * lifetime counter is floored at the historical count (rooms made before
 * lifetime tracking existed), on every increment AND on every read — so a
 * redeploy/eviction that wipes DO storage can't drop the public number from
 * 113+ to 0 and make the landing page look frozen.
 *
 * SEMANTICS (Round 04B honesty): rooms.created is fired by Room.recomputeState
 * when a room FIRST holds two live peers — a real two-device connection —
 * never at room creation. These tests exercise the Metrics DO contract
 * directly; the Room-side "counted once per room" behavior is covered by
 * the recomputeState flag, verified in the room-flow test.
 */
async function runMetrics() {
  const metrics = new Metrics(new FakeCtx(), {});
  const post = (name) => metrics.fetch(new Request('http://x/event', {
    method: 'POST',
    body: JSON.stringify({ name }),
  }));

  // First rooms.created on FRESH storage: must report the floor, not 1.
  await post('rooms.created');
  let snap = await (await metrics.fetch(new Request('http://x/metrics'))).json();
  check('lifetime rooms counter is floored on first increment (fresh storage)', snap.lifetime_rooms_created === 114, `got ${snap.lifetime_rooms_created}`);

  // Each subsequent room grows it by one.
  await post('rooms.created');
  await post('rooms.created');
  snap = await (await metrics.fetch(new Request('http://x/metrics'))).json();
  check('lifetime rooms counter grows monotonically', snap.lifetime_rooms_created === 116, `got ${snap.lifetime_rooms_created}`);

  // A metrics DO reset (redeploy/eviction) must NOT drop the public number
  // below the floor even on READ, before any new room arrives.
  const fresh = new Metrics(new FakeCtx(), {});
  snap = await (await fresh.fetch(new Request('http://x/metrics'))).json();
  check('floored on read after a storage reset (no room needed)', snap.lifetime_rooms_created >= 113, `got ${snap.lifetime_rooms_created}`);

  // Simulated pre-existing counter ABOVE the floor is preserved exactly.
  const ahead = new Metrics(new FakeCtx(), {});
  for (let i = 0; i < 40; i++) await ahead.fetch(new Request('http://x/event', { method: 'POST', body: JSON.stringify({ name: 'rooms.created' }) }));
  snap = await (await ahead.fetch(new Request('http://x/metrics'))).json();
  check('counter above floor keeps exact count (113 + 40 = 153)', snap.lifetime_rooms_created === 153, `got ${snap.lifetime_rooms_created}`);

  // Other metric names never touch the lifetime counter.
  const other = new Metrics(new FakeCtx(), {});
  await other.fetch(new Request('http://x/event', { method: 'POST', body: JSON.stringify({ name: 'joins.succeeded' }) }));
  snap = await (await other.fetch(new Request('http://x/metrics'))).json();
  check('non-room metrics do not inflate the rooms counter', snap.lifetime_rooms_created === 113, `got ${snap.lifetime_rooms_created}`);
}

await runRoomProtocol();
await runRefreshCode();
await runStayConnected();
await runStayEmptySurvival();
await runFreshCidRejoin();
await runPush();
await runLiveIdleExpiry();
await runDisconnectedState();
await runRegistry();
await runMetrics();

rmSync(tmp, { recursive: true, force: true });
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
