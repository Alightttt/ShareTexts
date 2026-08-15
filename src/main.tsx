import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import { MotionConfig } from 'motion/react';
import App from './App.tsx';
import { installDiagGlobal } from './lib/diag';
import './index.css';

// Lifecycle diagnostics for the signaling/transfer journey — read them via
// window.__sharetextDiag.snapshot() when a connect or transfer fails.
installDiagGlobal();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {/* Respect prefers-reduced-motion: JS-driven animations (hero demo,
        message cards, code digits) are disabled when the user asks for it. */}
    <MotionConfig reducedMotion="user">
      <App />
    </MotionConfig>
  </StrictMode>,
);

// PWA: register the service worker in production builds only. Skipped in dev
// so HMR and the local signaling server are never cached away.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      /* offline shell is progressive enhancement — ignore failures */
    });
  });
}
