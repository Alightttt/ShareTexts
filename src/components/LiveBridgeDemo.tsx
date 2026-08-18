import React, { useRef, useEffect, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Play,
  Pause,
  RotateCcw,
  Copy,
  ExternalLink,
  Download,
  Check,
  Image as ImageIcon,
  Link2,
  FileArchive,
  FileText,
  Smartphone,
  Monitor,
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
 * DESIGN TOKENS (inline for now — will be extracted to tokens.css)
 * ============================================================ */
const TOKENS = {
  canvas: 'bg-[#F8F8F6] dark:bg-[#090B10]',
  surface: 'bg-white dark:bg-[#11151D]',
  surfaceRaised: 'bg-white dark:bg-[#171C26]',
  ink: 'text-[#101216] dark:text-[#F5F7FA]',
  inkMuted: 'text-[#686D78] dark:text-[#9AA3B2]',
  line: 'border-[rgba(16,18,22,0.10)] dark:border-[rgba(245,247,250,0.12)]',
  blue: 'bg-[#1769FF] dark:bg-[#4C8DFF]',
  blueText: 'text-[#1769FF] dark:text-[#4C8DFF]',
  blueSoft: 'bg-[#EAF1FF] dark:bg-[#12294D]',
  success: 'bg-[#198754] dark:bg-[#46C78A]',
  successText: 'text-[#198754] dark:text-[#46C78A]',
  warning: 'text-[#9A6700] dark:text-[#F2C96D]',
  danger: 'text-[#C43D4B] dark:text-[#FF7784]',
  focus: 'outline-[#7CB0FF] dark:outline-[#A9CBFF]',
};

/* ============================================================
 * DEVICE FRAMES
 * ============================================================ */

function PhoneFrame({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        'relative rounded-[24px] border-2 border-[#E5E7EB] dark:border-[#2A2D35]',
        'bg-white dark:bg-[#0D0F14]',
        'shadow-[0_8px_32px_rgba(0,0,0,0.12)] dark:shadow-[0_8px_32px_rgba(0,0,0,0.4)]',
        'overflow-hidden',
        className
      )}
    >
      {/* Notch */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[80px] h-[20px] bg-[#E5E7EB] dark:bg-[#2A2D35] rounded-b-[12px] z-10" />
      {/* Screen */}
      <div className="relative w-full h-full bg-white dark:bg-[#0D0F14] overflow-hidden">
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
          'relative rounded-[12px] border-2 border-[#E5E7EB] dark:border-[#2A2D35]',
          'bg-white dark:bg-[#0D0F14]',
          'shadow-[0_8px_32px_rgba(0,0,0,0.12)] dark:shadow-[0_8px_32px_rgba(0,0,0,0.4)]',
          'overflow-hidden'
        )}
      >
        {/* Camera dot */}
        <div className="absolute top-2 left-1/2 -translate-x-1/2 w-1.5 h-1.5 rounded-full bg-[#E5E7EB] dark:bg-[#2A2D35]" />
        {children}
      </div>
      {/* Base */}
      <div className="relative mx-auto mt-1">
        <div className="h-2 bg-[#E5E7EB] dark:bg-[#2A2D35] rounded-b-[4px]" />
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[60px] h-0.5 bg-[#D1D5DB] dark:bg-[#3A3D45] rounded-full" />
      </div>
    </div>
  );
}

/* ============================================================
 * STATUS PILL
 * ============================================================ */

function StatusPill({
  state,
  label,
}: {
  state: 'connected' | 'sending' | 'sent' | 'receiving' | 'received' | 'pairing';
  label: string;
}) {
  const config = {
    connected: { dot: 'bg-[#198754] dark:bg-[#46C78A]', text: 'Connected', cls: TOKENS.inkMuted },
    pairing: { dot: 'bg-[#9A6700] dark:bg-[#F2C96D] animate-pulse', text: 'Pairing…', cls: TOKENS.warning },
    sending: { dot: 'bg-[#1769FF] dark:bg-[#4C8DFF] animate-pulse', text: 'Sending…', cls: TOKENS.blueText },
    sent: { dot: 'bg-[#198754] dark:bg-[#46C78A]', text: 'Sent', cls: TOKENS.successText },
    receiving: { dot: 'bg-[#1769FF] dark:bg-[#4C8DFF] animate-pulse', text: 'Receiving…', cls: TOKENS.blueText },
    received: { dot: 'bg-[#198754] dark:bg-[#46C78A]', text: 'Received', cls: TOKENS.successText },
  }[state];

  return (
    <div className="flex items-center gap-1.5">
      <span className={cn('w-1.5 h-1.5 rounded-full', config.dot)} />
      <span className={cn('text-[10px] sm:text-[11px] font-medium', config.cls)}>{config.text}</span>
    </div>
  );
}

