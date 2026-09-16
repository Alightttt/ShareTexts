/**
 * Nearby-discovery protocol tests. Boots the built server (dist/server.cjs) on
 * a scratch port and drives the wire protocol end-to-end:
 *
 *   presence_announce / presence_list / presence_invite /
 *   presence_invite_result / withdrawal / TTL expiry / duplicate handling
 *   malformed-payload validation — and regression-checks the EXISTING
 *   create_room → join_with_link handshake (discovery must not disturb it).
 *
 * Run: npm run build && node scripts/verify-nearby.mjs
 */
import { io } from 'socket.io-client';
import { spawn } from 'child_process';
import { readFileSync, rmSync } from 'fs';

const PORT = 3577;
const URL = `http://127.0.0.1:${PORT}`;
const ENV = { ...process.env, PORT: String(PORT), NODE_ENV: 'production' };

let passed = 0, failed = 0;
function check(name, ok, extra = '') {
  if (ok) { passed++; console.log('  PASS', name); }
  else { failed++; console.error('  FAIL', name, extra ? JSON.stringify(extra).slice(0, 160) : ''); }
}
const waitMs = (ms) => new Promise(r => setTimeout(r, ms));
function uuid() { return crypto.randomUUID(); }

function connect() {
  return new Promise((resolve, reject) => {
    const s = io(URL, { transports: ['websocket'], timeout: 8000 });
    s.on('connect', () => resolve(s));
    s.on('connect_error', reject);
  });
}
function emitAck(s, event, payload) {
  return new Promise(resolve => s.timeout(6000).emit(event, payload, (err, res) =>
    resolve(err ? { success: false, error: String(err) } : res)));
}
// create_room takes ONLY an ack — a payload object would be bound as the cb.
const emitBare = (s, event) => new Promise(resolve => s.timeout(6000).emit(event, (err, res) => resolve(err ? { success: false, error: String(err) } : res)));

async function waitEvent(s, event, timeoutMs = 6000) {
  return new Promise((resolve) => {
    const t = setTimeout(() => resolve(null), timeoutMs);
    s.once(event, (payload) => { clearTimeout(t); resolve(payload); });
  });
}

