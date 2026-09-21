/**
 * Maps the signaling backend's machine-readable error codes to human, on-brand
 * copy. The backend never sends stack traces or technical jargon — the UI
 * shows these friendly strings instead.
 *
 * Codes come from the Cloudflare worker (worker/src/room.ts) and the Node
 * server (server.ts). Unknown codes fall back to a generic message.
 */
const ERROR_COPY: Record<string, string> = {
  ROOM_FULL: 'This ShareTexts room is already full.',
  INVALID_CODE: "That code isn't valid or has expired. Ask for a fresh one.",
  SESSION_EXPIRED: 'This room has expired. Start a new one.',
  INVALID_SESSION: "This room link isn't active anymore. Ask for a fresh code.",
  ROOM_NOT_FOUND: "This room isn't active anymore.",
  RATE_LIMITED: 'Too many attempts. Try again in a minute.',
  UNSUPPORTED_VERSION: 'This app is out of date. Refresh to continue.',
  ORIGIN_NOT_ALLOWED: "ShareTexts's server rejected this browser. The site may need to be added to the server's allow list.",
  INVALID_MESSAGE: 'Something went wrong with that request.',
  UNREACHABLE: "Couldn't reach ShareTexts.",
  SIGNALING_TIMEOUT: "ShareTexts's server responded slowly. Try again in a moment.",
  SIGNALING_UNREACHABLE: "ShareTexts's connection server is unreachable. Check your internet.",

  // Device-to-device (WebRTC) failure taxonomy. These surface when the
  // SERVER handshake worked but the direct browser-to-browser link failed —
  // the copy always offers the code/QR/link fallback, which routes around
  // strict NATs that defeated the direct path.
  ICE_FAILED: "Couldn't establish a direct connection between the devices. Try a different network, or use a code or link instead.",
  WEBRTC_FAILED: 'The devices could not complete their connection setup. Try again, or connect with a code.',
  DATA_CHANNEL_FAILED: 'The connection dropped before it was ready. Try again.',
  PEER_UNAVAILABLE: 'The other device is not reachable right now. Ask it to rejoin, or try a code.',
  DISCOVERY_TIMEOUT: 'No nearby devices responded. Make sure both devices are open on ShareTexts.',
  TRANSFER_TIMEOUT: 'The transfer stopped making progress. Try sending again.',
  HASH_MISMATCH: "The file arrived damaged and was discarded. Try sending it again.",
  QUOTA_EXCEEDED: "This device is out of storage space. Free up space and try again.",
  TRANSFER_CANCELLED: 'Transfer cancelled.',
  PROTOCOL_MISMATCH: 'The other device is running a different ShareTexts version. Refresh both devices.',
};

export function humanizeError(code: string | undefined, fallback: string): string {
  if (code && ERROR_COPY[code]) return ERROR_COPY[code];
  return fallback;
}

/**
 * Structured connect failures.
 *
 * The old path matched raw English error strings with `.includes()` and
 * blamed "your internet" even when ShareTexts's own server was down. Every
 * connect/create/join failure now carries a machine-readable code so the UI
 * can say what ACTUALLY happened and translate it:
 *
 *   OFFLINE      the device has no network (navigator.onLine === false)
 *   UNREACHABLE  the signaling service is down / blocked (health probe failed)
 *   TIMEOUT      the service is alive but too slow to answer
 *   CONFIG       deployed build has no signaling URL baked in (operator error)
 *   RATE_LIMITED the server answered and asked us to slow down
 *   REJECTED     the server answered and refused this specific request
 *   UNKNOWN      anything else
 */
export type ConnectFailureCode =
  | 'OFFLINE' | 'UNREACHABLE' | 'TIMEOUT' | 'CONFIG'
  | 'RATE_LIMITED' | 'REJECTED' | 'UNKNOWN'
  // Direct device-to-device failures (server fine, P2P link failed).
  | 'ICE_FAILED' | 'WEBRTC_FAILED' | 'DATA_CHANNEL_FAILED' | 'PEER_UNAVAILABLE';

export class ConnectError extends Error {
  readonly code: ConnectFailureCode;
  constructor(code: ConnectFailureCode, message?: string) {
    super(message || code);
    this.name = 'ConnectError';
    this.code = code;
  }
}

/** Map any thrown value to a ConnectFailureCode. Cheap heuristics only run
 *  when the thrower didn't attach a code itself. */
export function describeConnectFailure(e: unknown): ConnectFailureCode {
  if (e instanceof ConnectError) return e.code;
  const msg = e instanceof Error ? e.message : String(e ?? '');
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return 'OFFLINE';
  if (/offline|network/i.test(msg)) return 'OFFLINE';
  if (/reach|unreachable|not allowed/i.test(msg)) return 'UNREACHABLE';
  if (/long|timeout|slow/i.test(msg)) return 'TIMEOUT';
  if (/many attempts|rate/i.test(msg)) return 'RATE_LIMITED';
  return 'UNKNOWN';
}
