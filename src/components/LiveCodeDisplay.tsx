import React, { useEffect, useState } from 'react';
import { generateTOTP, getTOTPRemainingSeconds, getTOTPProgress } from '../lib/totp';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils';

interface LiveCodeDisplayProps {
  secret: string;
  /** Room creation time — anchors the 40s window so the countdown starts
   *  fresh at 40 when the creator lands on this screen. */
  createdAt?: number;
}

export function LiveCodeDisplay({ secret, createdAt }: LiveCodeDisplayProps) {
  const [code, setCode] = useState(() => generateTOTP(secret, createdAt));
  const [progress, setProgress] = useState(() => getTOTPProgress(createdAt));
  const [remaining, setRemaining] = useState(() => getTOTPRemainingSeconds(createdAt));

  // Recompute immediately when the anchor changes (a code re-anchor from
  // refresh_code must show the fresh code at once — no stale 1s flash), then
  // tick once per second. React bails out when the code string is unchanged,
  // so this re-renders ~1×/s. The ring depletes smoothly between ticks via
  // the stroke-dashoffset CSS transition below.
  useEffect(() => {
    setCode(generateTOTP(secret, createdAt));
    setProgress(getTOTPProgress(createdAt));
    setRemaining(getTOTPRemainingSeconds(createdAt));
    const interval = setInterval(() => {
      setCode(generateTOTP(secret, createdAt));
      setProgress(getTOTPProgress(createdAt));
      setRemaining(getTOTPRemainingSeconds(createdAt));
    }, 1000);
    return () => clearInterval(interval);
  }, [secret, createdAt]);

  const digits = code.split('');
  const isUrgent = remaining <= 3;

  return (
    <div className="flex flex-col items-center justify-center p-10 bg-white dark:bg-apple-tile-1 border border-apple-divider dark:border-apple-tile-3 rounded-(--radius-xl) relative overflow-hidden shadow-card">
      <div className={cn("absolute top-6 right-6 flex items-center justify-center transition-transform", isUrgent && "scale-110")}>
        <svg width="44" height="44" viewBox="0 0 44 44" className="transform -rotate-90">
          <circle cx="22" cy="22" r="18" fill="transparent" stroke="currentColor" strokeWidth="3" className="text-apple-divider dark:text-apple-tile-3" />
          <circle
            cx="22" cy="22" r="18"
            fill="transparent"
            stroke="currentColor"
            strokeWidth="3"
            className={cn(isUrgent ? "text-status-danger" : "text-azure-500")}
            strokeDasharray={113.097}
            strokeDashoffset={113.097 - (progress * 113.097)}
            strokeLinecap="round"
            style={{
              // Depletes continuously between 1s ticks; color follows urgency.
              transitionProperty: 'stroke-dashoffset, color',
              transitionDuration: '1s, 300ms',
              transitionTimingFunction: 'linear, ease',
            }}
          />
        </svg>
        <span className={cn("absolute text-[12px] font-medium transition-colors duration-300", isUrgent ? "text-status-danger" : "text-apple-ink-muted")}>
          {Math.ceil(remaining)}
        </span>
      </div>

      <p className="text-[12px] font-medium text-apple-ink-muted mb-8 tracking-widest uppercase">Live Code</p>

      <div className="flex w-full max-w-[320px] sm:max-w-[400px] gap-1.5 sm:gap-2.5">
        {digits.map((digit, i) => (
          <React.Fragment key={i}>
            <div className="flex-1 aspect-[3/4] bg-apple-parchment dark:bg-black border border-apple-divider/50 dark:border-apple-tile-3 rounded-[12px] flex items-center justify-center overflow-hidden relative shadow-inner">
              <AnimatePresence mode="popLayout">
                <motion.span
                  key={digit + i}
                  initial={{ y: 24, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  exit={{ y: -24, opacity: 0 }}
                  transition={{ type: 'spring', bounce: 0, duration: 0.3 }}
                  className="text-[clamp(28px,7.5vw,56px)] font-semibold text-apple-ink dark:text-white absolute font-mono tnum tracking-tighter"
                >
                  {digit}
                </motion.span>
              </AnimatePresence>
            </div>
            {i === 2 && <div className="w-2 sm:w-4" />}
          </React.Fragment>
        ))}
      </div>
      
      <p
        aria-live="polite"
        className={cn(
          "text-[13px] mt-8 text-center font-medium transition-colors duration-300",
          isUrgent ? "text-status-danger dark:text-status-danger" : "text-apple-ink-muted dark:text-white/60"
        )}
      >
        {isUrgent ? `New code in ${Math.max(1, Math.ceil(remaining))}s` : `Code refreshes in ${Math.ceil(remaining)}s`}
      </p>
    </div>
  );
}
