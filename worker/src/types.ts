/** Environment bindings available to every Worker entry / Durable Object. */
export interface Env {
  ROOMS: DurableObjectNamespace;
  REGISTRY: DurableObjectNamespace;
  METRICS: DurableObjectNamespace;
  STATS: DurableObjectNamespace;
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
