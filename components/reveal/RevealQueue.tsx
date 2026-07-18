'use client';

import { useEffect, useRef, useState } from 'react';
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
  const [activeId, setActiveId] = useState<string | null>(null);
  const playedRef = useRef<Set<string>>(new Set());

  // Everything not yet played, in arrival order.
  const queue = pending.filter((p) => !playedRef.current.has(p.market.id));

  // Pull the next one off the front whenever the stage is free.
  useEffect(() => {
    if (activeId !== null) return;
    const next = queue[0];
    if (next) setActiveId(next.market.id);
  }, [activeId, queue]);

  // The entry currently on stage. If the parent yanked it from `pending`
  // mid-play, fall through to null and the effect above picks up the next.
  const active = activeId
    ? (pending.find((p) => p.market.id === activeId) ?? null)
    : null;

  useEffect(() => {
    if (activeId !== null && active === null) setActiveId(null);
  }, [activeId, active]);

  if (!active) return null;

  const handleDone = () => {
    const id = active.market.id;
    playedRef.current.add(id);
    setActiveId(null);
    onDone(id);
  };

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
