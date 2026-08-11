import { getSocket } from './socket';
import { encryptText, decryptText, generateKey, encryptBinaryChunk, decryptBinaryChunk } from './crypto';
import { uuidToBytes, bytesToUuid } from './binaryUtils';
import type { ChunkEnvelope } from './protocol';

type SignalData = { type: 'offer' | 'answer'; sdp: string } | { type: 'candidate'; candidate: RTCIceCandidateInit };

/** The on-the-wire chunk envelope (see protocol.ts). Text transfers use this
 *  JSON form; file transfers use the compact binary variant. */
export type TransferPayload = ChunkEnvelope;

const CHUNK_SIZE = 64 * 1024; // 64 KB
const MAX_TRANSFER_SIZE = 200 * 1024 * 1024; // 200 MB max total
const MAX_CHUNKS = Math.ceil(MAX_TRANSFER_SIZE / CHUNK_SIZE);
const OFFER_RETRY_DELAY = 4000;
const OFFER_RETRY_MAX = 3;

export class PeerManager {
  private pc: RTCPeerConnection | null = null;
  private dc: RTCDataChannel | null = null;
  private roomId: string;
  private peerId: string | null = null;
  private secret: string;
  private cryptoKey: CryptoKey | null = null;
  private cryptoPromise: Promise<CryptoKey>;
  private destroyed = false;
  private retryTimer: ReturnType<typeof setInterval> | null = null;

  public onMessage: ((data: string) => void) | null = null;
  public onFileProgress: ((transferId: string, progress: number, total: number) => void) | null = null;
  public onFileComplete: ((transferId: string, blob: Blob) => void) | null = null;
  public onConnectionTypeChange: ((type: 'local' | 'direct' | 'relay') => void) | null = null;
  public onDisconnect: (() => void) | null = null;
  public onHello: ((name: string) => void) | null = null;
  public onOpen: (() => void) | null = null;

  private isRelayFallback = false;
  private iceCandidatesQueue: RTCIceCandidateInit[] = [];

  private incomingTextTransfers: Map<string, { chunks: string[]; received: number; total: number }> = new Map();
  private incomingBinaryTransfers: Map<string, { chunks: ArrayBuffer[]; received: number; total: number }> = new Map();

  constructor(roomId: string, secret: string, isInitiator: boolean) {
    this.roomId = roomId;
    this.secret = secret;
    // Register signaling listeners SYNCHRONOUSLY. The peer's offer can arrive
    // while crypto is still being derived; if we waited, we would miss it and
    // the two devices would hang on "Connecting..." forever.
    this.setupSocketListeners();
    this.cryptoPromise = this.initCrypto();
    void isInitiator;
  }

  private async initCrypto(): Promise<CryptoKey> {
    const key = await generateKey(this.secret);
    this.cryptoKey = key;
    return key;
  }

  private async waitForCrypto(): Promise<CryptoKey> {
    return this.cryptoPromise;
  }

  public initiateConnection(peerId: string) {
    if (this.destroyed) return;
    this.peerId = peerId;
    this.createPeerConnection();
    this.dc = this.pc!.createDataChannel('chat', { negotiated: false });
    this.setupDataChannel(this.dc);

    this.sendOffer();

    // If the peer never answers (lost signal, transient drop), tear down and
    // re-offer. Only the initiating side retries, so no SDP glare is created.
    let attempts = 0;
    this.retryTimer = setInterval(() => {
      if (this.destroyed || !this.peerId) {
        if (this.retryTimer) clearInterval(this.retryTimer);
        return;
      }
      if (this.dc && this.dc.readyState === 'open') {
        if (this.retryTimer) clearInterval(this.retryTimer);
        return;
      }
      attempts++;
      if (attempts >= OFFER_RETRY_MAX) {
        if (this.retryTimer) clearInterval(this.retryTimer);
        return;
      }
      this.teardownPeerConnection();
      this.createPeerConnection();
      this.dc = this.pc!.createDataChannel('chat', { negotiated: false });
      this.setupDataChannel(this.dc);
      this.sendOffer();
    }, OFFER_RETRY_DELAY);
  }

