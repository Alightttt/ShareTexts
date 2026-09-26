import { motion } from 'motion/react';
import type { ReactNode } from 'react';
import {
  Type as TypeIcon, Link2, Image as ImageIcon, Files,
  Smartphone, Monitor, Check,
  ShieldCheck, WifiOff, TimerReset, HardDrive,
} from 'lucide-react';
import { useI18n } from '../lib/i18n';
import { cn } from '../lib/utils';
import { ObjectCard, type LandingDemoKind } from './LandingDemo';

/**
 * LandingStory — the scroll narrative beneath the hero, rendered on the
 * right pane (desktop) and below the hero (mobile).
 *
 * Every section is built from the product's own primitives: the same
 * ObjectCards the demo and the app use, the same device tiles, the same
 * ember/status colors. No illustrations, no mascots, no stock imagery.
 *
 * Sections (each answers the visitor's next question):
 *   1. SEND ANYTHING  — what can I move?
 *   2. FLOW           — how does it work? (open → find → done)
 *   3. BOTH WAYS      — receiving is first-class too
 *   4. TRUST          — why is this private? (only verifiable claims)
 *
 * Motion: sections rise once as they enter the viewport (whileInView,
 * once: true — no re-triggering, no scroll jank). Reduced motion renders
 * everything static (global MotionConfig reducedMotion="user").
 */

const EASE = [0.22, 1, 0.36, 1] as const;

