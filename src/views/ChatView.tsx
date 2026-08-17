import React, { useState, useRef, useEffect, useMemo } from 'react';
import { useSession } from '../lib/SessionContext';
import { motion, AnimatePresence } from 'motion/react';
import {
  X, Plus, Image as ImageIcon, Copy, Check, CheckCheck,
  File as FileIcon, Play, Download, RefreshCw, AlertCircle, ChevronDown, ChevronUp, ArrowUp, Lock, ZoomIn, ShieldCheck, Terminal, Share2
} from 'lucide-react';
import { FileTypeIcon } from '../components/FileTypeIcon';
import { cn, formatBytes } from '../lib/utils';
import { ChatMessage, Attachment } from '../types';
import { ShareTextLogo } from '../components/ShareTextLogo';
import { ThemeToggle } from '../components/ThemeToggle';
import { generateTOTP, getTOTPRemainingSeconds } from '../lib/totp';
import { saveDraft, loadDraft, clearDraft, ComposerDraft } from '../lib/draftStore';

const LARGE_TEXT_THRESHOLD = 8000; // chars
const LARGE_TEXT_PREVIEW = 1400;

export function ChatView() {
  const { session, sendMessage, closeSession, cancelTransfer } = useSession();
  const [inputText, setInputText] = useState('');
  // Multiple staged attachments per send (up to 20) — each file becomes its
  // own transfer bubble on send, but they're picked together in one message.
  const [attachments, setAttachments] = useState<(Attachment & { file: File })[]>([]);

  // ---- Draft persistence: text + attachments survive an accidental refresh.
  // Restore on mount, save (debounced) on every change, clear on send. The
  // draft is keyed by room, so switching rooms never mixes composers. A
  // ready flag prevents the empty initial state from overwriting the stored
  // draft before the async restore lands.
  const [draftReady, setDraftReady] = useState(false);
  useEffect(() => {
    let cancelled = false;
    void loadDraft(session.roomId).then((d) => {
      if (cancelled || !d) { setDraftReady(true); return; }
      setInputText(d.text);
      setAttachments(d.attachments.filter(a => a.file && a.file.size > 0));
      setDraftReady(true);
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.roomId]);

  useEffect(() => {
    if (!draftReady) return;
    const t = setTimeout(() => {
      const draft: ComposerDraft = { text: inputText, attachments, updatedAt: Date.now() };
      void saveDraft(session.roomId, draft);
    }, 250);
    return () => clearTimeout(t);
  }, [inputText, attachments, session.roomId, draftReady]);
  const [showAttachmentMenu, setShowAttachmentMenu] = useState(false);
  const [showConnectionDetails, setShowConnectionDetails] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [copiedAll, setCopiedAll] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);
  const [showThatsIt, setShowThatsIt] = useState(false);
  const [thatsItCopy, setThatsItCopy] = useState("That's it — it's on the other device.");
  const [announcement, setAnnouncement] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const dragDepth = useRef(0);
  const firstTransferShown = useRef(false);
  // "Other device connected" toast — the alert both sides get when the
  // room opens, so the creator sees the joiner arrive even when the
  // handshake was too fast to catch on the pairing screen.
  const [showConnected, setShowConnected] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  // Composer textarea — auto-grows as the user types (rows=1 + height sync),
  // capped at 30vh so long messages scroll instead of eating the screen.
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  // Messages scroll container — tracks whether the reader is at the bottom so
  // an incoming message can offer a "jump to newest" pill instead of yanking
  // the scroll position (the small thing chat apps get right).
  const scrollRef = useRef<HTMLDivElement>(null);
  const atBottomRef = useRef(true);
  const [showJump, setShowJump] = useState(false);
  const prevCountRef = useRef(session.messages.length);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const keepSessionRef = useRef<HTMLButtonElement>(null);

  // Focus the dialog's safe action on open. React's autoFocus is insufficient
  // here: the browser's default pointerdown focus on the opener button lands
  // AFTER React's autoFocus and steals focus back, so focus the keep button
  // on the next frame instead. Enter then closes safely, never ends.
  useEffect(() => {
    if (confirmClose) {
      const raf = requestAnimationFrame(() => keepSessionRef.current?.focus());
      return () => cancelAnimationFrame(raf);
    }
  }, [confirmClose]);
  const audioInputRef = useRef<HTMLInputElement>(null);

  // Object URLs for staged image previews, keyed by attachment id; revoked
  // when the set changes (or on unmount) so we never leak blob URLs.
  const previewUrls = useMemo(() => {
    const map = new Map<string, string>();
    for (const a of attachments) {
      if (a.type === 'image' && a.file) map.set(a.id, URL.createObjectURL(a.file));
    }
    return map;
  }, [attachments]);

  useEffect(() => {
    return () => { previewUrls.forEach((u) => URL.revokeObjectURL(u)); };
  }, [previewUrls]);

  const disconnected = !session.partnerConnected && session.connectionType === 'disconnected';

  // Keep the composer exactly as tall as its content (1 line = 44px), growing
  // smoothly up to 30vh. Without this the textarea sits at its default
  // rows=2 height (68px), which is the "extra height / misaligned buttons"
  // the old composer had — the + and ↑ were pinned to the bottom while the
  // text floated at the top.
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    const next = Math.min(el.scrollHeight, Math.round(window.innerHeight * 0.3));
    el.style.height = Math.max(44, next) + 'px';
  }, [inputText]);

  // Keyboard-safe height: when the on-screen keyboard opens, the visual
  // viewport shrinks while 100dvh doesn't. Track it so the composer stays
  // pinned above the keyboard (the primary mobile input surface).
  //
  // The visible area is `vv.height - vv.offsetTop` — offsetTop is the space
  // ABOVE the visual viewport (e.g. collapsed browser chrome), and counting
  // it in the container height is what produced the "huge gap" between the
  // composer and the keyboard on some devices. Focus/blur are also tracked:
  // Android fires a resize when the keyboard opens but can fire blur before
  // the viewport restores, leaving a stale shrunken height behind.
  const [visualHeight, setVisualHeight] = useState<number | null>(null);
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    // Baseline: the tallest visual viewport we've seen is the keyboard-closed
    // height. Detecting "shrunk" against a running max (not innerHeight) is
    // robust on Android, where innerHeight also shrinks with the keyboard.
    let maxHeight = vv.height;
    const update = () => {
      maxHeight = Math.max(maxHeight, vv.height);
      const shrank = vv.height < maxHeight - 120; // keyboard open
      setVisualHeight(shrank ? Math.max(0, vv.height - vv.offsetTop) : null);
    };
    update();
    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);
    // Android can fire blur before the viewport restores — re-measure shortly
    // after focus/blur so a stale shrunken height never leaves a dead gap.
    const onFocus = () => setTimeout(update, 120);
    const onBlur = () => setTimeout(update, 120);
    window.addEventListener('focus', onFocus);
    window.addEventListener('blur', onBlur);
    return () => {
      vv.removeEventListener('resize', update);
      vv.removeEventListener('scroll', update);
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('blur', onBlur);
    };
  }, []);

  const onMessagesScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
    atBottomRef.current = nearBottom;
    if (nearBottom) setShowJump(false);
  };

  // Haptic feedback — a light tap when a message leaves this device, a
  // short double-tap when one arrives. Mobile-only, silently ignored
  // anywhere the API doesn't exist.
  const haptic = (pattern: number | number[]) => {
    try {
      if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') navigator.vibrate(pattern);
    } catch { /* unsupported */ }
  };

  useEffect(() => {
    const prev = prevCountRef.current;
    const count = session.messages.length;
    prevCountRef.current = count;
    if (count <= prev) return;
    const last = session.messages[count - 1];
    if (last?.sender === 'partner') {
      haptic([10, 40, 12]);
      if (!atBottomRef.current && !disconnected) setShowJump(true);
    } else if (last?.sender === 'me') {
      haptic(8);
    }
    // Autoscroll only when the reader is already at the bottom — never yank
    // the scroll position out from under them.
    if (!disconnected && atBottomRef.current) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [session.messages, disconnected]);

  // Screen-reader live region: connection state + inbound transfers are
  // announced in plain words ("Connected", "Photo received", "Couldn't send
  // the file.") without any visual change.
  const lastMessage = session.messages[session.messages.length - 1];
  useEffect(() => {
    if (!lastMessage || lastMessage.sender === 'me') return;
    const st = lastMessage.attachment?.status;
    if (st === 'complete') {
      const t = lastMessage.attachment?.type;
      setAnnouncement(t === 'image' ? 'Photo received' : t === 'video' ? 'Video received' : t === 'audio' ? 'Audio received' : `File received: ${lastMessage.attachment!.name}`);
    } else if (st === 'failed') {
      setAnnouncement("Couldn't send the file.");
    } else if (st === 'cancelled') {
      setAnnouncement('Transfer cancelled');
    } else if (!lastMessage.attachment) {
      setAnnouncement('Message received');
    }
  }, [session.messages]);

  useEffect(() => {
    if (session.partnerConnected && session.connectionType !== 'disconnected') {
      setAnnouncement('Connected');
      // The visible alert — a short toast when the room opens.
      setShowConnected(true);
      const t = setTimeout(() => setShowConnected(false), 2800);
      return () => clearTimeout(t);
    } else if (session.connectionType === 'disconnected') {
      setAnnouncement('Your other device disconnected');
    }
  }, [session.partnerConnected, session.connectionType]);

  // Post-transfer moment: after the very first transfer, a quiet "That's it."
  // appears once, then the app gets out of the way. Direction-aware: sending
  // and receiving tell different truths ("it's on the other device" vs "it
  // arrived").
  useEffect(() => {
    if (!firstTransferShown.current && session.messages.length >= 1) {
      firstTransferShown.current = true;
      const last = session.messages[session.messages.length - 1];
      setThatsItCopy(last?.sender === 'me' ? "That's it — it's on the other device." : "That's it — it arrived.");
      setShowThatsIt(true);
      const t = setTimeout(() => setShowThatsIt(false), 5000);
      return () => clearTimeout(t);
    }
  }, [session.messages.length]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setShowAttachmentMenu(false);
        setShowConnectionDetails(false);
        setConfirmClose(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const MAX_ATTACHMENTS = 20;

  // Stage one or more files (menu pick or drag-drop) into the composer strip.
  // Per-file limits with honest messages: images above 100 MB can't preview
  // in the browser but still arrive as files; anything over 2 GB is rejected
  // up-front instead of failing mid-transfer.
  const addFiles = (files: FileList | File[], type: 'image' | 'file' | 'video' | 'audio') => {
    const list = Array.from(files);
    if (list.length === 0) return;
    const roomLeft = MAX_ATTACHMENTS - attachments.length;
    if (roomLeft <= 0) {
      setErrorMsg(`You can attach up to ${MAX_ATTACHMENTS} files in one message. Send this batch first.`);
      return;
    }

    const accepted: (Attachment & { file: File })[] = [];
    for (const file of list) {
      if (accepted.length >= roomLeft) {
        setErrorMsg(`You can attach up to ${MAX_ATTACHMENTS} files in one message. ${list.length - accepted.length} more file${list.length - accepted.length === 1 ? ' was' : 's were'} left out.`);
        break;
      }
      let t = type;
      // A video/audio picked through the generic File picker still plays
      // inline instead of arriving as a dead file card.
      if (t === 'file' && file.type.startsWith('video/')) t = 'video';
      else if (t === 'file' && file.type.startsWith('audio/')) t = 'audio';
      if (t === 'image' && file.size > 100 * 1024 * 1024) {
        setErrorMsg(`${file.name} is larger than 100 MB. Photos above 100 MB still transfer full-quality — they arrive as a file you can open, with no preview.`);
        continue;
      }
      if (file.size > 4 * 1024 * 1024 * 1024) {
        setErrorMsg(`${file.name} is larger than 4 GB — the largest ShareText can move.`);
        continue;
      }
      accepted.push({
        id: crypto.randomUUID(),
        type: t,
        name: file.name,
        size: file.size,
        mimeType: file.type,
        file,
        status: 'draft'
      });
    }

    if (accepted.length > 0) {
      setErrorMsg(null);
      setAttachments(prev => [...prev, ...accepted]);
      setShowAttachmentMenu(false);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>, type: 'image' | 'file' | 'video' | 'audio') => {
    if (!e.target.files || e.target.files.length === 0) return;
    addFiles(e.target.files, type);
    e.target.value = ''; // allow picking the same file again after removing
  };

  // Drag & drop: classify the first dropped file and stage it like the menu.
  const handleDragEnter = (e: React.DragEvent) => {
    if (!e.dataTransfer?.types.includes('Files')) return;
    e.preventDefault();
    dragDepth.current++;
    setDragOver(true);
  };
  const handleDragOver = (e: React.DragEvent) => {
    if (e.dataTransfer?.types.includes('Files')) e.preventDefault();
  };
  const handleDragLeave = () => {
    dragDepth.current = Math.max(0, dragDepth.current - 1);
    if (dragDepth.current === 0) setDragOver(false);
  };
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    dragDepth.current = 0;
    setDragOver(false);
    const files = e.dataTransfer?.files;
    if (!files || files.length === 0) return;
    const first = files[0];
    const type = first.type.startsWith('image/')
      ? 'image'
      : first.type.startsWith('video/')
        ? 'video'
        : first.type.startsWith('audio/')
          ? 'audio'
          : 'file';
    addFiles(files, type);
  };

  const handleSend = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!inputText.trim() && attachments.length === 0) return;
    if (disconnected) return;

    if (attachments.length > 0) {
      // Each staged file goes as its own transfer (its own bubble + progress
      // + resume), so 20 files become 20 reliable transfers — not one giant
      // multi-blob message that would restart from zero on any hiccup.
      for (const a of attachments) {
        const { file, ...attachmentMeta } = a;
        sendMessage(inputText, attachmentMeta, file);
      }
    } else {
      sendMessage(inputText);
    }

    setInputText('');
    setAttachments([]);
    void clearDraft(session.roomId);
  };

  const inputBytes = useMemo(() => new TextEncoder().encode(inputText).length, [inputText]);
  const isLargeInput = inputBytes > 50000;

  const copyAll = async () => {
    const texts = session.messages.map(m => m.text).filter(t => t.trim());
    if (texts.length === 0) return;
    try {
      await navigator.clipboard.writeText(texts.join('\n\n'));
      setCopiedAll(true);
      setTimeout(() => setCopiedAll(false), 2000);
    } catch {
      setErrorMsg("Couldn't copy. Select the text and copy manually.");
    }
  };

  return (
    <div
      className="relative flex flex-col h-dvh bg-apple-canvas dark:bg-night-950 font-sans"
      style={visualHeight ? { height: `${visualHeight}px` } : undefined}
    >
      {/* Screen-reader live region — invisible, announced on state changes */}
      <div aria-live="polite" role="status" className="sr-only">{announcement}</div>

      {/* Header */}
      <div className="flex items-center justify-between gap-3 p-4 sm:p-5 shrink-0 border-b border-apple-divider/50 dark:border-apple-tile-3/50 backdrop-blur-xl bg-apple-canvas/80 dark:bg-night-950/80 z-20 sticky top-0">
        <button
          onPointerDown={() => setShowConnectionDetails(!showConnectionDetails)}
          aria-expanded={showConnectionDetails}
          className="flex items-center gap-3 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-apple-blue rounded-[10px] min-h-[40px] min-w-0 max-w-[50vw] sm:max-w-none"
        >
          <ShareTextLogo size={24} className="text-apple-ink dark:text-white shrink-0" />
          <span className="flex items-center gap-2 min-w-0">
            <span className="text-[16px] font-semibold text-apple-ink dark:text-white leading-tight truncate">
              {session.partnerName || 'Other device'}
            </span>
            {/* One line: name + live status chip together. */}
            <span className={cn(
              "flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[12px] font-semibold whitespace-nowrap",
              session.connectionType === 'relay'
                ? "bg-status-warning/10 text-status-warning-ink dark:text-status-warning-ink-dark"
                : "bg-status-success/10 text-status-success"
            )}>
              <span className={cn(
                "w-1.5 h-1.5 rounded-full",
                session.connectionType === 'relay' ? "bg-status-warning" : "bg-status-success",
                !disconnected && "animate-pulse"
              )} />
              {disconnected ? 'Offline' : 'Connected'}
            </span>
            <Lock className="w-3.5 h-3.5 text-apple-ink-muted/70 shrink-0" aria-label="End-to-end encrypted" />
          </span>
        </button>

        <div className="flex items-center gap-2 shrink-0">
          <ThemeToggle />
          <button
            onPointerDown={() => setShowConnectionDetails(!showConnectionDetails)}
            title="Connection & encryption details"
            aria-label="Connection details"
            className="hidden sm:flex items-center justify-center w-10 h-10 rounded-full text-apple-ink-muted hover:text-apple-ink dark:hover:text-white hover:bg-apple-divider/50 dark:hover:bg-apple-tile-3/50 transition-colors active:scale-95"
          >
            <ShieldCheck className="w-[18px] h-[18px]" />
          </button>
          <button
            onPointerDown={() => setConfirmClose(true)}
            aria-label="End session"
            title="End session"
            className="flex items-center justify-center w-10 h-10 sm:w-auto sm:h-auto sm:px-4 sm:py-2 rounded-full sm:rounded-[10px] text-apple-ink-muted hover:text-apple-ink dark:hover:text-white hover:bg-apple-divider/50 dark:hover:bg-apple-tile-3/50 transition-colors active:scale-95 min-h-[44px] shrink-0"
          >
            <X className="w-[18px] h-[18px] sm:hidden" />
            <span className="hidden sm:inline text-[14px] font-medium">End session</span>
          </button>
        </div>

        <AnimatePresence>
          {showConnectionDetails && (
            <motion.div
              initial={{ opacity: 0, y: -5, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -5, scale: 0.95 }}
              transition={{ type: "spring", bounce: 0, duration: 0.3 }}
              className="absolute top-[calc(100%+8px)] left-4 sm:left-6 p-4 bg-white dark:bg-surface-dark border border-apple-divider dark:border-apple-tile-3 rounded-[14px] shadow-lg min-w-[240px] max-w-[320px] z-30"
            >
              <div className="flex items-center gap-2 text-[13.5px] font-semibold text-apple-ink dark:text-white mb-1.5">
                <ShieldCheck className="w-4 h-4 text-status-success" />
                End-to-end encrypted
              </div>
              <div className="text-[13px] text-apple-ink-muted leading-relaxed">
                {session.connectionType === 'relay' ? 'Connected securely through an encrypted relay — a direct connection wasn\u2019t available.' :
                  session.connectionType === 'local' ? 'Connected directly between devices on the same network.' :
                    session.connectionType === 'direct' ? 'Connected directly between devices.' :
                      'Connecting…'}
              </div>
              <div className="text-[13px] text-apple-ink-muted mt-2 pt-2 border-t border-apple-divider/50 dark:border-apple-tile-3">
                Only your two devices can read what\u2019s sent here. Nothing is stored.
              </div>
              {/* The pairing code lives here now, not on screen: it\u2019s only
                  needed if the other device drops and has to rejoin, so it\u2019s
                  one tap away instead of always visible. */}
              <PairingMini secret={session.secret} createdAt={session.createdAt} className="mt-3" />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Connected toast — the "alert" when the other device arrives. */}
      <AnimatePresence>
        {showConnected && (
          <motion.div
            initial={{ opacity: 0, y: -10, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.97 }}
            transition={{ type: 'spring', bounce: 0, duration: 0.4 }}
            role="status"
            className="absolute top-[76px] sm:top-[80px] left-1/2 -translate-x-1/2 z-40 px-4 py-2.5 rounded-full bg-apple-ink dark:bg-white text-white dark:text-night-900 shadow-float flex items-center gap-2 text-[13.5px] font-semibold whitespace-nowrap"
          >
            <ShareTextLogo size={16} motion="complete" className="text-white dark:text-night-900" />
            Connected — you can start sending
          </motion.div>
        )}
      </AnimatePresence>

      {/* Close confirmation */}
      <AnimatePresence>
        {confirmClose && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/40 dark:bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-4 sm:p-6"
            onPointerDown={() => setConfirmClose(false)}
          >
            <motion.div
              initial={{ opacity: 0, y: 24, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 24, scale: 0.97 }}
              transition={{ type: 'spring', bounce: 0, duration: 0.35 }}
              onPointerDown={(e) => e.stopPropagation()}
              className="w-full max-w-sm bg-white dark:bg-surface-dark rounded-[20px] p-6 shadow-2xl text-center"
              role="dialog"
              aria-modal="true"
              aria-label="End this session?"
            >
              <h3 className="text-[19px] font-semibold text-apple-ink dark:text-white tracking-tight mb-2">End this session?</h3>
              <p className="text-[15px] text-apple-ink-muted leading-relaxed mb-6">
                Both devices will disconnect and this connection will be permanently closed.
              </p>
              <div className="flex flex-col gap-2">
                <button
                  ref={keepSessionRef}
                  onPointerDown={() => setConfirmClose(false)}
                  className="w-full py-3.5 bg-apple-parchment dark:bg-apple-tile-2 hover:bg-apple-divider dark:hover:bg-apple-tile-3 text-apple-ink dark:text-white rounded-[14px] text-[15px] font-semibold transition-colors active:scale-[0.98] min-h-[48px]"
                >
                  Keep Session
                </button>
                <button
                  onPointerDown={closeSession}
                  className="w-full py-3.5 bg-status-danger hover:bg-[#e0352b] text-white rounded-[14px] text-[15px] font-semibold transition-colors active:scale-[0.98] min-h-[48px]"
                >
                  End session
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Disconnect banner */}
      <AnimatePresence>
        {disconnected && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            role="status"
            className="overflow-hidden bg-status-warning/10 border-b border-status-warning/20"
          >
            <div className="max-w-3xl mx-auto px-4 sm:px-6 py-3 flex items-center gap-2 text-[14px] font-medium text-status-warning-ink dark:text-status-warning-ink-dark">
              <span className="w-2 h-2 rounded-full bg-status-warning animate-pulse shrink-0" />
              Your other device disconnected. Waiting for reconnect…
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Post-transfer moment — quiet, one-time */}
      <div className="shrink-0 flex justify-center">
        <AnimatePresence>
          {showThatsIt && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
              className="overflow-hidden"
            >
              <p className="px-4 pt-3 pb-1 text-[13px] font-medium text-apple-ink-muted dark:text-white/60 text-center">
                {thatsItCopy}
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Messages */}
      <div
        ref={scrollRef}
        onScroll={onMessagesScroll}
        className="flex-1 overflow-y-auto p-4 sm:p-6 relative"
        onDragEnter={handleDragEnter}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <div className="max-w-3xl mx-auto flex flex-col space-y-3">
          {session.messages.length === 0 ? (
            <div className="h-full min-h-[40vh] flex flex-col items-center justify-center text-center space-y-3 opacity-80">
              <div className="w-14 h-14 rounded-[20px] bg-apple-parchment dark:bg-apple-tile-2 flex items-center justify-center mb-1">
                <ShareTextLogo size={26} className="text-apple-ink dark:text-white" />
              </div>
              {disconnected ? (
                <>
                  <p className="text-[17px] font-semibold text-apple-ink dark:text-white tracking-tight">Your other device is offline</p>
                  <p className="text-[14px] text-apple-ink-muted max-w-[280px] leading-relaxed">
                    The room is still open — it will reconnect when the other device comes back.
                  </p>
                </>
              ) : (
                <>
                  <p className="text-[17px] font-semibold text-apple-ink dark:text-white tracking-tight">Your private clipboard</p>
                  <p className="text-[14px] text-apple-ink-muted max-w-[260px] leading-relaxed">
                    Anything you paste here will appear on the other device.
                  </p>
                </>
              )}
            </div>
          ) : (
            <>
              {session.messages.length >= 2 && (
                <div className="flex justify-end">
                  <button
                    onPointerDown={copyAll}
                    className={cn(
                      "flex items-center gap-1.5 px-3.5 py-2 rounded-full text-[13px] font-semibold transition-motion active:scale-95",
                      copiedAll
                        ? "bg-status-success/15 text-status-success"
                        : "bg-apple-parchment dark:bg-apple-tile-2 hover:bg-apple-divider dark:hover:bg-apple-tile-3 text-apple-ink dark:text-white"
                    )}
                  >
                    {copiedAll ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                    {copiedAll ? `Copied ${session.messages.length} items` : 'Copy All'}
                  </button>
                </div>
              )}
              <AnimatePresence initial={false}>
                {session.messages.map((msg) => (
                  <MessageCard key={msg.id} msg={msg} partnerName={session.partnerName} />
                ))}
              </AnimatePresence>
            </>
          )}
          <AnimatePresence>
            {showJump && (
              <motion.button
                initial={{ opacity: 0, y: 8, scale: 0.9 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 8, scale: 0.9 }}
                transition={{ type: 'spring', bounce: 0, duration: 0.3 }}
                onPointerDown={() => { setShowJump(false); atBottomRef.current = true; messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }}
                className="self-center flex items-center gap-1.5 px-4 py-2 rounded-full bg-apple-ink dark:bg-white text-white dark:text-night-900 shadow-float text-[13px] font-semibold active:scale-95 transition-motion"
              >
                <ChevronDown className="w-3.5 h-3.5" /> New message
              </motion.button>
            )}
          </AnimatePresence>
          <div ref={messagesEndRef} />
        </div>

        {dragOver && (
          <div className="absolute inset-0 z-20 m-2 rounded-[20px] border-2 border-dashed border-apple-blue dark:border-azure-400 bg-apple-blue/10 dark:bg-azure-500/10 pointer-events-none flex items-center justify-center">
            <div className="px-5 py-3 bg-white dark:bg-surface-dark rounded-full shadow-card text-[15px] font-semibold text-apple-ink dark:text-white">
              Drop to send
            </div>
          </div>
        )}
      </div>

      {/* Contextual room rail — large desktops only. Uses the horizontal
          space without becoming a dashboard: the connection path and a
          one-line privacy note. No pairing code here — that lives in
          Connection details now, so it\u2019s not continuously exposed. */}
      <div className="hidden xl:flex absolute top-24 right-6 bottom-24 w-[228px] flex-col gap-4" aria-hidden>
        <div className="rounded-[14px] bg-white dark:bg-surface-dark border border-apple-divider dark:border-apple-tile-3 p-4 text-[12.5px] leading-relaxed text-apple-ink-muted">
          <div className="flex items-center gap-2 mb-1.5">
            <span className={cn(
              "w-1.5 h-1.5 rounded-full",
              session.connectionType === 'relay' ? "bg-status-warning" : "bg-status-success"
            )} />
            <span className="font-semibold text-apple-ink dark:text-white">
              {session.connectionType === 'relay' ? 'Relay connection' : 'Direct connection'}
            </span>
          </div>
          <p>
            {session.connectionType === 'relay'
              ? 'Connected through an encrypted relay — a direct connection wasn’t available.'
              : 'Connected directly between your two devices.'}
          </p>
          <div className="mt-3 pt-3 border-t border-apple-divider/60 dark:border-apple-tile-3">
            Encrypted between devices · Rooms are temporary
          </div>
        </div>
      </div>

      {/* Input Area */}
      <div className="p-3 sm:p-5 bg-apple-canvas/90 dark:bg-night-950/90 backdrop-blur-xl border-t border-apple-divider/50 dark:border-apple-tile-3/50 z-10 pb-[env(safe-area-inset-bottom)] relative">
        <form onSubmit={handleSend} className="max-w-3xl mx-auto flex flex-col gap-2">
          <div className="hidden sm:flex items-center justify-end gap-1.5 text-[11px] font-medium text-apple-ink-muted/70 dark:text-white/40 px-1">
            <kbd className="px-1.5 py-0.5 rounded-[5px] border border-apple-divider dark:border-apple-tile-3 bg-white/60 dark:bg-white/5 font-sans">Enter</kbd>
            <span>to send</span>
            <span className="opacity-50">·</span>
            <kbd className="px-1.5 py-0.5 rounded-[5px] border border-apple-divider dark:border-apple-tile-3 bg-white/60 dark:bg-white/5 font-sans">Shift+Enter</kbd>
            <span>for a new line</span>
          </div>

          <AnimatePresence>
            {errorMsg && (
              <motion.div role="alert" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
                <div className="px-4 py-3 bg-status-danger/10 text-status-danger text-[14px] font-medium rounded-xl flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" /> {errorMsg}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <div className="relative">
            <input type="file" ref={imageInputRef} accept="image/*" multiple className="hidden" onChange={(e) => handleFileSelect(e, 'image')} />
            <input type="file" ref={videoInputRef} accept="video/*" multiple className="hidden" onChange={(e) => handleFileSelect(e, 'video')} />
            <input type="file" ref={audioInputRef} accept="audio/*" multiple className="hidden" onChange={(e) => handleFileSelect(e, 'audio')} />
            <input type="file" ref={fileInputRef} multiple className="hidden" onChange={(e) => handleFileSelect(e, 'file')} />
          </div>

          <motion.div layout className="relative border border-apple-divider dark:border-apple-tile-3 rounded-[22px] bg-white dark:bg-surface-dark overflow-visible shadow-sm transition-motion focus-within:ring-2 focus-within:ring-apple-blue-focus/50 focus-within:border-apple-blue-focus focus-within:shadow-[0_6px_24px_-8px_rgba(46,139,255,0.25)] z-20">
            {/* Multi-attachment preview strip — up to 20 files, each with a
                circular remove button that's always visible and tappable. */}
            <AnimatePresence>
              {attachments.length > 0 && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0, filter: 'blur(4px)' }}
                  transition={{ type: "spring", bounce: 0, duration: 0.35 }}
                  className="px-3 pt-3 origin-bottom overflow-hidden"
                >
                  <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
                    <AnimatePresence initial={false}>
                      {attachments.map((a) => (
                        <motion.div
                          key={a.id}
                          layout
                          initial={{ opacity: 0, scale: 0.92 }}
                          animate={{ opacity: 1, scale: 1 }}
                          exit={{ opacity: 0, scale: 0.85, transition: { duration: 0.18 } }}
                          className="relative shrink-0"
                        >
                          {a.type === 'image' && a.file && previewUrls.has(a.id) ? (
                            <div className="w-[88px] h-[88px] sm:w-[104px] sm:h-[104px] rounded-[14px] overflow-hidden bg-apple-canvas dark:bg-black border border-apple-divider dark:border-apple-tile-3 shadow-sm">
                              <img src={previewUrls.get(a.id)} alt={a.name} className="w-full h-full object-cover" />
                            </div>
                          ) : (
                            <div className="w-[88px] h-[88px] sm:w-[104px] sm:h-[104px] rounded-[14px] bg-apple-parchment dark:bg-surface-dark-2 border border-apple-divider dark:border-apple-tile-3 flex flex-col items-center justify-center gap-0.5 p-1.5">
                              <FileTypeIcon name={a.name} mimeType={a.mimeType} size={15} />
                              <span className="text-[9.5px] font-medium text-apple-ink dark:text-white truncate max-w-full">{a.name}</span>
                              <span className="text-[9px] text-apple-ink-muted">{formatBytes(a.size)}</span>
                            </div>
                          )}
                          <RemoveAttachmentButton onClick={() => setAttachments(prev => prev.filter(x => x.id !== a.id))} />
                        </motion.div>
                      ))}
                    </AnimatePresence>
                  </div>
                  <p className="text-[11px] font-medium text-apple-ink-muted mt-1">
                    {attachments.length} of {MAX_ATTACHMENTS} attached
                  </p>
                </motion.div>
              )}
            </AnimatePresence>

            <div className="flex items-end gap-0.5 p-1 relative">
              <button
                type="button"
                onPointerDown={() => setShowAttachmentMenu(!showAttachmentMenu)}
                aria-label="Add attachment"
                aria-expanded={showAttachmentMenu}
                className={cn(
                  "w-11 h-11 rounded-full flex items-center justify-center shrink-0 text-apple-ink-muted hover:text-apple-ink dark:hover:text-white hover:bg-apple-divider/60 dark:hover:bg-apple-tile-3 transition-motion active:scale-[0.92]",
                  showAttachmentMenu && "text-azure-600 dark:text-azure-400 bg-azure-600/10 rotate-45"
                )}
              >
                <Plus className="w-5 h-5 transition-transform" />
              </button>

              <textarea
                ref={textareaRef}
                value={inputText}
                rows={1}
                onChange={(e) => setInputText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSend(e);
                  }
                }}
                placeholder="Paste or type text…"
                aria-label="Message"
                title="Enter to send · Shift+Enter for a new line"
                className="flex-1 min-h-[44px] max-h-[30vh] resize-none bg-transparent py-[9px] pl-0.5 pr-0.5 text-apple-ink dark:text-white placeholder:text-apple-ink-muted focus:outline-none text-[16px] leading-[26px]"
              />

              <button
                type="button"
                onPointerDown={handleSend}
                disabled={(!inputText.trim() && attachments.length === 0) || !session.partnerConnected}
                aria-label="Send"
                className="w-11 h-11 rounded-full flex items-center justify-center shrink-0 transition-motion active:scale-[0.92] bg-azure-600 hover:bg-azure-500 text-white shadow-[0_4px_12px_-2px_rgba(10,102,240,0.4)] disabled:opacity-25 disabled:bg-apple-divider dark:disabled:bg-apple-tile-2 disabled:text-apple-ink-muted dark:disabled:text-white/40 disabled:shadow-none"
              >
                <ArrowUp className="w-5 h-5" strokeWidth={2.4} />
              </button>

              <AnimatePresence>
                {showAttachmentMenu && (
                  <motion.div
                    initial={{ opacity: 0, y: 10, scale: 0.9, transformOrigin: 'bottom left' }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 10, scale: 0.9 }}
                    transition={{ type: "spring", bounce: 0, duration: 0.3 }}
                    className="absolute left-1 bottom-[calc(100%+8px)] bg-white/90 dark:bg-surface-dark-2/90 backdrop-blur-xl border border-apple-divider dark:border-apple-tile-3 rounded-[20px] shadow-2xl p-2 w-[210px] flex flex-col gap-1 z-30"
                  >
                    <AttachmentOption icon={<ImageIcon className="w-5 h-5 text-apple-ink-muted" />} label="Photo" onClick={() => imageInputRef.current?.click()} />
                    <AttachmentOption icon={<FileIcon className="w-5 h-5 text-apple-ink-muted" />} label="File" onClick={() => fileInputRef.current?.click()} />
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </motion.div>
        </form>
      </div>

      {showAttachmentMenu && (
        <div className="fixed inset-0 z-[5]" onPointerDown={() => setShowAttachmentMenu(false)} />
      )}
    </div>
  );
}

