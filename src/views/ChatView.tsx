import React, { useState, useRef, useEffect } from 'react';
import { useSession } from '../lib/SessionContext';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Send, X, Plus, Image as ImageIcon, Paperclip, 
  Copy, Check, File as FileIcon, Play, Download, ExternalLink, RefreshCw, AlertCircle, FileText
} from 'lucide-react';
import { cn, formatBytes } from '../lib/utils';
import { ChatMessage, Attachment } from '../types';

export function ChatView() {
  const { session, sendMessage, closeSession } = useSession();
  const [inputText, setInputText] = useState('');
  const [attachment, setAttachment] = useState<Attachment & { file: File } | null>(null);
  const [showAttachmentMenu, setShowAttachmentMenu] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const audioInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [session.messages]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>, type: 'image' | 'file' | 'video' | 'audio') => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (type === 'image' && file.size > 100 * 1024 * 1024) {
      setErrorMsg("This image is larger than 100 MB.");
      return;
    }
    if (file.size > 200 * 1024 * 1024) {
      setErrorMsg("This file is larger than 200 MB.");
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

  const handleSend = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!inputText.trim() && !attachment) return;
    
    if (attachment) {
      const { file, ...attachmentMeta } = attachment;
      sendMessage(inputText, attachmentMeta, file);
    } else {
      sendMessage(inputText);
    }
    
    setInputText('');
    setAttachment(null);
  };

  return (
    <div className="flex flex-col h-full bg-apple-canvas dark:bg-black font-sans">
      {/* Header */}
      <div className="flex items-center justify-between p-4 sm:p-6 shrink-0 border-b border-apple-divider/50 dark:border-apple-tile-3/50 backdrop-blur-md z-10 sticky top-0">
        <div className="flex flex-col">
          <h2 className="text-[17px] font-semibold text-apple-ink dark:text-white leading-tight">Session Active</h2>
          <div className="flex items-center gap-2 mt-0.5">
            <div className="w-2 h-2 rounded-full bg-[#34c759] shadow-[0_0_8px_rgba(52,199,89,0.4)]" />
            <span className="text-[13px] text-apple-ink-muted font-medium">
              {session.connectionType === 'direct' ? 'Direct Connection' : 
               session.connectionType === 'local' ? 'Local Network' : 'Relayed Connection'}
            </span>
          </div>
        </div>
        <button 
          onClick={closeSession}
          className="px-4 py-2 text-[14px] font-medium text-[#ff3b30] hover:bg-[#ff3b30]/10 rounded-full transition-colors"
        >
          End Session
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
        {session.messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-apple-ink-muted space-y-4 opacity-70">
            <div className="w-16 h-16 rounded-2xl bg-apple-parchment dark:bg-apple-tile-2 flex items-center justify-center">
              <Send className="w-8 h-8" />
            </div>
            <p className="text-[15px]">Connection secure. Ready to transfer.</p>
          </div>
        ) : (
          <AnimatePresence initial={false}>
            {session.messages.map((msg) => (
              <MessageCard key={msg.id} msg={msg} />
            ))}
          </AnimatePresence>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className="p-4 sm:p-6 bg-apple-canvas/90 dark:bg-black/90 backdrop-blur-xl border-t border-apple-divider/50 dark:border-apple-tile-3/50 z-10 pb-[env(safe-area-inset-bottom)] relative">
        <form onSubmit={handleSend} className="max-w-3xl mx-auto flex flex-col gap-3">
          
          <AnimatePresence>
            {errorMsg && (
              <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
                <div className="px-4 py-3 bg-[#ff3b30]/10 text-[#ff3b30] text-[14px] font-medium rounded-xl flex items-center gap-2">
                  <AlertCircle className="w-4 h-4" /> {errorMsg}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <div className="relative">
            <AnimatePresence>
              {showAttachmentMenu && (
                <motion.div 
                  initial={{ opacity: 0, y: 10, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 10, scale: 0.95 }}
                  transition={{ type: "spring", stiffness: 400, damping: 25 }}
                  className="absolute left-0 bottom-[calc(100%+12px)] bg-white dark:bg-[#1c1c1e] border border-apple-divider dark:border-apple-tile-3 rounded-[16px] shadow-2xl p-2 w-[220px] z-20 flex flex-col gap-1"
                >
                  <AttachmentOption icon={<ImageIcon className="w-5 h-5 text-blue-500" />} label="Photo" onClick={() => imageInputRef.current?.click()} />
                  <AttachmentOption icon={<Play className="w-5 h-5 text-purple-500" />} label="Video" onClick={() => videoInputRef.current?.click()} />
                  <AttachmentOption icon={<FileIcon className="w-5 h-5 text-orange-500" />} label="File" onClick={() => fileInputRef.current?.click()} />
                </motion.div>
              )}
            </AnimatePresence>
            <input type="file" ref={imageInputRef} accept="image/*" className="hidden" onChange={(e) => handleFileSelect(e, 'image')} />
            <input type="file" ref={videoInputRef} accept="video/*" className="hidden" onChange={(e) => handleFileSelect(e, 'video')} />
            <input type="file" ref={audioInputRef} accept="audio/*" className="hidden" onChange={(e) => handleFileSelect(e, 'audio')} />
            <input type="file" ref={fileInputRef} className="hidden" onChange={(e) => handleFileSelect(e, 'file')} />
          </div>

          <div className="relative border border-apple-divider dark:border-apple-tile-3 rounded-[20px] bg-white dark:bg-[#1c1c1e] overflow-hidden shadow-sm transition-all focus-within:ring-2 focus-within:ring-apple-blue-focus/50 focus-within:border-apple-blue-focus">
            
            <AnimatePresence>
              {attachment && (
                <motion.div 
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0, scale: 0.95 }}
                  className="px-4 pt-4 flex flex-col gap-2 origin-bottom"
                >
                  <div className="flex items-center justify-between bg-apple-canvas dark:bg-black p-3 rounded-[12px] border border-apple-divider dark:border-apple-tile-3">
                    <div className="flex items-center gap-3 overflow-hidden">
                       <div className="w-10 h-10 bg-apple-parchment dark:bg-apple-tile-2 rounded-[10px] flex items-center justify-center shrink-0">
                         {attachment.type === 'image' ? <ImageIcon className="w-5 h-5" /> : attachment.type === 'video' ? <Play className="w-5 h-5" /> : <FileIcon className="w-5 h-5" />}
                       </div>
                       <div className="flex flex-col truncate">
                         <span className="text-[14px] font-medium text-apple-ink dark:text-white truncate">{attachment.name}</span>
                         <span className="text-[12px] text-apple-ink-muted">{formatBytes(attachment.size)}</span>
                       </div>
                    </div>
                    <button type="button" onClick={() => setAttachment(null)} className="p-2 text-apple-ink-muted hover:text-apple-ink transition-colors rounded-full hover:bg-apple-divider dark:hover:bg-apple-tile-2 shrink-0">
                      <X className="w-5 h-5" />
                    </button>
                  </div>
                  {attachment.type === 'image' && attachment.file && (
                    <div className="w-full h-[140px] rounded-[12px] overflow-hidden bg-apple-canvas dark:bg-black relative border border-apple-divider dark:border-apple-tile-3">
                      <img src={URL.createObjectURL(attachment.file)} alt="preview" className="w-full h-full object-cover opacity-80" />
                    </div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>

            <div className="flex items-end">
              <button
                type="button"
                onClick={() => setShowAttachmentMenu(!showAttachmentMenu)}
                className={cn(
                  "p-4 text-apple-ink-muted hover:text-apple-ink transition-all active:scale-90",
                  showAttachmentMenu && "text-apple-blue rotate-45"
                )}
              >
                <Plus className="w-6 h-6 transition-transform" />
              </button>
              
              <textarea
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                    e.preventDefault();
                    handleSend(e);
                  }
                }}
                placeholder="Message or paste file..."
                className="flex-1 min-h-[56px] max-h-[30vh] resize-none bg-transparent py-4 pr-4 text-apple-ink dark:text-white placeholder:text-apple-ink-muted focus:outline-none text-[16px] leading-relaxed"
              />
            </div>
          </div>

          <div className="flex justify-between items-center mt-1">
            <span className="text-[13px] text-apple-ink-muted px-2 font-medium">Cmd/Ctrl + Enter to send</span>
            <button 
              type="submit"
              disabled={(!inputText.trim() && !attachment) || !session.partnerConnected}
              className="px-6 py-2.5 bg-apple-blue text-white disabled:opacity-50 disabled:bg-apple-divider rounded-full text-[15px] font-semibold transition-all active:scale-95 flex items-center gap-2 shadow-sm shadow-apple-blue/20"
            >
              Send <Send className="w-4 h-4" />
            </button>
          </div>
        </form>
      </div>
      
      {showAttachmentMenu && (
        <div className="fixed inset-0 z-10" onClick={() => setShowAttachmentMenu(false)} />
      )}
    </div>
  );
}

function AttachmentOption({ icon, label, onClick }: { icon: React.ReactNode, label: string, onClick: () => void }) {
  return (
    <button 
      type="button" 
      onClick={onClick} 
      className="flex items-center gap-3 w-full p-3 hover:bg-apple-parchment dark:hover:bg-[#2c2c2e] rounded-[12px] text-[16px] font-medium text-apple-ink dark:text-white transition-colors"
    >
      {icon} {label}
    </button>
  );
}

const MessageCard: React.FC<{ msg: ChatMessage }> = ({ msg }) => {
  const isMe = msg.sender === 'me';
  const a = msg.attachment;

  const [copied, setCopied] = useState(false);
  
  const handleCopy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (e) {
      console.error("Copy failed", e);
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
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
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
        {/* Unified Card Container */}
        <div className={cn(
          "flex flex-col bg-white dark:bg-[#1c1c1e] border border-apple-divider/50 dark:border-apple-tile-3 rounded-[24px] overflow-hidden shadow-sm",
          isMe ? "rounded-tr-[8px]" : "rounded-tl-[8px]"
        )}>
          
          {/* Text Content */}
          {msg.text && (
            <div className="px-5 py-4 text-[16px] text-apple-ink dark:text-white whitespace-pre-wrap leading-relaxed break-words">
              {msg.text}
            </div>
          )}

          {/* Attachment Renderers */}
          {a && (
            <div className="flex flex-col w-full min-w-[280px]">
              
              {/* Image Type */}
              {a.type === 'image' && (
                <div className="relative w-full overflow-hidden bg-black/5 dark:bg-white/5">
                  {(a.status === 'complete' && a.url) ? (
                    <img src={a.url} alt={a.name} className="w-full h-auto object-contain max-h-[60vh] block" />
                  ) : (
                    <div className="w-full aspect-video flex flex-col items-center justify-center text-apple-ink-muted">
                      <ImageIcon className="w-8 h-8 mb-2 opacity-50" />
                      <ProgressState attachment={a} isMe={isMe} />
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
                        <ProgressState attachment={a} isMe={isMe} />
                     </div>
                   )}
                </div>
              )}

              {/* File / Audio Type */}
              {(a.type === 'file' || a.type === 'audio') && (
                <div className="p-5 flex items-center gap-4 bg-apple-canvas/50 dark:bg-black/20">
                  <div className="w-14 h-14 rounded-2xl bg-apple-blue/10 flex items-center justify-center shrink-0 relative">
                    {a.type === 'audio' ? <Play className="w-6 h-6 text-apple-blue ml-1" /> : <FileText className="w-6 h-6 text-apple-blue" />}
                  </div>
                  <div className="flex flex-col flex-1 truncate">
                    <span className="text-[15px] font-semibold text-apple-ink dark:text-white truncate">{a.name}</span>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-[13px] font-medium text-apple-ink-muted">{formatBytes(a.size)}</span>
                      <span className="w-1 h-1 rounded-full bg-apple-ink-muted/50" />
                      <span className="text-[13px] font-medium text-apple-ink-muted uppercase tracking-wider">{a.name.split('.').pop() || 'FILE'}</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Metadata & Actions Bar */}
              <div className="px-5 py-3 border-t border-apple-divider/50 dark:border-apple-tile-3 flex items-center justify-between bg-apple-canvas/30 dark:bg-black/10">
                
                {/* Status/Metadata */}
                <div className="flex flex-col">
                  <span className="text-[12px] font-medium text-apple-ink-muted">
                    {isMe ? 'Sent' : 'Received'} • {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                  {a.status !== 'complete' && a.status !== 'draft' && (
                     <span className="text-[13px] font-semibold text-apple-blue mt-0.5">
                       {a.status === 'failed' ? 'Transfer failed' : 
                        a.status === 'sending' ? `Sending... ${Math.round((a.progress || 0) * 100)}%` : 
                        `Receiving... ${Math.round((a.progress || 0) * 100)}%`}
                     </span>
                  )}
                  {a.status !== 'complete' && a.status !== 'draft' && a.status !== 'failed' && (
                     <span className="text-[11px] text-apple-ink-muted/80">
                        {formatBytes((a.progress || 0) * a.size)} / {formatBytes(a.size)}
                     </span>
                  )}
                </div>

                {/* Actions */}
                <div className="flex gap-2">
                  {a.status === 'complete' && a.url && (
                    <>
                      {a.type === 'image' && (
                        <ActionButton icon={<Copy />} label={copied ? "Copied" : "Copy Image"} active={copied} onClick={() => handleCopyImage(a.url!)} />
                      )}
                      <ActionButton icon={<Download />} label="Save" onClick={() => handleDownload(a.url!, a.name)} primary />
                    </>
                  )}
                  {a.status === 'failed' && (
                    <ActionButton icon={<RefreshCw />} label="Retry" onClick={() => {}} />
                  )}
                </div>
              </div>
              
              {/* Progress Bar */}
              {a.status !== 'complete' && a.status !== 'draft' && a.status !== 'failed' && (
                 <div className="w-full h-1 bg-apple-divider dark:bg-apple-tile-3">
                   <div className="h-full bg-apple-blue transition-all duration-300 ease-out" style={{ width: `${(a.progress || 0) * 100}%` }} />
                 </div>
              )}
            </div>
          )}

          {/* Action bar for pure text messages */}
          {!a && msg.text && (
            <div className="px-5 py-2.5 border-t border-apple-divider/50 dark:border-apple-tile-3 flex items-center justify-between bg-apple-canvas/30 dark:bg-black/10">
               <span className="text-[12px] font-medium text-apple-ink-muted">
                 {isMe ? 'Sent' : 'Received'} • {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
               </span>
               <ActionButton icon={<Copy />} label={copied ? "Copied" : "Copy"} active={copied} onClick={() => handleCopy(msg.text)} />
            </div>
          )}

        </div>
      </div>
    </motion.div>
  );
}

function ProgressState({ attachment: a, isMe }: { attachment: Attachment, isMe: boolean }) {
  if (a.status === 'failed') return <span className="text-[#ff3b30] font-medium">Failed</span>;
  if (a.status === 'complete') return null;
  return (
    <span className="font-medium animate-pulse">
      {isMe ? 'Sending...' : 'Receiving...'} {Math.round((a.progress || 0) * 100)}%
    </span>
  );
}

function ActionButton({ icon, label, onClick, active, primary }: { icon: React.ReactNode, label: string, onClick: () => void, active?: boolean, primary?: boolean }) {
  return (
    <button 
      onClick={onClick}
      className={cn(
        "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[13px] font-semibold transition-all active:scale-95",
        active 
          ? "bg-[#34c759]/15 text-[#34c759]" 
          : primary
            ? "bg-apple-blue hover:bg-apple-blue-focus text-white"
            : "bg-apple-parchment dark:bg-apple-tile-2 hover:bg-apple-divider dark:hover:bg-apple-tile-3 text-apple-ink dark:text-white"
      )}
    >
      <div className="[&>svg]:w-3.5 [&>svg]:h-3.5">{active ? <Check /> : icon}</div>
      {label}
    </button>
  );
}
