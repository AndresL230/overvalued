'use client';

import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import type {
  MarketPublic,
  Player,
  Position,
  Side,
  Trade,
  TradeAction,
} from '@/lib/types';
import { CashHeader } from './CashHeader';
import { PositionsList } from './PositionsList';
import { computeLegs } from './PositionRow';
import { ReferralCard } from './ReferralCard';

// ---------------------------------------------------------------------------
// Container. Owns the positions/trades fetch; markets come from Phase C,
// which owns the one realtime channel. We never open our own.
// ---------------------------------------------------------------------------

export interface PortfolioProps {
  player: Player;
  /** Live markets, passed down by the realtime provider. */
  markets: MarketPublic[];
  /** Bump to force a positions/trades refetch (e.g. after a fill). */
  refreshKey?: number;
  /** Optional nudge action for the empty state. */
  onGoTrade?: () => void;
  /** Opens the invite modal; the page closes this panel first. */
  onInvite?: () => void;
  className?: string;
}

export function Portfolio({
  player,
  markets,
  refreshKey = 0,
  onGoTrade,
  onInvite,
  className = '',
}: PortfolioProps) {
  const [positions, setPositions] = useState<Position[]>([]);
  const [trades, setTrades] = useState<Trade[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const playerId = player.id;

  useEffect(() => {
    let cancelled = false;

    Promise.all([
      supabase.from('positions').select('*').eq('player_id', playerId),
      supabase
        .from('trades')
        .select('*')
        .eq('player_id', playerId)
        .order('id', { ascending: true }),
    ]).then(([pRes, tRes]) => {
      if (cancelled) return;

      const err = pRes.error ?? tRes.error;
      setError(err ? err.message : null);

      if (pRes.data) setPositions(pRes.data as Position[]);
      if (tRes.data) {
        // db.types types `side`/`action` as plain text; narrow them here.
        setTrades(
          tRes.data.map((t) => ({
            ...t,
            side: t.side as Side,
            action: t.action as TradeAction,
          })),
        );
      }
      setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [playerId, refreshKey]);

  // Aggregate mark + unrealized across every open leg, for the cash header.
  const { openMarkCents, unrealizedCents } = useMemo(() => {
    const byId = new Map(markets.map((m) => [m.id, m]));
    let mark = 0;
    let pnl = 0;
    for (const p of positions) {
      const m = byId.get(p.market_id);
      if (!m || m.status !== 'active') continue;
      for (const leg of computeLegs(m, trades, p)) {
        mark += leg.markCents;
        pnl += leg.pnlCents;
      }
    }
    return { openMarkCents: mark, unrealizedCents: pnl };
  }, [positions, trades, markets]);

  // No wrapper: `.portfolio-summary` and `.position-table` are written to sit
  // directly under `.modal-head` inside `.panel-modal`, and each carries its
  // own hairline divider and 18px gutter.
  return (
    <div className={className}>
      <CashHeader
        player={player}
        openMarkCents={openMarkCents}
        unrealizedCents={unrealizedCents}
      />

      {error && (
        <p className="empty-activity no-text">
          Couldn&apos;t load your positions. {error}
        </p>
      )}

      <PositionsList
        positions={positions}
        markets={markets}
        trades={trades}
        loading={loading}
        onGoTrade={onGoTrade}
      />

      <ReferralCard player={player} onInvite={onInvite} />
    </div>
  );
}

export default Portfolio;
