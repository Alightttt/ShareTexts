/**
 * Socket-readiness gating and human join-failure copy. Extracted verbatim
 * from SessionContext (Round 03); semantics unchanged.
 */

import { getSocket, signalingConfigIssue, probeSignalingHealth } from '../socket';
import { ConnectError, describeConnectFailure } from '../errors';
import { diag } from '../diag';

/**
 * Wait until the shared socket is connected, or fail with a CLASSIFIED error.
 *
 * The socket.io transport already retries with bounded exponential backoff
 * (reconnectionAttempts: 60, delay 2–8s, polling fallback), so a single
 * transient connect_error must NOT reject the request — the connection
 * commonly comes up on the very next attempt. Only the overall window is
 * terminal, and the failure carries a code (OFFLINE / UNREACHABLE / TIMEOUT /
 * CONFIG) so the UI can say what actually happened.
 */
export function ensureSocketConnected(timeoutMs = 16000): Promise<void> {
  const socket = getSocket();
  if (socket.connected) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      diag('connect.timeout', false, `waited ${timeoutMs}ms`);
      // A dropped/idle connection may recover on its own — force the
      // transport to restart NOW instead of waiting out its backoff while
      // the user stares at a spinner.
      try { (socket as any).connect?.(); } catch { /* best effort */ }
      // Classify before rejecting: a device with no network or a dead
      // service gets a different, honest message than a slow one.
      if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        reject(new ConnectError('OFFLINE'));
        return;
      }
      const config = signalingConfigIssue();
      if (config) {
        reject(new ConnectError('CONFIG', config));
        return;
      }
      // Probe the service: up → our transport failed locally; down → the
      // service itself is out. The probe result picks the truthful copy.
      void probeSignalingHealth().then((health) => {
        reject(new ConnectError(health === 'ok' ? 'TIMEOUT' : health === 'slow' ? 'TIMEOUT' : 'UNREACHABLE'));
      });
    }, timeoutMs);
    const onConnect = () => { cleanup(); diag('connect.ok', true); resolve(); };
    const onError = () => { /* transient — keep waiting for the retry */ };
    const cleanup = () => {
      clearTimeout(timer);
      socket.off('connect', onConnect);
      socket.off('connect_error', onError);
    };
    socket.once('connect', onConnect);
    socket.once('connect_error', onError);
  });
}

/**
 * Friendly, actionable error messages based on the failure code.
 * Users should always know WHAT went wrong and WHAT to try next.
 */
export function humanJoinError(code: string | undefined, fallback: string): string {
  switch (code) {
    case 'INVALID_CODE':
      return "That code isn't active. Check the other device and enter its latest six-digit code.";
    case 'ROOM_FULL':
      return "This room already has two devices. Only two can connect at once.";
    case 'RATE_LIMITED':
      return "Too many attempts. Wait a moment and try again.";
    case 'SESSION_EXPIRED':
      return "This session expired. Ask the other device to create a new room.";
    default:
      return fallback;
  }
}

/** Friendly copy when a join THROWS (socket never came up) — mirrors the
 *  Send-side classification so both paths speak the same language. */
export function friendlyJoinCopy(e: unknown): string {
  const code = describeConnectFailure(e);
  switch (code) {
    case 'OFFLINE': return "You're offline. Check your internet and try again.";
    case 'UNREACHABLE': return "ShareTexts's connection server isn't reachable right now. Try again in a moment.";
    case 'CONFIG': return (e instanceof Error && e.message) || "ShareTexts couldn't reach its connection server. Please try again later.";
    case 'TIMEOUT': return "The connection took too long. One more try usually fixes it.";
    default: return "Couldn't reach ShareTexts. Check your connection and try again.";
  }
}
