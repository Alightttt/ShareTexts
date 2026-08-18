import React, { useRef, useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Play,
  Pause,
  RotateCcw,
  Check,
  Image as ImageIcon,
  Link2,
  FileArchive,
  FileText,
  Download,
  Copy,
  ExternalLink,
} from 'lucide-react';
import { cn } from '../lib/utils';
import {
  useHeroDemoMachine,
  DemoScenario,
  SCENARIOS,
  STEPS,
  StepIndex,
} from '../hooks/useHeroDemoMachine';
import { ShareTextLogo } from './ShareTextLogo';

/* ============================================================
 * DESIGN TOKENS
 * ============================================================ */
const TOKENS = {
  canvas: 'bg-[#F7F7F5] dark:bg-[#090A0D]',
  surface: 'bg-white dark:bg-[#13161B]',
  surfaceRaised: 'bg-white dark:bg-[#1B2028]',
  ink: 'text-[#17191D] dark:text-[#F4F6F8]',
  inkMuted: 'text-[#6E737B] dark:text-[#9BA3AE]',
  line: 'border-[#E3E5E8] dark:border-[#272D36]',
  bridge: 'bg-[#0A66F0] dark:bg-[#4B8DFF]',
  bridgeText: 'text-[#0A66F0] dark:text-[#4B8DFF]',
  bridgeSoft: 'bg-[#DDEBFF] dark:bg-[#162B4D]',
  success: 'bg-[#1C9A61] dark:bg-[#55D18C]',
  successText: 'text-[#1C9A61] dark:text-[#55D18C]',
  warning: 'text-[#B26A00] dark:text-[#F3B44C]',
  danger: 'text-[#C93535] dark:text-[#FF7777]',
};

/* ============================================================
 * DEVICE FRAMES — simplified, precise
 * ============================================================ */

function PhoneFrame({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        'relative rounded-[24px] border-2 border-[#E3E5E8] dark:border-[#272D36]',
        'bg-white dark:bg-[#13161B]',
        'shadow-[0_24px_70px_-32px_rgba(12,20,35,0.42)] dark:shadow-[0_24px_70px_-32px_rgba(0,0,0,0.6)]',
        'overflow-hidden',
        className
      )}
    >
      {/* Notch */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[80px] h-[20px] bg-[#E3E5E8] dark:bg-[#272D36] rounded-b-[12px] z-10" />
      {/* Screen */}
      <div className="relative w-full h-full bg-white dark:bg-[#13161B] overflow-hidden">
        {children}
      </div>
    </div>
  );
}

function LaptopFrame({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('relative', className)}>
      {/* Screen */}
      <div
        className={cn(
          'relative rounded-[12px] border-2 border-[#E3E5E8] dark:border-[#272D36]',
          'bg-white dark:bg-[#13161B]',
          'shadow-[0_24px_70px_-32px_rgba(12,20,35,0.42)] dark:shadow-[0_24px_70px_-32px_rgba(0,0,0,0.6)]',
          'overflow-hidden'
        )}
      >
        {/* Camera dot */}
        <div className="absolute top-2 left-1/2 -translate-x-1/2 w-1.5 h-1.5 rounded-full bg-[#E3E5E8] dark:bg-[#272D36]" />
        {children}
      </div>
      {/* Base */}
      <div className="relative mx-auto mt-1">
        <div className="h-2 bg-[#E3E5E8] dark:bg-[#272D36] rounded-b-[4px]" />
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[60px] h-0.5 bg-[#D1D5DB] dark:bg-[#3A3D45] rounded-full" />
      </div>
    </div>
  );
}

/* ============================================================
 * STATUS PILL
 * ============================================================ */

function StatusPill({ state }: { state: 'connected' | 'sending' | 'receiving' | 'received' | 'pairing' }) {
  const config = {
    connected: { dot: 'bg-[#1C9A61] dark:bg-[#55D18C]', text: 'Connected' },
    pairing: { dot: 'bg-[#B26A00] dark:bg-[#F3B44C] animate-pulse', text: 'Pairing…' },
    sending: { dot: 'bg-[#0A66F0] dark:bg-[#4B8DFF] animate-pulse', text: 'Sending…' },
    receiving: { dot: 'bg-[#0A66F0] dark:bg-[#4B8DFF] animate-pulse', text: 'Receiving…' },
    received: { dot: 'bg-[#1C9A61] dark:bg-[#55D18C]', text: 'Received' },
  }[state];

  return (
    <div className="flex items-center gap-1.5">
      <span className={cn('w-1.5 h-1.5 rounded-full', config.dot)} />
      <span className={cn('text-[10px] sm:text-[11px] font-medium', TOKENS.inkMuted)}>{config.text}</span>
    </div>
  );
}

