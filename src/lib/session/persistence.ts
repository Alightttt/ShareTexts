import { ChatMessage } from '../../types';

/**
 * Persistence layer for session credentials, message snapshots and the
 * Stay Connected promise. Pure localStorage — no React, no networking.
 * Extracted verbatim from SessionContext (Round 03); semantics unchanged.
 */

export const STORAGE_KEY = 'sharetext.session.v1';
export const DEVICE_NAME_KEY = 'sharetext.deviceName';

export interface StoredSession {
  roomId: string;
  secret: string;
  isCreator: boolean;
  /** Anchors the 40s pairing-code window across refreshes. */
  createdAt?: number;
  deviceName?: string;
  partnerName?: string | null;
  messages?: ChatMessage[];
  /** Room's Stay Connected state, persisted so a refresh restores the badge. */
  stayConnected?: boolean;
}

// Rooms are persistent: credentials + recent messages live in localStorage so
// a session can be rejoined even after the tab is closed.
export function loadStoredSession(): StoredSession | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed.roomId === 'string' && typeof parsed.secret === 'string') {
      return parsed;
    }
  } catch { /* ignore */ }
  return null;
}

export function saveStoredSession(s: StoredSession | null) {
  try {
    if (s) localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
    else localStorage.removeItem(STORAGE_KEY);
  } catch { /* ignore */ }
}

// Stay Connected rooms survive normal disconnects: the credentials live in a
// separate key so a casual "session ended" clear never destroys the promise.
// A sanitized message snapshot rides along so re-entry restores the chat —
// resetSession deliberately clears the MAIN stored session, so this key is
// the only surviving copy of the room's history.
export const LAST_STAY_KEY = 'sharetext.lastStayRoom.v1';
export interface LastStayRoom { roomId: string; secret: string; messages?: ChatMessage[]; partnerName?: string | null; messageCount?: number; lastActiveAt?: number }
export function loadLastStayRoom(): LastStayRoom | null {
  try {
    const raw = localStorage.getItem(LAST_STAY_KEY);
    if (raw) {
      const p = JSON.parse(raw);
      if (p && typeof p.roomId === 'string' && typeof p.secret === 'string') return p;
    }
  } catch { /* ignore */ }
  return null;
}
export function saveLastStayRoom(v: LastStayRoom | null) {
  try {
    if (v) localStorage.setItem(LAST_STAY_KEY, JSON.stringify(v));
    else localStorage.removeItem(LAST_STAY_KEY);
  } catch { /* ignore */ }
}
/** Refresh ONLY the credential half of the last-stay record, preserving any
 *  message snapshot already saved for that room. */
export function saveLastStayCredentials(roomId: string, secret: string) {
  const prev = loadLastStayRoom();
  saveLastStayRoom({ roomId, secret, messages: prev?.roomId === roomId ? prev.messages : undefined });
}

/**
 * Blob object URLs die with the page — they are page-lifetime artifacts, so
 * they must NEVER be persisted. A restored session that keeps the old `blob:`
 * URL renders a broken preview (and logs REQFAIL) after every reload. Strip
 * the URL on the way out AND on the way in (for data stored before this fix),
 * and mark partner files we received but no longer hold as 'restoring' — the
 * peer is asked to re-send the bytes the moment the channel reopens.
 */
export function sanitizeStoredMessages(msgs: ChatMessage[] | undefined): ChatMessage[] {
  if (!msgs) return [];
  return msgs.map(m => {
    if (!m.attachment) return m;
    const a = { ...m.attachment };
    delete a.url;
    if (m.sender === 'partner' && a.status === 'complete') {
      a.status = 'restoring';
      a.progress = 0;
    }
    return { ...m, attachment: a };
  });
}
