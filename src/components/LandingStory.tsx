import { motion } from 'motion/react';
import type { ReactNode } from 'react';
import {
  Type as TypeIcon, Link2, Image as ImageIcon, Files,
  Smartphone, Monitor, Check, ArrowLeftRight,
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
 * F8 polish: each section gains a quiet eyebrow label (the question it
 * answers), tinted section headings that map to content — ember for the
 * objects you can send, green for trust — and inner tiles tinted the same
 * way, so the story reads as one designed system rather than gray cards.
 * The Flow's connecting line now carries the demo's exact color language:
 * dashed while "searching", ember when connected, green at done.
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

/** The quiet question each section answers — set above the title in
 *  small caps. Muted enough to skim past, present enough to orient. */
function Eyebrow({ children, tone = 'ink' }: { children: ReactNode; tone?: 'ink' | 'green' }) {
  return (
    <p className={cn(
      'text-[11px] font-bold uppercase tracking-[0.08em]',
      tone === 'green' ? 'text-status-success/80 dark:text-status-success/70' : 'text-apple-ink-muted/70 dark:text-white/35'
    )}>
      {children}
    </p>
  );
}

function SectionTitle({ children, tone = 'ink' }: { children: ReactNode; tone?: 'ink' | 'green' }) {
  return (
    <h2
      className={cn(
        'mt-1.5 text-[20px] sm:text-[22px] font-bold tracking-[-0.02em]',
        tone === 'green'
          ? 'text-[#2e7d43] dark:text-[#5fbf7a]'
          : 'text-apple-ink dark:text-white'
      )}
      style={{ fontFamily: 'var(--font-display)' }}
    >
      {children}
    </h2>
  );
}

function SectionBody({ children }: { children: ReactNode }) {
  return <p className="mt-2 text-[13.5px] leading-relaxed text-apple-ink-muted dark:text-white/55">{children}</p>;
}

/** Section shell — one surface recipe for the whole story. */
const SHELL = 'rounded-[24px] bg-white/60 dark:bg-white/[0.03] border border-apple-divider/50 dark:border-white/[0.06] p-5 sm:p-6';
/** Inner tile recipe — tinted per semantic family. */
const TILE_EMBER = 'rounded-[14px] bg-ember/[0.045] dark:bg-ember/[0.08] border border-ember/[0.14] dark:border-ember/[0.16]';
const TILE_GREEN = 'rounded-[14px] bg-status-success/[0.045] dark:bg-status-success/[0.07] border border-status-success/[0.14] dark:border-status-success/[0.15]';

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
    <Section id="send" className={SHELL}>
      <Eyebrow>What can I send?</Eyebrow>
      <SectionTitle>{t('land.send.title')}</SectionTitle>
      <SectionBody>{t('land.send.body')}</SectionBody>
      <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 gap-2.5">
        {KIND_META.map(({ kind, icon, labelKey, exKey }) => (
          <div
            key={kind}
            className={cn(TILE_EMBER, 'flex items-center gap-3 p-3 transition-transform duration-200 hover:-translate-y-px motion-reduce:transition-none motion-reduce:hover:translate-y-0')}
          >
            <span className="shrink-0 flex items-center justify-center w-9 h-9 rounded-[11px] bg-ember/[0.1] dark:bg-ember/[0.15] text-ember dark:text-[#fb9243]" aria-hidden>
              {icon}
            </span>
            <span className="min-w-0 flex-1 flex flex-col gap-1">
              <span className="text-[13px] font-semibold text-apple-ink dark:text-white/90">{t(labelKey)}</span>
              <span className="text-[11.5px] font-medium text-apple-ink-muted dark:text-white/45">{t(exKey)}</span>
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
    <Section id="how" className={SHELL}>
      <Eyebrow>How does it work?</Eyebrow>
      <SectionTitle>{t('land.flow.title')}</SectionTitle>
      <div className="mt-5 flex flex-col items-stretch gap-0">
        {steps.map((s, i) => (
          <div key={i} className="flex items-stretch gap-3">
            {/* The connecting line carries the demo's exact language:
                dashed trace → ember link → green done. */}
            <div className="flex flex-col items-center self-stretch">
              <span className={cn(
                'shrink-0 flex items-center justify-center w-9 h-9 rounded-[11px] border transition-colors',
                i === 0 && 'bg-black/[0.04] dark:bg-white/[0.06] border-apple-divider/60 dark:border-white/[0.09] text-apple-ink-muted dark:text-white/55',
                i === 1 && 'bg-ember/[0.1] dark:bg-ember/[0.15] border-ember/[0.25] text-ember dark:text-[#fb9243]',
                i === 2 && 'bg-status-success/10 dark:bg-status-success/[0.14] border-status-success/[0.25] text-status-success'
              )} aria-hidden>
                {s.icon}
              </span>
              {i < steps.length - 1 && (
                <span
                  className={cn('w-0 flex-1 my-1 border-l-2', i === 0 ? 'border-dashed border-apple-divider/70 dark:border-white/[0.12]' : 'border-solid border-ember/40 dark:border-ember/30')}
                  aria-hidden
                />
              )}
            </div>
            <span className="pb-5 pt-2 text-[14px] font-medium text-apple-ink dark:text-white/85 leading-snug">{s.text}</span>
          </div>
        ))}
      </div>
      <p className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-status-success/[0.08] dark:bg-status-success/[0.12] text-[12.5px] font-semibold text-[#2e7d43] dark:text-[#5fbf7a]">
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
    <Section id="both" className={SHELL}>
      <Eyebrow>Does receiving work?</Eyebrow>
      <SectionTitle>{t('land.both.title')}</SectionTitle>
      <SectionBody>{t('land.both.body')}</SectionBody>
      {/* The two devices facing each other, both holding real objects, one
          link between them — the same scene the demo teaches, at rest. */}
      <div className="mt-5 flex items-center gap-2.5 sm:gap-4">
        <div className={cn(TILE_GREEN, 'flex-1 min-w-0 p-2.5 flex flex-col items-center gap-2')}>
          <span className="flex items-center justify-center w-8 h-8 rounded-[10px] bg-status-success/12 text-status-success" aria-hidden>
            <Smartphone className="w-4 h-4" />
          </span>
          <span className="w-full max-w-[150px]" aria-hidden>
            <ObjectCard kind="image" sample="IMG_2047.jpg" arrived />
          </span>
        </div>
        <div className="shrink-0 flex flex-col items-center" aria-hidden>
          <span className="flex items-center justify-center w-8 h-8 rounded-full bg-apple-ink/[0.05] dark:bg-white/[0.08] text-apple-ink-muted dark:text-white/55">
            <ArrowLeftRight className="w-4 h-4" />
          </span>
        </div>
        <div className={cn(TILE_GREEN, 'flex-1 min-w-0 p-2.5 flex flex-col items-center gap-2')}>
          <span className="flex items-center justify-center w-8 h-8 rounded-[10px] bg-status-success/12 text-status-success" aria-hidden>
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
    <Section id="privacy" className={SHELL}>
      <Eyebrow tone="green">Why trust it?</Eyebrow>
      <SectionTitle tone="green">{t('land.trust.title')}</SectionTitle>
      <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 gap-2.5">
        {items.map(({ icon, title, body }) => (
          <div key={title} className={cn(TILE_GREEN, 'flex items-start gap-3 p-3.5')}>
            <span className="shrink-0 flex items-center justify-center w-9 h-9 rounded-[11px] bg-status-success/10 dark:bg-status-success/[0.14] text-status-success" aria-hidden>
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
      {/* Final CTA — the natural conclusion of the story. */}
      <Section className="rounded-[24px] bg-ember/[0.07] dark:bg-ember/[0.11] border border-ember/25 dark:border-ember/30 p-6 sm:p-7 text-center">
        <h2 className="text-[21px] sm:text-[25px] font-bold tracking-[-0.02em] text-apple-ink dark:text-white" style={{ fontFamily: 'var(--font-display)' }}>
          {t('land.cta.title')}
        </h2>
        <p className="mt-2 text-[13.5px] text-apple-ink-muted dark:text-white/55">{t('land.cta.body')}</p>
        <button
          type="button"
          onClick={onCta}
          className="mt-5 inline-flex items-center justify-center min-h-[50px] px-8 rounded-full bg-ember hover:bg-[#d9560e] text-white text-[15px] font-semibold shadow-[0_1px_3px_rgba(240,100,19,0.35)] hover:shadow-[0_6px_20px_-6px_rgba(240,100,19,0.55)] transition-all active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ember/60 focus-visible:ring-offset-2"
        >
          {t('land.cta.send')}
        </button>
      </Section>
    </div>
  );
}
