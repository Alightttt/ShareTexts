import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Delete, Loader2 } from 'lucide-react';
import { cn } from '../lib/utils';

export function LiveCodeInput({ onComplete, isJoining, error }: { onComplete: (code: string) => void, isJoining: boolean, error?: string | null }) {
  const [code, setCode] = useState('');
  const [shake, setShake] = useState(false);

  React.useEffect(() => {
    if (error) {
      setCode('');
      setShake(true);
      setTimeout(() => setShake(false), 500);
    }
  }, [error]);

  const handlePadClick = (val: string) => {
    if (isJoining) return;
    if (val === 'back') {
      setCode(c => c.slice(0, -1));
    } else if (code.length < 6) {
      const newCode = code + val;
      setCode(newCode);
      if (newCode.length === 6) {
        onComplete(newCode);
      }
    }
  };

  const handleClear = () => {
    setCode('');
    setShake(true);
    setTimeout(() => setShake(false), 500);
  };

  const pads = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'back'];

  return (
    <div className="flex flex-col items-center">
      <motion.div 
        animate={shake ? { x: [-10, 10, -10, 10, 0] } : {}} 
        transition={{ duration: 0.4 }}
        className="flex space-x-2 mb-12"
      >
        {Array.from({ length: 6 }).map((_, i) => (
          <React.Fragment key={i}>
            <div className={cn(
              "w-12 h-16 rounded-[8px] flex items-center justify-center overflow-hidden transition-colors",
              code[i] ? "bg-white dark:bg-apple-tile-3 border border-apple-hairline dark:border-transparent" : "bg-apple-parchment dark:bg-apple-tile-1 border border-transparent",
              error && "border-red-500 bg-red-50 dark:bg-red-900/20"
            )}>
              <span className="text-[34px] font-semibold text-apple-ink dark:text-white tracking-tight">
                {code[i] || ''}
              </span>
            </div>
            {i === 2 && <div className="w-3" />}
          </React.Fragment>
        ))}
      </motion.div>

      {error && (
        <div className="mb-6 text-[14px] text-red-500 font-medium">
          {error}
        </div>
      )}

      {isJoining ? (
        <div className="flex flex-col items-center justify-center h-64">
          <Loader2 className="w-8 h-8 animate-spin text-apple-blue mb-4" />
          <p className="text-[17px] text-apple-ink-muted">Verifying code...</p>
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-4 w-full max-w-[280px]">
          {pads.map((p, i) => {
            if (p === '') return <div key={i} />;
            if (p === 'back') return (
              <button key={i} onClick={() => handlePadClick(p)} className="h-[72px] rounded-full flex items-center justify-center active:bg-apple-divider dark:active:bg-apple-tile-2 transition-colors active:scale-95">
                <Delete className="w-7 h-7 text-apple-ink-muted dark:text-apple-ink-muted" />
              </button>
            );
            return (
              <button 
                key={i} 
                onClick={() => handlePadClick(p)}
                className="h-[72px] rounded-full flex items-center justify-center text-[34px] font-normal text-apple-ink dark:text-white bg-apple-parchment dark:bg-apple-tile-1 active:bg-apple-divider dark:active:bg-apple-tile-2 transition-transform active:scale-95"
              >
                {p}
              </button>
            );
          })}
        </div>
      )}
      
      {/* Expose handleClear for parent to reset if code is wrong */}
      <button id="reset-code-btn" className="hidden" onClick={handleClear} />
    </div>
  );
}
