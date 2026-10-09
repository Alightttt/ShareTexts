/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, lazy, Suspense } from 'react';
import { SessionProvider, useSession } from './lib/SessionContext';
import { I18nProvider, useI18n } from './lib/i18n';
// Gravity UI icons aliased onto the names this file already uses.
import { Xmark as X, ArrowLeft, ArrowRightFromSquare as DoorOpen } from '@gravity-ui/icons';
import { ShareTextsLogo } from './components/ShareTextsLogo';
import { PageHeader } from './components/PageHeader';
import { BrandLockup } from './components/BrandLockup';
import { TactileButton } from './components/TactileButton';
import { markAppUsed } from './lib/rating';
import { InstallNudge } from './components/InstallNudge';
import { Bar } from './components/SkeletonScreen';
import { OfflineBanner } from './components/AnnouncementBar';

// SingleScreenApp (the landing IS the app) loads eagerly — one less network
// round-trip before the hero is interactive. Docs/Legal stay lazy: they are
// separate routes, streamed in only when visited.
import { SingleScreenApp } from './views/SingleScreenApp';
const Docs = lazy(() => import('./views/Docs').then(m => ({ default: m.Docs })));
const Legal = lazy(() => import('./views/Legal').then(m => ({ default: m.Legal })));
const SpaceView = lazy(() => import('./views/SpaceView').then(m => ({ default: m.SpaceView })));

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
      className="fixed top-4 left-1/2 -translate-x-1/2 z-[90] overflow-hidden max-w-[min(92vw,460px)] flex items-start gap-3 pl-3.5 pr-2 py-3 rounded-[16px] bg-white/95 dark:bg-apple-tile-2/95 backdrop-blur border border-black/[0.08] dark:border-white/[0.1] shadow-[0_12px_40px_-12px_rgba(0,0,0,0.25)] animate-[toast-in_0.28s_cubic-bezier(0.22,1,0.36,1)]"
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
      {/* Lifetime bar — the toast tells you how long it plans to stay. */}
      <span aria-hidden className="st-toast-timer absolute bottom-0 left-0 h-[2px] w-full bg-ember/70" />
    </div>
  );
}

/**
 * Boot skeleton for lazy ROUTES (Docs/Legal). Mirrors each page's real
 * geometry — a header bar and a centered reading column — so the swap
 * from skeleton to content moves nothing. (The main app itself loads
 * eagerly and never shows this.)
 */
function RouteSkeleton({ wide }: { wide?: boolean }) {
  return (
    <div className="min-h-screen bg-apple-canvas dark:bg-night-900 font-sans">
      <div className="max-w-6xl mx-auto px-6 h-14 flex items-center gap-2" aria-hidden>
        <Bar className="h-6 w-6 !rounded-[8px]" />
        <Bar className="h-3.5 w-24" />
      </div>
      <div
        role="status"
        aria-live="polite"
        aria-label="Loading"
        className={cnRoute(wide)}
      >
        <Bar className="h-8 w-[55%]" />
        <Bar className="mt-4 h-3 w-[35%]" />
        <div className="mt-9 space-y-3">
          {[92, 100, 96, 88, 100, 74].map((w, i) => (
            <Bar key={i} className="h-3" style={{ width: `${w}%` }} />
          ))}
        </div>
        <div className="mt-8 space-y-3">
          {[100, 94, 82].map((w, i) => (
            <Bar key={i} className="h-3" style={{ width: `${w}%` }} />
          ))}
        </div>
      </div>
    </div>
  );
}
function cnRoute(wide?: boolean) {
  return wide
    ? 'max-w-6xl mx-auto px-6 py-10 flex gap-8'
    : 'max-w-2xl mx-auto px-6 py-10 sm:py-14';
}

/**
 * CapabilityGate — an honest screen for browsers that cannot run ShareTexts.
 * The app's core is RTCPeerConnection; without it (Tor Safest, hard-blocked
 * WebRTC, ancient engines) nothing can work, and a dead UI that looks alive
 * is worse than a clear explanation. Everything short of this degrades
 * gracefully — this gate only fires when transfer is truly impossible.
 */
