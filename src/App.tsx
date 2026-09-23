/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, lazy, Suspense } from 'react';
import { SessionProvider, useSession } from './lib/SessionContext';
import { I18nProvider, useI18n } from './lib/i18n';
import { X, DoorOpen } from 'lucide-react';
import { ShareTextsLogo } from './components/ShareTextsLogo';

// SingleScreenApp (the landing IS the app) loads eagerly — one less network
// round-trip before the hero is interactive. Docs/Legal stay lazy: they are
// separate routes, streamed in only when visited.
import { SingleScreenApp } from './views/SingleScreenApp';
const Docs = lazy(() => import('./views/Docs').then(m => ({ default: m.Docs })));
const Legal = lazy(() => import('./views/Legal').then(m => ({ default: m.Legal })));

/**
 * DisconnectToast — the "that's it" moment, demoted from a full screen to a
 * quiet banner. The user is returned to the landing page instantly; this
 * small toast simply tells them WHY, then fades itself out. Auto-dismisses
 * after ~5.5s and can be closed with the ✕.
 */
function DisconnectToast({ reason, onDone }: { reason: string, onDone: () => void }) {
  const { t } = useI18n();
  const heading = reason === 'expired'
    ? t('app.ended.heading.expired')
    : reason === 'manual_close'
      ? t('app.ended.heading.manual')
      : t('app.ended.heading.closed');
  const copy = reason === 'expired'
    ? t('app.ended.body.expired')
    : reason === 'manual_close'
      ? t('app.ended.body.manual')
      : t('app.ended.body.closed');
  // Auto-fade: the message is auxiliary, it must never trap attention.
  useEffect(() => {
    const timer = setTimeout(onDone, 5500);
    return () => clearTimeout(timer);
  }, [onDone]);

  return (
    <div
      role="status"
      data-testid="disconnect-toast"
      className="fixed top-4 left-1/2 -translate-x-1/2 z-[90] max-w-[min(92vw,460px)] flex items-start gap-3 pl-3.5 pr-2 py-3 rounded-[16px] bg-white/95 dark:bg-[#232327]/95 backdrop-blur border border-black/[0.08] dark:border-white/[0.1] shadow-[0_12px_40px_-12px_rgba(0,0,0,0.25)] animate-[toast-in_0.28s_cubic-bezier(0.22,1,0.36,1)]"
    >
      <span className="shrink-0 w-8 h-8 rounded-full bg-apple-parchment dark:bg-white/[0.07] flex items-center justify-center">
        <DoorOpen className="w-4 h-4 text-apple-ink-muted dark:text-white/60" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[13.5px] font-semibold text-apple-ink dark:text-white leading-snug">{heading}</span>
        <span className="block text-[12.5px] text-apple-ink-muted dark:text-white/55 leading-snug mt-0.5">{copy}</span>
      </span>
      <button
        onClick={onDone}
        aria-label={t('details.close')}
        className="shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-apple-ink-muted/60 hover:text-apple-ink dark:text-white/40 dark:hover:text-white hover:bg-black/[0.05] dark:hover:bg-white/[0.08] transition-colors"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

/**
 * AppSkeleton — the boot/loading screen. Calm and simple: the brand mark
 * shimmers in the exact center, a quiet spinner turns beneath it. No fake
 * page geometry — nothing to mis-align against the real layout on swap.
 */
function AppSkeleton() {
  return (
    <div className="min-h-screen bg-apple-canvas dark:bg-[#131315] flex flex-col items-center justify-center gap-7">
      <div className="st-boot-logo" aria-hidden>
        <ShareTextsLogo size={52} mono />
      </div>
      <span
        className="st-boot-spinner"
        role="status"
        aria-label="Loading ShareTexts"
      />
    </div>
  );
}

function ErrorFallback({ onReset }: { onReset: () => void }) {
  // Rendered by the class boundary, which sits above the providers — static
  // English is intentional (recovery copy must never depend on a broken tree).
  // Design: calm Apple-style recovery — the mark, one honest headline, one
  // explanation, one primary path forward and one quiet alternative.
  return (
    <div className="min-h-screen flex flex-col bg-apple-canvas dark:bg-[#131315] dot-bg">
      <header className="shrink-0 flex items-center justify-between px-6 lg:px-10 py-4">
        <div className="flex items-center gap-2.5">
          <ShareTextsLogo size={24} className="text-apple-ink dark:text-white" mono />
          <span className="font-semibold tracking-tight text-[16px] text-apple-ink dark:text-white">ShareTexts</span>
        </div>
        <a
          href="/docs"
          className="px-3 py-2 min-h-[40px] flex items-center rounded-full text-[13px] font-medium text-apple-ink-muted dark:text-white/50 hover:text-apple-ink dark:hover:text-white hover:bg-black/[0.04] dark:hover:bg-white/[0.06] transition-colors"
        >Docs</a>
      </header>
      <main className="flex-1 flex flex-col items-center justify-center px-6 text-center">
        <div className="w-[72px] h-[72px] rounded-[22px] bg-white dark:bg-[#1c1c21] border border-apple-divider/70 dark:border-white/[0.08] shadow-[0_12px_40px_-12px_rgba(0,0,0,0.18)] flex items-center justify-center mb-7">
          <ShareTextsLogo size={34} motion="connecting" className="opacity-90" />
        </div>
        <h2 className="text-[26px] sm:text-[28px] font-semibold text-apple-ink dark:text-white mb-2 tracking-[-0.02em]">Something went wrong</h2>
        <p className="text-[15px] text-apple-ink-muted dark:text-white/60 max-w-sm mb-8 leading-relaxed">
          ShareTexts couldn't load properly. Your data is safe — nothing was lost.
        </p>
        <button
          onClick={onReset}
          className="px-7 min-h-[50px] bg-ember hover:bg-[#d9560e] text-white rounded-full text-[15px] font-semibold shadow-[0_1px_2px_rgba(240,100,19,0.25),0_4px_10px_-4px_rgba(240,100,19,0.35)] hover:shadow-[0_4px_10px_rgba(240,100,19,0.2),0_12px_26px_-8px_rgba(240,100,19,0.4)] transition-all active:scale-[0.97]"
        >
          Return to ShareTexts
        </button>
        <div className="mt-4 flex items-center gap-5 text-[13px] font-medium text-apple-ink-muted dark:text-white/45">
          <a href="/" className="hover:text-apple-ink dark:hover:text-white transition-colors">Go home</a>
          <span aria-hidden className="w-1 h-1 rounded-full bg-apple-divider" />
          <a href="/docs" className="hover:text-apple-ink dark:hover:text-white transition-colors">Open docs</a>
        </div>
      </main>
      <footer className="shrink-0 pb-6 text-center text-[12px] font-medium text-apple-ink-muted/60 dark:text-white/30">
        If this keeps happening, the error is on our side — it usually clears with a retry.
      </footer>
    </div>
  );
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const ErrorBoundary = class extends (React.Component as any) {
  state = { error: null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  // Log every caught crash: a silent boundary turns "something broke" into an
  // undiscoverable bug (the UI offers no clue what failed).
  componentDidCatch(error: Error, info: unknown) {
    console.error('[ShareTexts] render crash:', error, info);
  }
  render() {
    if (this.state.error) {
      return <ErrorFallback onReset={() => { try { localStorage.removeItem('sharetext.session.v1'); } catch {} window.location.href = '/'; }} />;
    }
    return (this.props as any).children;
  }
};

function AppContent() {
  const { t } = useI18n();
  const { session, leaveView } = useSession();
  // When a room ends (closed, expired, or the peer hung up), the user goes
  // STRAIGHT back to the landing page — no "session ended" screen. The
  // reason surfaces as a small toast instead. Captured in state first: the
  // reset below clears closedReason before the render that shows the toast.
  const [disconnectToast, setDisconnectToast] = useState<string | null>(null);
  useEffect(() => {
    if (session.closedReason) {
      setDisconnectToast(session.closedReason);
      leaveView();
    }
  }, [session.closedReason, leaveView]);

  if (typeof window !== 'undefined' && window.location.pathname === '/docs') {
    return <Suspense fallback={<AppSkeleton />}><Docs /></Suspense>;
  }

  if (typeof window !== 'undefined' && window.location.pathname === '/privacy') {
    return <Suspense fallback={<AppSkeleton />}><Legal page="privacy" /></Suspense>;
  }

  if (typeof window !== 'undefined' && window.location.pathname === '/terms') {
    return <Suspense fallback={<AppSkeleton />}><Legal page="terms" /></Suspense>;
  }

  if (typeof window !== 'undefined' && window.location.pathname !== '/' && !window.location.pathname.startsWith('/s/')) {
    return (
      <div
        className="min-h-screen flex flex-col items-center justify-center bg-apple-canvas dark:bg-[#131315] p-6 text-center">
        <h2 className="text-[28px] font-semibold text-apple-ink dark:text-white tracking-tight mb-2">{t('app.404.title')}</h2>
        <p className="text-[16px] text-apple-ink-muted dark:text-white/60 font-medium max-w-sm mb-9">{t('app.404.body')}</p>
        <button onClick={() => { window.location.href = '/'; }}
          className="px-7 py-3.5 bg-apple-ink dark:bg-white text-white dark:text-night-900 rounded-[12px] text-[15px] font-semibold active:scale-[0.97] min-h-[48px]">{t('app.404.cta')}</button>
      </div>
    );
  }

  return (
    <Suspense fallback={<AppSkeleton />}>
      <SingleScreenApp />
      {disconnectToast && <DisconnectToast reason={disconnectToast} onDone={() => setDisconnectToast(null)} />}
    </Suspense>
  );
}

function SkipLink() {
  const { t } = useI18n();
  return (
    // Keyboard users jump past the hero to main content
    <a href="#main-content" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[9999] focus:px-4 focus:py-2 focus:bg-azure-600 focus:text-white focus:rounded-lg focus:text-[14px] focus:font-semibold">
      {t('app.skip')}
    </a>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <I18nProvider>
        <SessionProvider>
          <SkipLink />
          <AppContent />
        </SessionProvider>
      </I18nProvider>
    </ErrorBoundary>
  );
}
