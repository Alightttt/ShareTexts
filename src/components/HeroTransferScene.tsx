import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import { Check, FileText, Image as ImageIcon, ArrowUp } from 'lucide-react';

/**
 * HeroTransferScene — realistic devices running the real product.
 *
 * Not a concept illustration: a Windows laptop and an iPhone (the reference
 * composition — laptop standing behind, phone overlapping in front-right),
 * each showing the ACTUAL ShareText room screen. Messages visibly leave the
 * phone's composer, arc across the gap, and land in the laptop's message
 * list: a text bubble, then a photo, then a file — each settling with the
 * spring the real app uses on arrival.
 *
 * Reduced motion: everything renders in its final connected state, static.
 */

const EASE = [0.22, 1, 0.36, 1] as const;

type MsgKind = 'text' | 'photo' | 'file';

/* ------------------------------------------------------------------ */
/*  Message pieces — mirror the real MessageCard language              */
/* ------------------------------------------------------------------ */

function OutgoingTextBubble({ text }: { text: string }) {
  return (
    <div className="max-w-[120px] px-2.5 py-1.5 rounded-[12px] rounded-br-[4px] bg-ember text-white text-[8px] leading-[1.35] font-medium shadow-[0_1px_4px_rgba(240,100,19,0.3)]">
      {text}
    </div>
  );
}

function OutgoingPhotoCard() {
  return (
    <div className="relative w-[92px] h-[60px] rounded-[10px] overflow-hidden shadow-[0_2px_8px_rgba(0,0,0,0.25)]">
      {/* A real-looking photo: sky, sun, hills — built from gradients */}
      <div className="absolute inset-0 bg-gradient-to-b from-[#8ec5f2] via-[#c8e0f5] to-[#e8f2db]" />
      <div className="absolute top-2 right-3 w-4 h-4 rounded-full bg-[#fff3c4] shadow-[0_0_10px_rgba(255,220,120,0.9)]" />
      <div className="absolute -bottom-3 -left-4 w-[80px] h-[38px] rounded-[50%] bg-[#7fae6b]" />
      <div className="absolute -bottom-4 right-0 w-[70px] h-[32px] rounded-[50%] bg-[#5d8f4d]" />
    </div>
  );
}

function OutgoingFileCard() {
  return (
    <div className="flex items-center gap-1.5 px-2 py-1.5 rounded-[10px] bg-white dark:bg-[#2c2c33] shadow-[0_2px_8px_rgba(0,0,0,0.18)]">
      <span className="w-6 h-6 rounded-[6px] bg-ember/12 flex items-center justify-center shrink-0">
        <FileText className="w-3 h-3 text-ember" />
      </span>
      <span className="flex flex-col gap-[3px] min-w-0">
        <span className="text-[7.5px] font-semibold text-apple-ink dark:text-white/90 leading-none truncate">q3-report.pdf</span>
        <span className="text-[6.5px] text-apple-ink-muted dark:text-white/45 leading-none">2.4 MB</span>
      </span>
    </div>
  );
}

const PAYLOAD: Record<MsgKind, React.ReactNode> = {
  text: <OutgoingTextBubble text="Hey! Sending this over 🔥" />,
  photo: <OutgoingPhotoCard />,
  file: <OutgoingFileCard />,
};

const SEQ: MsgKind[] = ['text', 'photo', 'file'];
const CYCLE_MS = 2600;
const FLIGHT_S = 1.0;

/* ------------------------------------------------------------------ */
/*  iPhone — front-right, overlapping the laptop                       */
/* ------------------------------------------------------------------ */

