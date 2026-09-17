/**
 * Transfer state persistence — the IndexedDB backing for resumable transfers.
 *
 * WHY: the sender's resume path needs the original File bytes. Until now they
 * lived only in a memory map, so a page refresh (or a laptop sleeping) threw
 * away the one thing a 1.8 GB resume requires. IndexedDB stores File objects
 * natively and survives refreshes, restarts, and crashes.
 *
 * Two small stores, one database (`sharetext-transfers`):
 *   sendables  — transferId → { name, size, type, file, savedAt }
 *                (only for in-flight SENDS; deleted on completion/cancel)
 *   states     — transferId → { status, ackedChunks, totalChunks, updatedAt }
 *                (a durable mirror of the resume floor for both directions)
 *
 * Nothing here is ever uploaded anywhere; it is local-only durability.
 * Old records are swept: sendables older than 24h and states older than 7d
 * are pruned on write, so storage can't grow without bound.
 */

const DB_NAME = 'sharetext-transfers';
const DB_VERSION = 1;
const SENDABLES = 'sendables';
const STATES = 'states';

export interface SendableRecord {
  transferId: string;
  name: string;
  size: number;
  type: string;
  file: File;
  savedAt: number;
}

export interface TransferStateRecord {
  transferId: string;
  status: 'sending' | 'receiving' | 'paused' | 'interrupted';
  /** Sender side: last chunk the peer confirmed (the resume floor). */
  ackedChunks: number;
  totalChunks: number;
  updatedAt: number;
}

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(SENDABLES)) db.createObjectStore(SENDABLES, { keyPath: 'transferId' });
      if (!db.objectStoreNames.contains(STATES)) db.createObjectStore(STATES, { keyPath: 'transferId' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function withStore<T>(store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then(db => new Promise<T>((resolve, reject) => {
    const t = db.transaction(store, mode);
    const req = fn(t.objectStore(store));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  }));
}

/* ------------------------- sender-side: the bytes ------------------------ */

/** Persist the original File so a refresh can still resume this send. */
export async function saveSendable(transferId: string, file: File): Promise<void> {
  try {
    const rec: SendableRecord = { transferId, name: file.name, size: file.size, type: file.type, file, savedAt: Date.now() };
    await withStore(SENDABLES, 'readwrite', s => s.put(rec));
    void sweepOld();
  } catch { /* best-effort durability */ }
}

export async function getSendable(transferId: string): Promise<File | null> {
  try {
    const rec = await withStore<SendableRecord | undefined>(SENDABLES, 'readonly', s => s.get(transferId) as IDBRequest<SendableRecord | undefined>);
    return rec?.file ?? null;
  } catch { return null; }
}

export async function deleteSendable(transferId: string): Promise<void> {
  try { await withStore(SENDABLES, 'readwrite', s => s.delete(transferId)); } catch { /* ignore */ }
}

/* ----------------------- both sides: the resume floor -------------------- */

export async function saveTransferState(st: Omit<TransferStateRecord, 'updatedAt'>): Promise<void> {
  try {
    await withStore(STATES, 'readwrite', s => s.put({ ...st, updatedAt: Date.now() }));
  } catch { /* best-effort */ }
}

export async function getTransferState(transferId: string): Promise<TransferStateRecord | null> {
  try {
    const rec = await withStore<TransferStateRecord | undefined>(STATES, 'readonly', s => s.get(transferId) as IDBRequest<TransferStateRecord | undefined>);
    return rec ?? null;
  } catch { return null; }
}

export async function deleteTransferState(transferId: string): Promise<void> {
  try { await withStore(STATES, 'readwrite', s => s.delete(transferId)); } catch { /* ignore */ }
}

/** True when IDB transfer persistence is available (all evergreen browsers). */
export function transferStoreAvailable(): boolean {
  return typeof indexedDB !== 'undefined';
}

/* ------------------------------- sweeping -------------------------------- */

const SENDABLE_TTL = 24 * 60 * 60 * 1000;   // a day — in-flight sends only
const STATE_TTL = 7 * 24 * 60 * 60 * 1000;  // a week — resume metadata

async function sweepOld(): Promise<void> {
  try {
    const cutoffS = Date.now() - SENDABLE_TTL;
    const old = await withStore<IDBValidKey[]>(SENDABLES, 'readonly', s => s.getAllKeys());
    for (const k of old) {
      const rec = await withStore<SendableRecord | undefined>(SENDABLES, 'readonly', s => s.get(k) as IDBRequest<SendableRecord | undefined>);
      if (rec && rec.savedAt < cutoffS) await withStore(SENDABLES, 'readwrite', s => s.delete(k));
    }
    const cutoffT = Date.now() - STATE_TTL;
    const all = await withStore<TransferStateRecord[]>(STATES, 'readonly', s => s.getAll() as IDBRequest<TransferStateRecord[]>);
    for (const r of all) {
      if (r.updatedAt < cutoffT) await withStore(STATES, 'readwrite', s => s.delete(r.transferId));
    }
  } catch { /* sweeping is opportunistic */ }
}
