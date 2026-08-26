import React from 'react';
import { motion } from 'motion/react';
import { cn } from '../lib/utils';

export function IOSToggle({
  checked,
  onToggle,
  size = 'md',
  className,
}: {
  checked: boolean;
  onToggle: () => void;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}) {
  const dims =
    size === 'sm' ? { w: 42, h: 26, knob: 22, travel: 16 } :
    size === 'lg' ? { w: 56, h: 34, knob: 28, travel: 22 } :
    { w: 48, h: 30, knob: 24, travel: 18 };

  return (
    <button
      role="switch"
      aria-checked={checked}
      aria-label="Toggle theme"
      onClick={onToggle}
      className={cn(
        'relative shrink-0 rounded-full transition-colors duration-200 ease-out',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7c5bf0]',
        className
      )}
      style={{
        width: dims.w,
        height: dims.h,
        backgroundColor: checked ? '#7c5bf0' : '#e0e0e5',
        padding: 2,
      }}
    >
      <motion.div
        className="rounded-full shadow-sm"
        style={{
          width: dims.knob,
          height: dims.knob,
          backgroundColor: '#ffffff',
        }}
        animate={{ x: checked ? dims.travel : 0 }}
        transition={{ type: 'spring', stiffness: 500, damping: 35 }}
      />
    </button>
  );
}
