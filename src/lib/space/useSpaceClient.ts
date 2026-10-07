/**
 * SpaceClient — one instance per mounted space view (F14). Owns the
 * snapshot, applies live deltas, runs the local countdown, and exposes
 * actions. Keeps SpaceView presentational: all state changes flow through
 * here. Local upload entries are tracked separately (their lifecycle is
 * device-side) and merged into the rendered list.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { addText, closeSpace, deleteItem, downloadItem, forgetSpace, joinSpace, localCreds } from './api';
import { connectSpaceLive } from './live';
import { abortUpload, uploadFile, type UploadHandle, type UploadProgress } from './uploader';
import type { SpaceItem, SpaceSnapshot } from './types';
import { productEvent } from '../telemetry';

export type ConnState = 'connecting' | 'live' | 'offline' | 'closed' | 'error';

export interface LocalUpload {
  key: string; // local tracking id (== itemId once init answers)
  name: string;
  size: number;
  progress: UploadProgress;
  handle: UploadHandle | null;
  /** Kept so a failed upload can be retried without re-picking the file. */
  file: File;
}

export interface SpaceClient {
  snapshot: SpaceSnapshot | null;
  items: SpaceItem[];        // merged: READY server items + local upload rows
  uploads: LocalUpload[];
  conn: ConnState;
  nowMs: number;             // ticking clock for countdowns
  addTextItem(text: string, kind: 'text' | 'link'): Promise<void>;
  startUpload(file: File): void;
  cancelUpload(key: string): void;
  dismissUpload(key: string): void;
  pauseUpload(key: string): void;
  resumeUpload(key: string): void;
  retryUpload(key: string): void;
  removeItem(itemId: string): Promise<void>;
  download(itemId: string): Promise<void>;
  closeNow(): Promise<void>;
  forget(): void;
}