/* ============================================================
 * TRANSFER CHIP — payload card
 * ============================================================ */

function TransferChip({
  scenario,
  showAction,
}: {
  scenario: DemoScenario;
  showAction?: boolean;
}) {
  const data = SCENARIOS[scenario];
  
  const Icon = {
    note: FileText,
    link: Link2,
    photo: ImageIcon,
    file: FileArchive,
  }[scenario];

  const ActionIcon = {
    note: Copy,
    link: ExternalLink,
    photo: Download,
    file: Download,
  }[scenario];
  
  return (
    <div className={cn(
      'flex items-center gap-2.5 px-3 py-2.5 rounded-[12px]',
      TOKENS.surface,
      'border',
      TOKENS.line,
      'shadow-[0_12px_30px_-18px_rgba(12,20,35,0.35)]'
    )}>
      <div className={cn(
        'w-10 h-10 rounded-[10px] flex items-center justify-center',
        scenario === 'photo' ? 'bg-[#DDEBFF] dark:bg-[#162B4D]' :
        scenario === 'link' ? 'bg-[#EDE9FE] dark:bg-[#1E1B4B]/30' :
        scenario === 'file' ? 'bg-[#FEF3C7] dark:bg-[#78350F]/30' :
        'bg-[#F3F4F6] dark:bg-[#374151]/30'
      )}>
        <Icon className={cn(
          'w-5 h-5',
          scenario === 'photo' ? 'text-[#0A66F0] dark:text-[#4B8DFF]' :
          scenario === 'link' ? 'text-[#7C3AED] dark:text-[#A78BFA]' :
          scenario === 'file' ? 'text-[#D97706] dark:text-[#FBBF24]' :
          'text-[#6B7280] dark:text-[#9CA3AF]'
        )} />
      </div>
      <div className="flex-1 min-w-0">
        <div className={cn('text-[12px] sm:text-[13px] font-semibold truncate', TOKENS.ink)}>
          {data.senderPreview}
        </div>
        {data.size && (
          <div className={cn('text-[10px] sm:text-[11px]', TOKENS.inkMuted)}>
            {data.size}
          </div>
        )}
      </div>
      {showAction && (
        <div className={cn(
          'flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-[10px] sm:text-[11px] font-semibold',
          TOKENS.bridgeSoft,
          TOKENS.bridgeText
        )}>
          <ActionIcon className="w-3 h-3" />
          {data.receiverAction}
        </div>
      )}
    </div>
  );
}

/* ============================================================
 * PROGRESS RAIL — five clear steps
 * ============================================================ */

function ProgressRail({
  currentStep,
  onStepClick,
}: {
  currentStep: StepIndex;
  onStepClick: (step: StepIndex) => void;
}) {
  const labels = ['Pair', 'Connect', 'Send', 'Travel', 'Arrive'];
  
  return (
    <div className="flex items-center gap-1 sm:gap-1.5">
      {STEPS.map((step, index) => (
        <button
          key={step}
          onClick={() => onStepClick(index as StepIndex)}
          className={cn(
            'flex items-center gap-1 sm:gap-1.5 px-2 sm:px-2.5 py-1.5 rounded-full text-[10px] sm:text-[11px] font-semibold transition-colors duration-180',
            'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0A66F0]',
            index <= currentStep
              ? cn(TOKENS.bridgeSoft, TOKENS.bridgeText)
              : cn('bg-[#F3F4F6] dark:bg-[#374151]', TOKENS.inkMuted)
          )}
          aria-label={`Go to ${labels[index]} step`}
        >
          <span className={cn(
            'w-4 h-4 rounded-full flex items-center justify-center text-[8px] font-bold',
            index < currentStep
              ? cn(TOKENS.bridge, 'text-white')
              : index === currentStep
                ? cn(TOKENS.bridge, 'text-white')
                : 'bg-[#E3E5E8] dark:bg-[#4B5563] text-[#6B7280] dark:text-[#9CA3AF]'
          )}>
            {index < currentStep ? (
              <Check className="w-2.5 h-2.5" />
            ) : (
              index + 1
            )}
          </span>
          <span className="hidden sm:inline">{labels[index]}</span>
        </button>
      ))}
    </div>
  );
}

/* ============================================================
 * SCENARIO PICKER — outside device surfaces
 * ============================================================ */