function Section({
  children,
  className,
  id,
}: {
  children: ReactNode;
  className?: string;
  id?: string;
}) {
  return (
    <motion.section
      id={id}
      initial={{ opacity: 0, y: 18 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-60px' }}
      transition={{ duration: 0.5, ease: EASE }}
      className={cn('scroll-mt-6', className)}
    >
      {children}
    </motion.section>
  );
}

function SectionTitle({ children }: { children: ReactNode }) {
  return (
    <h2 className="text-[21px] sm:text-[24px] font-bold tracking-[-0.02em] text-apple-ink dark:text-white" style={{ fontFamily: 'var(--font-display)' }}>
      {children}
    </h2>
  );
}

function SectionBody({ children }: { children: ReactNode }) {
  return <p className="mt-2.5 text-[14px] leading-relaxed text-apple-ink-muted dark:text-white/55">{children}</p>;
}

/* ---------------------------------------------------------------- */
/* 1 — SEND ANYTHING: the four real object shapes, teachable         */
/* ---------------------------------------------------------------- */

type LandKey = Parameters<ReturnType<typeof useI18n>['t']>[0];

const KIND_META: { kind: LandingDemoKind; icon: ReactNode; labelKey: LandKey; exKey: LandKey }[] = [
  { kind: 'text', icon: <TypeIcon className="w-4 h-4" />, labelKey: 'land.send.text', exKey: 'land.send.text.ex' },
  { kind: 'url', icon: <Link2 className="w-4 h-4" />, labelKey: 'land.send.url', exKey: 'land.send.url.ex' },
  { kind: 'image', icon: <ImageIcon className="w-4 h-4" />, labelKey: 'land.send.image', exKey: 'land.send.image.ex' },
  { kind: 'file', icon: <Files className="w-4 h-4" />, labelKey: 'land.send.file', exKey: 'land.send.file.ex' },
];

function SendAnything() {
  const { t } = useI18n();
  const sampleFor = (kind: LandingDemoKind): string =>
    kind === 'text' ? t('land.demo.sampleText')
    : kind === 'url' ? t('land.demo.sampleUrl')
    : kind === 'file' ? t('land.demo.sampleFile')
    : 'IMG_2047.jpg';

  return (
    <Section id="send" className="rounded-[24px] bg-white/60 dark:bg-white/[0.03] border border-apple-divider/50 dark:border-white/[0.06] p-5 sm:p-6">
      <SectionTitle>{t('land.send.title')}</SectionTitle>
      <SectionBody>{t('land.send.body')}</SectionBody>
      <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 gap-2.5">
        {KIND_META.map(({ kind, icon, labelKey, exKey }) => (
          <div
            key={kind}
            className="flex items-center gap-3 rounded-[14px] bg-apple-canvas dark:bg-[#232329] border border-apple-divider/50 dark:border-white/[0.06] p-3"
          >
            <span className="shrink-0 flex items-center justify-center w-9 h-9 rounded-[11px] bg-ember/[0.09] dark:bg-ember/[0.15] text-ember dark:text-[#fb9243]" aria-hidden>
              {icon}
            </span>
            <span className="min-w-0 flex-1 flex flex-col gap-1">
              <span className="text-[13px] font-semibold text-apple-ink dark:text-white/90">{t(labelKey)}</span>
              <span className="text-[11.5px] font-medium text-apple-ink-muted dark:text-white/45 truncate">{t(exKey)}</span>
            </span>
            {/* The real object shape, small — recognition over recall */}
            <span className="hidden md:block w-[118px] shrink-0" aria-hidden>
              <ObjectCard kind={kind} sample={sampleFor(kind)} />
            </span>
          </div>
        ))}
      </div>
    </Section>
  );
}

/* ---------------------------------------------------------------- */
/* 2 — FLOW: open → find → done, one continuous device relationship  */
/* ---------------------------------------------------------------- */

function Flow() {
  const { t } = useI18n();
  const steps = [
    { icon: <Monitor className="w-4 h-4" />, text: t('land.flow.1') },
    { icon: <Smartphone className="w-4 h-4" />, text: t('land.flow.2') },
    { icon: <Check className="w-4 h-4" />, text: t('land.flow.3') },
  ];
  return (
    <Section id="how" className="rounded-[24px] bg-white/60 dark:bg-white/[0.03] border border-apple-divider/50 dark:border-white/[0.06] p-5 sm:p-6">
      <SectionTitle>{t('land.flow.title')}</SectionTitle>
      <div className="mt-5 flex flex-col items-stretch gap-2">
        {steps.map((s, i) => (
          <div key={i} className="flex items-center gap-3">
            {/* The connecting line: one continuous relationship */}
            <div className="flex flex-col items-center self-stretch">
              <span className="shrink-0 flex items-center justify-center w-9 h-9 rounded-[11px] bg-ember/[0.09] dark:bg-ember/[0.15] text-ember dark:text-[#fb9243]" aria-hidden>
                {s.icon}
              </span>
              {i < steps.length - 1 && <span className="w-px flex-1 my-1 bg-apple-divider dark:bg-white/[0.09]" aria-hidden />}
            </div>
            <span className="pb-1 text-[14px] font-medium text-apple-ink dark:text-white/85 leading-snug">{s.text}</span>
          </div>
        ))}
      </div>
      <p className="mt-4 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-ember/[0.08] dark:bg-ember/[0.13] text-[12.5px] font-semibold text-ember dark:text-[#fb9243]">
        <Check className="w-3.5 h-3.5" aria-hidden />
        {t('land.flow.cta')}
      </p>
    </Section>
  );
}

/* ---------------------------------------------------------------- */
/* 3 — BOTH WAYS: the bidirectional fact, as an actual scene         */
/* ---------------------------------------------------------------- */

function BothWays() {
  const { t } = useI18n();
  const sampleText = t('land.demo.sampleText');
  return (
    <Section id="both" className="rounded-[24px] bg-white/60 dark:bg-white/[0.03] border border-apple-divider/50 dark:border-white/[0.06] p-5 sm:p-6">
      <SectionTitle>{t('land.both.title')}</SectionTitle>
      <SectionBody>{t('land.both.body')}</SectionBody>
      {/* The two devices facing each other, both holding real objects */}
      <div className="mt-5 flex items-center gap-3 sm:gap-4">
        <div className="flex-1 min-w-0 rounded-[16px] bg-apple-canvas dark:bg-[#232329] border border-apple-divider/50 dark:border-white/[0.06] p-2.5 flex flex-col items-center gap-2">
          <span className="flex items-center justify-center w-8 h-8 rounded-[10px] bg-ember/10 text-ember dark:text-[#fb9243]" aria-hidden>
            <Smartphone className="w-4 h-4" />
          </span>
          <span className="w-full max-w-[150px]" aria-hidden>
            <ObjectCard kind="image" sample="IMG_2047.jpg" arrived />
          </span>
        </div>
        <div className="shrink-0 flex flex-col items-center gap-1.5" aria-hidden>
          <span className="flex items-center justify-center w-8 h-8 rounded-full bg-status-success/12 text-status-success">
            <Check className="w-4 h-4" strokeWidth={2.5} />
          </span>
        </div>
        <div className="flex-1 min-w-0 rounded-[16px] bg-apple-canvas dark:bg-[#232329] border border-apple-divider/50 dark:border-white/[0.06] p-2.5 flex flex-col items-center gap-2">
          <span className="flex items-center justify-center w-8 h-8 rounded-[10px] bg-ember/10 text-ember dark:text-[#fb9243]" aria-hidden>
            <Monitor className="w-4 h-4" />
          </span>
          <span className="w-full max-w-[150px]" aria-hidden>
            <ObjectCard kind="text" sample={sampleText} arrived />
          </span>
        </div>
      </div>
    </Section>
  );
}

/* ---------------------------------------------------------------- */
/* 4 — TRUST: only claims the implementation actually backs          */
/* ---------------------------------------------------------------- */

function Trust() {
  const { t } = useI18n();
  const items = [
    { icon: <WifiOff className="w-4 h-4" />, title: t('land.trust.noaccount'), body: t('land.trust.noaccount.b') },
    { icon: <ShieldCheck className="w-4 h-4" />, title: t('land.trust.direct'), body: t('land.trust.direct.b') },
    { icon: <TimerReset className="w-4 h-4" />, title: t('land.trust.temporary'), body: t('land.trust.temporary.b') },
    { icon: <HardDrive className="w-4 h-4" />, title: t('land.trust.control'), body: t('land.trust.control.b') },
  ];
  return (
    <Section id="privacy" className="rounded-[24px] bg-white/60 dark:bg-white/[0.03] border border-apple-divider/50 dark:border-white/[0.06] p-5 sm:p-6">
      <SectionTitle>{t('land.trust.title')}</SectionTitle>
      <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 gap-2.5">
        {items.map(({ icon, title, body }) => (
          <div key={title} className="flex items-start gap-3 rounded-[14px] bg-apple-canvas dark:bg-[#232329] border border-apple-divider/50 dark:border-white/[0.06] p-3.5">
            <span className="shrink-0 flex items-center justify-center w-9 h-9 rounded-[11px] bg-status-success/[0.09] dark:bg-status-success/[0.13] text-status-success" aria-hidden>
              {icon}
            </span>
            <span className="min-w-0 flex flex-col gap-1">
              <span className="text-[13px] font-semibold text-apple-ink dark:text-white/90">{title}</span>
              <span className="text-[12px] leading-relaxed text-apple-ink-muted dark:text-white/50">{body}</span>
            </span>
          </div>
        ))}
      </div>
    </Section>
  );
}

/* ---------------------------------------------------------------- */
/* Assembled story + final CTA                                       */
/* ---------------------------------------------------------------- */

export function LandingStory({ onCta, className }: { onCta?: () => void; className?: string }) {
  const { t } = useI18n();
  return (
    <div className={cn('w-full flex flex-col gap-4', className)}>
      <SendAnything />
      <Flow />
      <BothWays />
      <Trust />
      {/* Final CTA — the natural conclusion of the story */}
      <Section className="rounded-[24px] bg-ember/[0.06] dark:bg-ember/[0.1] border border-ember/25 dark:border-ember/30 p-6 sm:p-7 text-center">
        <h2 className="text-[22px] sm:text-[26px] font-bold tracking-[-0.02em] text-apple-ink dark:text-white" style={{ fontFamily: 'var(--font-display)' }}>
          {t('land.cta.title')}
        </h2>
        <p className="mt-2 text-[14px] text-apple-ink-muted dark:text-white/55">{t('land.cta.body')}</p>
        <button
          type="button"
          onClick={onCta}
          className="mt-5 inline-flex items-center justify-center min-h-[50px] px-8 rounded-full bg-ember hover:bg-[#d9560e] text-white text-[15px] font-semibold shadow-[0_1px_3px_rgba(240,100,19,0.35)] transition-all active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ember/60 focus-visible:ring-offset-2"
        >
          {t('land.cta.send')}
        </button>
      </Section>
    </div>
  );
}
