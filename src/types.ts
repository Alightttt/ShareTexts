export type ConnectionType = 'connecting' | 'local' | 'direct' | 'relay' | 'disconnected';

export interface Attachment {
  id: string; // unique transfer id
  type: 'image' | 'file' | 'video' | 'audio'; // maps onto protocol ObjectType (see lib/protocol.ts)
  name: string;
  size: number;
  mimeType: string;
  encoding?: string; // 'utf-8' | 'binary' — protocol metadata (optional today)
  checksum?: string; // optional digest — protocol metadata (future)
  url?: string; // object URL for preview/download
  status?: 'draft' | 'sending' | 'receiving' | 'interrupted' | 'resuming' | 'complete' | 'failed' | 'cancelled';
  progress?: number;
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
}
