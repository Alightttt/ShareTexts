import { io, Socket } from 'socket.io-client';
import { CloudflareSocket } from './cloudflareSocket';
import { devLog } from './devlog';
import { diag } from './diag';

export { devLog };

/**
 * The signaling surface the app consumes. Both transports — socket.io
 * (Node server) and CloudflareSocket (Workers + Durable Objects) — satisfy it,
 * so SessionContext and the WebRTC layer never care which one is in use.
 */
export interface SignalingSocket {
  connected: boolean;
  on(event: string, listener: (...args: any[]) => void): unknown;
  once(event: string, listener: (...args: any[]) => void): unknown;
  off(event: string, listener?: (...args: any[]) => void): unknown;
  emit(event: string, ...args: any[]): unknown;
}

const isProd = !import.meta.env.DEV;

/** Cloudflare endpoints a deployed build may fall back to when the baked-in
 *  worker is stale or unreachable. The current production worker first — it
 *  speaks the newest protocol and exposes /stats roomsCreated. */
const CF_FALLBACKS = [
  'https://sharetext-signaling.alighttt.workers.dev',
  'https://sharetext-signaling.garv29devra.workers.dev',
];

/**
 * Fetch the CURRENT worker's /stats — a cheap, CORS-enabled, version-bearing
 * liveness+capability check. Resolves null when unreachable/blocked.
 */
async function probeWorker(base: string, timeoutMs = 2500): Promise<{ users?: number; roomsCreated?: number } | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(base + '/stats', { cache: 'no-store', credentials: 'omit', signal: controller.signal });
    if (!res.ok) return null;
    const data = await res.json().catch(() => null);
    if (data && typeof data === 'object' && (typeof (data as any).users === 'number' || typeof (data as any).roomsCreated === 'number')) {
      return data as { users?: number; roomsCreated?: number };
    }
    return null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Self-healing endpoint selection. A build bakes ONE worker URL in, but a
 * Vercel dashboard env var can override it with an older deploy — the app
 * then runs a protocol/feature mismatch for weeks unnoticed (blank stats
 * tracker, room-create failures). At boot — BEFORE any socket is created —
 * we probe the baked worker's /stats; if it doesn't answer with the current
 * capability set, we try the known fallbacks and remember the winner. The
 * redirect must happen before getSocket() is first called; later calls are
 * no-ops (the singleton already exists).
 *
 * In dev (same-origin socket.io) this is a no-op.
 */
let activeCfBase: string | null = null;
let redirectPromise: Promise<void> | null = null;

async function selectBestCloudflareBase(): Promise<void> {
  if (mode !== 'cloudflare' || !url) return;
  const bakedBase = url.replace(/\/+$/, '').replace(/\/ws$/i, '');
  const candidates = [bakedBase, ...CF_FALLBACKS.filter(f => f !== bakedBase)];
  const results = await Promise.all(candidates.map(probeWorker));
  const idx = results.findIndex(r => r && typeof r.roomsCreated === 'number');
  if (idx > 0) {
    activeCfBase = candidates[idx];
    console.warn('[ShareText] signaling worker redirect:', bakedBase, '→', activeCfBase);
    diag('transport.redirect', true, `${bakedBase} -> ${activeCfBase}`);
  } else {
    // Baked worker is current (or nothing answered — keep the baked URL;
    // the ordinary connect-time error paths handle that honestly).
    activeCfBase = null;
  }
}

/** Kick the boot probe once, from the first getSocket() call. Idempotent. */
function ensureEndpointSelected(): void {
  if (mode !== 'cloudflare' || redirectPromise) return;
  redirectPromise = selectBestCloudflareBase();
}

/**
 * Resolve the signaling endpoint.
 *
 * Priority:
 *   1. VITE_SIGNALING_URL → Cloudflare Workers (WebSocket protocol)
 *   2. VITE_SOCKET_URL     → Node socket.io server
 *   3. same-origin         → dev (the local server runs signaling) or a
 *      deployment where the signaling server also serves the frontend
 *
 * Production safety: an explicit localhost in either env is refused loudly —
 * deployed builds never silently target localhost.
 */
