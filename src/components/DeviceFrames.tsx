import React from 'react';
import { cn } from '../lib/utils';

/**
 * Premium device chrome for the landing demonstrations — one shared language
 * across the hero, the scroll story, and the situations. Realism comes from
 * small true details, and everything is proportional so the same frame reads
 * correctly from a 62px situation card to a 400px hero:
 *
 *   Phone — titanium rim with a bright machined catch-light, proportional
 *           corner radius, side buttons with depth, dynamic island with a
 *           camera lens, a real status bar (time + signal/battery), a
 *           recessed screen ring, and a soft ground shadow.
 *   Laptop — aluminium lid with a machined edge, camera pinhole, hinge,
 *            a recessed screen, and a real keyboard deck: function row,
 *            keycap depth (per-key gradient + bottom edge), palm rest,
 *            and a trackpad with a click line.
 *
 * The screen content is passed as children; the chrome is pure presentation.
 */

function GroundShadow({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={cn(
        'pointer-events-none absolute left-1/2 -translate-x-1/2 rounded-[50%] bg-black/25 dark:bg-black/60 blur-2xl',
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
        'bg-[linear-gradient(115deg,rgba(255,255,255,0.10)_0%,rgba(255,255,255,0.025)_20%,transparent_38%,transparent_72%,rgba(255,255,255,0.04)_100%)]',
        className
      )}
    />
  );
}

/** A recessed-screen ring — the thin inner shadow where glass meets frame. */
function ScreenRecess() {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 z-10 rounded-[inherit] shadow-[inset_0_1px_3px_rgba(0,0,0,0.45),inset_0_0_0_1px_rgba(255,255,255,0.03)]"
    />
  );
}

/**
 * The phone status bar — time left of the island, signal/battery right.
 * Drawn by the frame so every phone surface (hero, story, situations) reads
 * as a real phone; screen content already clears the top for the island.
 */
