import React, { useState, useEffect, useRef } from 'react';
import { useSession } from '../lib/SessionContext';
import { Send, Copy, ShieldCheck, Wifi, Server, ArrowRight, Check, Trash2, ClipboardPaste } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils';

export function ChatView() {
  const { session, sendMessage, closeSession } = useSession();
  const [inputText, setInputText] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [copiedAll, setCopiedAll] = useState(false);
  const [showCloseConfirm, setShowCloseConfirm] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [session.messages]);

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (inputText.trim()) {
      sendMessage(inputText.trim());
      setInputText('');
    }
  };

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const copyAll = () => {
    const text = session.messages.map(m => m.text).join('\n\n');
    navigator.clipboard.writeText(text);
    setCopiedAll(true);
    setTimeout(() => setCopiedAll(false), 2000);
  };

  const getConnectionBadge = () => {
    if (!session.partnerConnected) return { label: 'Waiting for Rejoin', icon: <div className="w-2 h-2 rounded-full bg-[#ff9500] animate-pulse" />, class: 'border-transparent text-apple-ink-muted' };
    switch (session.connectionType) {
      case 'local': return { label: 'Local Network', icon: <Wifi className="w-3 h-3 text-[#34c759]" />, class: 'border-transparent text-apple-ink-muted' };
      case 'direct': return { label: 'P2P Direct', icon: <ArrowRight className="w-3 h-3 text-apple-blue" />, class: 'border-transparent text-apple-ink-muted' };
      case 'relay': return { label: 'Encrypted Relay', icon: <Server className="w-3 h-3 text-[#af52de]" />, class: 'border-transparent text-apple-ink-muted' };
      default: return { label: 'Connecting...', icon: <div className="w-2 h-2 rounded-full bg-apple-ink-muted animate-pulse" />, class: 'border-transparent text-apple-ink-muted' };
    }
  };

  const badge = getConnectionBadge();
  
  // Safety Code derived from the room secret
  const getSafetyCode = (secret: string) => {
    let hash = 0;
    for (let i = 0; i < secret.length; i++) {
      hash = (Math.imul(31, hash) + secret.charCodeAt(i)) | 0;
    }
    return Math.abs(hash % 10000).toString().padStart(4, '0');
  };
  const safetyCode = session.secret ? getSafetyCode(session.secret) : '----';

  return (
    <div className="flex flex-col h-screen bg-apple-canvas dark:bg-black relative">
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-4 bg-apple-parchment/90 dark:bg-apple-tile-1/90 backdrop-blur-md border-b border-apple-divider dark:border-apple-tile-3 z-10 sticky top-0">
        <div className="flex flex-col">
          <h1 className="text-[17px] font-semibold text-apple-ink dark:text-white flex items-center gap-2 tracking-[-0.022em]">
            ShareText <ShieldCheck className="w-[18px] h-[18px] text-[#34c759]" />
          </h1>
          <div className="flex items-center gap-3 mt-1">
            <span className="text-[12px] font-medium text-apple-ink dark:text-white tracking-[-0.01em]">
              {session.partnerConnected ? 'Connected to Partner' : 'Waiting...'}
            </span>
            <div className={cn("inline-flex items-center gap-1.5 px-1 py-0.5 rounded-full border text-[10px] font-medium uppercase tracking-wider w-fit", badge.class)}>
              {badge.icon} {badge.label}
            </div>
            {session.partnerConnected && session.secret && (
               <span className="text-[10px] font-mono text-apple-ink-muted bg-apple-divider dark:bg-apple-tile-2 px-1.5 py-0.5 rounded">
                 Safety: {safetyCode}
               </span>
            )}
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          {session.messages.length > 0 && (
            <button 
              onClick={copyAll}
              className="text-[14px] font-normal text-apple-blue hover:text-apple-blue-focus px-3 py-1.5 rounded-[8px] hover:bg-apple-blue/10 transition-colors flex items-center gap-1.5"
            >
              {copiedAll ? <Check className="w-4 h-4 text-[#34c759]" /> : <ClipboardPaste className="w-4 h-4" />}
              {copiedAll ? 'Copied All' : 'Copy All'}
            </button>
          )}
          <button 
            onClick={() => setShowCloseConfirm(true)}
            className="text-[14px] font-normal text-[#ff3b30] hover:text-[#ff453a] px-3 py-1.5 rounded-[8px] hover:bg-[#ff3b30]/10 transition-colors"
          >
            End Session
          </button>
        </div>
      </header>

      {/* Close Confirmation Modal */}
      <AnimatePresence>
        {showCloseConfirm && (
          <div className="absolute inset-0 z-50 flex items-center justify-center p-6 bg-black/40 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="bg-apple-canvas dark:bg-apple-tile-1 rounded-[18px] p-6 max-w-sm w-full shadow-[0_8px_30px_rgba(0,0,0,0.12)] border border-apple-divider dark:border-apple-tile-3"
            >
              <h3 className="text-[21px] font-semibold text-apple-ink dark:text-white mb-2 tracking-[-0.018em]">Close this session?</h3>
              <p className="text-[17px] text-apple-ink-muted dark:text-apple-ink-muted leading-[1.47] tracking-[-0.022em] mb-8">
                Both devices will be disconnected and this temporary room will be destroyed. Messages are not saved.
              </p>
              <div className="flex flex-col gap-3">
                <button 
                  onClick={closeSession}
                  className="w-full py-3 bg-[#ff3b30] hover:bg-[#ff453a] text-white rounded-full text-[17px] font-normal transition-transform active:scale-95 flex items-center justify-center gap-2"
                >
                  <Trash2 className="w-5 h-5" /> Close Room
                </button>
                <button 
                  onClick={() => setShowCloseConfirm(false)}
                  className="w-full py-3 bg-apple-parchment dark:bg-apple-tile-2 text-apple-ink dark:text-white rounded-full text-[17px] font-normal transition-transform active:scale-95"
                >
                  Keep Session
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        <div className="flex justify-center mb-8">
          <div className="px-4 py-2 text-[12px] font-normal text-apple-ink-muted dark:text-apple-ink-muted text-center max-w-sm tracking-[-0.01em]">
            Messages are designed to remain end-to-end encrypted during relay transport. Content is never stored on the server.
          </div>
        </div>
        
        {session.messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-[50vh] text-center opacity-70">
            <ClipboardPaste className="w-12 h-12 text-apple-ink-muted mb-4" />
            <h2 className="text-[21px] font-semibold text-apple-ink dark:text-white tracking-[-0.018em] mb-2">What do you want to send?</h2>
          </div>
        ) : (
          <AnimatePresence initial={false}>
            {session.messages.map((msg) => (
              <motion.div 
                key={msg.id}
                initial={{ opacity: 0, y: 10, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                className={cn("flex", msg.sender === 'me' ? "justify-end" : "justify-start")}
              >
                <div className={cn(
                  "group relative max-w-[85%] sm:max-w-[70%] px-5 py-3.5",
                  msg.sender === 'me' 
                    ? "bg-apple-blue text-white rounded-[20px] rounded-tr-[4px]" 
                    : "bg-apple-parchment dark:bg-apple-tile-2 text-apple-ink dark:text-white rounded-[20px] rounded-tl-[4px]"
                )}>
                  <p className="whitespace-pre-wrap break-words leading-[1.47] text-[17px] tracking-[-0.022em]">{msg.text}</p>
                  <div className={cn(
                    "flex items-center gap-2 mt-2 text-[11px] uppercase tracking-wider font-semibold opacity-70",
                    msg.sender === 'me' ? "justify-end text-white/70" : "text-apple-ink-muted"
                  )}>
                    {msg.sender === 'me' ? 'You' : 'Partner'} • {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </div>
                  
                  {/* Copy Button */}
                  <button 
                    onClick={() => copyToClipboard(msg.text, msg.id)}
                    className={cn(
                      "absolute top-1/2 -translate-y-1/2 opacity-100 sm:opacity-0 group-hover:opacity-100 transition-opacity p-2.5 rounded-full bg-white dark:bg-apple-tile-3 border border-apple-hairline dark:border-transparent shadow-sm overflow-hidden flex items-center justify-center",
                      msg.sender === 'me' ? "-left-14" : "-right-14"
                    )}
                    title="Copy to clipboard"
                  >
                    <AnimatePresence mode="wait" initial={false}>
                      {copiedId === msg.id ? (
                        <motion.div
                          key="check"
                          initial={{ scale: 0.5, opacity: 0 }}
                          animate={{ scale: 1, opacity: 1 }}
                          exit={{ scale: 0.5, opacity: 0 }}
                          transition={{ duration: 0.15 }}
                        >
                          <Check className="w-4 h-4 text-[#34c759]" />
                        </motion.div>
                      ) : (
                        <motion.div
                          key="copy"
                          initial={{ scale: 0.5, opacity: 0 }}
                          animate={{ scale: 1, opacity: 1 }}
                          exit={{ scale: 0.5, opacity: 0 }}
                          transition={{ duration: 0.15 }}
                        >
                          <Copy className="w-4 h-4 text-apple-ink dark:text-white" />
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </button>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        )}
        
        {!session.partnerConnected && session.messages.length > 0 && (
          <div className="flex justify-center my-6">
            <span className="text-[14px] text-[#d69511] bg-[#fdf5e6] dark:bg-[#3b2a0c] px-4 py-1.5 rounded-full tracking-[-0.016em]">
              Your other device disconnected. Waiting for them to reconnect...
            </span>
          </div>
        )}
        
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="p-4 bg-apple-parchment/90 dark:bg-apple-tile-1/90 backdrop-blur-md border-t border-apple-divider dark:border-apple-tile-3 z-10 pb-[env(safe-area-inset-bottom)]">
        <form onSubmit={handleSend} className="max-w-4xl mx-auto relative flex items-end gap-2">
          <textarea
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSend(e);
              }
            }}
            placeholder="Paste or type text..."
            className="w-full max-h-[160px] min-h-[48px] resize-none bg-white dark:bg-black border border-apple-divider dark:border-apple-tile-3 rounded-[24px] py-3.5 pl-5 pr-14 text-apple-ink dark:text-white placeholder:text-apple-ink-muted focus:border-apple-blue-focus focus:outline-none text-[17px] leading-[1.47]"
            rows={1}
          />
          <button 
            type="submit"
            disabled={!inputText.trim() || !session.partnerConnected}
            className="absolute right-1.5 bottom-1.5 p-2.5 bg-apple-blue hover:bg-apple-blue-focus disabled:bg-apple-divider dark:disabled:bg-apple-tile-3 text-white rounded-full transition-transform active:scale-95"
          >
            <Send className="w-5 h-5 ml-0.5" />
          </button>
        </form>
      </div>
    </div>
  );
}