function CapabilityGate({ children }: { children: React.ReactNode }) {
  const { t } = useI18n();
  const [ok] = useState(() => {
    try {
      const RTC = (window as unknown as { RTCPeerConnection?: unknown; webkitRTCPeerConnection?: unknown }).RTCPeerConnection
        ?? (window as unknown as { webkitRTCPeerConnection?: unknown }).webkitRTCPeerConnection;
      if (typeof RTC === 'undefined') return false;
      // Feature-detect the language surface the bundle assumes. IE11 and
      // other pre-ES2015 engines never reach a working app anyway.
      if (typeof window.Promise === 'undefined' || typeof window.Map === 'undefined' || typeof window.Symbol === 'undefined') return false;
      return true;
    } catch { return false; }
  });
  if (ok) return <>{children}</>;
  return (
    <div className="min-h-dvh flex flex-col items-center justify-center text-center px-6 bg-apple-canvas dark:bg-night-900">
      <ShareTextsLogo size={44} mono />
      <h1 className="mt-5 text-[19px] font-semibold text-apple-ink dark:text-white max-w-[420px]">{t('compat.title')}</h1>
      <p className="mt-3 text-[14px] text-apple-ink-muted dark:text-white/55 leading-relaxed max-w-[440px]">{t('compat.body')}</p>
    </div>
  );
}

