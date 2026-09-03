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

  const digitTileClass = cn(
    "relative flex items-center justify-center rounded-[10px] sm:rounded-[14px] shadow-sm overflow-hidden",
    "flex-1 min-w-0",
    "h-[52px] sm:h-[64px] lg:h-[72px]",
    "bg-apple-parchment dark:bg-[#221a3c] border border-apple-divider/60 dark:border-[#362b58]"
  );

  return (
    <div className="flex flex-col items-center w-full bg-white dark:bg-apple-tile-1 border border-apple-divider dark:border-apple-tile-3 rounded-[14px] sm:rounded-[20px] shadow-card overflow-hidden">
      {/* Countdown + status */}
      <div className="flex items-center gap-2 sm:gap-3 py-4 sm:py-5">
        <div className={cn("relative flex items-center justify-center transition-transform", isUrgent && "scale-105")}>
          <svg width="28" height="28" viewBox="0 0 44 44" className="transform -rotate-90 sm:w-8 sm:h-8">
            <circle cx="22" cy="22" r="18" fill="transparent" stroke="currentColor" strokeWidth="2.5" className="text-apple-divider dark:text-apple-tile-3" />
            <circle
              cx="22" cy="22" r="18"
              fill="transparent"
              stroke="currentColor"
              strokeWidth="2.5"
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
          <span className={cn("absolute text-[9px] sm:text-[10px] font-semibold tabular-nums transition-colors duration-300", isCritical ? "text-status-danger" : isUrgent ? "text-status-warning" : "text-apple-ink-muted dark:text-white/60")}>
            {Math.ceil(remaining)}
          </span>
        </div>
        <p
          aria-live="polite"
          className={cn(
            "text-[11px] sm:text-[12px] font-medium transition-colors duration-300",
            isCritical ? "text-status-danger" : isUrgent ? "text-status-warning dark:text-status-warning-ink-dark" : "text-apple-ink-muted dark:text-white/55"
          )}
        >
          {statusText}
        </p>
      </div>

      {/* Pairing code — 6 digits, mathematically constrained to never overflow */}
      <div className="flex justify-center items-center gap-1.5 sm:gap-2 px-3 sm:px-5 pb-4 sm:pb-6 w-full" role="group" aria-label="Pairing code">
        {digits.slice(0, 3).map((digit, i) => (
          <div key={'a' + i} className={digitTileClass}>
            <AnimatePresence mode="popLayout">
              <motion.span
                key={digit + i}
                initial={{ y: 8, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: -8, opacity: 0 }}
                transition={{ type: 'spring', bounce: 0, duration: 0.2 }}
                className="font-bold text-apple-ink dark:text-[#f0f2f5] absolute font-mono tnum leading-none select-none"
                style={{ fontSize: 'clamp(22px, 7vw, 40px)' }}
              >
                {digit}
              </motion.span>
            </AnimatePresence>
          </div>
        ))}
        <div className="flex items-center shrink-0 mx-0.5 sm:mx-1">
          <div className="w-1.5 sm:w-2 h-[2px] rounded-full bg-apple-ink/15 dark:bg-white/15" />
        </div>
        {digits.slice(3, 6).map((digit, i) => (
          <div key={'b' + i} className={digitTileClass}>
            <AnimatePresence mode="popLayout">
              <motion.span
                key={digit + (i + 3)}
                initial={{ y: 8, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: -8, opacity: 0 }}
                transition={{ type: 'spring', bounce: 0, duration: 0.2 }}
                className="font-bold text-apple-ink dark:text-[#f0f2f5] absolute font-mono tnum leading-none select-none"
                style={{ fontSize: 'clamp(24px, 8vw, 42px)' }}
              >
                {digit}
              </motion.span>
            </AnimatePresence>
          </div>
        ))}
      </div>
    </div>
  );
}
