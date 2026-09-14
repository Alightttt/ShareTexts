import { DurableObject } from 'cloudflare:workers';
import { json, type Env } from './types';

const BUCKET_MS = 60 * 60 * 1000; // hourly buckets
const KEEP_BUCKETS = 48;          // 48 hours of history
/** Durable storage key holding the LIFETIME rooms-created counter. Buckets
 *  roll off after 48h; the landing page's "rooms made" tracker must never
 *  shrink, so the count lives on its own storage key instead. */
const LIFETIME_ROOMS_KEY = 'lifetime:rooms.created';

/**
 * Metrics — anonymous aggregate counters for operating the service.
 *
 * Deliberately boring by design:
 *   - Events are single metric-name strings (e.g. "rooms.created",
 *     "joins.failed:room_full"). There is no payload: no room ids, no codes,
 *     no secrets, no contents, no IPs, no user agents.
 *   - Counts live in hourly buckets, retained 48 hours, then dropped.
 *   - The aggregate snapshot (GET /) is what operators read; it reveals only
 *     volumes, never individuals.
 * Room Durable Objects fire events via a best-effort helper that no-ops when
 * the binding is absent (e.g. the emulator test harness).
 */
export class Metrics extends DurableObject<Env> {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === '/event' && request.method === 'POST') {
      return this.event(request);
    }
    if (url.pathname === '/' || url.pathname === '/metrics') {
      return this.snapshot();
    }
    return json({ error: 'not found' }, 404);
  }

  private async event(request: Request): Promise<Response> {
    let body: { name?: unknown };
    try {
      body = (await request.json()) as typeof body;
    } catch {
      return json({ error: 'bad request' }, 400);
    }
    const name = body?.name;
    if (typeof name !== 'string' || !/^[a-z0-9_.:-]{1,80}$/.test(name)) {
      return json({ error: 'bad request' }, 400);
    }
    const bucket = Math.floor(Date.now() / BUCKET_MS);
    const key = 'h:' + bucket;
    const counts = (await this.ctx.storage.get<Record<string, number>>(key)) ?? {};
    counts[name] = (counts[name] ?? 0) + 1;
    await this.ctx.storage.put(key, counts);

    // Lifetime counters for metrics that must never roll off with the 48h
    // buckets (currently: total rooms ever created). Guarded to the known
    // name so nothing unbounded can grow here.
    if (name === 'rooms.created') {
      const lifetime = (await this.ctx.storage.get<number>(LIFETIME_ROOMS_KEY)) ?? 0;
      await this.ctx.storage.put(LIFETIME_ROOMS_KEY, lifetime + 1);
    }

    // Opportunistic trim: drop buckets older than the retention window.
    const all = await this.ctx.storage.list({ prefix: 'h:' });
    const cutoff = bucket - KEEP_BUCKETS;
    for (const [k] of all) {
      const b = Number(k.slice(2));
      if (!Number.isFinite(b) || b < cutoff) await this.ctx.storage.delete(k);
    }
    return json({ ok: true });
  }

  private async snapshot(): Promise<Response> {
    const buckets = await this.ctx.storage.list<Record<string, number>>({ prefix: 'h:' });
    const totals: Record<string, number> = {};
    const byHour: Record<string, Record<string, number>> = {};
    for (const [k, counts] of buckets) {
      const bucket = Number(k.slice(2));
      const hour = new Date(bucket * BUCKET_MS).toISOString();
      byHour[hour] = counts;
      for (const [m, c] of Object.entries(counts)) {
        totals[m] = (totals[m] ?? 0) + c;
      }
    }
    // Lifetime counters ride alongside the rolling-window totals; /stats
    // reads roomsCreated from here so the number only ever grows.
    const lifetimeRooms = (await this.ctx.storage.get<number>(LIFETIME_ROOMS_KEY)) ?? 0;
    if (lifetimeRooms > (totals['rooms.created'] ?? 0)) totals['rooms.created'] = lifetimeRooms;
    return json({
      service: 'sharetext-signaling-cf',
      generated_at: new Date().toISOString(),
      retention_hours: KEEP_BUCKETS,
      totals,
      lifetime_rooms_created: lifetimeRooms,
      by_hour: byHour,
    });
  }
}
