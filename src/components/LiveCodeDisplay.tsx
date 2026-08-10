import React, { useEffect, useState } from 'react';
import { generateTOTP, getTOTPRemainingSeconds, getTOTPProgress } from '../lib/totp';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils';

interface LiveCodeDisplayProps {
  secret: string;
}

export function LiveCodeDisplay({ secret }: LiveCodeDisplayProps) {
  const [code, setCode] = useState(generateTOTP(secret));
  const [progress, setProgress] = useState(getTOTPProgress());
  const [remaining, setRemaining] = useState(getTOTPRemainingSeconds());

  useEffect(() => {
    let animationFrame: number;
    
    const tick = () => {
      const newCode = generateTOTP(secret);
      if (newCode !== code) setCode(newCode);
      setProgress(getTOTPProgress());
      setRemaining(getTOTPRemainingSeconds());
      animationFrame = requestAnimationFrame(tick);
    };
    
    animationFrame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animationFrame);
  }, [secret, code]);

  const digits = code.split('');
  const isUrgent = remaining <= 3;

  return (
    <div className="flex flex-col items-center justify-center p-10 bg-white dark:bg-apple-tile-1 border border-apple-divider dark:border-apple-tile-3 rounded-[24px] relative overflow-hidden shadow-sm">
      <div className={cn("absolute top-6 right-6 flex items-center justify-center transition-transform", isUrgent && "scale-110")}>
        <svg width="44" height="44" viewBox="0 0 44 44" className="transform -rotate-90">
          <circle cx="22" cy="22" r="18" fill="transparent" stroke="currentColor" strokeWidth="3" className="text-apple-divider dark:text-apple-tile-3" />
          <circle
            cx="22" cy="22" r="18"
            fill="transparent"
            stroke="currentColor"
            strokeWidth="3"
            className={cn("transition-colors duration-300", isUrgent ? "text-[#ff3b30]" : "text-apple-ink dark:text-white")}
            strokeDasharray={113.097}
            strokeDashoffset={113.097 - (progress * 113.097)}
            strokeLinecap="round"
          />
        </svg>
        <span className={cn("absolute text-[12px] font-medium transition-colors duration-300", isUrgent ? "text-[#ff3b30]" : "text-apple-ink-muted")}>
          {Math.ceil(remaining)}
        </span>
      </div>

      <p className="text-[12px] font-medium text-apple-ink-muted mb-8 tracking-widest uppercase">Live Code</p>

      <div className="flex space-x-2">
        {digits.map((digit, i) => (
          <React.Fragment key={i}>
            <div className="w-12 h-16 sm:w-14 sm:h-20 bg-apple-parchment dark:bg-black border border-apple-divider/50 dark:border-apple-tile-3 rounded-[12px] flex items-center justify-center overflow-hidden relative shadow-inner">
              <AnimatePresence mode="popLayout">
                <motion.span
                  key={digit + i}
                  initial={{ y: 24, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  exit={{ y: -24, opacity: 0 }}
                  transition={{ type: 'spring', bounce: 0, duration: 0.3 }}
                  className="text-[32px] sm:text-[40px] font-semibold text-apple-ink dark:text-white absolute font-mono tracking-tighter"
                >
                  {digit}
                </motion.span>
              </AnimatePresence>
            </div>
            {i === 2 && <div className="w-3" />}
          </React.Fragment>
        ))}
      </div>
      
      <p className="text-[15px] text-apple-ink-muted mt-8 text-center max-w-[220px] leading-relaxed">
        Enter this code on your other device.
      </p>
    </div>
  );
}
