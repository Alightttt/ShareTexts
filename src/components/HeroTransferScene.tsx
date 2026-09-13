import React, { useRef } from 'react';

/**
 * HeroMockupScene — the landing hero IS the reference composition, as an
 * image. The exact laptop + iPhone artwork ships untouched
 * (/hero-composition.webp with transparency, PNG fallback) and scales
 * fluidly to the container width at the true aspect ratio. No DOM
 * recreation, no SVG redrawing, no bleed tricks.
 */

export function HeroMockupScene({ className }: { className?: string }) {
  const ref = useRef<HTMLDivElement>(null);

  return (
    <div ref={ref} className={className}>
      {/* The user's exact reference composition, as shipped artwork.
          WebP with alpha for all modern browsers; the PNG is the fallback. */}
      <picture style={{ display: 'block', width: '100%' }}>
        <source srcSet="/hero-composition.webp" type="image/webp" />
        <img
          src="/hero-composition.png"
          alt="ShareText running on a laptop and iPhone — devices connected and transferring"
          draggable={false}
          className="block w-full h-auto select-none"
          width={1622}
          height={969}
        />
      </picture>
    </div>
  );
}

/* Back-compat export: existing call sites render the composition image. */
export function HeroTransferScene({ className }: { className?: string }) {
  return <HeroMockupScene className={className} />;
}
