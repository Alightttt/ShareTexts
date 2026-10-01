export type ConnectionType = 'connecting' | 'local' | 'direct' | 'relay' | 'disconnected' | 'waiting';

/** Per-device link state mirrored into React for the device picker/roster UI.
 *  Membership (being in the room) is separate from link health — a device
 *  can be a room member with no open link, and one link failing says
 *  nothing about the others. */
export type DeviceLinkState = 'none' | 'connecting' | 'connected' | 'reconnecting' | 'offline' | 'failed';

export interface PeerDevice {
  id: string;
  name: string;
  platform: string;
  joinedAt: number;
  link: DeviceLinkState;
  isSelf: boolean;
}

/** Delivery state of ONE recipient's copy of a multi-recipient send. The
 *  overall operation is a partial-success first-class object: some
 *  recipients succeed while others fail or stay pending — the room is never
 *  globally "failed" because one device dropped. */
export interface RecipientTransfer {
  recipientId: string; // stable participant id
  state: 'pending' | 'waiting' | 'sending' | 'sent' | 'failed' | 'cancelled';
  progress?: number; // 0..1 real byte progress
  startedAt?: number;
  completedAt?: number;
  error?: string;
  retryable?: boolean;
}

export interface Attachment {
  id: string; // unique transfer id
  type: 'image' | 'file' | 'video' | 'audio'; // maps onto protocol ObjectType (see lib/protocol.ts)
  name: string;
  size: number;
  mimeType: string;
  encoding?: string; // 'utf-8' | 'binary' — protocol metadata (optional today)
  url?: string; // object URL for preview/download
  status?: 'draft' | 'waiting' | 'preparing' | 'sending' | 'receiving' | 'interrupted' | 'resuming' | 'paused' | 'complete' | 'failed' | 'cancelled' | 'restoring';
  progress?: number;
  /** Wall-clock moments for the honest transfer story: when bytes actually
   *  started moving (status left waiting/preparing) and when the transfer
   *  finished. Powers the "Sent · 2.0 GB in 18 s" summary. */
  startedAt?: number;
  completedAt?: number;
  /** SHA-256 hex of the original bytes, computed by the sender before the
   *  transfer. The receiver hashes what arrived and compares — a mismatch is
   *  surfaced as a failed transfer, never a silent corruption. */
  checksum?: string;
  /** Receiver-side: the received bytes hashed to the sender's checksum. */
  verified?: boolean;
  /** Honest failure reason when a transfer can't complete.
   *  'resend-unavailable' = a restored file was re-requested but the peer no
   *  longer holds the bytes (e.g. it also reloaded) — the user must ask the
   *  sender to send it again.
   *  'checksum-mismatch' = the bytes arrived but don't match the original
   *  (corruption mid-flight) — retry restarts the transfer from zero. */
  note?: 'resend-unavailable' | 'checksum-mismatch';
  /** Multi-recipient fan-out (sender side): one sub-transfer per recipient,
   *  each with its OWN real state. `transferIds` maps participant id → the
   *  fresh wire transfer id that recipient receives (fresh per recipient so
   *  reassembly/cancel/retry stay per-device addressable). Absent on a
   *  plain 1-to-1 send and on every receiver-side card. */
  recipients?: RecipientTransfer[];
  transferIds?: Record<string, string>;
}

export interface ChatMessage {
  id: string;
  sender: 'me' | 'partner';
  /** 'push' = arrived via the agent push API (script/AI agent), not typed on
   *  the partner device. Renders like an incoming message with a small
   *  "From your push link" tag instead of the partner's name. */
  source?: 'push';
  text: string;
  timestamp: number;
  attachment?: Attachment;
  /** Set when a text message fails to leave this device, so the bubble can
   *  say "Couldn't send" honestly and offer Retry (attachments use
   *  attachment.status instead). */
  delivery?: 'failed';
  /** Multi-recipient TEXT delivery: per-recipient receipt states (sender
   *  side only). `delivered`/`seen` stay the single-recipient story. */
  textRecipients?: RecipientTransfer[];
  /** True only after the OTHER device confirms (via encrypted receipt) that
   *  this message actually arrived. Set by the sender; never guessed. */
  delivered?: boolean;
  /** True only after the OTHER device confirms its room is open with this
   *  message on screen (a 'seen' receipt — the message was actually looked
   *  at, not just stored). Set by the sender; never guessed. */
  seen?: boolean;
}

export interface SessionState {
  roomId: string | null;
  secret: string | null; // For creator to generate TOTP
  /** Room creation time — anchors the 40s pairing-code window. */
  createdAt?: number;
  isCreator: boolean;
  partnerConnected: boolean;
  /** True from the moment a peer joins until the data channel actually opens —
   *  lets the creator's pairing screen react the instant the joiner arrives. */
  partnerConnecting: boolean;
  connectionType: ConnectionType;
  messages: ChatMessage[];
  closedReason?: string | null;
  deviceName: string;
  partnerName: string | null;
  /** True after this device auto-renamed itself ("Guest iPhone" → "Guest
   *  iPhone 2") because both peers still had the same default name at first
   *  connect. The UI can surface a one-time, dismissible notice about it. */
  nameAutoAdjusted?: boolean;
  /** Stay Connected: both devices agreed to keep the room alive until one
   *  explicitly disconnects. Server exempts the room from expiry; both sides
   *  show the badge, and the landing page offers one-tap re-entry. */
  stayConnected: boolean;
  /** Multi-device room roster (this device INCLUDED, isSelf marks it).
   *  Mirrored from the authoritative RoomRoster store; absent in legacy
   *  snapshots → the UI falls back to the two-device model. */
  peers?: PeerDevice[];
  /** Recipients the composer will send to (participant ids, this device
   *  excluded). Empty = classic single-partner room. */
  recipients?: string[];
  /** Credentials for the last Stay Connected room this device was in, kept
   *  after a normal disconnect so the landing page can offer re-entry with
   *  history. Cleared when the user explicitly closes the room. */
  lastStayRoom?: { roomId: string; secret: string } | null;
}
