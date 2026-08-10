import React from 'react';
import { motion } from 'motion/react';

export function ShareTextLogo({ className, size = 28, animated = false }: { className?: string, size?: number, animated?: boolean }) {
  if (animated) {
    return (
      <svg width={size} height={size} viewBox="0 0 256 256" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
        <motion.rect 
          initial={{ x: -10, opacity: 0.5 }}
          animate={{ x: 0, opacity: 1 }}
          transition={{ duration: 1, repeat: Infinity, repeatType: "reverse", ease: "easeInOut" }}
          x="40" y="40" width="136" height="176" rx="24" stroke="currentColor" strokeWidth="20" strokeLinejoin="round"
        />
        <motion.rect 
          initial={{ x: 10, opacity: 0.5 }}
          animate={{ x: 0, opacity: 1 }}
          transition={{ duration: 1, repeat: Infinity, repeatType: "reverse", ease: "easeInOut", delay: 0.2 }}
          x="100" y="80" width="116" height="156" rx="24" fill="#0066CC"
        />
        <motion.path 
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 1, repeat: Infinity, repeatType: "reverse", ease: "easeInOut", delay: 0.4 }}
          style={{ transformOrigin: "156px 158px" }}
          d="M136 158H176L156 138M176 158L156 178" stroke="white" strokeWidth="16" strokeLinecap="round" strokeLinejoin="round"
        />
      </svg>
    );
  }

  return (
    <svg width={size} height={size} viewBox="0 0 256 256" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
      <rect x="40" y="40" width="136" height="176" rx="24" stroke="currentColor" strokeWidth="20" strokeLinejoin="round"/>
      <rect x="100" y="80" width="116" height="156" rx="24" fill="#0066CC"/>
      <path d="M136 158H176L156 138M176 158L156 178" stroke="white" strokeWidth="16" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}
