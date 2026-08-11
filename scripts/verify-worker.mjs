// Emulator protocol test for the Cloudflare signaling worker.
//
// workerd can't run on every machine, so this bundles the REAL Room and
// Registry Durable Object classes with esbuild (aliasing `cloudflare:workers`
// to a small runtime shim) and drives them directly in Node: create → lookup →
// code-join → peer_joined → signal → relay (text + binary) → third-device
// rejection → disconnect/resume → manual close → closed-room rejection, plus
// Registry register/lookup.
//
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
const { Room } = await import(pathToFileURL(path.join(tmp, 'room.js')).href + cacheBust);
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

// Node's Response rejects status 101; emulate the Workers upgrade response
// (a status-101 Response carrying `webSocket`) as a plain object.
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
    await room.webSocketMessage(server, JSON.stringify({ id, event, payload }));
    const ack = inbox.find((m) => m.type === 'ack' && m.id === id);
    return ack ? (ack.ok ? { success: true, ...ack } : { success: false, error: ack.error }) : { success: false, error: 'no ack' };
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
  return { client, server, inbox, binary, send, waitFor, cid };
}

function codeFor(secret) {
  return new OTPAuth.TOTP({ issuer: 'ShareText', label: 'Session', algorithm: 'SHA1', digits: 6, period: 30, secret }).generate();
}

async function runRoomProtocol() {
  const roomId = uuid();
  const ctx = new FakeCtx();
  const env = { REGISTRY: { get: () => ({ fetch: async () => new Response(JSON.stringify({ ok: true })) }), idFromName: () => ({}) } };
  const room = new Room(ctx, env);

  // create
  const creator = await connect(room, roomId);
  const created = await creator.send('create_room');
  check('create_room ack', created.success === true && created.roomId === roomId, `room ${String(created.roomId).slice(0, 8)}`);
  const secret = created.secret;

  // join with code → creator sees peer_joined
  const code = codeFor(secret);
  const joiner = await connect(room, roomId);
  const joined = await joiner.send('join_with_code', { code });
  check('join_with_code ack', joined.success === true && joined.roomId === roomId);
  const peerJoined = await creator.waitFor((m) => m.type === 'event' && m.event === 'peer_joined');
  check('creator receives peer_joined', !!peerJoined?.peerId, `peer ${String(peerJoined?.peerId).slice(0, 8)}`);
  const joinerCid = peerJoined.peerId;

  // signal forwarding
  const sigPromise = creator.waitFor((m) => m.type === 'event' && m.event === 'signal');
  await joiner.send('signal', { to: creator.cid, signal: { type: 'offer', sdp: 'v=0 fake sdp' } });
  const sig = await sigPromise;
  check('signal forwarded to creator', sig?.from === joinerCid && sig?.signal?.type === 'offer');

  // relay text
  const relayPromise = joiner.waitFor((m) => m.type === 'event' && m.event === 'relay_message');
  await creator.send('relay_message', { data: '{"enc":"ciphertext"}' });
  const relayed = await relayPromise;
  check('relay_message (text) forwarded', relayed?.data === '{"enc":"ciphertext"}');

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

  // third device rejected
  const third = await connect(room, roomId);
  const thirdRes = await third.send('join_with_code', { code });
  check('third device rejected', thirdRes.success === false && /two devices/.test(thirdRes.error || ''), thirdRes.error);

  // disconnect → peer_disconnected
  const discPromise = creator.waitFor((m) => m.type === 'event' && m.event === 'peer_disconnected');
  joiner.client.close(1000, 'test');
  await room.webSocketClose(joiner.server);
  const pd = await discPromise;
  check('creator sees peer_disconnected', pd?.peerId === joinerCid);

  // resume → peer_joined again
  const rejoiner = await connect(room, roomId);
  const resumed = await rejoiner.send('resume_room', { roomId, secret });
  check('resume_room ack', resumed.success === true);
  const rejoined = await creator.waitFor((m) => m.type === 'event' && m.event === 'peer_joined' && m.payload?.peerId !== joinerCid);
  check('creator sees peer_joined after resume', !!rejoined?.peerId);

  // manual close → room_closed to both
  const closeA = creator.waitFor((m) => m.type === 'event' && m.event === 'room_closed');
  const closeB = rejoiner.waitFor((m) => m.type === 'event' && m.event === 'room_closed');
  await rejoiner.send('close_room');
  const [ca, cb] = [await closeA, await closeB];
  check('creator got room_closed', ca?.reason === 'manual_close');
  check('rejoiner got room_closed', cb?.reason === 'manual_close');

  // closed room rejects a fresh join
  const late = await connect(room, roomId);
  const lateRes = await late.send('join_with_code', { code });
  check('closed room rejects joins', lateRes.success === false, lateRes.error);
}

async function runRegistry() {
  const ctx = new FakeCtx();
  const reg = new Registry(ctx, {});
  const roomId = uuid();
  const secret = 'AABBCCDDEEFFGGHHJJKKLLMMNNOOPPQQ';
  await reg.fetch(
    new Request('http://x/register', { method: 'POST', body: JSON.stringify({ roomId, secret, expiresAt: Date.now() + 3600e3 }) })
  );
  const code = codeFor(secret);
  const ok = await reg.fetch(new Request('http://x/lookup', { method: 'POST', body: JSON.stringify({ code }) }));
  const found = await ok.json();
  check('registry lookup finds room by code', ok.status === 200 && found.roomId === roomId);

  const miss = await reg.fetch(new Request('http://x/lookup', { method: 'POST', body: JSON.stringify({ code: '000000' }) }));
  check('registry rejects a wrong code', miss.status === 404);
}

await runRoomProtocol();
await runRegistry();

rmSync(tmp, { recursive: true, force: true });
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
