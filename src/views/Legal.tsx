import React, { useEffect } from 'react';
import { ShareTextLogo } from '../components/ShareTextLogo';
import { ThemeToggle } from '../components/ThemeToggle';
import { ArrowLeft, ShieldCheck, FileText, EyeOff, Server, Database, Cookie } from 'lucide-react';

/**
 * Legal — Privacy Policy and Terms of Use, one quiet page each.
 *
 * ShareText's entire product promise is privacy, so the policy is written in
 * plain language and structured around what we DON'T collect. English only:
 * other locales fall back automatically, and legal copy is safest untranslated.
 *
 * There is deliberately NO cookie consent banner anywhere in the app: the only
 * things ever stored are strictly-necessary localStorage entries (session
 * credentials, theme, language, drafts). The absence of tracking is stated as
 * a fact, not hidden behind a banner.
 */

type LegalPage = 'privacy' | 'terms';

function Section({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <section className="pt-8 first:pt-0">
      <div className="flex items-center gap-2 mb-3">
        <span className="w-7 h-7 rounded-[9px] bg-azure-600/10 dark:bg-azure-600/20 flex items-center justify-center shrink-0">
          {icon}
        </span>
        <h2 className="text-[17px] font-semibold text-apple-ink dark:text-white tracking-[-0.02em]">{title}</h2>
      </div>
      <div className="text-[14.5px] leading-relaxed text-apple-ink-muted dark:text-white/60 space-y-3 [&_strong]:text-apple-ink dark:[&_strong]:text-white [&_a]:text-apple-blue dark:[&_a]:text-azure-400 [&_a:hover]:underline">
        {children}
      </div>
    </section>
  );
}

function PrivacyContent() {
  return (
    <div className="space-y-8">
      <Section icon={<ShieldCheck className="w-4 h-4 text-azure-600 dark:text-azure-400" />} title="The short version">
        <p>
          ShareText moves text, photos, and files directly between <strong>your</strong> devices.
          Your content is end-to-end encrypted, travels peer-to-peer, and is never stored on our
          servers. When the room closes, everything is gone.
        </p>
      </Section>

      <Section icon={<EyeOff className="w-4 h-4 text-azure-600 dark:text-azure-400" />} title="What we never collect">
        <p>We do not collect, and have no way to see:</p>
        <ul className="list-disc pl-5 space-y-1.5">
          <li>The text, photos, videos, or files you send</li>
          <li>Your name, email, phone number, or any account</li>
          <li>Contacts, location, or advertising identifiers</li>
        </ul>
        <p>
          Transfers are encrypted on your device with a key derived from the room's secret. That
          key never leaves your devices, so neither we nor anyone else can read what passes through.
        </p>
      </Section>

      <Section icon={<Server className="w-4 h-4 text-azure-600 dark:text-azure-400" />} title="What the connection server sees">
        <p>
          Pairing requires a small signaling service. It temporarily sees connection metadata:
          encrypted room identifiers, rotating 6-digit codes, and WebRTC handshake data. It cannot
          decrypt anything. Rooms expire automatically and their state is deleted.
        </p>
      </Section>

      <Section icon={<Database className="w-4 h-4 text-azure-600 dark:text-azure-400" />} title="What stays on your device">
        <p>To make rooms reconnectable, ShareText keeps a few entries in your browser's local storage:</p>
        <ul className="list-disc pl-5 space-y-1.5">
          <li><strong>Room credentials</strong> (room id + secret) so a refresh doesn't break the pairing</li>
          <li><strong>Recent messages</strong> so history survives an accidental reload</li>
          <li><strong>Preferences</strong>: theme, language, device name</li>
          <li><strong>Unsent drafts</strong> so a typed message survives a refresh</li>
        </ul>
        <p>
          All of it is removed when you close the room, and clearing your browser data removes it
          instantly. Nothing is synced anywhere.
        </p>
      </Section>

      <Section icon={<Cookie className="w-4 h-4 text-azure-600 dark:text-azure-400" />} title="Cookies and trackers">
        <p>
          <strong>Cookies: none. Trackers: none. Analytics: none.</strong> There is no consent
          banner because there is nothing to consent to. ShareText sets no cookies, loads no
          analytics scripts, and calls no third-party trackers. The list of network requests the
          app makes is short: the signaling service, and peer-to-peer WebRTC traffic.
        </p>
      </Section>

      <Section icon={<FileText className="w-4 h-4 text-azure-600 dark:text-azure-400" />} title="Changes to this policy">
        <p>
          If the policy ever changes, the updated version will be published on this page. The
          promise doesn't change: no accounts, no storage of your content, no tracking.
        </p>
      </Section>
    </div>
  );
}

