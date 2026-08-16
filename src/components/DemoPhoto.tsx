import React, { useState } from 'react';
import { cn } from '../lib/utils';

/**
 * The demo photo — a real photograph (a mountain at sunrise), served from
 * /demo/photo-4x3.jpg. Until it loads (or if the asset is missing / offline),
 * a quiet SVG stand-in keeps the card from flashing empty; the two are
 * cross-faded so the swap is invisible.
 */

function PhotoFallback({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 200 150" preserveAspectRatio="xMidYMid slice" className={className} aria-hidden>
      <defs>
        <linearGradient id="dp-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#8ec9f8" />
          <stop offset="1" stopColor="#eaf5ff" />
        </linearGradient>
      </defs>
      <rect width="200" height="150" fill="url(#dp-sky)" />
      <circle cx="152" cy="40" r="17" fill="#fff4bf" />
      <path d="M0 98 Q50 80 100 95 T200 90 V150 H0 Z" fill="#b9d8ab" />
      <path d="M0 118 Q60 100 130 114 T200 108 V150 H0 Z" fill="#83b47e" />
      <circle cx="42" cy="110" r="9" fill="#5d9160" />
      <rect x="40" y="110" width="4" height="14" rx="1.5" fill="#6d5039" />
      <circle cx="152" cy="102" r="7" fill="#5d9160" />
      <rect x="150" y="102" width="4" height="12" rx="1.5" fill="#6d5039" />
    </svg>
  );
}

export function DemoPhoto({ className, alt }: { className?: string; alt?: string }) {
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);

  return (
    <div className={cn('relative overflow-hidden bg-apple-parchment dark:bg-[#141416]', className)}>
      {/* Fallback is visible until the photo arrives; the photo then
          cross-fades over it. On error the fallback stays. */}
      <div
        className={cn(
          'absolute inset-0 transition-opacity duration-300',
          loaded ? 'opacity-0' : 'opacity-100'
        )}
      >
        <PhotoFallback className="w-full h-full" />
      </div>
      <img
        src="/demo/photo-4x3.jpg"
        alt={alt || ''}
        // Eager: the hero sits above the fold inside an aria-hidden demo
        // (lazy images there never fire load), and the asset is 14KB.
        decoding="async"
        onLoad={() => setLoaded(true)}
        onError={() => setFailed(true)}
        className={cn(
          'w-full h-full object-cover transition-opacity duration-500',
          loaded ? 'opacity-100' : 'opacity-0'
        )}
      />
    </div>
  );
}
