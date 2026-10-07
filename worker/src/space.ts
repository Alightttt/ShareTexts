import { DurableObject } from 'cloudflare:workers';
import { json, type Env } from './types';
import { sendSpaceReminderPush } from './vapid';
import { normalizeSpaceCode, isValidSpaceCode, generateSpaceCode } from './spaceCode';

/**
 * Space — one Durable Object per Temporary Space: authoritative metadata,
 * item index, membership, live updates, expiry, and cleanup.
 *
 * Architectural statement (F14): a Temporary Space is a SERVER-BACKED shared
 * space, not "a WebRTC room that happens to stay open". Contents live in R2
 * (files) and DO storage (text), independent of any browser. The creator
 * closing their tab must not affect the space.
 *
 * Access model (per-device):
 *   · CREATE returns one ACCESS TOKEN (member credential) and one MANAGE KEY
 *     (creator credential). Both are 192-bit random, stored ONLY as SHA-256
 *     hashes; every request presents one via Bearer auth and is authorized
 *     against the hash.
 *   · Each DEVICE derives its participantId from its token's hash PLUS its
 *     own stable local seed (x-device-key header — NOT a secret, never
 *     stored): pid = sha256(tokenHash + '.' + deviceKey). Two devices that
 *     both hold the access token are two members — not one. A refresh/rejoin
 *     re-presents the same token + same seed → same stable id (no duplicate
 *     participants). The creator's identity comes from the manage key.
 *   · Creator-only operations (close space, remove any item) require the
 *     manage key. Members can add content, remove THEIR OWN items, copy,
 *     download, subscribe to reminders.
 *
 * Expiry is server-authoritative: at `expiresAt` the space closes, live
 * clients are told, and cleanup runs as a retryable background phase.
 *
 * Storage layout (DO KV — matches Room/Registry patterns and the Node shim):
 *   space            → SpaceState
 *   item:<id>        → ItemMeta (text bodies ≤ TEXT_MAX live here; files point at R2)
 *   pending:<id>     → ItemMeta staged for a direct upload (not yet listed)
 *   upload:<itemId>  → MultipartState (in-flight multipart uploads)
 *   sub:<n>          → PushSubscription (bounded per space)
 *   member:<id>      → MemberRecord (per-device names)
 *
 * Live updates: WebSocket Hibernation API. After a hibernation wake the
 * socket comes back unauthorized; the client re-sends `join_space`
 * automatically (it handles `space_auth_failed` by re-joining).
 */

export const SPACE_TTL_CAP = 7 * 24 * 60 * 60 * 1000;          // hard max: 7 days
export const SPACE_DURATIONS: number[] = [
  6 * 60 * 60 * 1000, 12 * 60 * 60 * 1000, 1 * 24 * 60 * 60 * 1000,
  2 * 24 * 60 * 60 * 1000, 3 * 24 * 60 * 60 * 1000,
  5 * 24 * 60 * 60 * 1000, 7 * 24 * 60 * 60 * 1000,
];
const TEXT_MAX = 512 * 1024;                  // text items live in DO state
const DIRECT_UPLOAD_MAX = 90 * 1024 * 1024;   // under the 100 MB worker body cap
const R2_PART_MIN = 8 * 1024 * 1024;          // 8 MiB parts → ≤10k parts ≈ 80 GiB; grows for bigger files
const R2_PART_CAP = 512 * 1024 * 1024;
const R2_OBJECT_CAP = 4.5 * 1024 * 1024 * 1024 * 1024; // honest R2 ceiling (~5 TiB)
const NAME_MAX = 80;
const FILENAME_MAX = 200;
const MEMBERS_SOFT_CAP = 200;                 // abuse bound, not a product limit
const SUBS_MAX = 20;
const CLEANUP_DELAY_MS = 5_000;

/** One reminder per space, sized to the lifetime (centralized, tunable). */
export function reminderOffsetFor(durationMs: number): number {
  const h = durationMs / 3_600_000;
  if (h <= 6) return 1 * 3_600_000;
  if (h <= 12) return 3 * 3_600_000;
  if (h <= 24) return 6 * 3_600_000;
  if (h <= 48) return 12 * 3_600_000;
  if (h <= 72) return 18 * 3_600_000;
  return 24 * 3_600_000;
}

/** Constant-time string comparison for bearer secrets (Room parity). */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
}

