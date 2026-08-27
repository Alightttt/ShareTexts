import React, { useRef, useState, useCallback } from 'react';
import { motion, useSpring, useMotionValue, useTransform } from 'motion/react';
import { cn } from '../lib/utils';

// ---------------------------------------------------------------------------
// TactileButton — physically dimensional button
// ---------------------------------------------------------------------------
// Structure (bottom to top):
//   1. Shadow layer — sits below, gives depth
//   2. Base surface — gradient from light (top) to darker (bottom)
//   3. Top highlight — thin bright edge catching light
//   4. Bottom edge — subtle darker edge for grounding
//   5. Pointer light — radial highlight following cursor
//   6. Content layer — text + icons
//
// The 3D illusion comes from:
//   - Light source from ABOVE → top edge bright, bottom edge dark
//   - Gradient surface → lighter at top, subtly darker at bottom
//   - Shadow grows when lifted (hover), tightens when pressed
//   - Content shifts down on press, up on hover
// ---------------------------------------------------------------------------

type ButtonVariant = 'primary' | 'secondary' | 'ghost';
type ButtonSize = 'sm' | 'md' | 'lg';

interface TactileButtonProps {
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: React.ReactNode;
  iconPosition?: 'left' | 'right';
  children: React.ReactNode;
  className?: string;
  disabled?: boolean;
  onClick?: React.MouseEventHandler<HTMLButtonElement>;
  'data-testid'?: string;
  type?: 'button' | 'submit' | 'reset';
}

const SIZE_CLASSES: Record<ButtonSize, string> = {
  sm: 'px-4 py-2 text-[13px] gap-2 rounded-[8px] min-h-[36px]',
  md: 'px-5 py-2.5 text-[14px] gap-2.5 rounded-[10px] min-h-[40px]',
  lg: 'px-7 py-3.5 text-[15px] gap-3.5 rounded-[10px] min-h-[48px]',
};

// Each variant defines its own surface gradient + shadow layers
const VARIANT_STYLES: Record<ButtonVariant, { base: string; shadowIdle: string; shadowHover: string; shadowPress: string; gradient: string }> = {
  primary: {
    base: 'text-white',
    shadowIdle: '0 1px 2px rgba(0,0,0,0.2), 0 4px 12px -2px rgba(139,124,246,0.25)',
    shadowHover: '0 4px 8px rgba(0,0,0,0.15), 0 12px 28px -4px rgba(139,124,246,0.4)',
    shadowPress: '0 1px 2px rgba(0,0,0,0.2), 0 2px 6px -1px rgba(139,124,246,0.15)',
    gradient: 'linear-gradient(135deg, #a78bfa 0%, #8b7cf6 50%, #5a74e8 100%)',
  },
  secondary: {
    base: 'text-[#4c2baa] dark:text-[#7c6be0]',
    shadowIdle: '0 1px 2px rgba(139,124,246,0.08), 0 3px 8px -2px rgba(139,124,246,0.06)',
    shadowHover: '0 4px 8px rgba(139,124,246,0.12), 0 10px 20px -3px rgba(139,124,246,0.15)',
    shadowPress: '0 1px 2px rgba(139,124,246,0.08), 0 2px 4px -1px rgba(139,124,246,0.06)',
    gradient: 'linear-gradient(135deg, #f0f4ff 0%, #e8edff 50%, #e0e7fe 100%)',
  },
  ghost: {
    base: 'bg-transparent text-apple-ink-muted hover:text-apple-ink dark:text-white/50 dark:hover:text-white hover:bg-apple-parchment dark:hover:bg-apple-tile-1',
    shadowIdle: '0 0 0 rgba(0,0,0,0)',
    shadowHover: '0 1px 4px rgba(0,0,0,0.06)',
    shadowPress: '0 0 0 rgba(0,0,0,0)',
    gradient: 'linear-gradient(180deg, rgba(255,255,255,0.08) 0%, transparent 50%, rgba(0,0,0,0.03) 100%)',
  },
};

// Surface fill under the gradient overlay
const SURFACE_FILLS: Record<ButtonVariant, string> = {
  primary: 'bg-azure-600',
  secondary: 'bg-azure-100 dark:bg-azure-600/20',
  ghost: '',
};

