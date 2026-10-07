import { DurableObject } from 'cloudflare:workers';
import { validateTOTP } from './totp';
import { json, type Env } from './types';
import { normalizeSpaceCode, isValidSpaceCode, generateSpaceCode } from './spaceCode';

interface RegistryEntry {
  secret: string;
  /** Anchors the pairing-code window (40s from room creation). */
  createdAt: number;
  expiresAt: number;
}

/**
 * A stable short code for share links: the room's UUID with dashes removed,
 * truncated to 8 chars. Stable for the room's whole life (vs the 6-digit
 * TOTP pairing code, which rotates every 40s), so /s/<code> links keep
 * working long enough to be opened from a chat message.
 */
export function shortCodeOf(roomId: string): string {
  return roomId.replace(/-/g, '').slice(0, 8).toLowerCase();
}

export const SHORT_CODE_RE = /^[0-9a-f]{8}$/;

async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Maps roomId → {secret, expiresAt} so a 6-digit TOTP code can locate the
 * room's Durable Object without scanning every room. One instance per UTC day:
 * rooms never outlive a day (12h TTL < 24h), so entries self-expire with the
 * shard. Stale entries are also swept opportunistically during lookup.
 *
 * The Registry holds pairing secrets — the same trust domain as today's Node
 * server (which keeps every room secret in memory). It never sees message
 * contents: the relay path carries only client-side AES-GCM ciphertext.
 *
 * It also owns edge-side abuse protection: per-IP sliding-window counters for
 * pairing attempts and signaling. In-memory is fine — the Registry is a
 * singleton, and a reset on migration only lets a few extra attempts through.
 */
interface RateBucket {
  count: number;
  windowStart: number;
}

// Documented limits (per IP per window):
//   lookup / resolve-short: 20 / 60s  — a real user does 1–3 lookups
//   push:                    30 / 60s  — agent pushes are bearer-authenticated
//   ws:                      30 / 60s  — one session is 1–2 connections
//   space:                   40 / 60s  — create/join/uploads for a handful of spaces
const RATE_LIMITS: Record<string, { limit: number; windowMs: number }> = {
  lookup: { limit: 20, windowMs: 60_000 },
  'resolve-short': { limit: 20, windowMs: 60_000 },
  push: { limit: 30, windowMs: 60_000 },
  ws: { limit: 30, windowMs: 60_000 },
  space: { limit: 40, windowMs: 60_000 },
  'space-code': { limit: 30, windowMs: 60_000 }, // code checks + join-by-code
};

