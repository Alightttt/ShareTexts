import React, { useEffect, useState } from 'react';
import { generateTOTP, getTOTPRemainingSeconds, getTOTPProgress } from '../lib/totp';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils';

interface LiveCodeDisplayProps {
  secret: string;
  createdAt?: number;
}

export function LiveCodeDisplay({ secret, createdAt }: LiveCodeDisplayProps) {
  const [code, setCode] = useState(() => generateTOTP(secret, createdAt));
  const [progress, setProgress] = useState(() => getTOTPProgress(createdAt));
  const [remaining, setRemaining] = useState(() => getTOTPRemainingSeconds(createdAt));

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
  const isUrgent = remaining <= 5;
  const isCritical = remaining <= 2;

  const statusText = isCritical
    ? 'Refreshing…'
    : isUrgent
      ? `Refreshes in ${Math.ceil(remaining)}s`
      : `Code active · ${Math.ceil(remaining)}s`;

  return (
    <div className="flex flex-col items-center justify-center px-6 py-8 sm:p-10 bg-white dark:bg-apple-tile-1 border border-apple-divider dark:border-apple-tile-3 rounded-[20px] sm:rounded-[28px] relative overflow-hidden shadow-card">
      {/* Countdown ring — top right */}
      <div className={cn("absolute top-5 right-5 sm:top-6 sm:right-6 flex items-center justify-center transition-transform", isUrgent && "scale-110")}>
        <svg width="44" height="44" viewBox="0 0 44 44" className="transform -rotate-90">
          <circle cx="22" cy="22" r="18" fill="transparent" stroke="currentColor" strokeWidth="3" className="text-apple-divider dark:text-apple-tile-3" />
          <circle
            cx="22" cy="22" r="18"
            fill="transparent"
            stroke="currentColor"
            strokeWidth="3"
            className={cn(isCritical ? "text-status-danger" : isUrgent ? "text-status-warning" : "text-azure-500")}
            strokeDasharray={113.097}
            strokeDashoffset={113.097 - (progress * 113.097)}
            strokeLinecap="round"
            style={{
              transitionProperty: 'stroke-dashoffset, color',
              transitionDuration: '1s, 300ms',
              transitionTimingFunction: 'linear, ease',
            }}
          />
        </svg>
        <span className={cn("absolute text-[12px] font-medium transition-colors duration-300", isCritical ? "text-status-danger" : isUrgent ? "text-status-warning dark:text-status-warning-ink-dark" : "text-apple-ink-muted dark:text-white/60")}>
          {Math.ceil(remaining)}
        </span>
      </div>

      {/* Pairing code — the hero element. 6 large digits with gap. */}
      <div className="flex w-full max-w-[300px] sm:max-w-[400px] gap-2 sm:gap-2.5" role="group" aria-label="Pairing code">
        {digits.map((digit, i) => (
          <React.Fragment key={i}>
            <div className="flex-1 aspect-[3/4] bg-apple-parchment dark:bg-black border border-apple-divider/50 dark:border-apple-tile-3 rounded-[12px] sm:rounded-[16px] flex items-center justify-center overflow-hidden relative shadow-inner">
              <AnimatePresence mode="popLayout">
                <motion.span
                  key={digit + i}
                  initial={{ y: 28, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  exit={{ y: -28, opacity: 0 }}
                  transition={{ type: 'spring', bounce: 0, duration: 0.3 }}
                  className="text-[clamp(32px,9vw,56px)] font-semibold text-apple-ink dark:text-white absolute font-mono tnum tracking-tighter"
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
          "text-[13px] mt-6 text-center font-medium transition-colors duration-300",
          isCritical ? "text-status-danger" : isUrgent ? "text-status-warning dark:text-status-warning-ink-dark" : "text-apple-ink-muted dark:text-white/60"
        )}
      >
        {statusText}
      </p>
    </div>
  );
}
