import React, { useState } from 'react';
import { useSession } from '../lib/SessionContext';
import { motion, AnimatePresence } from 'motion/react';
import { FileText, Image as ImageIcon, File as FileIcon, ArrowRight, Shield, Smartphone, Laptop, Zap, Check, Copy } from 'lucide-react';
import { cn } from '../lib/utils';

export function Landing({ onJoinClick, closedReason }: { onJoinClick: () => void, closedReason?: string | null }) {
  const { createSession } = useSession();
  const [isCreating, setIsCreating] = useState(false);

  const handleCreate = async () => {
    setIsCreating(true);
    try {
      await createSession();
    } catch (e) {
      setIsCreating(false);
    }
  };

  return (
    <div className="min-h-screen bg-apple-canvas dark:bg-black font-sans selection:bg-apple-blue/20 flex flex-col">
      {/* Navigation */}
      <nav className="w-full px-6 py-6 flex justify-between items-center max-w-7xl mx-auto z-50">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 bg-apple-ink dark:bg-white rounded-lg flex items-center justify-center shadow-sm">
            <span className="text-white dark:text-black font-bold text-[14px]">S</span>
          </div>
          <span className="font-semibold tracking-tight text-[16px] text-apple-ink dark:text-white">ShareText</span>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="pt-20 sm:pt-32 pb-20 px-6 flex flex-col items-center text-center max-w-5xl mx-auto w-full relative">
        <motion.h1 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
          className="text-[44px] sm:text-[64px] md:text-[80px] font-semibold text-apple-ink dark:text-white tracking-[-0.03em] leading-[1.05]"
        >
          Share anything<br />between your devices.
        </motion.h1>
        
        <motion.p 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
          className="mt-6 text-[19px] sm:text-[22px] text-apple-ink-muted max-w-2xl font-medium leading-relaxed tracking-tight"
        >
          Text, photos and files. No app. No account.
        </motion.p>

        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.2, ease: [0.16, 1, 0.3, 1] }}
          className="mt-12 flex flex-col sm:flex-row items-center gap-4 w-full sm:w-auto"
        >
          <button 
            onPointerDown={handleCreate}
            disabled={isCreating}
            className="w-full sm:w-auto px-8 py-4 bg-apple-ink dark:bg-white text-white dark:text-black rounded-full text-[17px] font-semibold transition-transform active:scale-[0.97] disabled:opacity-50 flex items-center justify-center gap-2 shadow-lg shadow-black/5"
          >
            {isCreating ? 'Starting...' : 'Create Session'}
          </button>
          <button 
            onPointerDown={onJoinClick}
            className="w-full sm:w-auto px-8 py-4 bg-transparent border border-apple-divider dark:border-apple-tile-3 text-apple-ink dark:text-white hover:bg-apple-parchment dark:hover:bg-apple-tile-2 rounded-full text-[17px] font-semibold transition-transform active:scale-[0.97] flex items-center justify-center gap-2"
          >
            Join Session
          </button>
        </motion.div>
      </section>

      {/* Hero Demo Animation: Two Devices */}
      <section className="w-full max-w-5xl mx-auto px-6 py-12 relative h-[450px] sm:h-[500px] flex justify-center items-center overflow-hidden">
        {/* Laptop Outline */}
        <div className="absolute left-[5%] sm:left-[15%] flex flex-col items-center opacity-80">
           <div className="w-[180px] sm:w-[260px] h-[120px] sm:h-[170px] border-4 sm:border-[6px] border-apple-divider dark:border-apple-tile-3 rounded-t-[16px] sm:rounded-t-[20px] bg-apple-canvas dark:bg-black overflow-hidden relative shadow-2xl">
             <div className="absolute top-2 right-2 w-12 h-2 bg-apple-parchment dark:bg-apple-tile-2 rounded-full" />
             <div className="absolute top-6 left-4 w-2/3 h-2 bg-apple-parchment dark:bg-apple-tile-2 rounded-full" />
             <div className="absolute top-10 left-4 w-1/2 h-2 bg-apple-parchment dark:bg-apple-tile-2 rounded-full" />
           </div>
           <div className="w-[220px] sm:w-[320px] h-[8px] sm:h-[12px] bg-apple-divider dark:border-apple-tile-3 rounded-b-[8px]" />
           <Laptop className="mt-4 w-6 h-6 text-apple-ink-muted/50" />
        </div>

        {/* Phone Outline */}
        <div className="absolute right-[5%] sm:right-[15%] flex flex-col items-center opacity-80">
          <div className="w-[80px] sm:w-[110px] h-[160px] sm:h-[220px] border-4 sm:border-[6px] border-apple-divider dark:border-apple-tile-3 rounded-[20px] sm:rounded-[28px] bg-apple-canvas dark:bg-black overflow-hidden relative shadow-2xl">
             <div className="absolute top-2 left-1/2 -translate-x-1/2 w-1/3 h-1.5 bg-apple-divider dark:bg-apple-tile-3 rounded-full" />
             <div className="absolute bottom-4 right-2 left-2 h-10 bg-apple-parchment dark:bg-apple-tile-2 rounded-[12px]" />
          </div>
          <Smartphone className="mt-4 w-6 h-6 text-apple-ink-muted/50" />
        </div>

        {/* Transferring Object */}
        <motion.div 
          animate={{ 
            x: ["-120%", "120%"],
            scale: [0.8, 1.1, 0.8],
            opacity: [0, 1, 0],
            rotate: [-10, 10]
          }}
          transition={{ 
            duration: 3,
            ease: "easeInOut",
            repeat: Infinity,
            repeatDelay: 1.5
          }}
          className="absolute z-10 p-4 bg-white dark:bg-[#1c1c1e] border border-apple-divider/50 dark:border-white/10 rounded-[20px] shadow-xl flex items-center gap-3 w-[160px] sm:w-[200px] backdrop-blur-md"
        >
          <div className="w-10 h-10 rounded-[12px] bg-blue-500/10 flex items-center justify-center shrink-0">
            <FileText className="w-5 h-5 text-blue-500" />
          </div>
          <div className="flex-1 space-y-2">
            <div className="h-2 w-full bg-apple-divider dark:bg-apple-tile-3 rounded-full" />
            <div className="h-2 w-2/3 bg-apple-divider dark:bg-apple-tile-3 rounded-full" />
          </div>
        </motion.div>
      </section>

      {/* How it works */}
      <section className="py-24 sm:py-32 px-6 max-w-6xl mx-auto w-full">
         <div className="grid grid-cols-1 md:grid-cols-3 gap-16 md:gap-8">
           <StepCard 
             number="01" 
             title="Connect" 
             description="Open ShareText on both devices."
             visual={<div className="flex items-center justify-center gap-4 h-full">
                <div className="w-12 h-16 rounded-[8px] border-2 border-apple-divider dark:border-apple-tile-3 flex items-center justify-center"><Smartphone className="w-5 h-5 text-apple-ink-muted" /></div>
                <div className="w-8 h-[2px] bg-apple-blue/50 rounded-full relative"><div className="absolute inset-0 bg-apple-blue animate-pulse" /></div>
                <div className="w-16 h-12 rounded-[8px] border-2 border-apple-divider dark:border-apple-tile-3 flex items-center justify-center"><Laptop className="w-5 h-5 text-apple-ink-muted" /></div>
             </div>}
           />
           <StepCard 
             number="02" 
             title="Send" 
             description="Paste text or add a photo or file."
             visual={<div className="flex items-center justify-center h-full relative">
               <div className="w-[80%] h-[60%] bg-apple-parchment dark:bg-apple-tile-1 rounded-[12px] border border-apple-divider dark:border-apple-tile-3 flex flex-col p-2 gap-2">
                 <div className="w-full h-1/2 bg-white dark:bg-black rounded-[6px] flex items-center px-2"><span className="w-1/2 h-1.5 bg-apple-divider dark:bg-apple-tile-3 rounded-full" /></div>
                 <div className="w-1/3 h-6 bg-apple-blue rounded-[6px] ml-auto self-end flex items-center justify-center"><ArrowRight className="w-3 h-3 text-white" /></div>
               </div>
             </div>}
           />
           <StepCard 
             number="03" 
             title="Done" 
             description="Copy, open or save it on the other device."
             visual={<div className="flex items-center justify-center h-full">
               <div className="px-4 py-2 bg-[#34c759]/10 text-[#34c759] rounded-full flex items-center gap-2 font-semibold text-[14px]">
                 <Check className="w-4 h-4" /> Received
               </div>
             </div>}
           />
         </div>
      </section>

      {/* Final CTA */}
      <section className="py-24 sm:py-32 px-6 text-center">
        <h2 className="text-[36px] sm:text-[48px] font-semibold text-apple-ink dark:text-white tracking-[-0.02em] mb-10 leading-tight">
          Ready to transfer?
        </h2>
        <button 
          onPointerDown={handleCreate}
          disabled={isCreating}
          className="px-10 py-5 bg-apple-ink dark:bg-white text-white dark:text-black rounded-full text-[19px] font-semibold transition-transform active:scale-[0.97] disabled:opacity-50 shadow-lg shadow-black/10 flex items-center justify-center gap-2 mx-auto"
        >
          {isCreating ? 'Starting...' : 'Create Session'}
        </button>
      </section>

      <footer className="w-full px-6 py-12 flex flex-col sm:flex-row justify-between items-center max-w-7xl mx-auto border-t border-apple-divider/50 dark:border-white/5 mt-auto text-apple-ink-muted text-[14px]">
        <div className="flex items-center gap-2 mb-4 sm:mb-0">
          <div className="w-5 h-5 bg-apple-ink-muted/20 rounded-[4px] flex items-center justify-center">
            <span className="text-apple-ink dark:text-white font-bold text-[10px]">S</span>
          </div>
          <span className="font-semibold tracking-tight text-apple-ink dark:text-white">ShareText</span>
        </div>
        <div className="flex items-center gap-6 font-medium">
           <a href="#" className="hover:text-apple-ink dark:hover:text-white transition-colors">Privacy</a>
           <a href="#" className="hover:text-apple-ink dark:hover:text-white transition-colors">Security</a>
        </div>
      </footer>
    </div>
  );
}

function StepCard({ number, title, description, visual }: { number: string, title: string, description: string, visual: React.ReactNode }) {
  return (
    <div className="flex flex-col text-left group">
      <div className="h-[140px] w-full bg-[#f9f9f9] dark:bg-[#121212] rounded-[24px] mb-6 overflow-hidden border border-apple-divider/50 dark:border-white/5 relative">
        {visual}
      </div>
      <span className="text-[13px] font-bold tracking-widest text-apple-ink-muted mb-3 uppercase font-mono">{number}</span>
      <h3 className="text-[24px] font-semibold text-apple-ink dark:text-white mb-2 tracking-tight">{title}</h3>
      <p className="text-[16px] text-apple-ink-muted leading-relaxed font-medium">{description}</p>
    </div>
  );
}
