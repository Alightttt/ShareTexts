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
    <div className="flex flex-col items-center px-5 py-6 sm:px-10 sm:py-10 bg-white dark:bg-apple-tile-1 border border-apple-divider dark:border-apple-tile-3 rounded-[14px] sm:rounded-[20px] shadow-card w-full">
      {/* Countdown + status */}
      <div className="flex items-center gap-2 sm:gap-3 mb-4 sm:mb-5">
        <div className={cn("relative flex items-center justify-center transition-transform", isUrgent && "scale-105")}>
          <svg width="32" height="32" viewBox="0 0 44 44" className="transform -rotate-90 sm:w-10 sm:h-10">
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
          <span className={cn("absolute text-[10px] sm:text-[11px] font-semibold tabular-nums transition-colors duration-300", isCritical ? "text-status-danger" : isUrgent ? "text-status-warning dark:text-status-warning-ink-dark" : "text-apple-ink-muted dark:text-white/60")}>
            {Math.ceil(remaining)}
          </span>
        </div>
        <p
          aria-live="polite"
          className={cn(
            "text-[12px] sm:text-[13px] font-medium transition-colors duration-300",
            isCritical ? "text-status-danger" : isUrgent ? "text-status-warning dark:text-status-warning-ink-dark" : "text-apple-ink-muted dark:text-white/55"
          )}
        >
          {statusText}
        </p>
      </div>

      {/* Pairing code — 6 digits, responsive */}
      <div className="flex justify-center gap-2 sm:gap-3 w-full" role="group" aria-label="Pairing code">
        {/* First group: 3 digits */}
        <div className="flex gap-2 sm:gap-3 flex-1 justify-end">
          {digits.slice(0, 3).map((digit, i) => (
            <div key={i} className={cn(
              "relative flex items-center justify-center rounded-[10px] sm:rounded-[14px] shadow-sm flex-1 max-w-[72px] aspect-[3/4] sm:w-[72px] sm:h-[100px] sm:max-w-none sm:aspect-auto lg:w-[84px] lg:h-[116px]",
              "bg-apple-parchment dark:bg-[#1a1a1e] border border-apple-divider/60 dark:border-[#2a2a2e]"
            )}>
              <AnimatePresence mode="popLayout">
                <motion.span
                  key={digit + i}
                  initial={{ y: 12, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  exit={{ y: -12, opacity: 0 }}
                  transition={{ type: 'spring', bounce: 0, duration: 0.2 }}
                  className="text-[42px] sm:text-[56px] lg:text-[64px] font-bold text-apple-ink dark:text-[#f0f2f5] absolute font-mono tnum tracking-tighter"
                >
                  {digit}
                </motion.span>
              </AnimatePresence>
            </div>
          ))}
        </div>
        {/* Spacer */}
        <div className="flex items-center shrink-0">
          <div className="w-1.5 sm:w-2.5 h-[2px] rounded-full bg-apple-ink/15 dark:bg-white/15" />
        </div>
        {/* Second group: 3 digits */}
        <div className="flex gap-2 sm:gap-3 flex-1 justify-start">
          {digits.slice(3, 6).map((digit, i) => (
            <div key={i + 3} className={cn(
              "relative flex items-center justify-center rounded-[10px] sm:rounded-[14px] shadow-sm flex-1 max-w-[72px] aspect-[3/4] sm:w-[72px] sm:h-[100px] sm:max-w-none sm:aspect-auto lg:w-[84px] lg:h-[116px]",
              "bg-apple-parchment dark:bg-[#1a1a1e] border border-apple-divider/60 dark:border-[#2a2a2e]"
            )}>
              <AnimatePresence mode="popLayout">
                <motion.span
                  key={digit + (i + 3)}
                  initial={{ y: 12, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  exit={{ y: -12, opacity: 0 }}
                  transition={{ type: 'spring', bounce: 0, duration: 0.2 }}
                  className="text-[42px] sm:text-[56px] lg:text-[64px] font-bold text-apple-ink dark:text-[#f0f2f5] absolute font-mono tnum tracking-tighter"
                >
                  {digit}
                </motion.span>
              </AnimatePresence>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
