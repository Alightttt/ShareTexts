/**
 * WebRTC connection diagnostics — real measurements, not guesses, straight
 * from the browser's getStats() API (W3C webrtc-stats):
 *
 *   - Route: DIRECT (host/srflx pair), P2P via NAT, or RELAY (TURN)
 *   - RTT:   currentRoundTripTime of the live candidate pair
 *   - Bytes: cumulative sent/received on the SCTP transport
 *
 * PeerManager already derives the coarse transport (local/direct/relay) at
 * connect time; netStats runs alongside it, sampling richer per-second
 * numbers so the diagnostics panel (and the activity tracker) can show live
 * truth. Sampling is lazy: it runs only while the panel (or a tracker) is
 * actually watching, so there is zero steady-state cost.
 */

export type IceRoute = 'direct' | 'nat-p2p' | 'relay' | 'unknown';

export interface NetStatsSnapshot {
  available: boolean;
  route: IceRoute;
  rttMs: number | null;
  bytesSent: number;
  bytesReceived: number;
  /** Candidate types of the winning pair, e.g. { local: 'host', remote: 'prflx' } */
  candidateTypes: { local?: string; remote?: string } | null;
  /** Chat DataChannel readyState ('open' | 'connecting' | 'closed' | null). */
  dcState: string | null;
  /** Outbound bytes queued inside the browser's send buffer right now. */
  bufferedBytes: number | null;
  sampledAt: number;
}

const EMPTY: NetStatsSnapshot = {
  available: false,
  route: 'unknown',
  rttMs: null,
  bytesSent: 0,
  bytesReceived: 0,
  candidateTypes: null,
  dcState: null,
  bufferedBytes: null,
  sampledAt: 0,
};

let last: NetStatsSnapshot = EMPTY;
let timer: ReturnType<typeof setInterval> | null = null;
let pcRef: WeakRef<RTCPeerConnection> | null = null;
/** The chat DataChannel — read directly (not via getStats) because
 *  readyState and bufferedAmount only exist on the live object. */
let dcRef: WeakRef<RTCDataChannel> | null = null;

function classifyPair(localType: string | undefined, remoteType: string | undefined): IceRoute {
  const lt = localType || '';
  const rt = remoteType || '';
  if (lt === 'relay' || rt === 'relay') return 'relay';
  if (lt === 'host' && rt === 'host') return 'direct';
  return 'nat-p2p'; // srflx/prflx on either side — real P2P through NAT
}

function routeLabel(r: IceRoute): string {
  if (r === 'relay') return 'Relayed (TURN)';
  if (r === 'direct') return 'Direct P2P (same network)';
  if (r === 'nat-p2p') return 'Direct P2P (NAT traversed)';
  return 'Unknown route';
}

export function describeRoute(r: IceRoute | 'local' | 'direct' | 'relay' | 'unknown'): string {
  if (r === 'local') return 'Direct P2P (same network)';
  if (r === 'direct') return 'Direct P2P (NAT traversed)';
  if (r === 'relay') return 'Relayed (TURN)';
  return 'Unknown route';
}

async function sample(): Promise<void> {
  const pc = pcRef?.deref();
  if (!pc || pc.connectionState !== 'connected') {
    last = { ...EMPTY, sampledAt: Date.now() };
    return;
  }
  try {
    const stats = await pc.getStats();
    let pair: any = null;
    const candidates = new Map<string, any>();
    let bytesSent = 0;
    let bytesReceived = 0;
    let rttMs: number | null = null;
    stats.forEach((report: any) => {
      if (report.type === 'candidate-pair' && report.state === 'succeeded') {
        // Prefer the NOMINATED pair — it's the one actually carrying data.
        if (!pair || report.nominated) pair = report;
        if (report.currentRoundTripTime != null) {
          rttMs = Math.round(report.currentRoundTripTime * 1000);
        }
      } else if (report.type === 'local-candidate' || report.type === 'remote-candidate') {
        candidates.set(report.id, report);
      } else if (report.type === 'transport' && report.selectedCandidatePairId) {
        // Some engines put the RTT on the transport via the pair only; kept
        // for completeness — bytes come from data-channel below.
      } else if (report.type === 'data-channel') {
        bytesSent = Math.max(bytesSent, report.bytesSent || 0);
        bytesReceived = Math.max(bytesReceived, report.bytesReceived || 0);
      }
    });
    let route: IceRoute = 'unknown';
    let candidateTypes: NetStatsSnapshot['candidateTypes'] = null;
    if (pair) {
      const lc = candidates.get(pair.localCandidateId);
      const rc = candidates.get(pair.remoteCandidateId);
      candidateTypes = { local: lc?.candidateType, remote: rc?.candidateType };
      route = classifyPair(lc?.candidateType, rc?.candidateType);
    }
    const dc = dcRef?.deref() ?? null;
    last = {
      available: true,
      route,
      rttMs,
      bytesSent,
      bytesReceived,
      candidateTypes,
      dcState: dc ? dc.readyState : null,
      bufferedBytes: dc ? dc.bufferedAmount : null,
      sampledAt: Date.now(),
    };
  } catch {
    last = { ...EMPTY, sampledAt: Date.now() };
  }
}

/** Begin sampling the given peer connection ~once per second. */
export function startNetStats(pc: RTCPeerConnection): void {
  pcRef = new WeakRef(pc);
  if (timer) return;
  // Immediate first sample, then a steady 1 s cadence.
  void sample();
  timer = setInterval(() => { void sample(); }, 1000);
}

/** Attach (or re-attach) the chat DataChannel so the sampler can read its
 *  readyState and bufferedAmount. Safe to call repeatedly on renegotiation. */
export function setDataChannel(dc: RTCDataChannel | null): void {
  dcRef = dc ? new WeakRef(dc) : null;
}

export function stopNetStats(): void {
  if (timer) { clearInterval(timer); timer = null; }
  pcRef = null;
  dcRef = null;
  last = { ...EMPTY, sampledAt: Date.now() };
}

/** Latest snapshot (cheap, no await — the sampler owns the cadence). */
export function getNetStats(): NetStatsSnapshot {
  return last;
}