export function TactileButton({
  variant = 'primary',
  size = 'lg',
  icon,
  iconPosition = 'left',
  children,
  className,
  disabled,
  ...props
}: TactileButtonProps) {
  const ref = useRef<HTMLButtonElement>(null);
  const [isHovered, setIsHovered] = useState(false);
  const [isPressed, setIsPressed] = useState(false);

  const vs = VARIANT_STYLES[variant];

  // Pointer position for light effect (normalized 0-1 inside button)
  const px = useMotionValue(0.5);
  const py = useMotionValue(0.5);

  // Spring-animated position for smooth light follow
  const lightX = useSpring(px, { stiffness: 150, damping: 15 });
  const lightY = useSpring(py, { stiffness: 150, damping: 15 });

  // Light opacity — fades in on hover, out on leave
  const lightOpacity = useSpring(0, { stiffness: 200, damping: 20 });

  // Y transform — rises on hover, compresses on press (Apple Design §4)
  const y = useSpring(0, { stiffness: 300, damping: 20 });

  // Shadow animation — expanded on hover, tight on press
  const shadowY = useSpring(0, { stiffness: 200, damping: 20 });
  const shadowOpacity = useSpring(0, { stiffness: 200, damping: 20 });

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
  }, [lightOpacity, y, shadowY, shadowOpacity, isPressed]);

  const handlePointerLeave = useCallback(() => {
    setIsHovered(false);
    lightOpacity.set(0);
    y.set(0);
    shadowY.set(0);
    shadowOpacity.set(0);
    setIsPressed(false);
  }, [lightOpacity, y, shadowY, shadowOpacity]);

  const handlePointerDown = useCallback(() => {
    setIsPressed(true);
    y.set(1);
    shadowY.set(0);
    shadowOpacity.set(0.5);
  }, [y, shadowY, shadowOpacity]);

  const handlePointerUp = useCallback(() => {
    setIsPressed(false);
    if (isHovered) {
      y.set(-2);
      shadowY.set(4);
      shadowOpacity.set(1);
    } else {
      y.set(0);
      shadowY.set(0);
      shadowOpacity.set(0);
    }
  }, [y, shadowY, shadowOpacity, isHovered]);

  // Pointer light gradient
  const lightGradient = useTransform(
    [lightX, lightY],
    ([lx, ly]: number[]) => `radial-gradient(ellipse at ${lx * 100}% ${ly * 100}%, rgba(255,255,255,0.15) 0%, transparent 55%)`
  );

  // Compose shadow from spring values
  const boxShadow = useTransform(
    [shadowY, shadowOpacity],
    ([sy, so]: number[]) => {
      const base = isPressed ? vs.shadowPress : isHovered ? vs.shadowHover : vs.shadowIdle;
      if (variant === 'ghost') return base;
      // Interpolate shadow spread based on elevation
      const spread = Math.round(sy);
      return base + `, 0 ${spread}px ${spread * 3}px rgba(0,0,0,${0.08 * so})`;
    }
  );

  const surfaceFill = SURFACE_FILLS[variant];

  return (
    <motion.button
      ref={ref}
      disabled={disabled}
      className={cn(
        'relative overflow-hidden font-semibold select-none',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-azure-500',
        'transition-[background-color] duration-150',
        SIZE_CLASSES[size],
        vs.base,
        surfaceFill,
        disabled && 'opacity-50 cursor-not-allowed',
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
      {/* Shadow layer — sits behind the button, gives it physical depth */}
      <motion.div
        className="absolute inset-0 rounded-[inherit] pointer-events-none"
        style={{
          boxShadow,
          opacity: shadowOpacity,
        }}
      />

      {/* Surface gradient — light from top, dark from bottom = 3D */}
      <div
        className="absolute inset-0 rounded-[inherit] pointer-events-none z-[1]"
        style={{ background: vs.gradient }}
      />

      {/* Top highlight — thin bright edge where light catches */}
      <div className="absolute inset-x-[2px] top-[1px] h-[1px] bg-gradient-to-r from-transparent via-white/[0.2] to-transparent pointer-events-none z-[2] rounded-t-[inherit]" />

      {/* Bottom edge — subtle darker line for grounding */}
      <div className="absolute inset-x-[2px] bottom-[1px] h-[1px] bg-gradient-to-r from-transparent via-black/[0.08] to-transparent pointer-events-none z-[2] rounded-b-[inherit]" />

      {/* Pointer light overlay — follows cursor inside button */}
      <motion.div
        className="absolute inset-0 pointer-events-none z-[3] rounded-[inherit]"
        style={{
          background: lightGradient,
          opacity: lightOpacity,
        }}
      />

      {/* Content layer */}
      <span className="relative z-10 flex items-center justify-center gap-2 whitespace-nowrap">
        {icon && iconPosition === 'left' && (
          <span className="shrink-0 flex items-center justify-center leading-none">
            {icon}
          </span>
        )}
        <span className="leading-none flex items-center">{children}</span>
        {icon && iconPosition === 'right' && (
          <span className="shrink-0">
            {icon}
          </span>
        )}
      </span>
    </motion.button>
  );
}
