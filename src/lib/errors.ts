/**
 * Maps the signaling backend's machine-readable error codes to human, on-brand
 * copy. The backend never sends stack traces or technical jargon — the UI
 * shows these friendly strings instead.
 *
 * Codes come from the Cloudflare worker (worker/src/room.ts) and the Node
 * server (server.ts). Unknown codes fall back to a generic message.
 */
const ERROR_COPY: Record<string, string> = {
  ROOM_FULL: 'This ShareText room is already full.',
  INVALID_CODE: "That code isn't valid or has expired. Ask for a fresh one.",
  SESSION_EXPIRED: 'This room has expired. Start a new one.',
  INVALID_SESSION: "This room link isn't active anymore. Ask for a fresh code.",
  ROOM_NOT_FOUND: "This room isn't active anymore.",
  RATE_LIMITED: 'Too many attempts. Try again in a minute.',
  UNSUPPORTED_VERSION: 'This app is out of date. Refresh to continue.',
  ORIGIN_NOT_ALLOWED: "ShareText's server rejected this browser. The site may need to be added to the server's allow list.",
  INVALID_MESSAGE: 'Something went wrong with that request.',
  UNREACHABLE: "Couldn't reach ShareText.",
  SIGNALING_TIMEOUT: "ShareText's server responded slowly. Try again in a moment.",
  SIGNALING_UNREACHABLE: "ShareText's connection server is unreachable. Check your internet.",
};

export function humanizeError(code: string | undefined, fallback: string): string {
  if (code && ERROR_COPY[code]) return ERROR_COPY[code];
  return fallback;
}