  private teardownPeerConnection() {
    if (this.pc) {
      this.pc.onicecandidate = null;
      this.pc.onconnectionstatechange = null;
      this.pc.ondatachannel = null;
      try { this.pc.close(); } catch { /* noop */ }
    }
    this.pc = null;
    this.dc = null;
  }

  private sendOffer() {
    if (!this.pc || !this.peerId) return;
    this.pc.createOffer()
      .then(offer => this.pc!.setLocalDescription(offer))
      .then(() => {
        if (this.destroyed || !this.pc?.localDescription) return;
        getSocket().emit('signal', {
          roomId: this.roomId,
          to: this.peerId,
          signal: { type: 'offer', sdp: this.pc.localDescription.sdp }
        });
      })
      .catch(() => { /* connection may have been torn down */ });
  }

  private createPeerConnection() {
    if (this.destroyed) return;
    this.pc = new RTCPeerConnection({
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
      ]
    });

    this.pc.onicecandidate = (event) => {
      if (event.candidate && this.peerId) {
        getSocket().emit('signal', {
          roomId: this.roomId,
          to: this.peerId,
          signal: { type: 'candidate', candidate: event.candidate.toJSON() }
        });
      }
    };

    this.pc.onconnectionstatechange = () => {
      if (!this.pc) return;
      if (this.pc.connectionState === 'connected') {
        this.determineConnectionType();
      } else if (this.pc.connectionState === 'disconnected' || this.pc.connectionState === 'failed' || this.pc.connectionState === 'closed') {
        if (this.onDisconnect && this.pc.connectionState !== 'closed') this.onDisconnect();
      }
    };

