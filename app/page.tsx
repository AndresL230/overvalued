'use client';

// The game. Board + trade + create + portfolio + leaderboard, one screen,
// one shared URL, no login. Everything live off the single GameProvider.

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useGame } from '@/components/providers/GameProvider';
import { MarketBoard } from '@/components/board';
import { TradeSheet } from '@/components/trade';
import { CreateSheet } from '@/components/create';
import { Portfolio } from '@/components/portfolio';
import { RevealQueue } from '@/components/reveal';
import { Leaderboard, type LeaderboardPlayer } from '@/components/leaderboard';
import { fmtCents, type MarketPublic, type TradeResult } from '@/lib/types';

type Tab = 'market' | 'portfolio' | 'leaders';

export default function Home() {
  const {
    player, markets, positions, reveals, refreshKey,
    refreshAll, dismissReveal, refClaim,
  } = useGame();

  const [tab, setTab] = useState<Tab>('market');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [players, setPlayers] = useState<LeaderboardPlayer[]>([]);
  const [refBanner, setRefBanner] = useState<string | null>(null);

  // Bind the trade sheet to the LIVE row by id, not to a snapshot — otherwise
  // the price in the ticket goes stale the moment someone else trades, which
  // is exactly the moment it matters most.
  const selected = selectedId
    ? markets.find((m) => m.id === selectedId) ?? null
    : null;

  const loadPlayers = useCallback(async () => {
    const { data } = await supabase
      .from('players')
      .select('id, handle, cash, ref_code, created_at, is_bot')
      .order('cash', { ascending: false })
      .limit(100);
    if (data) setPlayers(data as LeaderboardPlayer[]);
  }, []);

  useEffect(() => {
    if (tab === 'leaders') void loadPlayers();
  }, [tab, refreshKey, loadPlayers]);

  useEffect(() => {
    if (!refClaim) return;
    setRefBanner(
      refClaim.ok
        ? '🎁 Referral claimed — you and your friend both got $50.'
        : `Referral: ${refClaim.error}`,
    );
    const t = setTimeout(() => setRefBanner(null), 6000);
    return () => clearTimeout(t);
  }, [refClaim]);

  const onFilled = useCallback(
    async (_r: TradeResult) => {
      await refreshAll();
    },
    [refreshAll],
  );

  return (
    <div className="flex min-h-dvh flex-col bg-ink">
      {/* header ---------------------------------------------------------- */}
      <header className="sticky top-0 z-30 border-b border-line bg-ink/90 backdrop-blur">
        <div className="mx-auto flex w-full max-w-2xl items-center justify-between gap-3 px-4 py-3">
          <div className="min-w-0">
            <h1 className="truncate text-lg font-black tracking-tight">
              OVER<span className="text-no">VALUED</span>
            </h1>
            <p className="truncate text-[11px] text-muted">
              {player?.handle ?? 'connecting…'}
            </p>
          </div>
          <div className="text-right">
            <div className="tnum text-xl font-black text-gold">
              {player ? fmtCents(player.cash) : '—'}
            </div>
            <div className="text-[10px] uppercase tracking-wider text-muted">
              buying power
            </div>
          </div>
        </div>

        <nav className="mx-auto flex w-full max-w-2xl gap-1 px-2 pb-2">
          {(
            [
              ['market', 'Market'],
              ['portfolio', 'Portfolio'],
              ['leaders', 'Leaders'],
            ] as [Tab, string][]
          ).map(([id, label]) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={`flex-1 rounded-lg px-3 py-2 text-sm font-bold transition ${
                tab === id ? 'bg-surface-2 text-fg' : 'text-muted hover:text-fg'
              }`}
            >
              {label}
            </button>
          ))}
        </nav>
      </header>

      {refBanner && (
        <div className="mx-auto w-full max-w-2xl px-4 pt-3">
          <div className="rounded-lg border border-gold/40 bg-gold/10 px-3 py-2 text-sm text-gold">
            {refBanner}
          </div>
        </div>
      )}

      {/* body ------------------------------------------------------------ */}
      <main className="mx-auto w-full max-w-2xl flex-1 px-4 pb-32 pt-4">
        {tab === 'market' && (
          <MarketBoard
            markets={markets}
            onSelect={(m) => setSelectedId(m.id)}
          />
        )}

        {tab === 'portfolio' &&
          (player ? (
            <Portfolio
              player={player}
              markets={markets}
              refreshKey={refreshKey}
              onGoTrade={() => setTab('market')}
            />
          ) : (
            <p className="py-12 text-center text-muted">connecting…</p>
          ))}

        {tab === 'leaders' && (
          <Leaderboard
            players={players}
            markets={markets}
            currentPlayerId={player?.id ?? ''}
          />
        )}
      </main>

      {/* list-your-résumé CTA --------------------------------------------- */}
      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-30 bg-gradient-to-t from-ink via-ink/95 to-transparent pb-[env(safe-area-inset-bottom)]">
        <div className="mx-auto w-full max-w-2xl px-4 py-4">
          <button
            onClick={() => setCreating(true)}
            className="pointer-events-auto w-full rounded-xl bg-fg px-4 py-3.5 text-base font-black text-ink active:scale-[0.99]"
          >
            🎲 List your own résumé
          </button>
        </div>
      </div>

      {/* sheets ----------------------------------------------------------- */}
      {selected && player && (
        <TradeSheet
          market={selected}
          playerId={player.id}
          cash={player.cash}
          position={positions[selected.id]}
          open={!!selected}
          onClose={() => setSelectedId(null)}
          onFilled={onFilled}
        />
      )}

      {player && (
        <CreateSheet
          playerId={player.id}
          open={creating}
          onClose={() => setCreating(false)}
          onCreated={async () => {
            setCreating(false);
            await refreshAll();
            setTab('market');
          }}
        />
      )}

      {/* the 0:00 moment -------------------------------------------------- */}
      <RevealQueue pending={reveals} onDone={dismissReveal} />
    </div>
  );
}
