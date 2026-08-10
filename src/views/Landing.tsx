import React, { useState } from 'react';
import { useSession } from '../lib/SessionContext';
import { motion } from 'motion/react';
import { FileText, Image as ImageIcon, File as FileIcon, ArrowRight, Shield, FileArchive, Film, Music, Copy } from 'lucide-react';
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
    <div className="min-h-screen bg-[#fafafa] dark:bg-[#000000] font-sans selection:bg-apple-blue/20">
      {/* Navigation */}
      <nav className="w-full px-6 py-6 flex justify-between items-center max-w-7xl mx-auto fixed top-0 left-0 right-0 z-50 mix-blend-difference text-white">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 bg-white rounded-md flex items-center justify-center">
            <span className="text-black font-bold text-[13px]">S</span>
          </div>
          <span className="font-semibold tracking-tight text-[15px]">ShareText</span>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="pt-32 sm:pt-48 pb-24 px-6 flex flex-col items-center text-center max-w-4xl mx-auto">
        <motion.h1 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
          className="text-[48px] sm:text-[64px] md:text-[80px] font-semibold text-apple-ink dark:text-white tracking-tighter leading-[1.05]"
        >
          Share anything<br />between your devices.
        </motion.h1>
        
        <motion.p 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
          className="mt-6 text-[19px] sm:text-[22px] text-apple-ink-muted max-w-2xl font-medium leading-relaxed"
        >
          Text, photos and files. No app. No account. Just connect.
        </motion.p>

        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.2, ease: [0.16, 1, 0.3, 1] }}
          className="mt-12 flex flex-col sm:flex-row items-center gap-4"
        >
          <button 
            onClick={handleCreate}
            disabled={isCreating}
            className="px-8 py-4 bg-apple-ink dark:bg-white text-white dark:text-black rounded-full text-[17px] font-semibold transition-transform active:scale-95 disabled:opacity-50 flex items-center gap-2 shadow-lg shadow-black/5"
          >
            {isCreating ? 'Starting...' : 'Create Session'}
          </button>
          <button 
            onClick={onJoinClick}
            className="px-8 py-4 bg-transparent border border-apple-divider dark:border-apple-tile-3 text-apple-ink dark:text-white hover:bg-apple-parchment dark:hover:bg-apple-tile-2 rounded-full text-[17px] font-semibold transition-all active:scale-95 flex items-center gap-2"
          >
            Join Session
          </button>
        </motion.div>
      </section>

      {/* Hero Demo Animation */}
      <section className="w-full max-w-5xl mx-auto px-6 py-12">
        <div className="relative w-full h-[400px] flex items-center justify-center">
          
          <div className="absolute left-[15%] w-[120px] h-[160px] sm:w-[160px] sm:h-[220px] rounded-[16px] sm:rounded-[24px] border-4 sm:border-8 border-[#333] bg-black shadow-2xl flex flex-col justify-end p-2 sm:p-4">
             <div className="w-full h-1/2 bg-white/10 rounded-[8px]" />
          </div>
          
          <div className="absolute right-[15%] w-[60px] h-[120px] sm:w-[80px] sm:h-[160px] rounded-[16px] sm:rounded-[24px] border-4 border-[#333] bg-black shadow-2xl flex flex-col p-1 sm:p-2">
             <div className="w-full h-4 sm:h-6 bg-white/10 rounded-full mt-2" />
          </div>
          
          <motion.div 
            animate={{ 
              x: [-120, 120, -120], 
              y: [0, -20, 0],
              scale: [1, 0.9, 1],
              rotate: [-5, 5, -5]
            }}
            transition={{ duration: 6, ease: "easeInOut", repeat: Infinity }}
            className="absolute z-10 w-[140px] p-3 bg-white dark:bg-[#1c1c1e] border border-apple-divider/30 dark:border-white/10 rounded-[16px] shadow-xl flex items-center gap-3"
          >
            <div className="w-8 h-8 rounded-[8px] bg-blue-500/10 flex items-center justify-center shrink-0">
              <FileText className="w-4 h-4 text-blue-500" />
            </div>
            <div className="flex-1 space-y-1.5">
              <div className="h-2 w-full bg-apple-divider dark:bg-apple-tile-3 rounded-full" />
              <div className="h-2 w-2/3 bg-apple-divider dark:bg-apple-tile-3 rounded-full" />
            </div>
          </motion.div>
          
        </div>
      </section>

      {/* Section: Text */}
      <section className="py-24 sm:py-32 px-6 max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-16 md:gap-24 items-center">
        <div className="order-2 md:order-1 relative aspect-square md:aspect-auto md:h-[500px] w-full bg-apple-parchment dark:bg-apple-tile-1 rounded-[40px] flex items-center justify-center overflow-hidden border border-apple-divider/50 dark:border-white/5">
           <motion.div 
              initial={{ y: 50, opacity: 0 }}
              whileInView={{ y: 0, opacity: 1 }}
              viewport={{ once: true }}
              className="w-[280px] bg-white dark:bg-[#1c1c1e] p-5 rounded-[24px] shadow-2xl border border-apple-divider/30 dark:border-white/10"
           >
             <p className="text-[17px] text-apple-ink dark:text-white leading-relaxed font-mono">
               https://github.com/example/repo
             </p>
             <div className="mt-6 flex justify-end">
               <button className="flex items-center gap-2 px-4 py-2 bg-apple-blue text-white rounded-full text-[13px] font-semibold">
                 <Copy className="w-4 h-4" /> Copy
               </button>
             </div>
           </motion.div>
        </div>
        <div className="order-1 md:order-2 flex flex-col items-start max-w-md">
          <div className="w-12 h-12 bg-apple-blue/10 rounded-2xl flex items-center justify-center mb-6">
            <FileText className="w-6 h-6 text-apple-blue" />
          </div>
          <h2 className="text-[32px] sm:text-[40px] font-semibold text-apple-ink dark:text-white tracking-tight leading-[1.1]">
            Text, exactly where you need it.
          </h2>
          <p className="mt-5 text-[18px] text-apple-ink-muted leading-relaxed">
            Paste a URL, code, note or anything else. Copy it instantly on your other device.
          </p>
        </div>
      </section>

      {/* Section: Photos */}
      <section className="py-24 sm:py-32 px-6 max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-16 md:gap-24 items-center">
        <div className="flex flex-col items-start max-w-md">
          <div className="w-12 h-12 bg-purple-500/10 rounded-2xl flex items-center justify-center mb-6">
            <ImageIcon className="w-6 h-6 text-purple-500" />
          </div>
          <h2 className="text-[32px] sm:text-[40px] font-semibold text-apple-ink dark:text-white tracking-tight leading-[1.1]">
            Full-quality photos.
          </h2>
          <p className="mt-5 text-[18px] text-apple-ink-muted leading-relaxed">
            Share the original image file without resizing or reducing quality.
          </p>
        </div>
        <div className="relative aspect-square md:aspect-auto md:h-[500px] w-full bg-[#f0f0f0] dark:bg-[#1a1a1a] rounded-[40px] flex items-center justify-center overflow-hidden border border-apple-divider/50 dark:border-white/5">
           <motion.div 
             initial={{ scale: 0.9, opacity: 0 }}
             whileInView={{ scale: 1, opacity: 1 }}
             viewport={{ once: true }}
             className="w-[80%] h-[80%] rounded-[24px] overflow-hidden shadow-2xl bg-[#e5e5e5] dark:bg-[#222]"
           >
             {/* Abstract shape representing high res image */}
             <div className="w-full h-full bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 opacity-80 mix-blend-overlay" />
           </motion.div>
        </div>
      </section>

      {/* Section: Files */}
      <section className="py-24 sm:py-32 px-6 max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-16 md:gap-24 items-center">
        <div className="order-2 md:order-1 relative aspect-square md:aspect-auto md:h-[500px] w-full bg-apple-parchment dark:bg-apple-tile-1 rounded-[40px] flex items-center justify-center overflow-hidden border border-apple-divider/50 dark:border-white/5 p-6">
           <div className="flex flex-col gap-4 w-full max-w-[320px]">
             {[
               { icon: <FileText />, color: "text-blue-500", bg: "bg-blue-500/10", name: "Report.pdf", size: "2.4 MB" },
               { icon: <FileArchive />, color: "text-yellow-500", bg: "bg-yellow-500/10", name: "Assets.zip", size: "48 MB" },
               { icon: <Film />, color: "text-purple-500", bg: "bg-purple-500/10", name: "Demo.mp4", size: "120 MB" },
               { icon: <Music />, color: "text-green-500", bg: "bg-green-500/10", name: "Audio.mp3", size: "8 MB" }
             ].map((file, i) => (
               <motion.div 
                 key={i}
                 initial={{ x: -20, opacity: 0 }}
                 whileInView={{ x: 0, opacity: 1 }}
                 viewport={{ once: true }}
                 transition={{ delay: i * 0.1 }}
                 className="flex items-center gap-4 bg-white dark:bg-[#1c1c1e] p-4 rounded-[20px] shadow-sm border border-apple-divider/30 dark:border-white/10"
               >
                 <div className={cn("w-12 h-12 rounded-xl flex items-center justify-center", file.bg, file.color)}>
                   {file.icon}
                 </div>
                 <div className="flex flex-col flex-1">
                   <span className="text-[15px] font-semibold text-apple-ink dark:text-white">{file.name}</span>
                   <span className="text-[13px] text-apple-ink-muted font-medium">{file.size}</span>
                 </div>
               </motion.div>
             ))}
           </div>
        </div>
        <div className="order-1 md:order-2 flex flex-col items-start max-w-md">
          <div className="w-12 h-12 bg-orange-500/10 rounded-2xl flex items-center justify-center mb-6">
            <FileIcon className="w-6 h-6 text-orange-500" />
          </div>
          <h2 className="text-[32px] sm:text-[40px] font-semibold text-apple-ink dark:text-white tracking-tight leading-[1.1]">
            Files without the friction.
          </h2>
          <p className="mt-5 text-[18px] text-apple-ink-muted leading-relaxed">
            Send individual files directly inside the same temporary room.
          </p>
        </div>
      </section>

      {/* How it works */}
      <section className="py-32 px-6 max-w-6xl mx-auto">
         <div className="grid grid-cols-1 md:grid-cols-3 gap-12 sm:gap-6">
           <div className="flex flex-col text-left">
             <span className="text-[14px] font-bold tracking-widest text-apple-ink-muted mb-4 uppercase">01 Connect</span>
             <h3 className="text-[24px] font-semibold text-apple-ink dark:text-white mb-2">Open ShareText on both devices.</h3>
           </div>
           <div className="flex flex-col text-left">
             <span className="text-[14px] font-bold tracking-widest text-apple-ink-muted mb-4 uppercase">02 Send</span>
             <h3 className="text-[24px] font-semibold text-apple-ink dark:text-white mb-2">Paste text or add a photo or file.</h3>
           </div>
           <div className="flex flex-col text-left">
             <span className="text-[14px] font-bold tracking-widest text-apple-ink-muted mb-4 uppercase">03 Done</span>
             <h3 className="text-[24px] font-semibold text-apple-ink dark:text-white mb-2">Copy, open or save it on the other device.</h3>
           </div>
         </div>
      </section>

      {/* Privacy */}
      <section className="py-24 px-6 max-w-3xl mx-auto text-center border-t border-apple-divider/50 dark:border-white/5">
        <div className="w-16 h-16 mx-auto bg-apple-parchment dark:bg-apple-tile-1 rounded-full flex items-center justify-center mb-8 border border-apple-divider dark:border-apple-tile-3 shadow-sm">
          <Shield className="w-8 h-8 text-apple-ink dark:text-white" />
        </div>
        <h2 className="text-[28px] sm:text-[36px] font-semibold text-apple-ink dark:text-white tracking-tight mb-4">
          Temporary by design.
        </h2>
        <p className="text-[18px] text-apple-ink-muted leading-relaxed mb-8">
          Rooms disappear. Messages aren't kept as permanent history.
        </p>
        <button className="text-[15px] font-semibold text-apple-ink dark:text-white hover:text-apple-blue transition-colors group flex items-center justify-center gap-1 mx-auto">
          Learn about security <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
        </button>
      </section>

      {/* Final CTA */}
      <section className="py-32 px-6 text-center">
        <h2 className="text-[40px] sm:text-[56px] font-semibold text-apple-ink dark:text-white tracking-tight mb-10">
          Need to move something?
        </h2>
        <button 
          onClick={handleCreate}
          disabled={isCreating}
          className="px-10 py-5 bg-apple-ink dark:bg-white text-white dark:text-black rounded-full text-[19px] font-semibold transition-transform active:scale-95 disabled:opacity-50 shadow-lg shadow-black/10"
        >
          {isCreating ? 'Starting...' : 'Create Session'}
        </button>
      </section>

      <footer className="w-full px-6 py-12 flex flex-col sm:flex-row justify-between items-center max-w-7xl mx-auto border-t border-apple-divider/50 dark:border-white/5 mt-auto">
        <div className="flex items-center gap-2 mb-4 sm:mb-0">
          <div className="w-5 h-5 bg-apple-ink dark:bg-white rounded-[4px] flex items-center justify-center">
            <span className="text-white dark:text-black font-bold text-[10px]">S</span>
          </div>
          <span className="font-semibold text-[14px] text-apple-ink dark:text-white tracking-tight">ShareText</span>
        </div>
        <div className="flex items-center gap-8">
           <a href="#" className="text-[14px] font-medium text-apple-ink-muted hover:text-apple-ink transition-colors">Privacy</a>
           <a href="#" className="text-[14px] font-medium text-apple-ink-muted hover:text-apple-ink transition-colors">Security</a>
           <a href="#" className="text-[14px] font-medium text-apple-ink-muted hover:text-apple-ink transition-colors">About</a>
        </div>
      </footer>
    </div>
  );
}
