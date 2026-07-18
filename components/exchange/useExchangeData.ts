'use client';

// ============================================================================
// EXCHANGE lane — the data the terminal chrome needs that GameProvider does
// not already carry.
//
// GameProvider owns markets, positions, cash and THE realtime channel. It
// deliberately says nothing about `trades`, because nothing before the
// exchange UI needed them. The tape, the per-market volume figure and the
// "OPENED BY" byline all do.
//
// This polls rather than opening a second realtime channel. GameProvider's
// header comment is explicit that exactly one channel exists in the app, and
// a tape that lags by a second is not worth breaking that rule for.
// ============================================================================

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import type { Side, TradeAction } from '@/lib/types';

/** The tape is decoration. Polling it hard would be silly. */
const TAPE_POLL_MS = 3000;
const TAPE_LIMIT = 40;

export interface TapeFill {
  id: number;
  handle: string;
  action: TradeAction;
  side: Side;
  shares: number;
  priceCents: number;
  marketId: string;
}

interface TradeRow {
  id: number;
  market_id: string;
  side: Side;
  action: TradeAction;
  shares: number;
  price_cents: number;
  players: { handle: string } | { handle: string }[] | null;
}

/** PostgREST returns an embedded row as an object, but the generated types
 *  allow an array. Normalise rather than fight it at the call site. */
function handleOf(row: TradeRow): string {
  const p = row.players;
  if (!p) return 'anon';
  return Array.isArray(p) ? (p[0]?.handle ?? 'anon') : p.handle;
}

export interface ExchangeData {
  /** Newest first. Drives the tape and each market's activity list. */
  fills: TapeFill[];
  /** market_id -> total shares that have changed hands. */
  volume: Record<string, number>;
  /** player_id -> handle, for the "OPENED BY" byline. */
  handles: Record<string, string>;
}

export function useExchangeData(refreshKey: number): ExchangeData {
  const [fills, setFills] = useState<TapeFill[]>([]);
  const [volume, setVolume] = useState<Record<string, number>>({});
  const [handles, setHandles] = useState<Record<string, string>>({});

  // Keeps the poll effect from re-subscribing every time a fill lands.
  const seenRef = useRef(0);

  const pull = useCallback(async () => {
    const { data, error } = await supabase
      .from('trades')
      .select('id, market_id, side, action, shares, price_cents, players(handle)')
      .order('id', { ascending: false })
      .limit(TAPE_LIMIT);

    if (error) {
      // A booth game should not go dark because the decorative tape 500s.
      console.error('[overvalued] tape fetch failed', error.message);
      return;
    }

    const rows = (data ?? []) as unknown as TradeRow[];
    const next = rows.map((r) => ({
      id: r.id,
      handle: handleOf(r),
      action: r.action,
      side: r.side,
      shares: r.shares,
      priceCents: r.price_cents,
      marketId: r.market_id,
    }));

    // Only re-render when the newest id actually moved. Without this the tape
    // marquee restarts its animation every poll and visibly stutters.
    const newest = next[0]?.id ?? 0;
    if (newest !== seenRef.current) {
      seenRef.current = newest;
      setFills(next);
    }
  }, []);

  useEffect(() => {
    void pull();
    const t = setInterval(() => void pull(), TAPE_POLL_MS);
    return () => clearInterval(t);
  }, [pull]);

  // Volume is a full-table aggregate and handles change rarely, so both are
  // read once per refreshKey (a resolution, a reset) rather than per poll.
  //
  // Written as a cancellable async body rather than two `void fetch()` calls:
  // React 19's set-state-in-effect rule rightly objects to an effect whose
  // whole job is to kick off state writes with nothing to unsubscribe.
  useEffect(() => {
    let alive = true;

    (async () => {
      const [tradesRes, playersRes] = await Promise.all([
        supabase.from('trades').select('market_id, shares'),
        supabase.from('players').select('id, handle'),
      ]);

      if (!alive) return;

      if (!tradesRes.error) {
        const totals: Record<string, number> = {};
        const rows = (tradesRes.data ?? []) as { market_id: string; shares: number }[];
        for (const r of rows) {
          totals[r.market_id] = (totals[r.market_id] ?? 0) + r.shares;
        }
        setVolume(totals);
      }

      if (!playersRes.error) {
        const map: Record<string, string> = {};
        const rows = (playersRes.data ?? []) as { id: string; handle: string }[];
        for (const p of rows) map[p.id] = p.handle;
        setHandles(map);
      }
    })();

    return () => {
      alive = false;
    };
  }, [refreshKey]);

  return useMemo(() => ({ fills, volume, handles }), [fills, volume, handles]);
}

// --- display helpers --------------------------------------------------------

/**
 * A uuid is unreadable on a booth screen; the exchange design calls for a
 * short ticker like "OV-042". Derived from the uuid so it is stable across
 * reloads and identical on every client without storing anything.
 */
export function marketCode(id: string): string {
  const hex = id.replace(/[^0-9a-f]/gi, '');
  const n = parseInt(hex.slice(-4), 16) % 1000;
  return `OV-${String(n).padStart(3, '0')}`;
}

/** "@handle", but never "@@handle" — stored handles may already carry one. */
export function atHandle(handle: string): string {
  return handle.startsWith('@') ? handle : `@${handle}`;
}