function ScenarioPicker({
  selected,
  onSelect,
}: {
  selected: DemoScenario;
  onSelect: (scenario: DemoScenario) => void;
}) {
  const scenarios: { key: DemoScenario; icon: React.ElementType; label: string }[] = [
    { key: 'note', icon: FileText, label: 'Note' },
    { key: 'link', icon: Link2, label: 'Link' },
    { key: 'photo', icon: ImageIcon, label: 'Photo' },
    { key: 'file', icon: FileArchive, label: 'File' },
  ];
  
  return (
    <div className="flex items-center gap-1.5 sm:gap-2" role="radiogroup" aria-label="Demo scenario">
      {scenarios.map(({ key, icon: Icon, label }) => (
        <button
          key={key}
          role="radio"
          aria-checked={selected === key}
          onClick={() => onSelect(key)}
          className={cn(
            'flex items-center gap-1.5 px-3 py-2 rounded-full text-[11px] sm:text-[12px] font-semibold transition-colors duration-180',
            'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0A66F0]',
            'min-h-[44px] min-w-[44px]',
            selected === key
              ? cn(TOKENS.bridgeSoft, TOKENS.bridgeText, 'ring-1 ring-current')
              : cn('bg-[#F3F4F6] dark:bg-[#374151]', TOKENS.inkMuted, 'hover:bg-[#E5E7EB] dark:hover:bg-[#4B5563]')
          )}
          data-testid={`hero-scenario-${key}`}
        >
          <Icon className="w-4 h-4" />
          <span className="hidden sm:inline">{label}</span>
        </button>
      ))}
    </div>
  );
}

/* ============================================================
 * MAIN COMPONENT: LiveBridgeDemo
 * ============================================================ */