/** The circular ✕ that removes a staged attachment — always visible, tappable. */
function RemoveAttachmentButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onPointerDown={onClick}
      aria-label="Remove attachment"
      className="absolute -top-2.5 -right-2.5 w-7 h-7 rounded-full bg-black/75 dark:bg-black/75 text-white border border-white/25 shadow-md backdrop-blur flex items-center justify-center z-10 transition-transform active:scale-90 hover:bg-black/90"
    >
      <X className="w-4 h-4" />
    </button>
  );
}

function AttachmentOption({ icon, label, onClick }: { icon: React.ReactNode, label: string, onClick: () => void }) {
  return (
    <button
      type="button"
      onPointerDown={onClick}
      className="flex items-center gap-3 w-full p-3 hover:bg-apple-divider/50 dark:hover:bg-white/10 rounded-[14px] text-[16px] font-medium text-apple-ink dark:text-white transition-colors active:bg-apple-divider dark:active:bg-white/20"
    >
      {icon} {label}
    </button>
  );
}

const timeOf = (ts: number) => new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

/**
 * Delivery state for MY messages — a true receipt, never guessed:
 *   Sent      — the packet left this device
 *   Delivered — the OTHER device confirmed arrival (encrypted ack)
 *   Seen      — the OTHER device's room is open with it on screen (read ack)
 */
