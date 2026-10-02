import React, { useRef, useState, useCallback } from 'react';
import { motion, useSpring, useMotionValue, useTransform } from 'motion/react';
import { Loader2, Check } from 'lucide-react';
import { cn } from '../lib/utils';

// ---------------------------------------------------------------------------
// TactileButton — physically dimensional button (v2)
// ---------------------------------------------------------------------------
// Anatomy (bottom to top):
//   1. Shadow layer — drop depth + INSET bevel (light from above: the top
//      edge catches a bright hairline, the lower edge recesses into shade).
//      Pressing does not move the button body — it SINKS: drop shadow
//      compresses, the inset bevel inverts into a recess, and the content
//      drops 1.5px. Release springs back. (Press recipe adapted from
//      OpenSourceUI's 3D button — bevel/press principles only, restyled
//      with ShareTexts tokens; no dependency added.)
//   2. Base surface — light-from-top gradient
//   3. Top highlight / bottom edge hairlines
//   4. Pointer light — radial highlight following the cursor
//   5. Content — text + icons, drops on press
//
// States: idle · hover · focus · pressed · disabled · loading · success
// Loading keeps the label (truthful: the action is running); success swaps
// the icon for a check for as long as the caller holds the flag.
// ---------------------------------------------------------------------------

type ButtonVariant = 'primary' | 'soft' | 'secondary' | 'ghost';
type ButtonSize = 'sm' | 'md' | 'lg';

interface TactileButtonProps {
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: React.ReactNode;
  iconPosition?: 'left' | 'right';
  /** Truthful in-flight state: spinner replaces the icon, button is busy. */
  loading?: boolean;
  /** Brief confirmation state: check replaces the icon. */
  success?: boolean;
  children: React.ReactNode;
  className?: string;
  disabled?: boolean;
  onClick?: React.MouseEventHandler<HTMLButtonElement>;
  'data-testid'?: string;
  type?: 'button' | 'submit' | 'reset';
}

const SIZE_CLASSES: Record<ButtonSize, string> = {
  sm: 'px-4 py-2 text-[13px] gap-2 rounded-full min-h-[36px]',
  md: 'px-5 py-2.5 text-[14px] gap-2.5 rounded-full min-h-[44px]',
  lg: 'px-7 py-3.5 text-[15px] gap-3 rounded-full min-h-[52px]',
};

// Bevel language: resting = top-light + bottom-shade insets under a drop
// shadow; pressed = drop shadow compressed, insets flip into a recess.
const VARIANT_STYLES: Record<ButtonVariant, { base: string; shadowIdle: string; shadowHover: string; shadowPress: string; gradient: string }> = {
  primary: {
    base: 'text-white',
    shadowIdle: '0 1px 2px rgba(150,55,6,0.30), 0 5px 12px -4px rgba(240,100,19,0.42), inset 0 1px 1px rgba(255,255,255,0.30), inset 0 -2px 3px rgba(139,50,5,0.30)',
    shadowHover: '0 2px 4px rgba(150,55,6,0.26), 0 12px 26px -8px rgba(240,100,19,0.48), inset 0 1px 1px rgba(255,255,255,0.34), inset 0 -2px 3px rgba(139,50,5,0.22)',
    shadowPress: '0 1px 1px rgba(150,55,6,0.28), inset 0 2px 5px rgba(112,40,4,0.38), inset 0 -1px 1px rgba(255,255,255,0.10)',
    gradient: 'linear-gradient(180deg, #f9743a 0%, #f06413 58%, #de5b0e 100%)',
  },
  soft: {
    base: 'text-white',
    shadowIdle: '0 1px 2px rgba(150,55,6,0.22), 0 4px 10px -4px rgba(240,100,19,0.30), inset 0 1px 1px rgba(255,255,255,0.28), inset 0 -2px 3px rgba(150,58,8,0.24)',
    shadowHover: '0 2px 4px rgba(150,55,6,0.2), 0 10px 22px -8px rgba(240,100,19,0.34), inset 0 1px 1px rgba(255,255,255,0.32), inset 0 -2px 3px rgba(150,58,8,0.18)',
    shadowPress: '0 1px 1px rgba(150,55,6,0.2), inset 0 2px 5px rgba(126,48,6,0.30), inset 0 -1px 1px rgba(255,255,255,0.10)',
    gradient: 'linear-gradient(180deg, #fb9a56 0%, #f98b41 58%, #ef7c30 100%)',
  },
  secondary: {
    base: 'text-apple-ink dark:text-white',
    shadowIdle: '0 1px 2px rgba(0,0,0,0.06), inset 0 1px 0 rgba(255,255,255,0.75), inset 0 -1px 1px rgba(0,0,0,0.045)',
    shadowHover: '0 3px 8px rgba(0,0,0,0.07), 0 8px 20px -6px rgba(0,0,0,0.10), inset 0 1px 0 rgba(255,255,255,0.8), inset 0 -1px 1px rgba(0,0,0,0.04)',
    shadowPress: '0 1px 1px rgba(0,0,0,0.05), inset 0 2px 4px rgba(0,0,0,0.10), inset 0 -1px 0 rgba(255,255,255,0.4)',
    gradient: 'var(--st-btn-secondary-grad)',
  },
  ghost: {
    base: 'bg-transparent text-apple-ink-muted hover:text-apple-ink dark:text-white/50 dark:hover:text-white hover:bg-apple-parchment dark:hover:bg-apple-tile-1',
    shadowIdle: '0 0 0 rgba(0,0,0,0)',
    shadowHover: '0 1px 4px rgba(0,0,0,0.06)',
    shadowPress: '0 0 0 rgba(0,0,0,0)',
    gradient: 'linear-gradient(180deg, rgba(255,255,255,0.08) 0%, transparent 50%, rgba(0,0,0,0.03) 100%)',
  },
};

