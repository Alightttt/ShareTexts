import { PeerManager } from './webrtc';
import { devLog } from './devlog';
import { diag } from './diag';

export { PeerManager };

/**
 * Multi-device room connection management.
 *
 * ROOM MEMBERSHIP ≠ DIRECT LINK. Every participant in the roster is a member;
 * a WebRTC data link exists only between pairs that actually need to exchange
 * data (selected sender→recipient). There is deliberately NO full mesh: a
 * 10-device room where one device sends to two others holds exactly TWO
 * direct links on the sender, and the other seven devices hold zero.
 *
 * PeerConnectionManager owns the participantId → PeerLink map. Each PeerLink
 * wraps one PeerManager (one RTCPeerConnection + its two data channels) with
 * its own lifecycle, so one peer's failure can never mutate the room state of
 * another. The manager itself is NOT per-room-instance: the page keeps ONE,
 * re-keyed as rooms change, and listeners are (re)bound by the session layer.
 */
export class PeerConnectionManager {
  private links = new Map<string, PeerManager>();
  private destroyed = false;
  /** Bounded warm-idle reaping: a link that has been idle (no open channel)
   *  this long is torn down. Chosen long enough that a backgrounded-but-
   *  returning phone does not lose its link mid-transfer (transfers keep
   *  their own activity via chunks — an ACTIVE link is never reaped). */
  private static IDLE_REAP_MS = 10 * 60 * 1000;
  private reapTimer: ReturnType<typeof setInterval> | null = null;

  /** Fired whenever any link's coarse availability flips — the session layer
   *  uses this to keep `partnerConnected` truthful without polling. */
  public onAnyLinkChange: ((participantId: string) => void) | null = null;

  constructor(private roomId: string, private secret: string) {
    // Lazy reap cadence: check every minute, act rarely.
    this.reapTimer = setInterval(() => this.reapIdle(), 60_000);
    if (typeof this.reapTimer === 'object' && 'unref' in this.reapTimer) {
      (this.reapTimer as unknown as { unref: () => void }).unref?.();
    }
  }

  /** Does a live (constructed, not destroyed) link exist for this participant? */
  has(participantId: string): boolean {
    return this.links.has(participantId);
  }

  /** The link for a participant, if one exists. */
  get(participantId: string): PeerManager | null {
    return this.links.get(participantId) ?? null;
  }

  /** All live participant ids with links. */
  linked(): string[] {
    return [...this.links.keys()];
  }

  /** Create (or return the existing) link for a participant. */
  ensure(
    participantId: string,
    hooks: {
      onOpen?: () => void;
      onDisconnect?: () => void;
      onDisconnectImmediate?: () => void;
      onNegotiating?: () => void;
    },
    factory: () => Promise<PeerManager>
  ): Promise<PeerManager> {
    const existing = this.links.get(participantId);
    if (existing && !existing.isDestroyed()) return Promise.resolve(existing);
    if (existing) this.destroyLink(participantId);
    return factory().then((pm) => {
      if (this.destroyed) {
        pm.destroy();
        throw new Error('room link manager destroyed');
      }
      this.links.set(participantId, pm);
      // Per-link lifecycle → the room-scoped hooks, scoped to THIS participant.
      const prevOpen = pm.onOpen;
      pm.onOpen = () => {
        prevOpen?.();
        hooks.onOpen?.();
        this.onAnyLinkChange?.(participantId);
      };
      const prevDisc = pm.onDisconnect;
      pm.onDisconnect = () => {
        prevDisc?.();
        hooks.onDisconnect?.();
        this.onAnyLinkChange?.(participantId);
      };
      const prevDiscImm = pm.onDisconnectImmediate;
      pm.onDisconnectImmediate = () => {
        prevDiscImm?.();
        hooks.onDisconnectImmediate?.();
        this.onAnyLinkChange?.(participantId);
      };
      pm.onNegotiating = hooks.onNegotiating;
      diag('room.link_ensure', true, `to ${participantId.slice(0, 8)} (links=${this.links.size})`);
      return pm;
    });
  }

  /** Destroy one link. Other links are untouched — a peer's failure is
   *  isolated to its own link by construction. */
  destroyLink(participantId: string): void {
    const pm = this.links.get(participantId);
    if (!pm) return;
    this.links.delete(participantId);
    try {
      pm.onDisconnect = null;
      pm.onDisconnectImmediate = null;
      pm.destroy();
    } catch { /* idempotent */ }
    diag('room.link_destroy', true, `to ${participantId.slice(0, 8)} (links=${this.links.size})`);
  }

  /** Destroy every link (room teardown). */
  destroyAll(): void {
    for (const id of [...this.links.keys()]) this.destroyLink(id);
  }

  destroy(): void {
    this.destroyed = true;
    if (this.reapTimer) clearInterval(this.reapTimer);
    this.reapTimer = null;
    this.destroyAll();
  }

  /**
   * Resource policy (NOT a product cap): close links whose channel has been
   * down for a while. A live channel is never touched; a stalled one is —
   * it will be re-established on demand by the next send/selection.
   */
  private reapIdle(): void {
    if (this.destroyed) return;
    const now = Date.now();
    for (const [id, pm] of this.links) {
      const pc = pm.getPeerConnection();
      const state = pc?.connectionState ?? 'closed';
      if ((state === 'failed' || state === 'closed') && pm.idleSince() > PeerConnectionManager.IDLE_REAP_MS) {
        devLog('room.reap idle link', id.slice(0, 8));
        this.destroyLink(id);
      }
    }
  }
}