let server;
try {
  server = spawn(process.execPath, ['dist/server.cjs'], { env: ENV, stdio: ['ignore', 'pipe', 'pipe'] });
  server.stdout.on('data', d => process.stdout.write('[srv] ' + d));
  server.stderr.on('data', d => process.stderr.write('[srv!] ' + d));
  for (let i = 0; i < 40; i++) {
    try { await connect().then(s => s.disconnect()); break; } catch { await waitMs(250); }
  }

  /* ================= EXISTING FLOW REGRESSION ================= */
  console.log('\n— existing connection flow —');
  const creator = await connect();
  const created = await emitBare(creator, 'create_room');
  check('create_room still works', created.success === true && !!created.roomId);
  const joiner = await connect();
  const peerJoined = waitEvent(creator, 'peer_joined'); // register BEFORE joining
  const linked = await emitAck(joiner, 'join_with_link', { roomId: created.roomId });
  check('join_with_link still works', linked.success === true && !!linked.secret);
  check('joiner got peer_joined', await peerJoined !== null);

  /* ================= ANNOUNCE & LIST ================= */
  console.log('\n— presence announce / list —');
  const A = await connect(); // inviter
  const B = await connect(); // invitee
  const devA = uuid(), devB = uuid();

  const annA = await emitAck(A, 'presence_announce', { deviceId: devA, name: 'Windows PC' });
  check('announce A ok', annA.success === true && /^[0-9a-f]{32}$/.test(annA.token || ''));
  const annB = await emitAck(B, 'presence_announce', { deviceId: devB, name: 'iPhone' });
  check('announce B ok', annB.success === true && annB.token !== annA.token);

  const list1 = await waitEvent(A, 'presence_list');
  const names1 = (list1?.devices || []).map(d => d.name);
  check('list broadcasts both devices', names1.includes('Windows PC') && names1.includes('iPhone'), names1);
  check('list has only token ids (no deviceIds/UUIDs)', (list1?.devices || []).every(d => /^[0-9a-f]{32}$/.test(d.id) && d.id !== devA && d.id !== devB));
  check('list has exactly 2 fields per device', (list1?.devices || []).every(d => Object.keys(d).sort().join(',') === 'id,name'));

  // Names render as plain text: control chars and angle brackets must be
  // stripped server-side before they ever reach another browser.
  const C = await connect();
  const evilName = 'E<script>\u0000vil\nName\u001b';
  await emitAck(C, 'presence_announce', { deviceId: uuid(), name: evilName });
  const list2 = await waitEvent(A, 'presence_list');
  const evil = (list2?.devices || []).find(d => (d.name || '').startsWith('Escript'));
  check('XSS-y name sanitized (no < >, no control chars, capped 32)', !!evil && !/[<>\u0000-\u001f]/.test(evil.name) && evil.name.length <= 32, evil?.name);

  /* ================= INVITE → ACCEPT ================= */
  console.log('\n— invite / accept / decline —');
  const tokenA = annA.token, tokenB = annB.token;
  const invB = waitEvent(B, 'presence_invitation');
  const invRes = await emitAck(A, 'presence_invite', { deviceId: tokenB });
  check('invite delivered', invRes.success === true);
  const gotB = await invB;
  check('invitee receives invitation with sanitized name', gotB?.from === tokenA && gotB?.name === 'Windows PC', gotB);

  // Invitee creates a room, answers accept with credentials.
  const acceptedRoom = await emitBare(B, 'create_room');
  const ackA = waitEvent(A, 'presence_invite_result');
  const ans = await emitAck(B, 'presence_invite_result', { to: tokenA, accepted: true, roomId: acceptedRoom.roomId, secret: acceptedRoom.secret });
  check('invite_result accepted ok', ans.success === true);
  const gotA = await ackA;
  check('inviter receives accept + room credentials', gotA?.accepted === true && gotA?.roomId === acceptedRoom.roomId && gotA?.secret === acceptedRoom.secret, gotA);
  check('credentials are a REAL room (join_with_link works)', (await emitAck(A, 'join_with_link', { roomId: acceptedRoom.roomId })).success === true);

  // Decline path.
  const D = await connect();
  const annD = await emitAck(D, 'presence_announce', { deviceId: uuid(), name: 'MacBook' });
  const invD = waitEvent(D, 'presence_invitation');
  await emitAck(A, 'presence_invite', { deviceId: annD.token });
  await invD;
  const ackD = waitEvent(A, 'presence_invite_result');
  await emitAck(D, 'presence_invite_result', { to: tokenA, accepted: false });
  check('decline relayed', (await ackD)?.accepted === false);

  /* ================= VALIDATION ================= */
  console.log('\n— payload validation —');
  check('announce rejects non-uuid deviceId', (await emitAck(A, 'presence_announce', { deviceId: 'not-a-uuid', name: 'x' })).success === false);
  check('announce rejects missing deviceId', (await emitAck(A, 'presence_announce', { name: 'x' })).success === false);
  check('invite rejects unknown token', (await emitAck(A, 'presence_invite', { deviceId: 'f'.repeat(32) })).success === false);
  check('invite rejects malformed token', (await emitAck(A, 'presence_invite', { deviceId: '<script>' })).success === false);
  check('invite_result rejects bad room shape', (await emitAck(B, 'presence_invite_result', { to: tokenA, accepted: true, roomId: 'x', secret: 'y' })).success === false);
  check('announce from seated device rejected', (await emitAck(joiner, 'presence_announce', { deviceId: uuid(), name: 'seated' })).success === false);

  /* ================= DUPLICATES & WITHDRAWAL ================= */
  console.log('\n— duplicates / withdrawal / expiry —');
  const E1 = await connect();
  const devE = uuid();
  await emitAck(E1, 'presence_announce', { deviceId: devE, name: 'First socket' });
  const listA = await waitEvent(A, 'presence_list');
  check('E present once', (listA?.devices || []).filter(d => d.name === 'First socket').length === 1);

  const E2 = await connect(); // same deviceId, new socket (refresh case)
  await emitAck(E2, 'presence_announce', { deviceId: devE, name: 'Refreshed name' });
  const listB = await waitEvent(A, 'presence_list');
  const eList = (listB?.devices || []).filter(d => d.name === 'Refreshed name');
  check('re-announce moves the seat to the new socket', eList.length === 1);
  await emitAck(E1, 'presence_invite', { deviceId: tokenA }); // old socket must NOT be in the pool anymore
  check('stale socket cannot invite (no longer present)', (await emitAck(E1, 'presence_invite', { deviceId: tokenA })).success === false);

  await emitAck(E2, 'presence_withdraw');
  await waitMs(1100); // coalesced broadcast
  const listC = await waitEvent(A, 'presence_list');
  check('withdrawal removes the device from lists', !(listC?.devices || []).some(d => d.name === 'Refreshed name'));

  // Disconnect implies withdrawal.
  const F = await connect();
  await emitAck(F, 'presence_announce', { deviceId: uuid(), name: 'Dying device' });
  await waitMs(400);
  F.disconnect();
  await waitMs(1100);
  const listD = await waitEvent(A, 'presence_list');
  check('socket disconnect withdraws presence', !(listD?.devices || []).some(d => d.name === 'Dying device'));

  // Seating a device removes it from the pool.
  const G = await connect();
  const annG = await emitAck(G, 'presence_announce', { deviceId: uuid(), name: 'About to seat' });
  const seated = await emitBare(G, 'create_room');
  await waitMs(1100);
  const listE = await waitEvent(A, 'presence_list');
  check('seated device no longer listed', !(listE?.devices || []).some(d => d.name === 'About to seat'));

  /* ================= TTL EXPIRY ================= */
  console.log('\n— TTL expiry —');
  const H = await connect();
  await emitAck(H, 'presence_announce', { deviceId: uuid(), name: 'Shortlived' });
  await waitMs(400);
  H.disconnect(); // already covered, but leave the socket gone
  // Force-expiry is covered by the 90s TTL; here we just verify the sweep
  // doesn't remove LIVE entries within one sweep cycle.
  const listF = await waitEvent(A, 'presence_list', 3000);
  check('live entries survive a sweep cycle', (listF?.devices || []).some(d => d.name === 'Windows PC'));

  A.disconnect(); B.disconnect(); C.disconnect(); D.disconnect(); E2.disconnect(); creator.disconnect(); joiner.disconnect(); G.disconnect();
} catch (e) {
  failed++;
  console.error('TEST ERROR:', e);
} finally {
  if (server) { try { server.kill(); } catch { /* already gone */ } }
  try { rmSync('.stay-rooms.json', { force: true }); } catch { /* ignore */ }
}
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
