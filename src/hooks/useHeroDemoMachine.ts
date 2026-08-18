import { useState, useCallback, useEffect, useRef } from 'react';

/**
 * Demo scenario types — what content is being "transferred"
 */
export type DemoScenario = 'note' | 'link' | 'photo' | 'file';

/**
 * Demo states — the finite state machine
 */
export type DemoState =
  | 'idle'        // Both devices visible, waiting to start
  | 'pairing'     // Code appears, bridge draws itself
  | 'ready'       // Connected, blue path active
  | 'sending'     // Content lifts from sender
  | 'traveling'   // Packet moves along bridge
  | 'received'    // Receiver shows result
  | 'paused'      // User paused the demo
  | 'reduced-motion'; // Static composition for a11y

/**
 * Scenario content definitions
 */
export const SCENARIOS: Record<DemoScenario, {
  label: string;
  senderPreview: string;
  receiverAction: string;
  size?: string;
}> = {
  note: {
    label: 'Note',
    senderPreview: 'Build is passing.',
    receiverAction: 'Copy',
  },
  link: {
    label: 'Link',
    senderPreview: 'share-texts.vercel.app',
    receiverAction: 'Open',
  },
  photo: {
    label: 'Photo',
    senderPreview: 'photo.jpg',
    receiverAction: 'Download',
    size: '18.4 MB',
  },
  file: {
    label: 'File',
    senderPreview: 'project.zip',
    receiverAction: 'Download',
    size: '184 MB',
  },
};

/**
 * Step labels for the progress rail
 */
export const STEPS = ['pair', 'connect', 'send', 'travel', 'arrive'] as const;
export type StepIndex = 0 | 1 | 2 | 3 | 4;

/**
 * State durations in milliseconds
 */
const DURATIONS = {
  idle: 1200,
  pairing: 1500,
  ready: 1000,
  sending: 1400,
  traveling: 2200,
  received: 3000, // Stay on received for 3 seconds before looping
} as const;

/**
 * Maps demo state to progress rail step index
 */
function stateToStep(state: DemoState): StepIndex {
  switch (state) {
    case 'idle': return 0;
    case 'pairing': return 0;
    case 'ready': return 1;
    case 'sending': return 2;
    case 'traveling': return 3;
    case 'received': return 4;
    default: return 0;
  }
}

/**
 * Get next state in the sequence
 */
function nextState(current: DemoState): DemoState {
  switch (current) {
    case 'idle': return 'pairing';
    case 'pairing': return 'ready';
    case 'ready': return 'sending';
    case 'sending': return 'traveling';
    case 'traveling': return 'received';
    case 'received': return 'idle';
    default: return 'idle';
  }
}

/**
 * Hook interface
 */
export interface UseHeroDemoMachine {
  scenario: DemoScenario;
  state: DemoState;
  progress: number; // 0..1 for current state
  step: StepIndex;
  isPlaying: boolean;
  isReducedMotion: boolean;
  play: () => void;
  pause: () => void;
  replay: () => void;
  chooseScenario: (scenario: DemoScenario) => void;
  goToStep: (step: StepIndex) => void;
}

/**
 * Custom hook for the LiveBridgeDemo state machine
 */
