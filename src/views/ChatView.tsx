import React, { useState, useRef, useEffect, useMemo } from 'react';
import { useSession } from '../lib/SessionContext';
import { motion, AnimatePresence } from 'motion/react';
import { AttachmentPanel } from '../components/AttachmentPanel';
import { AttachmentFlight } from '../components/AttachmentFlight';
import { TransferFlight } from '../components/TransferFlight';
import {
  X, Plus, Copy, Check, Play, AlertCircle, ChevronDown, ArrowUp, ShieldCheck, LogOut
} from 'lucide-react';
import { FileTypeIcon } from '../components/FileTypeIcon';
import { AnimatedIcon } from '../components/AnimatedIcon';
import { cn, formatBytes } from '../lib/utils';
import { Attachment } from '../types';
import { MessageCard } from '../components/MessageCard';
import { ShareTextLogo } from '../components/ShareTextLogo';
import { ThemeToggle } from '../components/ThemeToggle';
import { generateTOTP, getTOTPRemainingSeconds } from '../lib/totp';
import { saveDraft, loadDraft, clearDraft, ComposerDraft } from '../lib/draftStore';
import { useFocusTrap } from '../lib/useFocusTrap';
export function ChatView({ panelMode }: { panelMode?: string } = {}) {
  const { session, sendMessage, closeSession, cancelTransfer, requestReconnect } = useSession();
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
  const endSessionTrapRef = useFocusTrap(confirmClose, () => setConfirmClose(false));
  const connectionDetailsTrapRef = useFocusTrap(showConnectionDetails, () => setShowConnectionDetails(false));
  const [showThatsIt, setShowThatsIt] = useState(false);
  const [thatsItCopy, setThatsItCopy] = useState("That's it. It's on the other device.");
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
  const plusButtonRef = useRef<HTMLButtonElement>(null);
  const composerStripRef = useRef<HTMLDivElement>(null);
  const [flyingFiles, setFlyingFiles] = useState<File[]>([]);
  const [flightFromRect, setFlightFromRect] = useState<DOMRect | null>(null);
  const [flightToRect, setFlightToRect] = useState<DOMRect | null>(null);
  // Object URLs for staged image previews, keyed by attachment id; revoked
  // when the set changes (or on unmount) so we never leak blob URLs.
  const previewUrls = useMemo(() => {
    const map = new Map<string, string>();
    for (const a of attachments) {
      // Images preview as a thumbnail; videos get a metadata frame (the
      // browser decodes the first frame without loading the whole file) so
      // the composer shows what you're about to send, not a generic tile.
      if ((a.type === 'image' || a.type === 'video') && a.file) map.set(a.id, URL.createObjectURL(a.file));
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
      setAnnouncement('Other device disconnected');
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
      setThatsItCopy(last?.sender === 'me' ? "That's it. It's on the other device." : "That's it. It arrived.");
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
        setErrorMsg(`${file.name} is larger than 100 MB. Photos above 100 MB still transfer full quality. They arrive as a file you can open, with no preview.`);
        continue;
      }
      if (file.size > 4 * 1024 * 1024 * 1024) {
        setErrorMsg(`${file.name} is too large. ShareText works best with files under a few hundred MB. Try a smaller file or a different method.`);
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
      // The strip mounts AFTER this state update commits, so defer measuring
      // until the DOM has the new thumbnails — then fly the picked files from
      // the + button to the strip (AttachmentFlight).
      setTimeout(() => {
        const from = plusButtonRef.current?.getBoundingClientRect();
        const to = composerStripRef.current?.getBoundingClientRect();
        if (!from || !to) return;
        setFlightFromRect(from);
        setFlightToRect(to);
        setFlyingFiles(accepted.map(a => a.file));
      }, 50);
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
    // On mobile, blur the textarea to dismiss the keyboard after sending.
    textareaRef.current?.blur();
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
  // Transfer flight: while a file is genuinely in motion (sender hashing it
  // first, then bytes moving), a compact tile travels across the room between
  // the two device sides, driven by real progress. When the transfer ends,
  // AnimatePresence's `custom` tells the exiting tile to settle into the card
  // (complete) or fade away (cancel/disconnect).
  const flight = useMemo(() => {
    for (let i = session.messages.length - 1; i >= 0; i--) {
      const a = session.messages[i].attachment;
      if (!a) continue;
      const st = a.status;
      if (st === 'sending' || st === 'receiving' || st === 'resuming') {
        return {
          active: true as const,
          name: a.name || 'file',
          progress: Math.min(1, a.progress ?? 0),
          reverse: session.messages[i].sender === 'partner',
          size: a.size ?? 0,
        };
      }
      // Newest attachment is terminal (complete/cancelled/failed/…): the
      // flight is over. Complete → settle into the card; anything else → fade.
      return { active: false as const, exitMode: st === 'complete' ? ('settle' as const) : ('fade' as const) };
    }
    return null;
  }, [session.messages]);

  return (
    <div
      data-app-state="connected"
      className={cn("relative flex flex-col bg-apple-canvas dark:bg-night-950 font-sans", panelMode === "embedded" ? "h-full" : "h-dvh")}
      style={visualHeight ? { height: `${visualHeight}px` } : undefined}
    >
      {/* Transfer flight overlay — the file traveling device-to-device. */}
      <AnimatePresence custom={flight?.exitMode ?? 'fade'} initial={false}>
        {flight?.active && (
          <TransferFlight
            feedRef={scrollRef}
            progress={flight.progress}
            reverse={flight.reverse}
            name={flight.name}
            size={flight.size}
          />
        )}
      </AnimatePresence>
      {/* Screen-reader live region — invisible, announced on state changes */}
      <div aria-live="polite" role="status" className="sr-only">{announcement}</div>
      {panelMode !== "embedded" && (<> {/* Header — device relationship, not chat */}
      <div className="flex items-center justify-between gap-3 px-4 sm:px-5 py-3 shrink-0 border-b border-apple-divider/40 dark:border-white/[0.06] bg-white/60 dark:bg-[#120e22]/60 backdrop-blur-2xl backdrop-saturate-[1.8] z-20 sticky top-0">
        <div className="flex items-center gap-3 min-w-0">
          <ShareTextLogo size={18} className="text-apple-ink dark:text-white shrink-0" />
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-[14px] font-semibold text-apple-ink dark:text-white truncate">ShareText</span>
            <span className="w-px h-3.5 bg-apple-divider dark:bg-white/10" />
            <span className="flex items-center gap-1.5 text-[12px] font-medium text-apple-ink-muted dark:text-white/50">
              <span className={cn(
                "w-1.5 h-1.5 rounded-full",
                disconnected ? "bg-apple-ink-muted" : "bg-status-success",
                !disconnected && "animate-pulse"
              )} />
              {disconnected ? 'Offline' : 'Connected'}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <ThemeToggle />
          <button
            data-testid="connection-details"
            onPointerDown={() => setShowConnectionDetails(!showConnectionDetails)}
            title="Connection details"
            aria-label="Connection details"
            className="hidden sm:flex items-center justify-center w-9 h-9 rounded-full text-apple-ink-muted hover:text-apple-ink dark:hover:text-white hover:bg-apple-divider/40 dark:hover:bg-white/[0.06] transition-colors"
          >
            <ShieldCheck className="w-[16px] h-[16px]" />
          </button>
          <button
            data-testid="end-session"
            onPointerDown={() => setConfirmClose(true)}
            aria-label="Disconnect"
            className="flex items-center justify-center w-11 h-11 sm:w-auto sm:px-3 sm:py-1.5 rounded-full sm:rounded-[8px] text-apple-ink-muted hover:text-apple-ink dark:hover:text-white hover:bg-apple-divider/40 dark:hover:bg-white/[0.06] transition-colors min-h-[44px] shrink-0"
          >
            <LogOut className="w-[16px] h-[16px] sm:hidden" />
            <span className="hidden sm:inline text-[13px] font-medium">Disconnect</span>
          </button>
        </div>
        <AnimatePresence>
          {showConnectionDetails && (
            <motion.div
              ref={connectionDetailsTrapRef}
              initial={{ opacity: 0, y: -5, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 5, scale: 0.95 }}
              transition={{ type: "spring", bounce: 0, duration: 0.25 }}
              className="absolute top-[calc(100%+8px)] left-4 sm:left-6 p-4 bg-white dark:bg-surface-dark border border-apple-divider dark:border-apple-tile-3 rounded-[14px] shadow-lg min-w-[240px] max-w-[320px] z-30"
              role="dialog"
              aria-modal="true"
              aria-label="Connection details"
              onPointerDown={(e) => { if (e.target === e.currentTarget) setShowConnectionDetails(false); }}
            >
              <div className="flex items-center justify-between gap-2 text-[13px] font-semibold text-apple-ink dark:text-white mb-1.5">
                <span className="flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-status-success" />
                  Secure connection
                </span>
                <button
                  onPointerDown={() => setShowConnectionDetails(false)}
                  aria-label="Close connection details"
                  className="w-6 h-6 rounded-full flex items-center justify-center hover:bg-apple-divider/50 dark:hover:bg-white/10 transition-colors"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
              <div className="text-[13px] text-apple-ink-muted leading-relaxed">
                {session.connectionType === 'relay' ? 'Connected through an encrypted relay.' :
                  session.connectionType === 'local' ? 'Direct connection, same network.' :
                    session.connectionType === 'direct' ? 'Direct connection between devices.' :
                      'Connecting…'}
              </div>
              <div className="text-[12px] text-apple-ink-muted mt-2 pt-2 border-t border-apple-divider/50 dark:border-apple-tile-3">
                Encrypted on the way. Gone when the room closes.
              </div>
              {/* The pairing code lives here now, not on screen: it\u2019s only
                  needed if the other device drops and has to rejoin, so it\u2019s
                  one tap away instead of always visible. */}
              <PairingMini secret={session.secret} createdAt={session.createdAt} className="mt-3" />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      </>)} {/* Connected toast — the "alert" when the other device arrives. */}
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
            Connected. You can start sending
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
            className="fixed inset-0 z-50 bg-black/40 dark:bg-black/60 flex items-end sm:items-center justify-center p-4 sm:p-6"
            onPointerDown={() => setConfirmClose(false)}
          >
            <motion.div
              initial={{ opacity: 0, y: 24, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 24, scale: 0.97 }}
              transition={{ type: 'spring', bounce: 0, duration: 0.35 }}
              onPointerDown={(e) => e.stopPropagation()}
              className="w-full max-w-sm bg-white dark:bg-surface-dark rounded-[20px] p-6 shadow-2xl text-center"
              ref={endSessionTrapRef}
              role="dialog"
              aria-modal="true"
              aria-labelledby="end-session-heading"
            >
              <h3 id="end-session-heading" className="text-[18px] font-semibold text-apple-ink dark:text-white tracking-tight mb-2">Disconnect?</h3>
              <p className="text-[14px] text-apple-ink-muted leading-relaxed mb-6">
                Both devices will disconnect. This connection will be closed.
              </p>
              <div className="flex flex-col gap-2">
                <button
                  ref={keepSessionRef}
                  data-testid="end-session-cancel"
                  onPointerDown={() => setConfirmClose(false)}
                  style={{ touchAction: 'manipulation' }}
                  className="w-full py-3.5 bg-apple-parchment dark:bg-apple-tile-2 hover:bg-apple-divider dark:hover:bg-apple-tile-3 text-apple-ink dark:text-white rounded-[14px] text-[15px] font-semibold transition-colors active:scale-[0.98] min-h-[48px]"
                >
                  Keep connected
                </button>
                <button
                  data-testid="end-session-confirm"
                  onPointerDown={closeSession}
                  style={{ touchAction: 'manipulation' }}
                  className="w-full py-3.5 bg-status-danger hover:bg-[#e0352b] text-white rounded-[14px] text-[15px] font-semibold transition-colors active:scale-[0.98] min-h-[48px]"
                >
                  Disconnect
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
            <div data-testid="disconnect-banner" className="max-w-3xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between gap-2 text-[14px] font-medium text-status-warning-ink dark:text-status-warning-ink-dark">
              <span className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-status-warning animate-pulse shrink-0" />
                Other device disconnected. Waiting to reconnect…
              </span>
              <button
                data-testid="reconnect"
                onPointerDown={() => void requestReconnect()}
                className="px-3 py-1.5 rounded-full text-[13px] font-semibold bg-status-warning/15 hover:bg-status-warning/25 transition-colors active:scale-95 shrink-0"
              >
                Reconnect
              </button>
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
        <div className="max-w-3xl mx-auto flex flex-col h-full">
          {session.messages.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center space-y-3 min-h-[40vh]">
              {disconnected ? (
                <>
                  <p className="text-[16px] font-semibold text-apple-ink dark:text-white">Other device is offline</p>
                  <p className="text-[13px] text-apple-ink-muted max-w-[260px] leading-relaxed">
                    It will reconnect when the other device comes back.
                  </p>
                </>
              ) : (
                <div className="flex flex-col items-center">
                  <EmptyRoomIllustration />
                  <p className="text-[15px] font-semibold text-apple-ink dark:text-white mt-4">Ready when you are</p>
                  <p className="text-[13px] text-apple-ink-muted max-w-[260px] leading-relaxed mt-1">
                    Type, paste, or drop anything. It goes straight to the other device.
                  </p>
                </div>
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
                    {copiedAll ? <AnimatedIcon animate="check" active={copiedAll}><Check className="w-3.5 h-3.5" /></AnimatedIcon> : <AnimatedIcon animate="copy" active={copiedAll}><Copy className="w-3.5 h-3.5" /></AnimatedIcon>}
                    {copiedAll ? `Copied ${session.messages.length} items` : 'Copy All'}
                  </button>
                </div>
              )}
              <AnimatePresence initial={false}>
                {session.messages.map((msg, idx) => (
                  <MessageCard
                    key={msg.id}
                    msg={msg}
                    isGroupStart={idx === 0 || session.messages[idx - 1].sender !== msg.sender}
                    isGroupEnd={idx === session.messages.length - 1 || session.messages[idx + 1].sender !== msg.sender}
                  />
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
            <div className="flex flex-col items-center gap-2 px-8 py-6 bg-white dark:bg-surface-dark rounded-[20px] border border-apple-blue/20 dark:border-azure-400/20">
              <div className="w-12 h-12 rounded-full bg-apple-blue/10 dark:bg-azure-400/10 flex items-center justify-center">
                <ArrowUp className="w-5 h-5 text-apple-blue dark:text-azure-400" />
              </div>
              <span className="text-[15px] font-semibold text-apple-ink dark:text-white">Drop to send</span>
              <span className="text-[13px] text-apple-ink-muted dark:text-white/50">Files will be sent instantly</span>
            </div>
          </div>
        )}
      </div>
      {/* Input Area */}
      <div className="p-3 sm:p-5 bg-white/80 dark:bg-[#120e22]/80 border-t border-black/[0.06] dark:border-white/[0.04] z-10 pb-[env(safe-area-inset-bottom)] relative">
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
                <div data-testid="error-message" className="px-4 py-3 bg-status-danger/10 text-status-danger text-[14px] font-medium rounded-xl flex items-center gap-2">
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
          <motion.div layout className={cn("relative rounded-[24px] bg-white dark:bg-[#1a1a22] overflow-visible shadow-[0_1px_2px_rgba(0,0,0,0.04),0_10px_28px_-14px_rgba(0,0,0,0.14)] dark:shadow-[0_1px_2px_rgba(0,0,0,0.2),0_12px_32px_-14px_rgba(0,0,0,0.5)] transition-motion focus-within:ring-2 focus-within:ring-[#8b7cf6]/30 border border-black/[0.04] dark:border-white/[0.06]", showAttachmentMenu ? "z-[45]" : "z-20")}>
          {/* The composer sits above the attachment panel's full-screen
              backdrop while the menu is open, so the + button (and the whole
              composer) stays clickable — otherwise the backdrop eats the click
              that should toggle the menu closed. */}
            {/* Multi-attachment preview strip — up to 20 files, each with a
                circular remove button that's always visible and tappable. */}
            <AnimatePresence>
              {attachments.length > 0 && (
                <motion.div
                  ref={composerStripRef}
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
                          {a.type === 'video' && a.file && previewUrls.has(a.id) ? (
                            <div className="relative w-[88px] h-[88px] sm:w-[104px] sm:h-[104px] rounded-[14px] overflow-hidden bg-black border border-apple-divider dark:border-apple-tile-3 shadow-sm">
                              <video src={previewUrls.get(a.id)} muted playsInline preload="metadata" className="w-full h-full object-cover" />
                              <span className="absolute inset-0 flex items-center justify-center pointer-events-none">
                                <span className="w-6 h-6 rounded-full bg-black/55 backdrop-blur flex items-center justify-center">
                                  <Play className="w-3 h-3 text-white ml-0.5" />
                                </span>
                              </span>
                            </div>
                          ) : a.type === 'image' && a.file && previewUrls.has(a.id) ? (
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
                ref={plusButtonRef}
                type="button"
                data-testid="add-attachment"
                onPointerDown={() => setShowAttachmentMenu(!showAttachmentMenu)}
                aria-label="Add attachment"
                aria-expanded={showAttachmentMenu}
                className={cn(
                  "w-[34px] h-[34px] rounded-full flex items-center justify-center shrink-0 text-[#8b7cf6] dark:text-[#a78bfa] hover:bg-[#8b7cf6]/10 dark:hover:bg-[#8b7cf6]/10 transition-motion active:scale-90",
                  showAttachmentMenu && "text-[#8b7cf6] dark:text-[#a78bfa] bg-[#8b7cf6]/10 rotate-45"
                )}
              >
                <Plus className="w-5 h-5 transition-transform" />
              </button>
              <textarea
                ref={textareaRef}
                data-testid="composer"
                value={inputText}
                rows={1}
                onChange={(e) => setInputText(e.target.value)}
                onKeyDown={(e) => {
                  // Never send while an IME composition is active (Hindi,
                  // Chinese, Japanese, Korean…): Enter there commits the
                  // candidate, it doesn't submit the message.
                  if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing && e.nativeEvent.keyCode !== 229) {
                    e.preventDefault();
                    handleSend(e);
                  }
                }}
                placeholder="Paste or drop anything…"
                aria-label="Message"
                title="Enter to send · Shift+Enter for a new line"
                className="flex-1 min-h-[44px] max-h-[30vh] resize-none bg-transparent py-[9px] pl-0.5 pr-0.5 text-apple-ink dark:text-white placeholder:text-[#a89a80] dark:placeholder:text-white/25 focus:outline-none text-[16px] leading-[26px]"
              />
              <button
                type="button"
                data-testid="send"
                onPointerDown={handleSend}
                disabled={(!inputText.trim() && attachments.length === 0) || !session.partnerConnected}
                aria-label="Send"
                className="w-[38px] h-[38px] rounded-full flex items-center justify-center shrink-0 transition-motion active:scale-90 text-white disabled:opacity-30 disabled:bg-[#c0c8e0] dark:disabled:bg-[#3a3a42] disabled:shadow-none bg-gradient-to-b from-[#a78bfa] to-[#7c6ce0] shadow-[0_1px_2px_rgba(0,0,0,0.2),0_4px_10px_-2px_rgba(139,124,246,0.4)]"
              >
                <AnimatedIcon animate="send" active={!((!inputText.trim() && attachments.length === 0) || !session.partnerConnected)}>
                  <ArrowUp className="w-5 h-5" strokeWidth={2.4} />
                </AnimatedIcon>
              </button>

            </div>
          </motion.div>
        </form>
      </div>
      <AttachmentPanel
        isOpen={showAttachmentMenu}
        onClose={() => setShowAttachmentMenu(false)}
        onSelectType={(type) => {
          // Trigger the existing file inputs in ChatView
          if (type === 'image') {
            imageInputRef.current?.click();
          } else {
            fileInputRef.current?.click();
          }
        }}
        buttonRef={plusButtonRef}
      />
      <AttachmentFlight
        files={flyingFiles}
        fromRect={flightFromRect}
        toRect={flightToRect}
        onComplete={() => {
          setFlyingFiles([]);
          setFlightFromRect(null);
          setFlightToRect(null);
        }}
      />
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
/** Simple device-to-device illustration for the empty room state. */
function EmptyRoomIllustration() {
  return (
    <svg width="120" height="72" viewBox="0 0 120 72" fill="none" className="select-none pointer-events-none" aria-hidden="true">
      {/* Phone (left) */}
      <rect x="10" y="10" width="30" height="52" rx="7" fill="currentColor" fillOpacity="0.07" stroke="currentColor" strokeOpacity="0.12" strokeWidth="1.2" />
      <rect x="15" y="16" width="20" height="32" rx="2.5" fill="currentColor" fillOpacity="0.03" />
      {/* Computer (right) */}
      <rect x="80" y="8" width="30" height="42" rx="5" fill="currentColor" fillOpacity="0.07" stroke="currentColor" strokeOpacity="0.12" strokeWidth="1.2" />
      <rect x="84" y="12" width="22" height="28" rx="2" fill="currentColor" opacity="0.03" />
      <rect x="90" y="50" width="10" height="3.5" rx="1.5" fill="currentColor" opacity="0.12" />
      <rect x="85" y="53.5" width="20" height="2" rx="1" fill="currentColor" opacity="0.12" />
      {/* Connection dots — breathing animation */}
      <circle cx="50" cy="32" r="2" fill="currentColor" opacity="0.15">
        <animate attributeName="opacity" values="0.15;0.3;0.15" dur="2.5s" repeatCount="indefinite" />
      </circle>
      <circle cx="56" cy="28" r="2.5" fill="currentColor" opacity="0.25">
        <animate attributeName="opacity" values="0.25;0.45;0.25" dur="2s" repeatCount="indefinite" />
      </circle>
      <circle cx="62" cy="32" r="2" fill="currentColor" opacity="0.15">
        <animate attributeName="opacity" values="0.15;0.3;0.15" dur="2.5s" repeatCount="indefinite" begin="0.5s" />
      </circle>
    </svg>
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