function DeliveryTick({ delivered, seen, onBlue }: { delivered?: boolean; seen?: boolean; onBlue: boolean }) {
  if (seen) {
    return (
      <span className={cn("flex items-center gap-1", onBlue ? "text-white/90" : "text-azure-600 dark:text-azure-400")}>
        <motion.span
          initial={{ scale: 0.4, opacity: 0, rotate: -12 }}
          animate={{ scale: 1, opacity: 1, rotate: 0 }}
          transition={{ type: 'spring', bounce: 0.55, duration: 0.45 }}
          className="flex"
        >
          <CheckCheck className="w-3.5 h-3.5" />
        </motion.span>
        <span className="font-semibold">Seen</span>
      </span>
    );
  }
  if (delivered) {
    return (
      <span className={cn("flex items-center gap-1", onBlue ? "text-white/80" : "text-status-success")}>
        {/* The check pops in when the peer's receipt arrives — a tiny
            confirmation that lands, not just a static icon. */}
        <motion.span
          initial={{ scale: 0.4, opacity: 0, rotate: -12 }}
          animate={{ scale: 1, opacity: 1, rotate: 0 }}
          transition={{ type: 'spring', bounce: 0.55, duration: 0.45 }}
          className="flex"
        >
          <CheckCheck className="w-3.5 h-3.5" />
        </motion.span>
        <span className="font-semibold">Delivered</span>
      </span>
    );
  }
  return (
    <span className={cn("flex items-center gap-1", onBlue ? "text-white/70" : "text-apple-ink-muted")}>
      <motion.span
        initial={{ scale: 0.4, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', bounce: 0.5, duration: 0.4 }}
        className="flex"
      >
        <Check className="w-3.5 h-3.5" />
      </motion.span>
      <span className="font-semibold">Sent</span>
    </span>
  );
}

const MessageCard: React.FC<{ msg: ChatMessage; partnerName?: string }> = ({ msg, partnerName }) => {
  const { retryTransfer, retryText, cancelTransfer, sendMessage } = useSession();
  const isMe = msg.sender === 'me';
  const a = msg.attachment;

  const [copied, setCopied] = useState(false);
  const [saved, setSaved] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [viewerOpen, setViewerOpen] = useState(false);

  // "Send back" — hand the same thing right back to the other device. Text
  // re-sends the text; an attachment re-sends the exact bytes it received.
  const sendBack = async () => {
    if (a && a.url) {
      try {
        const res = await fetch(a.url);
        const blob = await res.blob();
        const file = new File([blob], a.name, { type: a.mimeType || blob.type || 'application/octet-stream' });
        sendMessage('', {
          id: crypto.randomUUID(),
          type: a.type,
          name: a.name,
          size: a.size,
          mimeType: a.mimeType,
          status: 'draft'
        }, file);
      } catch {
        // Bytes unavailable (e.g. the object URL was revoked) — nothing to send.
      }
    } else {
      sendMessage(msg.text);
    }
  };

  const isLargeText = msg.text.length > LARGE_TEXT_THRESHOLD;
  const preview = isLargeText && !expanded ? msg.text.slice(0, LARGE_TEXT_PREVIEW) : msg.text;

  const handleCopy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = (url: string, filename: string) => {
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
    link.click();
    document.body.removeChild(link);
  };

  const [shared, setShared] = useState(false);
  // One-click Share: native sheet when the platform supports it (with the
  // actual file bytes attached), otherwise it degrades to a download — the
  // button is never a dead end.
  const handleShare = async () => {
    if (!a?.url) return;
    const name = a.name;
    const mime = a.mimeType || 'application/octet-stream';
    try {
      if (typeof navigator.share === 'function') {
        const blob = await (await fetch(a.url)).blob();
        const file = new File([blob], name, { type: mime || blob.type });
        const canSendFile = typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] });
        if (canSendFile) {
          await navigator.share({ files: [file], title: name });
        } else {
          await navigator.share({ title: 'ShareText', text: name, url: a.url });
        }
        setShared(true);
        setTimeout(() => setShared(false), 2000);
      } else {
        handleDownload(a.url, name);
      }
    } catch (e) {
      // AbortError = the user closed the sheet; anything else = the bytes
      // were unavailable, so fall back to a plain download.
      if ((e as Error)?.name !== 'AbortError') handleDownload(a.url, name);
    }
  };

  // Text-only message — a clean bubble with an in-bubble footer (no outer
  // sender label, no second action bar; that was the misaligned look).
  if (!a) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 15, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ type: 'spring', bounce: 0.3, duration: 0.5 }}
        className={cn("flex w-full", isMe ? "justify-end" : "justify-start")}
      >
        <div className={cn(
          "max-w-[88%] sm:max-w-[70%] px-4 py-2.5 rounded-[18px] shadow-sm border",
          isMe
            ? "bg-azure-600 text-white rounded-br-[6px] border-transparent"
            : "bg-white dark:bg-surface-dark text-apple-ink dark:text-white rounded-bl-[6px] border-apple-divider/50 dark:border-apple-tile-3"
        )}>
          <div className="text-[15.5px] whitespace-pre-wrap leading-relaxed break-words">
            {preview}
            {isLargeText && !expanded && (
              <button
                onPointerDown={() => setExpanded(true)}
                className={cn("mt-1.5 flex items-center gap-1 text-[14px] font-semibold active:opacity-70", isMe ? "text-white/90" : "text-apple-blue")}
              >
                <ChevronDown className="w-4 h-4" /> Show full text
              </button>
            )}
            {isLargeText && expanded && (
              <button
                onPointerDown={() => setExpanded(false)}
                className={cn("mt-1.5 flex items-center gap-1 text-[14px] font-semibold active:opacity-70", isMe ? "text-white/90" : "text-apple-blue")}
              >
                <ChevronUp className="w-4 h-4" /> Collapse
              </button>
            )}
          </div>
          <div className="mt-1 flex items-center justify-end gap-1.5">
            {msg.delivery === 'failed' ? (
              <>
                <span className={cn("text-[12.5px] font-semibold flex items-center gap-1", isMe ? "text-white" : "text-status-danger")}>
                  <AlertCircle className="w-3.5 h-3.5" /> Couldn't send
                </span>
                <button
                  onPointerDown={() => { void retryText(msg.id); }}
                  className={cn("flex items-center gap-1 px-2.5 py-1 rounded-full text-[12px] font-semibold transition-motion active:scale-95", isMe ? "bg-white/20 text-white" : "bg-apple-parchment dark:bg-apple-tile-2 text-apple-ink dark:text-white")}
                >
                  <RefreshCw className="w-3 h-3" /> Retry
                </button>
              </>
            ) : (
              <>
                <span className={cn("text-[11.5px] font-medium flex items-center gap-1", isMe ? "text-white/75" : "text-apple-ink-muted")}>
                  {isMe ? (
                    <DeliveryTick delivered={msg.delivered} seen={msg.seen} onBlue />
                  ) : msg.source === 'push' ? (
                    <span className="font-semibold flex items-center gap-1">
                      <Terminal className="w-3 h-3" /> From your push link
                    </span>
                  ) : (
                    <span className="font-semibold">Received</span>
                  )}
                  {' • '}{timeOf(msg.timestamp)}
                </span>
                {!isMe && (
                  <button
                    onPointerDown={() => { void sendBack(); }}
                    aria-label="Send back"
                    title="Send back to the other device"
                    className="flex items-center justify-center w-7 h-7 rounded-full transition-motion active:scale-90 text-apple-ink-muted hover:text-apple-blue dark:hover:text-azure-400 hover:bg-apple-divider/60 dark:hover:bg-apple-tile-3"
                  >
                    <ArrowUp className="w-3.5 h-3.5" />
                  </button>
                )}
                <button
                  onPointerDown={() => handleCopy(msg.text)}
                  aria-label="Copy message"
                  title="Copy"
                  className={cn(
                    "flex items-center justify-center w-7 h-7 rounded-full transition-motion active:scale-90",
                    copied
                      ? (isMe ? "text-white" : "text-status-success")
                      : isMe ? "text-white/60 hover:text-white hover:bg-white/15" : "text-apple-ink-muted hover:text-apple-ink dark:hover:text-white hover:bg-apple-divider/60 dark:hover:bg-apple-tile-3"
                  )}
                >
                  {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
              </>
            )}
          </div>
        </div>
      </motion.div>
    );
  }

  // Attachment message — image/video/file card.
  const isImage = a.type === 'image';
  const isVideo = a.type === 'video';
  const complete = a.status === 'complete' && a.url;

  return (
    <motion.div
      initial={{ opacity: 0, y: 15, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ type: 'spring', bounce: 0.3, duration: 0.5 }}
      className={cn("flex w-full", isMe ? "justify-end" : "justify-start")}
    >
      <div className={cn(
        "flex flex-col gap-2 max-w-[88%] sm:max-w-[70%] w-full",
        isMe ? "items-end" : "items-start"
      )}>
        <div className={cn(
          "flex flex-col w-full overflow-hidden rounded-[20px] shadow-sm border",
          isMe
            ? "bg-azure-600 text-white rounded-br-[6px] border-transparent"
            : "bg-white dark:bg-surface-dark border-apple-divider/50 dark:border-apple-tile-3 rounded-bl-[6px]"
        )}>
          {/* Text caption (if any) */}
          {msg.text && (
            <div className={cn("px-4 py-3 text-[15.5px] whitespace-pre-wrap leading-relaxed break-words", isMe ? "text-white" : "text-apple-ink dark:text-white")}>
              {msg.text}
            </div>
          )}

          {/* Image — tap to view full quality */}
          {isImage && (
            <div className={cn("relative w-full overflow-hidden bg-black/5 dark:bg-white/5", msg.text && "border-t border-white/10 dark:border-apple-tile-3/50")}>
              {complete ? (
                <button
                  type="button"
                  onPointerDown={() => setViewerOpen(true)}
                  className="block w-full cursor-zoom-in group relative"
                  aria-label={`View ${a.name}`}
                >
                  <img src={a.url} alt={a.name} className="w-full h-auto object-contain max-h-[60vh] block" />
                  <span className="absolute bottom-2.5 right-2.5 flex items-center gap-1 px-2.5 py-1.5 rounded-full bg-black/55 text-white text-[12px] font-semibold backdrop-blur opacity-90 group-hover:opacity-100 transition-opacity pointer-events-none">
                    <ZoomIn className="w-3.5 h-3.5" /> View
                  </span>
                </button>
              ) : (
                <div className={cn("w-full aspect-video flex flex-col items-center justify-center", isMe ? "text-white/80" : "text-apple-ink-muted")}>
                  <ImageIcon className="w-8 h-8 mb-2 opacity-50" />
                  <ProgressState attachment={a} isMe={isMe} onBlue={isMe} />
                </div>
              )}
            </div>
          )}

          {/* Video — plays inline */}
          {isVideo && (
            <div className="relative w-full aspect-video bg-black/90 flex items-center justify-center overflow-hidden">
              {complete ? (
                <video src={a.url} controls preload="metadata" className="w-full h-full object-contain bg-black" />
              ) : (
                <div className="text-white/70 flex flex-col items-center">
                  <Play className="w-10 h-10 mb-3 opacity-50" />
                  <ProgressState attachment={a} isMe={isMe} onBlue />
                </div>
              )}
            </div>
          )}

          {/* File / Audio */}
          {(a.type === 'file' || a.type === 'audio') && (
            <div className={cn("p-4 flex items-center gap-3.5", isMe ? "bg-white/10" : "bg-apple-canvas/50 dark:bg-black/20")}>
              <FileTypeIcon name={a.name} mimeType={a.mimeType} size={20} />
              <div className="flex flex-col flex-1 truncate min-w-0">
                <span className={cn("text-[14.5px] font-semibold truncate", isMe ? "text-white" : "text-apple-ink dark:text-white")}>{a.name}</span>
                <span className={cn("text-[12.5px] font-medium", isMe ? "text-white/70" : "text-apple-ink-muted")}>{formatBytes(a.size)}</span>
              </div>
            </div>
          )}

          {/* Audio playback — plays once the transfer completes */}
          {a.type === 'audio' && complete && (
            <div className={cn("px-4 pb-4", isMe ? "bg-white/10" : "bg-apple-canvas/50 dark:bg-black/20")}>
              <audio src={a.url} controls className="w-full" preload="metadata" />
            </div>
          )}

          {/* Footer: status + time + actions */}
          <div className={cn(
            "px-4 py-2.5 border-t flex items-center justify-between gap-2",
            isMe ? "border-white/15 bg-white/10" : "border-apple-divider/50 dark:border-apple-tile-3 bg-apple-canvas/30 dark:bg-black/10"
          )}>
            <div className="flex flex-col min-w-0">
              {a.status === 'complete' ? (
                <span className={cn("text-[11.5px] font-medium flex items-center gap-1", isMe ? "text-white/75" : "text-apple-ink-muted")}>
                  {isMe ? <DeliveryTick delivered={msg.delivered} seen={msg.seen} onBlue /> : msg.source === 'push' ? (
                    <span className="font-semibold flex items-center gap-1"><Terminal className="w-3 h-3" /> Sent from your computer</span>
                  ) : <span className="font-semibold">Received</span>}
                  {' • '}{formatBytes(a.size)}{' • '}{timeOf(msg.timestamp)}
                </span>
              ) : (
                <span className={cn("text-[12.5px] font-semibold", a.status === 'failed' ? (isMe ? "text-white" : "text-status-danger") : a.status === 'cancelled' || a.status === 'interrupted' ? (isMe ? "text-white/80" : "text-apple-ink-muted") : isMe ? "text-white" : "text-apple-blue")}>
                  {a.status === 'failed' ? 'Couldn\u2019t send this file.' :
                    a.status === 'cancelled' ? 'Cancelled' :
                      a.status === 'interrupted' ? 'Connection interrupted — waiting to reconnect…' :
                        a.status === 'resuming' ? `Resuming… ${Math.round((a.progress || 0) * 100)}%` :
                          a.status === 'sending' ? `Sending… ${Math.round((a.progress || 0) * 100)}%` :
                            `Receiving… ${Math.round((a.progress || 0) * 100)}%`}
                </span>
              )}
            </div>

            <div className="flex gap-1.5 shrink-0">
              {complete && (
                <>
                  {!isMe && (
                    <ActionButton icon={<ArrowUp />} label="Send back" onClick={() => { void sendBack(); }} onBlue={isMe} />
                  )}
                  {a.type === 'image' && (
                    <ActionButton icon={copied ? <Check /> : <Copy />} label={copied ? "Copied" : "Copy"} active={copied} onClick={() => handleCopy(a.url!)} onBlue={isMe} />
                  )}
                  <ActionButton icon={<Share2 />} label={shared ? "Shared" : "Share"} active={shared} onClick={() => { void handleShare(); }} onBlue={isMe} />
                  <ActionButton icon={saved ? <Check /> : <Download />} label={saved ? "Saved" : "Save"} active={saved} onClick={() => handleDownload(a.url!, a.name)} primary onBlue={isMe} />
                </>
              )}
              {(a.status === 'sending' || a.status === 'receiving' || a.status === 'interrupted' || a.status === 'resuming') && (
                <ActionButton icon={<X />} label="Cancel" onClick={() => { void cancelTransfer(msg.id); }} onBlue={isMe} />
              )}
              {(a.status === 'failed' || (a.status === 'cancelled' && isMe) || (a.status === 'interrupted' && isMe)) && (
                <ActionButton icon={<RefreshCw />} label="Retry" onClick={() => { void retryTransfer(msg.id); }} onBlue={isMe} />
              )}
            </div>
          </div>

          {/* Progress bar */}
          {a.status !== 'complete' && a.status !== 'draft' && a.status !== 'failed' && a.status !== 'cancelled' && (
            <div className={cn("w-full h-1 overflow-hidden", isMe ? "bg-white/20" : "bg-apple-divider dark:bg-apple-tile-3")}>
              <div className={cn("h-full origin-left transition-transform duration-300 ease-out", isMe ? "bg-white" : "bg-apple-blue")} style={{ transform: `scaleX(${a.progress || 0})` }} />
            </div>
          )}
        </div>

        {viewerOpen && complete && (
          <ImageViewer src={a.url!} name={a.name} onClose={() => setViewerOpen(false)} />
        )}
      </div>
    </motion.div>
  );
};

