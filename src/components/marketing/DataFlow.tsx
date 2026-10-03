import React from 'react';
import {
  ShieldCheck, Server, ArrowRightArrowLeft as ArrowRightLeft, Lock, Check,
} from '@gravity-ui/icons';
import { cn } from '../../lib/utils';

/**
 * DataFlow — the honest picture of what happens when you send something.
 *
 * Three facts, in the order they matter, and nothing decorative:
 *
 *   1. The signaling server only INTRODUCES the two devices — it carries the
 *      room code and the handshake, never the content.
 *   2. The content itself goes device → device, encrypted end to end.
 *   3. Nothing is left behind: no copy on a server, no history to leak.
 *
 * Shape follows that order: two device tiles that are unmistakably the same
 * weight, a wire between them that a packet visibly rides, and the server
 * drawn BELOW the wire (present, smaller, out of the path) rather than
 * between the two devices — which is exactly the misconception this block
 * exists to correct. Static under reduced motion; the wire still reads.
 */
const STEPS: { icon: React.ElementType; title: string; body: string }[] = [
  {
    icon: ArrowRightLeft,
    title: 'They find each other',
    body: 'One six-character code, a QR scan, or a link. Our server reads it once to introduce the two devices — that is the only thing it ever sees.',
  },
  {
    icon: Lock,
    title: 'The bytes go device to device',
    body: 'Files, photos and text travel straight between the two browsers, encrypted end to end. Nothing is uploaded, so there is nothing to leak.',
  },
  {
    icon: Check,
    title: 'The room closes and it is gone',
    body: 'Close the room (or let it expire) and the connection, the code and everything inside it stop existing. No account, no history, no copy.',
  },
];

export function DataFlow({ className }: { className?: string }) {
  return (
    <section className={cn('w-full', className)} aria-labelledby="flow-title">
      <div className="flex items-baseline gap-3 mb-5">
        <h2
          id="flow-title"
          className="text-[11px] font-semibold uppercase tracking-[0.09em] text-apple-ink-muted/75 dark:text-white/40"
        >
          How a transfer works
        </h2>
        <span className="h-px flex-1 bg-apple-divider/70 dark:bg-white/[0.07]" aria-hidden />
      </div>

      <div className="relative">
        {/* The wire. Non-scaling stroke keeps it 1.5px at any width; the
            second path is the packet riding it (transform-free, dashoffset
            only — one cheap paint per frame on a small area). */}
        <svg
          aria-hidden
          viewBox="0 0 100 20"
          preserveAspectRatio="none"
          className="pointer-events-none absolute left-0 top-1/2 h-16 w-full -translate-y-1/2"
        >
          <path
            d="M 2 10 C 30 10, 70 10, 98 10"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.5}
            strokeDasharray="4 4"
            vectorEffect="non-scaling-stroke"
            className="text-apple-divider dark:text-white/[0.14]"
          />
          <path
            d="M 2 10 C 30 10, 70 10, 98 10"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.5}
            strokeDasharray="14 86"
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
            pathLength={100}
            className="st-flow-pulse text-ember"
          />
        </svg>

        {/* The two ends, same weight, same shape. */}
        <div className="relative grid grid-cols-[1fr_auto_1fr] items-center gap-3 sm:gap-6">
          <DeviceTile icon="laptop" label="Your device" sub="the browser you already have" />
          <span className="flex flex-col items-center gap-1 px-1">
            <span className="rounded-full bg-ember/10 px-3 py-1.5 text-[11px] font-semibold text-ember dark:bg-ember/[0.16] dark:text-[#fb9243]">
              encrypted
            </span>
            <span className="hidden text-[10.5px] font-medium uppercase tracking-[0.08em] text-apple-ink-muted/70 dark:text-white/35 sm:block">
              device to device
            </span>
          </span>
          <DeviceTile icon="phone" label="Their device" sub="any phone, tablet or PC" />
        </div>
      </div>

      {/* The server, deliberately below the wire and visibly smaller. */}
      <div className="mt-4 flex items-center justify-center gap-3 text-center">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] bg-black/[0.045] text-apple-ink-muted dark:bg-white/[0.06] dark:text-white/40">
          <Server className="h-4 w-4" aria-hidden />
        </span>
        <p className="max-w-[420px] text-left text-[12.5px] leading-snug text-apple-ink-muted dark:text-white/50">
          Our signaling server sits beside the wire, not in it: it hands over the room code and steps
          out. It never sees a file, a photo, or a word you type.
        </p>
      </div>

      <ol className="mt-8 grid gap-6 sm:grid-cols-3">
        {STEPS.map((step, i) => (
          <li key={step.title} className="flex flex-col">
            <span className="flex items-center gap-2">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-ember/10 text-[12px] font-bold text-ember dark:bg-ember/[0.16] dark:text-[#fb9243]">
                {i + 1}
              </span>
              <step.icon className="h-4 w-4 text-apple-ink-muted dark:text-white/45" aria-hidden />
            </span>
            <h3 className="mt-2.5 text-[14.5px] font-semibold text-apple-ink dark:text-white">{step.title}</h3>
            <p className="mt-1.5 text-[13px] leading-relaxed text-apple-ink-muted dark:text-white/55">{step.body}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}

/** One end of the wire: a screen-shaped tile, drawn not illustrated. */
function DeviceTile({
  icon,
  label,
  sub,
}: {
  icon: 'laptop' | 'phone';
  label: string;
  sub: string;
}) {
  return (
    // Opaque surface, not a tinted one: the packet wire runs behind this
    // tile, and a translucent background would let the dashes cross the
    // label. Solid canvas tones keep the wire visible only in the gap
    // between the two ends, where it means something.
    <div className="flex flex-col items-center gap-2 rounded-[16px] border border-apple-divider/70 bg-apple-canvas p-3.5 text-center dark:border-white/[0.08] dark:bg-night-900 sm:p-4">
      <span
        className={cn(
          'flex items-center justify-center rounded-[8px] bg-apple-ink/[0.05] text-apple-ink-muted dark:bg-white/[0.06] dark:text-white/50',
          icon === 'laptop' ? 'h-9 w-14' : 'h-11 w-7',
        )}
        aria-hidden
      >
        {icon === 'laptop' ? (
          <span className="h-[3px] w-8 rounded-full bg-current opacity-40" />
        ) : (
          <span className="h-[3px] w-5 rounded-full bg-current opacity-40" />
        )}
      </span>
      <span className="text-[13.5px] font-semibold text-apple-ink dark:text-white">{label}</span>
      <span className="text-[12px] leading-snug text-apple-ink-muted dark:text-white/50">{sub}</span>
      <span className="mt-0.5 flex items-center gap-1 text-[11px] font-medium text-[#2b9e49] dark:text-[#4fd071]">
        <ShieldCheck className="h-3.5 w-3.5" aria-hidden />
        no account
      </span>
    </div>
  );
}

export default DataFlow;
