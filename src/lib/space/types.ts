/** Temporary Space client types (F14) — mirrors the server wire contract. */

export type SpaceItemKind = 'text' | 'link' | 'file';

export interface SpaceItem {
  id: string;
  seq: number;
  kind: SpaceItemKind;
  name?: string;
  mime: string;
  size: number;
  createdAt: number;
  addedBy: string;
  addedByName: string;
  text?: string;
  sha256?: string;
  state: 'READY' | 'UPLOADING';
}

export interface SpaceSnapshot {
  spaceId: string;
  name: string;
  createdAt?: number;
  expiresAt: number;
  durationMs?: number;
  memberCount: number;
  isCreator: boolean;
  participantId: string;
  items: SpaceItem[];
}

export interface CreateResult {
  spaceId: string;
  token: string;
  manageKey?: string;
  name: string;
  /** The space's human code (F21) — chosen by the creator or generated
   *  server-side. Always present in modern responses; optional in the type
   *  so older cached responses keep parsing. */
  code?: string;
  createdAt: number;
  expiresAt: number;
  reminderAt?: number;
  isCreator: boolean;
  participantId: string;
}

/** What the device keeps locally per space. The access token is the share
 *  secret — presence here means "this device was invited". */
export interface SpaceCreds {
  spaceId: string;
  token: string;
  manageKey?: string;
  name: string;
  expiresAt: number;
  isCreator: boolean;
  lastOpen: number;
}

export interface FileInitResult {
  itemId: string;
  mode: 'direct' | 'multipart';
  partSize?: number;
  partCount?: number;
  item: SpaceItem;
}

export interface UploadStatus {
  itemId: string;
  mode: 'direct' | 'multipart';
  state: 'UPLOADING';
  partSize?: number;
  uploadedParts?: number[];
}

export type SpaceLiveEvent =
  | { event: 'space_sync'; payload: { name: string; expiresAt: number; seq: number; memberCount: number; isCreator: boolean; items: SpaceItem[] } }
  | { event: 'item_added'; payload: { item: SpaceItem } }
  | { event: 'item_deleted'; payload: { itemId: string } }
  | { event: 'members_changed'; payload: { memberCount: number } }
  | { event: 'space_closed'; payload: { reason: string; expiresAt: number } }
  | { event: 'space_auth_failed'; payload: Record<string, never> };
