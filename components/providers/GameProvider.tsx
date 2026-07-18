'use client';

// ============================================================================
// The single source of truth for live game state.
//
// Exactly ONE Realtime channel and ONE resolve poll exist in the app, and they
// live here. Lanes consume this via useGame() and never open their own channel
// — N components each holding a websocket subscription thrashes the connection
// and makes the odds feel laggy, which is the one thing this game cannot be.
// ============================================================================

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { supabase } from '@/lib/supabase';
import {
  RESOLVE_POLL_MS,
  type MarketPublic,
  type Player,
  type Position,
} from '@/lib/types';
import {
  getOrCreateHandle,
  getOrCreatePlayerId,
  hasTriedRefClaim,
  markRefClaimTried,
  readRefCodeFromUrl,
  setStoredHandle,
  stripRefFromUrl,
} from '@/lib/identity';

/** How often a client asks the db to nudge a bot market. Server rate-limits to
 *  one real nudge per 1.5s globally, so extra clients cost nothing. */
const BOT_TICK_MS = 2500;

export interface PendingReveal {
  market: MarketPublic;
  heldBefore?: { yes: number; no: number };
}

interface GameValue {
  player: Player | null;
  markets: MarketPublic[];
  positions: Record<string, { yes: number; no: number }>;
  activeCount: number;
  reveals: PendingReveal[];
  /** bump this to tell child lanes to refetch their own derived data */
  refreshKey: number;
  refreshPlayer: () => Promise<void>;
  refreshPositions: () => Promise<void>;
  refreshMarkets: () => Promise<void>;
  refreshAll: () => Promise<void>;
  dismissReveal: (marketId: string) => void;
  renameHandle: (handle: string) => Promise<void>;
  refClaim: { ok: boolean; error: string | null } | null;
}

const Ctx = createContext<GameValue | null>(null);

export function useGame(): GameValue {
  const v = useContext(Ctx);
  if (!v) throw new Error('useGame must be used inside <GameProvider>');
  return v;
}

