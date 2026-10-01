/**
 * SpaceDev — the Node/dev Temporary Space backend (F14).
 *
 * The Cloudflare Worker runs the authoritative implementation (worker/src/space.ts:
 * a SQLite-backed Durable Object per space + R2 for content). This module gives
 * the local dev server (`tsx server.ts`) the SAME REST + WebSocket contract so
 * the feature is fully usable in `npm run dev` and in scripted browser tests —
 * no wrangler/R2 needed.
 *
 * Contract parity rules:
 *   · Same paths: /space/:id/create|join|items|items/text|items/file/*|subscribe|
 *     unsubscribe|heartbeat|close|info
 *   · Same auth: Bearer token (member) or manage key (creator), SHA-256-hashed
 *     at rest; per-device participant ids derived from the hash.
 *   · Same item/upload lifecycle: direct (≤90 MB) vs multipart (resumable,
 *     server-recorded parts), READY-only visibility, per-request download auth.
 *   · Same expiry semantics: absolute expiresAt, ACTIVE→EXPIRED→cleanup,
 *     reminder alarm equivalent (sweeper), one reminder per space.
 *   · Space test clock: SPACE_TEST_CLOCK=1 + x-space-test-now header — the
 *     exact mechanism the Worker uses, so expiry tests run against either.
 *
 * Differences (dev only): files land on disk under .spaces/<spaceId>/ instead
 * of R2, live updates ride the same socket.io server as the signaling instead
 * of the Hibernation API, and push sends no real Web Push (no VAPID in dev) —
 * the DO-side contract (reminder scheduled + sent once) is still observable.
 */

import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import type express from 'express';
import type { Server as SocketIOServer, Socket } from 'socket.io';
import { SPACE_DURATIONS, reminderOffsetFor } from './constants';

const TEXT_MAX = 512 * 1024;
const DIRECT_UPLOAD_MAX = 90 * 1024 * 1024;
const R2_PART_MIN = 8 * 1024 * 1024;
const R2_PART_CAP = 512 * 1024 * 1024;
const R2_OBJECT_CAP = 4.5 * 1024 * 1024 * 1024 * 1024;
const NAME_MAX = 80;
const FILENAME_MAX = 200;
const MEMBERS_SOFT_CAP = 200;
const SUBS_MAX = 20;
const CLEANUP_DELAY_MS = 5_000;
const SWEEP_INTERVAL_MS = 2_000;

function log(...parts: unknown[]) {
  console.log('[ShareText-space-dev]', ...parts);
}

function sha256Hex(input: string): string {
  return crypto.createHash('sha256').update(input, 'utf8').digest('hex');
}

function timingSafeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a, 'utf8');
  const bb = Buffer.from(b, 'utf8');
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

