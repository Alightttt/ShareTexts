import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import { MotionConfig } from 'motion/react';
import App from './App.tsx';
import { installDiagGlobal } from './lib/diag';
import { prewarmSignaling, signalingHttpBaseForTelemetry } from './lib/socket';
import { productEvent } from './lib/telemetry';
import './index.css';

// Product telemetry: one anonymous page_view per load (see lib/telemetry.ts
// for the privacy contract — event names only, no payloads, whitelist both ends).
(window as unknown as { __stSignalingHttpBase?: () => string | null }).__stSignalingHttpBase = signalingHttpBaseForTelemetry;
productEvent('product.page_view');

// Lifecycle diagnostics for the signaling/transfer journey — read them via
// window.__sharetextDiag.snapshot() when a connect or transfer fails.
installDiagGlobal();

// Prewarm the signaling transport in the background so creating a room (or
// joining with a code) skips the cold TLS/upgrade handshake when the user
// finally commits. The connection is reused as-is by both flows.
prewarmSignaling();

// Remove the branded loading shell now that React is painting
const shell = document.getElementById("loading-shell");
if (shell) {
  shell.classList.add("fade-out");
  setTimeout(() => shell.remove(), 260);
}

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