export function GameProvider({ children }: { children: React.ReactNode }) {
  const [player, setPlayer] = useState<Player | null>(null);
  const [markets, setMarkets] = useState<MarketPublic[]>([]);
  const [positions, setPositions] = useState<Record<string, { yes: number; no: number }>>({});
  const [reveals, setReveals] = useState<PendingReveal[]>([]);
  const [refreshKey, setRefreshKey] = useState(0);
  const [refClaim, setRefClaim] = useState<{ ok: boolean; error: string | null } | null>(null);

  const playerIdRef = useRef<string | null>(null);
  // positions are DELETED on resolution, so we keep the last known copy in a
  // ref purely so the reveal can say "you held 12 YES" after the wipe.
  const positionsRef = useRef<Record<string, { yes: number; no: number }>>({});
  const revealedRef = useRef<Set<string>>(new Set());
  const bootRef = useRef(false);

  // ---- reveal detection ---------------------------------------------------

  /** Enqueue a dramatic reveal for any market we have not yet celebrated.
   *  Touches only refs and setState, so it is safe to memoize with no deps. */
  const queueRevealsFor = useCallback((next: MarketPublic[]) => {
    const fresh: PendingReveal[] = [];
    for (const m of next) {
      if (m.status !== 'resolved' || m.is_real === null) continue;
      if (revealedRef.current.has(m.id)) continue;
      revealedRef.current.add(m.id);
      fresh.push({ market: m, heldBefore: positionsRef.current[m.id] });
    }
    if (fresh.length) setReveals((r) => [...r, ...fresh]);
  }, []);

  const dismissReveal = useCallback((marketId: string) => {
    setReveals((r) => r.filter((x) => x.market.id !== marketId));
  }, []);

  // ---- fetchers -----------------------------------------------------------

  const refreshMarkets = useCallback(async () => {
    const { data, error } = await supabase
      .from('markets_public')
      .select('*')
      .order('expires_at', { ascending: true });
    if (error) {
      console.error('[overvalued] markets fetch failed', error.message);
      return;
    }
    const next = (data ?? []) as MarketPublic[];
    setMarkets(next);
    queueRevealsFor(next);
  }, [queueRevealsFor]);

  const refreshPlayer = useCallback(async () => {
    const id = playerIdRef.current;
    if (!id) return;
    const { data, error } = await supabase
      .from('players')
      .select('id, handle, cash, ref_code, created_at')
      .eq('id', id)
      .maybeSingle();
    if (error || !data) return;
    setPlayer(data as Player);
  }, []);

  const refreshPositions = useCallback(async () => {
    const id = playerIdRef.current;
    if (!id) return;
    const { data, error } = await supabase
      .from('positions')
      .select('*')
      .eq('player_id', id);
    if (error) return;
    const map: Record<string, { yes: number; no: number }> = {};
    for (const p of (data ?? []) as Position[]) {
      map[p.market_id] = { yes: p.yes, no: p.no };
    }
    // merge rather than replace: a market that just resolved has had its row
    // deleted, and we want to keep the pre-wipe holding for the reveal card.
    positionsRef.current = { ...positionsRef.current, ...map };
    setPositions(map);
  }, []);

  const refreshAll = useCallback(async () => {
    await Promise.all([refreshMarkets(), refreshPlayer(), refreshPositions()]);
    setRefreshKey((k) => k + 1);
  }, [refreshMarkets, refreshPlayer, refreshPositions]);

  // ---- boot: identity, referral claim, first load --------------------------

  useEffect(() => {
    if (bootRef.current) return;
    bootRef.current = true;

    (async () => {
      const id = getOrCreatePlayerId();
      const handle = getOrCreateHandle();
      playerIdRef.current = id;

      const { data, error } = await supabase.rpc('ensure_player', {
        p_id: id,
        p_handle: handle,
      });
      if (error) {
        console.error('[overvalued] ensure_player failed', error.message);
      } else if (data) {
        setPlayer(data as unknown as Player);
      }

      // Referral must be claimed right after the player row exists, and before
      // they trade — claim_referral rejects anyone who already has trades.
      const code = readRefCodeFromUrl();
      if (code && !hasTriedRefClaim()) {
        markRefClaimTried();
        const { data: raw } = await supabase.rpc('claim_referral', {
          p_code: code,
          p_new_player: id,
        });
        const res = raw as unknown as { ok: boolean; error: string | null };
        if (res) setRefClaim({ ok: res.ok, error: res.error });
        stripRefFromUrl();
      } else if (code) {
        stripRefFromUrl();
      }

      // On first load, treat everything already resolved as old news — we do
      // not want five reveal modals firing at someone who just walked up.
      const { data: seed } = await supabase
        .from('markets_public')
        .select('*')
        .order('expires_at', { ascending: true });
      const seeded = (seed ?? []) as MarketPublic[];
      for (const m of seeded) {
        if (m.status === 'resolved') revealedRef.current.add(m.id);
      }
      setMarkets(seeded);

      await refreshPositions();
      await refreshPlayer();
    })();
  }, [refreshPositions, refreshPlayer]);

  // ---- THE realtime channel -----------------------------------------------

  useEffect(() => {
    const ch = supabase
      .channel('overvalued-markets')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'markets' },
        (payload) => {
          // reset_game() deletes every market. DELETE carries no `new` row, so
          // without this the board would keep showing markets that are gone.
          if (payload.eventType === 'DELETE') {
            void refreshMarkets();
            void refreshPositions();
            return;
          }

          const row = payload.new as Partial<MarketPublic> & { id?: string };
          if (!row?.id) return;

          setMarkets((prev) => {
            const hit = prev.find((m) => m.id === row.id);
            // A brand-new market, or a flip to resolved. The wire payload has
            // no is_real (column grant), so we must refetch to learn the truth.
            if (!hit || (row.status === 'resolved' && hit.status !== 'resolved')) {
              void refreshMarkets();
              if (row.status === 'resolved') {
                void refreshPlayer();
                void refreshPositions();
              }
              return prev;
            }
            return prev.map((m) => (m.id === row.id ? { ...m, ...row } : m));
          });
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(ch);
    };
  }, [refreshMarkets, refreshPlayer, refreshPositions]);

  // ---- lazy resolution poll + bot nudge -----------------------------------

  useEffect(() => {
    const resolveTimer = setInterval(async () => {
      const { data } = await supabase.rpc('resolve_expired');
      if (typeof data === 'number' && data > 0) {
        await refreshMarkets();
        await refreshPositions();
        setRefreshKey((k) => k + 1);
      }
      // Cash is also moved by things this client never sees: a friend claiming
      // your referral, or the host hitting reset_game(). Re-reading one indexed
      // row every tick is cheap and keeps the headline number honest.
      await refreshPlayer();
    }, RESOLVE_POLL_MS);

    const botTimer = setInterval(() => {
      void supabase.rpc('bot_tick');
    }, BOT_TICK_MS);

    return () => {
      clearInterval(resolveTimer);
      clearInterval(botTimer);
    };
  }, [refreshMarkets, refreshPlayer, refreshPositions]);

  // ---- misc ---------------------------------------------------------------

  const renameHandle = useCallback(
    async (handle: string) => {
      const id = playerIdRef.current;
      if (!id) return;
      const clean = handle.trim().slice(0, 32);
      if (!clean) return;
      setStoredHandle(clean);
      const { data } = await supabase.rpc('ensure_player', { p_id: id, p_handle: clean });
      if (data) setPlayer(data as unknown as Player);
    },
    [],
  );

  const activeCount = useMemo(
    () => markets.filter((m) => m.status === 'active').length,
    [markets],
  );

  const value = useMemo<GameValue>(
    () => ({
      player,
      markets,
      positions,
      activeCount,
      reveals,
      refreshKey,
      refreshPlayer,
      refreshPositions,
      refreshMarkets,
      refreshAll,
      dismissReveal,
      renameHandle,
      refClaim,
    }),
    [
      player, markets, positions, activeCount, reveals, refreshKey,
      refreshPlayer, refreshPositions, refreshMarkets, refreshAll,
      dismissReveal, renameHandle, refClaim,
    ],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
