import React, { useState, useRef, useEffect, useMemo } from 'react';
import { useSession } from '../lib/SessionContext';
import { motion, AnimatePresence } from 'motion/react';
import {
  Send, X, Plus, Image as ImageIcon, ClipboardPaste,
  Copy, Check, File as FileIcon, Play, Download, RefreshCw, AlertCircle, FileText, ChevronDown, ChevronUp, Mic
} from 'lucide-react';
import { cn, formatBytes } from '../lib/utils';
import { ChatMessage, Attachment } from '../types';
import { ShareTextLogo } from '../components/ShareTextLogo';

const LARGE_TEXT_THRESHOLD = 8000; // chars
const LARGE_TEXT_PREVIEW = 1400;

export function ChatView() {
  const { session, sendMessage, closeSession, cancelTransfer } = useSession();
  const [inputText, setInputText] = useState('');
  const [attachment, setAttachment] = useState<Attachment & { file: File } | null>(null);
  const [showAttachmentMenu, setShowAttachmentMenu] = useState(false);
  const [showConnectionDetails, setShowConnectionDetails] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [copiedAll, setCopiedAll] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);
  const [showThatsIt, setShowThatsIt] = useState(false);
  const [announcement, setAnnouncement] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const dragDepth = useRef(0);
  const firstTransferShown = useRef(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const audioInputRef = useRef<HTMLInputElement>(null);

  const previewUrl = useMemo(
    () => (attachment?.type === 'image' && attachment.file ? URL.createObjectURL(attachment.file) : null),
    [attachment]
  );

  useEffect(() => {
    return () => { if (previewUrl) URL.revokeObjectURL(previewUrl); };
  }, [previewUrl]);

  const disconnected = !session.partnerConnected && session.connectionType === 'disconnected';

  useEffect(() => {
    if (!disconnected) {
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
    } else if (session.connectionType === 'disconnected') {
      setAnnouncement('Your other device disconnected');
    }
  }, [session.partnerConnected, session.connectionType]);

  // Post-transfer moment: after the very first successful transfer, a quiet
  // "That's it." appears once, then the app gets out of the way.
  useEffect(() => {
    if (!firstTransferShown.current && session.messages.length >= 1) {
      firstTransferShown.current = true;
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

  const stageFile = (file: File, type: 'image' | 'file' | 'video' | 'audio') => {
    if (type === 'image' && file.size > 100 * 1024 * 1024) {
      setErrorMsg("This image is larger than 100 MB. Choose a smaller image to continue.");
      return;
    }
    if (file.size > 200 * 1024 * 1024) {
      setErrorMsg("This file is larger than 200 MB. ShareText supports files up to 200 MB.");
      return;
    }

    setErrorMsg(null);
    setAttachment({
      id: crypto.randomUUID(),
      type,
      name: file.name,
      size: file.size,
      mimeType: file.type,
      file,
      status: 'draft'
    });
    setShowAttachmentMenu(false);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>, type: 'image' | 'file' | 'video' | 'audio') => {
    const file = e.target.files?.[0];
    if (!file) return;
    stageFile(file, type);
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
    const file = files && files.length > 0 ? files[0] : undefined;
    if (!file) return;
    const type = file.type.startsWith('image/')
      ? 'image'
      : file.type.startsWith('video/')
        ? 'video'
        : file.type.startsWith('audio/')
          ? 'audio'
          : 'file';
    stageFile(file, type);
  };

  const handleSend = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!inputText.trim() && !attachment) return;
    if (disconnected) return;

    if (attachment) {
      const { file, ...attachmentMeta } = attachment;
      sendMessage(inputText, attachmentMeta, file);
    } else {
      sendMessage(inputText);
    }

    setInputText('');
    setAttachment(null);
  };

  const canPaste = typeof navigator !== 'undefined' && !!navigator.clipboard?.readText;

  const handlePaste = async () => {
    if (!canPaste) return;
    try {
      const text = await navigator.clipboard.readText();
      if (text) setInputText(t => (t ? t + '\n' : '') + text);
    } catch {
      setErrorMsg("Couldn't read your clipboard. Paste manually instead.");
    }
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
    <div className="flex flex-col h-full bg-apple-canvas dark:bg-black font-sans">
      {/* Screen-reader live region — invisible, announced on state changes */}
      <div aria-live="polite" role="status" className="sr-only">{announcement}</div>

      {/* Header */}
      <div className="flex items-center justify-between p-4 sm:p-6 shrink-0 border-b border-apple-divider/50 dark:border-apple-tile-3/50 backdrop-blur-xl bg-apple-canvas/80 dark:bg-black/80 z-20 sticky top-0">
        <div className="flex items-center gap-3 relative">
          <ShareTextLogo size={24} className="text-apple-ink dark:text-white shrink-0" />
          <div className="flex flex-col">
            <h2 className="text-[17px] font-semibold text-apple-ink dark:text-white leading-tight">
              {session.partnerName || 'Partner Device'}
            </h2>
            <button
              onPointerDown={() => setShowConnectionDetails(!showConnectionDetails)}
              aria-expanded={showConnectionDetails}
              className="flex items-center gap-2 mt-0.5 py-1.5 -my-1.5 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-apple-blue rounded-[6px] min-h-[40px]"
            >
              <div className={cn(
                "w-2 h-2 rounded-full",
                session.connectionType === 'relay' ? "bg-status-warning shadow-[0_0_8px_rgba(251,191,36,0.4)]" : "bg-status-success shadow-[0_0_8px_rgba(52,199,89,0.4)]"
              )} />
              <span className="text-[13px] text-apple-ink-muted font-medium hover:text-apple-ink dark:hover:text-white transition-colors">
                Connected
              </span>
            </button>

            <AnimatePresence>
              {showConnectionDetails && (
                <motion.div
                  initial={{ opacity: 0, y: -5, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -5, scale: 0.95 }}
                  transition={{ type: "spring", bounce: 0, duration: 0.3 }}
                  className="absolute top-[100%] left-0 mt-2 p-3 bg-white dark:bg-surface-dark border border-apple-divider dark:border-apple-tile-3 rounded-[12px] shadow-lg min-w-[220px] z-30"
                >
                  <div className="text-[13px] font-medium text-apple-ink dark:text-white mb-1">Connection</div>
                  <div className="text-[13px] text-apple-ink-muted">
                    {session.connectionType === 'relay' ? 'Connected securely through an encrypted relay — a direct connection wasn\u2019t available.' :
                     session.connectionType === 'local' ? 'Connected directly between devices on the same network.' :
                     session.connectionType === 'direct' ? 'Connected directly between devices.' :
                     'Connecting…'}
                  </div>
                  <div className="text-[13px] text-apple-ink-muted mt-2 pt-2 border-t border-apple-divider/50 dark:border-apple-tile-3">
                    Encryption: Enabled
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
        <button
          onPointerDown={() => setConfirmClose(true)}
          className="px-4 py-2 text-[14px] font-medium text-apple-ink-muted hover:text-apple-ink dark:hover:text-white hover:bg-apple-divider/50 dark:hover:bg-apple-tile-3/50 rounded-[10px] transition-colors active:scale-95 min-h-[44px] flex items-center"
        >
          Close Room
        </button>
      </div>

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
              aria-label="Close this session?"
            >
              <h3 className="text-[19px] font-semibold text-apple-ink dark:text-white tracking-tight mb-2">Close this session?</h3>
              <p className="text-[15px] text-apple-ink-muted leading-relaxed mb-6">
                Both devices will be disconnected and this temporary room will be destroyed.
              </p>
              <div className="flex flex-col gap-2">
                <button
                  onPointerDown={() => setConfirmClose(false)}
                  className="w-full py-3.5 bg-apple-parchment dark:bg-apple-tile-2 hover:bg-apple-divider dark:hover:bg-apple-tile-3 text-apple-ink dark:text-white rounded-[14px] text-[15px] font-semibold transition-colors active:scale-[0.98] min-h-[48px]"
                >
                  Keep Session
                </button>
                <button
                  onPointerDown={closeSession}
                  className="w-full py-3.5 bg-status-danger hover:bg-[#e0352b] text-white rounded-[14px] text-[15px] font-semibold transition-colors active:scale-[0.98] min-h-[48px]"
                >
                  Close Room
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
                That's it — it's on the other device.
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Messages */}
      <div
        className="flex-1 overflow-y-auto p-4 sm:p-6 relative"
        onDragEnter={handleDragEnter}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <div className="max-w-3xl mx-auto flex flex-col space-y-4">
          {session.messages.length === 0 ? (
            <div className="h-full min-h-[40vh] flex flex-col items-center justify-center text-center space-y-3 opacity-80">
              <div className="w-14 h-14 rounded-[20px] bg-apple-parchment dark:bg-apple-tile-2 flex items-center justify-center mb-1">
                <ShareTextLogo size={26} className="text-apple-ink dark:text-white" />
              </div>
              <p className="text-[17px] font-semibold text-apple-ink dark:text-white tracking-tight">Your private clipboard</p>
              <p className="text-[14px] text-apple-ink-muted max-w-[260px] leading-relaxed">
                Anything you paste here will appear on the other device.
              </p>
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

      {/* Input Area */}
      <div className="p-4 sm:p-6 bg-apple-canvas/90 dark:bg-black/90 backdrop-blur-xl border-t border-apple-divider/50 dark:border-apple-tile-3/50 z-10 pb-[env(safe-area-inset-bottom)] relative">
        <form onSubmit={handleSend} className="max-w-3xl mx-auto flex flex-col gap-3">

          <AnimatePresence>
            {errorMsg && (
              <motion.div role="alert" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
                <div className="px-4 py-3 bg-status-danger/10 text-status-danger text-[14px] font-medium rounded-xl flex items-center gap-2">
                  <AlertCircle className="w-4 h-4" /> {errorMsg}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <div className="relative">
            <input type="file" ref={imageInputRef} accept="image/*" className="hidden" onChange={(e) => handleFileSelect(e, 'image')} />
            <input type="file" ref={videoInputRef} accept="video/*" className="hidden" onChange={(e) => handleFileSelect(e, 'video')} />
            <input type="file" ref={audioInputRef} accept="audio/*" className="hidden" onChange={(e) => handleFileSelect(e, 'audio')} />
            <input type="file" ref={fileInputRef} className="hidden" onChange={(e) => handleFileSelect(e, 'file')} />
          </div>

          <motion.div layout className="relative border border-apple-divider dark:border-apple-tile-3 rounded-[24px] bg-white dark:bg-surface-dark overflow-visible shadow-sm transition-motion focus-within:ring-2 focus-within:ring-apple-blue-focus/50 focus-within:border-apple-blue-focus z-20">

            <AnimatePresence>
              {attachment && (
                <motion.div
                  initial={{ height: 0, opacity: 0, scale: 0.95 }}
                  animate={{ height: 'auto', opacity: 1, scale: 1 }}
                  exit={{ height: 0, opacity: 0, scale: 0.95 }}
                  transition={{ type: "spring", bounce: 0, duration: 0.4 }}
                  className="px-3 pt-3 flex flex-col origin-bottom overflow-hidden"
                >
                  {attachment.type === 'image' && attachment.file ? (
                    <div className="relative group self-start">
                      <div className="w-[120px] h-[120px] sm:w-[160px] sm:h-[160px] rounded-[16px] overflow-hidden bg-apple-canvas dark:bg-black relative border border-apple-divider dark:border-apple-tile-3 shadow-sm">
                        {previewUrl && <img src={previewUrl} alt="preview" className="w-full h-full object-cover" />}
                      </div>
                      <button type="button" onPointerDown={() => setAttachment(null)} className="absolute -top-2 -right-2 w-7 h-7 bg-status-danger text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow-sm active:scale-90 z-10">
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between bg-apple-parchment dark:bg-surface-dark-2 p-3 rounded-[16px]">
                      <div className="flex items-center gap-3 overflow-hidden">
                        <div className="w-10 h-10 bg-white dark:bg-black rounded-[10px] flex items-center justify-center shrink-0 shadow-sm">
                          {attachment.type === 'video' ? <Play className="w-5 h-5 text-apple-ink dark:text-white" /> : <FileIcon className="w-5 h-5 text-apple-ink dark:text-white" />}
                        </div>
                        <div className="flex flex-col truncate">
                          <span className="text-[14px] font-medium text-apple-ink dark:text-white truncate">{attachment.name}</span>
                          <span className="text-[12px] text-apple-ink-muted">{formatBytes(attachment.size)}</span>
                        </div>
                      </div>
                      <button type="button" onPointerDown={() => setAttachment(null)} className="p-2 text-apple-ink-muted hover:text-apple-ink dark:hover:text-white transition-colors rounded-full hover:bg-apple-divider dark:hover:bg-apple-tile-3 shrink-0 active:scale-90">
                        <X className="w-5 h-5" />
                      </button>
                    </div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>

            <div className="flex items-end p-1 relative">
              <div className="flex items-center">
                {canPaste && (
                  <button
                    type="button"
                    onPointerDown={() => { void handlePaste(); }}
                    className="p-3.5 text-apple-ink-muted hover:text-apple-ink dark:hover:text-white transition-motion active:scale-[0.85] rounded-full"
                    aria-label="Paste from clipboard"
                    title="Paste from clipboard"
                  >
                    <ClipboardPaste className="w-5 h-5" />
                  </button>
                )}
                <button
                  type="button"
                  onPointerDown={() => setShowAttachmentMenu(!showAttachmentMenu)}
                  aria-label="Add attachment"
                  aria-expanded={showAttachmentMenu}
                  className={cn(
                    "p-3.5 text-apple-ink-muted hover:text-apple-ink dark:hover:text-white transition-motion active:scale-[0.85] rounded-full",
                    showAttachmentMenu && "text-apple-blue bg-apple-blue/10 rotate-45"
                  )}
                >
                  <Plus className="w-6 h-6 transition-transform" />
                </button>

                <AnimatePresence>
                  {showAttachmentMenu && (
                    <motion.div
                      initial={{ opacity: 0, y: 10, scale: 0.9, transformOrigin: 'bottom left' }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: 10, scale: 0.9 }}
                      transition={{ type: "spring", bounce: 0, duration: 0.3 }}
                      className="absolute left-0 bottom-[calc(100%+8px)] bg-white/90 dark:bg-surface-dark-2/90 backdrop-blur-xl border border-apple-divider dark:border-apple-tile-3 rounded-[20px] shadow-2xl p-2 w-[220px] flex flex-col gap-1"
                    >
                      <AttachmentOption icon={<ImageIcon className="w-5 h-5 text-apple-ink-muted" />} label="Photo" onClick={() => imageInputRef.current?.click()} />
                      <AttachmentOption icon={<Play className="w-5 h-5 text-apple-ink-muted" />} label="Video" onClick={() => videoInputRef.current?.click()} />
                      <AttachmentOption icon={<Mic className="w-5 h-5 text-apple-ink-muted" />} label="Audio" onClick={() => audioInputRef.current?.click()} />
                      <AttachmentOption icon={<FileIcon className="w-5 h-5 text-apple-ink-muted" />} label="File" onClick={() => fileInputRef.current?.click()} />
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              <textarea
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                    e.preventDefault();
                    handleSend(e);
                  }
                }}
                placeholder="Paste or type text…"
                aria-label="Message"
                className="flex-1 min-h-[52px] max-h-[30vh] resize-none bg-transparent py-3.5 pr-4 text-apple-ink dark:text-white placeholder:text-apple-ink-muted focus:outline-none text-[16px] leading-relaxed"
              />
            </div>
          </motion.div>

          <div className="flex justify-between items-center mt-1 px-1">
            <span className="text-[13px] text-apple-ink-muted font-medium">
              {isLargeInput ? `Large text · ${formatBytes(inputBytes)}` : <span className="hidden sm:inline">Cmd/Ctrl + Enter to send</span>}
            </span>
            <button
              type="button"
              onPointerDown={handleSend}
              disabled={(!inputText.trim() && !attachment) || !session.partnerConnected}
              className="px-6 py-2.5 bg-apple-ink dark:bg-white text-white dark:text-night-900 disabled:opacity-40 disabled:bg-apple-divider dark:disabled:bg-apple-tile-2 disabled:text-apple-ink-muted dark:disabled:text-white/40 rounded-[12px] text-[15px] font-semibold transition-motion active:scale-95 flex items-center gap-2 shadow-card"
            >
              Send <Send className="w-4 h-4" />
            </button>
          </div>
        </form>
      </div>

      {showAttachmentMenu && (
        <div className="fixed inset-0 z-[5]" onPointerDown={() => setShowAttachmentMenu(false)} />
      )}
    </div>
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

const MessageCard: React.FC<{ msg: ChatMessage; partnerName?: string }> = ({ msg, partnerName }) => {
  const { retryTransfer, cancelTransfer } = useSession();
  const isMe = msg.sender === 'me';
  const a = msg.attachment;

  const [copied, setCopied] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const isLargeText = msg.text.length > LARGE_TEXT_THRESHOLD;
  const preview = isLargeText && !expanded ? msg.text.slice(0, LARGE_TEXT_PREVIEW) : msg.text;

  const handleCopy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback copy for older browsers
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleCopyImage = async (url: string) => {
    try {
      const response = await fetch(url);
      const blob = await response.blob();
      const item = new ClipboardItem({ [blob.type]: blob });
      await navigator.clipboard.write([item]);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (e) {
      // Fallback
      handleDownload(url, a!.name);
    }
  };

  const handleDownload = (url: string, filename: string) => {
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 15, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      className={cn(
        "flex w-full",
        isMe ? "justify-end" : "justify-start"
      )}
    >
      <div className={cn(
        "flex flex-col gap-2 max-w-[85%] sm:max-w-[70%]",
        isMe ? "items-end" : "items-start"
      )}>
        {/* Sender */}
        <span className="text-[12px] font-medium text-apple-ink-muted px-1">
          {isMe ? 'You' : (partnerName || 'Partner')} • {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </span>

        {/* Unified Card Container — sent messages carry the brand, received stay quiet */}
        <div className={cn(
          "flex flex-col rounded-[24px] overflow-hidden shadow-sm",
          isMe
            ? "bg-azure-600 text-white rounded-tr-[8px] border border-transparent"
            : "bg-white dark:bg-surface-dark border border-apple-divider/50 dark:border-apple-tile-3 rounded-tl-[8px]"
        )}>

          {/* Text Content */}
          {msg.text && (
            <div className={cn("px-5 py-4 text-[16px] whitespace-pre-wrap leading-relaxed break-words", isMe ? "text-white" : "text-apple-ink dark:text-white")}>
              {preview}
              {isLargeText && !expanded && (
                <button
                  onPointerDown={() => setExpanded(true)}
                  className={cn("mt-2 flex items-center gap-1 text-[14px] font-semibold active:opacity-70", isMe ? "text-white/90" : "text-apple-blue")}
                >
                  <ChevronDown className="w-4 h-4" /> Show full text
                </button>
              )}
              {isLargeText && expanded && (
                <button
                  onPointerDown={() => setExpanded(false)}
                  className={cn("mt-2 flex items-center gap-1 text-[14px] font-semibold active:opacity-70", isMe ? "text-white/90" : "text-apple-blue")}
                >
                  <ChevronUp className="w-4 h-4" /> Collapse
                </button>
              )}
            </div>
          )}

          {/* Attachment Renderers */}
          {a && (
            <div className={cn("flex flex-col w-full min-w-[280px]", isMe && "bg-white/10")}>

              {/* Image Type */}
              {a.type === 'image' && (
                <div className="relative w-full overflow-hidden bg-black/5 dark:bg-white/5">
                  {(a.status === 'complete' && a.url) ? (
                    <img src={a.url} alt={a.name} className="w-full h-auto object-contain max-h-[60vh] block" />
                  ) : (
                    <div className={cn("w-full aspect-video flex flex-col items-center justify-center", isMe ? "text-white/80" : "text-apple-ink-muted")}>
                      <ImageIcon className="w-8 h-8 mb-2 opacity-50" />
                      <ProgressState attachment={a} isMe={isMe} onBlue={isMe} />
                    </div>
                  )}
                </div>
              )}

              {/* Video Type */}
              {a.type === 'video' && (
                <div className="relative w-full aspect-video bg-black/90 flex items-center justify-center group overflow-hidden">
                  {(a.status === 'complete' && a.url) ? (
                    <video src={a.url} controls className="w-full h-full object-contain" />
                  ) : (
                    <div className="text-white/70 flex flex-col items-center">
                      <Play className="w-10 h-10 mb-3 opacity-50" />
                      <ProgressState attachment={a} isMe={isMe} onBlue />
                    </div>
                  )}
                </div>
              )}

              {/* File / Audio Type */}
              {(a.type === 'file' || a.type === 'audio') && (
                <div className={cn("p-5 flex items-center gap-4", isMe ? "bg-white/10" : "bg-apple-canvas/50 dark:bg-black/20")}>
                  <div className={cn("w-14 h-14 rounded-2xl flex items-center justify-center shrink-0 relative", isMe ? "bg-white/20" : "bg-apple-blue/10")}>
                    {a.type === 'audio' ? <Play className={cn("w-6 h-6 ml-1", isMe ? "text-white" : "text-apple-blue")} /> : <FileText className={cn("w-6 h-6", isMe ? "text-white" : "text-apple-blue")} />}
                  </div>
                  <div className="flex flex-col flex-1 truncate">
                    <span className={cn("text-[15px] font-semibold truncate", isMe ? "text-white" : "text-apple-ink dark:text-white")}>{a.name}</span>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className={cn("text-[13px] font-medium", isMe ? "text-white/75" : "text-apple-ink-muted")}>{formatBytes(a.size)}</span>
                      <span className={cn("w-1 h-1 rounded-full", isMe ? "bg-white/40" : "bg-apple-ink-muted/50")} />
                      <span className={cn("text-[13px] font-medium uppercase tracking-wider", isMe ? "text-white/75" : "text-apple-ink-muted")}>{a.name.split('.').pop() || 'FILE'}</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Audio playback — plays once the transfer completes */}
              {a.type === 'audio' && a.status === 'complete' && a.url && (
                <div className={cn("px-4 pb-4", isMe ? "bg-white/10" : "bg-apple-canvas/50 dark:bg-black/20")}>
                  <audio src={a.url} controls className="w-full" preload="metadata" />
                </div>
              )}

              {/* Metadata & Actions Bar */}
              <div className={cn(
                "px-5 py-3 border-t flex items-center justify-between",
                isMe
                  ? "border-white/15 bg-white/10"
                  : "border-apple-divider/50 dark:border-apple-tile-3 bg-apple-canvas/30 dark:bg-black/10"
              )}>
                <div className="flex flex-col">
                  <span className={cn("text-[12px] font-medium flex items-center gap-1", isMe ? "text-white/75" : "text-apple-ink-muted")}>
                    {a.status === 'complete' && (isMe ? <><Check className="w-3 h-3 text-white/90" /> Sent •</> : 'Received •')} {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                  {a.status !== 'complete' && a.status !== 'draft' && (
                    <span className={cn("text-[13px] font-semibold mt-0.5", a.status === 'failed' ? (isMe ? "text-white" : "text-status-danger") : a.status === 'cancelled' ? (isMe ? "text-white/80" : "text-apple-ink-muted") : isMe ? "text-white" : "text-apple-blue")}>
                      {a.status === 'failed' ? 'Couldn\u2019t send this file.' :
                        a.status === 'cancelled' ? 'Cancelled' :
                        a.status === 'sending' ? `Sending… ${Math.round((a.progress || 0) * 100)}%` :
                          `Receiving… ${Math.round((a.progress || 0) * 100)}%`}
                    </span>
                  )}
                  {a.status !== 'complete' && a.status !== 'draft' && a.status !== 'failed' && a.status !== 'cancelled' && (
                    <span className={cn("text-[11px]", isMe ? "text-white/60" : "text-apple-ink-muted/80")}>
                      {formatBytes((a.progress || 0) * a.size)} / {formatBytes(a.size)}
                    </span>
                  )}
                </div>

                <div className="flex gap-2">
                  {a.status === 'complete' && a.url && (
                    <>
                      {a.type === 'image' && (
                        <ActionButton icon={<Copy />} label={copied ? "Copied" : "Copy Image"} active={copied} onClick={() => handleCopyImage(a.url!)} onBlue={isMe} />
                      )}
                      <ActionButton icon={<Download />} label="Save" onClick={() => handleDownload(a.url!, a.name)} primary onBlue={isMe} />
                    </>
                  )}
                  {(a.status === 'sending' || a.status === 'receiving') && (
                    <ActionButton icon={<X />} label="Cancel" onClick={() => { void cancelTransfer(msg.id); }} onBlue={isMe} />
                  )}
                  {(a.status === 'failed' || (a.status === 'cancelled' && isMe)) && (
                    <ActionButton icon={<RefreshCw />} label="Retry" onClick={() => { void retryTransfer(msg.id); }} onBlue={isMe} />
                  )}
                </div>
              </div>

              {/* Progress Bar */}
              {a.status !== 'complete' && a.status !== 'draft' && a.status !== 'failed' && a.status !== 'cancelled' && (
                <div className={cn("w-full h-1 overflow-hidden", isMe ? "bg-white/20" : "bg-apple-divider dark:bg-apple-tile-3")}>
                  <div className={cn("h-full origin-left transition-transform duration-300 ease-out", isMe ? "bg-white" : "bg-apple-blue")} style={{ transform: `scaleX(${a.progress || 0})` }} />
                </div>
              )}
            </div>
          )}

          {/* Action bar for pure text messages */}
          {!a && msg.text && (
            <div className={cn(
              "px-5 py-2.5 border-t flex items-center justify-between",
              isMe
                ? "border-white/15 bg-white/10"
                : "border-apple-divider/50 dark:border-apple-tile-3 bg-apple-canvas/30 dark:bg-black/10"
            )}>
              <span className={cn("text-[12px] font-medium flex items-center gap-1", isMe ? "text-white/75" : "text-apple-ink-muted")}>
                {isMe ? <><Check className="w-3 h-3 text-white/90" /> Sent •</> : 'Received •'} {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
              <ActionButton icon={<Copy />} label={copied ? "Copied" : "Copy"} active={copied} onClick={() => handleCopy(msg.text)} onBlue={isMe} />
            </div>
          )}

        </div>
      </div>
    </motion.div>
  );
}

function ProgressState({ attachment: a, isMe, onBlue }: { attachment: Attachment, isMe: boolean, onBlue?: boolean }) {
  if (a.status === 'failed') return <span className={cn("font-medium", onBlue ? "text-white" : "text-status-danger")}>Couldn't send this file.</span>;
  if (a.status === 'cancelled') return <span className={cn("font-medium", onBlue ? "text-white/80" : "text-apple-ink-muted")}>Cancelled</span>;
  if (a.status === 'complete') return null;
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
        "flex items-center gap-1.5 px-3.5 py-2.5 rounded-full text-[13px] font-semibold transition-motion active:scale-95 min-h-[44px]",
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
