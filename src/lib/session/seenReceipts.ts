/**
 * Seen-receipt ownership. Extracted from SessionContext (Round 03);
 * semantics unchanged.
 *
 * Honesty rule: SEEN is claimed ONLY while a room viewer is mounted AND the
 * tab is visible — never on raw socket delivery. A message that lands below
 * the fold or in a background tab is not "seen" yet. DELIVERED receipts are
 * a separate, delivery-only concern and stay with the message engine.
 */

import { useCallback, useEffect, useRef } from 'react';
import type { RefObject } from 'react';
import type { ChatMessage } from '../../types';
import { diag } from '../diag';

/** The minimal peer surface this module needs (no PeerManager import — keeps
 *  the dependency one-way and the module testable). */
export interface SeenSender {
  sendSeen(messageId: string): void;
}

export interface SeenReceipts {
  /** True while a ChatView (the actual room screen) is mounted AND visible —
   *  the ONLY condition under which this device claims "seen". */
  chatMountedRef: RefObject<boolean>;
  /** Seen receipts already sent for this session — senders must be
   *  idempotent (a message can render again after a reconnect blip). */
  seenSentRef: RefObject<Set<string>>;
  /** The room screen mounted/unmounted (or is about to). Honest seen
   *  receipts flow only from an active, visible viewer. */
  registerRoomViewer(mounted: boolean): void;
  /** Mark every partner text message currently in state as seen. Called by
   *  the viewer on mount, on message arrival, and on tab re-focus — never
   *  on raw socket delivery. */
  claimSeen(): void;
  /** Catch-up SEEN for messages from a previous visit that are already in
   *  state when the channel (re)opens: the reader has had them on screen —
   *  they were here before this session began. Requires a visible room
   *  viewer; silently does nothing otherwise. */
  catchUpSeenOnOpen(sendSeen: (messageId: string) => void): void;
  /** Confirm SEEN for a completed file card once the page is visible
   *  (deferring via visibilitychange when it is not). */
  sendSeenWhenVisible(sendSeen: () => void): void;
}

export function useSeenReceipts(
  getMessages: () => ChatMessage[],
  getPeer: () => SeenSender | null,
): SeenReceipts {
  const chatMountedRef = useRef(false);
  const seenSentRef = useRef<Set<string>>(new Set());

  const claimSeenImpl = useCallback(() => {
    if (!chatMountedRef.current) return;
    if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
    const pm = getPeer();
    if (!pm) return;
    let sent = false;
    for (const m of getMessages()) {
      if (m.sender === 'partner' && !m.seen && !m.attachment && !seenSentRef.current.has(m.id)) {
        seenSentRef.current.add(m.id);
        pm.sendSeen(m.id);
        sent = true;
      }
    }
    if (sent) diag('seen.claimed', true);
  }, [getMessages, getPeer]);

  const claimSeenRef = useRef(claimSeenImpl);
  claimSeenRef.current = claimSeenImpl;
  const claimSeen = claimSeenImpl;

  const registerRoomViewer = useCallback((mounted: boolean) => {
    chatMountedRef.current = mounted;
    if (!mounted) return;
    claimSeenRef.current();
  }, []);

  const catchUpSeenOnOpen = useCallback((sendSeen: (messageId: string) => void) => {
    if (typeof document === 'undefined' || document.visibilityState !== 'visible') return;
    if (!chatMountedRef.current) return;
    for (const m of getMessages()) {
      if (m.sender === 'partner' && !m.seen && !m.attachment && seenSentRef.current.has(m.id) === false) {
        seenSentRef.current.add(m.id);
        sendSeen(m.id);
      }
    }
  }, [getMessages]);

  const sendSeenWhenVisible = useCallback((sendSeen: () => void) => {
    if (document.visibilityState === 'visible') {
      sendSeen();
    } else {
      const onVis = () => {
        if (document.visibilityState === 'visible') {
          document.removeEventListener('visibilitychange', onVis);
          sendSeen();
        }
      };
      document.addEventListener('visibilitychange', onVis);
    }
  }, []);

  // While a viewer is registered, re-claim seen when the tab becomes visible
  // again (backgrounded tabs must not silently mark messages read).
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const onVis = () => { if (document.visibilityState === 'visible') claimSeenRef.current(); };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, []);

  return { chatMountedRef, seenSentRef, registerRoomViewer, claimSeen, catchUpSeenOnOpen, sendSeenWhenVisible };
}