function ErrorFallback({ onReset }: { onReset: () => void }) {
  // Rendered by the class boundary, which sits above the providers — static
  // English is intentional (recovery copy must never depend on a broken tree).
  // Design: calm recovery — the brand lockup, one honest headline, one
  // explanation, one primary path forward and two quiet alternatives.
  return (
    <div className="min-h-screen flex flex-col bg-apple-canvas dark:bg-night-900 dot-bg">
      {/* Static English, same header geometry as the rest of the product.
          The theme switch is deliberately absent: the error can fire before
          the providers mount, and a control that cannot work is worse than
          no control. */}
      <header className="shrink-0 bg-apple-canvas/85 dark:bg-night-900/85 backdrop-blur-xl border-b border-apple-divider dark:border-white/[0.06]">
        <div className="max-w-6xl mx-auto px-6 h-14 flex items-center">
          <div className="flex items-center gap-2 shrink-0">
            <a
              href="/"
              className="flex items-center justify-center min-w-[40px] min-h-[40px] -ml-2 rounded-full text-apple-ink-muted dark:text-white/60 hover:text-apple-ink dark:hover:text-white hover:bg-black/[0.04] dark:hover:bg-white/[0.06] transition-colors"
              aria-label="ShareTexts, back to home"
            >
              <ArrowLeft className="w-4 h-4" />
            </a>
            <BrandLockup compact />
          </div>
          <div className="flex items-center gap-4 sm:gap-5 ml-auto">
            <a href="/docs" className="text-[13px] font-medium text-apple-ink-muted dark:text-white/60 hover:text-apple-ink dark:hover:text-white transition-colors">Docs</a>
            <a href="/about" className="text-[13px] font-medium text-apple-ink-muted dark:text-white/60 hover:text-apple-ink dark:hover:text-white transition-colors">About</a>
          </div>
        </div>
      </header>
      <main className="flex-1 flex flex-col items-center justify-center px-6 text-center">
        {/* The state is the icon: the mark mid-"connecting" inside a calm
            tile — a system that hiccuped, not a product that broke. */}
        <div className="w-[76px] h-[76px] rounded-[24px] bg-white dark:bg-surface-dark border border-apple-divider/70 dark:border-white/[0.08] shadow-[0_12px_40px_-12px_rgba(0,0,0,0.18)] flex items-center justify-center mb-7">
          <ShareTextsLogo size={36} motion="connecting" className="opacity-90" />
        </div>
        <h2 className="st-display text-[30px] sm:text-[34px] text-apple-ink dark:text-white mb-2.5">Something went wrong</h2>
        <p className="text-[15px] text-apple-ink-muted dark:text-white/60 max-w-sm mb-8 leading-relaxed">
          ShareTexts couldn't load properly. Your data is safe — nothing was lost.
        </p>
        <TactileButton onClick={onReset} variant="primary" size="lg">Return to ShareTexts</TactileButton>
        <div className="mt-5 flex items-center gap-5 text-[13px] font-medium text-apple-ink-muted dark:text-white/45">
          <a href="/" className="hover:text-apple-ink dark:hover:text-white transition-colors">Go home</a>
          <span aria-hidden className="w-1 h-1 rounded-full bg-apple-divider" />
          <a href="/about" className="hover:text-apple-ink dark:hover:text-white transition-colors">About</a>
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
      // A room that ran and ended is the app being used, which is the only
      // honest moment to offer a rating. Recorded here (not in the rating
      // card) so the offer follows the usage, never the other way round.
      markAppUsed();
      leaveView();
    }
  }, [session.closedReason, leaveView]);

  if (typeof window !== 'undefined' && window.location.pathname === '/docs') {
    return <Suspense fallback={<RouteSkeleton wide />}><Docs /></Suspense>;
  }

  // Temporary Space entry points (F21): the code IS the invitation, so
  // /space/create and /space/join must land somewhere real — the app with
  // the matching sheet open (join pre-filled from ?code=, as QR scans are).
  if (typeof window !== 'undefined') {
    const sm = window.location.pathname.match(/^\/space\/(create|join)\/?$/i);
    if (sm) {
      const kind = sm[1].toLowerCase() as 'create' | 'join';
      const code = new URLSearchParams(window.location.search).get('code') || undefined;
      return <SingleScreenApp initialSpaceSheet={kind} initialSpaceCode={code} />;
    }
  }

  // Temporary Space (F14): /space/<uuid>#k=<token> — the access token rides
  // in the URL FRAGMENT so it never reaches server logs or Referer headers.
  if (typeof window !== 'undefined') {
    const m = window.location.pathname.match(/^\/space\/([0-9a-f-]{36})$/i);
    if (m) {
      const frag = window.location.hash.replace(/^#/, '');
      const km = frag.match(/^k=([A-Za-z0-9_-]+)$/);
      return (
        <Suspense fallback={<RouteSkeleton />}>
          <SpaceView spaceId={m[1].toLowerCase()} token={km ? km[1] : ''} />
        </Suspense>
      );
    }
  }

  if (typeof window !== 'undefined' && window.location.pathname === '/privacy') {
    return <Suspense fallback={<RouteSkeleton />}><Legal page="privacy" /></Suspense>;
  }

  if (typeof window !== 'undefined' && window.location.pathname === '/terms') {
    return <Suspense fallback={<RouteSkeleton />}><Legal page="terms" /></Suspense>;
  }

  // /about is NOT an app route: the server (dev parity with production and
  // vercel.json) serves the static SEO guide at its canonical URL, so the
  // app never mounts there. An in-app About component would be a second,
  // unreachable copy of that page.

  if (typeof window !== 'undefined' && window.location.pathname !== '/' && !window.location.pathname.startsWith('/s/')) {
    // The 404 is a DESIGNED screen, not a dead end: brand, honest state,
    // and both ways forward (home primary, docs secondary).
    return (
      <div className="min-h-screen flex flex-col bg-apple-canvas dark:bg-night-900 dot-bg">
        {/* The same header the rest of the non-room screens use, so a dead
            link still feels like the product. */}
        <PageHeader
          links={[
            { href: '/docs', label: t('nav.docs') },
            { href: '/about', label: t('nav.about') },
          ]}
        />
        <main className="flex-1 flex flex-col items-center justify-center px-6 text-center">
          {/* The missing-room tile: the mark in a mono tile with the page's
              number — the state IS the visual, no illustration needed. */}
          {/* The tile wraps a rounded clip so the horizon gradient can't
              square off its corners; the badge sits OUTSIDE that clip in a
              sibling wrapper, otherwise overflow-hidden ate its right half. */}
          <div className="relative mb-7">
            <div className="relative w-[76px] h-[76px] rounded-[24px] bg-white dark:bg-surface-dark overflow-hidden border border-apple-divider/70 dark:border-white/[0.08] shadow-[0_12px_40px_-12px_rgba(0,0,0,0.18)] flex items-center justify-center">
              {/* Sunrise horizon inside the tile: light rising from the bottom
                  edge — the same depth language as the landing and About. */}
              <span aria-hidden className="st-horizon absolute inset-x-0 bottom-0 h-[56%] opacity-90" />
              <ShareTextsLogo size={36} className="relative" />
            </div>
            <span className="absolute -top-1.5 -right-2.5 px-2 py-0.5 rounded-full bg-ember text-white text-[11px] font-bold shadow-sm">404</span>
          </div>
          <h2 className="st-display text-[30px] sm:text-[34px] text-apple-ink dark:text-white mb-2.5">{t('app.404.title')}</h2>
          <p className="text-[15px] text-apple-ink-muted dark:text-white/60 max-w-sm mb-8 leading-relaxed">{t('app.404.body')}</p>
          <div className="flex items-center gap-3 flex-wrap justify-center">
            <TactileButton onClick={() => { window.location.href = '/'; }} variant="primary" size="lg">{t('app.404.cta')}</TactileButton>
            <TactileButton href="/docs" variant="secondary" size="lg">{t('nav.docs')}</TactileButton>
          </div>
        </main>
        <footer className="shrink-0 pb-6 text-center text-[12px] font-medium text-apple-ink-muted/60 dark:text-white/30">
          sharetexts.online
        </footer>
      </div>
    );
  }

  return (
    <>
      <SingleScreenApp />
      <InstallNudge />
      {disconnectToast && <DisconnectToast reason={disconnectToast} onDone={() => setDisconnectToast(null)} />}
    </>
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
    <CapabilityGate>
      <ErrorBoundary>
        <I18nProvider>
          <SessionProvider>
            <SkipLink />
            <OfflineBanner />
            <AppContent />
          </SessionProvider>
        </I18nProvider>
      </ErrorBoundary>
    </CapabilityGate>
  );
}
