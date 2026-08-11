import { Room, UUID_RE } from './room';
import { Registry } from './registry';
import { json, dayKey, type Env } from './types';

// Durable Object classes must be exported from the entrypoint.
export { Room };
export { Registry };

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

function originAllowed(request: Request, env: Env): boolean {
  const origin = request.headers.get('Origin');
  if (!origin) return true; // non-browser clients (curl, agents, Node tests)
  return allowedOrigins(env).has(origin);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    if (path === '/health') {
      return json({ ok: true, service: 'sharetext-signaling-cf' });
    }

    if (!originAllowed(request, env)) {
      return json({ error: 'Origin not allowed' }, 403);
    }

    if (path === '/ws') {
      const roomId = url.searchParams.get('room');
      const cid = url.searchParams.get('cid');
      if (!roomId || !UUID_RE.test(roomId)) return json({ error: 'invalid room' }, 400);
      if (!cid || !UUID_RE.test(cid)) return json({ error: 'invalid connection id' }, 400);
      const id = env.ROOMS.idFromName(roomId);
      return env.ROOMS.get(id).fetch(request);
    }

    if (path === '/lookup' && request.method === 'POST') {
      return lookup(request, env);
    }

    return json({
      name: 'sharetext-signaling',
      endpoints: ['/health', '/ws', '/lookup'],
    });
  },
} satisfies ExportedHandler<Env>;

/** Resolve a 6-digit code → roomId via the day-sharded Registry. */
async function lookup(request: Request, env: Env): Promise<Response> {
  let body: { code?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return json({ error: 'Invalid or expired code' }, 404);
  }
  if (typeof body.code !== 'string' || !/^\d{6}$/.test(body.code)) {
    return json({ error: 'Invalid or expired code' }, 404);
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
      if (found.roomId) return json({ roomId: found.roomId });
    }
  }
  return json({ error: 'Invalid or expired code' }, 404);
}
