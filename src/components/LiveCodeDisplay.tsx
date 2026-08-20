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

      {/* Pairing code — 6 large digits, properly sized and high contrast */}
      <div className="flex w-full gap-2 sm:gap-3" role="group" aria-label="Pairing code">
        {digits.map((digit, i) => (
          <React.Fragment key={i}>
            <div className={cn(
              "flex-1 aspect-[3/4] flex items-center justify-center rounded-[14px] sm:rounded-[18px] relative shadow-sm",
              "bg-apple-parchment dark:bg-[#1e1e22] border-2",
              "border-apple-divider/60 dark:border-[#3a3a3e]"
            )}>
              <AnimatePresence mode="popLayout">
                <motion.span
                  key={digit + i}
                  initial={{ y: 20, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  exit={{ y: -20, opacity: 0 }}
                  transition={{ type: 'spring', bounce: 0, duration: 0.25 }}
                  className="text-[clamp(36px,10vw,64px)] font-bold text-apple-ink dark:text-white absolute font-mono tnum tracking-tighter leading-none"
                >
                  {digit}
                </motion.span>
              </AnimatePresence>
            </div>
            {i === 2 && <div className="w-3 sm:w-5 shrink-0" />}
          </React.Fragment>
        ))}
      </div>
    </div>
  );
}
