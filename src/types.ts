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
  status?: 'draft' | 'sending' | 'receiving' | 'complete' | 'failed' | 'cancelled';
  progress?: number;
}

export interface ChatMessage {
  id: string;
  sender: 'me' | 'partner';
  text: string;
  timestamp: number;
  attachment?: Attachment;
}

export interface SessionState {
  roomId: string | null;
  secret: string | null; // For creator to generate TOTP
  /** Room creation time — anchors the 40s pairing-code window. */
  createdAt?: number;
  isCreator: boolean;
  partnerConnected: boolean;
  connectionType: ConnectionType;
  messages: ChatMessage[];
  closedReason?: string | null;
  deviceName: string;
  partnerName: string | null;
}