const SURFACE_FILLS: Record<ButtonVariant, string> = {
  primary: 'bg-ember',
  soft: 'bg-[#f98b41]',
  secondary: 'bg-white dark:bg-apple-tile-2',
  ghost: '',
};

export function TactileButton({
  variant = 'primary',
  size = 'lg',
  icon,
  iconPosition = 'left',
  loading = false,
  success = false,
  children,
  className,
  disabled,
  ...props
}: TactileButtonProps) {
  const ref = useRef<HTMLButtonElement>(null);
  const [isHovered, setIsHovered] = useState(false);
  const [isPressed, setIsPressed] = useState(false);

  const vs = VARIANT_STYLES[variant];
  const busy = loading || success;
  const inactive = disabled || loading;

  // Pointer light position (normalized) + spring-smoothed follow.
  const px = useMotionValue(0.5);
  const py = useMotionValue(0.5);
  const lightX = useSpring(px, { stiffness: 150, damping: 15 });
  const lightY = useSpring(py, { stiffness: 150, damping: 15 });
  const lightOpacity = useSpring(0, { stiffness: 200, damping: 20 });

  // Body: rises a breath on hover, sinks 1.5px on press (the keycap press).
  const y = useSpring(0, { stiffness: 420, damping: 24 });
  // Content: drops WITH the press so the label reads pressed, not floated.
  const contentY = useSpring(0, { stiffness: 500, damping: 26 });

  const shadowY = useSpring(0, { stiffness: 200, damping: 20 });
  const shadowOpacity = useSpring(1, { stiffness: 200, damping: 20 });

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    const rect = ref.current?.getBoundingClientRect();
    if (!rect) return;
    px.set((e.clientX - rect.left) / rect.width);
    py.set((e.clientY - rect.top) / rect.height);
  }, [px, py]);

  const handlePointerEnter = useCallback(() => {
    setIsHovered(true);
    lightOpacity.set(1);
    if (!isPressed) {
      shadowY.set(4);
      shadowOpacity.set(1);
    }
  }, [lightOpacity, shadowY, shadowOpacity, isPressed]);

  const handlePointerLeave = useCallback(() => {
    setIsHovered(false);
    lightOpacity.set(0);
    y.set(0);
    contentY.set(0);
    shadowY.set(0);
    shadowOpacity.set(1);
    setIsPressed(false);
  }, [lightOpacity, y, contentY, shadowY, shadowOpacity]);

  const handlePointerDown = useCallback(() => {
    if (inactive) return;
    setIsPressed(true);
    y.set(1.5);
    contentY.set(1.5);
    shadowY.set(0);
    shadowOpacity.set(0.6);
  }, [y, contentY, shadowY, shadowOpacity, inactive]);

  const handlePointerUp = useCallback(() => {
    setIsPressed(false);
    if (isHovered) {
      y.set(-1.5);
      contentY.set(0);
      shadowY.set(4);
      shadowOpacity.set(1);
    } else {
      y.set(0);
      contentY.set(0);
      shadowY.set(0);
      shadowOpacity.set(1);
    }
  }, [y, contentY, shadowY, shadowOpacity, isHovered]);

  const lightGradient = useTransform(
    [lightX, lightY],
    ([lx, ly]: number[]) => `radial-gradient(ellipse at ${lx * 100}% ${ly * 100}%, rgba(255,255,255,0.15) 0%, transparent 55%)`
  );

  const boxShadow = useTransform(
    [shadowY, shadowOpacity],
    ([sy, so]: number[]) => {
      const base = isPressed ? vs.shadowPress : isHovered ? vs.shadowHover : vs.shadowIdle;
      if (variant === 'ghost') return base;
      const spread = Math.round(sy);
      return base + `, 0 ${spread}px ${spread * 3}px rgba(0,0,0,${0.08 * so})`;
    }
  );

  const surfaceFill = SURFACE_FILLS[variant];

  return (
    <motion.button
      ref={ref}
      disabled={inactive}
      aria-busy={loading || undefined}
      className={cn(
        'relative overflow-hidden font-semibold select-none',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-azure-500',
        'transition-[background-color] duration-150',
        SIZE_CLASSES[size],
        vs.base,
        surfaceFill,
        inactive && 'opacity-50 cursor-not-allowed',
        !inactive && 'cursor-pointer',
        className,
      )}
      style={{ y, touchAction: 'manipulation' as const }}
      onPointerMove={handlePointerMove}
      onPointerEnter={handlePointerEnter}
      onPointerLeave={handlePointerLeave}
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      {...props}
    >
      {/* Depth layer: drop shadow + inset bevel/recess */}
      <motion.div
        className="absolute inset-0 rounded-[inherit] pointer-events-none"
        style={{ boxShadow, opacity: shadowOpacity }}
      />

      {/* Surface gradient — light from top, dark from bottom */}
      <div
        className="absolute inset-0 rounded-[inherit] pointer-events-none z-[1]"
        style={{ background: vs.gradient }}
      />

      {/* Top highlight hairline */}
      <div className="absolute inset-x-[2px] top-[1px] h-[1px] bg-gradient-to-r from-transparent via-white/[0.25] to-transparent pointer-events-none z-[2] rounded-t-[inherit]" />

      {/* Bottom grounding hairline */}
      <div className="absolute inset-x-[2px] bottom-[1px] h-[1px] bg-gradient-to-r from-transparent via-black/[0.10] to-transparent pointer-events-none z-[2] rounded-b-[inherit]" />

      {/* Pointer light overlay */}
      <motion.div
        className="absolute inset-0 pointer-events-none z-[3] rounded-[inherit]"
        style={{ background: lightGradient, opacity: lightOpacity }}
      />

      {/* Content — sinks with the press */}
      <motion.span
        className="relative z-10 flex items-center justify-center gap-2 whitespace-nowrap"
        style={{ y: contentY }}
      >
        {(icon || loading || success) && iconPosition === 'left' && (
          <span className="shrink-0 flex items-center justify-center leading-none">
            {loading ? <Loader2 className="w-[1.15em] h-[1.15em] animate-spin" aria-hidden />
              : success ? <Check className="w-[1.15em] h-[1.15em]" strokeWidth={3} aria-hidden />
              : icon}
          </span>
        )}
        <span className="leading-none flex items-center">{children}</span>
        {(icon || loading || success) && iconPosition === 'right' && (
          <span className="shrink-0">
            {loading ? <Loader2 className="w-[1.15em] h-[1.15em] animate-spin" aria-hidden />
              : success ? <Check className="w-[1.15em] h-[1.15em]" strokeWidth={3} aria-hidden />
              : icon}
          </span>
        )}
      </motion.span>
    </motion.button>
  );
}
