/**
 * Transfer metrics — the hidden data behind every transfer, recorded for
 * proof and used to make the app faster over time.
 *
 * WHAT is recorded (all local, all anonymous, nothing identifying):
 *   - direction (sent/received), byte size, duration
 *   - peak & average throughput (bytes/sec)
 *   - transport actually used (direct / local / relay)
 *   - pipeline depth the adaptive pacer settled on
 *   - outcome (ok / cancelled / failed / checksum-mismatch)
 *
 * WHERE it lives: a small ring buffer in localStorage
 * (`sharetext.metrics.transfers.v1`, last 40 transfers) plus a lifetime
 * aggregate (`sharetext.metrics.totals.v1`: total bytes, transfers, best
 * throughput). Nothing leaves the device — no network calls in this module.
 * The ⌘K diagnostics surface and `/metrics.json` snapshot render it; users
 * can wipe it with one tap (Clear activity).
 *
 * WHY: "make ShareTexts more measurable" — every performance claim the app
 * makes (e.g. "transfers at ~90 MB/s on LAN") should be checkable against
 * recorded reality, and the adaptive pacer's decisions should leave a trace
 * a maintainer can inspect when someone reports "slow on my phone".
 */

const RING_KEY = 'sharetext.metrics.transfers.v1';
const TOTALS_KEY = 'sharetext.metrics.totals.v1';
const RING_MAX = 40;

export interface TransferRecord {
  transferId: string;
  /** 'text' transfers are recorded only when large (chunked); files always. */
  kind: 'file' | 'text';
  direction: 'sent' | 'received';
  name?: string;          // filename (never content)
  bytes: number;
  startedAt: number;
  endedAt?: number;
  durationMs?: number;
  avgBytesPerSec?: number;
  peakBytesPerSec?: number;
  /** The adaptive pacer's final pipeline depth. */
  finalDepth?: number;
  maxDepth?: number;
  transport?: 'direct' | 'local' | 'relay';
  outcome: 'ok' | 'cancelled' | 'failed' | 'checksum-mismatch';
  /** True when the receiver's SHA-256 matched the sender's. */
  verified?: boolean;
  chunks?: number;
}

export interface MetricsTotals {
  transfers: number;
  bytes: number;
  /** Best single-transfer average throughput ever recorded (bytes/sec). */
  bestBytesPerSec: number;
  /** Total time spent moving bytes (ms) — the app's real transfer uptime. */
  transferMs: number;
  updatedAt: number;
}

const emptyTotals = (): MetricsTotals => ({ transfers: 0, bytes: 0, bestBytesPerSec: 0, transferMs: 0, updatedAt: 0 });

function readJSON<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch { return fallback; }
}

function writeJSON(key: string, value: unknown) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* private mode */ }
}

/** In-flight records (not yet in the ring) keyed by transferId. */
const live = new Map<string, TransferRecord>();
/** Peak throughput samples seen per transfer (avg is computed at finish). */
const peakSamples = new Map<string, number>();
const depthSeen = new Map<string, number>();

export function beginTransferRecord(rec: Omit<TransferRecord, 'outcome' | 'startedAt'> & { startedAt?: number }) {
  const record: TransferRecord = {
    ...rec,
    startedAt: rec.startedAt ?? Date.now(),
    outcome: rec.direction === 'sent' ? 'ok' : 'ok',
  };
  live.set(rec.transferId, record);
  peakSamples.set(rec.transferId, 0);
  depthSeen.set(rec.transferId, 0);
}

/** Called by the send loop's 1s pacing tick. Cheap, no allocation. */
export function recordTransferProgress(transferId: string, bytesPerSec: number, depth: number) {
  const peak = peakSamples.get(transferId);
  if (peak !== undefined && bytesPerSec > peak) peakSamples.set(transferId, bytesPerSec);
  const d = depthSeen.get(transferId);
  if (d !== undefined && depth > d) depthSeen.set(transferId, depth);
}

export function finishTransferRecord(
  transferId: string,
  direction: 'sent' | 'received',
  bytes: number,
  outcome: TransferRecord['outcome'] = 'ok',
  extra?: { verified?: boolean; name?: string; kind?: TransferRecord['kind'] },
) {
  const started = live.get(transferId);
  live.delete(transferId);
  const peak = peakSamples.get(transferId) ?? 0;
  peakSamples.delete(transferId);
  const maxDepth = depthSeen.get(transferId) ?? undefined;
  depthSeen.delete(transferId);

  const endedAt = Date.now();
  const durationMs = started ? endedAt - started.startedAt : undefined;
  const avg = durationMs && durationMs > 0 ? bytes / (durationMs / 1000) : undefined;

  const rec: TransferRecord = {
    transferId,
    kind: extra?.kind ?? started?.kind ?? 'file',
    direction,
    name: extra?.name ?? started?.name,
    bytes,
    startedAt: started?.startedAt ?? endedAt,
    endedAt,
    durationMs,
    avgBytesPerSec: avg ? Math.round(avg) : undefined,
    peakBytesPerSec: peak > 0 ? Math.round(peak) : undefined,
    finalDepth: undefined,
    maxDepth,
    transport: currentTransport,
    outcome,
    verified: extra?.verified,
    chunks: undefined,
  };

  const ring = readJSON<TransferRecord[]>(RING_KEY, []);
  ring.push(rec);
  while (ring.length > RING_MAX) ring.shift();
  writeJSON(RING_KEY, ring);

  const totals = readJSON<MetricsTotals>(TOTALS_KEY, emptyTotals());
  totals.transfers += 1;
  totals.bytes += bytes;
  if (avg && avg > totals.bestBytesPerSec) totals.bestBytesPerSec = Math.round(avg);
  if (durationMs) totals.transferMs += durationMs;
  totals.updatedAt = endedAt;
  writeJSON(TOTALS_KEY, totals);

  return rec;
}

/** The transport observed for the most recent activity (set by PeerManager). */
let currentTransport: TransferRecord['transport'] | undefined;
export function setCurrentTransport(t: 'direct' | 'local' | 'relay') {
  currentTransport = t;
}

export function getTransferRing(): TransferRecord[] {
  return readJSON<TransferRecord[]>(RING_KEY, []);
}

export function getMetricsTotals(): MetricsTotals {
  return readJSON<MetricsTotals>(TOTALS_KEY, emptyTotals());
}

/** Wipe all recorded activity (the diagnostics page's Clear action). */
export function clearTransferMetrics() {
  try {
    localStorage.removeItem(RING_KEY);
    localStorage.removeItem(TOTALS_KEY);
  } catch { /* private mode */ }
}

/** One compact snapshot for display or export (⌘K → Transfer stats). */
export function metricsSnapshot() {
  return {
    totals: getMetricsTotals(),
    recent: getTransferRing(),
    generatedAt: new Date().toISOString(),
  };
}
