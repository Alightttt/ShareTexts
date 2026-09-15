import React, { useState, useEffect } from 'react';
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
 * The attachment menu — deliberately simple.
 *
 * Opens with a short fade + 6px rise, closes with a short fade + 4px drop.
 * No morph, no scale-from-button, no bounce. A transparent backdrop catches
 * outside taps so mobile users can dismiss with one touch anywhere.
 */
export function AttachmentPanel({ isOpen, onClose, onSelectType, buttonRef }: AttachmentPanelProps) {
  const { t } = useI18n();
  const [buttonRect, setButtonRect] = useState<DOMRect | null>(null);
  useEscapeToClose(isOpen, onClose, buttonRef);

  useEffect(() => {
    if (isOpen && buttonRef.current) {
      setButtonRect(buttonRef.current.getBoundingClientRect());
    }
  }, [isOpen, buttonRef]);

  const handleSelect = (type: 'image' | 'file' | 'video' | 'audio') => {
    onSelectType(type);
    onClose();
  };

  // Position above the + button (fixed, aligned to its left edge).
  const panelStyle = buttonRect ? {
    position: 'fixed' as const,
    left: Math.max(12, buttonRect.left),
    bottom: window.innerHeight - buttonRect.top + 8,
    zIndex: 50,
  } : {};

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
            onClick={onClose}
            onPointerDown={onClose}
          />
        )}
      </AnimatePresence>

      {/* The menu */}
      <AnimatePresence>
        {isOpen && buttonRect && (
          <motion.div
            role="menu"
            aria-label={t('attach.add')}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 4 }}
            transition={{ duration: 0.16, ease: [0.23, 1, 0.32, 1] }}
            style={panelStyle}
            className="bg-white dark:bg-[#232327] border border-black/[0.08] dark:border-white/[0.08] shadow-[0_12px_40px_-12px_rgba(0,0,0,0.28)] rounded-[18px] overflow-hidden min-w-[210px] p-1.5"
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