function ProgressState({ attachment: a, isMe, onBlue }: { attachment: Attachment, isMe: boolean, onBlue?: boolean }) {
  if (a.status === 'failed') return <span className={cn("font-medium", onBlue ? "text-white" : "text-status-danger")}>Couldn't send this file.</span>;
  if (a.status === 'cancelled') return <span className={cn("font-medium", onBlue ? "text-white/80" : "text-apple-ink-muted")}>Cancelled</span>;
  if (a.status === 'complete') return null;
  if (a.status === 'interrupted') return <span className={cn("font-medium", onBlue ? "text-white" : "text-apple-ink-muted")}>Connection interrupted</span>;
  if (a.status === 'resuming') return <span className={cn("font-medium", onBlue ? "text-white" : "text-apple-blue")}>Resuming… {Math.round((a.progress || 0) * 100)}%</span>;
  return (
    <span className={cn("font-medium animate-pulse", onBlue ? "text-white" : "text-apple-ink-muted")}>
      {isMe ? 'Sending…' : 'Receiving…'} {Math.round((a.progress || 0) * 100)}%
    </span>
  );
}

function ActionButton({ icon, label, onClick, active, primary, onBlue }: { icon: React.ReactNode, label: string, onClick: () => void, active?: boolean, primary?: boolean, onBlue?: boolean }) {
  return (
    <button
      onPointerDown={onClick}
      className={cn(
        "flex items-center gap-1.5 px-3 py-2 rounded-full text-[12.5px] font-semibold transition-motion active:scale-95 min-h-[40px]",
        active
          ? onBlue ? "bg-white/25 text-white" : "bg-status-success/15 text-status-success"
          : primary
            ? onBlue
              ? "bg-white text-azure-700 hover:bg-white/90"
              : "bg-apple-blue hover:bg-apple-blue-focus text-white"
            : onBlue
              ? "bg-white/15 text-white hover:bg-white/25"
              : "bg-apple-parchment dark:bg-apple-tile-2 hover:bg-apple-divider dark:hover:bg-apple-tile-3 text-apple-ink dark:text-white"
      )}
    >
      <motion.span
        key={active ? 'check' : 'icon'}
        initial={{ scale: 0.5, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', bounce: 0, duration: 0.25 }}
        className="[&>svg]:w-3.5 [&>svg]:h-3.5"
      >
        {active ? <Check /> : icon}
      </motion.span>
      {label}
    </button>
  );
}

/**
 * Full-screen image viewer — same original quality, zoomable.
 * Wheel / pinch to zoom, drag to pan, double-tap or double-click to toggle,
 * Esc or backdrop to close. Touch-friendly and keyboard-friendly.
 */
function ImageViewer({ src, name, onClose }: { src: string; name: string; onClose: () => void }) {
  const [scale, setScale] = useState(1);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinchDist = useRef<number | null>(null);
  const lastTap = useRef(0);

  const clampScale = (s: number) => Math.min(6, Math.max(1, s));

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'r' || e.key === 'R') { setScale(1); setPos({ x: 0, y: 0 }); }
    };
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [onClose]);

  const onWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.18 : 1 / 1.18;
    setScale(s => clampScale(s * factor));
  };

  const onPointerDown = (e: React.PointerEvent) => {
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const now = Date.now();
    if (now - lastTap.current < 300) {
      // Double tap — toggle zoom
      setScale(s => (s > 1 ? 1 : 2.5));
      setPos({ x: 0, y: 0 });
      pointers.current.clear();
      pinchDist.current = null;
    }
    lastTap.current = now;
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const p = pointers.current.get(e.pointerId);
    if (!p) return;
    const dx = e.clientX - p.x;
    const dy = e.clientY - p.y;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pointers.current.size === 1 && scale > 1) {
      setPos(pp => ({ x: pp.x + dx, y: pp.y + dy }));
    } else if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      const prev = pinchDist.current ?? dist;
      pinchDist.current = dist;
      if (prev > 0) setScale(s => clampScale(s * (dist / prev)));
    }
  };

  const onPointerUp = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinchDist.current = null;
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-black/92 backdrop-blur-md flex items-center justify-center"
      onPointerDown={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={`Viewing ${name}`}
    >
      <div
        className="max-w-full max-h-full overflow-hidden select-none touch-none cursor-grab active:cursor-grabbing"
        onPointerDown={(e) => { e.stopPropagation(); onPointerDown(e); }}
        onPointerMove={onPointerMove}
        onPointerUp={(e) => { e.stopPropagation(); onPointerUp(e); }}
        onPointerCancel={(e) => { e.stopPropagation(); onPointerUp(e); }}
        onWheel={onWheel}
      >
        <img
          src={src}
          alt={name}
          draggable={false}
          className="max-h-[92vh] max-w-[95vw] object-contain select-none"
          style={{ transform: `translate(${pos.x}px, ${pos.y}px) scale(${scale})`, transition: scale === 1 ? 'transform 0.25s ease' : 'none' }}
        />
      </div>

      <button
        onPointerDown={(e) => { e.stopPropagation(); onClose(); }}
        aria-label="Close image"
        className="absolute top-4 right-4 w-11 h-11 rounded-full bg-black/55 border border-white/20 text-white flex items-center justify-center backdrop-blur hover:bg-black/75 transition-colors active:scale-95"
      >
        <X className="w-5 h-5" />
      </button>

      <div className="absolute bottom-5 left-1/2 -translate-x-1/2 flex items-center gap-2 px-4 py-2 rounded-full bg-black/55 border border-white/15 text-white/90 text-[13px] font-medium backdrop-blur max-w-[90vw]">
        <span className="truncate max-w-[220px]">{name}</span>
        <span className="w-px h-3.5 bg-white/25" />
        <span className="flex items-center gap-1 whitespace-nowrap">
          <ZoomIn className="w-3.5 h-3.5" /> {Math.round(scale * 100)}% · scroll or pinch to zoom
        </span>
      </div>
    </motion.div>
  );
}

