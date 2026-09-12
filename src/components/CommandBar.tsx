import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useSession } from '../lib/SessionContext';
import { useTheme } from '../lib/theme';
import { LANGS, useI18n } from '../lib/i18n';
import { cn } from '../lib/utils';
import {
  Send, Download, QrCode, Link2, Copy, RefreshCw, LogOut,
  Sun, Moon, Languages, FileText, ChevronLeft, Check, Search
} from 'lucide-react';

/**
 * CommandBar — the app's whole surface, one ⌘K away (bencho's command bar).
 *
 * Fuzzy-filtered, grouped actions: pairing, room, appearance, navigation.
 * Keyboard-first (⌘K/Ctrl+K, ↑↓, Enter, Esc) with full pointer support;
 * focus is trapped while open; springs are zeroed globally under
 * prefers-reduced-motion via MotionConfig.
 */

interface Cmd {
  id: string;
  label: string;
  group: string;
  icon: React.ReactNode;
  keywords?: string;
  run: () => void;
  /** Submenu entry (language picker) renders a chevron instead of running. */
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
  const listRef = useRef<HTMLDivElement>(null);
  const prevFocusRef = useRef<HTMLElement | null>(null);
  const inRoom = !!session.roomId;

  const connected = session.partnerConnected && session.connectionType !== 'disconnected';

  // Global toggle. Ctrl/⌘+K is deliberately captured even while typing —
  // it never conflicts with text entry (no browser reserve), and GitHub/
  // Slack-style palettes behave the same.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen(o => !o);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

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

  const close = useCallback(() => setOpen(false), []);

