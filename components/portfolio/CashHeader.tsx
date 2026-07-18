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

    if (prefersReducedMotion()) {
      fromRef.current = target;
      setDisplay(target);
      return;
    }

    const from = fromRef.current;
    const start = performance.now();

    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / durationMs);
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

  // Re-key a wrapper on every change so the flash animation restarts.
  const [flash, setFlash] = useState<{ dir: 'up' | 'down' | null; n: number }>({
    dir: null,
    n: 0,
  });
  const prevCash = useRef(cash);
  useEffect(() => {
    if (prevCash.current === cash) return;
    const dir = cash > prevCash.current ? 'up' : 'down';
    prevCash.current = cash;
    setFlash((f) => ({ dir, n: f.n + 1 }));
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

      <div
        key={flash.n}
        className={`mt-1 -mx-1 rounded-lg px-1 ${
          flash.dir === 'up' ? 'flash-up' : flash.dir === 'down' ? 'flash-down' : ''
        }`}
      >
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
