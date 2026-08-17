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
      if (!(await rateLimited(env, 'ws', clientIp(request)))) {
        return json({ error: 'Too many attempts. Wait a moment and try again.' }, 429, cors);
      }
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

    if (path === '/resolve-short' && request.method === 'POST') {
      return resolveShort(request, env, cors);
    }

    if (path === '/api/push' && request.method === 'POST') {
      return push(request, env, cors);
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
      endpoints: ['/health', '/ws', '/lookup', '/resolve-short', '/api/push'],
    }, 200, cors);
  },
} satisfies ExportedHandler<Env>;

/**
 * Agent push API — a script or AI agent pushes text (or a small file) into a
 * room using the room secret as a bearer credential. Canonicalizes JSON and
 * raw-binary bodies into one internal JSON request to the room's Durable
 * Object, which validates the secret and fans the message out to every seated
 * device (see Room.handlePush).
 */
async function push(request: Request, env: Env, cors: Record<string, string>): Promise<Response> {
  if (!(await rateLimited(env, 'push', clientIp(request)))) {
    return json({ error: 'Too many attempts. Wait a moment and try again.' }, 429, cors);
  }
  const auth = request.headers.get('authorization') || '';
  const secret = auth.startsWith('Bearer ') ? auth.slice(7) : '';

  const ct = (request.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
  let roomId = '';
  let body: string;

  try {
    if (ct === 'application/json') {
      const parsed = (await request.json()) as { roomId?: unknown; text?: unknown; name?: unknown; mimeType?: unknown; dataBase64?: unknown };
      if (typeof parsed.roomId !== 'string') return json({ error: 'Bad request' }, 400, cors);
      roomId = parsed.roomId;
      if (typeof parsed.text === 'string' && parsed.text.trim().length > 0) {
        body = JSON.stringify({ roomId, text: parsed.text.slice(0, 256 * 1024) });
      } else if (typeof parsed.name === 'string' && typeof parsed.dataBase64 === 'string') {
        body = JSON.stringify({
          roomId,
          name: parsed.name.slice(0, 200),
          mimeType: typeof parsed.mimeType === 'string' ? parsed.mimeType.slice(0, 100) : 'application/octet-stream',
          dataBase64: parsed.dataBase64,
        });
      } else {
        return json({ error: 'Bad request. Send { roomId, text } or { roomId, name, dataBase64 }.' }, 400, cors);
      }
    } else if (ct === 'application/octet-stream') {
      const url = new URL(request.url);
      const rid = url.searchParams.get('roomId');
      if (typeof rid !== 'string') return json({ error: 'Bad request. Use ?roomId=... with a binary body.' }, 400, cors);
      roomId = rid;
      const buf = await request.arrayBuffer();
      if (buf.byteLength === 0 || buf.byteLength > 8 * 1024 * 1024) {
        return json({ error: 'File must be between 1 byte and 8 MB.' }, 400, cors);
      }
      let bin = '';
      const bytes = new Uint8Array(buf);
      for (let i = 0; i < bytes.length; i += 0x8000) {
        bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
      }
      body = JSON.stringify({
        roomId,
        name: (request.headers.get('x-file-name') || 'file').slice(0, 200),
        mimeType: (request.headers.get('x-file-mime') || 'application/octet-stream').slice(0, 100),
        dataBase64: btoa(bin),
      });
    } else {
      return json({ error: 'Bad request. Use Content-Type: application/json or application/octet-stream.' }, 400, cors);
    }
  } catch {
    return json({ error: 'Bad request' }, 400, cors);
  }

  if (!UUID_RE.test(roomId)) return json({ error: 'Bad request' }, 400, cors);
  if (!secret) return json({ error: 'Missing Authorization: Bearer <secret> header.' }, 401, cors);

  const stub = env.ROOMS.get(env.ROOMS.idFromName(roomId));
  try {
    const res = await stub.fetch(
      new Request('https://internal/push', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: 'Bearer ' + secret },
        body,
      })
    );
    return new Response(res.body, { status: res.status, headers: { 'content-type': 'application/json', ...cors } });
  } catch {
    return json({ error: "Couldn't reach the room." }, 503, cors);
  }
}

/** Best-effort client IP: Cloudflare always sets cf-connecting-ip in
 *  production; local/dev requests fall back to x-forwarded-for. */
function clientIp(request: Request): string {
  const cf = (request.headers.get('cf-connecting-ip') || '').trim();
  if (cf) return cf.slice(0, 64);
  const xff = (request.headers.get('x-forwarded-for') || '').split(',')[0].trim();
  if (xff) return xff.slice(0, 64);
  return 'unknown';
}

/** Bounded per-IP rate limit via the current-day Registry shard. Skipped when
 *  no real client IP is visible (local tests, non-CF origins) — the limits
 *  only protect real traffic, never break shared or IP-less environments.
 *  Documented limits live in registry.ts RATE_LIMITS. */
async function rateLimited(env: Env, scope: string, ip: string): Promise<boolean> {
  if (!ip || ip === 'unknown') return true;
  const stub = env.REGISTRY.get(env.REGISTRY.idFromName('registry-' + dayKey()));
  const res = await stub.fetch(
    new Request('https://internal/rate-check', {
      method: 'POST',
      body: JSON.stringify({ ip, scope }),
    })
  );
  if (res.status !== 200) return false;
  const out = (await res.json()) as { ok?: boolean };
  return out.ok !== false;
}

/** Resolve a 6-digit code → roomId via the day-sharded Registry. */
async function lookup(request: Request, env: Env, cors: Record<string, string>): Promise<Response> {
  if (!(await rateLimited(env, 'lookup', clientIp(request)))) {
    return json({ error: 'Too many attempts. Wait a moment and try again.' }, 429, cors);
  }
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

/** Resolve a stable /s/<code> share link → room credentials via the Registry. */
async function resolveShort(request: Request, env: Env, cors: Record<string, string>): Promise<Response> {
  if (!(await rateLimited(env, 'resolve-short', clientIp(request)))) {
    return json({ error: 'Too many attempts. Wait a moment and try again.' }, 429, cors);
  }
  let body: { code?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return json({ error: 'Invalid link' }, 404, cors);
  }
  if (typeof body.code !== 'string' || !/^[0-9a-f]{8}$/i.test(body.code)) {
    return json({ error: 'Invalid link' }, 404, cors);
  }
  const days = new Set([dayKey(), dayKey(Date.now() - 24 * 60 * 60 * 1000)]);
  for (const day of days) {
    const stub = env.REGISTRY.get(env.REGISTRY.idFromName('registry-' + day));
    const res = await stub.fetch(
      new Request('https://internal/resolve-short', {
        method: 'POST',
        body: JSON.stringify({ code: body.code }),
      })
    );
    if (res.status === 200) {
      const found = (await res.json()) as { roomId?: string; secret?: string; createdAt?: number };
      if (found.roomId && found.secret) return json({ roomId: found.roomId, secret: found.secret, createdAt: found.createdAt }, 200, cors);
    }
  }
  return json({ error: 'Invalid link' }, 404, cors);
}
