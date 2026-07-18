'use client';

import { useEffect, useRef, useState } from 'react';
import { STARTING_CASH, fmtCents, type Player } from '@/lib/types';

// ---------------------------------------------------------------------------
// The money headline, as the exchange's `.portfolio-summary` strip: three
// hairline-divided cells under the modal head. The stylesheet drops to two
// columns below 820px and hides the last cell, so unrealized P&L goes there —
// it is the one number every position row repeats anyway.
// ---------------------------------------------------------------------------

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** Tween an integer-cents value toward `target`. Always lands exactly on it. */
function useTweenedCents(target: number, durationMs = 560): number {
  const [display, setDisplay] = useState(target);
  const fromRef = useRef(target);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (fromRef.current === target) return;

    const from = fromRef.current;
    const start = performance.now();
    // Reduced motion: duration 0 snaps on the very first frame.
    const dur = prefersReducedMotion() ? 0 : durationMs;

    const tick = (t: number) => {
      const p = dur <= 0 ? 1 : Math.min(1, (t - start) / dur);
      const eased = 1 - Math.pow(1 - p, 3); // easeOutCubic
      const v = p < 1 ? Math.round(from + (target - from) * eased) : target;
      fromRef.current = v;
      setDisplay(v);
      if (p < 1) rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [target, durationMs]);

  return display;
}

export interface CashHeaderProps {
  player: Player;
  /** Mark-to-market P&L of all open positions, in cents. Optional. */
  unrealizedCents?: number;
  /** Current market value of all open positions, in cents. Optional. */
  openMarkCents?: number;
  className?: string;
}

export function CashHeader({
  player,
  unrealizedCents,
  openMarkCents,
  className = '',
}: CashHeaderProps) {
  const cash = player.cash;
  const shown = useTweenedCents(cash);

  // Flash green/red on change. Driven straight at the DOM — this is a visual
  // side effect, not state React needs to know about.
  const flashRef = useRef<HTMLDivElement>(null);
  const prevCash = useRef(cash);
  useEffect(() => {
    const prev = prevCash.current;
    if (prev === cash) return;
    prevCash.current = cash;
    const el = flashRef.current;
    if (!el) return;
    const cls = cash > prev ? 'flash-up' : 'flash-down';
    el.classList.remove('flash-up', 'flash-down');
    void el.offsetWidth; // force reflow so the animation restarts
    el.classList.add(cls);
  }, [cash]);

  const delta = cash - STARTING_CASH;
  const up = delta >= 0;
  const pct = (delta / STARTING_CASH) * 100;
  const pctLabel = `${up ? '+' : ''}${pct.toFixed(1)}%`;

  const unrealized = unrealizedCents ?? 0;
  const unrealizedTone =
    unrealized === 0 ? '' : unrealized > 0 ? 'positive' : 'negative';

  return (
    <div className={`portfolio-summary ${className}`} aria-label="Your cash">
      <div ref={flashRef}>
        <span>CASH ON HAND · {pctLabel}</span>
        <strong className="tnum">{fmtCents(shown)}</strong>
      </div>

      <div>
        <span>ON THE TABLE</span>
        <strong className="tnum">{fmtCents(openMarkCents ?? 0)}</strong>
      </div>

      <div>
        <span>UNREALIZED</span>
        <strong className={`tnum ${unrealizedTone}`}>
          {unrealized === 0 ? '' : unrealized > 0 ? '+' : '−'}
          {fmtCents(Math.abs(unrealized))}
        </strong>
      </div>
    </div>
  );
}

export default CashHeader;
