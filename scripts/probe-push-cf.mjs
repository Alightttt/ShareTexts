// Live push verification against `npm run worker:dev` (port 8787):
//   health → create (WS) → push text + file via /api/push → events arrive.
import * as OTPAuth from 'otpauth';

const BASE = process.env.WORKER_URL || 'http://localhost:8787';
const WS = BASE.replace(/^http/, 'ws');

let pass = 0, fail = 0;
const check = (name, cond, extra = '') => {
  if (cond) { pass++; console.log(`  ok  ${name}${extra ? ' — ' + extra : ''}`); }
  else { fail++; console.log(`FAIL  ${name}${extra ? ' — ' + extra : ''}`); }
};
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const uuid = () => crypto.randomUUID();

const health = await fetch(BASE + '/health');
check('worker health', health.status === 200, (await health.text()).slice(0, 40));

// Create a room over the real WS protocol.
const roomId = uuid();
const ws = new WebSocket(`${WS}/ws?room=${roomId}&cid=${uuid()}`);
ws.binaryType = 'arraybuffer';
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = () => rej(new Error('ws open failed')); setTimeout(() => rej(new Error('open timeout')), 8000); });

const events = [];
ws.onmessage = (ev) => {
  const msg = JSON.parse(ev.data);
  if (msg.type === 'event') events.push(msg.payload);
};
const send = (event, payload) => new Promise((resolve) => {
  const id = 'p' + Date.now() + Math.random().toString(36).slice(2, 6);
  const t = setTimeout(() => resolve({ success: false, error: 'no ack' }), 8000);
  const h = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.type === 'ack' && m.id === id) { clearTimeout(t); ws.removeEventListener('message', h); resolve(m.ok ? { success: true, ...m } : { success: false, code: m.code, error: m.message }); }
  };
  ws.addEventListener('message', h);
  ws.send(JSON.stringify({ v: 1, id, event, payload }));
});

const created = await send('create_room');
check('create_room ack', created.success === true, created.roomId?.slice(0, 8));
const secret = created.secret;

// Text push
const textRes = await fetch(`${BASE}/api/push`, {
  method: 'POST',
  headers: { 'content-type': 'application/json', authorization: 'Bearer ' + secret },
  body: JSON.stringify({ roomId, text: 'Hello from a live worker push' }),
});
check('text push → 200', textRes.status === 200);
let textOk = false;
for (let i = 0; i < 100; i++) {
  if (events.some(e => e.kind === 'text' && e.text === 'Hello from a live worker push')) { textOk = true; break; }
  await sleep(50);
}
check('text push_message received over WS', textOk);

// File push (multi-chunk)
const fileBytes = Buffer.alloc(100 * 1024, 5);
const fileRes = await fetch(`${BASE}/api/push`, {
  method: 'POST',
  headers: { 'content-type': 'application/json', authorization: 'Bearer ' + secret },
  body: JSON.stringify({ roomId, name: 'live.bin', mimeType: 'application/octet-stream', dataBase64: fileBytes.toString('base64') }),
});
check('file push → 200', fileRes.status === 200);
let chunks = [];
for (let i = 0; i < 200; i++) {
  chunks = events.filter(e => e.kind === 'file' && e.name === 'live.bin');
  if (chunks.length > 0 && chunks.length >= chunks[0].chunkCount) break;
  await sleep(50);
}
check('file push chunked to all peers', chunks.length > 0 && chunks.length >= chunks[0].chunkCount, `${chunks.length} chunks`);
const joined = Buffer.concat(chunks.map(c => Buffer.from(c.dataBase64, 'base64')));
check('file push byte-identical over live worker', joined.length === fileBytes.length && joined.equals(fileBytes), `${joined.length} bytes`);

// Rejections
const bad = await fetch(`${BASE}/api/push`, {
  method: 'POST',
  headers: { 'content-type': 'application/json', authorization: 'Bearer WRONG' },
  body: JSON.stringify({ roomId, text: 'x' }),
});
check('wrong secret → 401', bad.status === 401);
const badBody = await fetch(`${BASE}/api/push`, {
  method: 'POST',
  headers: { 'content-type': 'application/json', authorization: 'Bearer ' + secret },
  body: JSON.stringify({ roomId }),
});
check('missing body → 400', badBody.status === 400);

ws.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
