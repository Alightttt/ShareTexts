import React, { useRef, useState, useCallback } from 'react';
import { motion, useMotionValue, animate } from 'motion/react';
import { cn } from '../lib/utils';

/**
 * Wide iOS switch — the reference image, exactly.
 *
 *   Track   wide pill (72×36 at md), iOS system green when on,
 *           quiet neutral when off. No icons — the knob is plain white.
 *   Knob    large white circle that nearly fills the track height,
 *           with the real UISwitch travel and a landing squish.
 *   Drag    press and slide — commits past the halfway point, exactly
 *           like UISwitch. A plain click also works.
 *
 * Reduced motion: the spring collapses to a 120ms fade-slide, no squish.
 */

const TRACK_W = 72;
const TRACK_H = 36;
const KNOB = 30;
const PADDING = 3;

export function IOSToggle({
  checked,
  onToggle,
  size = 'md',
  className,
  label,
}: {
  checked: boolean;
  onToggle: () => void;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  /** Accessible name announced by assistive tech. */
  label?: string;
}) {
  // sm/md/lg scale the wide recipe proportionally.
  const dims =
    size === 'sm' ? { w: 60, h: 30, knob: 24, pad: 3 } :
    size === 'lg' ? { w: 84, h: 42, knob: 36, pad: 3 } :
    { w: TRACK_W, h: TRACK_H, knob: KNOB, pad: PADDING };
  const travel = dims.w - dims.knob - dims.pad * 2;

  const reduce = typeof window !== 'undefined'
    ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
    : false;

  // Drag state: knob x follows the finger while pressed.
  const [dragging, setDragging] = useState(false);
  const dragStartX = useRef(0);
  const dragBase = useRef(0);
  const moved = useRef(false);
  const x = useMotionValue(checked ? travel : 0);

  const spring = reduce
    ? { duration: 0.12, ease: 'easeOut' as const }
    : { type: 'spring' as const, stiffness: 500, damping: 30 };

  const commit = useCallback((next: boolean) => {
    animate(x, next ? travel : 0, spring);
    onToggle();
  }, [x, travel, onToggle, spring]);

  const handleClick = () => {
    // A drag that crossed the halfway line already committed on release.
    if (moved.current) { moved.current = false; return; }
    commit(!checked);
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    setDragging(true);
    moved.current = false;
    dragStartX.current = e.clientX;
    dragBase.current = x.get();
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragging) return;
    const dx = e.clientX - dragStartX.current;
    if (Math.abs(dx) > 3) moved.current = true;
    const next = Math.max(0, Math.min(travel, dragBase.current + dx));
    x.set(next);
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragging) return;
    setDragging(false);
    if (!moved.current) return; // click handler finishes the job
    moved.current = false;
    const final = x.get();
    const next = final > travel / 2;
    if (next !== checked) {
      commit(next);
    } else {
      animate(x, checked ? travel : 0, spring);
    }
  };

  // Track color: iOS system green when on; quiet neutral when off. A flat
  // fill is what iOS itself uses for the off state.
  const trackBg = checked
    ? 'linear-gradient(180deg, #35d458 0%, #30c94f 100%)'
    : 'rgba(120,120,128,0.32)';

  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label || 'Toggle theme'}
      onClick={handleClick}
      className={cn(
        'relative shrink-0 cursor-pointer select-none touch-none',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ember',
        'active:scale-[0.97] transition-transform duration-100',
        className
      )}
      style={{ width: dims.w, height: dims.h, background: 'transparent', border: 'none', padding: 0 }}
    >
      {/* Track — the switch's visual body, inset like a recessed groove */}
      <div
        aria-hidden
        className="absolute inset-0 rounded-full transition-[background] duration-200"
        style={{
          background: trackBg,
          boxShadow: checked
            ? 'inset 0 1px 3px rgba(0,0,0,0.12)'
            : 'inset 0 1px 3px rgba(0,0,0,0.08), inset 0 0 0 0.5px rgba(0,0,0,0.04)',
        }}
        // Pointer events live on the track too so a press anywhere toggles,
        // but the knob's drag handlers are the interactive layer.
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      />
      {/* Knob — the plain white circle. The wrapper owns position; the inner
          div owns the landing squish so scaleX never skews the position. */}
      <motion.div
        aria-hidden
        className="absolute rounded-full"
        style={{
          top: dims.pad,
          left: 0,
          width: dims.knob,
          height: dims.knob,
          x,
        }}
        animate={{ x: dragging ? x.get() : (checked ? travel : 0) }}
        transition={spring}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      >
        <motion.div
          className="w-full h-full rounded-full"
          style={{
            background: 'linear-gradient(180deg, #ffffff 0%, #f2f2f4 100%)',
            boxShadow: '0 3px 8px rgba(0,0,0,0.18), 0 1px 1px rgba(0,0,0,0.16), inset 0 0.5px 0 rgba(255,255,255,0.9)',
            originX: 0.5,
          }}
          animate={dragging ? { scaleX: 1.15, scaleY: 0.92 } : { scaleX: 1, scaleY: 1 }}
          transition={reduce ? { duration: 0.12 } : { type: 'spring', stiffness: 500, damping: 26 }}
        />
      </motion.div>
    </button>
  );
}
