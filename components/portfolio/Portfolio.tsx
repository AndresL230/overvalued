'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
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
  className?: string;
}

export function Portfolio({
  player,
  markets,
  refreshKey = 0,
  onGoTrade,
  className = '',
}: PortfolioProps) {
  const [positions, setPositions] = useState<Position[]>([]);
  const [trades, setTrades] = useState<Trade[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const playerId = player.id;

  const load = useCallback(
    async (signal: { cancelled: boolean }) => {
      setLoading(true);
      const [pRes, tRes] = await Promise.all([
        supabase.from('positions').select('*').eq('player_id', playerId),
        supabase
          .from('trades')
          .select('*')
          .eq('player_id', playerId)
          .order('id', { ascending: true }),
      ]);
      if (signal.cancelled) return;

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
    },
    [playerId],
  );

  useEffect(() => {
    const signal = { cancelled: false };
    void load(signal);
    return () => {
      signal.cancelled = true;
    };
  }, [load, refreshKey]);

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

  return (
    <div className={`flex flex-col gap-4 ${className}`}>
      <CashHeader
        player={player}
        openMarkCents={openMarkCents}
        unrealizedCents={unrealizedCents}
      />

      {error && (
        <p className="rounded-lg border border-no/40 bg-no/10 px-3 py-2 text-xs text-no">
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

      <ReferralCard player={player} />
    </div>
  );
}

export default Portfolio;
