'use client';

// ============================================================================
// BOARD lane — the big number, counting to its new value.
// A jump from 51% to 63% should read as travel, not teleportation; that is the
// whole feeling of the board. Interrupted tweens resume from wherever the
// digits currently are so rapid-fire trades stay continuous.
// ============================================================================

import { useEffect, useRef, useState } from 'react';
import { fmtBps } from '@/lib/types';
import { usePrefersReducedMotion } from './useCountdown';

export interface OddsNumberProps {
  bps: number;
  durationMs?: number;
  className?: string;
}

const easeOutCubic = (p: number) => 1 - Math.pow(1 - p, 3);

export function OddsNumber({
  bps,
  durationMs = 460,
  className = '',
}: OddsNumberProps) {
  const reduced = usePrefersReducedMotion();
  const [display, setDisplay] = useState(bps);
  const currentRef = useRef(bps);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    // Under reduced motion we render `bps` directly, so there is nothing to
    // tween — just keep the ref honest in case the preference flips back.
    if (reduced) {
      currentRef.current = bps;
      return;
    }

    const from = currentRef.current;
    const to = bps;
    if (from === to) return;

    const start = performance.now();
    const step = (now: number) => {
      const p = Math.min(1, (now - start) / durationMs);
      const v = from + (to - from) * easeOutCubic(p);
      currentRef.current = v;
      setDisplay(v);
      if (p < 1) {
        rafRef.current = requestAnimationFrame(step);
      } else {
        currentRef.current = to;
        rafRef.current = null;
      }
    };
    rafRef.current = requestAnimationFrame(step);

    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    };
  }, [bps, durationMs, reduced]);

  return (
    <span className={`tnum ${className}`} suppressHydrationWarning>
      {fmtBps(reduced ? bps : display)}
    </span>
  );
}

export default OddsNumber;