function TermsContent() {
  return (
    <div className="space-y-8">
      <Section icon={<ShieldCheck className="w-4 h-4 text-azure-600 dark:text-azure-400" />} title="Using ShareText">
        <p>
          ShareText is a free browser utility for moving content between devices you control.
          You don't need an account, and you don't need to give us anything to use it.
        </p>
      </Section>

      <Section icon={<FileText className="w-4 h-4 text-azure-600 dark:text-azure-400" />} title="Your content is yours">
        <p>
          Everything you send belongs to you. ShareText claims no rights over your text, photos,
          videos, or files, and because they are end-to-end encrypted we could not read them even
          if we wanted to. You are responsible for what you send and to whom.
        </p>
      </Section>

      <Section icon={<Server className="w-4 h-4 text-azure-600 dark:text-azure-400" />} title="Acceptable use">
        <p>You agree not to use ShareText to:</p>
        <ul className="list-disc pl-5 space-y-1.5">
          <li>Send content that is illegal where you live</li>
          <li>Harass, threaten, or spam other people</li>
          <li>Attempt to break the pairing mechanism, rate limits, or the service itself</li>
        </ul>
      </Section>

      <Section icon={<Database className="w-4 h-4 text-azure-600 dark:text-azure-400" />} title="Rooms are temporary">
        <p>
          Rooms exist only for the length of a transfer session and expire automatically. Nothing
          incomplete is saved, and a closed room cannot be reopened. Treat ShareText like a
          hallway between two rooms of yours: convenient for passing things through, not a place
          to store anything.
        </p>
      </Section>

      <Section icon={<ShieldCheck className="w-4 h-4 text-azure-600 dark:text-azure-400" />} title="No warranty">
        <p>
          ShareText is provided <strong>as is</strong>, without warranties of any kind. We work
          hard to keep transfers reliable and byte-perfect, but networks fail and browsers differ.
          For anything irreplaceable, keep a backup. To the maximum extent permitted by law,
          ShareText's operators are not liable for lost, incomplete, or unexpected transfers.
        </p>
      </Section>

      <Section icon={<FileText className="w-4 h-4 text-azure-600 dark:text-azure-400" />} title="Contact">
        <p>
          Questions about these terms? Reach us on X <a href="https://x.com/0xalyt" target="_blank" rel="noopener noreferrer">@0xalyt</a>.
        </p>
      </Section>
    </div>
  );
}

export function Legal({ page }: { page: LegalPage }) {
  const isPrivacy = page === 'privacy';
  const title = isPrivacy ? 'Privacy Policy' : 'Terms of Use';

  useEffect(() => {
    const previous = document.title;
    document.title = `ShareText ${title}`;
    return () => { document.title = previous; };
  }, [title]);

  return (
    <div className="min-h-screen bg-apple-canvas dark:bg-night-900 font-sans">
      <header className="sticky top-0 z-40 bg-apple-canvas/85 dark:bg-night-900/85 backdrop-blur-md border-b border-apple-divider dark:border-white/[0.06]">
        <div className="max-w-6xl mx-auto px-6 h-14 flex items-center">
          <a href="/" className="flex items-center gap-2 shrink-0" aria-label="ShareText, back to home">
            <ArrowLeft className="w-4 h-4 text-apple-ink-muted dark:text-white/60" />
            <ShareTextLogo size={21} />
            <span className="font-semibold tracking-tight text-[15px] text-apple-ink dark:text-white">ShareText</span>
          </a>
          <div className="flex items-center gap-4 ml-auto">
            <span className="text-[13px] font-medium text-apple-ink-muted dark:text-white/60">{title}</span>
            <ThemeToggle />
          </div>
        </div>
      </header>

      <div className="max-w-2xl mx-auto px-6 py-10 sm:py-14">
        <h1 className="text-[30px] sm:text-[36px] font-semibold text-apple-ink dark:text-white tracking-[-0.035em] mb-2" style={{ fontFamily: 'var(--font-display)' }}>
          {title}
        </h1>
        <p className="text-[14px] text-apple-ink-muted/80 dark:text-white/40 mb-9">
          Last updated: September 2026
        </p>
        {isPrivacy ? <PrivacyContent /> : <TermsContent />}

        <div className="mt-12 pt-6 border-t border-apple-divider/60 dark:border-white/[0.08] flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
          <p className="text-[13px] font-medium text-apple-ink-muted dark:text-white/50">
            {isPrivacy ? 'Read also our ' : 'Read also our '}
            <a href={isPrivacy ? '/terms' : '/privacy'} className="text-apple-blue dark:text-azure-400 hover:underline">
              {isPrivacy ? 'Terms of Use' : 'Privacy Policy'}
            </a>
            {' '}and the <a href="/docs" className="text-apple-blue dark:text-azure-400 hover:underline">documentation</a>.
          </p>
          <a href="/" className="text-[13px] font-semibold text-apple-blue dark:text-azure-400 hover:underline">
            Back to ShareText
          </a>
        </div>
      </div>
    </div>
  );
}
