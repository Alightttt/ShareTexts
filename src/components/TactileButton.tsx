import React, { useRef, useState, useCallback } from 'react';
import { motion, useSpring, useMotionValue } from 'motion/react';
import { cn } from '../lib/utils';

// ---------------------------------------------------------------------------
// TactileButton — physically responsive button
// ---------------------------------------------------------------------------
// Structure:
//   base surface → subtle border → top highlight → depth/shadow → content
//
// States:
//   idle    — subtle depth, soft shadow, quiet gradient
//   hover   — rises ~2px, shadow expands, icon shifts
//   press   — compresses ~2px, shadow tightens, content shifts down
//   release — spring return
//
// Pointer light: radial highlight following cursor inside the button.
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
  sm: 'px-4 py-2 text-[13px] gap-1.5 rounded-[8px]',
  md: 'px-5 py-2.5 text-[14px] gap-2 rounded-[10px]',
  lg: 'px-6 py-3 text-[15px] gap-2 rounded-[10px]',
};

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary: cn(
    'bg-azure-600 text-white',
    'shadow-[0_1px_2px_rgba(0,0,0,0.15),0_4px_12px_-2px_rgba(10,102,240,0.25),inset_0_1px_0_rgba(255,255,255,0.15)]',
    'hover:shadow-[0_2px_4px_rgba(0,0,0,0.15),0_8px_20px_-2px_rgba(10,102,240,0.3),inset_0_1px_0_rgba(255,255,255,0.2)]',
  ),
  secondary: cn(
    'bg-apple-ink text-white dark:bg-white dark:text-night-900',
    'shadow-[0_1px_2px_rgba(0,0,0,0.1),inset_0_1px_0_rgba(255,255,255,0.08)]',
    'dark:shadow-[0_1px_2px_rgba(0,0,0,0.2),inset_0_1px_0_rgba(255,255,255,0.1)]',
    'hover:shadow-[0_2px_4px_rgba(0,0,0,0.12),inset_0_1px_0_rgba(255,255,255,0.1)]',
  ),
  ghost: cn(
    'bg-transparent text-apple-ink-muted hover:text-apple-ink dark:text-white/50 dark:hover:text-white',
    'hover:bg-apple-parchment dark:hover:bg-apple-tile-1',
  ),
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
  const [isPressed, setIsPressed] = useState(false);
  const [isHovered, setIsHovered] = useState(false);

  // Pointer position for light effect (normalized 0-1 inside button)
  const px = useMotionValue(0.5);
  const py = useMotionValue(0.5);

  // Spring-animated position for smooth light follow
  const lightX = useSpring(px, { stiffness: 150, damping: 15 });
  const lightY = useSpring(py, { stiffness: 150, damping: 15 });

  // Light opacity — fades in on hover, out on leave
  const lightOpacity = useSpring(0, { stiffness: 200, damping: 20 });

  // Y transform — rises on hover, compresses on press
  const y = useSpring(0, { stiffness: 300, damping: 20 });

  // Scale — very subtle
  const scale = useSpring(1, { stiffness: 400, damping: 25 });

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    const rect = ref.current?.getBoundingClientRect();
    if (!rect) return;
    px.set((e.clientX - rect.left) / rect.width);
    py.set((e.clientY - rect.top) / rect.height);
  }, [px, py]);

  const handlePointerEnter = useCallback(() => {
    setIsHovered(true);
    lightOpacity.set(1);
    if (!isPressed) y.set(-2);
  }, [lightOpacity, y, isPressed]);

  const handlePointerLeave = useCallback(() => {
    setIsHovered(false);
    lightOpacity.set(0);
    y.set(0);
    setIsPressed(false);
  }, [lightOpacity, y]);

  const handlePointerDown = useCallback(() => {
    setIsPressed(true);
    y.set(1);
    scale.set(0.98);
  }, [y, scale]);

  const handlePointerUp = useCallback(() => {
    setIsPressed(false);
    if (isHovered) y.set(-2);
    else y.set(0);
    scale.set(1);
  }, [y, scale, isHovered]);

  // Light gradient — computed from spring-animated pointer position
  const [gradient, setGradient] = useState('radial-gradient(circle at 50% 50%, rgba(255,255,255,0) 0%, transparent 60%)');

  // Update gradient when pointer moves
  React.useEffect(() => {
    const unsubX = lightX.on('change', () => {
      const lx = lightX.get();
      const ly = lightY.get();
      setGradient(`radial-gradient(circle at ${lx * 100}% ${ly * 100}%, rgba(255,255,255,0.12) 0%, transparent 60%)`);
    });
    return unsubX;
  }, [lightX, lightY]);

  return (
    <motion.button
      ref={ref}
      disabled={disabled}
      className={cn(
        'relative overflow-hidden font-semibold select-none',
        'transition-colors duration-150',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-azure-500',
        SIZE_CLASSES[size],
        VARIANT_CLASSES[variant],
        disabled && 'opacity-50 cursor-not-allowed',
        className,
      )}
      style={{ y, scale }}
      onPointerMove={handlePointerMove}
      onPointerEnter={handlePointerEnter}
      onPointerLeave={handlePointerLeave}
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      {...props}
    >
      {/* Pointer light overlay */}
      <motion.div
        className="absolute inset-0 pointer-events-none z-10 rounded-[inherit]"
        style={{
          background: gradient,
          opacity: lightOpacity,
        }}
      />

      {/* Top highlight — catches light */}
      <div className="absolute inset-x-0 top-0 h-[1px] bg-gradient-to-r from-transparent via-white/[0.12] to-transparent pointer-events-none z-10 rounded-t-[inherit]" />

      {/* Content layer */}
      <span className="relative z-20 flex items-center justify-center">
        {icon && iconPosition === 'left' && (
          <motion.span
            className="shrink-0"
            animate={isHovered ? { x: 1 } : { x: 0 }}
            transition={{ type: 'spring', stiffness: 300, damping: 20 }}
          >
            {icon}
          </motion.span>
        )}
        {children}
        {icon && iconPosition === 'right' && (
          <motion.span
            className="shrink-0"
            animate={isHovered ? { x: 1 } : { x: 0 }}
            transition={{ type: 'spring', stiffness: 300, damping: 20 }}
          >
            {icon}
          </motion.span>
        )}
      </span>
    </motion.button>
  );
}
