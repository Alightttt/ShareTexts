import { diag } from './diag';

/**
 * Multi-recipient transfer scheduler.
 *
 * One logical share (one user action) fans out to N recipients. The source
 * work (File slices, checksum) is shared; each RECIPIENT gets an independent
 * queue entry with its own real progress, success, failure, retry and
 * cancel. Fairness is lane-based: CONTROL/SMALL items (text, links) jump
 * ahead of BULK items (file bytes), so a lightweight share stays responsive
 * while a big file crawls to a slow device.
 *
 * There is deliberately NO fixed recipient cap — a 30-recipient send is
 * admitted in full. The scheduler manages the load with a bounded number of
 * ACTIVE bulk lanes (a runtime resource policy): the rest queue as 'waiting'
 * and start the moment a lane frees. Fast devices finish early; a slow or
 * offline device never blocks the others.
 */

export type Lane = 'control' | 'bulk';

export interface ScheduledJob {
  /** Logical operation id (the message id — one action = one job). */
  opId: string;
  recipientId: string;
  lane: Lane;
  /** Stable sort key within a lane (FIFO by enqueue time). */
  seq: number;
  run: () => Promise<void>;
}

type Waiter = { job: ScheduledJob; resolve: (ok: boolean) => void };

export class TransferScheduler {
  private queues: Record<Lane, Waiter[]> = { control: [], bulk: [] };
  private activeBulk = 0;
  private seqCounter = 0;
  private destroyed = false;
  /** Max simultaneous BULK lanes — the fan-out throttle. Generous: a LAN
   *  saturates at 2–3, but more lanes keep many small files moving. */
  private maxActiveBulk: number;

  constructor(maxActiveBulk = 3) {
    this.maxActiveBulk = Math.max(1, maxActiveBulk);
  }

  /** Current queue depth for a recipient (diagnostics/tests). */
  depthFor(recipientId: string): number {
    let n = 0;
    for (const q of [this.queues.control, this.queues.bulk]) {
      for (const w of q) if (w.job.recipientId === recipientId) n++;
    }
    return n;
  }

  /** Total pending jobs (both lanes). */
  get pending(): number {
    return this.queues.control.length + this.queues.bulk.length;
  }

  /**
   * Enqueue one recipient's work. Resolves when the job finished running —
   * true on success, false if it was dropped (cancel/destroy/shutdown).
   * The caller's `run` should throw on failure; the scheduler records the
   * outcome and never lets one job's throw escape.
   */
  enqueue(job: Omit<ScheduledJob, 'seq'>): Promise<boolean> {
    if (this.destroyed) return Promise.resolve(false);
    const full: ScheduledJob = { ...job, seq: this.seqCounter++ };
    return new Promise<boolean>((resolve) => {
      const q = this.queues[full.lane];
      q.push({ job: full, resolve });
      diag('sched.enqueue', true, `${full.lane} ${full.opId.slice(0, 8)} → ${full.recipientId.slice(0, 8)} (pending=${this.pending})`);
      this.pump();
    });
  }

  /** Remove every queued (not yet running) job for an operation. Running
   *  jobs observe cancellation through their own abort signals. */
  cancelOp(opId: string): void {
    for (const lane of ['control', 'bulk'] as const) {
      const q = this.queues[lane];
      for (let i = q.length - 1; i >= 0; i--) {
        if (q[i].job.opId === opId) {
          const [, w] = q.splice(i, 1);
          try { w.resolve(false); } catch { /* noop */ }
        }
      }
    }
    this.pump();
  }

  destroy(): void {
    this.destroyed = true;
    const all = [...this.queues.control, ...this.queues.bulk];
    this.queues.control = [];
    this.queues.bulk = [];
    for (const w of all) {
      try { w.resolve(false); } catch { /* noop */ }
    }
  }

  /** Start as much queued work as the lane budgets allow. */
  private pump(): void {
    if (this.destroyed) return;
    // CONTROL lane: unbounded concurrency — these are tiny sends (metadata,
    // text) that must never queue behind bulk bytes.
    while (this.queues.control.length > 0) {
      const w = this.queues.control.shift()!;
      void this.runJob(w);
    }
    // BULK lane: bounded active lanes; excess waits in FIFO order.
    while (this.queues.bulk.length > 0 && this.activeBulk < this.maxActiveBulk) {
      const w = this.queues.bulk.shift()!;
      this.activeBulk++;
      void this.runJob(w, () => {
        this.activeBulk--;
        this.pump();
      });
    }
  }

  private async runJob(w: Waiter, onBulkDone?: () => void): Promise<void> {
    try {
      await w.job.run();
      w.resolve(true);
    } catch (e) {
      diag('sched.job_failed', false, `${w.job.opId.slice(0, 8)} → ${w.job.recipientId.slice(0, 8)}: ${(e as Error)?.message?.slice(0, 80)}`);
      w.resolve(false);
    } finally {
      try { onBulkDone?.(); } catch { /* noop */ }
    }
  }
}
