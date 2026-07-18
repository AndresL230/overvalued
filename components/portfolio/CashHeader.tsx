'use client';

import { useEffect, useRef, useState } from 'react';
import { STARTING_CASH, fmtCents, type Player } from '@/lib/types';

// ---------------------------------------------------------------------------
// The money headline. Big gold number + the journey from $100.
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
  const deltaTone = delta === 0 ? 'text-muted' : up ? 'text-yes' : 'text-no';

  return (
    <section
      className={`rounded-2xl border border-line bg-surface p-4 ${className}`}
      aria-label="Your cash"
    >
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">
          Cash on hand
        </span>
        <span className="truncate text-xs text-muted">@{player.handle}</span>
      </div>

      <div ref={flashRef} className="mt-1 -mx-1 rounded-lg px-1">
        <div className="tnum text-gold text-5xl font-bold leading-none tracking-tight tabular-nums">
          {fmtCents(shown)}
        </div>
      </div>

      {/* the journey from $100 */}
      <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
        <span className="tnum text-muted">{fmtCents(STARTING_CASH)}</span>
        <span aria-hidden className="text-line">→</span>
        <span className="tnum text-fg">{fmtCents(cash)}</span>
        <span
          className={`tnum ml-auto rounded-md px-2 py-0.5 text-sm font-semibold ${deltaTone} ${
            delta === 0 ? 'bg-surface-2' : up ? 'bg-yes/10' : 'bg-no/10'
          }`}
        >
          {up ? '+' : '−'}
          {fmtCents(Math.abs(delta))} <span className="opacity-70">{pctLabel}</span>
        </span>
      </div>

      {typeof openMarkCents === 'number' && openMarkCents > 0 && (
        <div className="mt-3 flex items-center justify-between border-t border-line pt-3 text-xs">
          <span className="text-muted">On the table</span>
          <span className="tnum text-fg">
            {fmtCents(openMarkCents)}
            {typeof unrealizedCents === 'number' && unrealizedCents !== 0 && (
              <span className={unrealizedCents > 0 ? 'text-yes ml-2' : 'text-no ml-2'}>
                {unrealizedCents > 0 ? '+' : '−'}
                {fmtCents(Math.abs(unrealizedCents))}
              </span>
            )}
          </span>
        </div>
      )}
    </section>
  );
}

export default CashHeader;