function IPhone({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative w-[150px] h-[302px] rounded-[38px] bg-[#1c1c1e] shadow-[0_24px_60px_-12px_rgba(0,0,0,0.45),0_0_0_2px_rgba(255,255,255,0.08)_inset] p-[7px]">
      {/* Side buttons */}
      <div className="absolute -left-[2.5px] top-[76px] w-[2.5px] h-[26px] rounded-l bg-[#3a3a3c]" />
      <div className="absolute -left-[2.5px] top-[110px] w-[2.5px] h-[40px] rounded-l bg-[#3a3a3c]" />
      <div className="absolute -right-[2.5px] top-[96px] w-[2.5px] h-[52px] rounded-r bg-[#3a3a3c]" />
      {/* Screen */}
      <div className="relative w-full h-full rounded-[31px] overflow-hidden bg-[#f6f0e6] dark:bg-[#131315]">
        {/* Dynamic Island */}
        <div className="absolute top-[7px] left-1/2 -translate-x-1/2 w-[58px] h-[16px] rounded-full bg-black z-20" />
        {children}
        {/* Home indicator */}
        <div className="absolute bottom-[5px] left-1/2 -translate-x-1/2 w-[72px] h-[3.5px] rounded-full bg-apple-ink/25 dark:bg-white/25 z-20" />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Windows laptop — standing behind                                   */
/* ------------------------------------------------------------------ */

function WinLaptop({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative">
      <div className="w-[430px] rounded-[16px] bg-gradient-to-b from-[#2a2a2c] to-[#1d1d1f] p-[10px] pb-[12px] shadow-[0_30px_70px_-18px_rgba(0,0,0,0.5)]">
        {/* Webcam notch dot */}
        <div className="absolute top-[4px] left-1/2 -translate-x-1/2 w-[5px] h-[5px] rounded-full bg-[#0a0a0a]" />
        <div className="w-full h-[262px] rounded-[9px] overflow-hidden relative bg-[#f6f0e6] dark:bg-[#131315]">
          {/* Windows wallpaper wash behind the app window */}
          <div className="absolute inset-0 bg-gradient-to-br from-[#1e3a5f] via-[#2d5a8e] to-[#4a7ab5] opacity-[0.14]" />
          {children}
          {/* Windows taskbar */}
          <div className="absolute bottom-0 inset-x-0 h-[20px] bg-white/75 dark:bg-[#1a1a1e]/85 backdrop-blur-sm border-t border-black/[0.06] dark:border-white/[0.06] flex items-center justify-center gap-[7px] z-10">
            {['#0078d4', '#79ba7c', '#e6b800', '#d13438', '#8764b8'].map((c, i) => (
              <span key={i} className="w-[8px] h-[8px] rounded-[2px]" style={{ background: c, opacity: 0.75 }} />
            ))}
            <span className="w-[8px] h-[8px] rounded-[2px] bg-ember/80" />
            <span className="absolute right-2 text-[6px] text-apple-ink-muted dark:text-white/40 font-medium tnum">9:41</span>
          </div>
        </div>
      </div>
      {/* Laptop base — the aluminum deck */}
      <div className="relative mx-auto w-[486px] h-[13px] rounded-b-[14px] rounded-t-[3px] bg-gradient-to-b from-[#d7d7db] via-[#b9b9bf] to-[#8e8e96] shadow-[0_10px_24px_-8px_rgba(0,0,0,0.4)]">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[74px] h-[5px] rounded-b-[6px] bg-[#7c7c84]" />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  The ShareText room UI, as rendered on each device                  */
/* ------------------------------------------------------------------ */

function RoomChrome({ compact, topInset = 0, rightInset = 0, children }: { compact?: boolean; topInset?: number; rightInset?: number; children: React.ReactNode }) {
  return (
    <div className="absolute inset-0 flex flex-col" style={{ paddingTop: topInset, paddingRight: rightInset }}>
      {/* App top bar — the connected-room state */}
      <div className={`flex items-center gap-1.5 px-2.5 bg-white/70 dark:bg-white/[0.04] border-b border-black/[0.06] dark:border-white/[0.07] ${compact ? 'h-[26px]' : 'h-[30px]'}`}>
        <span className="w-[7px] h-[7px] rounded-full bg-status-success shrink-0" />
        <span className={`font-semibold text-apple-ink dark:text-white ${compact ? 'text-[7px]' : 'text-[8.5px]'}`}>ShareText</span>
        <span className={`ml-auto font-medium text-status-success ${compact ? 'text-[6px]' : 'text-[7px]'}`}>Connected</span>
      </div>
      {/* Message list */}
      <div className={`flex-1 overflow-hidden px-2.5 py-2 flex flex-col justify-end gap-1.5 ${compact ? 'pb-3' : 'pb-3'}`}>
        {children}
      </div>
      {/* Composer */}
      <div className={`mx-2 mb-2 flex items-center gap-1.5 bg-white dark:bg-[#212126] rounded-full px-2.5 border border-black/[0.07] dark:border-white/[0.08] ${compact ? 'h-[22px]' : 'h-[26px]'}`}>
        <span className={`text-apple-ink-muted/50 dark:text-white/30 ${compact ? 'text-[6.5px]' : 'text-[7.5px]'}`}>Message</span>
        <span className="ml-auto w-[14px] h-[14px] rounded-full bg-ember flex items-center justify-center shrink-0">
          <ArrowUp className="w-[8px] h-[8px] text-white" strokeWidth={3} />
        </span>
      </div>
    </div>
  );
}

/** Landed message on the laptop (incoming, left-aligned, receiving style). */
function LandedLaptop({ kind }: { kind: MsgKind }) {
  return (
    <div className="flex flex-col items-start gap-[3px]">
      <div className="flex items-center gap-1">
        <span className="w-[10px] h-[10px] rounded-full bg-gradient-to-br from-honey to-ember" />
        <span className="text-[6px] font-semibold text-apple-ink-muted dark:text-white/40">iPhone</span>
      </div>
      {kind === 'text' && (
        <div className="max-w-[170px] px-2.5 py-1.5 rounded-[12px] rounded-tl-[4px] bg-white dark:bg-[#26262b] shadow-[0_1px_5px_rgba(0,0,0,0.1)] text-[8px] leading-[1.35] font-medium text-apple-ink dark:text-white/90">
          Hey! Sending this over 🔥
        </div>
      )}
      {kind === 'photo' && (
        <div className="relative w-[130px] h-[84px] rounded-[10px] overflow-hidden shadow-[0_2px_8px_rgba(0,0,0,0.15)]">
          <div className="absolute inset-0 bg-gradient-to-b from-[#8ec5f2] via-[#c8e0f5] to-[#e8f2db]" />
          <div className="absolute top-2.5 right-4 w-5 h-5 rounded-full bg-[#fff3c4] shadow-[0_0_14px_rgba(255,220,120,0.9)]" />
          <div className="absolute -bottom-4 -left-6 w-[115px] h-[52px] rounded-[50%] bg-[#7fae6b]" />
          <div className="absolute -bottom-5 right-0 w-[100px] h-[44px] rounded-[50%] bg-[#5d8f4d]" />
        </div>
      )}
      {kind === 'file' && (
        <div className="flex items-center gap-2 px-2.5 py-2 rounded-[10px] bg-white dark:bg-[#26262b] shadow-[0_1px_5px_rgba(0,0,0,0.1)]">
          <span className="w-7 h-7 rounded-[7px] bg-ember/12 flex items-center justify-center shrink-0">
            <FileText className="w-3.5 h-3.5 text-ember" />
          </span>
          <span className="flex flex-col gap-[3px]">
            <span className="text-[8px] font-semibold text-apple-ink dark:text-white/90 leading-none">q3-report.pdf</span>
            <span className="text-[7px] text-apple-ink-muted dark:text-white/45 leading-none">2.4 MB</span>
          </span>
          <Check className="w-3 h-3 text-status-success ml-1" strokeWidth={3} />
        </div>
      )}
    </div>
  );
}

/** Outgoing mini-render of an already-sent message on the phone. */
function SentMini({ kind }: { kind: MsgKind }) {
  if (kind === 'text') return <OutgoingTextBubble text="Hey! Sending this over 🔥" />;
  if (kind === 'photo') return (
    <div className="relative w-[70px] h-[46px] rounded-[8px] overflow-hidden opacity-90">
      <div className="absolute inset-0 bg-gradient-to-b from-[#8ec5f2] via-[#c8e0f5] to-[#e8f2db]" />
      <div className="absolute top-1.5 right-2 w-3 h-3 rounded-full bg-[#fff3c4]" />
      <div className="absolute -bottom-2 -left-3 w-[60px] h-[26px] rounded-[50%] bg-[#7fae6b]" />
    </div>
  );
  return (
    <div className="flex items-center gap-1 px-1.5 py-1 rounded-[8px] bg-white dark:bg-[#2c2c33] shadow-sm opacity-90">
      <FileText className="w-2.5 h-2.5 text-ember" />
      <span className="text-[6.5px] font-semibold text-apple-ink dark:text-white/85">q3-report.pdf</span>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  The scene                                                          */
/* ------------------------------------------------------------------ */

export function HeroTransferScene({ className }: { className?: string }) {
  const reduce = useReducedMotion();
  // Which messages have landed on the laptop (in order), which is flying.
  const [landed, setLanded] = useState<MsgKind[]>(reduce ? SEQ : []);
  const [flying, setFlying] = useState<MsgKind | null>(reduce ? null : 'text');

  useEffect(() => {
    if (reduce) return;
    let idx = 0;
    let alive = true;
    const step = () => {
      if (!alive) return;
      const kind = SEQ[idx % SEQ.length];
      setFlying(kind);
      window.setTimeout(() => {
        if (!alive) return;
        setFlying(null);
        setLanded(prev => {
          const next = [...prev, kind];
          return next.length >= SEQ.length ? SEQ : next;
        });
      }, FLIGHT_S * 1000);
      idx++;
    };
    step();
    const timer = window.setInterval(step, CYCLE_MS);
    return () => { alive = false; window.clearInterval(timer); };
  }, [reduce]);

  const phoneNow = flying ?? (landed.length ? landed[landed.length - 1] : 'text');

  return (
    <div className={className} aria-hidden>
      <div className="relative flex items-center justify-center select-none pointer-events-none">
        {/* Laptop — standing behind, shifted left. The phone overlaps its
            right edge, so the laptop's own UI insets from the right to
            stay readable (depth without clipped text). */}
        <div className="relative z-0 -mr-16 sm:-mr-20">
          <WinLaptop>
            <RoomChrome rightInset={72}>
              <AnimatePresence>
                {landed.map(k => (
                  <motion.div
                    key={k}
                    initial={reduce ? false : { opacity: 0, y: -10, scale: 0.94 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0 }}
                    transition={reduce ? { duration: 0 } : { type: 'spring', stiffness: 380, damping: 22 }}
                  >
                    <LandedLaptop kind={k} />
                  </motion.div>
                ))}
              </AnimatePresence>
            </RoomChrome>
            {/* Flight: payloads arc from the phone across the laptop screen */}
            <AnimatePresence>
              {flying && !reduce && (
                <motion.div
                  key={flying}
                  className="absolute z-30"
                  style={{ right: '-14px', bottom: '40px' }}
                  initial={{ x: 10, y: 40, scale: 0.5, opacity: 0 }}
                  animate={{ x: -170, y: -150, scale: 1.04, opacity: [0, 1, 1, 0.9] }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  transition={{ duration: FLIGHT_S, ease: EASE }}
                >
                  {PAYLOAD[flying]}
                </motion.div>
              )}
            </AnimatePresence>
          </WinLaptop>
        </div>

        {/* iPhone — in front, overlapping the laptop's right edge */}
        <div className="relative z-10">
          <IPhone>
            {/* Clear the Dynamic Island: the room UI starts below it */}
            <div className="absolute inset-x-0 top-[18px] bottom-0">
              <RoomChrome compact topInset={0}>
                {/* Outgoing stack — what this phone has sent, bottom-aligned */}
                <div className="flex flex-col items-end gap-1.5">
                  <AnimatePresence>
                    {landed.map(k => (
                      <motion.div
                        key={k}
                        initial={reduce ? false : { opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 0.85, scale: 1 }}
                        exit={{ opacity: 0 }}
                        transition={reduce ? { duration: 0 } : { type: 'spring', stiffness: 380, damping: 22 }}
                      >
                        <SentMini kind={k} />
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </div>
              </RoomChrome>
            </div>
            {/* The message lifts off the composer */}
            <AnimatePresence>
              {flying && !reduce && (
                <motion.div
                  key={flying}
                  className="absolute z-30 right-[7px]"
                  style={{ bottom: '34px' }}
                  initial={{ x: 0, y: 0, scale: 0.9, opacity: 0 }}
                  animate={{ x: 26, y: -34, scale: 1, opacity: [0, 1, 1] }}
                  exit={{ opacity: 0, scale: 0.85 }}
                  transition={{ duration: FLIGHT_S * 0.55, ease: EASE }}
                >
                  {PAYLOAD[flying]}
                </motion.div>
              )}
            </AnimatePresence>
            {/* Sent tick under the composer — quiet, like the real app */}
            <AnimatePresence>
              {!flying && landed.length > 0 && !reduce && (
                <motion.span
                  key="tick"
                  initial={{ opacity: 0, scale: 0.5 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ type: 'spring', stiffness: 420, damping: 20 }}
                  className="absolute right-[16px] bottom-[27px] w-[13px] h-[13px] rounded-full bg-status-success flex items-center justify-center z-20"
                >
                  <Check className="w-[8px] h-[8px] text-white" strokeWidth={3.5} />
                </motion.span>
              )}
            </AnimatePresence>
          </IPhone>
        </div>
      </div>
    </div>
  );
}
