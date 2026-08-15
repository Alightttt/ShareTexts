import type { SignalingSocket } from './socket';
import { devLog } from './devlog';

/** Must match PROTOCOL_VERSION in worker/src/room.ts. */
const PROTOCOL_VERSION = 1;

/**
 * CloudflareSocket — the browser side of the Cloudflare Workers signaling
 * transport. Exposes the exact socket.io-style surface the app already uses
 * (`on`/`once`/`off`/`emit` with ack callbacks, `connected`, `connect`,
 * `connect_error`, `disconnect`), but speaks the Worker's minimal protocol:
 *
 *   client → server:  {"id","event","payload"}        (JSON text frames)
 *                     raw binary frames = relay data  (encrypted chunks)
 *   server → client:  {"type":"ack","id","ok",...}    or
 *                     {"type":"event","event","payload"}
 *                     raw binary frames = relay data
 *
 * One room WebSocket is opened per command (create/join/resume); it stays open
 * as the session's signaling channel. Transport drops auto-reopen to the same
 * room and re-send `resume_room` so the peer can re-establish WebRTC — the
 * room-level equivalent of socket.io's connectionStateRecovery.
 */

type Handler = (...args: any[]) => void;

const WS_OPEN_TIMEOUT = 8000;

function uuid(): string {
  return crypto.randomUUID();
}

export class CloudflareSocket implements SignalingSocket {
  connected = false;

  private listeners = new Map<string, Set<Handler>>();
  private pending = new Map<string, (res: any) => void>();
  private reqSeq = 0;

  private httpBase: string; // https://host (for POST /lookup)
  private wsBase: string;   // wss://host/ws (for the room socket)
  private cid: string;

  private ws: WebSocket | null = null;
  private currentRoom: string | null = null;
  private lastSecret: string | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempts = 0;
  private stopped = false;

  constructor(endpoint: string) {
    const normalized = endpoint.replace(/\/+$/, '').replace(/\/ws$/i, '');
    this.wsBase = normalized.replace(/^http/, 'ws') + '/ws';
    this.httpBase = normalized.replace(/^ws/, 'http');
    this.cid = uuid();
    devLog('Cloudflare signaling transport ready at', this.httpBase);
    // Command-ready from the start: this transport has no long-lived
    // connection — the room WebSocket opens lazily on the first command
    // (create/join/resume). Report `connected` immediately and still emit
    // 'connect' so any listener attached synchronously sees it. Without
    // this, SessionContext's ensureSocketConnected would wait for a
    // 'connect' event that already fired and hang until its 10s timeout,
    // showing "Couldn't reach ShareText." before the room socket is even
    // opened. Failures surface via connect_error / ack timeouts.
    this.connected = true;
    queueMicrotask(() => this.emitLocal('connect'));
  }

  // ---- SignalingSocket surface -------------------------------------------

