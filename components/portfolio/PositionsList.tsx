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

  if (loading && rows.length === 0) {
    return (
      <div className={`position-table ${className}`} aria-busy="true">
        <p className="empty-activity">Loading your positions…</p>
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className={`position-table ${className}`}>
        <p className="empty-activity">
          You own nothing. Cash sitting still never called anyone&apos;s bluff — find
          a candidate who smells fake and take the other side.
        </p>
        {onGoTrade && (
          <div className="position-table__cta">
            <button type="button" className="list-button" onClick={onGoTrade}>
              GO FIND A MARKET
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className={`position-table ${className}`} aria-label="Open positions">
      <div className="table-head">
        <span>MARKET</span>
        <span>MARK</span>
        <span>P&amp;L</span>
        <span>TO WIN</span>
      </div>

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
  );
}

export default PositionsList;
