import type { LucideIcon } from 'lucide-react';
import { Loader } from 'lucide-react';
import { cn } from '../lib/utils';

// ---------------------------------------------------------------------------
// SpinLoader — OpenSourceUI's spin-loader, app-tinted.
// ---------------------------------------------------------------------------
// Port of opensourceui.in/components/spin-loader (the real `SpinLoader`
// source). What shipped verbatim: the lucide `Loader` glyph (the original's
// twelve-spoke mark reads as a machine working, not an icon), the
// role="status" + aria-live="polite" + aria-label contract, the sm/md/lg
// size scale (18/24/32), the custom-icon escape hatch, and the
// `text-neutral-900 motion-reduce:animate-none` treatment — retinted here to
// draw in `currentColor` so any surface colors it (ember by default).
//
// Back-compat: this app's existing call sites pass pixel numbers
// (`size={16}`); the original passes preset keys (`size="md"`). Both work —
// a number maps to the nearest preset at or above it, so no call site had to
// change and no glyph shrinks below its readable floor.
// ---------------------------------------------------------------------------

export type SpinLoaderSize = 'sm' | 'md' | 'lg';

export type SpinLoaderProps = Readonly<{
  /** 'sm' | 'md' | 'lg' — or a pixel number (legacy call sites). */
  size?: SpinLoaderSize | number;
  icon?: LucideIcon;
  label?: string;
  className?: string;
  iconClassName?: string;
  'aria-hidden'?: boolean | 'true' | 'false';
}>;

const SIZE: Record<SpinLoaderSize, number> = {
  sm: 18,
  md: 24,
  lg: 32,
};

/** Numeric sizes snap up to the nearest preset: 9–18 → sm, 19–24 → md, else lg. */
function resolveSize(size: SpinLoaderSize | number): SpinLoaderSize {
  if (typeof size === 'number') {
    if (size <= 18) return 'sm';
    if (size <= 24) return 'md';
    return 'lg';
  }
  return size;
}

export function SpinLoader({
  size = 'md',
  icon: Icon = Loader,
  label = 'Loading',
  className,
  iconClassName,
  ...rest
}: SpinLoaderProps) {
  const key = resolveSize(size);
  const iconSize = SIZE[key];

  return (
    <div
      data-slot="spin-loader"
      data-size={key}
      className={cn('inline-flex items-center justify-center', className)}
      role="status"
      aria-live="polite"
      aria-label={label}
      {...rest}
    >
      <Icon
        size={iconSize}
        strokeWidth={2}
        className={cn(
          'animate-spin text-neutral-900 dark:text-current motion-reduce:animate-none',
          iconClassName,
        )}
        aria-hidden
      />
    </div>
  );
}
