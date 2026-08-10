import React, { useState, useEffect, useRef } from 'react';
import { motion } from 'motion/react';
import { Loader2 } from 'lucide-react';
import { cn } from '../lib/utils';

export function LiveCodeInput({ onComplete, isJoining, error }: { onComplete: (code: string) => void, isJoining: boolean, error?: string | null }) {
  const [code, setCode] = useState('');
  const [shake, setShake] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isJoining && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isJoining]);

  useEffect(() => {
    if (error) {
      setCode('');
      setShake(true);
      setTimeout(() => setShake(false), 500);
      if (inputRef.current) inputRef.current.focus();
    }
  }, [error]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (isJoining) return;
    const val = e.target.value.replace(/\D/g, '').slice(0, 6);
    setCode(val);
    if (val.length === 6) {
      onComplete(val);
    }
  };

  return (
    <div className="flex flex-col items-center relative">
      <input
        ref={inputRef}
        type="text"
        inputMode="numeric"
        pattern="[0-9]*"
        maxLength={6}
        value={code}
        onChange={handleChange}
        disabled={isJoining}
        autoFocus
        className="absolute inset-0 opacity-0 cursor-default"
        style={{ fontSize: '16px' }} // prevent iOS zoom
      />
      
      <motion.div 
        animate={shake ? { x: [-10, 10, -10, 10, 0] } : {}} 
        transition={{ duration: 0.4 }}
        className="flex space-x-2"
        onClick={() => inputRef.current?.focus()}
      >
        {Array.from({ length: 6 }).map((_, i) => (
          <React.Fragment key={i}>
            <div className={cn(
              "w-12 h-16 sm:w-14 sm:h-20 rounded-[12px] flex items-center justify-center overflow-hidden transition-colors relative shadow-inner",
              code[i] ? "bg-white dark:bg-apple-tile-3 border border-apple-divider dark:border-apple-tile-3" : "bg-apple-parchment dark:bg-black border border-apple-divider/50 dark:border-apple-tile-3",
              error && "border-[#ff3b30] bg-red-50 dark:bg-red-900/20"
            )}>
              <span className="text-[32px] sm:text-[40px] font-semibold text-apple-ink dark:text-white tracking-tighter font-mono">
                {code[i] || ''}
              </span>
              {/* Caret */}
              {!isJoining && code.length === i && (
                <motion.div 
                  initial={{ opacity: 0 }}
                  animate={{ opacity: [1, 0] }}
                  transition={{ repeat: Infinity, duration: 1 }}
                  className="w-[2px] h-8 sm:h-10 bg-apple-blue absolute"
                />
              )}
            </div>
            {i === 2 && <div className="w-3" />}
          </React.Fragment>
        ))}
      </motion.div>

      {error && (
        <div className="mt-6 text-[14px] text-[#ff3b30] font-medium">
          {error}
        </div>
      )}

      {isJoining && (
        <div className="flex flex-col items-center justify-center mt-8">
          <Loader2 className="w-6 h-6 animate-spin text-apple-ink-muted mb-4" />
          <p className="text-[15px] font-medium text-apple-ink-muted">Verifying code...</p>
        </div>
      )}
    </div>
  );
}
