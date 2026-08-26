/**
 * Lifecycle diagnostics — a tiny ring buffer of the important steps in the
 * signaling + transfer journey (page load → transport → connect → room →
 * WebRTC → channel → transfer). Nothing here is user-facing; it exists so a
 * support conversation or a console paste can pinpoint WHERE a failure
 * happened instead of staring at one generic error string.
 *
 * Read it:  window.__sharetextDiag.snapshot()
 * Hook it:  diag('transport.choose', true, mode + ' ' + url)
 */
export interface DiagEvent {
  t: number;          // Date.now()
  stage: string;      // e.g. 'connect.room', 'webrtc.ice', 'transfer.interrupted'
  ok: boolean;
  detail?: string;
}

const RING: DiagEvent[] = [];
const MAX_EVENTS = 80;

export function diag(stage: string, ok: boolean, detail?: string) {
  RING.push({ t: Date.now(), stage, ok, detail });
  if (RING.length > MAX_EVENTS) RING.splice(0, RING.length - MAX_EVENTS);
  // eslint-disable-next-line no-console
  console.debug(`[ShareText] ${ok ? '✓' : '✗'} ${stage}${detail ? ' — ' + detail : ''}`);
}

export function diagSnapshot(): DiagEvent[] {
  return RING.map(e => ({ ...e }));
}

export function installDiagGlobal() {
  if (typeof window === 'undefined') return;
  try {
    (window as any).__sharetextDiag = {
      roomDiags: getRoomDiags,
      events: RING,
      snapshot: diagSnapshot,
    };
  } catch { /* ignore */ }
}

/** Failure classification for room creation diagnostics. */
export type FailureCategory =
  | 'NETWORK_UNAVAILABLE'
  | 'SIGNALING_UNREACHABLE'
  | 'SIGNALING_TIMEOUT'
  | 'ROOM_CREATE_REJECTED'
  | 'ORIGIN_REJECTED'
  | 'INVALID_RESPONSE'
  | 'CLIENT_INIT_FAILURE'
  | 'UNKNOWN';

/** Structured room-create diagnostic record. */
export interface RoomCreateDiag {
  requestId: string;
  transport: string;
  startTime: number;
  endTime?: number;
  duration?: number;
  category?: FailureCategory;
  result: 'pending' | 'success' | 'failure';
  detail?: string;
}

const roomDiags: RoomCreateDiag[] = [];
const MAX_ROOM_DIAGS = 20;

export function roomCreateDiagStart(requestId: string, transport: string): RoomCreateDiag {
  const entry: RoomCreateDiag = {
    requestId,
    transport,
    startTime: Date.now(),
    result: 'pending',
  };
  roomDiags.push(entry);
  if (roomDiags.length > MAX_ROOM_DIAGS) roomDiags.splice(0, roomDiags.length - MAX_ROOM_DIAGS);
  return entry;
}

export function roomCreateDiagEnd(
  requestId: string,
  result: 'success' | 'failure',
  category?: FailureCategory,
  detail?: string
) {
  const entry = roomDiags.find(e => e.requestId === requestId);
  if (!entry) return;
  entry.endTime = Date.now();
  entry.duration = entry.endTime - entry.startTime;
  entry.result = result;
  entry.category = category;
  entry.detail = detail;
  diag('room.create', result === 'success',
      );
}

export function getRoomDiags(): RoomCreateDiag[] {
  return roomDiags.map(e => ({ ...e }));
}