function PhoneStatusBar() {
  return (
    <div aria-hidden className="absolute inset-x-0 top-[3%] z-30 flex items-center justify-between px-[7%] text-[clamp(4px,1.35vw,9px)] text-apple-ink dark:text-white">
      <span className="font-semibold tracking-tight">9:41</span>
      <div className="flex items-center gap-[0.35em]">
        {/* Signal bars */}
        <span className="flex items-end gap-[0.08em]">
          {[0.45, 0.65, 0.85, 1].map((h, i) => (
            <span key={i} className="w-[0.14em] rounded-[0.03em] bg-current" style={{ height: `${h * 0.55}em` }} />
          ))}
        </span>
        {/* Battery */}
        <span className="relative flex items-center w-[1.15em] h-[0.5em] rounded-[0.16em] border-[0.06em] border-current/60 px-[0.06em]">
          <span className="h-[70%] w-[80%] rounded-[0.1em] bg-current" />
          <span className="absolute -right-[0.22em] w-[0.12em] h-[0.22em] rounded-r-[0.05em] bg-current/60" />
        </span>
      </div>
    </div>
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
      {/* Titanium body — bright machined edge on the lit side, dark on the other */}
      <div className="relative rounded-[clamp(16px,6.5%,34px)] p-[2.5%] bg-[linear-gradient(155deg,#7a7a82_0%,#45454c_14%,#2c2c30_38%,#151518_78%,#0d0d0f_100%)] shadow-device">
        {/* Inner rim — gives the edge a second, softer highlight */}
        <div className="absolute inset-[0.55%] rounded-[calc(clamp(16px,6.5%,34px)-1px)] bg-[linear-gradient(160deg,rgba(255,255,255,0.16)_0%,rgba(255,255,255,0.04)_12%,transparent_30%,transparent_78%,rgba(255,255,255,0.05)_100%)] pointer-events-none" />
        {/* Side buttons with depth */}
        <div className="absolute -left-[1.2%] top-[14%] h-[3.4%] w-[2.2%] rounded-l-[2px] bg-[linear-gradient(180deg,#5c5c63,#2e2e32)] shadow-[1px_1px_2px_rgba(0,0,0,0.6)]" />
        <div className="absolute -left-[1.2%] top-[20%] h-[5.6%] w-[2.2%] rounded-l-[2px] bg-[linear-gradient(180deg,#5c5c63,#2e2e32)] shadow-[1px_1px_2px_rgba(0,0,0,0.6)]" />
        <div className="absolute -right-[1.2%] top-[17%] h-[7%] w-[2.2%] rounded-r-[2px] bg-[linear-gradient(180deg,#56565c,#26262a)] shadow-[-1px_1px_2px_rgba(0,0,0,0.6)]" />

        <div className="relative rounded-[clamp(14px,5.6%,30px)] bg-[#0b0b0d] p-[2.4%]">
          <div
            className={cn(
              'relative w-full aspect-[9/19.2] rounded-[clamp(11px,4.4%,24px)] overflow-hidden bg-apple-parchment dark:bg-black',
              screenClassName
            )}
          >
            {/* Dynamic island with camera lens */}
            <div className="absolute top-[2.4%] left-1/2 -translate-x-1/2 w-[36%] h-[2.9%] min-h-[7px] bg-black rounded-full z-30 flex items-center justify-end px-[9%] shadow-[0_1px_3px_rgba(0,0,0,0.5)]">
              <span className="w-[16%] h-[38%] rounded-full bg-[#14141a] ring-1 ring-[#2a2a35] shadow-[inset_0_0_1px_rgba(120,160,255,0.5)]" />
            </div>
            <PhoneStatusBar />
            {children}
            <ScreenRecess />
            <ScreenReflection />
          </div>
        </div>
      </div>
      <GroundShadow className="w-[76%] h-[6%] -bottom-[5%] opacity-60" />
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
      {/* Lid — aluminium, seen from the front at ~95° open: the screen faces
          the viewer almost straight on and the base is just a slim lip below.
          No keyboard is visible — it recedes behind the screen. */}
      <div className="relative rounded-[clamp(7px,2.2%,16px)] p-[1.5%] bg-[linear-gradient(168deg,#8a8a92_0%,#4a4a50_16%,#303034_45%,#1c1c1f_100%)] shadow-device">
        {/* Camera pinhole */}
        <div className="absolute top-[3.5%] left-1/2 -translate-x-1/2 w-[2.6%] aspect-square rounded-full bg-[#0a0a0c] ring-1 ring-white/15 z-30 shadow-[inset_0_0_2px_rgba(0,0,0,0.9)]">
          <div className="absolute inset-[24%] rounded-full bg-[#2b6cb0]/80 shadow-[0_0_2px_rgba(80,150,255,0.6)]" />
        </div>
        <div className="relative rounded-[clamp(5px,1.6%,13px)] bg-[#121214] p-[2%]">
          <div
            className={cn(
              'relative w-full aspect-[16/10] rounded-[clamp(3px,0.9%,8px)] overflow-hidden bg-apple-canvas dark:bg-black',
              screenClassName
            )}
          >
            {children}
            <ScreenRecess />
            <ScreenReflection />
          </div>
        </div>
      </div>

      {/* Base — the front lip of the laptop body, slightly wider than the lid,
          with the hinge seam where it meets the screen. This is all you see
          from the front; the deck recedes away. */}
      <div className="relative -mt-[1.2%] mx-auto w-[103%] h-[7.5%] min-h-[10px] rounded-b-[clamp(7px,2.2%,16px)] bg-[linear-gradient(180deg,#2c2c30_0%,#242428_35%,#17171a_100%)] shadow-[0_14px_28px_-12px_rgba(0,0,0,0.5)]">
        {/* Hinge seam — the dark gap where the lid meets the base */}
        <div className="absolute -top-[1px] left-[3%] right-[3%] h-[1.5px] rounded-full bg-black/70" />
        {/* Front edge highlight — a machined lip catching the light */}
        <div className="absolute bottom-[12%] left-[6%] right-[6%] h-[1px] rounded-full bg-white/[0.12]" />
      </div>

      <GroundShadow className="w-[80%] h-[6%] -bottom-[5.5%] opacity-55" />
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
