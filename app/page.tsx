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
import { fmtCents, type Side } from '@/lib/types';

type Tab = 'market' | 'portfolio' | 'leaders';
type TradeIntent = {
  marketId: string;
  side: Side;
  trigger: HTMLElement | null;
};

const navItems: { id: Tab | 'list'; label: string }[] = [
  { id: 'market', label: 'Markets' },
  { id: 'portfolio', label: 'Portfolio' },
  { id: 'list', label: 'List' },
  { id: 'leaders', label: 'Leaders' },
];

function NavIcon({ id }: { id: Tab | 'list' }) {
  if (id === 'market') {
    return (
      <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="none">
        <path d="M4 18.5h16M5.5 15l4-4 3 2.5 5-7 1.5 1.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  if (id === 'portfolio') {
    return (
      <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="none">
        <path d="M4 7.5h16v11H4zM7 7.5V5.75h7.5M16 12h4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  if (id === 'list') {
    return (
      <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="none">
        <path d="M12 6v12M6 12h12" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
      </svg>
    );
  }
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="none">
      <path d="M7 19v-5M12 19V9M17 19V5M4 19h16" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function Home() {
  const {
    player, markets, positions, reveals, refreshKey,
    refreshAll, dismissReveal, refClaim,
  } = useGame();

  const [tab, setTab] = useState<Tab>('market');
  const [tradeIntent, setTradeIntent] = useState<TradeIntent | null>(null);
  const [creating, setCreating] = useState(false);
  const [players, setPlayers] = useState<LeaderboardPlayer[]>([]);
  const [refDismissed, setRefDismissed] = useState(false);

  // Derived, not synced into state — React 19 rightly rejects a setState that
  // runs synchronously in an effect just to mirror a prop.
  const refBanner =
    refClaim && !refDismissed
      ? refClaim.ok
        ? '🎁 Referral claimed — you and your friend both got $50.'
        : `Referral: ${refClaim.error}`
      : null;

  // Bind the trade sheet to the LIVE row by id, not to a snapshot — otherwise
  // the price in the ticket goes stale the moment someone else trades, which
  // is exactly the moment it matters most.
  const selected = tradeIntent
    ? markets.find((m) => m.id === tradeIntent.marketId) ?? null
    : null;

  // The leaderboard is the only view that needs the player list, so it is
  // fetched on demand rather than kept live in the provider.
  //
  // Bots are excluded: they market-make on a $10,000 bankroll, so leaving them
  // in buries every human under four house accounts and makes "Fattest
  // Portfolio" meaningless — which is the one board the booth crowd reads.
  useEffect(() => {
    if (tab !== 'leaders') return;
    let alive = true;
    void supabase
      .from('players')
      .select('id, handle, cash, ref_code, created_at, is_bot')
      .eq('is_bot', false)
      .order('cash', { ascending: false })
      .limit(100)
      .then(({ data }) => {
        if (alive && data) setPlayers(data as LeaderboardPlayer[]);
      });
    return () => {
      alive = false;
    };
  }, [tab, refreshKey]);

  useEffect(() => {
    if (!refBanner) return;
    const t = setTimeout(() => setRefDismissed(true), 6000);
    return () => clearTimeout(t);
  }, [refBanner]);

  const onFilled = useCallback(async () => {
    await refreshAll();
  }, [refreshAll]);

  const overlayOpen = Boolean(player && (selected || creating));

  return (
    <div className="min-h-dvh bg-ink text-fg">
      <div
        className="flex min-h-dvh flex-col"
        inert={overlayOpen}
        aria-hidden={overlayOpen ? true : undefined}
      >
        {/* Compact market header: identity left, bankroll right. */}
        <header className="sticky top-0 z-30 h-14 border-b border-line bg-ink">
          <div className="mx-auto flex h-full w-full max-w-2xl items-center justify-between gap-3 px-4">
            <div className="min-w-0">
              <h1 className="truncate text-[17px] leading-none font-black tracking-[-0.045em]">
                OVER<span className="text-no">VALUED</span>
              </h1>
              <p className="mt-1 truncate text-[10px] leading-none tracking-[0.08em] text-muted">
                {player?.handle ?? 'connecting…'}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setTab('portfolio')}
              aria-label="Open portfolio"
              className="-mr-2 flex min-h-11 min-w-24 flex-col items-end justify-center rounded-lg px-2 text-right focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold"
            >
              <span className="tnum text-lg leading-none font-black text-gold">
                {player ? fmtCents(player.cash) : '—'}
              </span>
              <span className="mt-1 text-[9px] leading-none tracking-[0.16em] text-muted uppercase">
                buying power
              </span>
            </button>
          </div>
        </header>

        {refBanner && (
          <div className="mx-auto w-full max-w-2xl px-4 pt-3">
            <div className="rounded-lg border border-gold/40 bg-gold/10 px-3 py-2 text-sm text-gold">
              {refBanner}
            </div>
          </div>
        )}

        <main className="mx-auto w-full max-w-2xl flex-1 px-4 pt-3 pb-[calc(5.75rem+env(safe-area-inset-bottom))]">
          {tab === 'market' && (
            <MarketBoard
              markets={markets}
              onSelect={
                player
                  ? (m, side = 'yes', trigger) =>
                      setTradeIntent({ marketId: m.id, side, trigger: trigger ?? null })
                  : undefined
              }
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

        <nav
          aria-label="Primary"
          className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-ink pb-[env(safe-area-inset-bottom)]"
        >
          <div className="mx-auto grid h-[68px] w-full max-w-2xl grid-cols-4">
            {navItems.map(({ id, label }) => {
              const active = id === 'list' ? Boolean(player && creating) : tab === id;
              const list = id === 'list';
              const disabled = list && !player;
              return (
                <button
                  key={id}
                  type="button"
                  disabled={disabled}
                  aria-current={active ? 'page' : undefined}
                  onClick={() => {
                    if (id === 'list') {
                      if (player) setCreating(true);
                    }
                    else setTab(id);
                  }}
                  className={[
                    'relative flex min-h-11 flex-col items-center justify-center gap-1 text-[10px] font-bold tracking-[0.08em] transition-colors focus-visible:outline-2 focus-visible:outline-offset-[-3px] focus-visible:outline-gold',
                    list ? 'text-gold' : active ? 'text-fg' : 'text-muted',
                    disabled ? 'cursor-not-allowed opacity-45' : '',
                  ].join(' ')}
                >
                  {active && !list ? (
                    <span aria-hidden="true" className="absolute inset-x-5 top-0 h-0.5 bg-fg" />
                  ) : null}
                  <span
                    className={
                      list
                        ? 'flex h-8 min-w-10 items-center justify-center rounded-md bg-gold text-ink'
                        : 'flex h-6 items-center justify-center'
                    }
                  >
                    <NavIcon id={id} />
                  </span>
                  <span>{label}</span>
                </button>
              );
            })}
          </div>
        </nav>
      </div>

      {/* sheets ----------------------------------------------------------- */}
      {selected && player && (
        <TradeSheet
          market={selected}
          playerId={player.id}
          cash={player.cash}
          position={positions[selected.id]}
          open={!!selected}
          initialSide={tradeIntent?.side ?? 'yes'}
          returnFocusTo={tradeIntent?.trigger}
          onClose={() => setTradeIntent(null)}
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
