import React, { useEffect, useRef, useState } from 'react';
import { motion, useMotionValueEvent, useReducedMotion, useScroll, useTransform } from 'motion/react';
import type { MotionValue } from 'motion/react';
import { Check, Copy } from 'lucide-react';
import { ShareTextLogo } from './ShareTextLogo';
import { cn } from '../lib/utils';

/**
 * The landing's scroll story: one continuous demonstration of the product.
 * A laptop and a phone are pinned to the viewport while the user scrolls;
 * each beat of the scroll moves the story forward — source, second device,
 * pairing, transfer, done. The transferred object physically travels along
 * the connection line between the two devices.
 *
 * Reduced motion renders the same story as a static sequence.
 */

const BEATS: { title: string; body: string }[] = [
  { title: 'I have something here.', body: 'A link, a note, a file — already on this screen.' },
  { title: 'I need it there.', body: 'The other device joins the same room.' },
  { title: 'Connect.', body: 'Six digits on both devices. That\u2019s the pairing.' },
  { title: 'Send.', body: 'It travels device to device, encrypted.' },
  { title: 'Done.', body: 'It\u2019s there. Copy it, open it, move on.' },
];

const URL_TEXT = 'example.com/a/very-long-link';

/** The transferred object — a monospace link, identical on both surfaces. */
function UrlCard({ className }: { className?: string }) {
  return (
    <div className={cn(
      'bg-white dark:bg-[#1c1c1e] border border-apple-divider dark:border-apple-tile-3 rounded-[10px] shadow-card px-2.5 py-1.5 flex items-center gap-1.5',
      className
    )}>
      <span className="w-1.5 h-1.5 rounded-full bg-status-success shrink-0" />
      <span className="font-mono text-[8.5px] sm:text-[9.5px] text-apple-ink dark:text-white truncate">{URL_TEXT}</span>
    </div>
  );
}

function DeviceHeader() {
  return (
    <div className="shrink-0 flex items-center justify-between px-2.5 pt-2 pb-1.5 border-b border-apple-ink/[0.06] dark:border-white/[0.08]">
      <div className="flex items-center gap-1">
        <ShareTextLogo size={12} className="text-apple-ink dark:text-white" />
        <span className="text-[8px] font-semibold tracking-tight text-apple-ink dark:text-white">ShareText</span>
      </div>
      <div className="flex items-center gap-1">
        <span className="w-1 h-1 rounded-full bg-status-success" />
        <span className="text-[6.5px] font-medium text-apple-ink-muted">Connected</span>
      </div>
    </div>
  );
}

function LaptopScreen({ children }: { children: React.ReactNode }) {
  return (
    <div className="w-[184px] sm:w-[300px] shrink-0">
      <div className="rounded-[12px] sm:rounded-[14px] bg-[#1d1d1f] p-[6px] sm:p-[9px] shadow-device border border-white/10 relative">
        <div className="w-full aspect-[16/10] rounded-[7px] sm:rounded-[9px] bg-apple-canvas dark:bg-black overflow-hidden relative flex flex-col">
          {children}
        </div>
        {/* Laptop base */}
        <div className="h-[7px] sm:h-[10px] -mb-[10px] sm:-mb-[13px] mx-[-8px] sm:mx-[-12px] mt-[4px] sm:mt-[5px] rounded-b-[10px] sm:rounded-b-[14px] bg-gradient-to-b from-[#3a3a3d] to-[#2a2a2c]" />
      </div>
      <p className="mt-3 sm:mt-4 text-center text-[9px] sm:text-[11px] font-medium text-apple-ink-muted">Your laptop</p>
    </div>
  );
}

function PhoneScreen({ children }: { children: React.ReactNode }) {
  return (
    <div className="w-[88px] sm:w-[130px] shrink-0">
      <div className="rounded-[22px] sm:rounded-[28px] bg-[#161617] p-[6px] sm:p-[8px] shadow-device border border-white/10 relative">
        {/* Dynamic island */}
        <div className="absolute top-[10px] sm:top-[14px] left-1/2 -translate-x-1/2 w-[34px] sm:w-[46px] h-[9px] sm:h-[12px] bg-black rounded-full z-10" />
        <div className="w-full aspect-[9/18.5] rounded-[16px] sm:rounded-[22px] bg-apple-canvas dark:bg-black overflow-hidden relative flex flex-col">
          {children}
        </div>
      </div>
      <p className="mt-2 sm:mt-2.5 text-center text-[9px] sm:text-[11px] font-medium text-apple-ink-muted">Your phone</p>
    </div>
  );
}

function useIsMobile() {
  const [mobile, setMobile] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)');
    const update = () => setMobile(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);
  return mobile;
}