  // Escape closes submenu first, then the bar. Click-outside closes.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        if (subOpen) setSubOpen(false);
        else close();
      }
    };
    const onDown = (e: PointerEvent) => {
      const el = listRef.current;
      if (el && !el.contains(e.target as Node)) close();
    };
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('pointerdown', onDown, true);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener('pointerdown', onDown, true);
    };
  }, [open, subOpen, close]);

  const commands = useMemo<Cmd[]>(() => {
    const list: Cmd[] = [];
    if (!inRoom) {
      list.push(
        {
          id: 'send', label: t('home.send'), group: t('command.group.actions'),
          icon: <Send className="w-4 h-4" />, keywords: 'create room start new session',
          run: () => { void createSession(); },
        },
        {
          id: 'receive', label: t('home.receive'), group: t('command.group.actions'),
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
              .find(b => b.textContent?.includes(t('create.showQr')));
            btn?.click();
          },
        },
        {
          id: 'link', label: t('create.shareLink'), group: t('command.group.room'),
          icon: <Link2 className="w-4 h-4" />, keywords: 'copy url invite',
          run: () => {
            const origin = window.location.origin;
            void navigator.clipboard.writeText(origin).catch(() => {});
          },
        },
        {
          id: 'copyall', label: t('chat.copyAll'), group: t('command.group.room'),
          icon: <Copy className="w-4 h-4" />, keywords: 'clipboard everything',
          run: () => {
            const btn = Array.from(document.querySelectorAll('button'))
              .find(b => b.textContent?.includes(t('chat.copyAll')));
            btn?.click();
          },
        },
        {
          id: 'disconnect', label: t('common.disconnect'), group: t('command.group.room'),
          icon: <LogOut className="w-4 h-4" />, keywords: 'close end leave session',
          // Same semantic as the room header's disconnect: leave quietly to
          // the landing page (never the "Session ended" screen).
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
  }, [inRoom, connected, t, lang, resolved, createSession, requestReconnect, abandonSession, setChoice]);

  const filtered = useMemo(() => {
    const q = query.trim();
    if (!q) return commands;
    return commands.filter(c => fuzzy(q, `${c.label} ${c.keywords ?? ''} ${c.group}`));
  }, [commands, query]);

  // Keep the selection inside bounds as the filter narrows.
  useEffect(() => { setIndex(i => Math.min(i, Math.max(0, filtered.length - 1))); }, [filtered.length]);

  const runCmd = (cmd: Cmd) => {
    if (cmd.opensSub) { cmd.run(); return; }
    close();
    // Defer one frame so focus restore happens before the command's own
    // focus changes (dialogs, prompts) — avoids focus tug-of-war.
    requestAnimationFrame(() => cmd.run());
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (subOpen) return; // submenu owns the keys while open
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
          className="fixed inset-0 z-[80] bg-black/40 dark:bg-black/60 flex items-start justify-center pt-[12vh] px-4"
          role="dialog"
          aria-modal="true"
          aria-label={t('command.title')}
        >
          <motion.div
            ref={listRef}
            initial={{ opacity: 0, y: -8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98 }}
            transition={{ type: 'spring', bounce: 0, duration: 0.28 }}
            className="w-full max-w-[520px] rounded-[18px] bg-white dark:bg-[#1c172e] border border-apple-divider dark:border-white/10 shadow-2xl overflow-hidden"
            onPointerDown={(e) => e.stopPropagation()}
          >
            {subOpen ? (
              /* Language submenu — flat list, back with Esc/← */
              <div role="listbox" aria-label={t('lang.menu')} className="max-h-[52vh] overflow-y-auto p-1.5">
                {LANGS.map((l) => (
                  <button
                    key={l.code}
                    lang={l.code}
                    onClick={() => { setLang(l.code); close(); }}
                    className={cn(
                      'w-full flex items-center justify-between px-3.5 py-2.5 rounded-[10px] text-[13.5px] transition-colors',
                      l.code === lang
                        ? 'bg-[#f06413]/10 dark:bg-[#fb9243]/15 font-semibold text-apple-ink dark:text-white'
                        : 'text-apple-ink dark:text-white/85 hover:bg-apple-divider/40 dark:hover:bg-white/[0.06]'
                    )}
                  >
                    <span>{l.native}</span>
                    {l.code === lang && <Check className="w-4 h-4 text-[#f06413] dark:text-[#fb9243]" />}
                  </button>
                ))}
              </div>
            ) : (
              <>
                <div className="flex items-center gap-2.5 px-4 border-b border-apple-divider/60 dark:border-white/[0.07]">
                  <Search className="w-4 h-4 text-apple-ink-muted/70 dark:text-white/40 shrink-0" />
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
                    className="w-full bg-transparent py-3.5 text-[14.5px] text-apple-ink dark:text-white placeholder:text-apple-ink-muted/60 dark:placeholder:text-white/30 outline-none"
                  />
                  <kbd className="shrink-0 px-1.5 py-0.5 rounded-[5px] border border-apple-divider dark:border-white/10 text-[10.5px] font-medium text-apple-ink-muted/80 dark:text-white/40">Esc</kbd>
                </div>
                <div id="commandbar-list" role="listbox" className="max-h-[46vh] overflow-y-auto p-1.5">
                  {filtered.length === 0 && (
                    <p className="px-3.5 py-6 text-[13px] text-apple-ink-muted text-center">{t('command.noResults')}</p>
                  )}
                  {groups.map(([group, cmds]) => (
                    <div key={group} role="group" aria-label={group} className="mb-1 last:mb-0">
                      <p className="px-3 pt-2 pb-1 text-[10.5px] font-semibold tracking-widest uppercase text-apple-ink-muted/70 dark:text-white/35">{group}</p>
                      {cmds.map((cmd) => {
                        flatIdx += 1;
                        const active = flatIdx === index;
                        return (
                          <button
                            key={cmd.id}
                            role="option"
                            aria-selected={active}
                            onMouseMove={() => setIndex(filtered.indexOf(cmd))}
                            onClick={() => runCmd(cmd)}
                            className={cn(
                              'w-full flex items-center gap-3 px-3 py-2.5 rounded-[10px] text-[13.5px] text-left transition-colors',
                              active
                                ? 'bg-[#f06413]/10 dark:bg-[#fb9243]/15 text-apple-ink dark:text-white font-medium'
                                : 'text-apple-ink dark:text-white/85 hover:bg-apple-divider/40 dark:hover:bg-white/[0.06]'
                            )}
                          >
                            <span className={cn(
                              'flex items-center justify-center w-7 h-7 rounded-[8px] shrink-0',
                              active ? 'bg-[#f06413]/15 dark:bg-[#fb9243]/20 text-[#f06413] dark:text-[#fb9243]' : 'bg-apple-parchment dark:bg-white/[0.05] text-apple-ink-muted dark:text-white/60'
                            )}>
                              {cmd.icon}
                            </span>
                            <span className="flex-1 truncate">{cmd.label}</span>
                            {cmd.opensSub && <ChevronLeft className="w-3.5 h-3.5 rotate-180 text-apple-ink-muted/60 dark:text-white/35" />}
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
      className="hidden lg:flex items-center gap-1.5 h-8 px-2.5 rounded-full border border-apple-divider/70 dark:border-white/10 bg-white/60 dark:bg-white/[0.04] text-apple-ink-muted dark:text-white/50 hover:text-apple-ink dark:hover:text-white hover:border-apple-ink/20 dark:hover:border-white/20 transition-colors"
    >
      <Search className="w-3.5 h-3.5" />
      <kbd className="text-[11px] font-semibold font-sans">⌘K</kbd>
    </button>
  );
}
