export type ConnectionType = 'connecting' | 'local' | 'direct' | 'relay' | 'disconnected';

export interface ChatMessage {
  id: string;
  sender: 'me' | 'partner';
  text: string;
  timestamp: number;
}

export interface SessionState {
  roomId: string | null;
  secret: string | null; // For creator to generate TOTP
  isCreator: boolean;
  partnerConnected: boolean;
  connectionType: ConnectionType;
  messages: ChatMessage[];
  closedReason?: string | null;
}
