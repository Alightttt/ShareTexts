/**
 * Minimal Cloudflare runtime shim so the real Durable Object classes can be
 * driven in plain Node (workerd doesn't run on every machine). Implements only
 * what room.ts / registry.ts touch: the DurableObject base (this.ctx), key-value
 * storage with alarms, accepted WebSockets with tags, and WebSocketPair.
 */

export class FakeWebSocket {
  readyState = 1; // OPEN — accepted sockets are connected in the emulator
  sent: Array<string | ArrayBuffer> = [];
  peer: FakeWebSocket | null = null;
  onmessage: ((ev: { data: any }) => void) | null = null;
  onclose: ((ev: { code: number; reason: string }) => void) | null = null;
  closedCode: number | null = null;
  closedReason: string | null = null;

  send(data: string | ArrayBuffer) {
    this.sent.push(data);
    if (this.peer?.onmessage) this.peer.onmessage({ data });
  }
  close(code = 1000, reason = '') {
    this.readyState = 0;
    this.closedCode = code;
    this.closedReason = reason;
    if (this.peer?.onclose) this.peer.onclose({ code, reason });
  }
}

export class FakeWebSocketPair {
  client: FakeWebSocket;
  server: FakeWebSocket;
  constructor() {
    this.client = new FakeWebSocket();
    this.server = new FakeWebSocket();
    this.client.peer = this.server;
    this.server.peer = this.client;
  }
}

// The Worker runtime exposes WebSocketPair as a global — expose it to the
// bundled Durable Object code when running under plain Node.
if (typeof (globalThis as any).WebSocketPair === 'undefined') {
  (globalThis as any).WebSocketPair = FakeWebSocketPair;
}

export class FakeStorage {
  map = new Map<string, unknown>();
  alarm: number | null = null;
  get<T>(key: string): Promise<T | undefined> {
    return Promise.resolve(this.map.get(key) as T | undefined);
  }
  put(key: string, value: unknown): Promise<void> {
    this.map.set(key, value);
    return Promise.resolve();
  }
  delete(key: string): Promise<void> {
    this.map.delete(key);
    return Promise.resolve();
  }
  deleteAll(): Promise<void> {
    this.map.clear();
    return Promise.resolve();
  }
  list<T = unknown>(opts?: { prefix?: string }): Promise<Map<string, T>> {
    const prefix = opts?.prefix ?? '';
    return Promise.resolve(
      new Map([...this.map.entries()].filter(([k]) => k.startsWith(prefix)) as [string, T][])
    );
  }
  getAlarm(): Promise<number | null> {
    return Promise.resolve(this.alarm);
  }
  setAlarm(t: number): Promise<void> {
    this.alarm = t;
    return Promise.resolve();
  }
}

export class FakeCtx {
  storage = new FakeStorage();
  sockets: FakeWebSocket[] = [];
  private tags = new Map<FakeWebSocket, string[]>();

  acceptWebSocket(ws: FakeWebSocket, tags?: string[]) {
    this.sockets.push(ws);
    if (tags) this.tags.set(ws, tags);
  }
  getWebSockets(tag?: string | string[]): FakeWebSocket[] {
    if (tag === undefined) return this.sockets;
    const list = Array.isArray(tag) ? tag : [tag];
    return this.sockets.filter((ws) => this.tags.get(ws)?.some((t) => list.includes(t)));
  }
}

/** Mirrors `cloudflare:workers`' DurableObject base class. */
export class DurableObject<Env = unknown> {
  ctx: FakeCtx;
  env: Env;
  constructor(ctx: FakeCtx, env: Env) {
    this.ctx = ctx;
    this.env = env;
  }
}
