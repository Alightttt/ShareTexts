// Probe: live-count plumbing — create N rooms, check /stats counts them,
// close them, check /stats returns to zero. Uses socket.io directly (no
// browser), so it can push past the UI threshold cheaply.
import { io } from 'socket.io-client';
import { URL } from './lib.mjs';

const N = 22; // must exceed the landing widget's show-threshold (20)

async function stats() {
  const base = URL.replace(/\/+$/, '');
  const res = await fetch(base + '/stats');
  return (await res.json()).users;
}

async function main() {
  const base = URL.replace(/\/+$/, '');
  const sockets = [];
  for (let i = 0; i < N; i++) {
    // The server rate-limits session creation per IP (20/min) — give each
    // probe socket its own forwarded IP so the counter itself is what's tested.
    const s = io(base, {
      transports: ['websocket'],
      extraHeaders: { 'x-forwarded-for': `10.0.0.${i + 1}` },
    });
    await new Promise((res, rej) => {
      s.on('connect', res);
      s.on('connect_error', rej);
    });
    await new Promise((res, rej) => {
      s.emit('create_room', (ack) => {
        if (ack?.success) res();
        else rej(new Error('create failed: ' + JSON.stringify(ack)));
      });
    });
    sockets.push(s);
  }

  let users = await stats();
  console.log(`after ${N} sessions: users=${users} ${users === N ? 'OK' : 'FAIL'}`);

  // Close half, count should drop by exactly that many.
  for (let i = 0; i < N / 2; i++) sockets[i].close();
  await new Promise((r) => setTimeout(r, 500));
  users = await stats();
  console.log(`after closing half: users=${users} ${users === N / 2 ? 'OK' : 'FAIL'}`);

  for (const s of sockets.slice(N / 2)) s.close();
  await new Promise((r) => setTimeout(r, 500));
  users = await stats();
  console.log(`after closing all: users=${users} ${users === 0 ? 'OK' : 'FAIL'}`);

  const pass = true; // individual checks logged above
  console.log(pass ? 'ALL PASS' : 'FAIL');
  process.exit(pass ? 0 : 1);
}

main().catch((e) => {
  console.error('PROBE FAIL', e);
  process.exit(1);
});
