import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Image as ImageIcon, File as FileIcon, Video as VideoIcon, Music } from 'lucide-react';
import { cn } from '../lib/utils';
import { useI18n } from '../lib/i18n';

// Escape closes the menu; re-focuses the + button so keyboard users stay put.
function useEscapeToClose(isOpen: boolean, onClose: () => void, triggerRef: React.RefObject<HTMLButtonElement | null>) {
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
        triggerRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose, triggerRef]);
}

type PanelMode = 'closed' | 'menu';

interface AttachmentPanelProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectType: (type: 'image' | 'file' | 'video' | 'audio') => void;
  buttonRef: React.RefObject<HTMLButtonElement | null>;
}

/**
 * The attachment menu — deliberately simple, and RELIABLE.
 *
 * Opens with a short fade + 6px rise, closes with a short fade + 4px drop.
 * A transparent backdrop catches outside taps so mobile users can dismiss
 * with one touch anywhere.
 *
 * Two hard-won reliability rules (the "tapping + does nothing" mobile bug):
 *
 *  1. The menu mounts IMMEDIATELY with `isOpen` — it is anchored with pure
 *     CSS to the composer row (absolute, above the + button), never with a
 *     getBoundingClientRect measured in a follow-up effect. The old flow
 *     needed a second render to compute the rect; the same tap's synthetic
 *     click closed the panel before that render ever committed, so the menu
 *     never appeared at all.
 *
 *  2. The backdrop's dismiss handler is ARMED only after the opening
 *     gesture has fully ended (settle delay). The pointerdown that opens
 *     the menu is followed by a synthetic click that lands on the freshly
 *     mounted backdrop in several mobile browsers — an un-armed backdrop
 *     swallowed the menu 16ms after it opened.
 */
export function AttachmentPanel({ isOpen, onClose, onSelectType, buttonRef }: AttachmentPanelProps) {
  const { t } = useI18n();
  useEscapeToClose(isOpen, onClose, buttonRef);

  // Dismiss arming: ignore every pointer event until `SETTLE_MS` after the
  // menu opened — that window contains the opening gesture's own synthetic
  // click. After it, one touch anywhere closes the menu.
  const armedRef = useRef(false);
  useEffect(() => {
    if (!isOpen) { armedRef.current = false; return; }
    const SETTLE_MS = 400;
    const t = setTimeout(() => { armedRef.current = true; }, SETTLE_MS);
    return () => clearTimeout(t);
  }, [isOpen]);
  const dismiss = useCallback(() => { if (armedRef.current) onClose(); }, [onClose]);

  const handleSelect = (type: 'image' | 'file' | 'video' | 'audio') => {
    onSelectType(type);
    onClose();
  };

  return (
    <>
      {/* Transparent backdrop — catches outside taps/clicks to close. */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.12 }}
            className="fixed inset-0 z-40"
            onClick={dismiss}
            onPointerDown={dismiss}
          />
        )}
      </AnimatePresence>

      {/* The menu — anchored with CSS to the composer row, so it mounts on
          the very render that flips `isOpen`. The + button (z-[45] while
          open) keeps the row's stacking context above the backdrop. */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            role="menu"
            aria-label={t('attach.add')}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 4 }}
            transition={{ duration: 0.16, ease: [0.23, 1, 0.32, 1] }}
            className="absolute bottom-[calc(100%+8px)] left-0 z-50 min-w-[210px] p-1.5 bg-white dark:bg-[#232327] border border-black/[0.08] dark:border-white/[0.08] shadow-[0_12px_40px_-12px_rgba(0,0,0,0.28)] rounded-[18px] overflow-hidden"
          >
            <MenuItem
              icon={<ImageIcon className="w-[18px] h-[18px]" />}
              label={t('attach.photos')}
              onClick={() => handleSelect('image')}
              delay={0}
            />
            <MenuItem
              icon={<VideoIcon className="w-[18px] h-[18px]" />}
              label={t('attach.video')}
              onClick={() => handleSelect('video')}
              delay={0.02}
            />
            <MenuItem
              icon={<Music className="w-[18px] h-[18px]" />}
              label={t('attach.audio')}
              onClick={() => handleSelect('audio')}
              delay={0.04}
            />
            <MenuItem
              icon={<FileIcon className="w-[18px] h-[18px]" />}
              label={t('attach.files')}
              onClick={() => handleSelect('file')}
              delay={0.06}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

interface MenuItemProps {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  delay?: number;
}

function MenuItem({ icon, label, onClick, delay = 0 }: MenuItemProps) {
  return (
    <motion.button
      role="menuitem"
      type="button"
      initial={{ opacity: 0, y: 3 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.14 }}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      onPointerDown={(e) => e.stopPropagation()}
      className={cn(
        "w-full flex items-center gap-3 px-3 py-2.5 min-h-[44px] rounded-[12px] group/menuitem",
        "hover:bg-black/[0.05] dark:hover:bg-white/[0.06]",
        "transition-colors duration-150 text-left"
      )}
    >
      <span className="w-8 h-8 rounded-full bg-black/[0.05] dark:bg-white/[0.08] flex items-center justify-center text-apple-ink dark:text-white/85 shrink-0">
        {icon}
      </span>
      <span className="text-[14px] font-semibold text-apple-ink dark:text-white">{label}</span>
    </motion.button>
  );
}
