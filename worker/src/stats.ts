import { DurableObject } from 'cloudflare:workers';
import { json, type Env } from './types';

/**
 * Stats — an approximate live count of seated devices ("N people using").
 *
 * Rooms report their current seated-peer count (an absolute value, keyed by
 * room) after every seat/leave transition, so the counter self-heals: a
 * missed or duplicate event never drifts permanently, because the next event
 * for that room rewrites its true value. `users` is the running sum.
 *
 * This powers a public social-proof widget on the landing page — it reveals
 * only a single aggregate number, never room ids, codes, contents, or IPs.
 * The number is deliberately approximate: it is best-effort per event, and a
 * crashed/evicted DO restarts from zero.
 */
export class Stats extends DurableObject<Env> {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === '/event' && request.method === 'POST') {
      return this.event(request);
    }
    if (url.pathname === '/' || url.pathname === '/stats') {
      const users = (await this.ctx.storage.get<number>('users')) ?? 0;
      return json({
        service: 'sharetext-signaling-cf',
        users,
        updated_at: new Date().toISOString(),
        note: 'approximate live count of seated devices',
      });
    }
    return json({ error: 'not found' }, 404);
  }

  private async event(request: Request): Promise<Response> {
    let body: { roomId?: unknown; count?: unknown };
    try {
      body = (await request.json()) as typeof body;
    } catch {
      return json({ error: 'bad request' }, 400);
    }
    if (typeof body.roomId !== 'string' || typeof body.count !== 'number' || !Number.isInteger(body.count) || body.count < 0) {
      return json({ error: 'bad request' }, 400);
    }
    const key = 'room:' + body.roomId;
    const prev = (await this.ctx.storage.get<number>(key)) ?? 0;
    let users = (await this.ctx.storage.get<number>('users')) ?? 0;
    if (body.count === 0) {
      if (prev > 0) {
        await this.ctx.storage.delete(key);
        await this.ctx.storage.put('users', Math.max(0, users - prev));
      }
    } else if (body.count !== prev) {
      await this.ctx.storage.put(key, body.count);
      await this.ctx.storage.put('users', Math.max(0, users - prev + body.count));
    }
    return json({ ok: true });
  }
}