export function useHeroDemoMachine(): UseHeroDemoMachine {
  const [scenario, setScenario] = useState<DemoScenario>('photo');
  const [state, setState] = useState<DemoState>('idle');
  const [isPlaying, setIsPlaying] = useState(false);
  const [isReducedMotion, setIsReducedMotion] = useState(false);
  const [progress, setProgress] = useState(0);
  
  const stateRef = useRef(state);
  const isPlayingRef = useRef(isPlaying);
  const scenarioRef = useRef(scenario);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const progressIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  
  // Keep refs in sync
  stateRef.current = state;
  isPlayingRef.current = isPlaying;
  scenarioRef.current = scenario;
  
  // Detect reduced motion preference
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setIsReducedMotion(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);
  
  // Clear timers on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      if (progressIntervalRef.current) clearInterval(progressIntervalRef.current);
    };
  }, []);
  
  // Start progress animation for current state
  const startProgress = useCallback((stateName: DemoState) => {
    if (progressIntervalRef.current) {
      clearInterval(progressIntervalRef.current);
    }
    
    const duration = DURATIONS[stateName as keyof typeof DURATIONS] || 1000;
    const startTime = Date.now();
    
    progressIntervalRef.current = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const newProgress = Math.min(elapsed / duration, 1);
      setProgress(newProgress);
      
      if (newProgress >= 1) {
        clearInterval(progressIntervalRef.current!);
      }
    }, 16); // ~60fps
  }, []);
  
  // Advance to next state
  const advance = useCallback(() => {
    if (!isPlayingRef.current) return;
    
    const current = stateRef.current;
    const next = nextState(current);
    
    // If we completed a cycle, stay on received briefly then reset
    if (current === 'received') {
      setState('idle');
      setProgress(0);
      
      // Auto-play after idle
      timerRef.current = setTimeout(() => {
        if (isPlayingRef.current) {
          setState('pairing');
          startProgress('pairing');
          timerRef.current = setTimeout(advance, DURATIONS.pairing);
        }
      }, DURATIONS.idle);
      return;
    }
    
    setState(next);
    setProgress(0);
    
    if (isReducedMotion) {
      // In reduced motion, skip to next state immediately
      timerRef.current = setTimeout(advance, 50);
      return;
    }
    
    startProgress(next);
    
    // Schedule next advance
    const duration = DURATIONS[next as keyof typeof DURATIONS] || 1000;
    timerRef.current = setTimeout(advance, duration);
  }, [isReducedMotion, startProgress]);
  
  // Play the demo
  const play = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (progressIntervalRef.current) clearInterval(progressIntervalRef.current);
    
    setIsPlaying(true);
    
    // If we're at idle or received, start from pairing
    if (stateRef.current === 'idle' || stateRef.current === 'received' || stateRef.current === 'paused') {
      setState('pairing');
      setProgress(0);
      startProgress('pairing');
      timerRef.current = setTimeout(advance, DURATIONS.pairing);
    } else {
      // Resume from current state
      startProgress(stateRef.current);
      const duration = DURATIONS[stateRef.current as keyof typeof DURATIONS] || 1000;
      timerRef.current = setTimeout(advance, duration * (1 - progress));
    }
  }, [advance, startProgress, progress]);
  
  // Pause the demo
  const pause = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (progressIntervalRef.current) clearInterval(progressIntervalRef.current);
    
    setIsPlaying(false);
    setState('paused');
  }, []);
  
  // Replay from the beginning
  const replay = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (progressIntervalRef.current) clearInterval(progressIntervalRef.current);
    
    setState('idle');
    setProgress(0);
    setIsPlaying(true);
    
    // Start from pairing after a brief pause
    timerRef.current = setTimeout(() => {
      setState('pairing');
      startProgress('pairing');
      timerRef.current = setTimeout(advance, DURATIONS.pairing);
    }, 300);
  }, [advance, startProgress]);
  
  // Choose a scenario
  const chooseScenario = useCallback((newScenario: DemoScenario) => {
    setScenario(newScenario);
    
    // If playing, restart with new scenario
    if (isPlayingRef.current) {
      replay();
    }
  }, [replay]);
  
  // Go to a specific step (for progress rail clicks)
  const goToStep = useCallback((targetStep: StepIndex) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (progressIntervalRef.current) clearInterval(progressIntervalRef.current);
    
    // Map step to state
    const stateMap: Record<StepIndex, DemoState> = {
      0: 'pairing',
      1: 'ready',
      2: 'sending',
      3: 'traveling',
      4: 'received',
    };
    
    const newState = stateMap[targetStep];
    setState(newState);
    setProgress(0);
    setIsPlaying(true);
    
    startProgress(newState);
    const duration = DURATIONS[newState as keyof typeof DURATIONS] || 1000;
    timerRef.current = setTimeout(advance, duration);
  }, [advance, startProgress]);
  
  // Auto-start on mount (unless reduced motion)
  useEffect(() => {
    if (isReducedMotion) {
      setState('ready');
      return;
    }
    
    const timer = setTimeout(() => {
      play();
    }, 1000);
    
    return () => clearTimeout(timer);
  }, [isReducedMotion, play]);
  
  // Pause on hover/focus for accessibility
  useEffect(() => {
    const handleVisibility = () => {
      if (document.hidden && isPlayingRef.current) {
        pause();
      }
    };
    
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, [pause]);
  
  return {
    scenario,
    state: isReducedMotion ? 'reduced-motion' : state,
    progress,
    step: stateToStep(state),
    isPlaying,
    isReducedMotion,
    play,
    pause,
    replay,
    chooseScenario,
    goToStep,
  };
}
