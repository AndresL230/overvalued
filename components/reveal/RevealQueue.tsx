'use client';

import { useCallback, useState } from 'react';
import type { MarketPublic } from '@/lib/types';
import { RevealModal } from './RevealModal';

export interface PendingReveal {
  /** status 'resolved', is_real non-null */
  market: MarketPublic;
  /** this player's position pre-wipe */
  heldBefore?: { yes: number; no: number };
}

export interface RevealQueueProps {
  pending: PendingReveal[];
  /** Called when a reveal finishes playing, so the caller can drop it. */
  onDone: (marketId: string) => void;
  /** Per-reveal run time. Defaults to 4200ms. */
  revealMs?: number;
}

/**
 * Several markets can resolve inside the same 2s poll tick. Stacking modals
 * would be a mess, so we play them strictly one at a time.
 *
 * We keep our own record of what has already played: the parent may not drop
 * an entry from `pending` immediately after onDone, and we must never replay
 * the same reveal.
 */
export function RevealQueue({
  pending,
  onDone,
  revealMs = 4200,
}: RevealQueueProps) {
  const [played, setPlayed] = useState<ReadonlySet<string>>(
    () => new Set<string>(),
  );

  // Everything not yet played, in arrival order. The head of this queue IS the
  // reveal on stage — derived during render, so there is no effect to sync and
  // no window where two modals can be mounted at once.
  const queue = pending.filter((p) => !played.has(p.market.id));
  const active = queue[0] ?? null;
  const activeId = active?.market.id ?? null;

  // Must be referentially stable for a given market, and so must sit above the
  // early return. RevealModal drives its phase timers from an effect keyed on
  // this callback, so a fresh identity every render clears and restarts them —
  // the reveal then sits on "CHECKING REFERENCES…" forever. That is invisible
  // while the page rarely re-renders, and instant once anything ticks above it.
  const handleDone = useCallback(() => {
    if (!activeId) return;
    setPlayed((prev) => {
      if (prev.has(activeId)) return prev;
      const next = new Set(prev);
      next.add(activeId);
      return next;
    });
    onDone(activeId);
  }, [activeId, onDone]);

  if (!active) return null;

  return (
    <RevealModal
      key={active.market.id}
      market={active.market}
      heldBefore={active.heldBefore}
      onDone={handleDone}
      durationMs={revealMs}
      queuedBehind={Math.max(0, queue.length - 1)}
    />
  );
}

export default RevealQueue;
