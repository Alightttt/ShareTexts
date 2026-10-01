import { devLog } from './devlog';
import { diag } from './diag';

/**
 * Multi-device room roster.
 *
 * The ROSTER is the authoritative membership model: who is in the room, what
 * they are called, what kind of device they are. DIRECT LINKS (WebRTC) are a
 * DIFFERENT axis — they exist only between pairs that actually exchange data,
 * and a link's health never mutates another participant's roster entry.
 *
 * This module owns the client-side mirror of the server's roster plus the
 * per-participant LINK/TRANSFER state the UI reads. It is deliberately
 * framework-free: plain data + a version counter + a change fan-out, so any
 * layer (SessionContext, the device picker, diagnostics) can subscribe
 * without prop drilling, and React renders from one source of truth.
 *
 * Staleness: every snapshot carries a monotonic `seq`. A delta with seq <=
 * the last applied seq is DROPPED (out-of-order delivery), while a snapshot
 * with a higher seq always wins. Participant ids are room-scoped stable
 * UUIDs — never display names, never socket ids.
 */

export interface RosterParticipant {
  /** Stable room-scoped participant id (from the server roster). */
  id: string;
  /** Display name — cosmetic only, never identity. */
  name: string;
  /** 'phone' | 'tablet' | 'desktop' (display hint). */
  platform: string;
  /** Membership start (server clock) — also the deterministic tiebreak. */
  joinedAt: number;
}

/** Per-participant direct-link state. Deliberately separate from membership:
 *  a device can be a room member with NO open link (VALID state), and one
 *  link failing says NOTHING about the others. */
export type LinkState =
  | 'none'         // member, no direct link needed yet
  | 'connecting'   // WebRTC handshake in flight
  | 'connected'    // data channel open
  | 'reconnecting' // link dropped; calm window / auto-retry in progress
  | 'offline'      // roster member whose seat is gone (server-confirmed leave)
  | 'failed';      // link failed terminally; retry available

export interface RosterEntry extends RosterParticipant {
  link: LinkState;
  isSelf: boolean;
}

export interface RosterSnapshot {
  participants: RosterParticipant[];
  /** Server-side monotonic roster version — 0 for legacy servers that don't
   *  send rosters (the client then runs its implicit 2-participant model). */
  seq: number;
}

type Listener = () => void;

const DEVICE_ID_KEY = 'sharetext.deviceId';

/** This device's stable room-scoped participant id for a room. Minted once
 *  per room and kept in localStorage, so a refresh rejoins AS THE SAME
 *  participant — the roster never duplicates a returning device, and other
 *  members see the same participant reappear, not a new "Device 2". */
export function participantIdFor(roomId: string): string {
  try {
    const raw = localStorage.getItem(DEVICE_ID_KEY);
    const map: Record<string, string> = raw ? JSON.parse(raw) : {};
    let id = map[roomId];
    if (!id || typeof id !== 'string' || !/^[0-9a-f-]{36}$/i.test(id)) {
      id = crypto.randomUUID();
      map[roomId] = id;
      // Bound the map: keep only the 20 most recent rooms.
      const keys = Object.keys(map);
      if (keys.length > 20) {
        for (const k of keys.slice(0, keys.length - 20)) delete map[k];
      }
      localStorage.setItem(DEVICE_ID_KEY, JSON.stringify(map));
    }
    return id;
  } catch {
    return crypto.randomUUID();
  }
}

export function forgetParticipantId(roomId: string): void {
  try {
    const raw = localStorage.getItem(DEVICE_ID_KEY);
    if (!raw) return;
    const map: Record<string, string> = JSON.parse(raw);
    delete map[roomId];
    localStorage.setItem(DEVICE_ID_KEY, JSON.stringify(map));
  } catch { /* private mode */ }
}

export class RoomRoster {
  private participants = new Map<string, RosterParticipant>();
  private links = new Map<string, LinkState>();
  private selfId: string | null = null;
  private seq = 0;
  private listeners = new Set<Listener>();