  on(event: string, listener: Handler): this {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set());
    this.listeners.get(event)!.add(listener);
    return this;
  }

  once(event: string, listener: Handler): this {
    const wrapped: Handler = (...args) => {
      this.off(event, wrapped);
      listener(...args);
    };
    this.on(event, wrapped);
    return this;
  }

  off(event: string, listener?: Handler): this {
    if (!listener) {
      this.listeners.delete(event);
      return this;
    }
    this.listeners.get(event)?.delete(listener);
    return this;
  }

  emit(event: string, ...args: any[]): this {
    const cb = typeof args[args.length - 1] === 'function' ? (args.pop() as (r: any) => void) : undefined;
    const payload = args[0];

    if (event === 'create_room') {
      void this.createRoom(cb);
    } else if (event === 'join_with_code') {
      void this.joinWithCode(payload, cb);
    } else if (event === 'join_with_link') {
      void this.joinWithLink(payload, cb);
    } else if (event === 'resume_room') {
      void this.resumeRoom(payload, cb);
    } else if (event === 'signal') {
      void this.sendSignal(payload);
    } else if (event === 'relay_message') {
      void this.sendRelay(payload);
    } else if (event === 'close_room') {
      void this.sendClose();
    }
    return this;
  }

  // ---- room socket management --------------------------------------------

  private async openRoom(roomId: string): Promise<WebSocket> {
    if (this.ws && this.ws.readyState === WebSocket.OPEN && this.currentRoom === roomId) {
      return this.ws;
    }
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.closeWs();
    this.currentRoom = roomId;

    return new Promise<WebSocket>((resolve, reject) => {
      const cid = uuid();
      const ws = new WebSocket(`${this.wsBase}?room=${roomId}&cid=${cid}`);
      // Binary frames are encrypted relay chunks — deliver them as ArrayBuffer,
      // not the default Blob, so the transfer layer can decrypt them. (Browsers
      // hand binary frames to onmessage as Blob unless binaryType is set.)
      ws.binaryType = 'arraybuffer';
      let opened = false;
      let failed = false;

      const fail = () => {
        if (failed) return;
        failed = true;
        void this.classifyFailure().then((msg) => {
          this.emitLocal('connect_error', { message: msg });
          reject(new Error(msg));
        });
      };

      const timer = setTimeout(() => {
        try { ws.close(); } catch { /* noop */ }
        fail();
      }, WS_OPEN_TIMEOUT);

      ws.onopen = () => {
        clearTimeout(timer);
        opened = true;
        this.ws = ws;
        this.connected = true;
        this.reconnectAttempts = 0;
        this.emitLocal('connect');
        // Transport-level recovery: re-seat the session so the peer re-offers.
        if (this.lastSecret && this.currentRoom) {
          this.sendJson(ws, 'resume_room', { roomId: this.currentRoom, secret: this.lastSecret });
        }
        resolve(ws);
      };
      ws.onmessage = (ev) => this.handleMessage(ev.data);
      ws.onclose = () => {
        if (this.ws === ws) this.ws = null;
        this.connected = false;
        this.emitLocal('disconnect', 'transport close');
        if (opened) {
          if (!this.stopped) this.scheduleReconnect();
        } else {
          // Handshake rejected (e.g. origin not allowlisted, worker down).
          fail();
        }
      };
      ws.onerror = () => { /* fail() runs on the close that follows */ };
    });
  }

  /**
   * Figure out WHY the room WebSocket failed to open so the UI can say
   * something specific. Probes GET /health (CORS-enabled):
   *   200 → worker is reachable and this origin is allowlisted; the WS
   *         failure is something else → generic unreachable message.
   *   403 → the worker answered but rejected this origin → tell the user to
   *         add their site to ALLOWED_ORIGINS.
   *   throws / non-OK → unreachable (wrong URL, worker down, blocked by the
   *         browser, DNS) → generic unreachable message.
   */
  private async classifyFailure(): Promise<string> {
    const generic = "Couldn't reach ShareText.";
    try {
      const res = await fetch(`${this.httpBase}/health`, {
        method: 'GET',
        credentials: 'omit',
      });
      if (res.status === 403) {
        return "This browser isn't allowed to connect to the ShareText signaling server. Add this site's origin to ALLOWED_ORIGINS on the Cloudflare Worker, then redeploy the Worker.";
      }
      return generic;
    } catch {
      return generic;
    }
  }

  private scheduleReconnect() {
    if (this.reconnectTimer || !this.currentRoom) return;
    const delay = Math.min(1000 * 2 ** this.reconnectAttempts, 10000);
    this.reconnectAttempts++;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      void this.openRoom(this.currentRoom!).catch(() => this.scheduleReconnect());
    }, delay);
  }

  private closeWs() {
    if (this.ws) {
      const old = this.ws;
      this.ws = null;
      try { old.close(1000, 'replaced'); } catch { /* noop */ }
    }
  }

  // ---- protocol ----------------------------------------------------------

  private sendJson(ws: WebSocket, event: string, payload?: unknown) {
    ws.send(JSON.stringify({ v: PROTOCOL_VERSION, id: `${Date.now().toString(36)}-${this.reqSeq++}`, event, payload }));
  }

  private async request(roomId: string, event: string, payload: unknown): Promise<any> {
    const ws = await this.openRoom(roomId);
    const id = `${Date.now().toString(36)}-${this.reqSeq++}`;
    return new Promise<any>((resolve) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        resolve({ success: false, code: 'UNREACHABLE', error: "Couldn't reach ShareText." });
      }, WS_OPEN_TIMEOUT + 4000);
      this.pending.set(id, (res) => {
        clearTimeout(timer);
        resolve(res);
      });
      ws.send(JSON.stringify({ v: PROTOCOL_VERSION, id, event, payload }));
    });
  }

  private handleMessage(data: any) {
    if (typeof data === 'string') {
      let msg: any;
      try {
        msg = JSON.parse(data);
      } catch {
        return;
      }
      if (msg?.type === 'ack') {
        const resolver = this.pending.get(msg.id);
        if (resolver) {
          this.pending.delete(msg.id);
          resolver(msg.ok ? { success: true, ...msg } : { success: false, code: msg.code, error: msg.message || 'Something went wrong' });
        }
      } else if (msg?.type === 'error') {
        this.emitLocal('error', { code: msg.code, message: msg.message });
      } else if (msg?.type === 'event') {
        this.emitLocal(msg.event, msg.payload);
      }
    } else if (data instanceof Blob) {
      // Fallback: if binaryType was somehow not honoured, the frame arrives
      // as a Blob — convert it so relay chunks still decrypt.
      void data.arrayBuffer().then(buf => this.emitLocal('relay_message', { data: buf }));
    } else {
      // Binary frame — relay data (an encrypted text/file chunk).
      this.emitLocal('relay_message', { data });
    }
  }

  private emitLocal(event: string, payload?: unknown) {
    const set = this.listeners.get(event);
    if (!set) return;
    for (const h of [...set]) h(payload);
  }

  // ---- command handlers --------------------------------------------------

  private async createRoom(cb?: (r: any) => void) {
    try {
      const roomId = uuid();
      const res = await this.request(roomId, 'create_room', undefined);
      if (res.success) this.lastSecret = res.secret;
      cb?.(res);
    } catch {
      cb?.({ success: false, error: "Couldn't reach ShareText." });
    }
  }

  private async joinWithCode(payload: { code?: string } | undefined, cb?: (r: any) => void) {
    try {
      const code = payload?.code;
      if (typeof code !== 'string') return cb?.({ success: false, error: 'Invalid or expired code' });
      const res = await fetch(`${this.httpBase}/lookup`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ code }),
      });
      if (!res.ok) {
        return cb?.({ success: false, error: 'Invalid or expired code' });
      }
      const found = (await res.json()) as { roomId?: string };
      if (!found.roomId) return cb?.({ success: false, error: 'Invalid or expired code' });
      const joined = await this.request(found.roomId, 'join_with_code', { code });
      if (joined.success) this.lastSecret = joined.secret;
      cb?.(joined);
    } catch {
      cb?.({ success: false, error: "Couldn't reach ShareText." });
    }
  }

  private async joinWithLink(payload: { roomId?: string } | undefined, cb?: (r: any) => void) {
    try {
      const roomId = payload?.roomId;
      if (!roomId) return cb?.({ success: false, error: 'Invalid session' });
      const res = await this.request(roomId, 'join_with_link', { roomId });
      if (res.success) this.lastSecret = res.secret;
      cb?.(res);
    } catch {
      cb?.({ success: false, error: "Couldn't reach ShareText." });
    }
  }

  private async resumeRoom(payload: { roomId?: string; secret?: string } | undefined, cb?: (r: any) => void) {
    try {
      const roomId = payload?.roomId;
      const secret = payload?.secret;
      if (!roomId || !secret) return cb?.({ success: false, error: 'Session expired' });
      this.lastSecret = secret;
      const res = await this.request(roomId, 'resume_room', { roomId, secret });
      cb?.(res);
    } catch {
      cb?.({ success: false, error: "Couldn't reach ShareText." });
    }
  }

  private async sendSignal(payload: { roomId?: string; to?: string; signal?: unknown } | undefined) {
    if (!payload?.roomId || !this.currentRoom) return;
    try {
      const ws = await this.openRoom(payload.roomId);
      this.sendJson(ws, 'signal', { to: payload.to, signal: payload.signal });
    } catch {
      /* signaling is best-effort */
    }
  }

  private async sendRelay(payload: { roomId?: string; data?: string | ArrayBuffer } | undefined) {
    if (!payload?.roomId) return;
    try {
      const ws = await this.openRoom(payload.roomId);
      if (typeof payload.data === 'string') {
        this.sendJson(ws, 'relay_message', { data: payload.data });
      } else if (payload.data instanceof ArrayBuffer) {
        // Binary frames are unambiguous relay data (encrypted chunks) — the
        // DO forwards the raw frame to the peer without a header.
        ws.send(payload.data);
      }
    } catch {
      /* relay is best-effort */
    }
  }

  private async sendClose() {
    if (!this.currentRoom) return;
    try {
      const ws = await this.openRoom(this.currentRoom);
      this.sendJson(ws, 'close_room', undefined);
      this.stopped = true;
      this.closeWs();
      this.currentRoom = null;
      this.lastSecret = null;
    } catch {
      /* nothing to close */
    }
  }

  /** For tests / hard teardown. */
  destroy() {
    this.stopped = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.closeWs();
  }
}