export function ScrollStory() {
  const reduced = useReducedMotion();
  if (reduced) return <StaticStory />;
  return <ScrubStory />;
}

/* ---------- Scroll-scrubbed version ---------- */

const BeatCaption: React.FC<{ progress: MotionValue<number>; i: number; title: string; body: string }> = ({ progress, i, title, body }) => {
  const from = i * 0.2;
  const to = (i + 1) * 0.2;
  const opacity = useTransform(progress, [from, from + 0.05, to - 0.05, to], [0, 1, 1, 0]);
  const y = useTransform(progress, [from, from + 0.06], [16, 0]);
  return (
    <motion.div style={{ opacity, y }} className="absolute inset-0 flex flex-col justify-center">
      <h3 className="text-[24px] sm:text-[30px] font-semibold text-apple-ink dark:text-white tracking-[-0.02em] leading-[1.1]">{title}</h3>
      <p className="mt-3 text-[14px] sm:text-[16px] text-apple-ink-muted dark:text-white/55 font-medium leading-relaxed max-w-[300px]">{body}</p>
    </motion.div>
  );
};

const StepCounter: React.FC<{ progress: MotionValue<number> }> = ({ progress }) => {
  const [label, setLabel] = useState('01');
  useMotionValueEvent(progress, 'change', (v: number) => {
    const next = String(Math.min(5, Math.max(1, Math.floor(v * 5) + 1))).padStart(2, '0');
    setLabel((prev) => (prev === next ? prev : next));
  });
  return <span className="font-mono text-[12px] text-apple-ink-muted dark:text-white/60 tabular-nums">{label} / 05</span>;
};

const BeatDot: React.FC<{ progress: MotionValue<number>; i: number }> = ({ progress, i }) => {
  const from = i * 0.2;
  const to = (i + 1) * 0.2;
  const opacity = useTransform(progress, [from, from + 0.1, to - 0.1, to], [0.25, 1, 1, 0.25]);
  const scale = useTransform(progress, [from, from + 0.1], [1, 1.4]);
  return <motion.span style={{ opacity, scale }} className="w-1.5 h-1.5 rounded-full bg-apple-ink dark:bg-white" />;
};

