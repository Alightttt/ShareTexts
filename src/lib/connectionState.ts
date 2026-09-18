/**
 * Connection state machine — one source of truth for WHERE a session is in
 * its lifecycle, replacing the scattered boolean soup
 * (isConnected/isConnecting/isSending/…) with named states and explicit,
 * validated transitions.
 *
 *   IDLE ──▶ DISCOVERING ─┐
 *     │                   │
 *     └─▶ PAIRING ─▶ SIGNALING ─▶ ICE_CHECKING ─▶ CONNECTING ─▶ CONNECTED
 *                                                                    │ ▲
 *                                                          (transfer)│ │(done)
 *                                                                    ▼ │
 *                                                              TRANSFERRING
 *     CONNECTED/TRANSFERRING ─▶ RECONNECTING ─▶ CONNECTED …  or  DISCONNECTED
 *     any ─▶ ERROR (terminal for the attempt)
 *
 * Rules that kill real bug classes:
 *  - TRANSFERRING → DISCOVERING (or any discovery state) is IMPOSSIBLE: the
 *    presence pool is withdrawn the moment a room seats a peer, so the
 *    machine simply refuses the transition instead of the UI guessing.
 *  - Every hop is validated; an illegal transition is logged via diag and
 *    IGNORED (state stays truthful) rather than corrupting the picture.
 *  - The machine is observability-first: it records a bounded transition
 *    history so the diagnostics panel can SHOW the user's real path.
 *
 * The existing per-connection flags stay (they drive fine-grained UI); this
 * machine sits above them as the coarse lifecycle truth.
 */

import { diag } from './diag';

export type ConnState =
  | 'IDLE'
  | 'DISCOVERING'
  | 'PAIRING'
  | 'SIGNALING'
  | 'ICE_CHECKING'
  | 'CONNECTING'
  | 'CONNECTED'
  | 'TRANSFERRING'
  | 'RECONNECTING'
  | 'DISCONNECTED'
  | 'ERROR';

export interface ConnTransition {
  from: ConnState;
  to: ConnState;
  at: number; // Date.now()
}

/**
 * Valid transitions. Key insight: from CONNECTED you may go to TRANSFERRING,
 * RECONNECTING or DISCONNECTED — never back to DISCOVERING/PAIRING (a room
 * with a seated peer has left the discovery pool). RECONNECTING returns to
 * CONNECTED/TRANSFERRING on recovery or DISCONNECTED on giving up.
 */
const VALID: Readonly<Record<ConnState, readonly ConnState[]>> = {
  IDLE: ['DISCOVERING', 'PAIRING'],
  DISCOVERING: ['PAIRING', 'IDLE', 'DISCONNECTED'],
  PAIRING: ['SIGNALING', 'CONNECTING', 'ICE_CHECKING', 'CONNECTED', 'ERROR', 'IDLE', 'DISCONNECTED'],
  SIGNALING: ['ICE_CHECKING', 'CONNECTING', 'CONNECTED', 'ERROR', 'DISCONNECTED'],
  ICE_CHECKING: ['CONNECTING', 'CONNECTED', 'ERROR', 'DISCONNECTED'],
  CONNECTING: ['ICE_CHECKING', 'CONNECTED', 'ERROR', 'DISCONNECTED'],
  CONNECTED: ['TRANSFERRING', 'RECONNECTING', 'DISCONNECTED'],
  TRANSFERRING: ['CONNECTED', 'RECONNECTING', 'DISCONNECTED'],
  RECONNECTING: ['CONNECTED', 'TRANSFERRING', 'DISCONNECTED', 'ERROR'],
  DISCONNECTED: ['IDLE', 'PAIRING'],
  ERROR: ['IDLE', 'DISCONNECTED', 'PAIRING'],
};

export function canTransition(from: ConnState, to: ConnState): boolean {
  if (from === to) return true; // re-asserting the same state is a no-op, not an error
  return VALID[from]?.includes(to) ?? false;
}

/** Bounded history kept for the diagnostics surface. */
const HISTORY_MAX = 16;

class ConnectionMachine {
  private state: ConnState = 'IDLE';
  private history: ConnTransition[] = [];
  private stateSince = Date.now();
  private listeners = new Set<(s: ConnState, prev: ConnState) => void>();

  current(): ConnState {
    return this.state;
  }

  /** Milliseconds spent in the current state (diagnostics: where it's stuck). */
  msInState(): number {
    return Date.now() - this.stateSince;
  }

  transitions(): readonly ConnTransition[] {
    return this.history;
  }

  subscribe(fn: (s: ConnState, prev: ConnState) => void): () => void {
    this.listeners.add(fn);
    return () => { this.listeners.delete(fn); };
  }

  /** Attempt a transition; returns the (possibly unchanged) state. */
  to(next: ConnState): ConnState {
    if (next === this.state) return this.state;
    if (!canTransition(this.state, next)) {
      diag('conn.state.rejected', false, `${this.state} → ${next} (illegal)`);
      return this.state;
    }
    const prev = this.state;
    this.state = next;
    this.stateSince = Date.now();
    this.history.push({ from: prev, to: next, at: this.stateSince });
    if (this.history.length > HISTORY_MAX) this.history.shift();
    diag('conn.state', true, `${prev} → ${next}`);
    for (const fn of this.listeners) {
      try { fn(next, prev); } catch { /* listener errors never break the machine */ }
    }
    return this.state;
  }

  /** Fresh machine (new session lifecycle after a full disconnect). */
  reset() {
    this.state = 'IDLE';
    this.stateSince = Date.now();
    this.history = [];
  }
}

/** App-lifecycle singleton: one machine for the whole tab. */
export const connMachine = new ConnectionMachine();

/**
 * Pure mapping: the app's scattered per-connection signals → the coarse
 * machine state. Used by SessionContext at its existing state-change points
 * so the machine mirrors reality without the UI being rewritten.
 */
export function mapToConnState(input: {
  hasRoom: boolean;
  partnerConnecting: boolean;
  partnerConnected: boolean;
  connectionType: 'connecting' | 'local' | 'direct' | 'relay' | 'disconnected' | 'waiting' | 'establishing';
  presenceActive: boolean;
  transferActive: boolean;
}): ConnState {
  const { hasRoom, partnerConnecting, partnerConnected, connectionType, presenceActive, transferActive } = input;
  if (!hasRoom) return presenceActive ? 'DISCOVERING' : 'IDLE';
  if (partnerConnected) return transferActive ? 'TRANSFERRING' : 'CONNECTED';
  if (partnerConnecting) {
    if (connectionType === 'establishing') return 'ICE_CHECKING';
    if (connectionType === 'connecting') return 'CONNECTING';
    return 'SIGNALING';
  }
  // Room exists, peer not (yet) present — the pairing/code screen.
  if (connectionType === 'disconnected') return 'RECONNECTING';
  return 'PAIRING';
}
