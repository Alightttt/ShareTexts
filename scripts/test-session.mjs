import { io } from 'socket.io-client';

const URL = process.env.URL || 'http://localhost:52919';

async function createRoom() {
  return new Promise((resolve, reject) => {
    const socket = io(URL, { transports: ['websocket'] });
    const t = setTimeout(() => reject(new Error('timeout waiting for create_room ack')), 5000);
    socket.on('connect', () => {
      console.log('A connected, socket id:', socket.id);
      socket.emit('create_room', (res) => {
        clearTimeout(t);
        console.log('create_room response:', JSON.stringify(res));
        resolve({ socket, res });
      });
    });
    socket.on('connect_error', (e) => {
      clearTimeout(t);
      reject(new Error('connect_error: ' + e.message));
    });
  });
}

async function joinWithCode(creator, code) {
  return new Promise((resolve, reject) => {
    const socket = io(URL, { transports: ['websocket'] });
    const t = setTimeout(() => reject(new Error('timeout waiting for join ack')), 5000);
    socket.on('connect', () => {
      console.log('B connected, socket id:', socket.id);
      socket.emit('join_with_code', { code }, (res) => {
        clearTimeout(t);
        console.log('join_with_code response:', JSON.stringify(res));
        resolve({ socket, res });
      });
    });
    socket.on('connect_error', (e) => {
      clearTimeout(t);
      reject(new Error('connect_error: ' + e.message));
    });
  });
}

const { socket: creator, res: createRes } = await createRoom();
if (!createRes.success) throw new Error('Room creation failed: ' + JSON.stringify(createRes));

// Wait for TOTP code
const { TOTP, Secret } = await import('otpauth');
const totp = new TOTP({
  issuer: 'ShareText', label: 'Session', algorithm: 'SHA1', digits: 6, period: 30, secret: createRes.secret
});
const code = totp.generate();
console.log('Generated TOTP code:', code);

const { socket: joiner, res: joinRes } = await joinWithCode(creator, code);
console.log('Join result:', joinRes.success ? 'SUCCESS' : 'FAILED');

// Wait a moment for peer_joined to fire on creator
await new Promise(r => setTimeout(r, 500));
creator.close();
joiner.close();
console.log('DONE');
process.exit(0);