/** Compact live pairing code — used inside Connection details, so a dropped
 *  device can rejoin without reopening the Connect screen, without exposing
 *  the code continuously on screen. Re-ticks every second. */
function PairingMini({ secret, createdAt, className }: { secret: string, createdAt?: number, className?: string }) {
  const [code, setCode] = useState(() => generateTOTP(secret, createdAt));
  const [remaining, setRemaining] = useState(() => getTOTPRemainingSeconds(createdAt));
  useEffect(() => {
    const t = setInterval(() => {
      setCode(generateTOTP(secret, createdAt));
      setRemaining(getTOTPRemainingSeconds(createdAt));
    }, 1000);
    return () => clearInterval(t);
  }, [secret, createdAt]);
  return (
    <div className={cn("rounded-[14px] bg-apple-parchment/60 dark:bg-apple-tile-1 border border-apple-divider/60 dark:border-apple-tile-3 p-3", className)}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10.5px] font-semibold tracking-widest uppercase text-apple-ink-muted">Rejoin code</span>
        <span className={cn("text-[11px] font-medium tnum", remaining <= 3 ? "text-status-danger" : "text-apple-ink-muted")}>
          {Math.ceil(remaining)}s
        </span>
      </div>
      <div className="flex justify-between gap-1">
        {code.split('').map((d, i) => (
          <React.Fragment key={i}>
            <span className="flex-1 aspect-[3/4] bg-white dark:bg-black rounded-[8px] border border-apple-divider/50 dark:border-apple-tile-3 flex items-center justify-center font-mono tnum text-[16px] font-semibold text-apple-ink dark:text-white">
              {d}
            </span>
            {i === 2 && <span className="w-1.5" />}
          </React.Fragment>
        ))}
      </div>
      <p className="text-[11px] text-apple-ink-muted mt-2 leading-snug">
        If the other device drops, it can rejoin with this code.
      </p>
    </div>
  );
}
