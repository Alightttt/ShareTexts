/** Environment bindings available to every Worker entry / Durable Object. */
export interface Env {
  ROOMS: DurableObjectNamespace;
  REGISTRY: DurableObjectNamespace;
  METRICS: DurableObjectNamespace;
  STATS: DurableObjectNamespace;
  /** Landing-page presence pool (nearby-device discovery). */
  LOBBY: DurableObjectNamespace;
  /** Temporary Space content storage (F14). Bound when the feature deploys;
   *  space.ts degrades honestly (503) when the binding is absent. */
  SPACE_BUCKET?: R2Bucket;
  /** Web Push (VAPID) for space-closure reminders. Absent → the Space DO
   *  skips push quietly and clients keep their in-app countdown. */
  VAPID_PUBLIC_KEY?: string;
  VAPID_PRIVATE_KEY?: string;
  VAPID_SUBJECT?: string;
  /** Test-only injectable clock switch (never set in production). */
  SPACE_TEST_CLOCK?: string;
  /** Comma-separated extra frontend origins allowed to connect. */
  ALLOWED_ORIGINS?: string;
  /** If set, GET /metrics requires `Authorization: Bearer <token>`. */
  METRICS_TOKEN?: string;
}

/** Day key used to shard the Registry — rooms live < 24h so entries never
 *  outlive their shard; lookups check today + yesterday for the TOTP ±window. */
export function dayKey(now: number = Date.now()): string {
  return new Date(now).toISOString().slice(0, 10);
}

export function json(data: unknown, status = 200, extraHeaders: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json', ...extraHeaders },
  });
}