/* ============================================================
 * TRANSFER CHIP (content that travels)
 * ============================================================ */

function TransferChip({
  scenario,
  isReceiver,
  showAction,
}: {
  scenario: DemoScenario;
  isReceiver?: boolean;
  showAction?: boolean;
}) {
  const data = SCENARIOS[scenario];
  
  const Icon = {
    note: FileText,
    link: Link2,
    photo: ImageIcon,
    file: FileArchive,
  }[scenario];
  
  return (
    <div className={cn(
      'flex items-center gap-2 px-3 py-2 rounded-[10px]',
      TOKENS.surface,
      'border',
      TOKENS.line,
      'shadow-sm'
    )}>
      <div className={cn(
        'w-8 h-8 rounded-[8px] flex items-center justify-center',
        scenario === 'photo' ? 'bg-blue-50 dark:bg-blue-900/30' :
        scenario === 'link' ? 'bg-purple-50 dark:bg-purple-900/30' :
        scenario === 'file' ? 'bg-amber-50 dark:bg-amber-900/30' :
        'bg-gray-50 dark:bg-gray-800/30'
      )}>
        <Icon className={cn(
          'w-4 h-4',
          scenario === 'photo' ? 'text-blue-500 dark:text-blue-400' :
          scenario === 'link' ? 'text-purple-500 dark:text-purple-400' :
          scenario === 'file' ? 'text-amber-500 dark:text-amber-400' :
          'text-gray-500 dark:text-gray-400'
        )} />
      </div>
      <div className="flex-1 min-w-0">
        <div className={cn('text-[11px] sm:text-[12px] font-medium truncate', TOKENS.ink)}>
          {data.senderPreview}
        </div>
        {data.size && (
          <div className={cn('text-[9px] sm:text-[10px]', TOKENS.inkMuted)}>
            {data.size}
          </div>
        )}
      </div>
      {showAction && (
        <div className={cn(
          'px-2 py-1 rounded-full text-[9px] sm:text-[10px] font-medium',
          TOKENS.blueSoft,
          TOKENS.blueText
        )}>
          {data.receiverAction}
        </div>
      )}
    </div>
  );
}

/* ============================================================
 * PROGRESS RAIL
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
    <div className="flex items-center gap-1 sm:gap-2">
      {STEPS.map((step, index) => (
        <button
          key={step}
          onClick={() => onStepClick(index as StepIndex)}
          className={cn(
            'flex items-center gap-1.5 px-2 py-1 rounded-full text-[10px] sm:text-[11px] font-medium transition-all',
            'focus-visible:outline-2 focus-visible:outline-offset-2',
            TOKENS.focus,
            index <= currentStep
              ? cn(TOKENS.blueSoft, TOKENS.blueText)
              : cn('bg-gray-100 dark:bg-gray-800', TOKENS.inkMuted)
          )}
          aria-label={`Go to ${labels[index]} step`}
        >
          <span className={cn(
            'w-4 h-4 rounded-full flex items-center justify-center text-[8px] font-bold',
            index < currentStep
              ? cn(TOKENS.blue, 'text-white')
              : index === currentStep
                ? cn(TOKENS.blue, 'text-white')
                : 'bg-gray-200 dark:bg-gray-700 text-gray-500 dark:text-gray-400'
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
 * SCENARIO PICKER
 * ============================================================ */

