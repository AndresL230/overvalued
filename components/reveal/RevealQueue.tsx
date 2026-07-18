'use client';

import { useState } from 'react';
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

  if (!active) return null;

  const handleDone = () => {
    const id = active.market.id;
    setPlayed((prev) => {
      const next = new Set(prev);
      next.add(id);
      return next;
    });
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