export class Registry extends DurableObject<Env> {
  private rateBuckets = new Map<string, RateBucket>();

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === '/register' && request.method === 'POST') {
      return this.register(request);
    }
    if (url.pathname === '/lookup' && request.method === 'POST') {
      return this.lookup(request);
    }
    if (url.pathname === '/resolve-short' && request.method === 'POST') {
      return this.resolveShort(request);
    }
    if (url.pathname === '/rate-check' && request.method === 'POST') {
      return this.rateCheck(request);
    }
    // ── Space-code index (F21) ────────────────────────────────────────
    // Runs on the dedicated singleton instance (idFromName('space-codes'));
    // see index.ts for the public endpoints that call these.
    if (url.pathname === '/space-code/register' && request.method === 'POST') {
      return this.spaceCodeRegister(request);
    }
    if (url.pathname === '/space-code/check' && request.method === 'GET') {
      return this.spaceCodeCheck(url);
    }
    if (url.pathname === '/space-code/lookup' && request.method === 'POST') {
      return this.spaceCodeLookup(request);
    }
    if (url.pathname === '/space-code/unregister' && request.method === 'POST') {
      return this.spaceCodeUnregister(request);
    }
    return json({ error: 'not found' }, 404);
  }

  /** Bounded per-IP sliding window: returns ok=false once the limit is hit. */
  private async rateCheck(request: Request): Promise<Response> {
    let body: { ip?: string; scope?: string };
    try {
      body = (await request.json()) as typeof body;
    } catch {
      return json({ error: 'bad request' }, 400);
    }
    if (!body.ip || !body.scope) return json({ error: 'bad request' }, 400);
    const cfg = RATE_LIMITS[body.scope];
    if (!cfg) return json({ error: 'bad request' }, 400);
    const key = body.scope + ':' + body.ip;
    const now = Date.now();
    const bucket = this.rateBuckets.get(key);
    if (!bucket || now - bucket.windowStart >= cfg.windowMs) {
      this.rateBuckets.set(key, { count: 1, windowStart: now });
      return json({ ok: true });
    }
    if (bucket.count >= cfg.limit) return json({ ok: false });
    bucket.count++;
    return json({ ok: true });
  }

  private async register(request: Request): Promise<Response> {
    let body: { roomId?: string; secret?: string; createdAt?: number; expiresAt?: number };
    try {
      body = (await request.json()) as typeof body;
    } catch {
      return json({ error: 'bad request' }, 400);
    }
    if (!body.roomId || !body.secret || typeof body.expiresAt !== 'number') {
      return json({ error: 'bad request' }, 400);
    }
    await this.ctx.storage.put('room:' + body.roomId, {
      secret: body.secret,
      createdAt: typeof body.createdAt === 'number' ? body.createdAt : Date.now(),
      expiresAt: body.expiresAt,
    } satisfies RegistryEntry);
    // A stable short-code alias so /s/<code> share links resolve to the room.
    await this.ctx.storage.put('short:' + shortCodeOf(body.roomId), {
      roomId: body.roomId,
      expiresAt: body.expiresAt,
    });
    return json({ ok: true });
  }

  private async lookup(request: Request): Promise<Response> {
    let body: { code?: string };
    try {
      body = (await request.json()) as typeof body;
    } catch {
      return json({ error: 'Invalid or expired code' }, 404);
    }
    if (!body.code || !/^\d{6}$/.test(body.code)) {
      return json({ error: 'Invalid or expired code' }, 404);
    }
    const now = Date.now();
    const entries = await this.ctx.storage.list<RegistryEntry>({ prefix: 'room:' });
    for (const [key, entry] of entries) {
      if (entry.expiresAt < now) {
        await this.ctx.storage.delete(key); // sweep stale entries
        continue;
      }
      if (await validateTOTP(entry.secret, body.code, entry.createdAt)) {
        return json({ roomId: key.slice('room:'.length) });
      }
    }
    return json({ error: 'Invalid or expired code' }, 404);
  }

  private async resolveShort(request: Request): Promise<Response> {
    let body: { code?: string };
    try {
      body = (await request.json()) as typeof body;
    } catch {
      return json({ error: 'Invalid link' }, 404);
    }
    if (!body.code || !SHORT_CODE_RE.test(body.code)) {
      return json({ error: 'Invalid link' }, 404);
    }
    const entry = await this.ctx.storage.get<{ roomId: string; expiresAt: number }>('short:' + body.code.toLowerCase());
    if (!entry || entry.expiresAt < Date.now()) {
      return json({ error: 'Invalid link' }, 404);
    }
    // Hand back the full credentials so the joiner can go straight to the
    // room's WebSocket — same trust model as a valid 6-digit code.
    const roomEntry = await this.ctx.storage.get<RegistryEntry>('room:' + entry.roomId);
    if (!roomEntry) return json({ error: 'Invalid link' }, 404);
    return json({
      roomId: entry.roomId,
      secret: roomEntry.secret,
      createdAt: roomEntry.createdAt,
    });
  }

  // ── Space-code index (F21) ────────────────────────────────────────────
  // Keyed by sha256(normalizedCode) — the plaintext code is never stored.
  // Entries carry the space's absolute expiresAt so stale codes self-sweep
  // during lookups. Registered by the Space DO at create; removed by the DO
  // at expiry/close AND lazily swept here.

  private async spaceCodeRegister(request: Request): Promise<Response> {
    let body: { code?: string; spaceId?: string; expiresAt?: number };
    try { body = (await request.json()) as typeof body; } catch { return json({ error: 'bad request' }, 400); }
    if (!body.code || !body.spaceId || typeof body.expiresAt !== 'number') return json({ error: 'bad request' }, 400);
    const code = normalizeSpaceCode(body.code);
    if (!isValidSpaceCode(code)) return json({ error: 'bad request' }, 400);
    const key = 'scode:' + (await sha256Hex(code));
    const existing = await this.ctx.storage.get<{ spaceId: string; expiresAt: number }>(key);
    const now = Date.now();
    if (existing && existing.expiresAt > now && existing.spaceId !== body.spaceId) {
      return json({ ok: false, suggestion: generateSpaceCode() }); // collision — never overwrite
    }
    await this.ctx.storage.put(key, { spaceId: body.spaceId, expiresAt: body.expiresAt });
    return json({ ok: true });
  }

  private async spaceCodeCheck(url: URL): Promise<Response> {
    const code = normalizeSpaceCode(url.searchParams.get('code') || '');
    if (!isValidSpaceCode(code)) return json({ available: false, reason: 'invalid' });
    const entry = await this.ctx.storage.get<{ spaceId: string; expiresAt: number }>('scode:' + (await sha256Hex(code)));
    const taken = !!entry && entry.expiresAt > Date.now();
    return json({ available: !taken, suggestion: taken ? generateSpaceCode() : undefined });
  }

  private async spaceCodeLookup(request: Request): Promise<Response> {
    let body: { code?: string };
    try { body = (await request.json()) as typeof body; } catch { return json({ error: 'bad request' }, 400); }
    const code = normalizeSpaceCode(typeof body.code === 'string' ? body.code : '');
    if (!isValidSpaceCode(code)) return json({ error: 'not found' }, 404);
    const key = 'scode:' + (await sha256Hex(code));
    const entry = await this.ctx.storage.get<{ spaceId: string; expiresAt: number }>(key);
    if (!entry) return json({ error: 'not found' }, 404);
    if (entry.expiresAt < Date.now()) {
      await this.ctx.storage.delete(key); // lazy sweep
      return json({ error: 'not found' }, 404);
    }
    return json({ spaceId: entry.spaceId });
  }

  private async spaceCodeUnregister(request: Request): Promise<Response> {
    let body: { code?: string };
    try { body = (await request.json()) as typeof body; } catch { return json({ error: 'bad request' }, 400); }
    if (typeof body.code !== 'string') return json({ error: 'bad request' }, 400);
    await this.ctx.storage.delete('scode:' + (await sha256Hex(normalizeSpaceCode(body.code))));
    return json({ ok: true });
  }
}
