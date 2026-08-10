import { getSocket } from './socket';
import { encryptText, decryptText, generateKey, encryptBinaryChunk, decryptBinaryChunk } from './crypto';
import { uuidToBytes, bytesToUuid } from './binaryUtils';

type SignalData = { type: 'offer' | 'answer'; sdp: string } | { type: 'candidate'; candidate: RTCIceCandidateInit };

export interface TransferPayload {
  version: number;
  type: 'chunk';
  transferId: string;
  sequence: number;
  total: number;
  payload: string;
}

const CHUNK_SIZE = 64 * 1024; // 64 KB
const MAX_TRANSFER_SIZE = 200 * 1024 * 1024; // 200 MB max total
const MAX_CHUNKS = Math.ceil(MAX_TRANSFER_SIZE / CHUNK_SIZE);

export class PeerManager {
  private pc: RTCPeerConnection | null = null;
  private dc: RTCDataChannel | null = null;
  private roomId: string;
  private peerId: string | null = null;
  private secret: string;
  private cryptoKey: CryptoKey | null = null;
  
  public onMessage: ((data: string) => void) | null = null;
  public onFileProgress: ((transferId: string, progress: number, total: number) => void) | null = null;
  public onFileComplete: ((transferId: string, blob: Blob) => void) | null = null;
  public onConnectionTypeChange: ((type: 'local' | 'direct' | 'relay') => void) | null = null;
  public onDisconnect: (() => void) | null = null;

  private isRelayFallback = false;
  private iceCandidatesQueue: RTCIceCandidateInit[] = [];
  
  private incomingTextTransfers: Map<string, { chunks: string[]; received: number; total: number }> = new Map();
  private incomingBinaryTransfers: Map<string, { chunks: ArrayBuffer[]; received: number; total: number }> = new Map();

  constructor(roomId: string, secret: string, isInitiator: boolean) {
    this.roomId = roomId;
    this.secret = secret;
    this.initCrypto().then(() => {
      this.setupSocketListeners();
      if (isInitiator) {
        // waiting for peer_joined
      }
    });
  }

  private async initCrypto() {
    this.cryptoKey = await generateKey(this.secret);
  }

  public initiateConnection(peerId: string) {
    this.peerId = peerId;
    this.createPeerConnection();
    this.dc = this.pc!.createDataChannel('chat', { negotiated: false });
    this.setupDataChannel(this.dc);

    this.pc!.createOffer()
      .then(offer => this.pc!.setLocalDescription(offer))
      .then(() => {
        getSocket().emit('signal', { 
          roomId: this.roomId, 
          to: this.peerId,
          signal: { type: 'offer', sdp: this.pc!.localDescription!.sdp }
        });
      });
  }

  private createPeerConnection() {
    this.pc = new RTCPeerConnection({
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
      ]
    });

    this.pc.onicecandidate = (event) => {
      if (event.candidate) {
        getSocket().emit('signal', {
          roomId: this.roomId,
          to: this.peerId,
          signal: { type: 'candidate', candidate: event.candidate.toJSON() }
        });
      }
    };

    this.pc.onconnectionstatechange = () => {
      if (this.pc?.connectionState === 'connected') {
        this.determineConnectionType();
      } else if (this.pc?.connectionState === 'disconnected' || this.pc?.connectionState === 'failed') {
        if (this.onDisconnect) this.onDisconnect();
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
    };
    channel.onmessage = async (event) => {
      this.handleIncomingData(event.data);
    };
    channel.onclose = () => {
      if (this.onDisconnect) this.onDisconnect();
    };
  }
  
  public expectBinaryTransfer(transferId: string, totalChunks: number) {
     this.incomingBinaryTransfers.set(transferId, { chunks: new Array(totalChunks), received: 0, total: totalChunks });
  }

  private async handleIncomingData(data: string | ArrayBuffer) {
    if (!this.cryptoKey) return;
    
    if (typeof data === 'string') {
      try {
        const parsed = JSON.parse(data) as TransferPayload;
        if (parsed.version !== 1 || parsed.type !== 'chunk') return;
        if (parsed.total > MAX_CHUNKS || parsed.total <= 0) return;
        if (parsed.sequence < 0 || parsed.sequence >= parsed.total) return;
        
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
              if (this.onMessage) this.onMessage(decrypted);
            } catch (e) {
              console.error("Failed to decrypt text");
            }
          }
        }
      } catch (e) {
        console.error("Invalid packet");
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

  private setupSocketListeners() {
    const socket = getSocket();
    
    socket.on('signal', async ({ from, signal }) => {
      if (!this.peerId) this.peerId = from;
      
      if (!this.pc) {
        this.createPeerConnection();
      }

      if (signal.type === 'offer') {
        await this.pc!.setRemoteDescription(new RTCSessionDescription(signal as RTCSessionDescriptionInit));
        
        for (const candidate of this.iceCandidatesQueue) {
          await this.pc!.addIceCandidate(new RTCIceCandidate(candidate));
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
          await this.pc!.addIceCandidate(new RTCIceCandidate(signal.candidate));
        } else {
          this.iceCandidatesQueue.push(signal.candidate);
        }
      }
    });

    socket.on('relay_message', ({ data }) => {
      this.handleIncomingData(data);
    });

    setTimeout(() => {
      if (!this.dc || this.dc.readyState !== 'open') {
        this.isRelayFallback = true;
        if (this.onConnectionTypeChange) this.onConnectionTypeChange('relay');
      }
    }, 10000);
  }

  public async send(text: string) {
    if (!this.cryptoKey) return;
    
    const encrypted = await encryptText(text, this.cryptoKey);
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
              if (this.dc!.bufferedAmount < 512 * 1024) resolve(true);
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
    if (!this.cryptoKey) return;
    const numChunks = Math.ceil(file.size / CHUNK_SIZE);
    const transferIdBytes = uuidToBytes(transferId);
    
    for (let i = 0; i < numChunks; i++) {
      const chunk = file.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE);
      const arrayBuffer = await chunk.arrayBuffer();
      const encrypted = await encryptBinaryChunk(arrayBuffer, this.cryptoKey);
      
      const packet = new Uint8Array(20 + encrypted.byteLength);
      packet.set(transferIdBytes, 0);
      const view = new DataView(packet.buffer);
      view.setUint32(16, i, true);
      packet.set(new Uint8Array(encrypted), 20);
      
      if (this.dc && this.dc.readyState === 'open') {
        if (this.dc.bufferedAmount > 2 * 1024 * 1024) {
          await new Promise(resolve => {
            const check = () => {
              if (this.dc!.bufferedAmount < 1 * 1024 * 1024) resolve(true);
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
    if (this.dc) this.dc.close();
    if (this.pc) this.pc.close();
    
    const socket = getSocket();
    socket.off('signal');
    socket.off('relay_message');
  }
}
