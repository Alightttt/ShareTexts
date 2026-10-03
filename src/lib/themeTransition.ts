/**
 * Theme changes get one cross-fade — where the browser can actually do it.
 *
 * The feel we want: the old theme dissolves and the new one arrives already
 * sharp. That is a View Transition, not a "fade the whole app for 500ms"
 * overlay: the browser freezes a snapshot of the outgoing page, runs the
 * DOM change underneath, then composites the two. Cost: one snapshot, no
 * per-element transitions (which is exactly what used to make theme
 * switching feel sticky — hundreds of nodes each tweening color).
 *
 * Rules this file obeys, in order:
 *
 *   1. NEVER SLOWER THAN INSTANT. If anything is off — no View Transitions
 *      (Firefox today), reduced-motion, a background tab, a transition
 *      already running — the theme flips right now with no animation. There
 *      is no code path where a theme change waits on an animation.
 *   2. CHEAP ON WEAK DEVICES. Blur is the expensive half of the effect, so
 *      low-memory / few-core devices get a shorter, lighter cross-fade
 *      (4px, 240ms) instead of the desktop one (7px, 320ms).
 *   3. ONE AT A TIME. A second toggle during a transition applies instantly
 *      instead of throwing InvalidStateError or queueing frames.
 *   4. THE NEW THEME IS CRISP. Only the OUTGOING snapshot blurs (see the
 *      keyframes in index.css) — blurring both leaves the arriving theme
 *      soft for the whole transition, which is the opposite of the point.
 *
 * The duration/blur are passed as custom properties on <html>, so the CSS
 * is static: no <style> element is created per switch.
 */
import { flushSync } from 'react-dom';

/** Marks <html> while a theme cross-fade is on screen (drives the CSS). */
const VT_ATTR = 'st-theme-vt';

type WithViewTransition = Document & {
  startViewTransition?: (cb: () => void) => { finished?: Promise<void> } | undefined;
};

function canTransition(): boolean {
  if (typeof document === 'undefined' || typeof window === 'undefined') return false;
  const doc = document as WithViewTransition;
  if (typeof doc.startViewTransition !== 'function') return false;
  if (document.hidden) return false;
  if (document.documentElement.hasAttribute(VT_ATTR)) return false; // already running
  try {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return false;
  } catch {
    /* no matchMedia: assume motion is fine */
  }
  return true;
}

function isLowPower(): boolean {
  const nav = navigator as Navigator & { deviceMemory?: number };
  const memory = typeof nav.deviceMemory === 'number' ? nav.deviceMemory : 8;
  const cores = typeof nav.hardwareConcurrency === 'number' ? nav.hardwareConcurrency : 8;
  return memory <= 4 || cores <= 4;
}

/**
 * Run `apply` (the actual DOM flip) inside a View Transition when that is a
 * safe, fast thing to do; otherwise run it immediately.
 *
 * `apply` must be synchronous and must not throw — it is called inside
 * flushSync, where React will surface a thrown error by failing the update.
 */
export function runThemeTransition(apply: () => void) {
  if (!canTransition()) {
    apply();
    return;
  }
  const root = document.documentElement;
  const lowPower = isLowPower();
  const duration = lowPower ? 240 : 320;
  root.style.setProperty('--st-vt-dur', `${duration}ms`);
  root.style.setProperty('--st-vt-blur', lowPower ? '4px' : '7px');
  root.setAttribute(VT_ATTR, '');

  let done = false;
  let backstop = 0;
  const clear = () => {
    if (done) return;
    done = true;
    window.clearTimeout(backstop);
    root.removeAttribute(VT_ATTR);
  };

  try {
    const transition = (document as WithViewTransition).startViewTransition!(() => {
      flushSync(() => apply());
    });
    // `finished` is the honest signal, but it never resolves for a
    // transition the browser cancels mid-flight — so a backstop clears the
    // attribute regardless. The attribute only drives CSS, so a late clear
    // costs nothing.
    backstop = window.setTimeout(clear, duration + 400);
    if (transition && transition.finished) {
      transition.finished.then(clear, clear);
    } else {
      clear();
    }
  } catch {
    // A racing transition, a detached document, an ancient engine: the
    // theme still changes, it just does not animate.
    clear();
    apply();
  }
}
