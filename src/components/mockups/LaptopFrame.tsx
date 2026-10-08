import React from 'react';
import { cn } from '../../lib/utils';

/**
 * LaptopFrame — a laptop chassis with a real, live screen.
 *
 * Derived from great-ui's `macbook-mockup` (chassis geometry: lid, camera
 * dot, hinge deck, foot), rebuilt for ShareTexts:
 *
 *   · the screen is a plain 16:10 box that renders CHILDREN — never an
 *     image and never the registry's WhatsApp UI. Whatever we pass in is
 *     the real, crisp DOM, so the mini app inside stays sharp at any size;
 *   · colours come from our tokens (graphite lid, warm-paper or night
 *     screen) instead of the registry's neutral-900;
 *   · no 3D rotateX entrance. A device that tilts on scroll is decoration;
 *     the demo below carries the motion instead.
 *
 * The lid is 7px of bezel around the glass, the deck is 9px with a drawn
 * opening notch and a soft contact shadow — enough silhouette to read as a
 * laptop at 300px wide, nothing more.
 */
export function LaptopFrame({
  children,
  className,
  label,
}: {
  children: React.ReactNode;
  className?: string;
  /** Accessible name for the screen region, e.g. "ShareTexts on a laptop". */
  label?: string;
}) {
  return (
    <div className={cn('relative w-full select-none', className)}>
      {/* Lid + glass. */}
      <div
        className={cn(
          'relative rounded-[14px] p-[7px]',
          'bg-[linear-gradient(180deg,#45454c_0%,#2b2b31_55%,#232327_100%)]',
          'shadow-[inset_0_1px_0_rgba(255,255,255,0.14),0_20px_44px_-20px_rgba(20,16,10,0.45)]',
          'dark:bg-[linear-gradient(180deg,#34343a_0%,#202024_55%,#1a1a1e_100%)]',
          'dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_22px_46px_-20px_rgba(0,0,0,0.75)]',
        )}
      >
        {/* Camera: one hairline dot, centred in the top bezel. */}
        <span
          aria-hidden
          className="absolute left-1/2 top-[3px] h-[3px] w-[3px] -translate-x-1/2 rounded-full bg-black/70 ring-1 ring-white/10"
        />
        <div
          role="img"
          aria-label={label}
          className={cn(
            'relative aspect-[16/10] w-full overflow-hidden rounded-[8px]',
            'bg-apple-canvas ring-1 ring-black/15 dark:bg-night-900 dark:ring-white/[0.07]',
          )}
        >
          {children}
        </div>
      </div>
      {/* Deck: 9px of aluminium that tapers to the opening notch. */}
      <div
        aria-hidden
        className={cn(
          'relative mx-auto -mt-px h-[9px] w-[104%] -translate-x-[2%]',
          'rounded-b-[8px] rounded-t-[2px]',
          'bg-[linear-gradient(180deg,#3c3c43_0%,#2a2a2f_45%,#1c1c20_100%)]',
          'shadow-[0_10px_18px_-12px_rgba(20,16,10,0.5)]',
          'dark:bg-[linear-gradient(180deg,#2e2e34_0%,#1e1e22_45%,#131316_100%)]',
        )}
      >
        <span className="absolute left-1/2 top-0 h-[4px] w-[14%] -translate-x-1/2 rounded-b-[4px] bg-black/45" />
      </div>
    </div>
  );
}

export default LaptopFrame;
