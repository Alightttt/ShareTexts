/**
 * Transfer-speed engine — professional-grade progress readouts built on a
 * ROLLING throughput window instead of raw instantaneous speed.
 *
 * Why rolling: instantaneous bytes/Δt jumps wildly (a chunk boundary, a GC
 * pause, an OS scheduler hiccup) and makes a progress bar feel broken.
 * A short rolling average (default 3 s) is smooth yet still reacts within a
 * breath to real bandwidth changes.
 *
 * Consumers:
 *  - MessageCard: live "42.7 MB/s · ~14 s remaining" under the progress bar.
 *  - SessionContext: samples PeerManager.lastPace into per-transfer trackers.
 *  - Diagnostics panel: rolling send/receive throughput.
 */

/** One timestamped byte sample of progress. */
interface Sample {
  t: number; // Date.now()
  bytes: number; // cumulative bytes at time t
}

const WINDOW_MS = 3000; // rolling window — smooth yet responsive
const MAX_SAMPLES = 32; // enough to cover the window even on slow links
const MIN_SPAN_MS = 250; // don't divide by a sliver of time (no 10 GB/s spikes)
const SPEED_SMOOTHING = 0.35; // EMA on the windowed speed itself (extra polish)

export interface SpeedReading {
  bytesPerSec: number;
  etaSec: number | null; // null when total size is unknown or speed is 0
}

export class SpeedTracker {
  private samples: Sample[] = [];
  private ema: number | null = null;

  constructor(
    private totalBytes: number, // known goal (0 = unknown → no ETA)
    private startedAt: number = Date.now(),
  ) {}

  /** Report cumulative progress. Cheap; call as often as you like. */
  update(cumulativeBytes: number): SpeedReading {
    const now = Date.now();
    const last = this.samples[this.samples.length - 1];
    if (last && cumulativeBytes === last.bytes && now - last.t < WINDOW_MS) {
      return this.reading(); // no progress — keep the last honest reading
    }
    this.samples.push({ t: now, bytes: cumulativeBytes });
    if (this.samples.length > MAX_SAMPLES) this.samples.shift();
    // Drop samples older than the window (keep one straddler for the slope).
    while (this.samples.length > 2 && now - this.samples[1].t > WINDOW_MS) {
      this.samples.shift();
    }
    return this.reading();
  }

  private reading(): SpeedReading {
    const s = this.samples;
    if (s.length < 2) return { bytesPerSec: 0, etaSec: null };
    const newest = s[s.length - 1];
    const oldest = s[0];
    const spanMs = newest.t - oldest.t;
    const dBytes = newest.bytes - oldest.bytes;
    if (spanMs < MIN_SPAN_MS || dBytes <= 0) return { bytesPerSec: this.ema ?? 0, etaSec: null };
    const instant = (dBytes / spanMs) * 1000;
    // Extra EMA pass: windowed speed is already smooth; this removes the
    // last bit of flicker when the window itself only has 2-3 samples.
    this.ema = this.ema === null ? instant : this.ema + SPEED_SMOOTHING * (instant - this.ema);
    const bytesPerSec = Math.max(0, Math.round(this.ema));
    const remaining = this.totalBytes - newest.bytes;
    const etaSec = this.totalBytes > 0 && bytesPerSec > 0 && remaining > 0
      ? Math.ceil(remaining / bytesPerSec)
      : null;
    return { bytesPerSec, etaSec };
  }

  /** Windowed average since start (metrics/diagnostics). */
  average(): number {
    const s = this.samples;
    if (s.length < 2) return 0;
    const newest = s[s.length - 1];
    const span = newest.t - this.startedAt;
    return span > 500 ? Math.max(0, Math.round((newest.bytes / span) * 1000)) : 0;
  }
}

/** Per-transfer registry so MessageCard rows and the context share trackers. */
const trackers = new Map<string, SpeedTracker>();

export function speedTrackerFor(id: string, totalBytes: number): SpeedTracker {
  let t = trackers.get(id);
  if (!t) {
    t = new SpeedTracker(totalBytes);
    trackers.set(id, t);
  }
  return t;
}

export function dropSpeedTracker(id: string) {
  trackers.delete(id);
}

/** Format bytes/sec for UI: "42.7 MB/s". */
export function formatSpeed(bps: number): string {
  if (!bps || bps <= 0) return '';
  const units = ['B/s', 'KB/s', 'MB/s', 'GB/s'];
  let v = bps;
  let u = 0;
  while (v >= 1000 && u < units.length - 1) { v /= 1000; u++; }
  return `${v >= 100 ? Math.round(v) : v.toFixed(1)} ${units[u]}`;
}

/** Format ETA for UI: "~14 s remaining", "~3 min remaining". */
export function formatEta(sec: number | null): string {
  if (sec === null || !isFinite(sec)) return '';
  if (sec < 5) return 'a few seconds remaining';
  if (sec < 60) return `~${sec} s remaining`;
  const m = Math.ceil(sec / 60);
  return `~${m} min remaining`;
}