function ScrubStory() {
  const wrapRef = useRef<HTMLDivElement>(null);
  const beamRef = useRef<HTMLDivElement>(null);
  const isMobile = useIsMobile();

  const { scrollYProgress } = useScroll({ target: wrapRef, offset: ['start start', 'end end'] });

  // Distance the object travels along the beam, measured once per breakpoint.
  const [gap, setGap] = useState(0);
  useEffect(() => {
    const measure = () => {
      const b = beamRef.current;
      if (!b) return;
      const r = b.getBoundingClientRect();
      setGap(isMobile ? r.height : r.width);
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [isMobile]);

  const travelP = useTransform(scrollYProgress, [0.55, 0.85], [0, 1]);
  const flyerX = useTransform(travelP, (v) => (isMobile ? 0 : v * gap));
  const flyerY = useTransform(travelP, (v) => (isMobile ? v * gap : 0));
  const flyerOpacity = useTransform(travelP, [0, 0.05, 0.92, 1], [0, 1, 1, 0]);

  const phoneOpacity = useTransform(scrollYProgress, [0.15, 0.3], [0, 1]);
  const phoneY = useTransform(scrollYProgress, [0.15, 0.3], [22, 0]);
  const codeOpacity = useTransform(scrollYProgress, [0.32, 0.44], [0, 1]);
  const codeScale = useTransform(scrollYProgress, [0.32, 0.44], [0.9, 1]);
  const srcOpacity = useTransform(scrollYProgress, [0.5, 0.6], [1, 0]);
  const landedOpacity = useTransform(scrollYProgress, [0.82, 0.93], [0, 1]);
  const landedScale = useTransform(scrollYProgress, [0.82, 0.93], [0.96, 1]);

  return (
    <section ref={wrapRef} className="relative bg-apple-parchment dark:bg-night-950" style={{ height: '420vh' }}>
      <div className="sticky top-14 h-[calc(100dvh-3.5rem)] flex items-center overflow-hidden">
        <div className="max-w-6xl mx-auto w-full px-6 grid md:grid-cols-[minmax(0,1fr)_1.35fr] gap-8 md:gap-14 items-center">
          {/* Story captions */}
          <div className="flex flex-col gap-5 md:gap-8 min-h-0">
            <div className="relative min-h-[132px] md:min-h-[180px]">
              {BEATS.map((beat, i) => (
                <BeatCaption key={beat.title} progress={scrollYProgress} i={i} title={beat.title} body={beat.body} />
              ))}
            </div>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                {BEATS.map((_, i) => <BeatDot key={i} progress={scrollYProgress} i={i} />)}
              </div>
              <StepCounter progress={scrollYProgress} />
            </div>
          </div>

          {/* Devices + the transfer */}
          <div className="relative flex flex-col md:flex-row items-center justify-center md:justify-between gap-6 md:gap-0 md:px-4">
            <LaptopScreen>
              <DeviceHeader />
              <div className="flex-1 flex items-center justify-center px-3">
                <motion.div style={{ opacity: srcOpacity }}>
                  <UrlCard />
                </motion.div>
              </div>
            </LaptopScreen>

            {/* Connection line — the transfer happens along it */}
            <div ref={beamRef} className={cn(
              'relative shrink-0 flex-none',
              'w-px h-14 md:w-auto md:h-px md:flex-1'
            )}>
              <div className="absolute inset-0 bg-apple-ink/10 dark:bg-white/10" />
              {/* Pairing pill */}
              <motion.div
                style={{ opacity: codeOpacity, scale: codeScale }}
                className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-apple-ink dark:bg-white text-white dark:text-night-900 rounded-[8px] px-2.5 py-1 font-mono text-[10px] sm:text-[11px] tracking-[0.22em] shadow-card whitespace-nowrap z-10"
              >
                827 441
              </motion.div>
              {/* The traveling object */}
              <motion.div style={{ x: flyerX, y: flyerY, opacity: flyerOpacity }} className="absolute left-0 top-0 z-20 pointer-events-none">
                <UrlCard className={cn(isMobile ? '-translate-x-1/2' : '-translate-y-1/2')} />
              </motion.div>
            </div>

            <motion.div style={{ opacity: phoneOpacity, y: phoneY }}>
              <PhoneScreen>
                <DeviceHeader />
                <div className="flex-1 flex items-center justify-center px-2.5">
                  {/* Landed state */}
                  <motion.div style={{ opacity: landedOpacity, scale: landedScale }} className="flex flex-col items-center gap-2">
                    <UrlCard />
                    <div className="flex items-center gap-1.5">
                      <span className="flex items-center gap-1 px-2 py-1 rounded-[7px] bg-apple-ink dark:bg-white text-white dark:text-night-900">
                        <Copy className="w-2.5 h-2.5" strokeWidth={2.4} />
                        <span className="text-[7.5px] sm:text-[8px] font-semibold">Copy</span>
                      </span>
                      <span className="flex items-center gap-1 px-1.5 py-1 rounded-[7px] bg-status-success/12 text-[#1d9c43] dark:text-[#34c759]">
                        <Check className="w-2.5 h-2.5" strokeWidth={3} />
                        <span className="text-[7.5px] sm:text-[8px] font-semibold">Copied</span>
                      </span>
                    </div>
                  </motion.div>
                </div>
              </PhoneScreen>
            </motion.div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ---------- Reduced-motion version: the same story, told statically ---------- */

function StaticStory() {
  return (
    <section className="px-6 py-24 sm:py-32 bg-apple-parchment dark:bg-night-950">
      <div className="max-w-3xl mx-auto">
        <ol className="space-y-10">
          {BEATS.map((beat, i) => (
            <li key={beat.title} className="flex gap-5">
              <span className="font-mono text-[13px] text-azure-600 dark:text-azure-400 pt-1 tabular-nums">{String(i + 1).padStart(2, '0')}</span>
              <div>
                <h3 className="text-[22px] sm:text-[26px] font-semibold text-apple-ink dark:text-white tracking-[-0.02em]">{beat.title}</h3>
                <p className="mt-1.5 text-[15px] text-apple-ink-muted dark:text-white/55 font-medium">{beat.body}</p>
              </div>
            </li>
          ))}
        </ol>

        <div className="mt-16 flex items-center justify-center gap-6 sm:gap-10">
          <LaptopScreen>
            <DeviceHeader />
            <div className="flex-1 flex items-center justify-center px-3">
              <UrlCard />
            </div>
          </LaptopScreen>
          <div className="h-px w-10 sm:w-24 bg-apple-ink/15 dark:bg-white/15 relative shrink-0">
            <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full bg-azure-500" />
          </div>
          <PhoneScreen>
            <DeviceHeader />
            <div className="flex-1 flex items-center justify-center px-2.5">
              <div className="flex flex-col items-center gap-2">
                <UrlCard />
                <span className="flex items-center gap-1 px-1.5 py-1 rounded-[7px] bg-status-success/12 text-[#1d9c43] dark:text-[#34c759]">
                  <Check className="w-2.5 h-2.5" strokeWidth={3} />
                  <span className="text-[8px] font-semibold">Copied</span>
                </span>
              </div>
            </div>
          </PhoneScreen>
        </div>
      </div>
    </section>
  );
}
