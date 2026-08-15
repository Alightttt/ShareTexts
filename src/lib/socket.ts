import { io, Socket } from 'socket.io-client';
import { CloudflareSocket } from './cloudflareSocket';
import { devLog } from './devlog';

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
  return "This build has no signaling server configured. Add VITE_SIGNALING_URL (Cloudflare Worker) or VITE_SOCKET_URL (Node server) to the deployment's build-time environment, then redeploy.";
}

let instance: SignalingSocket | null = null;

export function getSocket(): SignalingSocket {
  if (!instance) {
    instance =
      mode === 'cloudflare'
        ? new CloudflareSocket(url!)
        : io(url, {
            transports: ['websocket'],
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
