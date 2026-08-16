import React from 'react';
import { motion } from 'motion/react';
import { Check, Copy, FileText, Image as ImageIcon } from 'lucide-react';
import { ShareTextLogo } from './ShareTextLogo';
import { PhoneFrame, LaptopFrame, DeviceLabel } from './DeviceFrames';
import { DemoPhoto } from './DemoPhoto';
import { cn } from '../lib/utils';

/**
 * "Why ShareText?" — told through situations, not features.
 * Four everyday transfers, each shown as a compact device-to-device moment:
 * the objects themselves carry the story. No cards, no comparison grid.
 * Each row ends with the one thing the situation removes.
 */

const EASE = [0.16, 1, 0.3, 1] as const;

type ContentKey = 'url' | 'photo' | 'code' | 'file';

interface TransferSide {
  device: 'laptop' | 'phone';
  label: string;
  content: ContentKey;
  copy?: boolean;
}

/* ---------- The transfer objects ---------- */

const UrlCard = ({ className }: { className?: string }) => (
  <div className={cn(
    'bg-white dark:bg-[#1c1c1e] border border-apple-divider dark:border-apple-tile-3 rounded-[8px] shadow-card px-2 py-1 flex items-center gap-1 min-w-0',
    className
  )}>
    <span className="w-1 h-1 rounded-full bg-status-success shrink-0" />
    <span className="font-mono text-[7.5px] text-apple-ink dark:text-white truncate">example.com/a/very-long-link</span>
  </div>
);

const PhotoCard = ({ className }: { className?: string }) => (
  <div className={cn(
    'w-[76px] aspect-[4/3] rounded-[8px] overflow-hidden border border-apple-hairline/60 dark:border-white/[0.06] shadow-card',
    className
  )}>
    <DemoPhoto className="w-full h-full" />
  </div>
);

const FileCard = ({ className }: { className?: string }) => (
  <div className={cn(
    'bg-white dark:bg-[#1c1c1e] border border-apple-divider dark:border-apple-tile-3 rounded-[8px] shadow-card px-2 py-1.5 flex flex-col gap-1',
    className
  )}>
    <div className="flex items-center gap-1">
      <span className="w-3.5 h-3.5 rounded-[4px] bg-status-danger/10 flex items-center justify-center">
        <FileText className="w-2 h-2 text-status-danger" strokeWidth={2.4} />
      </span>
      <span className="text-[7.5px] font-semibold text-apple-ink dark:text-white truncate">IMG_2041.jpeg</span>
    </div>
    <span className="text-[6.5px] font-medium text-apple-ink-muted">Original · 4.2 MB</span>
  </div>
);

const CodeCard = ({ className }: { className?: string }) => (
  <div className={cn(
    'bg-white dark:bg-[#1c1c1e] border border-apple-divider dark:border-apple-tile-3 rounded-[8px] shadow-card px-2 py-1.5 flex flex-col gap-[3px] min-w-0',
    className
  )}>
    <span className="font-mono text-[7px] text-apple-ink dark:text-white whitespace-nowrap">const bridge = new Share();</span>
    <span className="font-mono text-[7px] text-apple-ink-muted whitespace-nowrap">bridge.connect('827441');</span>
    <span className="font-mono text-[7px] text-apple-ink-muted whitespace-nowrap">await bridge.transfer(thing);</span>
  </div>
);

const CopyChip = () => (
  <span className="flex items-center gap-1 px-2 py-1 rounded-[7px] bg-apple-ink dark:bg-white text-white dark:text-night-900">
    <Copy className="w-2.5 h-2.5" strokeWidth={2.4} />
    <span className="text-[7.5px] font-semibold">Copy</span>
  </span>
);

const CopiedChip = () => (
  <span className="flex items-center gap-1 px-1.5 py-1 rounded-[7px] bg-status-success/12 text-[#1d9c43] dark:text-[#34c759]">
    <Check className="w-2.5 h-2.5" strokeWidth={3} />
    <span className="text-[7.5px] font-semibold">Copied</span>
  </span>
);

/* ---------- Mini device surfaces — same chrome language as the hero ---------- */

function MiniLaptop({ children, label }: { children: React.ReactNode, label: string }) {
  return (
    <div className="w-[150px] sm:w-[200px] shrink-0 flex flex-col items-center">
      <LaptopFrame>
        <div className="w-full h-full flex flex-col items-center justify-center px-2.5">{children}</div>
      </LaptopFrame>
      <DeviceLabel className="mt-2 sm:mt-3">{label}</DeviceLabel>
    </div>
  );
}

function MiniPhone({ children, label }: { children: React.ReactNode, label: string }) {
  return (
    <div className="w-[62px] sm:w-[84px] shrink-0 flex flex-col items-center">
      <PhoneFrame>
        <div className="w-full h-full flex flex-col items-center justify-center px-1.5">{children}</div>
      </PhoneFrame>
      <DeviceLabel className="mt-2 sm:mt-2.5">{label}</DeviceLabel>
    </div>
  );
}

/* ---------- A device pair + the transfer between them ---------- */

function RenderContent({ content }: { content: ContentKey }) {
  if (content === 'photo') return <PhotoCard />;
  if (content === 'file') return <FileCard />;
  if (content === 'code') return <CodeCard className="max-w-full" />;
  return <UrlCard className="max-w-full" />;
}