function base64url(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function randomToken(): string {
  return base64url(crypto.randomBytes(24));
}

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

function sanitizeSpaceName(raw: unknown): string {
  let name = typeof raw === 'string' ? raw.normalize('NFKC').replace(/[\u0000-\u001f\u007f<>]/g, '').trim() : '';
  if (name.length > NAME_MAX) name = name.slice(0, NAME_MAX);
  return name || 'Shared space';
}

function sanitizeMemberName(raw: unknown): string {
  let name = typeof raw === 'string' ? raw.normalize('NFKC').replace(/[\u0000-\u001f\u007f<>]/g, '').trim() : '';
  if (name.length > 40) name = name.slice(0, 40);
  return name || 'A device';
}

interface SpaceState {
  spaceId: string;
  name: string;
  tokenHash: string;
  manageHash: string;
  createdAt: number;
  expiresAt: number;
  durationMs: number;
  state: 'ACTIVE' | 'EXPIRED' | 'CLEANING_UP';
  creatorId: string;
  members: Record<string, { name: string; joinedAt: number; lastSeen: number }>;
  itemSeq: number;
  reminderAt: number;
  reminderSent: boolean;
}

interface ItemMeta {
  id: string;
  seq: number;
  kind: 'text' | 'link' | 'file';
  name?: string;
  mime: string;
  size: number;
  createdAt: number;
  addedBy: string;
  addedByName: string;
  text?: string;
  diskFile?: string; // replaces r2Key in dev: relative path under .spaces/
  sha256?: string;
  state: 'READY' | 'UPLOADING';
}

interface MultipartState {
  itemId: string;
  name: string;
  mime: string;
  size: number;
  sha256?: string;
  addedBy: string;
  addedByName: string;
  partSize: number;
  parts: Record<number, string>; // partNumber → received size (etag stand-in)
  received: number;
  createdAt: number;
}

interface SubRecord { endpoint: string; p256dh: string; auth: string; addedBy: string; }

/** Per-space store. Mirrors the one-DO-per-space isolation. */
interface SpaceDb {
  space: SpaceState;
  items: Map<string, ItemMeta>;        // item:<id> + pending:<id>
  uploads: Map<string, MultipartState>; // upload:<itemId>
  subs: Map<string, SubRecord>;         // sub:<n>
}

export class SpaceDev {
  private dbs = new Map<string, SpaceDb>();
  private sockets = new Map<string, Set<Socket>>(); // spaceId → sockets
  private cleanupTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private root: string;

  constructor(
    private io: SocketIOServer,
    /** Injectable clock switch for tests: SPACE_TEST_CLOCK=1 enables it. */
    private testClockEnabled: boolean = process.env.SPACE_TEST_CLOCK === '1',
    root?: string,
  ) {
    this.root = root || path.join(process.cwd(), '.spaces');
    try { fs.mkdirSync(this.root, { recursive: true }); } catch { /* read-only fs — spaces degrade to text-only */ }
  }

  /** The test clock: x-space-test-now header when the env switch is on. */
  private now(req: express.Request): number {
    if (this.testClockEnabled) {
      const t = Number(req.headers['x-space-test-now']);
      if (Number.isFinite(t) && t > 0) return t;
    }
    return Date.now();
  }

  private dbFor(spaceId: string): SpaceDb | null {
    return this.dbs.get(spaceId.toLowerCase()) ?? null;
  }

  private broadcastTo(spaceId: string, event: string, payload: unknown) {
    const room = this.sockets.get(spaceId.toLowerCase());
    if (!room) return;
    for (const s of room) {
      try { s.emit('space_event', { event, payload }); } catch { /* dead socket */ }
    }
  }

  private async beginExpiry(db: SpaceDb, reason: 'expired' | 'closed_early') {
    const s = db.space;
    s.state = 'EXPIRED';
    this.broadcastTo(s.spaceId, 'space_closed', { reason, expiresAt: s.expiresAt });
    const socks = this.sockets.get(s.spaceId.toLowerCase());
    if (socks) {
      for (const sk of socks) { try { sk.disconnect(true); } catch { /* noop */ } }
      this.sockets.delete(s.spaceId.toLowerCase());
    }
    const t = setTimeout(() => this.runCleanup(db), CLEANUP_DELAY_MS);
    if (typeof t.unref === 'function') t.unref();
    this.cleanupTimers.set(s.spaceId, t);
    log('space', reason, s.spaceId.slice(0, 8));
  }

  private async runCleanup(db: SpaceDb) {
    const s = db.space;
    // 1. Files on disk, batched by directory.
    try {
      const dir = path.join(this.root, s.spaceId);
      fs.rmSync(dir, { recursive: true, force: true });
    } catch { /* best effort — dev only */ }
    // 2. All state.
    this.dbs.delete(s.spaceId.toLowerCase());
    this.cleanupTimers.delete(s.spaceId);
    log('space cleaned up', s.spaceId.slice(0, 8));
  }

  /** Reminder scheduling + expiry sweep. One interval for all spaces — the
   *  dev stand-in for per-DO alarms. */
  start() {
    const timer = setInterval(() => {
      const now = this.testClockEnabled ? null : Date.now(); // test clock spaces are driven explicitly
      for (const db of this.dbs.values()) {
        const s = db.space;
        if (s.state === 'ACTIVE') {
          if (now === null) continue; // test-clock spaces wait for an explicit poke
          if (!s.reminderSent && now >= s.reminderAt) {
            s.reminderSent = true;
            this.sendReminder(db, now);
            log('reminder sent (dev)', s.spaceId.slice(0, 8), 'subs', db.subs.size);
          }
          if (now >= s.expiresAt) void this.beginExpiry(db, 'expired');
        }
      }
    }, SWEEP_INTERVAL_MS);
    if (typeof timer.unref === 'function') timer.unref();
  }

  /** Test hook: force the reminder + expiry evaluation as if time had moved
   *  to `atMs` (default: real now). Only meaningful with the clock enabled. */
  poke(spaceId: string, atMs?: number): void {
    const db = this.dbFor(spaceId);
    if (!db) return;
    const s = db.space;
    if (s.state !== 'ACTIVE') return;
    const now = atMs ?? Date.now();
    if (!s.reminderSent && now >= s.reminderAt) {
      s.reminderSent = true;
      this.sendReminder(db, now);
    }
    if (now >= s.expiresAt) void this.beginExpiry(db, 'expired');
  }

  private sendReminder(db: SpaceDb, now: number) {
    // Dev stand-in: the payload mirrors the DO's, but no real Web Push runs
    // here (no VAPID keys in dev). The observable contract — one reminder
    // per space, generic copy — is what tests assert.
    const s = db.space;
    const hoursLeft = Math.max(0, (s.expiresAt - now) / 3_600_000);
    const hours = hoursLeft >= 1 ? `${Math.round(hoursLeft * 10) / 10}` : '<1';
    log('push (dev stand-in)', JSON.stringify({
      title: 'Your ShareTexts space closes soon',
      body: `It closes in about ${hours} hours. Open it if you still need anything inside.`,
    }));
  }

  // ── routing ───────────────────────────────────────────────────────────

  /** Mount on an Express app. Called once from server.ts. */
  mount(app: express.Express) {
    app.use('/space/:id', (req, res, next) => {
      const id = String(req.params.id || '').toLowerCase();
      if (!/^[0-9a-f-]{36}$/.test(id)) {
        res.status(404).json({ error: 'Not found' });
        return;
      }
      (req as express.Request & { spacePath?: string }).spacePath = id;
      next();
    });

    app.post('/space/:id/create', async (req, res) => { await this.route(req, res, (db, ctx) => this.handleCreate(db, ctx)); });
    app.post('/space/:id/join', async (req, res) => { await this.route(req, res, (db, ctx) => this.handleJoin(db, ctx)); });
    app.get('/space/:id/items', async (req, res) => { await this.route(req, res, (db, ctx) => this.handleList(db, ctx)); });
    app.post('/space/:id/items/text', async (req, res) => { await this.route(req, res, (db, ctx) => this.handleAddText(db, ctx)); });
    app.post('/space/:id/items/file/init', async (req, res) => { await this.route(req, res, (db, ctx) => this.handleFileInit(db, ctx)); });
    app.put('/space/:id/items/file/direct', async (req, res) => { await this.route(req, res, (db, ctx) => this.handleDirectUpload(db, ctx)); });
    app.put('/space/:id/items/file/part', async (req, res) => { await this.route(req, res, (db, ctx) => this.handlePartUpload(db, ctx)); });
    app.post('/space/:id/items/file/complete', async (req, res) => { await this.route(req, res, (db, ctx) => this.handleFileComplete(db, ctx)); });
    app.post('/space/:id/items/file/abort', async (req, res) => { await this.route(req, res, (db, ctx) => this.handleFileAbort(db, ctx)); });
    app.get('/space/:id/items/file/status', async (req, res) => { await this.route(req, res, (db, ctx) => this.handleFileStatus(db, ctx)); });
    app.get('/space/:id/items/:itemId/download', async (req, res) => { await this.route(req, res, (db, ctx) => this.handleDownload(db, ctx, req.params.itemId)); });
    app.delete('/space/:id/items/:itemId', async (req, res) => { await this.route(req, res, (db, ctx) => this.handleDelete(db, ctx, req.params.itemId)); });
    app.post('/space/:id/subscribe', async (req, res) => { await this.route(req, res, (db, ctx) => this.handleSubscribe(db, ctx)); });
    app.post('/space/:id/unsubscribe', async (req, res) => { await this.route(req, res, (db, ctx) => this.handleUnsubscribe(db, ctx)); });
    app.post('/space/:id/heartbeat', async (req, res) => { await this.route(req, res, (db, ctx) => this.handleHeartbeat(db, ctx)); });
    app.post('/space/:id/close', async (req, res) => { await this.route(req, res, (db, ctx) => this.handleClose(db, ctx)); });
    app.get('/space/:id/info', async (req, res) => { await this.route(req, res, (db, ctx) => this.handleInfo(db, ctx)); });
  }

  /** Common request context passed to every handler. */
  private async route(
    req: express.Request,
    res: express.Response,
    handler: (db: SpaceDb | null, ctx: RouteCtx) => Promise<void> | void,
  ) {
    const spaceId = String(req.params.id || '').toLowerCase();
    const now = this.now(req);
    let db = this.dbFor(spaceId);
    try {
      // create needs no db; everything else 404s on unknown spaces (same
      // status shape as the Worker's DO, which 401s instead of 404ing to
      // avoid an existence oracle — dev keeps the same 401 for /join).
      const cred = bearerOf(req);
      let auth: { participantId: string; isCreator: boolean } | null = null;
      if (db && cred) {
        const hash = sha256Hex(cred);
        const isMember = timingSafeEqual(hash, db.space.tokenHash);
        const isManager = timingSafeEqual(hash, db.space.manageHash);
        if (isMember || isManager) {
          // A VALID credential on a closed/expired space gets the honest
          // 410 {closed:true} — not a generic 401 (§6: authorization is
          // invalidated at the boundary, and clients can show why).
          if (db.space.state !== 'ACTIVE' || now >= db.space.expiresAt) {
            res.status(410).json({ error: 'Gone', closed: true });
            return;
          }
          // Device-scoped id: token hash (secret) + the device's stable local
          // seed (NOT a secret) — two devices sharing one access token become
          // two members; one device rejoining keeps its identity (§38).
          // The MANAGE key authorizes but never registers a member row: the
          // creator's day-to-day identity is their token identity, so the
          // creator counts once, not twice.
          const participantId = pidFor(hash, deviceKeyOf(req));
          if (isMember) {
            const ok = this.registerMember(db, participantId, deviceNameOf(req), now);
            if (!ok) {
              res.status(429).json({ error: 'This space has too many members right now.' });
              return;
            }
          }
          auth = { participantId, isCreator: isManager };
        }
      }
      await handler(db, { req, res, now, cred, auth });
    } catch (e) {
      log('request failed', req.path, e instanceof Error ? e.message : e);
      if (!res.headersSent) res.status(500).json({ error: "Couldn't complete that request." });
    }
  }

  private registerMember(db: SpaceDb, participantId: string, name: string | null, now: number): boolean {
    const s = db.space;
    const existing = s.members[participantId];
    if (existing) {
      existing.lastSeen = now;
      return true;
    }
    if (Object.keys(s.members).length >= MEMBERS_SOFT_CAP) return false;
    s.members[participantId] = { name: name || 'A device', joinedAt: now, lastSeen: now };
    this.broadcastTo(s.spaceId, 'members_changed', { memberCount: Object.keys(s.members).length });
    return true;
  }

  // ── handlers (contract mirrors worker/src/space.ts) ───────────────────

  private async handleCreate(db: SpaceDb | null, ctx: RouteCtx) {
    if (db) return jsonOut(ctx.res, { error: 'This space already exists.' }, 409);
    const body = readJson(ctx.req);
    const durationMs = Number(body?.durationMs);
    if (!SPACE_DURATIONS.includes(durationMs)) {
      return jsonOut(ctx.res, { error: 'Choose how long the space should stay open.' }, 400);
    }
    const token = randomToken();
    const manage = randomToken();
    const tokenHash = sha256Hex(token);
    const manageHash = sha256Hex(manage);
    const spaceId = String(ctx.req.params.id).toLowerCase();
    const reminderAt = ctx.now + Math.max(60_000, durationMs - reminderOffsetFor(durationMs));
    const creatorId = pidFor(tokenHash, deviceKeyOf(ctx.req));
    const state: SpaceState = {
      spaceId,
      name: sanitizeSpaceName(body?.name),
      tokenHash,
      manageHash,
      createdAt: ctx.now,
      expiresAt: ctx.now + durationMs,
      durationMs,
      state: 'ACTIVE',
      creatorId,
      members: {},
      itemSeq: 0,
      reminderAt,
      reminderSent: false,
    };
    const ndb: SpaceDb = { space: state, items: new Map(), uploads: new Map(), subs: new Map() };
    this.dbs.set(spaceId, ndb);
    try { fs.mkdirSync(path.join(this.root, spaceId), { recursive: true }); } catch { /* text-only */ }
    this.registerMember(ndb, state.creatorId, deviceNameOf(ctx.req), ctx.now);
    log('space created', spaceId.slice(0, 8), 'closes', new Date(state.expiresAt).toISOString());
    jsonOut(ctx.res, {
      spaceId, token, manageKey: manage, name: state.name,
      createdAt: state.createdAt, expiresAt: state.expiresAt, reminderAt,
      isCreator: true, participantId: state.creatorId,
    });
  }

  private async handleJoin(db: SpaceDb | null, ctx: RouteCtx) {
    if (!db) return jsonOut(ctx.res, { error: 'Unauthorized' }, 401);
    const cred = bearerOf(ctx.req);
    if (!cred) return jsonOut(ctx.res, { error: 'Unauthorized' }, 401);
    const hash = sha256Hex(cred);
    const isMember = timingSafeEqual(hash, db.space.tokenHash);
    const isManager = timingSafeEqual(hash, db.space.manageHash);
    if (!isMember && !isManager) return jsonOut(ctx.res, { error: 'Unauthorized' }, 401);
    if (db.space.state !== 'ACTIVE' || ctx.now >= db.space.expiresAt) {
      return jsonOut(ctx.res, { error: 'Gone', closed: true }, 410);
    }
    const participantId = pidFor(hash, deviceKeyOf(ctx.req));
    if (isMember && !this.registerMember(db, participantId, deviceNameOf(ctx.req), ctx.now)) {
      return jsonOut(ctx.res, { error: 'This space has too many members right now.' }, 429);
    }
    jsonOut(ctx.res, {
      spaceId: db.space.spaceId, name: db.space.name,
      createdAt: db.space.createdAt, expiresAt: db.space.expiresAt, durationMs: db.space.durationMs,
      memberCount: Object.keys(db.space.members).length,
      isCreator: isManager,
      participantId,
      items: this.listItems(db, 0),
    });
  }

  private listItems(db: SpaceDb, sinceSeq: number): ItemMeta[] {
    const items = [...db.items.values()].filter(i => i.seq > sinceSeq && i.state === 'READY');
    items.sort((a, b) => b.createdAt - a.createdAt || b.seq - a.seq);
    return items;
  }

  private handleList(db: SpaceDb | null, ctx: RouteCtx) {
    if (!db || !ctx.auth) return jsonOut(ctx.res, { error: 'Unauthorized' }, 401);
    const since = Number(ctx.req.query.since || 0);
    jsonOut(ctx.res, { seq: db.space.itemSeq, items: this.listItems(db, Number.isFinite(since) ? since : 0) });
  }

  private handleAddText(db: SpaceDb | null, ctx: RouteCtx) {
    if (!db || !ctx.auth) return jsonOut(ctx.res, { error: 'Unauthorized' }, 401);
    const body = readJson(ctx.req);
    const text = typeof body?.text === 'string' ? body.text : '';
    if (!text.trim()) return jsonOut(ctx.res, { error: 'Add some text first.' }, 400);
    if (text.length > TEXT_MAX) {
      return jsonOut(ctx.res, { error: `Text is too large for a space item (${Math.round(TEXT_MAX / 1024)} KB max). Save it as a file instead.` }, 413);
    }
    const kind = body?.kind === 'link' ? 'link' : 'text';
    const member = db.space.members[ctx.auth.participantId];
    const item: ItemMeta = {
      id: crypto.randomUUID(), seq: ++db.space.itemSeq, kind,
      mime: kind === 'link' ? 'text/uri-list' : 'text/plain',
      size: text.length, createdAt: ctx.now, addedBy: ctx.auth.participantId,
      addedByName: member?.name || 'A device', text,
      state: 'READY',
    };
    db.items.set(item.id, item);
    this.broadcastTo(db.space.spaceId, 'item_added', { item });
    jsonOut(ctx.res, { item });
  }

  private partSizeFor(size: number): number {
    let part = R2_PART_MIN;
    while (part * 10_000 < size && part < R2_PART_CAP) part *= 4;
    return Math.min(part, R2_PART_CAP);
  }

  private handleFileInit(db: SpaceDb | null, ctx: RouteCtx) {
    if (!db || !ctx.auth) return jsonOut(ctx.res, { error: 'Unauthorized' }, 401);
    const body = readJson(ctx.req);
    const size = Number(body?.size);
    const name = sanitizeFilename(typeof body?.name === 'string' ? body.name : 'file');
    const mime = typeof body?.mime === 'string' && body.mime.length <= 120 ? body.mime : 'application/octet-stream';
    const sha256 = typeof body?.sha256 === 'string' && /^[0-9a-f]{64}$/i.test(body.sha256) ? body.sha256.toLowerCase() : undefined;
    if (!Number.isFinite(size) || size <= 0) return jsonOut(ctx.res, { error: 'That file has no content.' }, 400);
    if (size > R2_OBJECT_CAP) {
      return jsonOut(ctx.res, { error: "That file is beyond what storage supports. It can't be kept in a space." }, 413);
    }
    const itemId = crypto.randomUUID();
    const member = db.space.members[ctx.auth.participantId];
    const meta: ItemMeta = {
      id: itemId, seq: 0, kind: 'file', name, mime, size, createdAt: ctx.now,
      addedBy: ctx.auth.participantId, addedByName: member?.name || 'A device',
      diskFile: `${db.space.spaceId}/${itemId}.bin`, sha256, state: 'UPLOADING',
    };
    if (size <= DIRECT_UPLOAD_MAX) {
      db.items.set('pending:' + itemId, meta);
      return jsonOut(ctx.res, { itemId, mode: 'direct' as const, item: meta });
    }
    const partSize = this.partSizeFor(size);
    const state: MultipartState = {
      itemId, name, mime, size, sha256,
      addedBy: ctx.auth.participantId, addedByName: member?.name || 'A device',
      partSize, parts: {}, received: 0, createdAt: ctx.now,
    };
    db.uploads.set(itemId, state);
    try { fs.mkdirSync(path.join(this.root, db.space.spaceId, itemId), { recursive: true }); } catch { /* noop */ }
    const partCount = Math.ceil(size / partSize);
    jsonOut(ctx.res, { itemId, mode: 'multipart' as const, partSize, partCount, item: meta });
  }

  private async handleDirectUpload(db: SpaceDb | null, ctx: RouteCtx) {
    if (!db || !ctx.auth) return jsonOut(ctx.res, { error: 'Unauthorized' }, 401);
    const itemId = String(ctx.req.query.itemId || '');
    const meta = db.items.get('pending:' + itemId);
    if (!meta) return jsonOut(ctx.res, { error: 'Unknown upload.' }, 404);
    if (meta.addedBy !== ctx.auth.participantId) return jsonOut(ctx.res, { error: 'Unauthorized' }, 401);
    if (meta.size > DIRECT_UPLOAD_MAX) return jsonOut(ctx.res, { error: 'Use a multipart upload for this size.' }, 400);
    const chunks: Buffer[] = [];
    let total = 0;
    for await (const chunk of ctx.req) {
      chunks.push(chunk as Buffer);
      total += (chunk as Buffer).length;
      if (total > meta.size + 1024) { // sloppy cap: reject runaway bodies
        return jsonOut(ctx.res, { error: "That file is larger than it claimed." }, 413);
      }
    }
    const buf = Buffer.concat(chunks);
    if (buf.length !== meta.size) {
      return jsonOut(ctx.res, { error: "The file didn't upload completely. Try again." }, 502);
    }
    if (meta.sha256) {
      // Real integrity check on the received bytes.
      const receivedHash = crypto.createHash('sha256').update(buf).digest('hex');
      if (receivedHash !== meta.sha256) {
        return jsonOut(ctx.res, { error: "The file didn't upload completely. Try again." }, 502);
      }
    }
    try {
      const dest = path.join(this.root, meta.diskFile!);
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.writeFileSync(dest, buf);
    } catch (e) {
      log('direct write failed', e instanceof Error ? e.message : e);
      return jsonOut(ctx.res, { error: "Couldn't store that file. Try again." }, 502);
    }
    meta.seq = ++db.space.itemSeq;
    meta.state = 'READY';
    db.items.set(meta.id, meta);
    db.items.delete('pending:' + itemId);
    this.broadcastTo(db.space.spaceId, 'item_added', { item: meta });
    log('direct upload complete', meta.name, meta.size);
    jsonOut(ctx.res, { item: meta });
  }

  private async handlePartUpload(db: SpaceDb | null, ctx: RouteCtx) {
    if (!db || !ctx.auth) return jsonOut(ctx.res, { error: 'Unauthorized' }, 401);
    const itemId = String(ctx.req.query.itemId || '');
    const partNumber = Number(ctx.req.query.partNumber);
    const state = db.uploads.get(itemId);
    if (!state) return jsonOut(ctx.res, { error: 'Unknown upload.' }, 404);
    if (state.addedBy !== ctx.auth.participantId) return jsonOut(ctx.res, { error: 'Unauthorized' }, 401);
    if (!Number.isInteger(partNumber) || partNumber < 1 || partNumber > 10_000) {
      return jsonOut(ctx.res, { error: 'Bad part number.' }, 400);
    }
    const partDir = path.join(this.root, db.space.spaceId, itemId);
    const partFile = path.join(partDir, `part-${String(partNumber).padStart(5, '0')}`);
    try {
      fs.mkdirSync(partDir, { recursive: true });
      const ws = fs.createWriteStream(partFile, { flags: 'w' });
      let written = 0;
      for await (const chunk of ctx.req) {
        written += (chunk as Buffer).length;
        if (!ws.write(chunk as Buffer)) {
          await new Promise<void>(r => ws.once('drain', r));
        }
      }
      await new Promise<void>((resolve, reject) => {
        ws.end(() => resolve());
        ws.on('error', reject);
      });
      // A retried part replaces the earlier one — record the fresh size.
      if (state.parts[partNumber] === undefined) state.received += written;
      else state.received += written - (state.parts[partNumber] as unknown as number);
      state.parts[partNumber] = written as unknown as string;
      jsonOut(ctx.res, { partNumber, etag: String(written), uploadedParts: Object.keys(state.parts).length });
    } catch (e) {
      log('part upload failed', itemId, partNumber, e instanceof Error ? e.message : e);
      try { fs.rmSync(partFile, { force: true }); } catch { /* noop */ }
      jsonOut(ctx.res, { error: "That part didn't upload. Retry it." }, 502);
    }
  }

  private handleFileComplete(db: SpaceDb | null, ctx: RouteCtx) {
    if (!db || !ctx.auth) return jsonOut(ctx.res, { error: 'Unauthorized' }, 401);
    const body = readJson(ctx.req);
    const itemId = typeof body?.itemId === 'string' ? body.itemId : '';
    const state = db.uploads.get(itemId);
    if (!state) return jsonOut(ctx.res, { error: 'Unknown upload.' }, 404);
    if (state.addedBy !== ctx.auth.participantId) return jsonOut(ctx.res, { error: 'Unauthorized' }, 401);
    const expectedCount = Math.ceil(state.size / state.partSize);
    const ourParts = Object.keys(state.parts).map(Number).sort((a, b) => a - b);
    const clientParts = Array.isArray(body?.parts)
      ? (body.parts as unknown[]).map(p => Number((p as { partNumber?: unknown })?.partNumber)).filter(Number.isInteger)
      : [];
    const numbersMatch = ourParts.length === clientParts.length
      && ourParts.every((p, i) => p === clientParts[i]);
    if (!numbersMatch || ourParts.length !== expectedCount) {
      return jsonOut(ctx.res, { error: 'Not all parts finished uploading yet.' }, 409);
    }
    // Assemble from the on-disk parts, streaming into the final object.
    const partDir = path.join(this.root, db.space.spaceId, itemId);
    const dest = path.join(this.root, `${db.space.spaceId}/${itemId}.bin`);
    try {
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      const out = fs.openSync(dest, 'w');
      try {
        for (const n of ourParts) {
          const data = fs.readFileSync(path.join(partDir, `part-${String(n).padStart(5, '0')}`));
          if (n === ourParts[ourParts.length - 1]) {
            // The last part may exceed the exact remainder only if the client
            // sent oversized bytes — trust the server-recorded sizes and cut.
            const remaining = state.size - (ourParts.length - 1) * state.partSize;
            fs.writeSync(out, data, 0, Math.min(data.length, remaining));
          } else {
            fs.writeSync(out, data);
          }
        }
      } finally {
        fs.closeSync(out);
      }
    } catch (e) {
      log('multipart assemble failed', itemId, e instanceof Error ? e.message : e);
      return jsonOut(ctx.res, { error: "Couldn't finish the upload. Retry the missing parts." }, 502);
    }
    if (fs.statSync(dest).size !== state.size) {
      try { fs.rmSync(dest, { force: true }); } catch { /* noop */ }
      return jsonOut(ctx.res, { error: "The file didn't upload completely. Try again." }, 502);
    }
    if (state.sha256) {
      const hash = crypto.createHash('sha256');
      const buf = fs.readFileSync(dest);
      hash.update(buf);
      if (hash.digest('hex') !== state.sha256) {
        try { fs.rmSync(dest, { force: true }); } catch { /* noop */ }
        return jsonOut(ctx.res, { error: "The file didn't upload completely. Try again." }, 502);
      }
    }
    const member = db.space.members[ctx.auth.participantId];
    const meta: ItemMeta = {
      id: itemId, seq: ++db.space.itemSeq, kind: 'file', name: state.name, mime: state.mime,
      size: state.size, createdAt: ctx.now, addedBy: ctx.auth.participantId,
      addedByName: member?.name || 'A device', diskFile: `${db.space.spaceId}/${itemId}.bin`,
      sha256: state.sha256, state: 'READY',
    };
    db.items.set(itemId, meta);
    db.uploads.delete(itemId);
    try { fs.rmSync(partDir, { recursive: true, force: true }); } catch { /* noop */ }
    this.broadcastTo(db.space.spaceId, 'item_added', { item: meta });
    log('multipart complete', meta.name, meta.size, ourParts.length, 'parts');
    jsonOut(ctx.res, { item: meta });
  }

  private handleFileAbort(db: SpaceDb | null, ctx: RouteCtx) {
    if (!db || !ctx.auth) return jsonOut(ctx.res, { error: 'Unauthorized' }, 401);
    const itemId = String(ctx.req.query.itemId || '');
    const state = db.uploads.get(itemId);
    const pending = db.items.get('pending:' + itemId);
    const owner = state?.addedBy ?? pending?.addedBy;
    if (!owner || owner !== ctx.auth.participantId) return jsonOut(ctx.res, { error: 'Unknown upload.' }, 404);
    db.uploads.delete(itemId);
    db.items.delete('pending:' + itemId);
    try {
      fs.rmSync(path.join(this.root, db.space.spaceId, itemId), { recursive: true, force: true });
      fs.rmSync(path.join(this.root, `${db.space.spaceId}/${itemId}.bin`), { force: true });
    } catch { /* noop */ }
    jsonOut(ctx.res, { ok: true });
  }

  private handleFileStatus(db: SpaceDb | null, ctx: RouteCtx) {
    if (!db || !ctx.auth) return jsonOut(ctx.res, { error: 'Unauthorized' }, 401);
    const itemId = String(ctx.req.query.itemId || '');
    const state = db.uploads.get(itemId);
    if (state) {
      if (state.addedBy !== ctx.auth.participantId) return jsonOut(ctx.res, { error: 'Unauthorized' }, 401);
      return jsonOut(ctx.res, {
        itemId, mode: 'multipart' as const, state: 'UPLOADING',
        partSize: state.partSize,
        uploadedParts: Object.keys(state.parts).map(Number).sort((a, b) => a - b),
      });
    }
    const pending = db.items.get('pending:' + itemId);
    if (pending) {
      if (pending.addedBy !== ctx.auth.participantId) return jsonOut(ctx.res, { error: 'Unauthorized' }, 401);
      return jsonOut(ctx.res, { itemId, mode: 'direct' as const, state: 'UPLOADING' });
    }
    return jsonOut(ctx.res, { error: 'Unknown upload.' }, 404);
  }

  private async handleDownload(db: SpaceDb | null, ctx: RouteCtx, itemId: string) {
    if (!db || !ctx.auth) return jsonOut(ctx.res, { error: 'Unauthorized' }, 401);
    if (db.space.state !== 'ACTIVE' || ctx.now >= db.space.expiresAt) {
      return jsonOut(ctx.res, { error: 'Gone', closed: true }, 410);
    }
    const item = db.items.get(itemId);
    if (!item || item.kind !== 'file' || !item.diskFile || item.state !== 'READY') {
      return jsonOut(ctx.res, { error: 'Not found' }, 404);
    }
    const file = path.join(this.root, item.diskFile);
    let stat: fs.Stats;
    try { stat = fs.statSync(file); } catch {
      return jsonOut(ctx.res, { error: 'Not found' }, 404);
    }
    const safeName = (item.name || 'file').replace(/["\\\r\n]/g, '');
    ctx.res.setHeader('content-type', item.mime);
    ctx.res.setHeader('content-length', String(stat.size));
    ctx.res.setHeader('content-disposition', `attachment; filename="${safeName}"; filename*=UTF-8''${encodeURIComponent(item.name || 'file')}`);
    ctx.res.setHeader('x-content-type-options', 'nosniff');
    ctx.res.setHeader('cache-control', 'private, no-store');
    fs.createReadStream(file).pipe(ctx.res);
  }

  private handleDelete(db: SpaceDb | null, ctx: RouteCtx, itemId: string) {
    if (!db || !ctx.auth) return jsonOut(ctx.res, { error: 'Unauthorized' }, 401);
    const item = db.items.get(itemId);
    if (!item) return jsonOut(ctx.res, { error: 'Not found' }, 404);
    const hash = sha256Hex(bearerOf(ctx.req));
    const isCreator = timingSafeEqual(hash, db.space.manageHash);
    if (item.addedBy !== ctx.auth.participantId && !isCreator) {
      return jsonOut(ctx.res, { error: "Only the device that added this — or the space's creator — can remove it." }, 403);
    }
    db.items.delete(itemId);
    if (item.diskFile) {
      try { fs.rmSync(path.join(this.root, item.diskFile), { force: true }); } catch { /* cleanup phase retries */ }
    }
    this.broadcastTo(db.space.spaceId, 'item_deleted', { itemId });
    jsonOut(ctx.res, { ok: true });
  }

  private handleSubscribe(db: SpaceDb | null, ctx: RouteCtx) {
    if (!db || !ctx.auth) return jsonOut(ctx.res, { error: 'Unauthorized' }, 401);
    const body = readJson(ctx.req);
    const endpoint = typeof body?.endpoint === 'string' ? body.endpoint : '';
    const keys = (body?.keys ?? {}) as { p256dh?: unknown; auth?: unknown };
    const p256dh = typeof keys.p256dh === 'string' ? keys.p256dh : '';
    const auth = typeof keys.auth === 'string' ? keys.auth : '';
    if (!endpoint.startsWith('https://') || !p256dh || !auth) {
      return jsonOut(ctx.res, { error: 'Bad subscription.' }, 400);
    }
    for (const rec of db.subs.values()) {
      if (rec.endpoint === endpoint) return jsonOut(ctx.res, { ok: true, reminderAt: db.space.reminderAt });
    }
    if (db.subs.size >= SUBS_MAX) return jsonOut(ctx.res, { error: 'Too many reminder devices for this space.' }, 429);
    db.subs.set('sub:' + crypto.randomUUID(), { endpoint, p256dh, auth, addedBy: ctx.auth.participantId });
    jsonOut(ctx.res, { ok: true, reminderAt: db.space.reminderAt });
  }

  private handleUnsubscribe(db: SpaceDb | null, ctx: RouteCtx) {
    if (!db || !ctx.auth) return jsonOut(ctx.res, { error: 'Unauthorized' }, 401);
    const body = readJson(ctx.req);
    const endpoint = typeof body?.endpoint === 'string' ? body.endpoint : '';
    for (const [key, rec] of db.subs) {
      if (rec.endpoint === endpoint && rec.addedBy === ctx.auth.participantId) db.subs.delete(key);
    }
    jsonOut(ctx.res, { ok: true });
  }

  private handleHeartbeat(db: SpaceDb | null, ctx: RouteCtx) {
    if (!db || !ctx.auth) return jsonOut(ctx.res, { error: 'Unauthorized' }, 401);
    const member = db.space.members[ctx.auth.participantId];
    if (member) member.lastSeen = ctx.now;
    jsonOut(ctx.res, { ok: true, expiresAt: db.space.expiresAt });
  }

  private async handleClose(db: SpaceDb | null, ctx: RouteCtx) {
    if (!db || !ctx.auth) return jsonOut(ctx.res, { error: 'Unauthorized' }, 401);
    const hash = sha256Hex(bearerOf(ctx.req));
    // The manage key alone is the creator credential — exactly one exists,
    // minted at create time.
    if (!timingSafeEqual(hash, db.space.manageHash)) {
      return jsonOut(ctx.res, { error: 'Only the space creator can close it early.' }, 403);
    }
    if (ctx.now >= db.space.expiresAt) return jsonOut(ctx.res, { ok: true });
    log('space closed early by creator');
    await this.beginExpiry(db, 'closed_early');
    jsonOut(ctx.res, { ok: true });
  }

  private handleInfo(db: SpaceDb | null, ctx: RouteCtx) {
    if (!db || !ctx.auth) return jsonOut(ctx.res, { error: 'Unauthorized' }, 401);
    if (db.space.state !== 'ACTIVE' || ctx.now >= db.space.expiresAt) {
      return jsonOut(ctx.res, { error: 'Gone', closed: true }, 410);
    }
    jsonOut(ctx.res, {
      spaceId: db.space.spaceId, name: db.space.name,
      createdAt: db.space.createdAt, expiresAt: db.space.expiresAt,
      memberCount: Object.keys(db.space.members).length,
    });
  }

  // ── WebSocket bridge (socket.io namespace parity) ─────────────────────

  /** Attach the live-update socket handlers. Uses a dedicated socket.io
   *  namespace so room signaling never shares event names with spaces. */
  attachSocketNamespace() {
    const nsp = this.io.of('/space-live');
    nsp.on('connection', (socket: Socket) => {
      let authorized = false;
      let spaceId: string | null = null;

      socket.on('join_space', (payload: { spaceId?: string; token?: string; name?: string; deviceKey?: string } = {}, ack?: (r: unknown) => void) => {
        const sid = typeof payload.spaceId === 'string' ? payload.spaceId.toLowerCase() : '';
        const token = typeof payload.token === 'string' ? payload.token : '';
        const db = sid ? this.dbs.get(sid) : undefined;
        if (!db || !token || db.space.state !== 'ACTIVE' || Date.now() >= db.space.expiresAt) {
          socket.emit('space_event', { event: 'space_auth_failed', payload: {} });
          ack?.({ ok: false });
          return;
        }
        const hash = sha256Hex(token);
        if (!timingSafeEqual(hash, db.space.tokenHash) && !timingSafeEqual(hash, db.space.manageHash)) {
          socket.emit('space_event', { event: 'space_auth_failed', payload: {} });
          ack?.({ ok: false });
          return;
        }
        authorized = true;
        spaceId = sid;
        const isMemberHash = timingSafeEqual(hash, db.space.tokenHash);
        const participantId = pidFor(hash, sanitizeMemberName(payload.deviceKey));
        if (isMemberHash) {
          this.registerMember(db, participantId, sanitizeMemberName(payload.name), Date.now());
        }
        if (!this.sockets.has(sid)) this.sockets.set(sid, new Set());
        this.sockets.get(sid)!.add(socket);
        socket.emit('space_event', {
          event: 'space_sync', payload: {
            name: db.space.name, expiresAt: db.space.expiresAt, seq: db.space.itemSeq,
            memberCount: Object.keys(db.space.members).length,
            isCreator: timingSafeEqual(hash, db.space.manageHash),
            items: this.listItems(db, 0),
          },
        });
        this.broadcastTo(sid, 'members_changed', { memberCount: Object.keys(db.space.members).length });
        ack?.({ ok: true });
      });

      socket.on('disconnect', () => {
        if (spaceId && authorized) {
          const set = this.sockets.get(spaceId);
          if (set) {
            set.delete(socket);
            if (set.size === 0) this.sockets.delete(spaceId);
          }
          const db = this.dbs.get(spaceId);
          if (db) this.broadcastTo(spaceId, 'members_changed', { memberCount: Object.keys(db.space.members).length });
        }
      });
    });
  }
}

// ── small helpers ─────────────────────────────────────────────────────────

interface RouteCtx {
  req: express.Request;
  res: express.Response;
  now: number;
  cred: string;
  auth: { participantId: string; isCreator: boolean } | null;
}

function bearerOf(req: express.Request): string {
  const header = req.headers.authorization || '';
  return header.startsWith('Bearer ') ? header.slice(7).trim() : '';
}

function deviceNameOf(req: express.Request): string | null {
  const raw = req.headers['x-device-name'];
  if (typeof raw !== 'string') return null;
  return sanitizeMemberName(raw).slice(0, 40) || null;
}

/** The device's stable local seed header. NOT a secret — only prevents two
 *  devices sharing one access token from collapsing into one member. */
function deviceKeyOf(req: express.Request): string {
  const raw = req.headers['x-device-key'];
  return typeof raw === 'string' ? sanitizeMemberName(raw) : '';
}

/** Device-scoped participant id: token hash (secret) + device seed. */
function pidFor(tokenHash: string, deviceKey: string): string {
  return 'p_' + sha256Hex(tokenHash + '.' + deviceKey).slice(0, 16);
}

function readJson(req: express.Request): Record<string, unknown> | null {
  const b = req.body;
  if (b && typeof b === 'object' && !Array.isArray(b)) return b as Record<string, unknown>;
  return null;
}

function jsonOut(res: express.Response, data: unknown, status = 200) {
  if (res.headersSent) return;
  res.status(status).json(data);
}
