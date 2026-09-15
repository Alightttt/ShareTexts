/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, lazy, Suspense } from 'react';
import { SessionProvider, useSession } from './lib/SessionContext';
import { I18nProvider, useI18n } from './lib/i18n';
import { Send, Home, Share2, Check } from 'lucide-react';
import { ShareTextLogo } from './components/ShareTextLogo';

// SingleScreenApp (the landing IS the app) loads eagerly — one less network
// round-trip before the hero is interactive. Docs/Legal stay lazy: they are
// separate routes, streamed in only when visited.
import { SingleScreenApp } from './views/SingleScreenApp';
const Docs = lazy(() => import('./views/Docs').then(m => ({ default: m.Docs })));
const Legal = lazy(() => import('./views/Legal').then(m => ({ default: m.Legal })));

function SessionEndedScreen({ reason, onNewSession, onHome }: { reason: string, onNewSession: () => void, onHome: () => void }) {
  const { t } = useI18n();
  // One honest line about what happened, then one clear action.
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
  const sub = t('app.ended.sub');

  const [shared, setShared] = useState(false);
  const shareApp = async () => {
    try {
      await navigator.clipboard.writeText(window.location.origin);
    } catch {
      /* fall back to the buttons */
    }
    setShared(true);
    setTimeout(() => setShared(false), 2000);
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-apple-canvas dark:bg-[#131315] p-6 text-center">
      <ShareTextLogo
        size={56}
        motion={reason === 'expired' ? undefined : 'complete'}
        className="text-apple-ink dark:text-white mb-7 opacity-80"
      />
      <h2 className="text-[28px] font-semibold text-apple-ink dark:text-white tracking-tight mb-2">{heading}</h2>
      <p className="text-[16px] text-apple-ink-muted dark:text-white/60 font-medium max-w-sm mb-1.5">{copy}</p>
      <p className="text-[13.5px] text-apple-ink-muted/80 dark:text-white/40 font-medium max-w-xs mb-9">{sub}</p>

      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full max-w-sm sm:max-w-none sm:w-auto">
        <button
          onPointerDown={onNewSession}
          className="px-7 py-3.5 bg-apple-ink dark:bg-white text-white dark:text-night-900 rounded-[12px] text-[15px] font-semibold transition-motion active:scale-[0.97] shadow-sm hover:opacity-90 min-h-[48px] flex items-center justify-center gap-2"
        >
          <Send className="w-4 h-4" /> {t('app.ended.cta')}
        </button>
        <button
          onPointerDown={onHome}
          className="px-6 py-3 rounded-[12px] text-[14px] font-medium text-apple-ink-muted dark:text-white/60 border border-apple-divider dark:border-white/15 hover:text-apple-ink dark:hover:text-white hover:border-apple-ink/30 dark:hover:border-white/30 transition-motion active:scale-[0.97] min-h-[48px] flex items-center justify-center gap-1.5"
        >
          <Home className="w-4 h-4" /> {t('app.ended.home')}
        </button>
      </div>

      {/* The quiet referral moment — ShareText is free, and every session
          needs a second device, so sharing IS the product loop. */}
      <button
        onPointerDown={shareApp}
        className="mt-8 flex items-center gap-2 px-4 py-2 rounded-full text-[13.5px] font-medium text-apple-ink-muted dark:text-white/55 hover:text-apple-ink dark:hover:text-white border border-transparent hover:border-apple-divider dark:hover:border-white/15 transition-motion active:scale-95 min-h-[44px]"
      >
        {shared ? <Check className="w-4 h-4 text-status-success" /> : <Share2 className="w-4 h-4" />}
        {shared ? t('app.ended.shareDone') : t('app.ended.share')}
      </button>
    </div>
  );
}

/**
 * AppSkeleton — a premium, calm loading frame that mirrors the real page's
 * geometry exactly, so the swap to loaded content is nearly invisible.
 * A single soft shimmer sweeps down the page (one gradient, CSS-only, GPU
 * cheap) instead of each block pulsing on its own timer.
 */
function AppSkeleton({ docs = false }: { docs?: boolean }) {
  // Stable brand frame while the route hydrates: header + skeleton lines,
  // so a slow load never reads as a broken or blank page.
  return (
    <div className="min-h-screen bg-apple-canvas dark:bg-[#131315] flex flex-col">
      <header className="shrink-0 flex items-center justify-between px-6 lg:px-10 py-4 border-b border-apple-divider/60 dark:border-white/[0.06]">
        <div className="flex items-center gap-2.5">
          <ShareTextLogo size={20} />
          <span className="font-semibold tracking-tight text-[15px] text-apple-ink dark:text-white">ShareText</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="w-9 h-4 rounded-full bg-apple-divider/80 dark:bg-white/10" />
          {/* Skeleton mirrors the real theme toggle's 62×40 pill */}
          <span className="w-[62px] h-[40px] rounded-full bg-apple-divider/80 dark:bg-white/10" />
        </div>
      </header>
      <div className="relative flex-1 w-full max-w-xl mx-auto px-6 lg:px-10 py-14 sm:py-20 overflow-hidden st-skeleton-sweep">
        {docs ? (
          <>
            <div className="h-7 w-1/3 rounded-lg bg-apple-divider/60 dark:bg-white/[0.08]" />
            <div className="mt-6 space-y-3">
              <div className="h-4 w-full rounded bg-apple-divider/40 dark:bg-white/[0.05]" />
              <div className="h-4 w-5/6 rounded bg-apple-divider/40 dark:bg-white/[0.05]" />
              <div className="h-4 w-2/3 rounded bg-apple-divider/40 dark:bg-white/[0.05]" />
              <div className="mt-8 h-64 w-full rounded-[20px] bg-apple-parchment dark:bg-white/[0.04]" />
            </div>
          </>
        ) : (
          /* Home skeleton mirrors the real hero's geometry — headline,
             subtitle, the two pill CTAs, and the device image at their true
             sizes and rhythm. */
          <>
            <div className="h-[42px] w-[76%] rounded-[10px] bg-apple-divider/60 dark:bg-white/[0.08]" />
            <div className="mt-3 h-[42px] w-[52%] rounded-[10px] bg-apple-divider/60 dark:bg-white/[0.08]" />
            <div className="mt-5 space-y-2">
              <div className="h-4 w-full max-w-[380px] rounded bg-apple-divider/40 dark:bg-white/[0.05]" />
              <div className="h-4 w-[68%] max-w-[260px] rounded bg-apple-divider/40 dark:bg-white/[0.05]" />
            </div>
            <div className="mt-8 flex gap-6">
              <div className="h-12 w-32 rounded-full bg-ember/25 dark:bg-ember/20" />
              <div className="h-12 w-32 rounded-full border border-apple-divider dark:border-white/10" />
            </div>
          </>
        )}
      </div>
      <div className="sr-only" role="status">Loading ShareText…</div>
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
          <ShareTextLogo size={24} className="text-apple-ink dark:text-white" mono />
          <span className="font-semibold tracking-tight text-[16px] text-apple-ink dark:text-white">ShareText</span>
        </div>
        <a
          href="/docs"
          className="px-3 py-2 min-h-[40px] flex items-center rounded-full text-[13px] font-medium text-apple-ink-muted dark:text-white/50 hover:text-apple-ink dark:hover:text-white hover:bg-black/[0.04] dark:hover:bg-white/[0.06] transition-colors"
        >Docs</a>
      </header>
      <main className="flex-1 flex flex-col items-center justify-center px-6 text-center">
        <div className="w-[72px] h-[72px] rounded-[22px] bg-white dark:bg-[#1c1c21] border border-apple-divider/70 dark:border-white/[0.08] shadow-[0_12px_40px_-12px_rgba(0,0,0,0.18)] flex items-center justify-center mb-7">
          <ShareTextLogo size={34} motion="connecting" className="opacity-90" />
        </div>
        <h2 className="text-[26px] sm:text-[28px] font-semibold text-apple-ink dark:text-white mb-2 tracking-[-0.02em]">Something went wrong</h2>
        <p className="text-[15px] text-apple-ink-muted dark:text-white/60 max-w-sm mb-8 leading-relaxed">
          ShareText couldn't load properly. Your data is safe — nothing was lost.
        </p>
        <button
          onClick={onReset}
          className="px-7 min-h-[50px] bg-ember hover:bg-[#d9560e] text-white rounded-full text-[15px] font-semibold shadow-[0_1px_2px_rgba(240,100,19,0.25),0_4px_10px_-4px_rgba(240,100,19,0.35)] hover:shadow-[0_4px_10px_rgba(240,100,19,0.2),0_12px_26px_-8px_rgba(240,100,19,0.4)] transition-all active:scale-[0.97]"
        >
          Return to ShareText
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
  render() {
    if (this.state.error) {
      return <ErrorFallback onReset={() => { try { localStorage.removeItem('sharetext.session.v1'); } catch {} window.location.href = '/'; }} />;
    }
    return (this.props as any).children;
  }
};

function AppContent() {
  const { t } = useI18n();
  const { session, leaveView, createSession, closeSession } = useSession();

  if (typeof window !== 'undefined' && window.location.pathname === '/docs') {
    return <Suspense fallback={<AppSkeleton docs />}><Docs /></Suspense>;
  }

  if (typeof window !== 'undefined' && window.location.pathname === '/privacy') {
    return <Suspense fallback={<AppSkeleton docs />}><Legal page="privacy" /></Suspense>;
  }

  if (typeof window !== 'undefined' && window.location.pathname === '/terms') {
    return <Suspense fallback={<AppSkeleton docs />}><Legal page="terms" /></Suspense>;
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

  if (session.closedReason) {
    return (
      <>
        <SessionEndedScreen
          reason={session.closedReason}
          onNewSession={() => { leaveView(); void createSession(); }}
          onHome={() => { leaveView(); window.location.href = '/'; }}
        />
      </>
    );
  }

  return (
    <Suspense fallback={<AppSkeleton />}>
      <SingleScreenApp />
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
