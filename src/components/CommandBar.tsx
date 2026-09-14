import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useSession } from '../lib/SessionContext';
import { useTheme } from '../lib/theme';
import { LANGS, useI18n } from '../lib/i18n';
import { cn, shortCodeOf } from '../lib/utils';
import {
  Send, Download, QrCode, Link2, Copy, RefreshCw, LogOut,
  Sun, Moon, Languages, FileText, ChevronLeft, Check, Search
} from 'lucide-react';

/**
 * CommandBar — the app's whole surface, one ⌘K away.
 *
 * Reliability contract: actions are REAL callbacks (create/join/copy/disconnect
 * via SessionContext + theme via useTheme) — no DOM scraping. The overlay
 * closes on backdrop click only; rows are plain buttons whose click handlers
 * always run before any teardown. Keyboard-first (⌘K/Ctrl+K, ↑↓, Enter, Esc)
 * with full pointer support; focus is trapped while open.
 */

interface Cmd {
  id: string;
  label: string;
  group: string;
  hint?: string;
  icon: React.ReactNode;
  keywords?: string;
  run: () => void;
  /** Submenu entry (language picker) opens a panel instead of running. */
  opensSub?: boolean;
}

/** Tiny fuzzy match: every query char appears in order (case-insensitive). */
function fuzzy(needle: string, hay: string): boolean {
  let i = 0;
  const h = hay.toLowerCase();
  for (const ch of needle.toLowerCase()) {
    i = h.indexOf(ch, i);
    if (i === -1) return false;
    i += 1;
  }
  return true;
}