function resolveEndpoints(): { mode: 'cloudflare' | 'socketio'; url?: string } {
  const normalize = (v: string | undefined) => v?.replace(/\/+$/, '').trim();
  const cf = normalize(import.meta.env.VITE_SIGNALING_URL as string | undefined);
  const node = normalize(import.meta.env.VITE_SOCKET_URL as string | undefined);

  if (cf) {
    if (isProd && /^https?:\/\/(localhost|127\.0\.0\.1)([:/]|$)/i.test(cf)) {
      console.error('[ShareText] VITE_SIGNALING_URL points at localhost in a production build — refusing. Deployed builds must use the real Cloudflare Worker (e.g. https://sharetext-signaling.<subdomain>.workers.dev).');
      return { mode: 'socketio', url: node };
    }
    return { mode: 'cloudflare', url: cf };
  }

  if (node) {
    if (isProd && /^https?:\/\/(localhost|127\.0\.0\.1)([:/]|$)/i.test(node)) {
      console.error('[ShareText] VITE_SOCKET_URL points at localhost in a production build — refusing. Deployed builds must use a real signaling server.');
      return { mode: 'socketio' };
    }
    return { mode: 'socketio', url: node };
  }

  if (isProd) {
    console.error(
      '[ShareText] Neither VITE_SIGNALING_URL nor VITE_SOCKET_URL is set. A deployed build must point at a signaling backend ' +
      '(Cloudflare Worker or Node server). Falling back to same-origin — this only works when the backend serves this frontend.'
    );
  }
  return { mode: 'socketio' };
}

const { mode, url } = resolveEndpoints();
devLog('Signaling transport:', mode, url || '(same origin)');
diag('transport.choose', true, `${mode}${url ? ' ' + url : ' (same origin)'}`);

/** Which signaling transport the build is using ('socketio' | 'cloudflare').
 *  Nearby discovery runs only on the socket.io transport; callers use this to
 *  degrade gracefully (hint line only) on the Cloudflare transport. */
export function signalingTransportMode(): 'cloudflare' | 'socketio' {
  return mode;
}

/**
 * Absolute URL of the agent push endpoint on the ACTIVE transport, for the
 * connect screen's "Send from your computer" curl command. Same-origin (dev /
 * self-hosted) resolves against window.location; the Cloudflare transport
 * uses the worker's base URL. Callers only use this in the browser.
 */
export function pushEndpoint(): string | null {
  if (mode === 'cloudflare' && url) {
    return url.replace(/\/+$/, '').replace(/\/ws$/i, '') + '/api/push';
  }
  if (typeof window === 'undefined') return null;
  return window.location.origin + '/api/push';
}

/**
 * Human-readable reason when a deployed build has no signaling backend to
 * talk to. In production the transport is chosen at BUILD time — Vite inlines
 * VITE_SIGNALING_URL / VITE_SOCKET_URL into the bundle, so adding the env var
 * to Vercel after the last build does nothing until a rebuild.
 */
export function signalingConfigIssue(): string | null {
  if (import.meta.env.DEV) return null;
  if (mode === 'cloudflare' && url) return null;
  if (mode === 'socketio' && url) return null;
  return "ShareText couldn't reach its connection server. Please try again later.";
}

/**
 * Base URL of the ACTIVE signaling backend, for reachability probes and any
 * other HTTP call to the backend itself (e.g. the live /stats widget).
 * Null when the transport is same-origin socket.io (probe /health there).
 */
export function signalingHttpBase(): string | null {
  if (mode === 'cloudflare' && url) {
    // The redirect, once chosen, is authoritative for HTTP too — the stats
    // widget must read the SAME worker the transport talks to.
    const base = activeCfBase ?? url;
    return base.replace(/\/+$/, '').replace(/\/ws$/i, '').replace(/^ws/, 'http');
  }
  if (mode === 'socketio' && url) return url;
  return typeof window === 'undefined' ? null : window.location.origin;
}

/**
 * Ask the ACTIVE signaling backend whether it is alive, so an error can say
 * "our service is down" instead of blaming the user's internet. Mirrors the
 * probe CloudflareSocket already runs for its own transport.
 *
 *   'ok'          /health answered — the service is up; the failure was local
 *                 (transport blocked, momentary drop)
 *   'down'        the service answered with an error or is unreachable
 *   'slow'        the probe itself timed out — network is struggling
 */
export async function probeSignalingHealth(): Promise<'ok' | 'down' | 'slow'> {
  const base = signalingHttpBase();
  if (!base) return 'down';
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 3500);
  try {
    const res = await fetch(base + '/health', {
      method: 'GET',
      credentials: 'omit',
      signal: controller.signal,
      cache: 'no-store',
    });
    return res.ok ? 'ok' : 'down';
  } catch (err) {
    return (err as Error)?.name === 'AbortError' ? 'slow' : 'down';
  } finally {
    clearTimeout(timer);
  }
}

let instance: SignalingSocket | null = null;