function Transfer({ from, to, index }: { from: TransferSide, to: TransferSide, index: number }) {
  const delay = index * 0.05;

  const Device = ({ side, arrive }: { side: TransferSide, arrive: boolean }) => {
    const frame = side.device === 'laptop'
      ? <MiniLaptop label={side.label}><RenderContent content={side.content} /></MiniLaptop>
      : <MiniPhone label={side.label}><RenderContent content={side.content} /></MiniPhone>;
    return (
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: '-60px' }}
        transition={{ duration: 0.6, delay: delay + (arrive ? 0.2 : 0), ease: EASE }}
        className="flex flex-col items-center gap-1.5"
      >
        {frame}
        {side.copy && arrive && (
          <motion.span
            initial={{ opacity: 0, scale: 0.9 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true, margin: '-60px' }}
            transition={{ duration: 0.45, delay: delay + 0.35, ease: EASE }}
          >
            <CopyChip />
          </motion.span>
        )}
      </motion.div>
    );
  };

  return (
    <div className="flex items-center justify-center gap-3 sm:gap-5">
      <Device side={from} arrive={false} />

      {/* The bridge — a short line with the ShareText node */}
      <motion.div
        initial={{ opacity: 0 }}
        whileInView={{ opacity: 1 }}
        viewport={{ once: true, margin: '-60px' }}
        transition={{ duration: 0.6, delay: delay + 0.15, ease: EASE }}
        className="relative shrink-0 w-6 sm:w-9"
      >
        <div className="h-px w-full bg-apple-ink/15 dark:bg-white/15" />
        <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-5 h-5 sm:w-6 sm:h-6 rounded-full bg-white dark:bg-[#1c1c1e] border border-apple-divider dark:border-apple-tile-3 shadow-card flex items-center justify-center">
          <ShareTextLogo size={13} className="text-apple-blue" />
        </span>
      </motion.div>

      <Device side={to} arrive />
    </div>
  );
}

/* ---------- The four situations ---------- */

const SITUATIONS: { id: string; line: string; note: string; from: TransferSide; to: TransferSide }[] = [
  {
    id: '01',
    line: 'You need this on your phone.',
    note: 'No app. No account.',
    from: { device: 'laptop', label: 'Your laptop', content: 'url' },
    to: { device: 'phone', label: 'Your phone', content: 'url' },
  },
  {
    id: '02',
    line: 'It should be on your laptop — as the original.',
    note: 'Move it without sending it through a chat.',
    from: { device: 'phone', label: 'Your phone', content: 'photo' },
    to: { device: 'laptop', label: 'Your laptop', content: 'file' },
  },
  {
    id: '03',
    line: 'A long error log. Paste it here, copy it there.',
    note: 'Paste once. Copy anywhere.',
    from: { device: 'laptop', label: 'Your desktop', content: 'code' },
    to: { device: 'phone', label: 'Your phone', content: 'code', copy: true },
  },
  {
    id: '04',
    line: 'iPhone to Windows. Same content, no cables.',
    note: 'One browser. Different devices.',
    from: { device: 'phone', label: 'iPhone', content: 'url' },
    to: { device: 'laptop', label: 'Windows laptop', content: 'url' },
  },
];

export function Situations() {
  return (
    <section className="px-6 py-24 sm:py-32 bg-apple-parchment dark:bg-night-950">
      <div className="max-w-3xl mx-auto">
        {SITUATIONS.map((s, i) => (
          <div
            key={s.id}
            className={cn(
              'grid md:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] gap-10 md:gap-14 items-center py-12 sm:py-16 border-b border-apple-divider dark:border-white/[0.06]',
              i === 0 && 'pt-0',
              i % 2 === 1 && 'md:[&>*:first-child]:order-2'
            )}
          >
            {/* The caption */}
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-80px' }}
              transition={{ duration: 0.7, ease: EASE }}
            >
              <p className="font-mono text-[12px] text-apple-ink-muted dark:text-white/60 tabular-nums mb-3">{s.id}</p>
              <h3 className="text-[24px] sm:text-[28px] font-semibold text-apple-ink dark:text-white tracking-[-0.02em] leading-[1.12] max-w-[18ch]">
                {s.line}
              </h3>
              <p className="mt-3 text-[14px] sm:text-[15px] text-apple-ink-muted dark:text-white/55 font-medium">
                {s.note}
              </p>
            </motion.div>

            {/* The transfer — objects carry the story */}
            <Transfer from={s.from} to={s.to} index={i} />
          </div>
        ))}

        {/* What ShareText removes — a quiet closing line, not a table */}
        <motion.p
          initial={{ opacity: 0, y: 14 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-60px' }}
          transition={{ duration: 0.7, ease: EASE }}
          className="mt-14 text-center text-[15px] sm:text-[16px] text-apple-ink-muted dark:text-white/55 font-medium"
        >
          No app. No account. No permanent chat. No cloud folder. No setup.{' '}
          <span className="text-apple-ink dark:text-white font-semibold">Connect. Transfer. Done.</span>
        </motion.p>
      </div>
    </section>
  );
}