  constructor() {}

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => { this.listeners.delete(fn); };
  }

  private emit(): void {
    for (const fn of [...this.listeners]) {
      try { fn(); } catch { /* a broken listener never blocks the others */ }
    }
  }

  /** Reset for a (new) room. `selfId` marks which participant is THIS device. */
  reset(selfId: string | null): void {
    this.participants.clear();
    this.links.clear();
    this.seq = 0;
    this.selfId = selfId;
  }

  get selfParticipantId(): string | null {
    return this.selfId;
  }

  get version(): number {
    return this.seq;
  }

  /** All entries, self last-pinned at the top, join order otherwise. */
  entries(): RosterEntry[] {
    const out: RosterEntry[] = [];
    for (const p of this.participants.values()) {
      out.push({
        ...p,
        link: p.id === this.selfId ? 'connected' : (this.links.get(p.id) ?? 'none'),
        isSelf: p.id === this.selfId,
      });
    }
    out.sort((a, b) => {
      if (a.isSelf !== b.isSelf) return a.isSelf ? -1 : 1;
      return a.joinedAt - b.joinedAt || (a.id < b.id ? -1 : 1);
    });
    return out;
  }

  otherEntries(): RosterEntry[] {
    return this.entries().filter((e) => !e.isSelf);
  }

  get(participantId: string): RosterEntry | null {
    const p = this.participants.get(participantId);
    if (!p) return null;
    return {
      ...p,
      link: p.id === this.selfId ? 'connected' : (this.links.get(p.id) ?? 'none'),
      isSelf: p.id === this.selfId,
    };
  }

  get size(): number {
    return this.participants.size;
  }

  linkState(participantId: string): LinkState {
    if (participantId === this.selfId) return 'connected';
    return this.links.get(participantId) ?? 'none';
  }

  setLink(participantId: string, state: LinkState): void {
    if (participantId === this.selfId) return;
    if (this.links.get(participantId) === state) return;
    this.links.set(participantId, state);
    diag('roster.link', true, `${participantId.slice(0, 8)} → ${state}`);
    this.emit();
  }

  /** Apply a server roster snapshot. Higher seq wins; equal seq re-merges
   *  (idempotent); lower seq is stale and ignored. */
  applySnapshot(snap: RosterSnapshot): void {
    if (!snap || !Array.isArray(snap.participants)) return;
    if (snap.seq < this.seq) {
      devLog('roster stale snapshot dropped', snap.seq, '<', this.seq);
      return;
    }
    this.seq = snap.seq;
    const seen = new Set<string>();
    for (const p of snap.participants) {
      if (!p || typeof p.id !== 'string') continue;
      seen.add(p.id);
      const prev = this.participants.get(p.id);
      this.participants.set(p.id, {
        id: p.id,
        name: typeof p.name === 'string' ? p.name : 'Device',
        platform: typeof p.platform === 'string' ? p.platform : 'desktop',
        joinedAt: typeof p.joinedAt === 'number' ? p.joinedAt : (prev?.joinedAt ?? Date.now()),
      });
      // A participant that vanished and reappeared in a newer snapshot keeps
      // its link bookkeeping only if the link is still marked live — the
      // link layer owns transitions; presence just restores the row.
      if (!this.links.has(p.id)) this.links.set(p.id, 'none');
    }
    for (const id of [...this.participants.keys()]) {
      if (!seen.has(id)) {
        this.participants.delete(id);
        this.links.delete(id);
      }
    }
    this.emit();
  }

  /** Single-participant delta from a peer_joined / peer_recovered event. */
  upsert(p: RosterParticipant, opts?: { link?: LinkState }): void {
    if (!p || typeof p.id !== 'string') return;
    const prev = this.participants.get(p.id);
    this.participants.set(p.id, {
      id: p.id,
      name: typeof p.name === 'string' ? p.name : 'Device',
      platform: typeof p.platform === 'string' ? p.platform : 'desktop',
      joinedAt: typeof p.joinedAt === 'number' ? p.joinedAt : (prev?.joinedAt ?? Date.now()),
    });
    if (opts?.link) this.links.set(p.id, opts.link);
    else if (!this.links.has(p.id)) this.links.set(p.id, 'none');
    this.seq++;
    this.emit();
  }

  /** Server-confirmed leave: the device is GONE from the room. Its row flips
   *  to offline (and drops once a snapshot without it arrives); nothing else
   *  in the room changes. */
  markOffline(participantId: string): void {
    if (!this.participants.has(participantId)) return;
    this.links.set(participantId, 'offline');
    this.emit();
  }

  /** Remove entirely (roster snapshot reconciliation handles the common
   *  path; this is for explicit prunes). */
  remove(participantId: string): void {
    if (this.participants.delete(participantId)) {
      this.links.delete(participantId);
      this.emit();
    }
  }
}

/** The page-level roster singleton (one active room per tab). */
export const roomRoster = new RoomRoster();
