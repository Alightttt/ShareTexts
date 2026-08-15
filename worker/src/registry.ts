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
}
