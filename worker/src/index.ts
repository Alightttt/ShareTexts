import { Room, UUID_RE } from './room';
import { Registry } from './registry';
import { Metrics } from './metrics';
import { Stats } from './stats';
import { json, dayKey, type Env } from './types';

// Durable Object classes must be exported from the entrypoint.
export { Room };
export { Registry };
export { Metrics };
export { Stats };

/**
 * ShareText signaling — Cloudflare Workers entry.
 *
 *   GET  /health          → {"ok":true,"service":"sharetext-signaling-cf"}
 *   GET  /ws?room=&cid=   → WebSocket upgrade, routed to the room's Durable Object
 *   POST /lookup {code}   → resolves a 6-digit code to a roomId (Registry DO)
 *
 * Origin policy: browsers must come from an allowlisted frontend (dev origins +
 * the Vercel app + anything in ALLOWED_ORIGINS). WebSocket handshakes and the
 * /lookup POST both enforce it.
 */

const DEFAULT_ALLOWED_ORIGINS = [
  'http://localhost:3000',
  'http://localhost:3311',
  'http://127.0.0.1:3000',
  'http://127.0.0.1:3311',
  'https://share-texts.vercel.app',
];

function allowedOrigins(env: Env): Set<string> {
  return new Set([
    ...DEFAULT_ALLOWED_ORIGINS,
    ...(env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean),
  ]);
}

/**
 * CORS for the browser frontend. WebSockets are not subject to CORS, but the
 * code-join flow needs a cross-origin POST to /lookup, which the browser gates
 * behind a preflight. The worker's origin policy stays strict: we only reflect
 * an Origin that is on the allowlist — never `*`. Non-browser clients (no
 * Origin header) get no CORS headers and are allowed through as before.
 */
function corsHeaders(origin: string | null, allowlist: Set<string>): Record<string, string> {
  if (!origin) return {};
  if (!allowlist.has(origin)) return {};
  return {
    'Access-Control-Allow-Origin': origin,
    'Vary': 'Origin',
  };
}

function originAllowed(request: Request, env: Env): boolean {
  const origin = request.headers.get('Origin');
  if (!origin) return true; // non-browser clients (curl, agents, Node tests)
  return allowedOrigins(env).has(origin);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;
    const origin = request.headers.get('Origin');
    const allowlist = allowedOrigins(env);
    const cors = corsHeaders(origin, allowlist);

    // CORS preflight (browser sends this before POST /lookup).
    if (request.method === 'OPTIONS') {
      if (origin && !allowlist.has(origin)) {
        return json({ error: 'Origin not allowed' }, 403);
      }
      return new Response(null, {
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': origin || '*',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'content-type',
          'Access-Control-Max-Age': '86400',
          'Vary': 'Origin',
        },
      });
    }

    if (path === '/health') {
      return json({ ok: true, service: 'sharetext-signaling-cf' }, 200, cors);
    }

    if (!originAllowed(request, env)) {
      // Reflect the requesting origin here (even though it's not allowlisted)
      // so the browser can read the status and the client can tell the user
      // "your site's origin isn't allowlisted" instead of a generic timeout.
      return json({ error: 'Origin not allowed' }, 403, origin ? {
        'Access-Control-Allow-Origin': origin,
        'Vary': 'Origin',
      } : {});
    }

    if (path === '/ws') {
      const roomId = url.searchParams.get('room');
      const cid = url.searchParams.get('cid');
      if (!roomId || !UUID_RE.test(roomId)) return json({ error: 'invalid room' }, 400, cors);
      if (!cid || !UUID_RE.test(cid)) return json({ error: 'invalid connection id' }, 400, cors);
      const id = env.ROOMS.idFromName(roomId);
      return env.ROOMS.get(id).fetch(request);
    }

    if (path === '/lookup' && request.method === 'POST') {
      return lookup(request, env, cors);
    }

    if (path === '/metrics') {
      // Anonymous aggregate counters (see metrics.ts). Optional bearer gate so
      // operators can keep volumes private if they want to.
      const token = env.METRICS_TOKEN;
      if (token && request.headers.get('authorization') !== 'Bearer ' + token) {
        return json({ error: 'unauthorized' }, 401, cors);
      }
      const stub = env.METRICS.get(env.METRICS.idFromName('metrics'));
      const res = await stub.fetch(new Request('https://internal/metrics'));
      return new Response(res.body, {
        status: res.status,
        headers: { 'content-type': 'application/json', ...cors },
      });
    }

    if (path === '/stats') {
      // Live seated-device count for the landing-page social-proof widget
      // (see stats.ts). Public by design — it reveals one aggregate number.
      const stub = env.STATS.get(env.STATS.idFromName('stats'));
      const res = await stub.fetch(new Request('https://internal/stats'));
      return new Response(res.body, {
        status: res.status,
        headers: { 'content-type': 'application/json', ...cors },
      });
    }

    return json({
      name: 'sharetext-signaling',
      endpoints: ['/health', '/ws', '/lookup'],
    }, 200, cors);
  },
} satisfies ExportedHandler<Env>;

/** Resolve a 6-digit code → roomId via the day-sharded Registry. */
async function lookup(request: Request, env: Env, cors: Record<string, string>): Promise<Response> {
  let body: { code?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return json({ error: 'Invalid or expired code' }, 404, cors);
  }
  if (typeof body.code !== 'string' || !/^\d{6}$/.test(body.code)) {
    return json({ error: 'Invalid or expired code' }, 404, cors);
  }
  const days = new Set([dayKey(), dayKey(Date.now() - 24 * 60 * 60 * 1000)]);
  for (const day of days) {
    const stub = env.REGISTRY.get(env.REGISTRY.idFromName('registry-' + day));
    const res = await stub.fetch(
      new Request('https://internal/lookup', {
        method: 'POST',
        body: JSON.stringify({ code: body.code }),
      })
    );
    if (res.status === 200) {
      const found = (await res.json()) as { roomId?: string };
      if (found.roomId) return json({ roomId: found.roomId }, 200, cors);
    }
  }
  return json({ error: 'Invalid or expired code' }, 404, cors);
}