export function getSocket(): SignalingSocket {
  if (!instance) {
    ensureEndpointSelected();
    // The probe races the first connection by design: if it finishes before
    // the socket is created, the redirect wins cleanly; if not, the baked
    // URL serves this session and the next boot redirects earlier.
    const endpoint = activeCfBase ?? url;
    instance =
      mode === 'cloudflare'
        ? new CloudflareSocket(endpoint!)
        : io(url, {
            // WebSocket first (fastest), polling as automatic fallback. A
            // websocket-only transport dies permanently behind proxies that
            // don't forward upgrades (corporate networks, some preview
            // environments) and the user saw an "internet connection" error
            // that was never their internet's fault. socket.io downgrades to
            // polling by itself when 'polling' is in the list.
            transports: ['websocket', 'polling'],
            // Try EVERY transport in the list before giving up. Without this,
            // socket.io v4 attempts only the FIRST entry (websocket) and dies
            // behind proxies that block the upgrade handshake — the user sat
            // through the full 10s timeout and saw "Couldn't reach ShareText"
            // even though polling worked fine the whole time.
            tryAllTransports: true,
            autoConnect: true,
            reconnection: true,
            // Cover multi-minute network blips so the recovery window can
            // actually be used.
            reconnectionAttempts: 60,
            reconnectionDelay: 2000,
            reconnectionDelayMax: 8000,
          });
  }
  return instance;
}

/**
 * Prewarm the signaling transport — create the socket (and kick its
 * connect) as soon as the app mounts, long before the user commits to
 * creating a room or entering a code. The TLS + upgrade handshake (often
 * the single largest latency in "create room") then happens in the
 * background while they read the page. Idempotent: getSocket() returns the
 * singleton on every later call, and ensureSocketConnected() resolves
 * immediately when the connection is already up.
 */
export function prewarmSignaling(): void {
  try {
    getSocket();
  } catch { /* never let telemetry warm-up break the page */ }
}

/** Boot-time redirect probe result, for tests/diagnostics. */
export function activeSignalingBase(): string | null {
  return activeCfBase;
}

/**
 * Resolve a stable /s/<code> share link to room credentials, on whichever
 * transport is active: the Cloudflare Worker's POST /resolve-short endpoint,
 * or a socket.io `resolve_short_code` event on the Node server.
 */
export async function resolveShortCode(
  code: string
): Promise<{ success: boolean; roomId?: string; secret?: string; createdAt?: number }> {
  const normalized = code.toLowerCase().trim();
  if (mode === 'cloudflare' && url) {
    const httpBase = url.replace(/\/+$/, '').replace(/\/ws$/i, '').replace(/^ws/, 'http');
    try {
      const res = await fetch(httpBase + '/resolve-short', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ code: normalized }),
      });
      if (res.ok) {
        const data = (await res.json()) as { roomId?: string; secret?: string; createdAt?: number };
        if (data.roomId && data.secret) {
          return { success: true, roomId: data.roomId, secret: data.secret, createdAt: data.createdAt };
        }
      }
      return { success: false };
    } catch {
      return { success: false };
    }
  }
  return new Promise((resolve) => {
    const socket = getSocket();
    const timer = setTimeout(() => resolve({ success: false }), 10000);
    socket.emit('resolve_short_code', { code: normalized }, (res: any) => {
      clearTimeout(timer);
      if (res?.success && res.roomId && res.secret) {
        resolve({ success: true, roomId: res.roomId, secret: res.secret, createdAt: res.createdAt });
      } else {
        resolve({ success: false });
      }
    });
  });
}

/**
 * Re-anchor the pairing-code window to now (the creator landed on the connect
 * screen), on whichever transport is active. Returns the new anchor so the
 * client can restart the 40s countdown. Only a seated peer holding the room
 * secret can refresh; failures resolve { success: false } and are ignored.
 */
export async function refreshCode(
  roomId: string,
  secret: string
): Promise<{ success: boolean; createdAt?: number }> {
  if (mode === 'cloudflare') {
    const cf = getSocket() as unknown as import('./cloudflareSocket').CloudflareSocket;
    if (typeof (cf as any).refreshCode === 'function') {
      return (cf as any).refreshCode(roomId, secret);
    }
    return { success: false };
  }
  return new Promise((resolve) => {
    const socket = getSocket();
    const timer = setTimeout(() => resolve({ success: false }), 8000);
    socket.emit('refresh_code', { roomId, secret }, (res: any) => {
      clearTimeout(timer);
      if (res?.success && typeof res.createdAt === 'number') {
        resolve({ success: true, createdAt: res.createdAt });
      } else {
        resolve({ success: false });
      }
    });
  });
}
