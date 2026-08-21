import React, { useState, useEffect, useRef } from 'react';
import { motion } from 'motion/react';
import { cn } from '../lib/utils';
import { ShareTextLogo } from './ShareTextLogo';

export function LiveCodeInput({ onComplete, isJoining, error }: { onComplete: (code: string) => void, isJoining: boolean, error?: string | null }) {
  const [code, setCode] = useState('');
  const [shake, setShake] = useState(false);
  const [pasteHint, setPasteHint] = useState(false);
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

  // Normalize pasted input intelligently: extract only digits from any format
  // ("123 456", "123456", "Code: 123456", etc.)
  const normalizeCode = (raw: string): string => {
    return raw.replace(/\D/g, '').slice(0, 6);
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (isJoining) return;
    const val = normalizeCode(e.target.value);
    setCode(val);
    setPasteHint(false);
    if (val.length === 6) {
      onComplete(val);
    }
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    if (isJoining) return;
    e.preventDefault();
    const pasted = e.clipboardData.getData('text');
    const normalized = normalizeCode(pasted);
    if (normalized.length > 0) {
      setCode(normalized);
      setPasteHint(false);
      if (normalized.length === 6) {
        onComplete(normalized);
      } else {
        // Show hint that more digits are needed
        setPasteHint(true);
        setTimeout(() => setPasteHint(false), 2000);
      }
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && code.length === 6 && !isJoining) {
      onComplete(code);
    }
  };

  const digitCount = code.length;

  return (
    <div className="flex flex-col items-center relative w-full">
      <label htmlFor="pairing-code-input" className="sr-only">Six-digit pairing code</label>
      <input
        id="pairing-code-input"
        ref={inputRef}
        type="text"
        inputMode="numeric"
        pattern="[0-9]*"
        maxLength={10}
        value={code}
        onChange={handleChange}
        onPaste={handlePaste}
        onKeyDown={handleKeyDown}
        disabled={isJoining}
        autoFocus
        autoComplete="one-time-code"
        data-testid="join-code-input"
        aria-label="Six-digit pairing code"
        aria-describedby={error ? 'live-code-error' : pasteHint ? 'live-code-hint' : undefined}
        aria-invalid={!!error}
        aria-current={isJoining ? 'step' : undefined}
        className="absolute inset-0 opacity-0 cursor-default"
        style={{ fontSize: '16px' }} // prevent iOS zoom
      />
      
      <motion.div 
        animate={shake ? { x: [-10, 10, -10, 10, 0] } : {}}
        transition={{ duration: 0.4 }}
        className="flex w-full max-w-[340px] sm:max-w-[400px] gap-2 sm:gap-2.5"
        onClick={() => inputRef.current?.focus()}
        aria-hidden="true"
      >
        {Array.from({ length: 6 }).map((_, i) => (
          <React.Fragment key={i}>
            <div className={cn(
              "flex-1 aspect-[3/4] rounded-[14px] sm:rounded-[16px] flex items-center justify-center overflow-hidden transition-motion relative",
              "shadow-[inset_0_1px_2px_rgba(0,0,0,0.05)]",
              code[i]
                ? "bg-white dark:bg-apple-tile-3 border border-apple-divider dark:border-apple-tile-3"
                : "bg-apple-parchment dark:bg-black border border-apple-divider/60 dark:border-apple-tile-3",
              error && "border-status-danger bg-red-50 dark:bg-red-900/20",
              !code[i] && !error && "focus-within:border-apple-blue/50"
            )}>
              <span className="text-[clamp(32px,9vw,52px)] font-semibold text-apple-ink dark:text-white tracking-tighter font-mono leading-none">
                {code[i] || ''}
              </span>
              {/* Caret */}
              {!isJoining && code.length === i && (
                <motion.div 
                  initial={{ opacity: 0 }}
                  animate={{ opacity: [1, 0] }}
                  transition={{ repeat: Infinity, duration: 1 }}
                  className="w-[2.5px] h-9 sm:h-11 bg-apple-blue absolute rounded-full"
                />
              )}
            </div>
            {i === 2 && <div className="w-2.5 sm:w-5" />}
          </React.Fragment>
        ))}
      </motion.div>

      {!error && pasteHint && (
        <div id="live-code-hint" role="status" className="mt-4 text-[13px] text-apple-ink-muted dark:text-white/50 font-medium">
          Enter all 6 digits to continue.
        </div>
      )}

      {!error && !pasteHint && digitCount > 0 && digitCount < 6 && (
        <div role="status" className="mt-4 text-[13px] text-apple-ink-muted dark:text-white/50 font-medium">
          {digitCount} of 6 digits entered
        </div>
      )}

      {error && (
        <div id="live-code-error" role="alert" className="mt-6 text-[14px] text-status-danger font-medium">
          {error}
        </div>
      )}

      {isJoining && (
        <div role="status" className="flex flex-col items-center justify-center mt-8">
          {/* The brand mark connecting — a packet traveling the beam, not a
              generic spinner. Reduced-motion users get the still mark. */}
          <ShareTextLogo size={22} motion="connecting" className="text-apple-blue dark:text-azure-400 mb-4" />
          <p className="text-[15px] font-medium text-apple-ink-muted">Verifying code…</p>
        </div>
      )}
    </div>
  );
}
