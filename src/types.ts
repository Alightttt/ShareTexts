export type ConnectionType = 'connecting' | 'local' | 'direct' | 'relay' | 'disconnected';

export interface Attachment {
  id: string; // unique transfer id
  type: 'image' | 'file' | 'video' | 'audio';
  name: string;
  size: number;
  mimeType: string;
  url?: string; // object URL for preview/download
  status?: 'draft' | 'sending' | 'receiving' | 'complete' | 'failed';
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
  isCreator: boolean;
  partnerConnected: boolean;
  connectionType: ConnectionType;
  messages: ChatMessage[];
  closedReason?: string | null;
  deviceName: string;
  partnerName: string | null;
}
