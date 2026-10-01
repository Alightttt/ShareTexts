/**
 * Space live updates (F14) — a dedicated socket.io connection on the
 * /space-live namespace (dev) or /space-ws WebSocket (Cloudflare worker).
 *
 * The namespace is deliberately separate from room signaling: no shared
 * event names, no interference with the WebRTC control channel. Events:
 *   space_sync (snapshot on join) · item_added · item_deleted ·
 *   members_changed · space_closed · space_auth_failed (→ re-join).
 */

import { io, Socket } from 'socket.io-client';
import { signalingHttpBase, signalingTransportMode } from '../socket';
import { spaceDeviceKey } from './api';
import type { SpaceLiveEvent } from './types';

export interface SpaceLiveHandlers {
  onEvent(e: SpaceLiveEvent): void;
  onStatus(s: 'connecting' | 'live' | 'offline'): void;
}

export function connectSpaceLive(
  spaceId: string,
  token: string,
  name: string,
  handlers: SpaceLiveHandlers,
): () => void {
  let disposed = false;
  let socket: Socket | null = null;
  let ws: WebSocket | null = null;
  let rejoinTimer: ReturnType<typeof setTimeout> | null = null;
  let closedByServer = false;

  const emitEvent = (e: SpaceLiveEvent) => { if (!disposed) handlers.onEvent(e); };

  const joinPayload = () => ({ spaceId, token, name, deviceKey: spaceDeviceKey() });

  if (signalingTransportMode() === 'cloudflare') {
    // ── Cloudflare: raw WebSocket to /space-ws?space=<id> ──────────────
    const base = (signalingHttpBase() ?? window.location.origin)
      .replace(/^http/, 'ws')
      .replace(/\/+$/, '');
    let retry = 0;
    const dial = () => {
      if (disposed || closedByServer) return;
      handlers.onStatus('connecting');
      try {
        ws = new WebSocket(`${base}/space-ws?space=${encodeURIComponent(spaceId)}`);
      } catch {
        scheduleRetry();
        return;
      }
      ws.onopen = () => {
        retry = 0;
        ws!.send(JSON.stringify({ v: 1, event: 'join_space', payload: joinPayload() }));
        handlers.onStatus('live');
      };
      ws.onmessage = (ev) => {
        try {
          const frame = JSON.parse(String(ev.data)) as { type?: string; event?: string; payload?: unknown };
          if (frame.type === 'event' && frame.event) {
            if (frame.event === 'space_auth_failed') { rejoin(); return; }
            emitEvent({ event: frame.event, payload: (frame.payload ?? {}) } as SpaceLiveEvent);
          }
        } catch { /* ignore malformed frames */ }
      };
      ws.onclose = () => { if (!disposed && !closedByServer) scheduleRetry(); };
      ws.onerror = () => { try { ws?.close(); } catch { /* noop */ } };
    };
    const scheduleRetry = () => {
      if (disposed || closedByServer) return;
      retry = Math.min(retry + 1, 6);
      handlers.onStatus('offline');
      rejoinTimer = setTimeout(dial, Math.min(1500 * Math.pow(2, retry - 1), 15_000));
    };
    const rejoin = () => {
      // Hibernation wake or transient auth loss — re-send the join frame.
      try { ws?.send(JSON.stringify({ v: 1, event: 'join_space', payload: joinPayload() })); } catch { /* noop */ }
    };
    dial();
    return () => {
      disposed = true;
      if (rejoinTimer) clearTimeout(rejoinTimer);
      try { ws?.close(1000, 'bye'); } catch { /* noop */ }
    };
  }

  // ── Dev / self-hosted: socket.io namespace ────────────────────────────
  const base = signalingHttpBase() ?? window.location.origin;
  socket = io(base + '/space-live', {
    transports: ['websocket', 'polling'],
    tryAllTransports: true,
    reconnection: true,
    reconnectionAttempts: 30,
    reconnectionDelay: 1500,
    reconnectionDelayMax: 10_000,
  });

  socket.on('connect', () => {
    handlers.onStatus('live');
    socket!.emit('join_space', joinPayload(), (res: { ok: boolean } | undefined) => {
      if (res && !res.ok) {
        // Wrong/expired token: surface honestly, don't spin.
        emitEvent({ event: 'space_auth_failed', payload: {} });
      }
    });
  });
  socket.on('disconnect', () => { if (!closedByServer) handlers.onStatus('offline'); });
  socket.on('reconnect_attempt', () => handlers.onStatus('connecting'));
  socket.io.on('reconnect_failed', () => handlers.onStatus('offline'));
  socket.on('space_event', (frame: { event: string; payload: unknown }) => {
    if (!frame || typeof frame.event !== 'string') return;
    if (frame.event === 'space_closed') closedByServer = true;
    if (frame.event === 'space_auth_failed') {
      // One clean re-join attempt after a server restart wiped state.
      if (rejoinTimer) clearTimeout(rejoinTimer);
      rejoinTimer = setTimeout(() => {
        if (!disposed && socket?.connected) {
          socket.emit('join_space', joinPayload(), (res: { ok: boolean } | undefined) => {
            if (res && !res.ok) emitEvent({ event: 'space_auth_failed', payload: {} });
          });
        }
      }, 2000);
      return;
    }
    emitEvent({ event: frame.event, payload: (frame.payload ?? {}) } as SpaceLiveEvent);
  });

  return () => {
    disposed = true;
    if (rejoinTimer) clearTimeout(rejoinTimer);
    try { socket?.disconnect(); } catch { /* noop */ }
  };
}
