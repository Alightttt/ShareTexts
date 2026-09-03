import React, { useState, useEffect, useRef, useId } from 'react';
import { motion } from 'motion/react';
import { cn } from '../lib/utils';
import { ShareTextLogo } from './ShareTextLogo';

export function LiveCodeInput({ onComplete, isJoining, error }: { onComplete: (code: string) => void, isJoining: boolean, error?: string | null }) {
  const [code, setCode] = useState('');
  const [shake, setShake] = useState(false);
  const [pasteHint, setPasteHint] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  // The desktop and mobile layouts both render this component (CSS picks the
  // visible one), so a hardcoded id would appear twice in the DOM — breaking
  // label association and letting autoFocus land on the hidden copy. useId
  // keeps every instance's id unique.
  const inputId = useId();

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

  const [validationMsg, setValidationMsg] = useState<string | null>(null);

  const normalizeCode = (raw: string): string => {
    return raw.replace(/\D/g, '').slice(0, 6);
  };

  const showValidation = (msg: string) => {
    setValidationMsg(msg);
    setTimeout(() => setValidationMsg(null), 3000);
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (isJoining) return;
    const raw = e.target.value;
    if (/\D/.test(raw) && raw.length > code.length) {
      showValidation('Use six numbers, not text.');
      return;
    }
    const val = normalizeCode(raw);
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
    const hasNonDigit = /\D/.test(pasted.trim());
    const normalized = normalizeCode(pasted);
    if (normalized.length === 0 && hasNonDigit) {
      showValidation('Use six numbers, not text.');
      return;
    }
    if (normalized.length > 0) {
      setCode(normalized);
      setPasteHint(false);
      if (normalized.length === 6) {
        onComplete(normalized);
      } else {
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
      <label htmlFor={inputId} className="sr-only">Six-digit pairing code</label>
      <input
        id={inputId}
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
        style={{ fontSize: '16px' }}
      />
      
      <motion.div 
        animate={shake ? { x: [-8, 8, -8, 8, 0] } : {}}
        transition={{ duration: 0.4 }}
        className="flex w-full gap-1.5 sm:gap-2"
        onClick={() => inputRef.current?.focus()}
        aria-hidden="true"
      >
        {Array.from({ length: 6 }).map((_, i) => (
          <React.Fragment key={i}>
            <div className={cn(
              "flex-1 min-w-0 rounded-[10px] sm:rounded-[14px] flex items-center justify-center overflow-hidden overflow-hidden transition-colors relative",
              "h-[52px] sm:h-[64px]",
              code[i]
                ? "bg-white dark:bg-apple-tile-3 border border-apple-divider dark:border-apple-tile-3"
                : "bg-apple-parchment dark:bg-black border border-apple-divider/60 dark:border-apple-tile-3",
              error && "border-status-danger bg-red-50 dark:bg-red-900/20",
              !code[i] && !error && "focus-within:border-apple-blue/50"
            )}>
              <span className="font-semibold text-apple-ink dark:text-white tracking-tighter font-mono leading-none select-none" style={{ fontSize: 'clamp(22px, 7vw, 40px)' }}>
                {code[i] || ''}
              </span>
              {!isJoining && code.length === i && (
                <motion.div 
                  initial={{ opacity: 0 }}
                  animate={{ opacity: [1, 0] }}
                  transition={{ repeat: Infinity, duration: 1 }}
                  className="w-[2px] h-7 sm:h-9 bg-apple-blue absolute rounded-full"
                />
              )}
            </div>
            {i === 2 && <div className="w-2 sm:w-3 shrink-0" />}
          </React.Fragment>
        ))}
      </motion.div>

      {!error && !validationMsg && pasteHint && (
        <div id="live-code-hint" role="status" className="mt-3 sm:mt-4 text-[12px] sm:text-[13px] text-apple-ink-muted dark:text-white/50 font-medium">
          Enter all 6 digits to continue.
        </div>
      )}

      {validationMsg && (
        <div role="alert" className="mt-3 sm:mt-4 text-[12px] sm:text-[13px] text-status-warning font-medium">
          {validationMsg}
        </div>
      )}

      {!error && !validationMsg && !pasteHint && digitCount > 0 && digitCount < 6 && (
        <div role="status" className="mt-3 sm:mt-4 text-[12px] sm:text-[13px] text-apple-ink-muted dark:text-white/50 font-medium">
          {digitCount} of 6 digits entered
        </div>
      )}

      {error && (
        <div id="live-code-error" role="alert" className="mt-4 sm:mt-6 flex flex-col items-center gap-3">
          <p className="text-[13px] sm:text-[14px] text-status-danger font-medium">{error}</p>
          <button
            onClick={() => { setCode(''); if (inputRef.current) inputRef.current.focus(); }}
            className="px-4 py-1.5 rounded-full text-[12px] font-semibold bg-status-danger/10 text-status-danger hover:bg-status-danger/20 transition-colors active:scale-95"
          >
            Try again
          </button>
        </div>
      )}

      {isJoining && (
        <div role="status" className="flex flex-col items-center justify-center mt-6 sm:mt-8">
          <ShareTextLogo size={20} motion="connecting" className="text-apple-blue dark:text-azure-400 mb-3 sm:mb-4" />
          <p className="text-[14px] sm:text-[15px] font-medium text-apple-ink-muted">Verifying code…</p>
        </div>
      )}
    </div>
  );
}
