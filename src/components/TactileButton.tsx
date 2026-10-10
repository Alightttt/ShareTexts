import React, { useRef, useState, useCallback } from 'react';
import { motion, useSpring, useMotionValue, useTransform } from 'motion/react';
import { Check } from 'lucide-react';
import { SpinLoader } from './SpinLoader';
import { cn } from '../lib/utils';

// ---------------------------------------------------------------------------
// TactileButton — OpenSourceUI's ThreeDButton, wearing ShareTexts colors.
// ---------------------------------------------------------------------------
// The component is a port of opensourceui.in/components/three-d-button (the
// real `ThreeDButton` source, restyled). What was adopted verbatim is the
// press ANATOMY — the part that makes it feel physical:
//
//   · The key never translates. Pressing does not move the body; the SHADOW
//     inverts. Drop shadows compress to almost nothing and inset bevels
//     flip from a top-lit rim to a recess — the same "key sinking into a
//     board" read the original gets, with zero layout cost.
//   · Soft diffused light, no hard rim. The original's comment is explicit:
//     "Soft diffused top light + bottom shade — no hard white rim." Inset
//     highlights are 2px-blurred (rgba .14–.40), not 1px hairlines.
//   · One easing curve for the whole material:
//     cubic-bezier(0.32, 0.72, 0, 1) over 200ms — the original's exact curve.
//
// What stays ShareTexts: the pill silhouette (rounded-full, unchanged), the
// brand colors (ember primary #f06413, soft ember #f98b41), the pointer
// light, the loading/success states, and the 40px+ touch contract.
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
  /** Renders an <a> instead of a <button> — same anatomy, navigates. */
  href?: string;
  children: React.ReactNode;
  className?: string;
  disabled?: boolean;
  onClick?: React.MouseEventHandler<HTMLButtonElement>;
  'data-testid'?: string;
  type?: 'button' | 'submit' | 'reset';
}

const SIZE_CLASSES: Record<ButtonSize, string> = {
  sm: 'px-4 py-2 text-[13px] gap-2 rounded-full min-h-[var(--st-control-sm)]',
  md: 'px-5 py-2.5 text-[14px] gap-2.5 rounded-full min-h-[var(--st-control-md)]',
  lg: 'px-7 py-3.5 text-[15px] gap-3 rounded-full min-h-[var(--st-control-lg)]',
};

