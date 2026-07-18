'use client';

// ============================================================================
// BOARD lane — time + motion primitives.
//
// Both hooks here read *browser* state (the wall clock, a media query), which
// makes them textbook `useSyncExternalStore` cases rather than effect+setState.
// One shared interval drives every countdown on screen: a board with 20 cards
// should not own 20 timers, which is how a booth kiosk starts dropping frames.
// ============================================================================

import { useSyncExternalStore } from 'react';
import { fmtCountdown, msUntil } from '@/lib/types';

const TICK_MS = 250;

let currentTick = 0;
let timer: ReturnType<typeof setInterval> | null = null;
const tickListeners = new Set<() => void>();

function subscribeTick(onChange: () => void): () => void {
  tickListeners.add(onChange);
  if (timer === null) {
    currentTick = Date.now();
    timer = setInterval(() => {
      currentTick = Date.now();
      for (const l of tickListeners) l();
    }, TICK_MS);
  }
  return () => {
    tickListeners.delete(onChange);
    if (tickListeners.size === 0 && timer !== null) {
      clearInterval(timer);
      timer = null;
    }
  };
}

// `currentTick` stays 0 until something subscribes, which is exactly when we
// want to report "not mounted yet".
const getTick = (): number | null => (currentTick === 0 ? null : currentTick);
const getServerTick = (): number | null => null;

/**
 * Wall clock, shared ticker. `null` until mounted so server and client render
 * identical markup — countdowns are inherently non-deterministic on the server.
 */
export function useNow(): number | null {
  return useSyncExternalStore(subscribeTick, getTick, getServerTick);
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
  const ms = Math.max(0, new Date(iso).getTime() - now);
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

// --- reduced motion ---------------------------------------------------------

const REDUCED_QUERY = '(prefers-reduced-motion: reduce)';
let mql: MediaQueryList | null = null;

function reducedMql(): MediaQueryList | null {
  if (mql === null && typeof window !== 'undefined') {
    mql = window.matchMedia(REDUCED_QUERY);
  }
  return mql;
}

function subscribeMotion(onChange: () => void): () => void {
  const m = reducedMql();
  if (m === null) return () => {};
  m.addEventListener('change', onChange);
  return () => m.removeEventListener('change', onChange);
}

const getMotion = (): boolean => reducedMql()?.matches ?? false;
const getServerMotion = (): boolean => false;

/** True when the viewer asked for less motion. Number tweens must respect it. */
export function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(subscribeMotion, getMotion, getServerMotion);
}