function base64url(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function randomToken(): string {
  return base64url(crypto.getRandomValues(new Uint8Array(24))); // 192-bit
}

function hexToBytes(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

/** Sanitize a user-supplied display filename. Preserves the readable name;
 *  strips anything that could become a header, path, or key injection. */
export function sanitizeFilename(raw: string): string {
  let name = (raw || '').normalize('NFKC');
  name = name.replace(/[\u0000-\u001f\u007f"\\]/g, '');
  name = name.split(/[/\\]/).pop() || '';
  name = name.replace(/^[.\s]+/, '').trim();
  if (name.length > FILENAME_MAX) {
    const ext = name.slice(name.lastIndexOf('.'));
    name = name.slice(0, Math.max(1, FILENAME_MAX - ext.length)) + ext.slice(0, 20);
  }
  return name || 'file';
}

export function sanitizeSpaceName(raw: unknown): string {
  let name = typeof raw === 'string' ? raw.normalize('NFKC').replace(/[\u0000-\u001f\u007f<>]/g, '').trim() : '';
  if (name.length > NAME_MAX) name = name.slice(0, NAME_MAX);
  return name || 'Shared space';
}

/** Sanitize a device display name for the member roster. */
export function sanitizeMemberName(raw: unknown): string {
  let name = typeof raw === 'string' ? raw.normalize('NFKC').replace(/[\u0000-\u001f\u007f<>]/g, '').trim() : '';
  if (name.length > 40) name = name.slice(0, 40);
  return name || 'A device';
}

interface SpaceState {
  spaceId: string;
  name: string;
  tokenHash: string;        // SHA-256 of the member access token
  manageHash: string;       // SHA-256 of the creator manage key
  createdAt: number;
  expiresAt: number;        // absolute — the single source of truth for lifetime
  durationMs: number;
  state: 'ACTIVE' | 'EXPIRED' | 'CLEANING_UP';
  creatorId: string;        // the creator's token-identity participant id
  members: Record<string, { name: string; joinedAt: number; lastSeen: number }>;
  itemSeq: number;          // monotonic counter for delta sync
  reminderAt: number;
  reminderSent: boolean;
}

interface MemberRecord {
  name: string;
  joinedAt: number;
}

interface ItemMeta {
  id: string;
  seq: number;             // 0 while staged/unfinished
  kind: 'text' | 'link' | 'file';
  name?: string;           // sanitized display filename
  mime: string;
  size: number;
  createdAt: number;
  addedBy: string;         // participantId (device-scoped)
  addedByName: string;
  text?: string;           // text items
  r2Key?: string;          // files: spaces/<spaceId>/<itemId>/object
  sha256?: string;
  state: 'READY' | 'UPLOADING';
}

interface MultipartState {
  itemId: string;
  uploadId: string;
  name: string;
  mime: string;
  size: number;
  sha256?: string;
  addedBy: string;
  addedByName: string;
  partSize: number;
  parts: Record<number, string>; // partNumber → etag (server-side record)
  createdAt: number;
}

interface SubRecord {
  endpoint: string;
  p256dh: string;
  auth: string;
  addedBy: string;
}

interface ConnMeta { authorized: boolean; participantId: string | null; }

interface WireMsg { v?: unknown; id?: string; event?: string; payload?: any; }

const PROTOCOL_VERSION = 1;

function log(...parts: unknown[]) {
  console.log('[ShareText-space]', ...parts);
}

export class Space extends DurableObject<Env> {
  private space: SpaceState | null = null;
  private urlSpaceId: string | null = null;
  /** Authorized-socket metadata. Rebuilt lazily after a hibernation wake —
   *  sockets re-authorize with a join_space frame (see webSocketMessage). */
  private conns = new Map<string, ConnMeta>();
  /** Set while handling a request that carries the test clock header, so
   *  async helpers (alarm timing) can share the same injected time. */
  private testNow: number | null = null;

  /** Injectable clock for tests only — guarded by an env var that production
   *  never sets. Without it, Date.now() is the only time source. */
  private now(request: Request): number {
    if (this.env.SPACE_TEST_CLOCK === '1') {
      const t = Number(request.headers.get('x-space-test-now'));
      if (Number.isFinite(t) && t > 0) return t;
    }
    return Date.now();
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    this.urlSpaceId = url.searchParams.get('space');

    if (request.headers.get('Upgrade') === 'websocket') {
      return this.upgrade();
    }

    const now = this.now(request);
    this.testNow = this.env.SPACE_TEST_CLOCK === '1' ? now : null;
    await this.loadSpace();

    const path = url.pathname.replace(/^\/space\/[0-9a-f-]+/i, '') || '/';
    const method = request.method;

    try {
      if (path === '/create' && method === 'POST') return await this.handleCreate(request, now);
      if (path === '/join' && method === 'POST') return await this.handleJoin(request, now);
      // Internal: join-by-code handoff. index.ts has already resolved the
      // code through the Registry (rate-limited there); this completes the
      // join with the stored access token — the same path a link join takes.
      if (path === '/code-join' && method === 'POST') return await this.handleCodeJoin(request, now);

      const auth = await this.ensureAuthorized(request, now);
      if ('response' in auth) return auth.response;
      const { participantId } = auth;

      if (path === '/items' && method === 'GET') return await this.handleList(url);
      if (path === '/items/text' && method === 'POST') return await this.handleAddText(request, participantId, now);
      if (path === '/items/file/init' && method === 'POST') return await this.handleFileInit(request, participantId, now);
      if (path === '/items/file/direct' && method === 'PUT') return await this.handleDirectUpload(request, participantId);
      if (path === '/items/file/part' && method === 'PUT') return await this.handlePartUpload(request, participantId);
      if (path === '/items/file/complete' && method === 'POST') return await this.handleFileComplete(request, participantId, now);
      if (path === '/items/file/abort' && method === 'POST') return await this.handleFileAbort(request, participantId);
      if (path === '/items/file/status' && method === 'GET') return await this.handleFileStatus(url, participantId);
      if (/^\/items\/[0-9a-f-]+\/download$/.test(path) && method === 'GET') return await this.handleDownload(path, now);
      if (/^\/items\/[0-9a-f-]+$/.test(path) && method === 'DELETE') return await this.handleDelete(path, request, participantId);
      if (path === '/subscribe' && method === 'POST') return await this.handleSubscribe(request, participantId);
      if (path === '/unsubscribe' && method === 'POST') return await this.handleUnsubscribe(request, participantId);
      if (path === '/heartbeat' && method === 'POST') return this.handleHeartbeat(participantId, now);
      if (path === '/close' && method === 'POST') return await this.handleClose(request, participantId, now);
      if (path === '/info' && method === 'GET') return this.handleInfo(now);

      return json({ error: 'Not found' }, 404);
    } catch (e) {
      log('request failed', path, e instanceof Error ? e.message : e);
      return json({ error: "Couldn't complete that request." }, 500);
    } finally {
      this.testNow = null;
    }
  }

  // ── state helpers ─────────────────────────────────────────────────────

  private async loadSpace(): Promise<SpaceState | null> {
    if (this.space) return this.space;
    this.space = (await this.ctx.storage.get<SpaceState>('space')) ?? null;
    return this.space;
  }

  private async saveSpace() {
    if (this.space) await this.ctx.storage.put('space', this.space);
  }

  /** Call into the Registry singleton that owns the space-code index. */
  private registryRequest(path: string, body: unknown, method = 'POST'): Promise<Response> {
    const id = this.env.REGISTRY.idFromName('space-codes');
    const stub = this.env.REGISTRY.get(id);
    return stub.fetch(new Request('https://internal' + path, {
      method,
      ...(method === 'GET'
        ? undefined
        : { body: JSON.stringify(body) }),
      ...(method === 'GET' && body
        ? undefined
        : { headers: { 'content-type': 'application/json' } }),
    }));
  }

  private nowMs(): number {
    return this.testNow ?? Date.now();
  }

  /** Register (or refresh) a member. Member records live under member:<pid>
   *  so a device's name survives DO restarts without bloating SpaceState. */
  private async registerMember(participantId: string, name: string | null, now: number): Promise<boolean> {
    const s = this.space!;
    if (s.members[participantId]) {
      s.members[participantId].lastSeen = now;
      if (name) {
        const rec = await this.ctx.storage.get<MemberRecord>('member:' + participantId);
        if (rec && rec.name !== name) {
          rec.name = name;
          await this.ctx.storage.put('member:' + participantId, rec);
        }
      }
      return true;
    }
    if (Object.keys(s.members).length >= MEMBERS_SOFT_CAP) return false;
    s.members[participantId] = { name: name || 'A device', joinedAt: now, lastSeen: now };
    await this.ctx.storage.put('member:' + participantId, { name: name || 'A device', joinedAt: now } satisfies MemberRecord);
    await this.saveSpace();
    this.broadcast('members_changed', { memberCount: Object.keys(s.members).length });
    return true;
  }

  /** Async authorization: hash the presented token, timing-compare, check expiry.
   *  Returns the DEVICE-scoped participantId (hash-derived → stable per device). */
  private async ensureAuthorized(request: Request, now: number): Promise<{ participantId: string } | { response: Response }> {
    const cred = bearerOf(request);
    const deny = () => ({ response: json({ error: 'Unauthorized' }, 401) });
    if (!cred || !this.space) return deny();
    const hash = await sha256Hex(cred);
    const isMember = timingSafeEqual(hash, this.space.tokenHash);
    const isManager = timingSafeEqual(hash, this.space.manageHash);
    if (!isMember && !isManager) return deny();
    // A VALID credential on a closed/expired space gets the honest
    // 410 {closed:true} — not a generic 401 (§6: authorization is
    // invalidated at the boundary, and clients can show why).
    if (this.space.state !== 'ACTIVE' || now >= this.space.expiresAt) {
      return { response: json({ error: 'Gone', closed: true }, 410) };
    }
    const participantId = await pidFor(hash, deviceKeyOf(request));
    // The MANAGE key authorizes but never registers a member row: the
    // creator's day-to-day identity is their token identity (§38 — the
    // creator counts once, not twice).
    if (isMember) {
      let name: string | null = request.headers.get('x-device-name');
      if (name) name = sanitizeMemberName(name).slice(0, 40) || null;
      if (!(await this.registerMember(participantId, name, now))) {
        return { response: json({ error: 'This space has too many members right now.' }, 429) };
      }
    }
    return { participantId };
  }

  /** True when the presented credential is the creator's manage key. */
  private isManageCred(hash: string): boolean {
    return !!this.space && timingSafeEqual(hash, this.space.manageHash);
  }

  // ── WebSocket lifecycle (hibernation API) ─────────────────────────────

  private upgrade(): Response {
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    const cid = crypto.randomUUID();
    this.ctx.acceptWebSocket(server, [cid]);
    this.conns.set(cid, { authorized: false, participantId: null });
    return new Response(null, { status: 101, webSocket: client });
  }

  /** The cid is the socket's first acceptance tag — stable across wakes. */
  private cidOf(ws: WebSocket): string | null {
    const tags = this.ctx.getTags(ws);
    return tags.length ? tags[0] : null;
  }

  private socketOf(cid: string): WebSocket | null {
    for (const ws of this.ctx.getWebSockets(cid)) {
      if (ws.readyState === 1) return ws;
    }
    return null;
  }

  /** Adopt (or re-adopt) a socket's metadata. After a hibernation wake the
   *  in-memory map is empty; sockets come back unauthorized and must
   *  re-send join_space — the client does this automatically. */
  private adopt(cid: string): ConnMeta {
    let meta = this.conns.get(cid);
    if (!meta) {
      meta = { authorized: false, participantId: null };
      this.conns.set(cid, meta);
    }
    return meta;
  }

  private broadcast(event: string, payload: unknown) {
    const frame = JSON.stringify({ type: 'event', event, payload });
    for (const [cid, meta] of this.conns) {
      if (!meta.authorized) continue;
      const ws = this.socketOf(cid);
      if (ws) { try { ws.send(frame); } catch { /* dead socket */ } }
    }
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer) {
    if (typeof message !== 'string') return;
    let msg: WireMsg;
    try { msg = JSON.parse(message); } catch { return; }
    if (msg.v !== PROTOCOL_VERSION || typeof msg.event !== 'string') return;

    const cid = this.cidOf(ws);
    if (!cid) return;
    const meta = this.adopt(cid);

    await this.loadSpace();
    const now = this.nowMs();

    if (msg.event === 'join_space') {
      const token = typeof msg.payload?.token === 'string' ? msg.payload.token : '';
      let hash: string | null = null;
      let joinerIsCreator = false;
      if (token && this.space && this.space.state === 'ACTIVE' && now < this.space.expiresAt) {
        const h = await sha256Hex(token);
        joinerIsCreator = timingSafeEqual(h, this.space.manageHash);
        if (joinerIsCreator || timingSafeEqual(h, this.space.tokenHash)) hash = h;
      }
      if (!hash) {
        meta.authorized = false;
        try { ws.send(JSON.stringify({ type: 'event', event: 'space_auth_failed' })); } catch { /* noop */ }
        try { ws.close(4001, 'unauthorized'); } catch { /* noop */ }
        return;
      }
      meta.authorized = true;
      meta.participantId = await pidFor(hash, deviceKeyOfWebSocket(msg.payload));
      const joinerIsMember = timingSafeEqual(hash, this.space!.tokenHash);
      const devName = typeof msg.payload?.name === 'string' ? msg.payload.name : null;
      if (joinerIsMember) await this.registerMember(meta.participantId, devName, now);
      // Roster snapshot on join — deltas only afterwards.
      const items = await this.listItems(0);
      const s = this.space!;
      try {
        ws.send(JSON.stringify({
          type: 'event', event: 'space_sync', payload: {
            name: s.name, expiresAt: s.expiresAt, seq: s.itemSeq,
            memberCount: Object.keys(s.members).length,
            isCreator: joinerIsCreator,
            items,
          },
        }));
      } catch { /* noop */ }
      this.broadcast('members_changed', { memberCount: Object.keys(s.members).length });
      return;
    }

    if (!meta.authorized) return;

    if (msg.event === 'heartbeat') {
      if (meta.participantId && this.space) {
        const member = this.space.members[meta.participantId];
        if (member) { member.lastSeen = now; await this.saveSpace(); }
      }
      try { ws.send(JSON.stringify({ type: 'event', event: 'heartbeat_ack', payload: { now, expiresAt: this.space?.expiresAt } })); } catch { /* noop */ }
      return;
    }
  }

  async webSocketClose(ws: WebSocket) {
    const cid = this.cidOf(ws);
    if (!cid) return;
    const meta = this.conns.get(cid);
    this.conns.delete(cid);
    if (meta?.authorized) {
      this.broadcast('members_changed', { memberCount: this.liveMemberCount() });
    }
  }

  private liveMemberCount(): number {
    return this.space ? Object.keys(this.space.members).length : 0;
  }

  // ── HTTP handlers ─────────────────────────────────────────────────────

  private async handleCreate(request: Request, now: number): Promise<Response> {
    if (this.space) return json({ error: 'This space already exists.' }, 409);
    let body: { name?: unknown; durationMs?: unknown; code?: unknown };
    try { body = await request.json() as typeof body; } catch {
      return json({ error: 'Bad request' }, 400);
    }
    const durationMs = Number(body.durationMs);
    if (!SPACE_DURATIONS.includes(durationMs)) {
      return json({ error: 'Choose how long the space should stay open.' }, 400);
    }
    // Optional human code (F21): re-validated server-side (shape + global
    // collision in the Registry). A taken code 409s with codeTaken — no
    // silent replacement, ever.
    let code: string | null = null;
    const rawCode = typeof body.code === 'string' ? normalizeSpaceCode(body.code) : '';
    const expiresAt = now + durationMs;
    if (rawCode) {
      if (!isValidSpaceCode(rawCode)) {
        return json({ error: 'Codes use 8 letters/numbers — no 0, O, 1, I, L, 5, S or B.' }, 400);
      }
      const reg = await this.registryRequest('/space-code/register', { code: rawCode, spaceId: this.urlSpaceId, expiresAt });
      if (!reg.ok) {
        const out = (await reg.json().catch(() => ({}))) as { suggestion?: string };
        return json({ error: 'This code is already in use. Try another one.', codeTaken: true, suggestion: out.suggestion }, 409);
      }
      code = rawCode;
    }
    const token = randomToken();
    const manage = randomToken();
    const tokenHash = await sha256Hex(token);
    const manageHash = await sha256Hex(manage);
    const spaceId = this.urlSpaceId || crypto.randomUUID();
    const reminderAt = now + Math.max(60_000, durationMs - reminderOffsetFor(durationMs));
    const creatorId = await pidFor(tokenHash, deviceKeyOf(request));
    this.space = {
      spaceId,
      name: sanitizeSpaceName(body.name),
      tokenHash,
      manageHash,
      createdAt: now,
      expiresAt,
      durationMs,
      state: 'ACTIVE',
      creatorId,      // token identity — manage key only authorizes
      members: {},
      itemSeq: 0,
      reminderAt,
      reminderSent: false,
    };
    await this.saveSpace();
    await this.ctx.storage.setAlarm(reminderAt);
    // join-by-code needs the ACCESS TOKEN (discovery hands the joiner the
    // credential it will present). Stored DO-side only; the Registry never
    // sees it. Generated when the creator didn't pick one.
    if (!code) {
      for (let attempt = 0; attempt < 10; attempt++) {
        const candidate = generateSpaceCode();
        const reg = await this.registryRequest('/space-code/register', { code: candidate, spaceId, expiresAt });
        if (reg.ok) { code = candidate; break; }
      }
    }
    await this.ctx.storage.put('access-token', token);
    if (code) await this.ctx.storage.put('space-code', code);
    // Creator joins as the first member under their manage identity.
    await this.registerMember(this.space.creatorId, sanitizeMemberName(request.headers.get('x-device-name')), now);
    log('space created', spaceId.slice(0, 8), 'code', code, 'closes', new Date(this.space.expiresAt).toISOString());
    return json({
      spaceId, token, manageKey: manage, name: this.space.name, code,
      createdAt: this.space.createdAt, expiresAt: this.space.expiresAt, reminderAt,
      isCreator: true, participantId: this.space.creatorId,
    });
    // Creator identity: token-derived (manage key only authorizes).
  }

  private async handleJoin(request: Request, now: number): Promise<Response> {
    // Join = verify credential + return snapshot. Unknown space, wrong
    // credential, and expired space share one 401/410 shape (no oracle).
    const cred = bearerOf(request);
    if (!cred || !this.space) return json({ error: 'Unauthorized' }, 401);
    const hash = await sha256Hex(cred);
    const isMember = timingSafeEqual(hash, this.space.tokenHash);
    const isManager = timingSafeEqual(hash, this.space.manageHash);
    if (!isMember && !isManager) return json({ error: 'Unauthorized' }, 401);
    if (this.space.state !== 'ACTIVE' || now >= this.space.expiresAt) {
      return json({ error: 'Gone', closed: true }, 410);
    }
    const participantId = await pidFor(hash, deviceKeyOf(request));
    let name: string | null = request.headers.get('x-device-name');
    if (name) name = sanitizeMemberName(name).slice(0, 40) || null;
    if (isMember && !(await this.registerMember(participantId, name, now))) {
      return json({ error: 'This space has too many members right now.' }, 429);
    }
    const items = await this.listItems(0);
    const s = this.space;
    return json({
      spaceId: s.spaceId, name: s.name,
      createdAt: s.createdAt, expiresAt: s.expiresAt, durationMs: s.durationMs,
      memberCount: Object.keys(s.members).length,
      isCreator: isManager,
      participantId,
      items,
    });
  }

  private async listItems(sinceSeq: number): Promise<ItemMeta[]> {
    const entries = await this.ctx.storage.list<ItemMeta>({ prefix: 'item:' });
    const items: ItemMeta[] = [];
    for (const v of entries.values()) {
      if (v.seq > sinceSeq) items.push(v);
    }
    items.sort((a, b) => b.createdAt - a.createdAt || b.seq - a.seq); // newest first
    return items;
  }

  private async handleList(url: URL): Promise<Response> {
    const since = Number(url.searchParams.get('since') || 0);
    const items = await this.listItems(Number.isFinite(since) ? since : 0);
    return json({ seq: this.space?.itemSeq ?? 0, items });
  }

  private async nextSeq(): Promise<number> {
    const s = await this.loadSpace();
    s!.itemSeq += 1;
    await this.saveSpace();
    return s!.itemSeq;
  }

  private async handleAddText(request: Request, participantId: string, now: number): Promise<Response> {
    let body: { text?: unknown; kind?: unknown };
    try { body = await request.json() as typeof body; } catch { return json({ error: 'Bad request' }, 400); }
    const text = typeof body.text === 'string' ? body.text : '';
    if (!text.trim()) return json({ error: 'Add some text first.' }, 400);
    if (text.length > TEXT_MAX) {
      return json({ error: `Text is too large for a space item (${Math.round(TEXT_MAX / 1024)} KB max). Save it as a file instead.` }, 413);
    }
    const kind = body.kind === 'link' ? 'link' : 'text';
    const member = this.space!.members[participantId];
    const item: ItemMeta = {
      id: crypto.randomUUID(), seq: await this.nextSeq(), kind,
      mime: kind === 'link' ? 'text/uri-list' : 'text/plain',
      size: text.length, createdAt: now, addedBy: participantId,
      addedByName: member?.name || 'A device', text,
      state: 'READY',
    };
    await this.ctx.storage.put('item:' + item.id, item);
    this.broadcast('item_added', { item });
    return json({ item });
  }

  private partSizeFor(size: number): number {
    let part = R2_PART_MIN;
    while (part * 10_000 < size && part < R2_PART_CAP) part *= 4;
    return Math.min(part, R2_PART_CAP);
  }

  private async handleFileInit(request: Request, participantId: string, now: number): Promise<Response> {
    let body: { name?: unknown; mime?: unknown; size?: unknown; sha256?: unknown };
    try { body = await request.json() as typeof body; } catch { return json({ error: 'Bad request' }, 400); }
    const size = Number(body.size);
    const name = sanitizeFilename(typeof body.name === 'string' ? body.name : 'file');
    const mime = typeof body.mime === 'string' && body.mime.length <= 120 ? body.mime : 'application/octet-stream';
    const sha256 = typeof body.sha256 === 'string' && /^[0-9a-f]{64}$/i.test(body.sha256) ? body.sha256.toLowerCase() : undefined;
    if (!Number.isFinite(size) || size <= 0) return json({ error: 'That file has no content.' }, 400);
    if (size > R2_OBJECT_CAP) {
      return json({ error: "That file is beyond what storage supports. It can't be kept in a space." }, 413);
    }
    const space = this.space!;
    const itemId = crypto.randomUUID();
    const member = space.members[participantId];
    const meta: ItemMeta = {
      id: itemId, seq: 0, kind: 'file', name, mime, size, createdAt: now,
      addedBy: participantId, addedByName: member?.name || 'A device',
      r2Key: `spaces/${space.spaceId}/${itemId}/object`, sha256, state: 'UPLOADING',
    };
    if (size <= DIRECT_UPLOAD_MAX) {
      await this.ctx.storage.put('pending:' + itemId, meta);
      return json({ itemId, mode: 'direct' as const, item: meta });
    }
    if (!this.env.SPACE_BUCKET) return json({ error: 'Storage is not configured.' }, 503);
    const partSize = this.partSizeFor(size);
    const mpu = await this.env.SPACE_BUCKET.createMultipartUpload(meta.r2Key!);
    const state: MultipartState = {
      itemId, uploadId: mpu.uploadId, name, mime, size, sha256,
      addedBy: participantId, addedByName: member?.name || 'A device',
      partSize, parts: {}, createdAt: now,
    };
    await this.ctx.storage.put('upload:' + itemId, state);
    const partCount = Math.ceil(size / partSize);
    return json({ itemId, mode: 'multipart' as const, partSize, partCount, item: meta });
  }

  /** Small-file path: one request body streams straight into R2. */
  private async handleDirectUpload(request: Request, participantId: string): Promise<Response> {
    if (!this.env.SPACE_BUCKET) return json({ error: 'Storage is not configured.' }, 503);
    const itemId = new URL(request.url).searchParams.get('itemId') || '';
    const meta = await this.ctx.storage.get<ItemMeta>('pending:' + itemId);
    if (!meta) return json({ error: 'Unknown upload.' }, 404);
    if (meta.addedBy !== participantId) return json({ error: 'Unauthorized' }, 401);
    if (meta.size > DIRECT_UPLOAD_MAX) return json({ error: 'Use a multipart upload for this size.' }, 400);
    if (!request.body) return json({ error: 'Empty upload.' }, 400);
    try {
      await this.env.SPACE_BUCKET.put(meta.r2Key!, request.body, {
        httpMetadata: { contentType: meta.mime },
        sha256: meta.sha256 ? hexToBytes(meta.sha256) : undefined,
      });
    } catch (e) {
      log('direct upload failed', meta.name, e instanceof Error ? e.message : e);
      return json({ error: "Couldn't store that file. Try again." }, 502);
    }
    // Integrity check when the client supplied a hash.
    if (meta.sha256) {
      const head = await this.env.SPACE_BUCKET.head(meta.r2Key!);
      if (!head || head.size !== meta.size) {
        await this.env.SPACE_BUCKET.delete(meta.r2Key!);
        return json({ error: "The file didn't upload completely. Try again." }, 502);
      }
    }
    meta.seq = await this.nextSeq();
    meta.state = 'READY';
    await this.ctx.storage.put('item:' + itemId, meta);
    await this.ctx.storage.delete('pending:' + itemId);
    this.broadcast('item_added', { item: meta });
    log('direct upload complete', meta.name, meta.size);
    return json({ item: meta });
  }

  /** One multipart part. Streams to R2 — never buffered whole. */
  private async handlePartUpload(request: Request, participantId: string): Promise<Response> {
    if (!this.env.SPACE_BUCKET) return json({ error: 'Storage is not configured.' }, 503);
    const url = new URL(request.url);
    const itemId = url.searchParams.get('itemId') || '';
    const partNumber = Number(url.searchParams.get('partNumber'));
    const state = await this.ctx.storage.get<MultipartState>('upload:' + itemId);
    if (!state) return json({ error: 'Unknown upload.' }, 404);
    if (state.addedBy !== participantId) return json({ error: 'Unauthorized' }, 401);
    if (!Number.isInteger(partNumber) || partNumber < 1 || partNumber > 10_000) {
      return json({ error: 'Bad part number.' }, 400);
    }
    if (!request.body) return json({ error: 'Empty part.' }, 400);
    const key = `spaces/${(await this.loadSpace())!.spaceId}/${itemId}/object`;
    const upload = this.env.SPACE_BUCKET.resumeMultipartUpload(key, state.uploadId);
    try {
      const part = await upload.uploadPart(partNumber, request.body);
      state.parts[partNumber] = part.etag;
      await this.ctx.storage.put('upload:' + itemId, state);
      return json({ partNumber, etag: part.etag, uploadedParts: Object.keys(state.parts).length });
    } catch (e) {
      log('part upload failed', itemId, partNumber, e instanceof Error ? e.message : e);
      return json({ error: "That part didn't upload. Retry it." }, 502);
    }
  }

  private async handleFileComplete(request: Request, participantId: string, now: number): Promise<Response> {
    if (!this.env.SPACE_BUCKET) return json({ error: 'Storage is not configured.' }, 503);
    let body: { itemId?: unknown; parts?: unknown };
    try { body = await request.json() as typeof body; } catch { return json({ error: 'Bad request' }, 400); }
    const itemId = typeof body.itemId === 'string' ? body.itemId : '';
    const state = await this.ctx.storage.get<MultipartState>('upload:' + itemId);
    if (!state) return json({ error: 'Unknown upload.' }, 404);
    if (state.addedBy !== participantId) return json({ error: 'Unauthorized' }, 401);
    const key = `spaces/${(await this.loadSpace())!.spaceId}/${itemId}/object`;
    const upload = this.env.SPACE_BUCKET.resumeMultipartUpload(key, state.uploadId);
    // Authoritative parts come from OUR records. A client completion that
    // doesn't match the recorded part numbers is a replay/fabrication.
    const ourParts = Object.entries(state.parts)
      .map(([n, etag]) => ({ partNumber: Number(n), etag }))
      .sort((a, b) => a.partNumber - b.partNumber);
    const clientParts = Array.isArray(body.parts)
      ? (body.parts as unknown[]).map(p => Number((p as { partNumber?: unknown })?.partNumber)).filter(Number.isInteger)
      : [];
    const expectedCount = Math.ceil(state.size / state.partSize);
    const numbersMatch = ourParts.length === clientParts.length
      && ourParts.every((p, i) => p.partNumber === clientParts[i]);
    if (!numbersMatch || ourParts.length !== expectedCount) {
      return json({ error: 'Not all parts finished uploading yet.' }, 409);
    }
    try {
      const completed = await upload.complete(ourParts.map(p => ({ partNumber: p.partNumber, etag: p.etag })));
      if (completed.size !== state.size) {
        await upload.abort();
        await this.ctx.storage.delete('upload:' + itemId);
        return json({ error: "The file didn't upload completely. Try again." }, 502);
      }
      const member = (await this.loadSpace())!.members[participantId];
      const meta: ItemMeta = {
        id: itemId, seq: await this.nextSeq(), kind: 'file', name: state.name, mime: state.mime,
        size: state.size, createdAt: now, addedBy: participantId,
        addedByName: member?.name || 'A device', r2Key: key, sha256: state.sha256, state: 'READY',
      };
      await this.ctx.storage.put('item:' + itemId, meta);
      await this.ctx.storage.delete('upload:' + itemId);
      this.broadcast('item_added', { item: meta });
      log('multipart complete', meta.name, meta.size, ourParts.length, 'parts');
      return json({ item: meta });
    } catch (e) {
      log('multipart complete failed', itemId, e instanceof Error ? e.message : e);
      return json({ error: "Couldn't finish the upload. Retry the missing parts." }, 502);
    }
  }

  private async handleFileAbort(request: Request, participantId: string): Promise<Response> {
    const itemId = new URL(request.url).searchParams.get('itemId') || '';
    const state = await this.ctx.storage.get<MultipartState>('upload:' + itemId);
    const pending = await this.ctx.storage.get<ItemMeta>('pending:' + itemId);
    const owner = state?.addedBy ?? pending?.addedBy;
    if (!owner || owner !== participantId) return json({ error: 'Unknown upload.' }, 404);
    if (state && this.env.SPACE_BUCKET) {
      try {
        const key = `spaces/${(await this.loadSpace())!.spaceId}/${itemId}/object`;
        await this.env.SPACE_BUCKET.resumeMultipartUpload(key, state.uploadId).abort();
      } catch { /* already gone */ }
    }
    await this.ctx.storage.delete('upload:' + itemId);
    await this.ctx.storage.delete('pending:' + itemId);
    return json({ ok: true });
  }

  /** Upload-state probe for the resume flow: which parts of this item's
   *  multipart upload already reached the server? Only the uploader (or the
   *  creator) may read it — a random id probe returns 404. */
  private async handleFileStatus(url: URL, participantId: string): Promise<Response> {
    const itemId = url.searchParams.get('itemId') || '';
    const state = await this.ctx.storage.get<MultipartState>('upload:' + itemId);
    if (state) {
      if (state.addedBy !== participantId) return json({ error: 'Unauthorized' }, 401);
      return json({
        itemId, mode: 'multipart' as const, state: 'UPLOADING',
        partSize: state.partSize,
        uploadedParts: Object.keys(state.parts).map(Number).sort((a, b) => a - b),
      });
    }
    const pending = await this.ctx.storage.get<ItemMeta>('pending:' + itemId);
    if (pending) {
      if (pending.addedBy !== participantId) return json({ error: 'Unauthorized' }, 401);
      return json({ itemId, mode: 'direct' as const, state: 'UPLOADING' });
    }
    return json({ error: 'Unknown upload.' }, 404);
  }

  /** Downloads stream straight from R2. Authorization is per-request — a
   *  download can never outlive the space, because every request is
   *  re-checked against the live expiry. */
  private async handleDownload(path: string, now: number): Promise<Response> {
    if (!this.space || this.space.state !== 'ACTIVE' || now >= this.space.expiresAt) {
      return json({ error: 'Gone', closed: true }, 410);
    }
    const itemId = path.split('/')[2];
    const item = await this.ctx.storage.get<ItemMeta>('item:' + itemId);
    if (!item || item.kind !== 'file' || !item.r2Key || !this.env.SPACE_BUCKET) {
      return json({ error: 'Not found' }, 404);
    }
    const obj = await this.env.SPACE_BUCKET.get(item.r2Key);
    if (!obj) return json({ error: 'Not found' }, 404);
    const safeName = (item.name || 'file').replace(/["\\\r\n]/g, '');
    return new Response(obj.body, {
      headers: {
        'content-type': item.mime,
        'content-length': String(item.size),
        // Always download-only: uploaded content is never executed on our origin.
        'content-disposition': `attachment; filename="${safeName}"; filename*=UTF-8''${encodeURIComponent(item.name || 'file')}`,
        'x-content-type-options': 'nosniff',
        'cache-control': 'private, no-store',
      },
    });
  }

  private async handleDelete(path: string, request: Request, participantId: string): Promise<Response> {
    const itemId = path.split('/')[2];
    const item = await this.ctx.storage.get<ItemMeta>('item:' + itemId);
    if (!item) return json({ error: 'Not found' }, 404);
    const hash = await sha256Hex(bearerOf(request));
    const isCreator = this.isManageCred(hash);
    if (item.addedBy !== participantId && !isCreator) {
      return json({ error: "Only the device that added this — or the space's creator — can remove it." }, 403);
    }
    await this.deleteItem(item);
    this.broadcast('item_deleted', { itemId });
    return json({ ok: true });
  }

  private async deleteItem(item: ItemMeta) {
    if (item.r2Key && this.env.SPACE_BUCKET) {
      try { await this.env.SPACE_BUCKET.delete(item.r2Key); } catch { /* cleanup phase retries */ }
    }
    await this.ctx.storage.delete('item:' + item.id);
  }

  private async handleSubscribe(request: Request, participantId: string): Promise<Response> {
    let body: { endpoint?: unknown; keys?: unknown };
    try { body = await request.json() as typeof body; } catch { return json({ error: 'Bad request' }, 400); }
    const endpoint = typeof body.endpoint === 'string' ? body.endpoint : '';
    const keys = (body.keys ?? {}) as { p256dh?: unknown; auth?: unknown };
    const p256dh = typeof keys.p256dh === 'string' ? keys.p256dh : '';
    const auth = typeof keys.auth === 'string' ? keys.auth : '';
    if (!endpoint.startsWith('https://') || !p256dh || !auth) {
      return json({ error: 'Bad subscription.' }, 400);
    }
    const subs = await this.ctx.storage.list<SubRecord>({ prefix: 'sub:' });
    for (const rec of subs.values()) {
      if (rec.endpoint === endpoint) return json({ ok: true, reminderAt: this.space?.reminderAt }); // idempotent
    }
    if (subs.size >= SUBS_MAX) return json({ error: 'Too many reminder devices for this space.' }, 429);
    await this.ctx.storage.put('sub:' + crypto.randomUUID(), { endpoint, p256dh, auth, addedBy: participantId } satisfies SubRecord);
    return json({ ok: true, reminderAt: this.space?.reminderAt });
  }

  private async handleUnsubscribe(request: Request, participantId: string): Promise<Response> {
    let body: { endpoint?: unknown };
    try { body = await request.json() as typeof body; } catch { return json({ error: 'Bad request' }, 400); }
    const endpoint = typeof body.endpoint === 'string' ? body.endpoint : '';
    const subs = await this.ctx.storage.list<SubRecord>({ prefix: 'sub:' });
    for (const [key, rec] of subs) {
      if (rec.endpoint === endpoint && rec.addedBy === participantId) await this.ctx.storage.delete(key);
    }
    return json({ ok: true });
  }

  private handleHeartbeat(participantId: string, now: number): Response {
    const member = this.space?.members[participantId];
    if (member) { member.lastSeen = now; void this.saveSpace(); }
    return json({ ok: true, expiresAt: this.space?.expiresAt });
  }

  private async handleClose(request: Request, participantId: string, now: number): Promise<Response> {
    if (!this.space) return json({ error: 'Not found' }, 404);
    const hash = await sha256Hex(bearerOf(request));
    // The manage key alone is the creator credential — exactly one exists,
    // minted at create time.
    if (!this.isManageCred(hash)) {
      return json({ error: 'Only the space creator can close it early.' }, 403);
    }
    if (now >= this.space.expiresAt) return json({ ok: true }); // already closing
    log('space closed early by creator');
    await this.beginExpiry('closed_early');
    return json({ ok: true });
  }

  private handleInfo(now: number): Response {
    if (!this.space) return json({ error: 'Not found' }, 404);
    if (this.space.state !== 'ACTIVE' || now >= this.space.expiresAt) {
      return json({ error: 'Gone', closed: true }, 410);
    }
    return json({
      spaceId: this.space.spaceId, name: this.space.name,
      createdAt: this.space.createdAt, expiresAt: this.space.expiresAt,
      memberCount: Object.keys(this.space.members).length,
    });
  }

  // ── expiry + cleanup ──────────────────────────────────────────────────

  /** Mark the space closed authoritatively and tell live clients. */
  /** Join via the code handoff: the Registry already validated the code
   *  (rate-limited, no oracle). This completes the join with the stored
   *  access token — identical to a link join from here on. */
  private async handleCodeJoin(request: Request, now: number): Promise<Response> {
    const token = await this.ctx.storage.get<string>('access-token');
    if (!token || !this.space) return json({ error: 'No space with that code is open right now.' }, 404);
    if (this.space.state !== 'ACTIVE' || now >= this.space.expiresAt) {
      return json({ error: 'No space with that code is open right now.' }, 404);
    }
    const inner = new Request('https://internal/join', request);
    inner.headers.set('authorization', `Bearer ${token}`);
    const res = await this.handleJoin(inner, now);
    res.headers.set('x-space-token', token); // the device keeps this for rejoin
    return res;
  }

  private async beginExpiry(reason: 'expired' | 'closed_early') {
    const s = this.space;
    if (!s) return;
    s.state = 'EXPIRED';
    // The code dies with the space — unregister it so the code index never
    // answers for a closed space (the lookup would 404 anyway via expiresAt,
    // but explicit removal frees the code for reuse and keeps the index lean).
    const code = await this.ctx.storage.get<string>('space-code');
    if (code) await this.registryRequest('/space-code/unregister', { code }).catch(() => undefined);
    await this.ctx.storage.delete('access-token');
    await this.ctx.storage.delete('space-code');
    await this.saveSpace();
    this.broadcast('space_closed', { reason, expiresAt: s.expiresAt });
    for (const cid of [...this.conns.keys()]) {
      const ws = this.socketOf(cid);
      if (ws) { try { ws.close(1000, 'space_closed'); } catch { /* noop */ } }
    }
    this.conns.clear();
    await this.ctx.storage.setAlarm(Date.now() + CLEANUP_DELAY_MS);
  }

  async alarm() {
    await this.loadSpace();
    const s = this.space;
    if (!s) { await this.ctx.storage.deleteAll(); return; }
    const now = this.nowMs();

    // Phase 1: the one-time reminder (before expiry).
    if (s.state === 'ACTIVE' && now < s.expiresAt) {
      if (!s.reminderSent && now >= s.reminderAt) {
        await this.sendReminder();
        s.reminderSent = true;
        await this.saveSpace();
      }
      await this.ctx.storage.setAlarm(s.reminderSent ? s.expiresAt : Math.min(s.reminderAt, s.expiresAt));
      return;
    }

    // Phase 2: the expiry boundary.
    if (s.state === 'ACTIVE' && now >= s.expiresAt) {
      await this.beginExpiry('expired');
      return;
    }

    // Phase 3: cleanup (EXPIRED). Batched and retryable — if anything fails
    // the alarm re-arms and tries again. Logical closure already happened.
    try {
      await this.runCleanup();
    } catch (e) {
      log('cleanup pass failed, will retry', e instanceof Error ? e.message : e);
      await this.ctx.storage.setAlarm(Date.now() + 30_000);
    }
  }

  private async sendReminder() {
    const s = this.space!;
    const subs = await this.ctx.storage.list<SubRecord>({ prefix: 'sub:' });
    if (subs.size === 0) return;
    if (!this.env.VAPID_PUBLIC_KEY || !this.env.VAPID_PRIVATE_KEY || !this.env.VAPID_SUBJECT) return;
    const hoursLeft = Math.max(0, (s.expiresAt - this.nowMs()) / 3_600_000);
    const hours = hoursLeft >= 1 ? `${Math.round(hoursLeft * 10) / 10}` : '<1';
    const title = 'Your ShareTexts space closes soon';
    const body = `It closes in about ${hours} hours. Open it if you still need anything inside.`;
    for (const [key, sub] of subs) {
      try {
        await sendSpaceReminderPush(this.env, sub, { title, body });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (/404|410|gone|invalid/i.test(msg)) {
          await this.ctx.storage.delete(key); // dead subscription — remove it
        } else {
          log('push failed (kept)', msg.slice(0, 120));
        }
      }
    }
  }

  private async runCleanup() {
    const s = this.space!;
    if (this.env.SPACE_BUCKET) {
      // 1. In-flight multipart uploads → abort (orphan prevention).
      const uploads = await this.ctx.storage.list<MultipartState>({ prefix: 'upload:' });
      for (const [, st] of uploads) {
        try {
          const key = `spaces/${s.spaceId}/${st.itemId}/object`;
          await this.env.SPACE_BUCKET.resumeMultipartUpload(key, st.uploadId).abort();
        } catch { /* already aborted */ }
      }
      // 2. Objects, batched (R2 allows up to 1000 keys per delete call).
      const items = await this.ctx.storage.list<ItemMeta>({ prefix: 'item:' });
      const keys = [...items.values()].map(i => i.r2Key).filter((k): k is string => !!k);
      for (let i = 0; i < keys.length; i += 900) {
        await this.env.SPACE_BUCKET.delete(keys.slice(i, i + 900));
      }
    }
    // 3. All DO state — metadata, items, subs, everything.
    await this.ctx.storage.deleteAll();
    this.space = null;
    log('space cleaned up', s.spaceId.slice(0, 8));
  }
}

function bearerOf(request: Request): string {
  const header = request.headers.get('authorization') || '';
  return header.startsWith('Bearer ') ? header.slice(7).trim() : '';
}

/** The device's stable local seed header. NOT a secret, never stored — only
 *  prevents two devices sharing one access token from collapsing into one
 *  member row. */
function deviceKeyOf(request: Request): string {
  const raw = request.headers.get('x-device-key');
  return raw ? sanitizeMemberName(raw).slice(0, 40) : '';
}

/** WebSocket variant: the join_space frame carries the same seed. */
function deviceKeyOfWebSocket(payload: { deviceKey?: unknown } | undefined): string {
  const raw = typeof payload?.deviceKey === 'string' ? payload.deviceKey : '';
  return raw ? sanitizeMemberName(raw).slice(0, 40) : '';
}

/** Device-scoped participant id: token hash (secret) + device seed. */
async function pidFor(tokenHash: string, deviceKey: string): Promise<string> {
  return 'p_' + (await sha256Hex(tokenHash + '.' + deviceKey)).slice(0, 16);
}
