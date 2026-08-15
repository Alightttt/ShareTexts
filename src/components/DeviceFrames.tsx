import React from 'react';
import { cn } from '../lib/utils';

/**
 * Premium device chrome for the landing demonstrations — one shared language
 * across the hero, the scroll story, and the situations. The realism comes
 * from small true details, not decoration:
 *
 *   Phone — titanium body with a metallic edge, side buttons, dynamic island,
 *           a faint diagonal screen reflection, and a soft ground shadow.
 *   Laptop — screen lid with a thin bezel, a visible hinge, and a real
 *            keyboard deck (rows of keys + trackpad) instead of a gradient bar.
 *
 * The screen content is passed as children; the chrome is pure presentation.
 */

function GroundShadow({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={cn(
        'pointer-events-none absolute left-1/2 -translate-x-1/2 rounded-[50%] bg-black/20 dark:bg-black/50 blur-xl',
        className
      )}
    />
  );
}

/** A faint diagonal sheen across a screen — the one "glass" cue that matters. */
function ScreenReflection({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={cn(
        'pointer-events-none absolute inset-0 z-20',
        'bg-[linear-gradient(115deg,rgba(255,255,255,0.09)_0%,rgba(255,255,255,0.02)_22%,transparent_40%)]',
        className
      )}
    />
  );
}

export function PhoneFrame({
  children,
  className,
  screenClassName,
}: {
  children: React.ReactNode;
  className?: string;
  screenClassName?: string;
}) {
  return (
    <div className={cn('relative shrink-0', className)}>
      {/* Titanium body — two-layer rim for a machined edge */}
      <div className="relative rounded-[38px] p-[3px] bg-[linear-gradient(160deg,#4a4a4f_0%,#232326_18%,#3a3a3e_52%,#1a1a1c_100%)] shadow-device">
        <div className="relative rounded-[35px] bg-[#101012] p-[7px]">
          {/* Side buttons */}
          <div className="absolute -left-[2px] top-[92px] h-[22px] w-[3px] rounded-l-[2px] bg-[#4a4a50]" />
          <div className="absolute -left-[2px] top-[124px] h-[36px] w-[3px] rounded-l-[2px] bg-[#4a4a50]" />
          <div className="absolute -right-[2px] top-[110px] h-[46px] w-[3px] rounded-r-[2px] bg-[#4a4a50]" />

          <div
            className={cn(
              'relative w-full aspect-[9/18.5] rounded-[28px] overflow-hidden bg-apple-parchment dark:bg-black',
              screenClassName
            )}
          >
            {/* Dynamic island */}
            <div className="absolute top-[14px] left-1/2 -translate-x-1/2 w-[42%] h-[6.5%] bg-black rounded-full z-30 flex items-center justify-end px-[10%]">
              <span className="w-[9%] h-[40%] rounded-full bg-[#1d1d1f]/90" />
            </div>
            {children}
            <ScreenReflection />
          </div>
        </div>
      </div>
      <GroundShadow className="w-[78%] h-[7%] -bottom-[5.5%] opacity-70" />
    </div>
  );
}

export function LaptopFrame({
  children,
  className,
  screenClassName,
}: {
  children: React.ReactNode;
  className?: string;
  screenClassName?: string;
}) {
  return (
    <div className={cn('relative shrink-0', className)}>
      {/* Lid — aluminium body with a thin metallic edge */}
      <div className="relative rounded-[16px] p-[3px] bg-[linear-gradient(165deg,#5a5a5f_0%,#333337_30%,#3c3c40_55%,#26262a_100%)] shadow-device">
        <div className="relative rounded-[13px] bg-[#151517] p-[7px]">
          {/* Camera pinhole */}
          <div className="absolute top-[6px] left-1/2 -translate-x-1/2 w-[3.5%] aspect-square rounded-full bg-[#0c0c0e] ring-1 ring-white/10 z-30">
            <div className="absolute inset-[22%] rounded-full bg-[#2b6cb0]/70" />
          </div>
          <div
            className={cn(
              'relative w-full aspect-[16/10] rounded-[8px] overflow-hidden bg-apple-canvas dark:bg-black',
              screenClassName
            )}
          >
            {children}
            <ScreenReflection />
          </div>
        </div>
      </div>

      {/* Hinge */}
      <div className="h-[5px] w-[86%] mx-auto rounded-b-[3px] bg-[linear-gradient(180deg,#2e2e31_0%,#1c1c1e_100%)]" />

      {/* Keyboard deck — visible keys + trackpad, not a gradient bar */}
      <div className="rounded-b-[16px] bg-[linear-gradient(180deg,#2b2b2e_0%,#202023_100%)] p-[3.5%] pt-[2%] shadow-[0_18px_36px_-14px_rgba(0,0,0,0.5)]">
        <div className="flex flex-col gap-[4.5%]">
          {[0, 1, 2, 3].map((row) => (
            <div key={row} className="flex justify-between gap-[2.5%]">
              {Array.from({ length: 12 }).map((_, k) => (
                <span
                  key={k}
                  className="flex-1 aspect-[1.35/1] rounded-[1.5px] bg-[#232326] ring-1 ring-white/[0.05] shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]"
                />
              ))}
            </div>
          ))}
        </div>
        {/* Trackpad */}
        <div className="mt-[5%] mx-auto w-[32%] aspect-[1.8/1] rounded-[4px] bg-[#1d1d20] ring-1 ring-white/[0.06]" />
      </div>

      <GroundShadow className="w-[82%] h-[8%] -bottom-[7%] opacity-60" />
    </div>
  );
}

/** Device labels used under every mockup. */
export function DeviceLabel({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <p className={cn('mt-3 sm:mt-4 text-center text-[10px] sm:text-[11px] font-medium text-apple-ink-muted dark:text-white/55', className)}>
      {children}
    </p>
  );
}
