/**
 * ShareText transfer protocol — transport-agnostic wire and object model.
 *
 * The protocol is deliberately NOT tied to the React UI. It separates the
 * layers so humans and (future) AI agents share one transport:
 *
 *   - transport   — socket.io signaling + WebRTC data channel
 *                   (see socket.ts / webrtc.ts); a relay fallback exists
 *                   when no direct route is available
 *   - session     — rooms keyed by id, paired with a 6-digit TOTP code;
 *                   rooms live for hours and expire server-side
 *   - identity    — the room secret issued by the server after a successful
 *                   join is the ONLY credential; device names are cosmetic
 *   - encryption  — E2E: both peers derive an AES-GCM key from the room
 *                   secret (WebCrypto), so the relay never sees plaintext
 *   - transfer    — a chunked envelope over the data channel, ordered and
 *                   reassembled by transferId; binary files use a compact
 *                   binary variant of the same envelope
 *   - object type — typed transfer objects with metadata (below)
 *
 * FUTURE / agents: an HTTP or MCP adapter can map create/join/transfer onto
 * these same events without touching the UI. It is intentionally NOT
 * implemented yet, and nothing here weakens security for automation —
 * no secrets are exposed, rate limits and the CORS allowlist remain.
 */

export const OBJECT_TYPES = [
  'text',
  'url',
  'image',
  'file',
  'audio',
  'video',
  'json',
  'code',
  'structured-data',
] as const;

export type ObjectType = (typeof OBJECT_TYPES)[number];

/** Metadata carried with every transfer. `encoding`/`checksum` are optional
 *  today and become required for structured-data / agent exchanges. */
export interface TransferMetadata {
  transferId: string;
  type: ObjectType;
  size: number;      // bytes
  name?: string;     // filename or label
  encoding?: string; // 'utf-8' | 'binary' | mime charset
  checksum?: string; // optional digest, e.g. sha-256 hex (future)
}

/** One encrypted text chunk travelling over the data channel or relay. */
export interface ChunkEnvelope {
  version: 1;
  type: 'chunk';
  transferId: string;
  sequence: number;
  total: number;
  payload: string; // encrypted bytes (JSON-safe encoding)
}

/** Session-level envelope attaching metadata to a chunked transfer. */
export interface TransferEnvelope {
  meta: TransferMetadata;
  mimeType?: string;
  createdAt: number;
}

/** Maps the app's attachment kinds onto the protocol object taxonomy. */
export function objectTypeOf(kind: string): ObjectType {
  switch (kind) {
    case 'image': return 'image';
    case 'video': return 'video';
    case 'audio': return 'audio';
    case 'file': return 'file';
    default: return 'text';
  }
}