function ScenarioPicker({
  selected,
  onSelect,
}: {
  selected: DemoScenario;
  onSelect: (scenario: DemoScenario) => void;
}) {
  const scenarios: { key: DemoScenario; icon: React.ElementType }[] = [
    { key: 'note', icon: FileText },
    { key: 'link', icon: Link2 },
    { key: 'photo', icon: ImageIcon },
    { key: 'file', icon: FileArchive },
  ];
  
  return (
    <div className="flex items-center gap-1.5 sm:gap-2" role="radiogroup" aria-label="Demo scenario">
      {scenarios.map(({ key, icon: Icon }) => (
        <button
          key={key}
          role="radio"
          aria-checked={selected === key}
          onClick={() => onSelect(key)}
          className={cn(
            'flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-[11px] sm:text-[12px] font-medium transition-all',
            'focus-visible:outline-2 focus-visible:outline-offset-2',
            TOKENS.focus,
            selected === key
              ? cn(TOKENS.blueSoft, TOKENS.blueText, 'ring-1 ring-current')
              : cn('bg-gray-100 dark:bg-gray-800', TOKENS.inkMuted, 'hover:bg-gray-200 dark:hover:bg-gray-700')
          )}
          data-testid={`hero-scenario-${key}`}
        >
          <Icon className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">{SCENARIOS[key].label}</span>
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
  
  // Pause on hover
  useEffect(() => {
    if (isHovered && machine.isPlaying) {
      machine.pause();
    }
  }, [isHovered, machine]);
  
  // Get status text for screen readers
  const getStatusText = () => {
    switch (machine.state) {
      case 'idle':
        return 'Demo ready. Send a note, link, photo, or file.';
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
    >
      {/* Screen reader status announcement */}
      <div
        aria-live="polite"
        aria-atomic="true"
        className="sr-only"
        data-testid="hero-status"
      >
        {getStatusText()}
      </div>
      
      {/* Visually hidden text summary for screen readers */}
      <div className="sr-only">
        A {SCENARIOS[machine.scenario].label.toLowerCase()} moves from the phone to the laptop 
        and becomes available to {SCENARIOS[machine.scenario].receiverAction.toLowerCase()}.
      </div>
      
      {/* === DEVICE STAGE === */}
      <div className="flex flex-col lg:flex-row items-center lg:items-start justify-center gap-8 lg:gap-12 px-4">
        
        {/* === SENDER (Phone) === */}
        <div className="flex flex-col items-center" data-testid="hero-sender-device">
          <PhoneFrame className="w-[160px] sm:w-[180px] h-[280px] sm:h-[320px]">
            <div className="w-full h-full flex flex-col">
              {/* Phone header */}
              <div className="px-3 pt-8 pb-2 border-b border-[#E5E7EB] dark:border-[#2A2D35]">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <ShareTextLogo size={10} className="text-[#1769FF] dark:text-[#4C8DFF]" />
                    <span className={cn('text-[8px] font-semibold', TOKENS.ink)}>Your phone</span>
                  </div>
                  <StatusPill
                    state={
                      machine.state === 'sending' || machine.state === 'traveling' ? 'sending' :
                      machine.state === 'received' ? 'sent' :
                      'connected'
                    }
                    label=""
                  />
                </div>
              </div>
              
              {/* Phone content */}
              <div className="flex-1 flex flex-col justify-end p-3">
                <AnimatePresence mode="wait">
                  {machine.state === 'sending' || machine.state === 'traveling' ? (
                    <motion.div
                      key="sending"
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      className="flex flex-col items-center gap-2 py-4"
                    >
                      <div className={cn('w-8 h-8 rounded-full flex items-center justify-center', TOKENS.blueSoft)}>
                        <motion.div
                          animate={{ rotate: 360 }}
                          transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                        >
                          <ShareTextLogo size={14} className={TOKENS.blueText} />
                        </motion.div>
                      </div>
                      <span className={cn('text-[10px] font-medium', TOKENS.blueText)}>
                        Sending…
                      </span>
                    </motion.div>
                  ) : machine.state === 'received' ? (
                    <motion.div
                      key="sent"
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="flex flex-col items-center gap-2 py-4"
                    >
                      <div className={cn('w-8 h-8 rounded-full flex items-center justify-center', TOKENS.success)}>
                        <Check className="w-4 h-4 text-white" />
                      </div>
                      <span className={cn('text-[10px] font-medium', TOKENS.successText)}>
                        Sent
                      </span>
                    </motion.div>
                  ) : (
                    <motion.div
                      key="idle"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="flex flex-col items-center gap-2 py-4"
                    >
                      <TransferChip scenario={machine.scenario} />
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>
          </PhoneFrame>
          <div className={cn('mt-3 text-[11px] sm:text-[12px] font-medium', TOKENS.inkMuted)}>
            Your phone
          </div>
        </div>
        
        {/* === BRIDGE (Center) === */}
        <div className="flex flex-col items-center justify-center lg:pt-16">
          {/* Connection line */}
          <div className="relative w-[120px] lg:w-[160px] h-1 bg-[#E5E7EB] dark:bg-[#2A2D35] rounded-full overflow-hidden">
            <motion.div
              className={cn('absolute inset-y-0 left-0 rounded-full', TOKENS.blue)}
              initial={{ width: '0%' }}
              animate={{
                width: machine.state === 'idle' ? '0%' :
                       machine.state === 'pairing' ? '100%' :
                       machine.state === 'received' ? '100%' :
                       '100%'
              }}
              transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
            />
            
            {/* Transfer packet */}
            <AnimatePresence>
              {(machine.state === 'sending' || machine.state === 'traveling') && (
                <motion.div
                  className={cn('absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full shadow-md', TOKENS.blue)}
                  initial={{ left: '0%', scale: 0.8 }}
                  animate={{ left: '90%', scale: 1 }}
                  exit={{ left: '100%', scale: 0.8 }}
                  transition={{ duration: 1.2, ease: [0.32, 0.72, 0, 1] }}
                  style={{ boxShadow: '0 0 12px rgba(23, 105, 255, 0.5)' }}
                />
              )}
            </AnimatePresence>
          </div>
          
          {/* Center logo */}
          <div className={cn(
            'mt-3 w-8 h-8 rounded-full flex items-center justify-center',
            TOKENS.surface,
            'border',
            TOKENS.line,
            'shadow-sm'
          )}>
            <ShareTextLogo size={14} className={TOKENS.blueText} />
          </div>
        </div>
        
        {/* === RECEIVER (Laptop) === */}
        <div className="flex flex-col items-center" data-testid="hero-receiver-device">
          <LaptopFrame className="w-[220px] sm:w-[260px] h-[160px] sm:h-[180px]">
            <div className="w-full h-full flex flex-col">
              {/* Laptop header */}
              <div className="px-3 pt-5 pb-2 border-b border-[#E5E7EB] dark:border-[#2A2D35]">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <Monitor className="w-3 h-3 text-[#686D78] dark:text-[#9AA3B2]" />
                    <span className={cn('text-[8px] font-semibold', TOKENS.ink)}>Your laptop</span>
                  </div>
                  <StatusPill
                    state={
                      machine.state === 'sending' || machine.state === 'traveling' ? 'receiving' :
                      machine.state === 'received' ? 'received' :
                      'connected'
                    }
                    label=""
                  />
                </div>
              </div>
              
              {/* Laptop content */}
              <div className="flex-1 flex flex-col items-center justify-center p-3">
                <AnimatePresence mode="wait">
                  {machine.state === 'sending' || machine.state === 'traveling' ? (
                    <motion.div
                      key="receiving"
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      className="flex flex-col items-center gap-2 py-2"
                    >
                      <div className={cn('w-8 h-8 rounded-full flex items-center justify-center', TOKENS.blueSoft)}>
                        <motion.div
                          animate={{ rotate: -360 }}
                          transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                        >
                          <ShareTextLogo size={14} className={TOKENS.blueText} />
                        </motion.div>
                      </div>
                      <span className={cn('text-[10px] font-medium', TOKENS.blueText)}>
                        Receiving…
                      </span>
                    </motion.div>
                  ) : machine.state === 'received' ? (
                    <motion.div
                      key="received"
                      initial={{ opacity: 0, y: 10, scale: 0.95 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      className="w-full"
                      data-testid="hero-transfer-chip"
                    >
                      <TransferChip
                        scenario={machine.scenario}
                        isReceiver
                        showAction
                      />
                    </motion.div>
                  ) : (
                    <motion.div
                      key="waiting"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="flex flex-col items-center gap-1 py-2"
                    >
                      <div className={cn('w-8 h-8 rounded-full flex items-center justify-center bg-gray-100 dark:bg-gray-800')}>
                        <Download className="w-4 h-4 text-gray-400 dark:text-gray-500" />
                      </div>
                      <span className={cn('text-[10px] font-medium', TOKENS.inkMuted)}>
                        Waiting for transfer
                      </span>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>
          </LaptopFrame>
          <div className={cn('mt-3 text-[11px] sm:text-[12px] font-medium', TOKENS.inkMuted)}>
            Your laptop
          </div>
        </div>
      </div>
      
      {/* === CONTROLS === */}
      <div className="mt-6 flex flex-col items-center gap-4">
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
                'flex items-center gap-2 px-4 py-2 rounded-full text-[12px] sm:text-[13px] font-medium transition-all',
                'focus-visible:outline-2 focus-visible:outline-offset-2',
                TOKENS.focus,
                TOKENS.blueSoft,
                TOKENS.blueText,
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
                'flex items-center gap-2 px-4 py-2 rounded-full text-[12px] sm:text-[13px] font-medium transition-all',
                'focus-visible:outline-2 focus-visible:outline-offset-2',
                TOKENS.focus,
                'bg-gray-100 dark:bg-gray-800',
                TOKENS.inkMuted,
                'hover:bg-gray-200 dark:hover:bg-gray-700'
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
                'flex items-center gap-2 px-4 py-2 rounded-full text-[12px] sm:text-[13px] font-medium transition-all',
                'focus-visible:outline-2 focus-visible:outline-offset-2',
                TOKENS.focus,
                TOKENS.blue,
                'text-white',
                'hover:shadow-lg',
                'hover:translate-y-[-1px]'
              )}
              data-testid="hero-demo-play"
              aria-label="Play transfer demo"
            >
              <Play className="w-4 h-4" />
              Play
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
