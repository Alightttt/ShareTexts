/**
 * Per-secret crypto key cache and PeerManager factory. Extracted verbatim
 * from SessionContext (Round 03); semantics unchanged.
 */

import { useRef } from 'react';
import { PeerManager } from '../webrtc';
import { generateKey } from '../crypto';

export interface CryptoKeyCache {
  /** Get or derive the crypto key for a room secret. The key is cached so
   *  reconnects skip the expensive PBKDF2 derivation (~100ms). */
  getCryptoKey(secret: string): Promise<CryptoKey>;
  /** Create a PeerManager with a precomputed key for instant crypto. */
  createPeerManager(roomId: string, secret: string, isInitiator: boolean): Promise<PeerManager>;
}

export function useCryptoKeyCache(): CryptoKeyCache {
  // Pre-computed crypto key: derived once per session secret, shared across
  // PeerManager instances (saves ~100ms PBKDF2 on reconnect/refresh).
  const cryptoKeyRef = useRef<Map<string, CryptoKey>>(new Map());

  const getCryptoKey = async (secret: string): Promise<CryptoKey> => {
    const cached = cryptoKeyRef.current.get(secret);
    if (cached) return cached;
    const key = await generateKey(secret);
    cryptoKeyRef.current.set(secret, key);
    // Keep the cache bounded (most users only have 1–2 sessions).
    if (cryptoKeyRef.current.size > 5) {
      const oldest = cryptoKeyRef.current.keys().next().value;
      if (oldest !== undefined) cryptoKeyRef.current.delete(oldest);
    }
    return key;
  };

  const createPeerManager = async (roomId: string, secret: string, isInitiator: boolean): Promise<PeerManager> => {
    const key = await getCryptoKey(secret);
    return new PeerManager(roomId, secret, isInitiator, key);
  };

  return { getCryptoKey, createPeerManager };
}
