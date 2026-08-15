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
      events: RING,
      snapshot: diagSnapshot,
    };
  } catch { /* ignore */ }
}
