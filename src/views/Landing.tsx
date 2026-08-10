import React, { useState } from 'react';
import { useSession } from '../lib/SessionContext';
import { motion } from 'motion/react';
import { ShareTextLogo } from '../components/ShareTextLogo';
import heroImage from '../assets/images/premium_devices_transfer_1786355810427.jpg';
import sendImage from '../assets/images/macro_phone_send_1786355826298.jpg';
import doneImage from '../assets/images/abstract_data_transfer_1786355846307.jpg';

export function Landing({ onJoinClick, closedReason }: { onJoinClick: () => void, closedReason?: string | null }) {
  const { createSession } = useSession();
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const handleCreate = async () => {
    if (isCreating) return;
    setIsCreating(true);
    setCreateError(null);
    try {
      await createSession();
    } catch (e: any) {
      setIsCreating(false);
      setCreateError(e.message || "Couldn't create a session.");
    }
  };

  return (
    <div className="min-h-screen bg-[#F5F5F7] dark:bg-black font-sans selection:bg-apple-blue/20 flex flex-col">
      {/* Navigation */}
      <nav className="w-full px-6 py-6 flex justify-between items-center max-w-7xl mx-auto z-50">
        <div className="flex items-center gap-2">
          <ShareTextLogo size={28} className="text-apple-ink dark:text-white" />
          <span className="font-semibold tracking-tight text-[18px] text-apple-ink dark:text-white">ShareText</span>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="pt-20 sm:pt-32 pb-16 px-6 flex flex-col items-center text-center max-w-5xl mx-auto w-full relative z-10">
        <motion.h1 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
          className="text-[48px] sm:text-[64px] md:text-[88px] font-semibold text-apple-ink dark:text-white tracking-[-0.04em] leading-[1.05]"
        >
          Share anything<br />between your devices.
        </motion.h1>
        
        <motion.p 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
          className="mt-6 text-[21px] sm:text-[24px] text-apple-ink-muted max-w-2xl font-medium leading-relaxed tracking-tight"
        >
          Text, photos and files. No app. No account.
        </motion.p>

        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.2, ease: [0.16, 1, 0.3, 1] }}
          className="mt-10 flex flex-col sm:flex-row items-center gap-4 w-full sm:w-auto"
        >
          <button 
            onPointerDown={handleCreate}
            disabled={isCreating}
            className="w-full sm:w-auto px-8 py-4 bg-apple-ink dark:bg-white text-white dark:text-black rounded-full text-[17px] font-semibold transition-transform active:scale-[0.97] disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {isCreating ? 'Starting...' : createError ? 'Try Again' : 'Create Session'}
          </button>
          <button 
            onPointerDown={onJoinClick}
            className="w-full sm:w-auto px-8 py-4 bg-transparent border border-apple-ink/20 dark:border-white/20 text-apple-ink dark:text-white hover:bg-apple-ink/5 dark:hover:bg-white/10 rounded-full text-[17px] font-semibold transition-transform active:scale-[0.97] flex items-center justify-center gap-2"
          >
            Join Session
          </button>
          {createError && (
            <span className="text-[14px] text-[#ff3b30] font-medium absolute -bottom-8">{createError}</span>
          )}
        </motion.div>
      </section>

      {/* Hero Image Full Bleed */}
      <section className="w-full relative mt-10">
        <div className="max-w-[1400px] mx-auto px-4 sm:px-6">
          <motion.div 
            initial={{ opacity: 0, scale: 0.98, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ duration: 1, delay: 0.3, ease: [0.16, 1, 0.3, 1] }}
            className="w-full aspect-[4/3] sm:aspect-[21/9] rounded-[24px] sm:rounded-[40px] overflow-hidden shadow-2xl relative"
          >
            <img src={heroImage} alt="Premium devices connected" className="w-full h-full object-cover" />
          </motion.div>
        </div>
      </section>

      {/* Feature Section 1 - Offset composition */}
      <section className="py-24 sm:py-40 px-6 max-w-[1400px] mx-auto w-full flex flex-col md:flex-row items-center gap-16 md:gap-24">
         <div className="flex-1 space-y-6">
           <h3 className="text-[36px] sm:text-[56px] font-semibold text-apple-ink dark:text-white leading-[1.1] tracking-tight">
             Original quality.<br />Instant transfer.
           </h3>
           <p className="text-[19px] sm:text-[21px] text-apple-ink-muted leading-relaxed max-w-lg font-medium">
             ShareText transfers your files exactly as they are. No compression, no transcoding, no loss of quality. Your 100MB RAW photo arrives as a 100MB RAW photo.
           </p>
         </div>
         <div className="flex-1 w-full relative">
           <div className="aspect-[4/5] sm:aspect-square rounded-[24px] sm:rounded-[40px] overflow-hidden relative shadow-2xl">
             <img src={sendImage} alt="Macro shot of phone screen sending file" className="w-full h-full object-cover" />
           </div>
         </div>
      </section>

      {/* Feature Section 2 - Edge bleeding */}
      <section className="py-24 sm:py-40 bg-white dark:bg-[#111111] overflow-hidden">
        <div className="max-w-[1400px] mx-auto px-6 flex flex-col md:flex-row-reverse items-center gap-16 md:gap-24">
          <div className="flex-1 space-y-6">
            <h3 className="text-[36px] sm:text-[56px] font-semibold text-apple-ink dark:text-white leading-[1.1] tracking-tight">
              Direct connection.<br />Zero intermediaries.
            </h3>
            <p className="text-[19px] sm:text-[21px] text-apple-ink-muted leading-relaxed max-w-lg font-medium">
              Files travel straight from one device to another using WebRTC Data Channels. They never touch a server, ensuring absolute privacy and maximum speed.
            </p>
          </div>
          <div className="flex-1 w-full h-[500px] sm:h-[700px] relative -ml-6 md:-ml-24">
             <img src={doneImage} alt="Abstract representation of data transfer" className="w-full h-full object-cover rounded-r-[24px] sm:rounded-r-[40px] shadow-2xl" />
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="py-32 sm:py-48 px-6 text-center flex flex-col items-center">
        <h2 className="text-[40px] sm:text-[56px] font-semibold text-apple-ink dark:text-white tracking-[-0.03em] mb-12 leading-[1.1]">
          Ready to transfer?
        </h2>
        <div className="flex flex-col items-center gap-3 w-full sm:w-auto">
          <button 
            onPointerDown={handleCreate}
            disabled={isCreating}
            className="px-12 py-5 bg-apple-ink dark:bg-white text-white dark:text-black rounded-full text-[19px] font-semibold transition-transform active:scale-[0.97] disabled:opacity-50 shadow-xl flex items-center justify-center gap-2 mx-auto w-full sm:w-auto"
          >
            {isCreating ? 'Starting...' : createError ? 'Try Again' : 'Create Session'}
          </button>
          {createError && (
            <span className="text-[14px] text-[#ff3b30] font-medium mt-2">{createError}</span>
          )}
        </div>
      </section>

      <footer className="w-full px-6 py-12 flex flex-col sm:flex-row justify-between items-center max-w-[1400px] mx-auto mt-auto text-apple-ink-muted text-[14px] font-medium border-t border-apple-divider dark:border-white/10">
        <div className="flex items-center gap-2 mb-4 sm:mb-0">
          <ShareTextLogo size={16} className="text-apple-ink-muted" />
          <span className="font-semibold tracking-tight">ShareText</span>
        </div>
        <div className="flex items-center gap-8">
           <a href="#" className="hover:text-apple-ink dark:hover:text-white transition-colors">Privacy</a>
           <a href="#" className="hover:text-apple-ink dark:hover:text-white transition-colors">Security</a>
        </div>
      </footer>
    </div>
  );
}
