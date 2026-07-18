'use client';

// ============================================================================
// BOARD lane — in-memory odds history.
//
// We never query `trades` for this. The board only needs the shape of the last
// minute or two of movement, and every client already receives each new
// prob_yes_bps over realtime. So we simply remember what we have been told.
//
// The store lives at module scope so history survives a card unmounting
// (scroll virtualization, tab switches, /board and / sharing a tab) instead of
// resetting the sparkline to a single flat point.
//
// Both hooks below accumulate *derived* state as props change, so they use
// React's documented "adjust state during render" pattern rather than an
// effect. Every store write they make is idempotent for a given render input,
// which is what makes that safe under StrictMode's double render.
// ============================================================================

import { useState } from 'react';
import type { MarketPublic } from '@/lib/types';

export interface OddsPoint {
  bps: number;
  t: number;
}

/** Keep the last ~40 points. Enough to read a trend, cheap to render. */
export const MAX_POINTS = 40;

const store = new Map<string, OddsPoint[]>();

export function getOddsHistory(marketId: string): OddsPoint[] {
  return store.get(marketId) ?? [];
}

/** Create the series if we have never seen this market. Idempotent. */
export function seedOddsHistory(marketId: string, bps: number): OddsPoint[] {
  const existing = store.get(marketId);
  if (existing && existing.length > 0) return existing;
  const seeded: OddsPoint[] = [{ bps, t: Date.now() }];
  store.set(marketId, seeded);
  return seeded;
}

/**
 * Append a point, but only when the value actually moved. Calling this twice
 * with the same value is a no-op that returns the identical array reference.
 */
export function recordOdds(
  marketId: string,
  bps: number,
  max = MAX_POINTS,
): OddsPoint[] {
  const current = store.get(marketId) ?? [];
  const last = current[current.length - 1];
  if (last && last.bps === bps) return current;
  const next = [...current, { bps, t: Date.now() }].slice(-max);
  store.set(marketId, next);
  return next;
}

/** Wipe history — for `reset_game`, or a market that resolved and left. */
export function resetOddsHistory(marketId?: string): void {
  if (marketId === undefined) store.clear();
  else store.delete(marketId);
}

export interface UseOddsHistory {
  /** Oldest → newest, at most `max` points. */
  history: OddsPoint[];
  /** Direction of the most recent move. */
  dir: 'up' | 'down' | null;
  /** bps change of the most recent move (signed). */
  delta: number;
  /** Net bps change across the whole retained window (signed). */
  netDelta: number;
  /**
   * Increments on every observed move. Use as a React `key` to retrigger a
   * CSS animation — restarting `.flash-up` reliably needs a fresh element.
   */
  ticks: number;
}

/**
 * Accumulate odds history for one market. Seeded with the current value on
 * mount so a brand-new card still draws a line rather than nothing.
 */
export function useOddsHistory(
  marketId: string,
  bps: number,
  max = MAX_POINTS,
): UseOddsHistory {
  const [history, setHistory] = useState<OddsPoint[]>(() =>
    seedOddsHistory(marketId, bps),
  );
  const [ticks, setTicks] = useState(0);
  const [seen, setSeen] = useState<{ id: string; bps: number }>({
    id: marketId,
    bps,
  });

  if (seen.id !== marketId || seen.bps !== bps) {
    // Swapping which market this card renders is not a price move.
    const sameMarket = seen.id === marketId;
    setSeen({ id: marketId, bps });
    setHistory(recordOdds(marketId, bps, max));
    if (sameMarket) setTicks((n) => n + 1);
  }

  const last = history[history.length - 1];
  const prev = history[history.length - 2];
  const first = history[0];
  const delta = last && prev ? last.bps - prev.bps : 0;
  const netDelta = last && first ? last.bps - first.bps : 0;

  return {
    history,
    dir: delta > 0 ? 'up' : delta < 0 ? 'down' : null,
    delta,
    netDelta,
    ticks,
  };
}

// --- Board-wide move feed (drives the big-screen ticker) --------------------

export interface OddsMove {
  /** Stable, unique React key. */
  key: string;
  marketId: string;
  title: string;
  from: number;
  to: number;
  /** Signed bps change. */
  delta: number;
}

interface Feed {
  moves: OddsMove[];
  /** Monotonic counter, kept in state so move keys stay deterministic. */
  seq: number;
  /** Last prob_yes_bps we observed per market. */
  seen: Record<string, number>;
}

function snapshotBps(markets: MarketPublic[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const m of markets) out[m.id] = m.prob_yes_bps;
  return out;
}

/**
 * Watch a whole market list and emit a newest-first log of price moves.
 * Purely observational — no fetching, no subscriptions of its own.
 */
export function useRecentMoves(markets: MarketPublic[], max = 24): OddsMove[] {
  const [feed, setFeed] = useState<Feed>(() => ({
    moves: [],
    seq: 0,
    seen: snapshotBps(markets),
  }));

  const fresh: OddsMove[] = [];
  let sawNewMarket = false;

  for (const m of markets) {
    const before = feed.seen[m.id];
    if (before === undefined) {
      sawNewMarket = true;
      continue;
    }
    if (before === m.prob_yes_bps) continue;
    fresh.push({
      key: `${m.id}:${feed.seq + fresh.length}`,
      marketId: m.id,
      title: m.title,
      from: before,
      to: m.prob_yes_bps,
      delta: m.prob_yes_bps - before,
    });
  }

  if (fresh.length > 0 || sawNewMarket) {
    // Replacement (not an updater) so a double render produces the same list
    // rather than appending the same moves twice.
    setFeed({
      moves:
        fresh.length > 0
          ? [...[...fresh].reverse(), ...feed.moves].slice(0, max)
          : feed.moves,
      seq: feed.seq + fresh.length,
      seen: snapshotBps(markets),
    });
  }

  return feed.moves;
}
