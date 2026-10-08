import React, { useState, useId } from 'react';
import { cn } from '../lib/utils';
import { ShareTextsLogo } from './ShareTextsLogo';
import { OtpInput } from './spaceui/OtpInput';
import { useI18n } from '../lib/i18n';

/**
 * LiveCodeInput — the join-code screen, on Rare UI's OtpInput.
 *
 * The real OtpInput (vendored at spaceui/OtpInput.tsx) owns the slot
 * mechanics: per-slot hidden inputs, the rolling digit settle, the sliding
 * caret, paste/SMS-autofill fill-forward, the contiguity guard, and the
 * error shake. This wrapper keeps the join flow around it: the six-tick
 * progress strip, the numeric-only validation note, the paste hint, the
 * retry row on a bad code, and the joining state.
 */
export function LiveCodeInput({ onComplete, isJoining, error }: { onComplete: (code: string) => void, isJoining: boolean, error?: string | null }) {
  const { t } = useI18n();
  const [code, setCode] = useState('');

  // The desktop and mobile layouts both render this component (CSS picks the
  // visible one), so a hardcoded id would appear twice in the DOM — breaking
  // label association and letting autoFocus land on the hidden copy. useId
  // keeps every instance's id unique.
  const inputId = useId();

  const handleComplete = (val: string) => {
    if (val.length === 6) onComplete(val);
  };

  const handleChange = (val: string) => {
    setCode(val);
    if (val.length === 6) handleComplete(val);
  };

  const status: 'idle' | 'error' = error ? 'error' : 'idle';

  const digitCount = code.length;

  return (
    <div className="flex flex-col items-center relative w-full">
      <span id={inputId} className="sr-only">{t('code.sixDigits')}</span>

      <OtpInput
        length={6}
        value={code}
        onChange={handleChange}
        onComplete={handleComplete}
        disabled={isJoining}
        autoFocus
        status={status}
        size="md"
        slotLabel={(index) => t('code.digitOf', { n: index + 1 })}
      />

      {/* Six ticks, filled as the code is typed — the same information the
          sentence used to carry, without asking anyone to read a number.
          The sentence survives for screen readers only. */}
      {!error && (
        <div role="status" className="mt-3 sm:mt-4 w-full flex items-center gap-1.5" aria-hidden={false}>
          <div className="flex items-center gap-1.5 flex-1" aria-hidden>
            {Array.from({ length: 6 }).map((_, i) => (
              <span
                key={i}
                className={cn(
                  'h-[3px] flex-1 rounded-full transition-colors duration-200',
                  i < digitCount ? 'bg-ember dark:bg-azure-400' : 'bg-apple-divider dark:bg-white/[0.12]'
                )}
              />
            ))}
          </div>
          <span className="sr-only">{t('code.digitsOf', { n: digitCount })}</span>
        </div>
      )}

      {error && (
        <div role="alert" className="mt-4 sm:mt-6 flex flex-col items-center gap-3">
          <p className="text-[13px] sm:text-[14px] text-status-danger font-medium">{error}</p>
          <button
            onClick={() => setCode('')}
            className="px-4 py-1.5 rounded-full text-[12px] font-semibold bg-status-danger/10 text-status-danger hover:bg-status-danger/20 transition-colors active:scale-95"
          >
            {t('home.retry')}
          </button>
        </div>
      )}

      {isJoining && (
        <div role="status" className="flex flex-col items-center justify-center mt-6 sm:mt-8">
          <ShareTextsLogo size={20} motion="connecting" />
          <p className="text-[14px] sm:text-[15px] font-medium text-apple-ink-muted">{t('code.verifying')}</p>
        </div>
      )}
    </div>
  );
}
