import type { Attachment } from '../types';

/**
 * Composer draft persistence — text + staged attachments survive an
 * accidental refresh, so nothing the user typed (or picked) is lost.
 *
 * Text alone could live in localStorage, but File objects can't be
 * structured-cloned there — IndexedDB can store them natively, so the whole
 * draft (text + files) goes into one record per room.
 */

export interface DraftAttachment extends Attachment {
  file: File;
}

export interface ComposerDraft {
  text: string;
  attachments: DraftAttachment[];
  updatedAt: number;
}

const DB_NAME = 'sharetext-drafts';
const STORE = 'drafts';
const KEY_PREFIX = 'draft:';

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) {
        req.result.createObjectStore(STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function tx<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then((db) => new Promise<T>((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const req = fn(t.objectStore(STORE));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  }));
}

export async function saveDraft(roomId: string, draft: ComposerDraft): Promise<void> {
  try {
    await tx('readwrite', (s) => s.put(draft, KEY_PREFIX + roomId));
  } catch {
    // Draft saving is best-effort; never let storage failures block typing.
  }
}

export async function loadDraft(roomId: string): Promise<ComposerDraft | null> {
  try {
    const v = await tx<ComposerDraft | undefined>('readonly', (s) => s.get(KEY_PREFIX + roomId));
    return v ?? null;
  } catch {
    return null;
  }
}

export async function clearDraft(roomId: string): Promise<void> {
  try {
    await tx('readwrite', (s) => s.delete(KEY_PREFIX + roomId));
  } catch {
    // best-effort
  }
}
