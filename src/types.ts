export type ConnectionType = 'connecting' | 'local' | 'direct' | 'relay' | 'disconnected' | 'waiting';

export interface Attachment {
  id: string; // unique transfer id
  type: 'image' | 'file' | 'video' | 'audio'; // maps onto protocol ObjectType (see lib/protocol.ts)
  name: string;
  size: number;
  mimeType: string;
  encoding?: string; // 'utf-8' | 'binary' — protocol metadata (optional today)
  url?: string; // object URL for preview/download
  status?: 'draft' | 'preparing' | 'sending' | 'receiving' | 'interrupted' | 'resuming' | 'complete' | 'failed' | 'cancelled' | 'restoring';
  progress?: number;
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
}