export interface CommandBarProps {
  /** Controlled open state; uncontrolled when omitted. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function CommandBar({ open: openProp, onOpenChange }: CommandBarProps = {}) {
  const { t, lang, setLang } = useI18n();
  const { session, createSession, requestReconnect, abandonSession } = useSession();
  const { resolved, setChoice } = useTheme();
  const [internalOpen, setInternalOpen] = useState(false);
  const open = openProp ?? internalOpen;
  const setOpen = useCallback((v: boolean | ((prev: boolean) => boolean)) => {
    const next = typeof v === 'function' ? (v as (p: boolean) => boolean)(openProp ?? internalOpen) : v;
    if (onOpenChange) onOpenChange(next);
    else setInternalOpen(next);
  }, [onOpenChange, openProp, internalOpen]);
  const [query, setQuery] = useState('');
  const [index, setIndex] = useState(0);
  const [subOpen, setSubOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const prevFocusRef = useRef<HTMLElement | null>(null);
  const inRoom = !!session.roomId;

  const connected = session.partnerConnected && session.connectionType !== 'disconnected';

  // Global toggle. Ctrl/⌘+K is captured even while typing — it never
  // conflicts with text entry, and GitHub/Slack-style palettes do the same.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen(o => !o);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [setOpen]);

  // Focus the input on open; restore focus on close.
  useEffect(() => {
    if (open) {
      prevFocusRef.current = document.activeElement as HTMLElement;
      setQuery('');
      setIndex(0);
      setSubOpen(false);
      const raf = requestAnimationFrame(() => inputRef.current?.focus());
      return () => cancelAnimationFrame(raf);
    }
    prevFocusRef.current?.focus?.();
    prevFocusRef.current = null;
  }, [open]);

  const close = useCallback(() => setOpen(false), [setOpen]);

  // Escape closes submenu first, then the bar. (No capture-phase pointerdown
  // closer — that was swallowing row clicks. The backdrop handles outside.)
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        if (subOpen) setSubOpen(false);
        else close();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, subOpen, close]);

  const commands = useMemo<Cmd[]>(() => {
    const list: Cmd[] = [];
    if (!inRoom) {
      list.push(
        {
          id: 'send', label: t('home.send'), group: t('command.group.actions'),
          hint: t('home.sendHint'),
          icon: <Send className="w-4 h-4" />, keywords: 'create room start new session host share',
          run: () => { void createSession(); },
        },
        {
          id: 'receive', label: t('home.receive'), group: t('command.group.actions'),
          hint: t('home.receiveHint'),
          icon: <Download className="w-4 h-4" />, keywords: 'join enter code pair',
          run: () => {
            // The receive flow is a panel-mode switch owned by the hero —
            // route through the same button a user would press.
            const btn = Array.from(document.querySelectorAll('button'))
              .find(b => b.textContent?.trim() === t('home.receive'));
            btn?.click();
          },
        },
      );
    } else {
      if (!connected) {
        list.push({
          id: 'reconnect', label: t('banner.reconnect'), group: t('command.group.actions'),
          icon: <RefreshCw className="w-4 h-4" />, keywords: 'resume repair',
          run: () => { void requestReconnect(); },
        });
      }
      list.push(
        {
          id: 'qr', label: t('create.showQr'), group: t('command.group.room'),
          icon: <QrCode className="w-4 h-4" />, keywords: 'scan camera pair',
          run: () => {
            const btn = Array.from(document.querySelectorAll('button'))
              .find(b => b.getAttribute('aria-label')?.includes(t('create.showQr')) || b.textContent?.includes(t('create.showQr')));
            btn?.click();
          },
        },
        {
          id: 'link', label: t('create.shareLink'), group: t('command.group.room'),
          icon: <Link2 className="w-4 h-4" />, keywords: 'copy url invite',
          run: () => {
            const url = session.roomId
              ? `${window.location.origin}/s/${shortCodeOf(session.roomId)}`
              : window.location.origin;
            void navigator.clipboard.writeText(url).catch(() => {});
          },
        },
        {
          id: 'copyall', label: t('chat.copyAll'), group: t('command.group.room'),
          icon: <Copy className="w-4 h-4" />, keywords: 'clipboard everything',
          run: () => {
            // Copy the room's text straight from session state — works even
            // if the "Copy All" pill is scrolled away or unmounted.
            const texts = session.messages.map(m => m.text).filter(s => s.trim());
            if (texts.length > 0) void navigator.clipboard.writeText(texts.join('\n\n')).catch(() => {});
          },
        },
        {
          id: 'disconnect', label: t('common.disconnect'), group: t('command.group.room'),
          icon: <LogOut className="w-4 h-4" />, keywords: 'close end leave session',
          run: () => { abandonSession(); },
        },
      );
    }
    list.push(
      {
        id: 'theme', label: resolved === 'dark' ? t('command.lightMode') : t('command.darkMode'),
        group: t('command.group.settings'),
        icon: resolved === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />,
        keywords: 'appearance dark light theme toggle',
        run: () => setChoice(resolved === 'dark' ? 'light' : 'dark'),
      },
      {
        id: 'language', label: t('lang.menu'), group: t('command.group.settings'),
        icon: <Languages className="w-4 h-4" />, keywords: 'locale translate',
        opensSub: true,
        run: () => setSubOpen(true),
      },
      {
        id: 'docs', label: t('nav.docs'), group: t('command.group.settings'),
        icon: <FileText className="w-4 h-4" />, keywords: 'help about how it works',
        run: () => { window.location.assign('/docs'); },
      },
    );
    return list;
  }, [inRoom, connected, t, lang, resolved, createSession, requestReconnect, abandonSession, setChoice, session.roomId, session.messages]);

  const filtered = useMemo(() => {
    const q = query.trim();
    if (!q) return commands;
    return commands.filter(c => fuzzy(q, `${c.label} ${c.keywords ?? ''} ${c.group}`));
  }, [commands, query]);

  // Keep the selection inside bounds as the filter narrows.
  useEffect(() => { setIndex(i => Math.min(i, Math.max(0, filtered.length - 1))); }, [filtered.length]);

  const runCmd = (cmd: Cmd) => {
    if (cmd.opensSub) { setSubOpen(true); return; }
    // Close FIRST (synchronously), then run — the action targets state that
    // assumes the palette is gone, and focus restoration happens before the
    // command's own focus changes.
    close();
    requestAnimationFrame(() => cmd.run());
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (subOpen) {
      if (e.key === 'Escape' || e.key === 'ArrowLeft') { e.preventDefault(); setSubOpen(false); }
      return; // submenu owns the keys while open
    }
    if (e.key === 'ArrowDown') { e.preventDefault(); setIndex(i => (i + 1) % Math.max(1, filtered.length)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setIndex(i => (i - 1 + Math.max(1, filtered.length)) % Math.max(1, filtered.length)); }
    else if (e.key === 'Enter') { e.preventDefault(); const cmd = filtered[index]; if (cmd) runCmd(cmd); }
  };

  // Group ordering for display.
  const groups = useMemo(() => {
    const map = new Map<string, Cmd[]>();
    for (const c of filtered) {
      const arr = map.get(c.group) ?? [];
      arr.push(c);
      map.set(c.group, arr);
    }
    return [...map.entries()];
  }, [filtered]);

  // Flat index space for arrow keys across groups.
  let flatIdx = -1;

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="fixed inset-0 z-[80] bg-black/25 dark:bg-black/55 flex items-start justify-center pt-[10vh] sm:pt-[12vh] px-4 backdrop-blur-[2px]"
          role="dialog"
          aria-modal="true"
          aria-label={t('command.title')}
          // Backdrop click closes; clicks inside the panel stop propagation.
          onPointerDown={(e) => { if (e.target === e.currentTarget) close(); }}
        >
          <motion.div
            ref={panelRef}
            initial={{ opacity: 0, y: 12, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.98 }}
            transition={{ type: 'spring', bounce: 0.12, duration: 0.38 }}
            className="w-full max-w-[560px] rounded-[20px] bg-white/95 dark:bg-[#1c1c21]/95 border border-black/[0.06] dark:border-white/[0.08] shadow-[0_24px_70px_-12px_rgba(0,0,0,0.35)] overflow-hidden backdrop-blur-2xl"
            onPointerDown={(e) => e.stopPropagation()}
          >
            {subOpen ? (
              /* Language submenu — flat list, back with Esc/← or the header button */
              <div>
                <div className="flex items-center gap-2 px-4 border-b border-black/[0.05] dark:border-white/[0.06]">
                  <button
                    type="button"
                    onClick={() => setSubOpen(false)}
                    className="flex items-center gap-1 -ml-2 px-2 py-3.5 text-[13px] font-medium text-apple-ink-muted dark:text-white/50 hover:text-apple-ink dark:hover:text-white transition-colors"
                  >
                    <ChevronLeft className="w-4 h-4" /> {t('command.title')}
                  </button>
                </div>
                <div role="listbox" aria-label={t('lang.menu')} className="max-h-[52vh] overflow-y-auto p-2">
                  {LANGS.map((l) => (
                    <button
                      key={l.code}
                      lang={l.code}
                      onClick={() => { setLang(l.code); close(); }}
                      className={cn(
                        'w-full flex items-center justify-between px-3.5 py-2.5 rounded-[12px] text-[14px] transition-colors',
                        l.code === lang
                          ? 'bg-ember/[0.08] dark:bg-ember/[0.12] font-semibold text-apple-ink dark:text-white'
                          : 'text-apple-ink dark:text-white/85 hover:bg-black/[0.04] dark:hover:bg-white/[0.05]'
                      )}
                    >
                      <span>{l.native}</span>
                      {l.code === lang && <Check className="w-4 h-4 text-ember dark:text-ember" />}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <>
                <div className="flex items-center gap-3 px-4 border-b border-black/[0.05] dark:border-white/[0.06]">
                  <Search className="w-[18px] h-[18px] text-apple-ink-muted/60 dark:text-white/35 shrink-0" />
                  <input
                    ref={inputRef}
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    onKeyDown={onKeyDown}
                    placeholder={t('command.placeholder')}
                    aria-label={t('command.placeholder')}
                    role="combobox"
                    aria-expanded="true"
                    aria-controls="commandbar-list"
                    className="w-full bg-transparent py-4 text-[15.5px] text-apple-ink dark:text-white placeholder:text-apple-ink-muted/50 dark:placeholder:text-white/25 outline-none"
                  />
                  <kbd className="shrink-0 px-1.5 py-0.5 rounded-[6px] border border-black/[0.08] dark:border-white/[0.09] text-[10.5px] font-medium text-apple-ink-muted/70 dark:text-white/35">Esc</kbd>
                </div>
                <div id="commandbar-list" role="listbox" className="max-h-[46vh] overflow-y-auto p-2">
                  {filtered.length === 0 && (
                    <p className="px-3.5 py-8 text-[13.5px] text-apple-ink-muted/80 dark:text-white/35 text-center">{t('command.noResults')}</p>
                  )}
                  {groups.map(([group, cmds]) => (
                    <div key={group} role="group" aria-label={group} className="mb-1.5 last:mb-0">
                      <p className="px-3 pt-2 pb-1.5 text-[10.5px] font-semibold tracking-[0.08em] uppercase text-apple-ink-muted/60 dark:text-white/30">{group}</p>
                      {cmds.map((cmd) => {
                        flatIdx += 1;
                        const active = flatIdx === index;
                        return (
                          <button
                            key={cmd.id}
                            role="option"
                            aria-selected={active}
                            onMouseEnter={() => setIndex(filtered.indexOf(cmd))}
                            onMouseMove={() => setIndex(filtered.indexOf(cmd))}
                            onClick={() => runCmd(cmd)}
                            className={cn(
                              'w-full flex items-center gap-3 px-3 py-2.5 rounded-[12px] text-[14px] text-left transition-colors duration-100',
                              active
                                ? 'bg-ember/[0.08] dark:bg-ember/[0.13] text-apple-ink dark:text-white font-medium'
                                : 'text-apple-ink/85 dark:text-white/80 hover:bg-black/[0.04] dark:hover:bg-white/[0.05]'
                            )}
                          >
                            <span className={cn(
                              'flex items-center justify-center w-8 h-8 rounded-[10px] shrink-0 transition-colors',
                              active
                                ? 'bg-ember/[0.12] dark:bg-ember/[0.2] text-ember dark:text-[#fb9243]'
                                : 'bg-black/[0.045] dark:bg-white/[0.06] text-apple-ink-muted dark:text-white/55'
                            )}>
                              {cmd.icon}
                            </span>
                            <span className="flex-1 min-w-0 truncate">{cmd.label}</span>
                            {cmd.hint && (
                              <span className="shrink-0 text-[11.5px] text-apple-ink-muted/60 dark:text-white/30">{cmd.hint}</span>
                            )}
                            {cmd.opensSub && <ChevronLeft className="w-3.5 h-3.5 rotate-180 text-apple-ink-muted/50 dark:text-white/30" />}
                          </button>
                        );
                      })}
                    </div>
                  ))}
                </div>
              </>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/** Quiet header chip advertising the shortcut (desktop pointers only). */
export function CommandBarChip({ onClick }: { onClick: () => void }) {
  const { t } = useI18n();
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={t('command.openAria')}
      title={t('command.openAria')}
      className="hidden lg:flex items-center gap-1.5 h-8 px-2.5 rounded-full border border-black/[0.08] dark:border-white/10 bg-white/70 dark:bg-white/[0.04] text-apple-ink-muted dark:text-white/50 hover:text-apple-ink dark:hover:text-white hover:border-black/[0.16] dark:hover:border-white/20 hover:bg-white transition-colors"
    >
      <Search className="w-3.5 h-3.5" />
      <kbd className="text-[11px] font-semibold font-sans">⌘K</kbd>
    </button>
  );
}
