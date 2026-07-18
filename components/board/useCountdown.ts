'use client';

// ============================================================================
// BOARD lane — time + motion primitives.
// One shared interval drives every countdown on screen. A board with 20 cards
// should not own 20 timers; that is how a booth kiosk starts dropping frames.
// ============================================================================

import { useEffect, useState } from 'react';
import { fmtCountdown, msUntil } from '@/lib/types';

type Listener = (t: number) => void;

const listeners = new Set<Listener>();
let timer: ReturnType<typeof setInterval> | null = null;

const TICK_MS = 250;

function subscribe(fn: Listener): () => void {
  listeners.add(fn);
  if (timer === null) {
    timer = setInterval(() => {
      const t = Date.now();
      for (const l of listeners) l(t);
    }, TICK_MS);
  }
  return () => {
    listeners.delete(fn);
    if (listeners.size === 0 && timer !== null) {
      clearInterval(timer);
      timer = null;
    }
  };
}

/**
 * Wall clock, shared ticker. `null` until mounted so server and client render
 * the same markup — countdowns are inherently non-deterministic on the server.
 */
export function useNow(): number | null {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    return subscribe(setNow);
  }, []);
  return now;
}

export interface Countdown {
  /** ms remaining, clamped at 0. `null` before mount. */
  ms: number | null;
  /** "4:07", or "—:—" before mount. */
  label: string;
  /** Under 30s and still running. */
  urgent: boolean;
  /** Hit zero — the reference check is in progress. */
  done: boolean;
}

/** Countdown to an ISO timestamp, driven by the shared ticker. */
export function useCountdown(iso: string, urgentMs = 30_000): Countdown {
  const now = useNow();
  if (now === null) {
    return { ms: null, label: '—:—', urgent: false, done: false };
  }
  const raw = new Date(iso).getTime() - now;
  const ms = Math.max(0, raw);
  return {
    ms,
    label: fmtCountdown(ms),
    urgent: ms > 0 && ms <= urgentMs,
    done: ms <= 0,
  };
}

/** Soonest expiry across a set of ISO timestamps, in ms. `null` if none. */
export function nextExpiryMs(isos: string[]): number | null {
  let best: number | null = null;
  for (const iso of isos) {
    const ms = msUntil(iso);
    if (ms <= 0) continue;
    if (best === null || ms < best) best = ms;
  }
  return best;
}

/** True when the viewer asked for less motion. Number tweens must respect it. */
export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const sync = () => setReduced(mq.matches);
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);
  return reduced;
}
