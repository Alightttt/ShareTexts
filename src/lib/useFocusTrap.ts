/**
 * useFocusTrap — traps keyboard focus inside a container element.
 *
 * Usage:
 *   const trapRef = useFocusTrap(isOpen);
 *   <div ref={trapRef} role="dialog" aria-modal="true">...</div>
 *
 * Behavior:
 * - When isOpen becomes true, focuses the first focusable element
 * - Tab cycles within the container
 * - Shift+Tab cycles within the container
 * - Escape calls onClose (if provided)
 * - When isOpen becomes false, restores focus to the previously focused element
 */
import React, { useEffect, useRef } from 'react';

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function useFocusTrap(
  isOpen: boolean,
  onClose?: () => void,
): React.RefObject<HTMLDivElement | null> {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  // Save the element that had focus before the dialog opened
  useEffect(() => {
    if (isOpen) {
      previousFocusRef.current = document.activeElement as HTMLElement;
    }
  }, [isOpen]);

  // Focus management
  useEffect(() => {
    if (!isOpen || !containerRef.current) return;

    const container = containerRef.current;

    // Focus the first focusable element after a tick (allows DOM to settle)
    const timer = setTimeout(() => {
      const focusable = container.querySelectorAll<HTMLElement>(FOCUSABLE);
      if (focusable.length > 0) {
        focusable[0].focus();
      }
    }, 50);

    // Trap Tab
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Tab') {
        const focusable = container.querySelectorAll<HTMLElement>(FOCUSABLE);
        if (focusable.length === 0) return;

        const first = focusable[0];
        const last = focusable[focusable.length - 1];

        if (e.shiftKey) {
          if (document.activeElement === first) {
            e.preventDefault();
            last.focus();
          }
        } else {
          if (document.activeElement === last) {
            e.preventDefault();
            first.focus();
          }
        }
      }

      if (e.key === 'Escape' && onClose) {
        e.preventDefault();
        onClose();
      }
    };

    container.addEventListener('keydown', onKeyDown);

    return () => {
      clearTimeout(timer);
      container.removeEventListener('keydown', onKeyDown);
    };
  }, [isOpen, onClose]);

  // Restore focus when dialog closes
  useEffect(() => {
    return () => {
      if (!isOpen && previousFocusRef.current) {
        previousFocusRef.current.focus();
        previousFocusRef.current = null;
      }
    };
  }, [isOpen]);

  return containerRef;
}