export function useSpaceClient(spaceId: string, token: string): SpaceClient {
  // The URL fragment token wins; recent-space re-entry may arrive without
  // one — fall back to this device's stored credential for the space.
  const authToken = token || localCreds(spaceId)?.token || '';
  const [snapshot, setSnapshot] = useState<SpaceSnapshot | null>(null);
  const [items, setItems] = useState<SpaceItem[]>([]);
  const [uploads, setUploads] = useState<LocalUpload[]>([]);
  const [conn, setConn] = useState<ConnState>('connecting');
  const [nowMs, setNowMs] = useState(() => Date.now());
  const uploadsRef = useRef(new Map<string, LocalUpload>());
  const seqRef = useRef(0);

  const upsertSorted = useCallback((next: SpaceItem[]) => {
    next.sort((a, b) => b.createdAt - a.createdAt || b.seq - a.seq);
    setItems(next);
  }, []);

  // ── join + live connection ────────────────────────────────────────────
  useEffect(() => {
    let disposed = false;
    let disposeLive: (() => void) | null = null;

    (async () => {
      try {
        if (!authToken) throw Object.assign(new Error('no access'), { status: 401 });
        const snap = await joinSpace(spaceId, authToken);
        if (disposed) return;
        setSnapshot(snap);
        seqRef.current = Math.max(seqRef.current, ...snap.items.map(i => i.seq), 0);
        upsertSorted([...snap.items]);
        setConn('live');
        productEvent('product.space_joined');
        disposeLive = connectSpaceLive(spaceId, authToken, snap.name, {
          onStatus: (s) => { if (!disposed) setConn(s); },
          onEvent: (e) => {
            if (disposed) return;
            switch (e.event) {
              case 'space_sync': {
                setSnapshot(prev => prev ? { ...prev, name: e.payload.name, expiresAt: e.payload.expiresAt, memberCount: e.payload.memberCount } : prev);
                seqRef.current = Math.max(seqRef.current, e.payload.seq);
                upsertSorted([...e.payload.items]);
                break;
              }
              case 'item_added': {
                const it = e.payload.item;
                if (it.state !== 'READY') break;
                seqRef.current = Math.max(seqRef.current, it.seq);
                setItems(prev => {
                  const next = prev.filter(p => p.id !== it.id);
                  next.push(it);
                  next.sort((a, b) => b.createdAt - a.createdAt || b.seq - a.seq);
                  return next;
                });
                break;
              }
              case 'item_deleted': {
                setItems(prev => prev.filter(p => p.id !== e.payload.itemId));
                break;
              }
              case 'members_changed': {
                setSnapshot(prev => prev ? { ...prev, memberCount: e.payload.memberCount } : prev);
                break;
              }
              case 'space_closed': {
                setConn('closed');
                disposeLive?.();
                break;
              }
              default:
                break;
            }
          },
        });
      } catch (err) {
        if (disposed) return;
        const status = (err as { status?: number }).status;
        if (status === 410 || (err as { closed?: boolean }).closed) setConn('closed');
        else setConn('error');
      }
    })();

    return () => {
      disposed = true;
      disposeLive?.();
    };
  }, [spaceId, token, upsertSorted]);

  // ── local countdown tick (1 Hz) ───────────────────────────────────────
  useEffect(() => {
    const t = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  // Server-authoritative closure: never show an active space past expiry (§6).
  const expired = !!snapshot && nowMs >= snapshot.expiresAt;
  useEffect(() => {
    if (expired) setConn(prev => (prev === 'closed' ? prev : 'closed'));
  }, [expired]);

  // A closed space is never re-openable — drop the local credential so it
  // stops appearing in "recent spaces" (the share link still works if kept).
  useEffect(() => {
    if (conn === 'closed') forgetSpace(spaceId);
  }, [conn, spaceId]);

  // ── actions ───────────────────────────────────────────────────────────
  const addTextItem = useCallback(async (text: string, kind: 'text' | 'link') => {
    const item = await addText(spaceId, text, kind);
    seqRef.current = Math.max(seqRef.current, item.seq);
    setItems(prev => {
      if (prev.some(p => p.id === item.id)) return prev;
      const next = [...prev, item];
      next.sort((a, b) => b.createdAt - a.createdAt || b.seq - a.seq);
      return next;
    });
  }, [spaceId]);

  const startUpload = useCallback((file: File) => {
    const key = `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const entry: LocalUpload = {
      key, name: file.name, size: file.size,
      progress: { phase: 'preparing', sent: 0, size: file.size, prepare: 0 },
      handle: null,
      file,
    };
    uploadsRef.current.set(key, entry);
    setUploads([...uploadsRef.current.values()]);

    const { handle, done } = uploadFile(spaceId, file, (p) => {
      const cur = uploadsRef.current.get(key);
      if (!cur) return;
      cur.progress = p;
      setUploads([...uploadsRef.current.values()]);
    });
    entry.handle = handle;

    done
      .then((item) => {
        productEvent('product.space_item_uploaded');
        uploadsRef.current.delete(key);
        setUploads([...uploadsRef.current.values()]);
        seqRef.current = Math.max(seqRef.current, item.seq);
        setItems(prev => {
          if (prev.some(p => p.id === item.id)) return prev;
          const next = [...prev, item];
          next.sort((a, b) => b.createdAt - a.createdAt || b.seq - a.seq);
          return next;
        });
      })
      .catch(() => {
        const cur = uploadsRef.current.get(key);
        if (cur && cur.progress.phase !== 'cancelled') {
          cur.progress = { ...cur.progress, phase: 'failed' };
          setUploads([...uploadsRef.current.values()]);
        }
      });
  }, [spaceId]);

  const cancelUpload = useCallback((key: string) => {
    const cur = uploadsRef.current.get(key);
    if (!cur) return;
    cur.progress = { ...cur.progress, phase: 'cancelled' };
    setUploads([...uploadsRef.current.values()]);
    cur.handle?.cancel();
    setTimeout(() => {
      uploadsRef.current.delete(key);
      setUploads([...uploadsRef.current.values()]);
    }, 2500);
  }, []);

  const dismissUpload = useCallback((key: string) => {
    const cur = uploadsRef.current.get(key);
    cur?.handle?.cancel();
    uploadsRef.current.delete(key);
    setUploads([...uploadsRef.current.values()]);
  }, []);

  const pauseUpload = useCallback((key: string) => {
    const cur = uploadsRef.current.get(key);
    if (!cur || (cur.progress.phase !== 'uploading' && cur.progress.phase !== 'preparing')) return;
    cur.handle?.pause();
  }, []);

  const resumeUpload = useCallback((key: string) => {
    const cur = uploadsRef.current.get(key);
    if (!cur || cur.progress.phase !== 'paused') return;
    cur.handle?.resume();
  }, []);

  const retryUpload = useCallback((key: string) => {
    const cur = uploadsRef.current.get(key);
    if (!cur || cur.progress.phase !== 'failed') return;
    uploadsRef.current.delete(key);
    setUploads([...uploadsRef.current.values()]);
    startUpload(cur.file);
  }, [startUpload]);

  const removeItem = useCallback(async (itemId: string) => {
    await deleteItem(spaceId, itemId);
    setItems(prev => prev.filter(p => p.id !== itemId));
  }, [spaceId]);

  const download = useCallback(async (itemId: string) => {
    const item = items.find(i => i.id === itemId);
    if (item) await downloadItem(spaceId, item);
  }, [spaceId, items]);

  const closeNow = useCallback(async () => {
    await closeSpace(spaceId);
    setConn('closed');
  }, [spaceId]);

  const forget = useCallback(() => forgetSpace(spaceId), [spaceId]);

  return { snapshot, items, uploads, conn, nowMs, addTextItem, startUpload, cancelUpload, dismissUpload, pauseUpload, resumeUpload, retryUpload, removeItem, download, closeNow, forget };
}
