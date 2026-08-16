import { DurableObject } from 'cloudflare:workers';
import { validateTOTP } from './totp';
import { json, type Env } from './types';

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

/**
 * Maps roomId → {secret, expiresAt} so a 6-digit TOTP code can locate the
 * room's Durable Object without scanning every room. One instance per UTC day:
 * rooms never outlive a day (12h TTL < 24h), so entries self-expire with the
 * shard. Stale entries are also swept opportunistically during lookup.
 *
 * The Registry holds pairing secrets — the same trust domain as today's Node
 * server (which keeps every room secret in memory). It never sees message
 * contents: the relay path carries only client-side AES-GCM ciphertext.
 */
export class Registry extends DurableObject<Env> {
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
    return json({ error: 'not found' }, 404);
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
}
