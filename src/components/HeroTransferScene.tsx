import React, { useRef, useState } from 'react';

/**
 * HeroMockupScene — the landing hero IS the reference composition, as an
 * image. The exact laptop + iPhone artwork ships untouched
 * (/hero-composition.webp with transparency, PNG fallback) and scales
 * fluidly to the container width at the true aspect ratio. No DOM
 * recreation, no SVG redrawing, no bleed tricks.
 *
 * On load the image fades-settles in (never pops); the intrinsic
 * width/height reserves layout space so nothing shifts around it.
 */

export function HeroMockupScene({ className }: { className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [loaded, setLoaded] = useState(false);

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
          onLoad={() => setLoaded(true)}
          className={`block w-full h-auto select-none st-img-fade ${loaded ? 'st-img-loaded' : ''}`}
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
