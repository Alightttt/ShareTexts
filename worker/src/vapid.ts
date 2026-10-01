/**
 * Web Push for Temporary Space reminders — the full RFC 8291 stack in ~100
 * lines of WebCrypto: an ES256 VAPID JWT (RFC 8292) plus an aes128gcm
 * encrypted payload per subscription. Payloads are deliberately generic
 * ("your space closes soon") — never filenames or content.
 *
 * The VAPID key pair is an operator secret (env): VAPID_PUBLIC_KEY (raw P-256
 * point, base64url), VAPID_PRIVATE_KEY (PKCS8, base64url), VAPID_SUBJECT
 * (mailto: or https: contact). When any is missing, the Space DO skips push
 * quietly and clients keep their in-app countdown (see fallback).
 */

import type { Env } from './types';

interface PushSub { endpoint: string; p256dh: string; auth: string; }

function b64urlDecode(s: string): Uint8Array {
  const pad = s.length % 4 === 0 ? '' : '='.repeat(4 - (s.length % 4));
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/') + pad);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function b64urlEncode(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function concat(...parts: Uint8Array[]): Uint8Array {
  const len = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(len);
  let at = 0;
  for (const p of parts) { out.set(p, at); at += p.length; }
  return out;
}

function be32(n: number): Uint8Array {
  return new Uint8Array([(n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff]);
}

function be16(n: number): Uint8Array {
  return new Uint8Array([(n >>> 8) & 0xff, n & 0xff]);
}

/** RFC 8292 VAPID JWT, signed ES256 with the operator's private key. */
async function vapidJwt(env: Env, audience: string): Promise<string> {
  const priv = b64urlDecode(env.VAPID_PRIVATE_KEY!);
  const key = await crypto.subtle.importKey('pkcs8', priv as unknown as BufferSource, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const exp = Math.floor(Date.now() / 1000) + 12 * 3600;
  const header = b64urlEncode(new TextEncoder().encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const claims = b64urlEncode(new TextEncoder().encode(JSON.stringify({ aud: audience, exp, sub: env.VAPID_SUBJECT })));
  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, new TextEncoder().encode(`${header}.${claims}`));
  return `${header}.${claims}.${b64urlEncode(new Uint8Array(sig))}`;
}

/**
 * Encrypt a small JSON payload for one subscription (aes128gcm, one record —
 * payloads are ~120 bytes, far below the 4096-byte record size).
 */
async function encryptPayload(sub: PushSub, payload: string): Promise<Uint8Array> {
  const uaPub = b64urlDecode(sub.p256dh);
  const auth = b64urlDecode(sub.auth);
  if (uaPub.length !== 65 || uaPub[0] !== 0x04) throw new Error('bad p256dh key');

  // Server ephemeral ECDH key pair on P-256. (Casts: the workers-types
  // ECDH overloads mis-describe deriveBits/exportKey for this shape; the
  // runtime is standard WebCrypto ECDH.)
  const subtle = crypto.subtle as unknown as {
    generateKey(alg: object, extractable: boolean, uses: string[]): Promise<CryptoKeyPair>;
    exportKey(fmt: string, key: CryptoKey): Promise<ArrayBuffer>;
    importKey(fmt: string, data: BufferSource, alg: object, extractable: boolean, uses: string[]): Promise<CryptoKey>;
    deriveBits(alg: object, key: CryptoKey, length: number): Promise<ArrayBuffer>;
  };
  const alg = { name: 'ECDH', namedCurve: 'P-256' };
  const keys = await subtle.generateKey(alg, true, ['deriveBits']);
  const asPubRaw = new Uint8Array(await subtle.exportKey('raw', keys.publicKey));
  const uaKey = await subtle.importKey('raw', uaPub as unknown as BufferSource, alg, false, []);

  // Shared secret → HKDF (salt = auth secret) → CEK (16B) + nonce (first 12B).
  const shared = new Uint8Array(await subtle.deriveBits(
    { name: 'ECDH', public: uaKey },
    keys.privateKey,
    256,
  ));
  const info = concat(new TextEncoder().encode('WebPush: info'), new Uint8Array([0]), uaPub, asPubRaw);
  const keymat = await crypto.subtle.importKey('raw', shared as unknown as BufferSource, 'HKDF', false, ['deriveBits']);
  const okm = new Uint8Array(await crypto.subtle.deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt: auth as unknown as BufferSource, info: info as unknown as BufferSource },
    keymat,
    128,
  ));
  const cek = okm.slice(0, 16);
  const nonce = okm.slice(0, 12);

  // Record: 2-byte padding length + payload. Record size 4096; header 21 bytes.
  const rs = 4096;
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const header = concat(salt, be32(rs), new Uint8Array([0])); // idlen 0 → no key id
  const payloadBytes = new TextEncoder().encode(payload);
  if (payloadBytes.length + 2 + 16 > rs) throw new Error('payload too large for one record');
  const plaintext = concat(be16(payloadBytes.length), payloadBytes);

  const encKey = await crypto.subtle.importKey('raw', cek as unknown as BufferSource, 'AES-GCM', false, ['encrypt']);
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: nonce as unknown as BufferSource, additionalData: header as unknown as BufferSource, tagLength: 128 },
    encKey,
    plaintext as unknown as BufferSource,
  ));
  return concat(header, ciphertext);
}

/** Send one reminder push. Throws on non-2xx so the caller can prune dead subs. */
export async function sendSpaceReminderPush(env: Env, sub: PushSub, payload: { title: string; body: string }): Promise<void> {
  const jwt = await vapidJwt(env, new URL(sub.endpoint).origin);
  const pub = env.VAPID_PUBLIC_KEY!;
  const body = await encryptPayload(sub, JSON.stringify(payload));
  const res = await fetch(sub.endpoint, {
    method: 'POST',
    headers: {
      'content-type': 'application/octet-stream',
      'content-encoding': 'aes128gcm',
      'content-length': String(body.length),
      'ttl': '0', // one-shot delivery message
      'urgency': 'normal',
      'authorization': `vapid t=${jwt}, k=${pub}`,
    },
    body: body as unknown as BodyInit,
  });
  if (!res.ok) throw new Error(`push endpoint ${res.status}`);
}
