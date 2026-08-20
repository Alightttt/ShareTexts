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
    <div className="flex flex-col items-center px-5 py-6 sm:px-8 sm:py-8 bg-white dark:bg-apple-tile-1 border border-apple-divider dark:border-apple-tile-3 rounded-[20px] sm:rounded-[24px] shadow-card">
      {/* Countdown ring + status — ABOVE the code, not overlapping it */}
      <div className="flex items-center gap-3 mb-5">
        <div className={cn("relative flex items-center justify-center transition-transform", isUrgent && "scale-110")}>
          <svg width="40" height="40" viewBox="0 0 44 44" className="transform -rotate-90">
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
          <span className={cn("absolute text-[11px] font-semibold tabular-nums transition-colors duration-300", isCritical ? "text-status-danger" : isUrgent ? "text-status-warning dark:text-status-warning-ink-dark" : "text-apple-ink-muted dark:text-white/60")}>
            {Math.ceil(remaining)}
          </span>
        </div>
        <p
          aria-live="polite"
          className={cn(
            "text-[13px] font-medium transition-colors duration-300",
            isCritical ? "text-status-danger" : isUrgent ? "text-status-warning dark:text-status-warning-ink-dark" : "text-apple-ink-muted dark:text-white/60"
          )}
        >
          {statusText}
        </p>
      </div>

      {/* Pairing code — 6 large digits, high contrast, robust layout */}
      <div className="flex justify-center gap-2 sm:gap-3" role="group" aria-label="Pairing code">
        {/* First group: 3 digits */}
        <div className="flex gap-2 sm:gap-3">
          {digits.slice(0, 3).map((digit, i) => (
            <div key={i} className={cn(
              "relative flex items-center justify-center rounded-[14px] sm:rounded-[18px] shadow-sm w-[48px] h-[68px] sm:w-[64px] sm:h-[88px] lg:w-[72px] lg:h-[100px]",
              "bg-apple-parchment dark:bg-[#1a1a1e] border-2",
              "border-apple-divider/80 dark:border-[#3a3a3e]"
            )}>
              <AnimatePresence mode="popLayout">
                <motion.span
                  key={digit + i}
                  initial={{ y: 14, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  exit={{ y: -14, opacity: 0 }}
                  transition={{ type: 'spring', bounce: 0, duration: 0.22 }}
                  className="text-[32px] sm:text-[44px] lg:text-[50px] font-bold text-apple-ink dark:text-[#f0f2f5] absolute font-mono tnum tracking-tighter"
                >
                  {digit}
                </motion.span>
              </AnimatePresence>
            </div>
          ))}
        </div>
        {/* Spacer between groups */}
        <div className="flex items-center">
          <div className="w-2 sm:w-3 h-1 rounded-full bg-apple-ink/20 dark:bg-white/20" />
        </div>
        {/* Second group: 3 digits */}
        <div className="flex gap-2 sm:gap-3">
          {digits.slice(3, 6).map((digit, i) => (
            <div key={i + 3} className={cn(
              "relative flex items-center justify-center rounded-[14px] sm:rounded-[18px] shadow-sm w-[48px] h-[68px] sm:w-[64px] sm:h-[88px] lg:w-[72px] lg:h-[100px]",
              "bg-apple-parchment dark:bg-[#1a1a1e] border-2",
              "border-apple-divider/80 dark:border-[#3a3a3e]"
            )}>
              <AnimatePresence mode="popLayout">
                <motion.span
                  key={digit + (i + 3)}
                  initial={{ y: 14, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  exit={{ y: -14, opacity: 0 }}
                  transition={{ type: 'spring', bounce: 0, duration: 0.22 }}
                  className="text-[32px] sm:text-[44px] lg:text-[50px] font-bold text-apple-ink dark:text-[#f0f2f5] absolute font-mono tnum tracking-tighter"
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