// The ThreeDButton bevel recipes, retinted per variant. Solid brand keys use
// the original's dark-key recipe (deep drop + dark bottom recess + tight top
// sheen); paper keys use its light-key recipe (ambient drop + bright top
// lip + bottom shade). Pressed states are the original's PRESSED recipes
// with the tint swapped. All rgba — dark mode needs no variants because
// shadows sit on the surface, not in it.
const VARIANT_STYLES: Record<ButtonVariant, { base: string; shadowIdle: string; shadowHover: string; shadowPress: string; gradient: string }> = {
  primary: {
    base: 'text-white',
    // Dark-key recipe on ember: 0.30/0.25/0.18 drop ladder, 2px top sheen,
    // 3px/6px dark-ember bottom recess (the original uses neutral black).
    shadowIdle: '0 1px 1px rgba(0,0,0,0.30), 0 3px 6px rgba(240,100,19,0.22), 0 8px 16px rgba(0,0,0,0.16), inset 0 1px 2px rgba(255,255,255,0.30), inset 0 -3px 6px rgba(120,42,3,0.45)',
    shadowHover: '0 1px 1px rgba(0,0,0,0.30), 0 4px 8px rgba(240,100,19,0.26), 0 12px 22px rgba(0,0,0,0.19), inset 0 1px 2px rgba(255,255,255,0.34), inset 0 -3px 6px rgba(120,42,3,0.42)',
    shadowPress: '0 1px 2px rgba(0,0,0,0.20), inset 0 2px 6px rgba(96,34,2,0.50), inset 0 -1px 1px rgba(255,255,255,0.10)',
    gradient: 'var(--st-btn-primary-grad)',
  },
  soft: {
    // Brand look (approved): white label on the warm soft-ember key. The
    // ratio is a named, recorded exception in verify-quality — not hidden.
    base: 'text-white',
    // Light-key recipe lifted onto the soft-ember surface: the original's
    // neutral drop ladder warms slightly so the key sits on the page.
    shadowIdle: '0 1px 1px rgba(0,0,0,0.08), 0 2px 4px rgba(0,0,0,0.10), 0 6px 12px rgba(240,100,19,0.16), inset 0 1px 2px rgba(255,255,255,0.40), inset 0 -2px 4px rgba(130,48,5,0.26)',
    shadowHover: '0 1px 1px rgba(0,0,0,0.08), 0 3px 6px rgba(0,0,0,0.11), 0 9px 18px rgba(240,100,19,0.20), inset 0 1px 2px rgba(255,255,255,0.44), inset 0 -2px 4px rgba(130,48,5,0.22)',
    shadowPress: '0 1px 1px rgba(0,0,0,0.05), inset 0 1px 2px rgba(112,42,3,0.26), inset 0 2px 4px rgba(112,42,3,0.12), inset 0 -1px 2px rgba(0,0,0,0.10)',
    gradient: 'var(--st-btn-soft-grad)',
  },
  secondary: {
    base: 'text-apple-ink dark:text-white',
    // The original's BEVEL_LIGHT / PRESSED_LIGHT, verbatim.
    shadowIdle: '0 1px 1px rgba(0,0,0,0.08), 0 2px 4px rgba(0,0,0,0.10), 0 6px 12px rgba(0,0,0,0.08), inset 0 1px 2px rgba(255,255,255,0.35), inset 0 -2px 4px rgba(0,0,0,0.08)',
    shadowHover: '0 1px 1px rgba(0,0,0,0.08), 0 3px 6px rgba(0,0,0,0.11), 0 9px 18px rgba(0,0,0,0.10), inset 0 1px 2px rgba(255,255,255,0.40), inset 0 -2px 4px rgba(0,0,0,0.07)',
    shadowPress: '0 1px 1px rgba(0,0,0,0.05), inset 0 1px 2px rgba(0,0,0,0.08), inset 0 2px 4px rgba(0,0,0,0.04), inset 0 -1px 2px rgba(0,0,0,0.05)',
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
  // Deepened from bg-ember: white labels on bright ember (3.2:1 light /
  // 2.65:1 dark remap) fail WCAG at label sizes; the token clears 4.5:1
  // with white in BOTH themes (bright brand ember stays in icons/links/
  // artwork, where the 3:1 graphic rule applies).
  primary: 'bg-ember',
  soft: 'bg-azure-500',
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
  href,
  children,
  className,
  disabled,
  ...props
}: TactileButtonProps) {
  const ref = useRef<HTMLButtonElement>(null);
  const [isHovered, setIsHovered] = useState(false);
  const [isPressed, setIsPressed] = useState(false);

  const vs = VARIANT_STYLES[variant];
  const inactive = disabled || loading;

  // Pointer light position (normalized) + spring-smoothed follow.
  const px = useMotionValue(0.5);
  const py = useMotionValue(0.5);
  const lightX = useSpring(px, { stiffness: 150, damping: 15 });
  const lightY = useSpring(py, { stiffness: 150, damping: 15 });
  const lightOpacity = useSpring(0, { stiffness: 200, damping: 20 });

  // The key body NEVER translates (ThreeDButton anatomy). Only the content
  // settles 1px on press, so the label reads seated in the recess.
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
      shadowY.set(5);
      shadowOpacity.set(1);
    }
  }, [lightOpacity, shadowY, shadowOpacity, isPressed]);

  const handlePointerLeave = useCallback(() => {
    setIsHovered(false);
    lightOpacity.set(0);
    contentY.set(0);
    shadowY.set(0);
    shadowOpacity.set(1);
    setIsPressed(false);
  }, [lightOpacity, contentY, shadowY, shadowOpacity]);

  const handlePointerDown = useCallback(() => {
    if (inactive) return;
    setIsPressed(true);
    contentY.set(1);
    shadowY.set(0);
    shadowOpacity.set(0.92);
  }, [contentY, shadowY, shadowOpacity, inactive]);

  const handlePointerUp = useCallback(() => {
    setIsPressed(false);
    if (isHovered) {
      contentY.set(0);
      shadowY.set(5);
      shadowOpacity.set(1);
    } else {
      contentY.set(0);
      shadowY.set(0);
      shadowOpacity.set(1);
    }
  }, [contentY, shadowY, shadowOpacity, isHovered]);

  const lightGradient = useTransform(
    [lightX, lightY],
    ([lx, ly]: number[]) => `radial-gradient(ellipse at ${lx * 100}% ${ly * 100}%, rgba(255,255,255,0.15) 0%, transparent 55%)`
  );

  // The in-flight spinner tints with its surface: white on the colored
  // keycaps, ember on the paper ones — never orange-on-orange.
  const spinnerClass = variant === 'primary' || variant === 'soft' ? 'text-white' : 'text-ember dark:text-azure-400';

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
  // Links and buttons share one anatomy: an href renders an anchor with the
  // identical depth system, so CTA cards never ship a second button style.
  const Comp: React.ElementType = href ? motion.a : motion.button;

  return (
    <Comp
      ref={ref as React.Ref<any>}
      {...(href ? { href } : { disabled: inactive })}
      aria-busy={loading || undefined}
      className={cn(
        'relative overflow-hidden font-semibold select-none',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-azure-500',
        'transition-[background-color] duration-200 ease-[cubic-bezier(0.32,0.72,0,1)]',
        SIZE_CLASSES[size],
        vs.base,
        surfaceFill,
        inactive && 'opacity-50 cursor-not-allowed',
        !inactive && 'cursor-pointer',
        className,
      )}
      style={{ touchAction: 'manipulation' as const }}
      onPointerMove={handlePointerMove}
      onPointerEnter={handlePointerEnter}
      onPointerLeave={handlePointerLeave}
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      {...props}
    >
      {/* Depth layer: the ThreeD bevel — drop ladder + inset rim/recess */}
      <motion.div
        className="absolute inset-0 rounded-[inherit] pointer-events-none"
        style={{ boxShadow, opacity: shadowOpacity }}
      />

      {/* Surface gradient — light from top, dark from bottom */}
      <div
        className="absolute inset-0 rounded-[inherit] pointer-events-none z-[1]"
        style={{ background: vs.gradient }}
      />

      {/* Bottom grounding hairline */}
      <div className="absolute inset-x-[2px] bottom-[1px] h-[1px] bg-gradient-to-r from-transparent via-black/[0.10] to-transparent pointer-events-none z-[2] rounded-b-[inherit]" />

      {/* Pointer light overlay */}
      <motion.div
        className="absolute inset-0 pointer-events-none z-[3] rounded-[inherit]"
        style={{ background: lightGradient, opacity: lightOpacity }}
      />

      {/* Content — settles 1px into the recess on press */}
      <motion.span
        className="relative z-10 flex items-center justify-center gap-2 whitespace-nowrap"
        style={{ y: contentY }}
      >
        {(icon || loading || success) && iconPosition === 'left' && (
          <span className="shrink-0 flex items-center justify-center leading-none">
            {loading ? <SpinLoader size={Math.round(1.15 * 16)} className={spinnerClass} aria-hidden />
              : success ? <Check className="w-[1.15em] h-[1.15em]" strokeWidth={3} aria-hidden />
              : icon}
          </span>
        )}
        <span className="leading-none flex items-center">{children}</span>
        {(icon || loading || success) && iconPosition === 'right' && (
          <span className="shrink-0">
            {loading ? <SpinLoader size={Math.round(1.15 * 16)} className={spinnerClass} aria-hidden />
              : success ? <Check className="w-[1.15em] h-[1.15em]" strokeWidth={3} aria-hidden />
              : icon}
          </span>
        )}
      </motion.span>
    </Comp>
  );
}
