import React, { useState, useRef, useCallback, useEffect } from 'react';
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
 * Morphing attachment panel inspired by ChatGPT's attachment flow.
 * 
 * This is a visual overlay that morphs from the `+` button position.
 * File selection is delegated to the parent (ChatView) via onSelectType.
 * 
 * Flow:
 * 1. Click `+` → panel morphs from button circle to menu
 * 2. Menu shows Photos/Files options
 * 3. Select option → calls onSelectType, parent opens native file picker
 * 4. Panel closes automatically
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
  
  const handleSelect = useCallback((type: 'image' | 'file') => {
    onSelectType(type);
    onClose();
  }, [onSelectType, onClose]);
  
  // Calculate panel position relative to button
  const panelStyle = buttonRect ? {
    position: 'fixed' as const,
    left: buttonRect.left,
    bottom: window.innerHeight - buttonRect.top + 8,
    zIndex: 50,
  } : {};
  
  return (
    <>
      {/* Backdrop */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-0 z-40"
            onClick={onClose}
          />
        )}
      </AnimatePresence>
      
      {/* Morphing Panel */}
      <AnimatePresence>
        {isOpen && buttonRect && (
          <motion.div
            initial={{ 
              opacity: 0,
              scale: 0.3,
              borderRadius: '50%',
              transformOrigin: 'bottom left',
            }}
            animate={{ 
              opacity: 1,
              scale: 1,
              borderRadius: 20,
              transformOrigin: 'bottom left',
            }}
            exit={{ 
              opacity: 0,
              scale: 0.3,
              borderRadius: '50%',
              transformOrigin: 'bottom left',
            }}
            transition={{ 
              type: 'spring',
              bounce: 0.15,
              duration: 0.4,
            }}
            style={panelStyle}
            className="bg-white dark:bg-[#1f1f24] border border-black/10 dark:border-white/10 shadow-2xl overflow-hidden min-w-[200px]"
          >
            <div className="p-2">
              <MenuItem
                icon={<ImageIcon className="w-5 h-5" />}
                label={t('attach.photos')}
                description={t('attach.photosHint')}
                onClick={() => handleSelect('image')}
                delay={0.05}
              />
              <MenuItem
                icon={<VideoIcon className="w-5 h-5" />}
                label={t('attach.video')}
                description={t('attach.videoHint')}
                onClick={() => handleSelect('video')}
                delay={0.1}
              />
              <MenuItem
                icon={<Music className="w-5 h-5" />}
                label={t('attach.audio')}
                description={t('attach.audioHint')}
                onClick={() => handleSelect('audio')}
                delay={0.15}
              />
              <MenuItem
                icon={<FileIcon className="w-5 h-5" />}
                label={t('attach.files')}
                description={t('attach.filesHint')}
                onClick={() => handleSelect('file')}
                delay={0.2}
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

interface MenuItemProps {
  icon: React.ReactNode;
  label: string;
  description: string;
  onClick: () => void;
  delay?: number;
}

function MenuItem({ icon, label, description, onClick, delay = 0 }: MenuItemProps) {
  // Bencho icon-bar micro-physics: the disc springs toward the pointer with
  // a slight lean, then overshoots back on leave — quiet, but felt.
  return (
    <motion.button
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay, duration: 0.2 }}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.97 }}
      className={cn(
        "w-full flex items-center gap-3 p-3 rounded-xl group/menuitem",
        "hover:bg-black/5 dark:hover:bg-white/5",
        "transition-colors duration-150",
        "text-left"
      )}
    >
      <motion.div
        variants={{ rest: { scale: 1, x: 0 }, hover: { scale: 1.08, x: 2 } }}
        initial="rest"
        whileHover="hover"
        className="w-10 h-10 rounded-full bg-[#f06413]/10 dark:bg-[#fb9243]/20 flex items-center justify-center text-[#f06413] dark:text-[#fb9243]"
      >
        {icon}
      </motion.div>
      <div>
        <div className="text-sm font-semibold text-apple-ink dark:text-white">{label}</div>
        <div className="text-xs text-apple-ink-muted">{description}</div>
      </div>
    </motion.button>
  );
}
