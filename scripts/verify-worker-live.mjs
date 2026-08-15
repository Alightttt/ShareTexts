// Protocol smoke test for the Cloudflare signaling worker (run via
// `npm run worker:dev`, then `npm run worker:test` in another terminal).
// Exercises the full wire protocol with Node's native WebSocket + fetch:
// health → lookup → create → code-join → peer_joined → signal → relay (text +
// binary) → third-device rejection → disconnect/resume → manual close.
import * as OTPAuth from 'otpauth';

const BASE = process.env.WORKER_URL || 'http://localhost:8787';
const WS = BASE.replace(/^http/, 'ws');

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

class Client {
  constructor() {
    this.ws = null;
    this.events = new Map(); // event → handler
    this.waiters = [];       // {event, resolve}
    this.binary = [];
    this.closed = null;
    this.seq = 0;
  }
  open(roomId) {
    const cid = uuid();
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(`${WS}/ws?room=${roomId}&cid=${cid}`);
      ws.binaryType = 'arraybuffer';
      const timer = setTimeout(() => reject(new Error('open timeout')), 8000);
      ws.onopen = () => {
        clearTimeout(timer);
        this.ws = ws;
        resolve({ cid });
      };
      ws.onerror = () => reject(new Error('ws error'));
      ws.onclose = (ev) => {
        this.closed = { code: ev.code, reason: ev.reason || '' };
        for (const w of this.waiters.filter((w) => w.event === '__close')) w.resolve(ev);
      };
      ws.onmessage = (ev) => this._onMessage(ev.data);
    });
  }
  _onMessage(data) {
    if (typeof data === 'string') {
      let msg;
      try { msg = JSON.parse(data); } catch { return; }
      if (msg.type === 'ack') {
        const w = this.waiters.find((w) => w.event === `ack:${msg.id}`);
        if (w) { this.waiters = this.waiters.filter((x) => x !== w); w.resolve(msg.ok ? { success: true, ...msg } : { success: false, error: msg.message || msg.error, code: msg.code }); }
      } else if (msg.type === 'event') {
        const h = this.events.get(msg.event);
        if (h) h(msg.payload);
        for (const w of this.waiters.filter((w) => w.event === msg.event)) w.resolve(msg.payload);
      }
    } else {
      this.binary.push(data);
      const h = this.events.get('__binary');
      if (h) h(data);
    }
  }
  send(event, payload) {
    const id = `${Date.now().toString(36)}-${this.seq++}`;
    this.ws.send(JSON.stringify({ v: 1, id, event, payload }));
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.waiters = this.waiters.filter((w) => w.event !== `ack:${id}`);
        resolve({ success: false, error: 'ack timeout' });
      }, 8000);
      const orig = this.waiters;
      this.waiters = [
        ...orig,
        {
          event: `ack:${id}`,
          resolve: (r) => {
            clearTimeout(timer);
            resolve(r);
          },
        },
      ];
    });
  }
  waitFor(event, timeoutMs = 5000) {
    return new Promise((resolve) => {
      const timer = setTimeout(() => resolve(null), timeoutMs);
      this.waiters.push({
        event,
        resolve: (p) => {
          clearTimeout(timer);
          resolve(p);
        },
      });
    });
  }
  close() {
    try { this.ws.close(); } catch { /* noop */ }
  }
}

function codeFor(secret, createdAt = 0) {
  return new OTPAuth.TOTP({ issuer: 'ShareText', label: 'Session', algorithm: 'SHA1', digits: 6, period: 40, secret }).generate({ timestamp: Date.now() - createdAt });
}

