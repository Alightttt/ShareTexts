/**
 * About — the page that answers "what is this and why should I trust it"
 * in one short scroll. Same header band as Docs/Legal, same canvas, and
 * sections built from the app's own visual grammar (icon chips, ember
 * accents, display-face headlines) instead of text walls.
 *
 * English hardcoded: the Docs and Legal pages set that precedent (full
 * localization of long-form content is a later project).
 */
import React, { useEffect } from 'react';
import {
  ArrowLeft, Smartphone, ArrowRightLeft, Inbox, ShieldCheck, Clock3,
  Wifi, ServerOff, EyeOff, Check, BookOpen, FileText, ScrollText, ChevronRight,
  Quote, BadgeCheck, AtSign,
} from 'lucide-react';
import { BrandLockup } from '../components/BrandLockup';
import { ThemeToggle } from '../components/ThemeToggle';
import { TactileButton } from '../components/TactileButton';

function Header() {
  return (
    <header className="sticky top-0 z-40 bg-apple-canvas/85 dark:bg-night-900/85 backdrop-blur-md border-b border-apple-divider dark:border-white/[0.06]">
      <div className="max-w-6xl mx-auto px-6 h-14 flex items-center">
        {/* The back arrow and the lockup are two links, never one inside the
            other: BrandLockup is itself an anchor (invalid HTML otherwise,
            and React says so loudly). */}
        <div className="flex items-center gap-2 shrink-0">
          <a href="/" className="flex items-center justify-center min-w-[40px] min-h-[40px] -ml-2 rounded-full text-apple-ink-muted dark:text-white/60 hover:text-apple-ink dark:hover:text-white hover:bg-black/[0.04] dark:hover:bg-white/[0.06] transition-colors" aria-label="ShareTexts, back to home">
            <ArrowLeft className="w-4 h-4" />
          </a>
          <BrandLockup compact />
        </div>
        <div className="flex items-center gap-3 sm:gap-4 ml-auto">
          <a href="/docs" className="text-[13px] font-medium text-apple-ink-muted dark:text-white/60 hover:text-apple-ink dark:hover:text-white transition-colors">Docs</a>
          <span className="text-[13px] font-semibold text-apple-ink dark:text-white/80">About</span>
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}

/** A claim card: icon chip on top, bold claim, one honest sentence. */
function Claim({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) {
  return (
    <div className="flex flex-col gap-3 p-5 rounded-[18px] bg-white/70 dark:bg-white/[0.04] border border-apple-divider/60 dark:border-white/[0.07]">
      <span className="w-9 h-9 rounded-[11px] bg-[#f06413]/10 dark:bg-[#fb9243]/12 border border-[#f06413]/15 dark:border-[#fb9243]/15 flex items-center justify-center text-[#f06413] dark:text-[#fb9243]" aria-hidden>
        {icon}
      </span>
      <span className="text-[15px] font-semibold text-apple-ink dark:text-white leading-snug">{title}</span>
      <span className="text-[13.5px] leading-relaxed text-apple-ink-muted dark:text-white/55">{body}</span>
    </div>
  );
}

/** Numbered how-it-works row — the same grammar as the room's step list. */
function Step({ n, icon, title, body }: { n: number; icon: React.ReactNode; title: string; body: string }) {
  return (
    <div className="flex items-start gap-4">
      <span className="relative shrink-0 w-10 h-10 rounded-full bg-ember/[0.1] dark:bg-ember/[0.16] text-ember dark:text-[#fb9243] flex items-center justify-center" aria-hidden>
        {icon}
        <span className="absolute -top-1 -right-1 w-4.5 h-4.5 min-w-[18px] min-h-[18px] rounded-full bg-ember text-white text-[10.5px] font-bold flex items-center justify-center px-1">{n}</span>
      </span>
      <span className="min-w-0">
        <span className="block text-[14.5px] font-semibold text-apple-ink dark:text-white leading-snug">{title}</span>
        <span className="block mt-0.5 text-[13.5px] leading-relaxed text-apple-ink-muted dark:text-white/55">{body}</span>
      </span>
    </div>
  );
}

export function About() {
  useEffect(() => {
    const previous = document.title;
    document.title = 'About — ShareTexts';
    return () => { document.title = previous; };
  }, []);

  return (
    <div className="min-h-screen bg-apple-canvas dark:bg-night-900 font-sans dot-bg">
      <Header />
      <main className="max-w-3xl mx-auto px-6 pb-16">
        {/* Hero — one claim, one breath, with the warmest light in the app
            pooled at the bottom of the block (sunset bloom: honey on the
            left, ember on the right). Used once, here, on purpose. */}
        <section className="relative pt-12 sm:pt-16">
          <span aria-hidden className="pointer-events-none absolute -inset-x-6 -bottom-10 top-0 st-bloom opacity-70" />
          <h1 className="relative st-display text-[34px] sm:text-[44px] text-apple-ink dark:text-white max-w-[18ch]">
            Move anything between your devices. Keep nothing.
          </h1>
          <p className="relative mt-4 text-[16px] sm:text-[17.5px] leading-relaxed text-apple-ink-muted dark:text-white/60 max-w-[56ch]">
            ShareTexts is a browser-based AirDrop for the rest of the world: open it on two
            devices, pair once, and send text, links, photos, and files straight between them —
            phone to PC, iPhone to Windows, anything to anything. No app, no account, no cable.
          </p>
          <div className="relative mt-7">
            <TactileButton href="/" variant="primary" size="lg" icon={<ArrowRightLeft className="w-4 h-4" />}>
              Open ShareTexts
            </TactileButton>
          </div>
        </section>

        {/* What it is — three claims, icon-led. */}
        <section className="mt-14">
          <h2 className="st-section text-apple-ink-muted dark:text-white/45 uppercase tracking-[0.08em] text-[11.5px]">What it is</h2>
          <div className="mt-4 grid sm:grid-cols-3 gap-3">
            <Claim
              icon={<Wifi className="w-4.5 h-4.5" />}
              title="Direct, not uploaded"
              body="Transfers travel over an encrypted peer-to-peer channel between your devices. There is no copy sitting on a server in between."
            />
            <Claim
              icon={<EyeOff className="w-4.5 h-4.5" />}
              title="Private by shape"
              body="No sign-up, no profile, no history to sell. The room is guarded by a 128-bit secret only your devices hold."
            />
            <Claim
              icon={<Clock3 className="w-4.5 h-4.5" />}
              title="Temporary on purpose"
              body="Rooms close themselves when you're done. Temporary Spaces expire within 7 days. Disappearing is the feature."
            />
          </div>
        </section>

        {/* How it works — three steps. */}
        <section className="mt-14">
          <h2 className="st-section text-apple-ink-muted dark:text-white/45 uppercase tracking-[0.08em] text-[11.5px]">How it works</h2>
          <div className="mt-5 flex flex-col gap-6">
            <Step n={1} icon={<Smartphone className="w-5 h-5" />} title="Open it on both devices" body="Any browser. Nothing to install, nothing to create." />
            <Step n={2} icon={<ArrowRightLeft className="w-5 h-5" />} title="Connect them once" body="Tap the other device in Nearby, scan a QR, share a link, or type the six-digit code." />
            <Step n={3} icon={<Inbox className="w-5 h-5" />} title="Send anything" body="Type, paste, or drop — text, links, photos, videos, any file. It arrives on the other device, original quality, instantly." />
          </div>
        </section>

        {/* The honest ledger — what we DON'T have. */}
        <section className="mt-14">
          <h2 className="st-section text-apple-ink-muted dark:text-white/45 uppercase tracking-[0.08em] text-[11.5px]">What you won't find here</h2>
          <div className="mt-4 rounded-[18px] border border-apple-divider/60 dark:border-white/[0.07] bg-white/60 dark:bg-white/[0.03] divide-y divide-apple-divider/50 dark:divide-white/[0.06] overflow-hidden">
            {[
              { icon: <ServerOff className="w-4 h-4" />, text: 'No accounts, no email address, no password to forget.' },
              { icon: <ShieldCheck className="w-4 h-4" />, text: 'No server-side copies of anything you send — transfers are end-to-end encrypted (DTLS + AES-GCM).' },
              { icon: <EyeOff className="w-4 h-4" />, text: 'No tracking pixels or ad profiles — event names only, no payloads, no identifiers.' },
              { icon: <Check className="w-4 h-4" />, text: 'No upsell. Every feature is free, including Stay Connected rooms and Temporary Spaces.' },
            ].map((row, i) => (
              <div key={i} className="flex items-center gap-3 px-4 py-3">
                <span className="shrink-0 w-7 h-7 rounded-full bg-status-success/10 text-status-success flex items-center justify-center" aria-hidden>{row.icon}</span>
                <span className="text-[13.5px] leading-snug text-apple-ink/85 dark:text-white/75">{row.text}</span>
              </div>
            ))}
          </div>
        </section>

        {/* The principle, stated once — a quiet quote cards the eye can rest
            on between two dense sections. Attributed to the project itself:
            an invented testimonial would be the one dishonest thing on a
            page whose whole argument is honesty. */}
        <section className="mt-14">
          <figure className="relative overflow-hidden rounded-[20px] border border-apple-divider/60 dark:border-white/[0.07] bg-white/70 dark:bg-white/[0.04] p-6 sm:p-7">
            {/* Soft spotlight behind the quote — light pooled on the page,
                not a colored band. */}
            <span aria-hidden className="st-softspot absolute -top-24 -right-16 w-[280px] h-[280px] rounded-full pointer-events-none" />
            <Quote className="relative w-5 h-5 text-ember/70 dark:text-[#fb9243]/70" aria-hidden />
            <blockquote className="relative st-display mt-4 text-[21px] sm:text-[26px] leading-[1.25] text-apple-ink dark:text-white max-w-[30ch]">
              Every byte you send should arrive exactly as it left — and nothing should stay behind.
            </blockquote>
            <figcaption className="relative mt-5 flex items-center gap-3">
              <span className="w-9 h-9 rounded-full bg-ember/[0.1] dark:bg-ember/[0.16] text-ember dark:text-[#fb9243] flex items-center justify-center" aria-hidden>
                <BadgeCheck className="w-4.5 h-4.5" />
              </span>
              <span className="flex flex-col">
                <span className="text-[13.5px] font-semibold text-apple-ink dark:text-white">The principle behind ShareTexts</span>
                <span className="text-[12.5px] text-apple-ink-muted dark:text-white/50">Why rooms close themselves, and why nothing is stored.</span>
              </span>
            </figcaption>
          </figure>
        </section>

        {/* Read next — a resource panel rather than four buried footer links:
            each row says what the destination is for. */}
        <section className="mt-14">
          <h2 className="st-section text-apple-ink-muted dark:text-white/45 uppercase tracking-[0.08em] text-[11.5px]">Read next</h2>
          <div className="mt-4 rounded-[18px] border border-apple-divider/60 dark:border-white/[0.07] bg-white/60 dark:bg-white/[0.03] overflow-hidden divide-y divide-apple-divider/50 dark:divide-white/[0.06]">
            {[
              { href: '/docs', icon: <BookOpen className="w-4 h-4" />, title: 'How it works', hint: 'Pairing, transfers, Spaces, and the protocol in plain words.' },
              { href: '/privacy', icon: <ShieldCheck className="w-4 h-4" />, title: 'Privacy', hint: 'What we never collect, and the little we do.' },
              { href: '/terms', icon: <ScrollText className="w-4 h-4" />, title: 'Terms', hint: 'The short version: your files are yours.' },
              { href: '/about', icon: <FileText className="w-4 h-4" />, title: 'This page', hint: 'What ShareTexts is, in one screen.' },
            ].map(row => (
              <a key={row.href} href={row.href} className="flex items-center gap-3.5 px-4 py-3.5 min-h-[44px] hover:bg-black/[0.02] dark:hover:bg-white/[0.03] transition-colors">
                <span className="shrink-0 w-8 h-8 rounded-[10px] bg-apple-parchment dark:bg-white/[0.07] text-apple-ink-muted dark:text-white/70 flex items-center justify-center" aria-hidden>{row.icon}</span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[13.5px] font-semibold text-apple-ink dark:text-white">{row.title}</span>
                  <span className="block text-[12.5px] text-apple-ink-muted dark:text-white/50 leading-snug">{row.hint}</span>
                </span>
                <ChevronRight className="w-4 h-4 shrink-0 text-apple-ink-muted/50 dark:text-white/30" aria-hidden />
              </a>
            ))}
          </div>
        </section>

        {/* Who builds this — one real profile, one real handle. */}
        <section className="mt-10">
          <a
            href="https://x.com/0xalyt"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-4 p-4 rounded-[18px] border border-apple-divider/60 dark:border-white/[0.07] bg-white/60 dark:bg-white/[0.03] hover:border-apple-ink/20 dark:hover:border-white/20 transition-colors"
          >
            <span className="shrink-0 w-11 h-11 rounded-full bg-apple-ink/[0.06] dark:bg-white/[0.08] flex items-center justify-center" aria-hidden>
              <AtSign className="w-5 h-5 text-apple-ink-muted dark:text-white/70" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-1.5 text-[14px] font-semibold text-apple-ink dark:text-white">
                @0xalyt
                <BadgeCheck className="w-3.5 h-3.5 text-azure-500" aria-label="Verified handle" />
              </span>
              <span className="block text-[12.5px] text-apple-ink-muted dark:text-white/55 leading-snug">Bugs, ideas, and honest complaints land here.</span>
            </span>
            <span className="shrink-0 px-4 py-2 min-h-[36px] rounded-full bg-apple-ink text-white text-[12.5px] font-semibold flex items-center">Follow</span>
          </a>
        </section>

        {/* Close: back to the product. */}
        <section className="relative overflow-hidden mt-14 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-6 rounded-[20px] bg-gradient-to-br from-[#f06413]/[0.07] to-[#feab30]/[0.05] border border-[#f06413]/15 dark:border-[#fb9243]/15">
          <span aria-hidden className="st-diag absolute inset-0 opacity-[0.55] pointer-events-none" />
          <div className="relative">
            <p className="text-[16px] font-semibold text-apple-ink dark:text-white">Ready when you are.</p>
            <p className="text-[13.5px] text-apple-ink-muted dark:text-white/55 mt-1">Open it on two devices — that's the whole setup.</p>
          </div>
          <TactileButton className="relative" href="/" variant="primary" size="md" icon={<ArrowRightLeft className="w-4 h-4" />}>
            Start sharing
          </TactileButton>
        </section>
      </main>
      <footer className="border-t border-apple-divider/60 dark:border-white/[0.06] py-5">
        <div className="max-w-6xl mx-auto px-6 flex items-center justify-between gap-4 flex-wrap">
          <span className="flex items-center gap-2 text-apple-ink-muted/70 dark:text-white/35" aria-hidden>
            <BrandLockup compact />
          </span>
          <nav className="flex items-center gap-5 text-[13px] font-medium text-apple-ink-muted dark:text-white/50">
            <a href="/docs" className="hover:text-apple-ink dark:hover:text-white transition-colors">Docs</a>
            <a href="/privacy" className="hover:text-apple-ink dark:hover:text-white transition-colors">Privacy</a>
            <a href="/terms" className="hover:text-apple-ink dark:hover:text-white transition-colors">Terms</a>
          </nav>
        </div>
      </footer>
    </div>
  );
}