export function LiveBridgeDemo() {
  const machine = useHeroDemoMachine();
  const containerRef = useRef<HTMLDivElement>(null);
  const [isHovered, setIsHovered] = useState(false);
  
  // Pause on hover/focus
  useEffect(() => {
    if (isHovered && machine.isPlaying) {
      machine.pause();
    }
  }, [isHovered, machine]);
  
  // Get status text for screen readers
  const getStatusText = () => {
    switch (machine.state) {
      case 'idle':
        return 'Ready to move something. Select a payload and press Play.';
      case 'pairing':
        return 'Pairing the two devices.';
      case 'ready':
        return 'Devices connected.';
      case 'sending':
        return `Sending ${SCENARIOS[machine.scenario].label.toLowerCase()}.`;
      case 'traveling':
        return `${SCENARIOS[machine.scenario].label} in transit.`;
      case 'received':
        return `${SCENARIOS[machine.scenario].label} received. ${SCENARIOS[machine.scenario].receiverAction} available.`;
      case 'paused':
        return 'Demo paused.';
      default:
        return 'Interactive demo.';
    }
  };

  // Is the payload visible on sender?
  const showSenderPayload = machine.state === 'idle' || machine.state === 'pairing' || machine.state === 'ready';
  const isSending = machine.state === 'sending' || machine.state === 'traveling';
  const showReceiverResult = machine.state === 'received';

  return (
    <div
      ref={containerRef}
      data-testid="hero-demo"
      className="relative w-full max-w-[920px] mx-auto select-none"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onFocus={() => setIsHovered(true)}
      onBlur={() => setIsHovered(false)}
      role="region"
      aria-label="Interactive product demonstration"
      data-phase={machine.state}
    >
      {/* Screen reader status */}
      <div aria-live="polite" aria-atomic="true" className="sr-only" data-testid="hero-status">
        {getStatusText()}
      </div>
      
      {/* Scene label */}
      <div className="text-center mb-4">
        <span className={cn('text-[11px] sm:text-[12px] font-semibold tracking-wide uppercase', TOKENS.inkMuted)}>
          Temporary room · 2 devices
        </span>
      </div>

      {/* === DEVICE STAGE === */}
      <div className="flex flex-col sm:flex-row items-center sm:items-start justify-center gap-6 sm:gap-8 lg:gap-12 px-2 sm:px-4">
        
        {/* === SENDER (Phone) === */}
        <div className="flex flex-col items-center" data-testid="hero-sender-device">
          <PhoneFrame className="w-[140px] sm:w-[170px] lg:w-[190px] h-[240px] sm:h-[280px] lg:h-[320px]">
            <div className="w-full h-full flex flex-col">
              {/* Phone header */}
              <div className="px-3 pt-8 pb-2 border-b border-[#E3E5E8] dark:border-[#272D36]">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <ShareTextLogo size={10} className="text-[#0A66F0] dark:text-[#4B8DFF]" />
                    <span className={cn('text-[8px] font-semibold', TOKENS.ink)}>Your phone</span>
                  </div>
                  <StatusPill state={isSending ? 'sending' : showReceiverResult ? 'received' : 'connected'} />
                </div>
              </div>
              
              {/* Phone content */}
              <div className="flex-1 flex flex-col justify-end p-3">
                <AnimatePresence mode="wait">
                  {showSenderPayload ? (
                    <motion.div
                      key={`payload-${machine.scenario}`}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -8 }}
                      transition={{ duration: 0.18, ease: [0.2, 0.8, 0.2, 1] }}
                      data-testid="sender-payload-title"
                    >
                      <TransferChip scenario={machine.scenario} />
                    </motion.div>
                  ) : isSending ? (
                    <motion.div
                      key="sending"
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -8 }}
                      transition={{ duration: 0.18, ease: [0.2, 0.8, 0.2, 1] }}
                      className="flex flex-col items-center gap-2 py-6"
                    >
                      <div className={cn('w-10 h-10 rounded-full flex items-center justify-center', TOKENS.bridgeSoft)}>
                        <motion.div
                          animate={{ rotate: 360 }}
                          transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                        >
                          <ShareTextLogo size={16} className={TOKENS.bridgeText} />
                        </motion.div>
                      </div>
                      <span className={cn('text-[11px] font-semibold', TOKENS.bridgeText)}>
                        Sending…
                      </span>
                    </motion.div>
                  ) : (
                    <motion.div
                      key="sent"
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="flex flex-col items-center gap-2 py-6"
                    >
                      <div className={cn('w-10 h-10 rounded-full flex items-center justify-center', TOKENS.success)}>
                        <Check className="w-5 h-5 text-white" />
                      </div>
                      <span className={cn('text-[11px] font-semibold', TOKENS.successText)}>
                        Sent
                      </span>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>
          </PhoneFrame>
          <div className={cn('mt-3 text-[12px] sm:text-[13px] font-semibold', TOKENS.inkMuted)}>
            Your phone
          </div>
        </div>
        
        {/* === BRIDGE (Center) — the product signature === */}
        <div className="flex flex-col items-center justify-center sm:pt-20 lg:pt-24">
          {/* Connection line — more prominent */}
          <div className="relative w-[100px] sm:w-[120px] lg:w-[160px] h-1.5 bg-[#E3E5E8] dark:bg-[#272D36] rounded-full overflow-hidden">
            <motion.div
              className={cn('absolute inset-y-0 left-0 rounded-full', TOKENS.bridge)}
              initial={{ width: '0%' }}
              animate={{
                width: machine.state === 'idle' ? '0%' : '100%'
              }}
              transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
            />
            
            {/* Transfer packet — bigger, more visible */}
            <AnimatePresence>
              {isSending && (
                <motion.div
                  className={cn('absolute top-1/2 -translate-y-1/2 w-4 h-4 rounded-full', TOKENS.bridge)}
                  initial={{ left: '0%', scale: 0.8, opacity: 0 }}
                  animate={{ left: '85%', scale: 1, opacity: 1 }}
                  exit={{ left: '100%', scale: 0.8, opacity: 0 }}
                  transition={{ duration: 1.4, ease: [0.32, 0.72, 0, 1] }}
                  style={{ boxShadow: '0 0 16px rgba(10, 102, 240, 0.6)' }}
                />
              )}
            </AnimatePresence>
          </div>
          
          {/* Center node */}
          <div className={cn(
            'mt-3 w-10 h-10 rounded-full flex items-center justify-center',
            TOKENS.surface,
            'border-2',
            TOKENS.line,
            'shadow-[0_12px_30px_-18px_rgba(12,20,35,0.35)]'
          )}>
            <ShareTextLogo size={16} className={TOKENS.bridgeText} />
          </div>
          
          {/* Direction arrow */}
          <div className={cn('mt-2 text-[10px] sm:text-[11px] font-semibold', TOKENS.inkMuted)}>
            →
          </div>
        </div>
        
        {/* === RECEIVER (Laptop) === */}
        <div className="flex flex-col items-center" data-testid="hero-receiver-device">
          <LaptopFrame className="w-[180px] sm:w-[220px] lg:w-[260px] h-[130px] sm:h-[160px] lg:h-[180px]">
            <div className="w-full h-full flex flex-col">
              {/* Laptop header */}
              <div className="px-3 pt-5 pb-2 border-b border-[#E3E5E8] dark:border-[#272D36]">
                <div className="flex items-center justify-between">
                  <span className={cn('text-[8px] font-semibold', TOKENS.ink)}>Your laptop</span>
                  <StatusPill state={isSending ? 'receiving' : showReceiverResult ? 'received' : 'connected'} />
                </div>
              </div>
              
              {/* Laptop content */}
              <div className="flex-1 flex flex-col items-center justify-center p-3">
                <AnimatePresence mode="wait">
                  {showReceiverResult ? (
                    <motion.div
                      key="received"
                      initial={{ opacity: 0, y: 8, scale: 0.96 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
                      className="w-full"
                      data-testid="hero-transfer-chip"
                    >
                      <TransferChip scenario={machine.scenario} showAction />
                    </motion.div>
                  ) : isSending ? (
                    <motion.div
                      key="receiving"
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -8 }}
                      transition={{ duration: 0.18, ease: [0.2, 0.8, 0.2, 1] }}
                      className="flex flex-col items-center gap-2 py-2"
                    >
                      <div className={cn('w-10 h-10 rounded-full flex items-center justify-center', TOKENS.bridgeSoft)}>
                        <motion.div
                          animate={{ rotate: -360 }}
                          transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                        >
                          <ShareTextLogo size={16} className={TOKENS.bridgeText} />
                        </motion.div>
                      </div>
                      <span className={cn('text-[11px] font-semibold', TOKENS.bridgeText)}>
                        Receiving…
                      </span>
                    </motion.div>
                  ) : (
                    <motion.div
                      key="waiting"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.18 }}
                      className="flex flex-col items-center gap-1.5 py-2"
                    >
                      <div className={cn('w-10 h-10 rounded-full flex items-center justify-center bg-[#F3F4F6] dark:bg-[#374151]')}>
                        <Download className="w-5 h-5 text-[#9CA3AF] dark:text-[#6B7280]" />
                      </div>
                      <span className={cn('text-[11px] font-semibold', TOKENS.inkMuted)}>
                        Waiting
                      </span>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>
          </LaptopFrame>
          <div className={cn('mt-3 text-[12px] sm:text-[13px] font-semibold', TOKENS.inkMuted)}>
            Your laptop
          </div>
        </div>
      </div>
      
      {/* === CONTROLS === */}
      <div className="mt-6 sm:mt-8 flex flex-col items-center gap-4">
        {/* Scenario picker */}
        <ScenarioPicker
          selected={machine.scenario}
          onSelect={machine.chooseScenario}
        />
        
        {/* Progress rail */}
        <ProgressRail
          currentStep={machine.step}
          onStepClick={machine.goToStep}
        />
        
        {/* Play/Pause/Replay controls */}
        <div className="flex items-center gap-3">
          {machine.state === 'received' ? (
            <button
              onClick={machine.replay}
              className={cn(
                'flex items-center gap-2 px-5 py-2.5 rounded-full text-[12px] sm:text-[13px] font-semibold transition-colors duration-180',
                'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0A66F0]',
                'min-h-[44px]',
                TOKENS.bridgeSoft,
                TOKENS.bridgeText,
                'hover:shadow-md'
              )}
              data-testid="hero-demo-replay"
              aria-label="Replay transfer demo"
            >
              <RotateCcw className="w-4 h-4" />
              Replay
            </button>
          ) : machine.isPlaying ? (
            <button
              onClick={machine.pause}
              className={cn(
                'flex items-center gap-2 px-5 py-2.5 rounded-full text-[12px] sm:text-[13px] font-semibold transition-colors duration-180',
                'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0A66F0]',
                'min-h-[44px]',
                'bg-[#F3F4F6] dark:bg-[#374151]',
                TOKENS.inkMuted,
                'hover:bg-[#E5E7EB] dark:hover:bg-[#4B5563]'
              )}
              data-testid="hero-demo-pause"
              aria-label="Pause transfer demo"
            >
              <Pause className="w-4 h-4" />
              Pause
            </button>
          ) : (
            <button
              onClick={machine.play}
              className={cn(
                'flex items-center gap-2 px-5 py-2.5 rounded-full text-[12px] sm:text-[13px] font-semibold transition-colors duration-180',
                'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0A66F0]',
                'min-h-[44px]',
                TOKENS.bridge,
                'text-white',
                'hover:shadow-[0_10px_24px_-14px_rgba(10,102,240,0.48)]',
                'hover:translate-y-[-1px]'
              )}
              data-testid="hero-demo-play"
              aria-label="Play transfer demo"
            >
              <Play className="w-4 h-4" />
              Play demo
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
