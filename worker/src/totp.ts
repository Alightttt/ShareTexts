/**
 * RFC 6238 TOTP implemented on Web Crypto — no dependencies, so it runs on
 * Cloudflare Workers. Must match the client's `otpauth` settings exactly:
 * HMAC-SHA1, 6 digits, 90s period, validation window ±2 steps.
 *
 * The counter is anchored to the room's creation time (epoch), so a code
 * window is [createdAt + N·40s, createdAt + (N+1)·40s) instead of a wall-
 * clock boundary — the creator always sees a full 40s on first visit and
 * both devices always agree on the current code.
 */

/** Seconds per code window. Must equal TOTP_PERIOD in src/lib/totp.ts. */
export const TOTP_PERIOD = 90;

const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

/** RFC 4648 base32 decode; case-insensitive, tolerates padding/whitespace. */
export function base32Decode(input: string): Uint8Array {
  const clean = input.toUpperCase().replace(/[^A-Z2-7]/g, '');
  const out: number[] = [];
  let bits = 0;
  let value = 0;
  for (const ch of clean) {
    const idx = B32.indexOf(ch);
    if (idx < 0) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return new Uint8Array(out);
}

/** RFC 4648 base32 encode (uppercase, unpadded) — matches what otpauth decodes. */
export function base32Encode(bytes: Uint8Array): string {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += B32[(value >>> (bits - 5)) & 0x1f];
      bits -= 5;
    }
  }
  if (bits > 0) {
    out += B32[(value << (5 - bits)) & 0x1f];
  }
  return out;
}

async function hmacSha1(key: Uint8Array, msg: Uint8Array): Promise<Uint8Array> {
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    key,
    { name: 'HMAC', hash: 'SHA-1' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', cryptoKey, msg);
  return new Uint8Array(sig);
}

/** TOTP code for an arbitrary 64-bit counter (exact below 2^53 — fine for centuries). */
export async function totpAt(secret: string, counter: number): Promise<string> {
  const key = base32Decode(secret);
  const msg = new Uint8Array(8);
  let c = Math.floor(counter);
  for (let i = 7; i >= 0; i--) {
    msg[i] = c & 0xff;
    c = Math.floor(c / 256);
  }
  const h = await hmacSha1(key, msg);
  const offset = h[h.length - 1] & 0x0f;
  const bin =
    ((h[offset] & 0x7f) << 24) |
    ((h[offset + 1] & 0xff) << 16) |
    ((h[offset + 2] & 0xff) << 8) |
    (h[offset + 3] & 0xff);
  return String(bin % 1_000_000).padStart(6, '0');
}

export async function generateTOTP(secret: string, epoch = 0): Promise<string> {
  return totpAt(secret, Math.floor((Date.now() - epoch) / 1000 / TOTP_PERIOD));
}

/** Validate a code within ±`window` steps of the current counter. */
export async function validateTOTP(secret: string, code: string, epoch = 0, window = 2): Promise<boolean> {
  if (typeof code !== 'string' || !/^\d{6}$/.test(code)) return false;
  const cur = Math.floor((Date.now() - epoch) / 1000 / TOTP_PERIOD);
  for (let d = -window; d <= window; d++) {
    if ((await totpAt(secret, cur + d)) === code) return true;
  }
  return false;
}