async function main() {
  console.log(`Worker under test: ${BASE}`);

  // 1. health
  const health = await (await fetch(`${BASE}/health`)).json();
  check('GET /health', health.ok === true && health.service === 'sharetext-signaling-cf', JSON.stringify(health));

  // 2. lookup rejects garbage
  const badLookup = await fetch(`${BASE}/lookup`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ code: '000000' }) });
  check('POST /lookup garbage → 404', badLookup.status === 404);

  // 3. create
  const roomId = uuid();
  const creator = new Client();
  const { cid: creatorCid } = await creator.open(roomId);
  const created = await creator.send('create_room');
  check('create_room ack', created.success === true && created.roomId === roomId, `room ${String(created.roomId).slice(0, 8)}`);
  const secret = created.secret;

  // 4. lookup finds the room via its TOTP code
  const code = codeFor(secret, created.createdAt);
  const lookup = await (await fetch(`${BASE}/lookup`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ code }) })).json();
  check('POST /lookup resolves code → roomId', lookup.roomId === roomId);

  // 5. join with code; creator sees peer_joined
  const joiner = new Client();
  await joiner.open(roomId);
  const peerJoinedWait = creator.waitFor('peer_joined');
  const joined = await joiner.send('join_with_code', { code });
  check('join_with_code ack', joined.success === true && joined.roomId === roomId);
  const peerJoined = await peerJoinedWait;
  check('creator receives peer_joined', !!peerJoined?.peerId, `peer ${String(peerJoined?.peerId).slice(0, 8)}`);

  // 6. signal forwarding (offer → answer)
  const joinerCid = peerJoined.peerId;
  const signalReceived = creator.waitFor('signal');
  await joiner.send('signal', { to: creatorCid, signal: { type: 'offer', sdp: 'v=0 fake sdp' } });
  const sig = await signalReceived;
  check('signal forwarded to creator', sig?.from === joinerCid && sig?.signal?.type === 'offer');

  // 7. relay — text
  const relayText = joiner.waitFor('relay_message');
  await creator.send('relay_message', { data: '{"enc":"ciphertext"}' });
  const rt = await relayText;
  check('relay_message (text) forwarded', rt?.data === '{"enc":"ciphertext"}');

  // 8. relay — binary (encrypted file chunk shape)
  const relayBin = new Promise((resolve) => joiner.events.set('__binary', resolve));
  const chunk = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 99, 98]);
  creator.ws.send(chunk.buffer);
  const rb = await relayBin;
  check('relay_message (binary) forwarded intact', rb instanceof ArrayBuffer && new Uint8Array(rb).length === chunk.length && new Uint8Array(rb)[21] === 98);

  // 9. third device rejected
  const third = new Client();
  await third.open(roomId);
  const thirdRes = await third.send('join_with_code', { code });
  check('third device rejected', thirdRes.success === false && thirdRes.code === 'ROOM_FULL', thirdRes.error || thirdRes.code);
  third.close();

  // 10. disconnect → peer_disconnected; resume → peer_joined again
  const disc = creator.waitFor('peer_disconnected');
  joiner.close();
  const pd = await disc;
  check('creator sees peer_disconnected', pd?.peerId === joinerCid);
  const rejoin = new Client();
  await rejoin.open(roomId);
  const rejoinedWait = creator.waitFor('peer_joined');
  const resumed = await rejoin.send('resume_room', { roomId, secret });
  check('resume_room ack', resumed.success === true);
  const rejoined = await rejoinedWait;
  check('creator sees peer_joined after resume', !!rejoined?.peerId && rejoined.peerId !== joinerCid);

  // 11. manual close → both devices get room_closed
  const closeA = creator.waitFor('room_closed');
  const closeB = rejoin.waitFor('room_closed');
  await rejoin.send('close_room');
  const [ca, cb] = [await closeA, await closeB];
  check('creator got room_closed', ca?.reason === 'manual_close');
  check('rejoiner got room_closed', cb?.reason === 'manual_close');

  // 12. closed room is gone — a fresh join fails
  const late = new Client();
  await late.open(roomId);
  const lateRes = await late.send('join_with_code', { code });
  check('closed room rejects joins', lateRes.success === false);
  late.close();

  creator.close();
  rejoin.close();

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error('Test harness error:', e);
  process.exit(1);
});
