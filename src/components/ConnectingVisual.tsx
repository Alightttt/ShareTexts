import React from 'react';
import { Lock } from 'lucide-react';
import { cn } from '../lib/utils';
import { ShareTextLogo } from './ShareTextLogo';

/**
 * The shared "Connecting…" moment — used on BOTH devices so the
 * code-display side and the code-entry side tell the same story.
 *
 * Two device nodes connected by a line with a lock at the center.
 * Calm, static, purposeful. No floating, no particles, no decorative beams.
 */
export function ConnectingVisual({ className }: { className?: string }) {
  return (
    <div className={cn('relative w-56 h-28', className)} aria-hidden>
      {/* Beam line — centered between the two device nodes */}
      <div className="absolute left-[24px] right-[24px] top-1/2 h-px bg-apple-ink/10 dark:bg-white/10 -translate-y-px" />

      {/* Sending device — vertically centered, left edge */}
      <div className="absolute top-1/2 left-0 w-12 h-12 -translate-y-1/2 rounded-[14px] bg-white dark:bg-apple-tile-1 border border-apple-divider dark:border-apple-tile-3 shadow-card flex items-center justify-center">
        <ShareTextLogo size={20} className="text-apple-ink dark:text-white" />
      </div>
      {/* Receiving device — vertically centered, right edge */}
      <div className="absolute top-1/2 right-0 w-12 h-12 -translate-y-1/2 rounded-[14px] bg-white dark:bg-apple-tile-1 border border-apple-divider dark:border-apple-tile-3 shadow-card flex items-center justify-center">
        <ShareTextLogo size={20} className="text-apple-ink dark:text-white" />
      </div>

      {/* Lock badge — exact center of the beam */}
      <div className="absolute left-1/2 top-1/2 w-8 h-8 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white dark:bg-apple-tile-1 border border-apple-divider dark:border-apple-tile-3 shadow-card flex items-center justify-center z-10">
        <Lock className="w-3.5 h-3.5 text-apple-blue dark:text-azure-400" />
      </div>
    </div>
  );
}
