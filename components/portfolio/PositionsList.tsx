'use client';

import { useEffect, useMemo, useState } from 'react';
import type { MarketPublic, Position, Trade } from '@/lib/types';
import { PositionRow } from './PositionRow';

// ---------------------------------------------------------------------------
// Every open position, soonest reference check first.
// One clock lives here and drives all rows.
// ---------------------------------------------------------------------------

/** Single shared 1s clock so N rows don't spin N intervals. */
function useNow(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  return now;
}

export interface PositionsListProps {
  positions: Position[];
  /** Markets to resolve titles and live prices against. Owned by Phase C. */
  markets: MarketPublic[];
  /** This player's trades, for cost basis. */
  trades: Trade[];
  /** Optional nudge action for the empty state. */
  onGoTrade?: () => void;
  loading?: boolean;
  className?: string;
}

export function PositionsList({
  positions,
  markets,
  trades,
  onGoTrade,
  loading = false,
  className = '',
}: PositionsListProps) {
  const now = useNow();

  const rows = useMemo(() => {
    const byId = new Map(markets.map((m) => [m.id, m]));
    return positions
      .filter((p) => p.yes > 0 || p.no > 0)
      .map((p) => ({ position: p, market: byId.get(p.market_id) }))
      .filter(
        (r): r is { position: Position; market: MarketPublic } =>
          r.market !== undefined && r.market.status === 'active',
      )
      .sort(
        (a, b) =>
          new Date(a.market.expires_at).getTime() -
          new Date(b.market.expires_at).getTime(),
      );
  }, [positions, markets]);

  return (
    <section className={className} aria-label="Open positions">
      <div className="mb-2 flex items-baseline justify-between px-1">
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">
          Open positions
        </h2>
        {rows.length > 0 && (
          <span className="tnum text-[11px] text-muted">{rows.length}</span>
        )}
      </div>

      {loading && rows.length === 0 ? (
        <div className="flex flex-col gap-2" aria-busy="true">
          {[0, 1].map((i) => (
            <div
              key={i}
              className="h-24 animate-pulse rounded-xl border border-line bg-surface"
            />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-line bg-surface px-4 py-8 text-center">
          <p className="text-base font-semibold text-fg">You own nothing.</p>
          <p className="mt-0.5 text-base font-semibold text-muted">Bold strategy.</p>
          <p className="mx-auto mt-3 max-w-[34ch] text-xs leading-relaxed text-muted">
            Cash sitting still never called anyone&apos;s bluff. Find a startup that
            smells fake and take the other side.
          </p>
          {onGoTrade && (
            <button
              type="button"
              onClick={onGoTrade}
              className="mt-4 min-h-11 w-full rounded-lg bg-gold px-4 py-2.5 text-sm font-bold text-ink transition active:scale-[0.98]"
            >
              Go find a market
            </button>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {rows.map(({ position, market }) => (
            <PositionRow
              key={`${position.player_id}:${position.market_id}`}
              position={position}
              market={market}
              trades={trades}
              nowMs={now}
            />
          ))}
        </div>
      )}
    </section>
  );
}

export default PositionsList;
