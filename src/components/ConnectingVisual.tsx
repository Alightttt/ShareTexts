import React from 'react';
import { Lock } from 'lucide-react';
import { cn } from '../lib/utils';
import { ShareTextLogo } from './ShareTextLogo';

/**
 * The shared "Connecting…" moment — used identically on BOTH devices so the
 * code-display side and the code-entry side tell the same story while the
 * handshake runs.
 *
 * Two device nodes joined by a beam with a packet traveling between them,
 * and a small lock badge at the center: the connection is being secured,
 * not just "waiting". Pure CSS animation, so the global
 * prefers-reduced-motion rule freezes it to a calm still frame.
 */
export function ConnectingVisual({ className }: { className?: string }) {
  return (
    <div className={cn('relative w-56 h-28', className)} aria-hidden>
      {/* Beam — perfectly centered between the two device nodes.
          Each node is 48px (w-12 h-12), centered vertically. The beam
          connects their inner edges: left=24px, right=24px, top=50%. */}
      <div className="absolute left-[24px] right-[24px] top-1/2 h-px bg-apple-ink/15 dark:bg-white/15 -translate-y-px" />
      <div className="absolute left-[24px] right-[24px] top-1/2 h-px overflow-visible -translate-y-px" style={{ ['--travel' as string]: '176px' }}>
        <span className="absolute left-0 top-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-azure-500 shadow-[0_0_12px_rgba(46,139,255,0.9)] animate-beam" />
        <span className="absolute left-0 top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full bg-azure-400 shadow-[0_0_10px_rgba(46,139,255,0.7)] animate-beam-delayed" />
      </div>

      {/* Sending device — vertically centered, left edge */}
      <div className="absolute top-1/2 left-0 w-12 h-12 -translate-y-1/2 rounded-[16px] bg-white dark:bg-apple-tile-1 border border-apple-divider dark:border-apple-tile-3 shadow-card flex items-center justify-center animate-float-soft">
        <ShareTextLogo size={20} className="text-apple-ink dark:text-white" />
      </div>
      {/* Receiving device — vertically centered, right edge */}
      <div className="absolute top-1/2 right-0 w-12 h-12 -translate-y-1/2 rounded-[16px] bg-white dark:bg-apple-tile-1 border border-apple-divider dark:border-apple-tile-3 shadow-card flex items-center justify-center animate-float-soft-delayed">
        <ShareTextLogo size={20} className="text-apple-ink dark:text-white" />
      </div>

      {/* Lock badge — exact center of the beam, z-10 above the beam */}
      <div className="absolute left-1/2 top-1/2 w-8 h-8 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white dark:bg-apple-tile-1 border border-apple-divider dark:border-apple-tile-3 shadow-card flex items-center justify-center z-10">
        <Lock className="w-3.5 h-3.5 text-apple-blue dark:text-azure-400" />
      </div>
      <span className="absolute left-1/2 top-1/2 w-9 h-9 -translate-x-1/2 -translate-y-1/2 rounded-full border border-azure-400/60 animate-ring-pulse" />
    </div>
  );
}