    this.pc.ondatachannel = (event) => {
      this.dc = event.channel;
      this.setupDataChannel(this.dc);
    };
  }

  private setupDataChannel(channel: RTCDataChannel) {
    channel.binaryType = 'arraybuffer';
    channel.onopen = () => {
      this.isRelayFallback = false;
      this.determineConnectionType();
      void this.sendHello();
      if (this.onOpen) this.onOpen();
    };
    channel.onmessage = (event) => {
      void this.handleIncomingData(event.data);
    };
    channel.onclose = () => {
      if (this.onDisconnect) this.onDisconnect();
    };
  }

  private setupSocketListeners() {
    const socket = getSocket();

    socket.on('signal', async ({ from, signal }) => {
      if (this.destroyed) return;
      if (!this.peerId) this.peerId = from;

      if (!this.pc) {
        this.createPeerConnection();
      } else if (this.pc.connectionState === 'failed' || this.pc.connectionState === 'closed') {
        // A stale connection from a previous attempt — rebuild so we can
        // accept a fresh offer (e.g. after the peer recovered).
        this.teardownPeerConnection();
        this.createPeerConnection();
      }

      try {
        if (signal.type === 'offer') {
          // Handle SDP glare defensively (both sides offered) by rolling back
          // our local offer before accepting theirs.
          if (this.pc!.signalingState !== 'stable') {
            try {
              await this.pc!.setLocalDescription({ type: 'rollback' } as RTCSessionDescriptionInit);
            } catch { /* already stable */ }
          }
          await this.pc!.setRemoteDescription(new RTCSessionDescription(signal as RTCSessionDescriptionInit));

          for (const candidate of this.iceCandidatesQueue) {
            try { await this.pc!.addIceCandidate(new RTCIceCandidate(candidate)); } catch { /* stale */ }
          }
          this.iceCandidatesQueue = [];

          const answer = await this.pc!.createAnswer();
          await this.pc!.setLocalDescription(answer);
          socket.emit('signal', {
            roomId: this.roomId,
            to: from,
            signal: { type: 'answer', sdp: this.pc!.localDescription!.sdp }
          });
        } else if (signal.type === 'answer') {
          await this.pc!.setRemoteDescription(new RTCSessionDescription(signal as RTCSessionDescriptionInit));
        } else if (signal.type === 'candidate') {
          if (this.pc!.remoteDescription) {
            try { await this.pc!.addIceCandidate(new RTCIceCandidate(signal.candidate)); } catch { /* stale */ }
          } else {
            this.iceCandidatesQueue.push(signal.candidate);
          }
        }
      } catch (e) {
        // Signaling is best-effort; the initiator retry loop recovers.
      }
    });

    socket.on('relay_message', ({ data }) => {
      if (this.destroyed) return;
      void this.handleIncomingData(data);
    });

    // Fallback: if WebRTC never opens, switch the connection badge to relay.
    setTimeout(() => {
      if (this.destroyed) return;
      if (!this.dc || this.dc.readyState !== 'open') {
        this.isRelayFallback = true;
        if (this.onConnectionTypeChange) this.onConnectionTypeChange('relay');
      }
    }, 10000);
  }

  public expectBinaryTransfer(transferId: string, totalChunks: number) {
    this.incomingBinaryTransfers.set(transferId, { chunks: new Array(totalChunks), received: 0, total: totalChunks });
  }

  private async handleIncomingData(data: string | ArrayBuffer) {
    if (!this.cryptoKey) {
      await this.waitForCrypto();
    }

    if (typeof data === 'string') {
      try {
        const parsed = JSON.parse(data) as TransferPayload;
        if (parsed.type === 'chunk') {
          if (parsed.version !== 1) return;
          if (parsed.total > MAX_CHUNKS || parsed.total <= 0) return;
          if (!Number.isInteger(parsed.sequence) || parsed.sequence < 0 || parsed.sequence >= parsed.total) return;
          if (typeof parsed.payload !== 'string') return;

          let transfer = this.incomingTextTransfers.get(parsed.transferId);
          if (!transfer) {
            transfer = { chunks: new Array(parsed.total), received: 0, total: parsed.total };
            this.incomingTextTransfers.set(parsed.transferId, transfer);
          }

          if (!transfer.chunks[parsed.sequence]) {
            transfer.chunks[parsed.sequence] = parsed.payload;
            transfer.received++;

            if (transfer.received === transfer.total) {
              const fullEncryptedText = transfer.chunks.join('');
              this.incomingTextTransfers.delete(parsed.transferId);
              try {
                const decrypted = await decryptText(fullEncryptedText, this.cryptoKey);
                const inner = JSON.parse(decrypted);
                if (inner && inner.type === 'hello') {
                  if (this.onHello && typeof inner.name === 'string') this.onHello(inner.name);
                  return;
                }
                if (this.onMessage) this.onMessage(decrypted);
              } catch (e) {
                console.error("Failed to decrypt text");
              }
            }
          }
          return;
        }
        // Plain (unstructured) text message — handled below.
        if (this.onMessage) this.onMessage(data);
      } catch (e) {
        if (this.onMessage) this.onMessage(data);
      }
    } else if (data instanceof ArrayBuffer) {
      // Binary chunk
      if (data.byteLength < 20) return;
      const view = new DataView(data);
      const transferIdBytes = new Uint8Array(data, 0, 16);
      const transferId = bytesToUuid(transferIdBytes);
      const sequence = view.getUint32(16, true);
      const payload = data.slice(20);

      let transfer = this.incomingBinaryTransfers.get(transferId);
      if (!transfer) {
        // Expected to be pre-registered via metadata message
        return;
      }
      if (sequence < 0 || sequence >= transfer.total) return;

      if (!transfer.chunks[sequence]) {
        try {
          const decrypted = await decryptBinaryChunk(payload, this.cryptoKey);
          transfer.chunks[sequence] = decrypted;
          transfer.received++;

          if (this.onFileProgress) {
            this.onFileProgress(transferId, transfer.received, transfer.total);
          }

          if (transfer.received === transfer.total) {
            const blob = new Blob(transfer.chunks);
            this.incomingBinaryTransfers.delete(transferId);
            if (this.onFileComplete) {
              this.onFileComplete(transferId, blob);
            }
          }
        } catch (e) {
          console.error("Failed to decrypt binary chunk", e);
        }
      }
    }
  }

  private determineConnectionType() {
    if (!this.pc || this.pc.connectionState !== 'connected') return;

    this.pc.getStats().then(stats => {
      let activeCandidatePair: any = null;
      stats.forEach(report => {
        if (report.type === 'candidate-pair' && report.state === 'succeeded') {
          activeCandidatePair = report;
        }
      });

      if (activeCandidatePair) {
        const localCandidate = stats.get(activeCandidatePair.localCandidateId);
        if (localCandidate && localCandidate.candidateType === 'host') {
          if (this.onConnectionTypeChange) this.onConnectionTypeChange('local');
        } else {
          if (this.onConnectionTypeChange) this.onConnectionTypeChange('direct');
        }
      } else {
        if (this.onConnectionTypeChange) this.onConnectionTypeChange('direct');
      }
    });
  }

  private async sendHello() {
    try {
      const name = typeof window !== 'undefined'
        ? (window.localStorage.getItem('sharetext.deviceName') || undefined)
        : undefined;
      const key = await this.waitForCrypto();
      if (!this.peerId) return;
      const hello = JSON.stringify({ type: 'hello', name: name || 'Guest Device' });
      const encrypted = await encryptText(hello, key);
      const transferId = crypto.randomUUID();
      const packet: TransferPayload = {
        version: 1,
        type: 'chunk',
        transferId,
        sequence: 0,
        total: 1,
        payload: encrypted
      };
      const serialized = JSON.stringify(packet);
      if (this.dc && this.dc.readyState === 'open') {
        this.dc.send(serialized);
      } else {
        getSocket().emit('relay_message', { roomId: this.roomId, data: serialized });
      }
    } catch { /* hello is best-effort */ }
  }

  public async send(text: string) {
    const key = await this.waitForCrypto();
    if (!key) return;

    const encrypted = await encryptText(text, key);
    const transferId = crypto.randomUUID();

    const numChunks = Math.ceil(encrypted.length / CHUNK_SIZE);

    for (let i = 0; i < numChunks; i++) {
      const payload = encrypted.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE);
      const packet: TransferPayload = {
        version: 1,
        type: 'chunk',
        transferId,
        sequence: i,
        total: numChunks,
        payload
      };

      const serialized = JSON.stringify(packet);

      if (this.dc && this.dc.readyState === 'open') {
        if (this.dc.bufferedAmount > 1024 * 1024) {
          await new Promise(resolve => {
            const check = () => {
              if (this.destroyed || !this.dc) { resolve(true); return; }
              if (this.dc.bufferedAmount < 512 * 1024) resolve(true);
              else setTimeout(check, 50);
            };
            check();
          });
        }
        this.dc.send(serialized);
      } else {
        this.isRelayFallback = true;
        if (this.onConnectionTypeChange) this.onConnectionTypeChange('relay');
        getSocket().emit('relay_message', { roomId: this.roomId, data: serialized });
      }
    }
  }

  public async sendFile(file: File, transferId: string) {
    const key = await this.waitForCrypto();
    if (!key) return;
    const numChunks = Math.ceil(file.size / CHUNK_SIZE);
    const transferIdBytes = uuidToBytes(transferId);

    for (let i = 0; i < numChunks; i++) {
      const chunk = file.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE);
      const arrayBuffer = await chunk.arrayBuffer();
      const encrypted = await encryptBinaryChunk(arrayBuffer, key);

      const packet = new Uint8Array(20 + encrypted.byteLength);
      packet.set(transferIdBytes, 0);
      const view = new DataView(packet.buffer);
      view.setUint32(16, i, true);
      packet.set(new Uint8Array(encrypted), 20);

      if (this.dc && this.dc.readyState === 'open') {
        if (this.dc.bufferedAmount > 2 * 1024 * 1024) {
          await new Promise(resolve => {
            const check = () => {
              if (this.destroyed || !this.dc) { resolve(true); return; }
              if (this.dc.bufferedAmount < 1 * 1024 * 1024) resolve(true);
              else setTimeout(check, 50);
            };
            check();
          });
        }
        this.dc.send(packet.buffer);
      } else {
        this.isRelayFallback = true;
        if (this.onConnectionTypeChange) this.onConnectionTypeChange('relay');
        getSocket().emit('relay_message', { roomId: this.roomId, data: packet.buffer });
      }

      if (this.onFileProgress) {
        this.onFileProgress(transferId, i + 1, numChunks);
      }
    }
  }

  public destroy() {
    this.destroyed = true;
    if (this.retryTimer) clearInterval(this.retryTimer);
    if (this.dc) {
      try { this.dc.close(); } catch { /* noop */ }
    }
    if (this.pc) {
      try { this.pc.close(); } catch { /* noop */ }
    }

    const socket = getSocket();
    socket.off('signal');
    socket.off('relay_message');
  }
}
