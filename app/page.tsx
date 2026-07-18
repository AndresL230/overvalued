'use client';

// ============================================================================
// The player-facing exchange.
//
// Layout ported from codex/clean-trade-modal: header, live tape, then a
// two-pane workspace (market queue + stage). Below 820px the stylesheet
// collapses the workspace to one column and swaps the desktop nav for
// `.mobile-nav` — that is the booth case.
//
// All state comes from GameProvider; this lane opens no channel of its own.
//
// Portfolio / Leaderboard / CreateSheet are still the pre-exchange components,
// rendered inside the exchange's `.panel-modal` chrome. They are built from
// Tailwind utilities bound to the same tokens, so they re-colour with the new
// palette but keep their own internal layout until they are ported too.
// ============================================================================

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { useGame } from '@/components/providers/GameProvider';
import { Portfolio } from '@/components/portfolio';
import { RevealQueue } from '@/components/reveal';
import { ResumeViewer } from '@/components/resume';
import { Leaderboard, type LeaderboardPlayer } from '@/components/leaderboard';
import { fmtCents, isExpired, msUntil, type MarketPublic, type Side } from '@/lib/types';
import { LiveTape } from '@/components/exchange/LiveTape';
import { MarketRow } from '@/components/exchange/MarketRow';
import { MarketStage } from '@/components/exchange/MarketStage';
import { TradeTicket } from '@/components/exchange/TradeTicket';
import { CreateModal } from '@/components/exchange/CreateModal';
import { InviteModal, bonusLabel } from '@/components/referral';
import { useExchangeData } from '@/components/exchange/useExchangeData';

type Panel = 'portfolio' | 'rankings' | null;
type Sort = 'ending' | 'movers' | 'volume';

const MOBILE_QUERY = '(max-width: 820px)';

export default function Home() {
  const {
    player, markets, positions, reveals, refreshKey,
    refreshAll, dismissReveal, refClaim,
  } = useGame();

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [side, setSide] = useState<Side>('yes');
  const [ticketOpen, setTicketOpen] = useState(false);
  const [panel, setPanel] = useState<Panel>(null);
  const [creating, setCreating] = useState(false);
  const [inviting, setInviting] = useState(false);
  const [sort, setSort] = useState<Sort>('ending');
  const [query, setQuery] = useState('');
  const [toast, setToast] = useState<string | null>(null);
  const [players, setPlayers] = useState<LeaderboardPlayer[]>([]);
  const [refDismissed, setRefDismissed] = useState(false);
  const [resumeMarketId, setResumeMarketId] = useState<string | null>(null);

  const stageRef = useRef<HTMLElement | null>(null);
  const { fills, volume, handles } = useExchangeData(refreshKey);

  const refBanner =
    refClaim && !refDismissed
      ? refClaim.ok
        ? '🎁 Referral claimed — you and your friend both got $50.'
        : `Referral: ${refClaim.error}`
      : null;

  // Bind to the LIVE row by id rather than a snapshot, so the ticket price
  // never goes stale mid-trade.
  const selected = useMemo<MarketPublic | null>(() => {
    if (selectedId) {
      const hit = markets.find((m) => m.id === selectedId);
      if (hit) return hit;
    }
    return markets.find((m) => !isExpired(m)) ?? markets[0] ?? null;
  }, [markets, selectedId]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = markets.filter(
      (m) => !q || [m.title, ...m.bullets].some((v) => v.toLowerCase().includes(q)),
    );
    return [...filtered].sort((a, b) => {
      // Settled markets sink, whatever the sort.
      const ax = isExpired(a) ? 1 : 0;
      const bx = isExpired(b) ? 1 : 0;
      if (ax !== bx) return ax - bx;
      if (sort === 'volume') return (volume[b.id] ?? 0) - (volume[a.id] ?? 0);
      if (sort === 'movers') return b.prob_yes_bps - a.prob_yes_bps;
      return msUntil(a.expires_at) - msUntil(b.expires_at);
    });
  }, [markets, query, sort, volume]);

  // Bots are excluded: they market-make on a $10,000 bankroll, so leaving them
  // in buries every human and makes "Fattest Portfolio" meaningless.
  useEffect(() => {
    if (panel !== 'rankings') return;
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
  }, [panel, refreshKey]);

  useEffect(() => {
    if (!refBanner) return;
    const t = setTimeout(() => setRefDismissed(true), 6000);
    return () => clearTimeout(t);
  }, [refBanner]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3600);
    return () => clearTimeout(t);
  }, [toast]);

  const openTicket = useCallback((marketId: string, nextSide: Side) => {
    setSelectedId(marketId);
    setSide(nextSide);
    setTicketOpen(true);
  }, []);

  const selectMarket = useCallback((marketId: string) => {
    setSelectedId(marketId);
    if (typeof window === 'undefined') return;
    if (!window.matchMedia(MOBILE_QUERY).matches) return;
    // On a phone the stage sits below the queue, so changing it without
    // scrolling looks like the tap did nothing.
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    requestAnimationFrame(() =>
      stageRef.current?.scrollIntoView({
        behavior: reduce ? 'auto' : 'smooth',
        block: 'start',
      }),
    );
  }, []);

  const onFilled = useCallback(
    async (msg: string) => {
      setToast(msg);
      await refreshAll();
    },
    [refreshAll],
  );

  const resumeMarket = resumeMarketId
    ? (markets.find((m) => m.id === resumeMarketId) ?? null)
    : null;
  const closeResume = useCallback(() => setResumeMarketId(null), []);

  const held = selected ? (positions[selected.id] ?? { yes: 0, no: 0 }) : { yes: 0, no: 0 };
  const activeCount = markets.filter((m) => !isExpired(m)).length;

  return (
    <main className="exchange-shell">
      <header className="exchange-header">
        <button
          className="wordmark"
          onClick={() => selected && selectMarket(selected.id)}
          aria-label="Overvalued markets home"
        >
          <span>
            OVER<span className="wordmark-strike">VALUED</span>
          </span>
          <small>CANDIDATE EXCHANGE · {player?.handle ?? 'CONNECTING…'}</small>
        </button>

        <nav className="desktop-nav" aria-label="Primary navigation">
          <button className={panel === null ? 'active' : ''} onClick={() => setPanel(null)}>
            MARKETS <span>{activeCount}</span>
          </button>
          <button onClick={() => setPanel('portfolio')}>PORTFOLIO</button>
          <button onClick={() => setPanel('rankings')}>RANKINGS</button>
          <Link href="/board">BOOTH BOARD ↗</Link>
        </nav>

        <div className="header-actions">
          <button className="cash-button" onClick={() => setPanel('portfolio')}>
            <span>CASH</span>
            <strong>{player ? fmtCents(player.cash) : '—'}</strong>
          </button>
          {/* Stays visible at the mobile breakpoint alongside LIST — the booth
              case is exactly where the QR and share sheet get used. */}
          <button
            className="invite-button"
            disabled={!player}
            onClick={() => player && setInviting(true)}
          >
            INVITE · {bonusLabel()}
          </button>
          <button
            className="list-button"
            disabled={!player}
            onClick={() => player && setCreating(true)}
          >
            ＋ LIST YOURSELF
          </button>
        </div>
      </header>

      <LiveTape fills={fills} />

      {refBanner && (
        <div className="trade-toast" role="status">
          <span>✓</span>
          {refBanner}
        </div>
      )}

      <section className="exchange-workspace">
        <aside className="market-queue" aria-label="Open candidate markets">
          <div className="queue-head">
            <div>
              <span>OPEN MARKETS</span>
              <strong>{activeCount}</strong>
            </div>
            <label className="search-field">
              <span className="sr-only">Search markets</span>
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="SEARCH CANDIDATES"
              />
              <span aria-hidden="true">⌕</span>
            </label>
            <div className="sort-tabs" role="group" aria-label="Sort markets">
              {(
                [
                  ['ending', 'ENDING'],
                  ['movers', 'MOVERS'],
                  ['volume', 'VOLUME'],
                ] as [Sort, string][]
              ).map(([key, label]) => (
                <button
                  key={key}
                  aria-pressed={sort === key}
                  className={sort === key ? 'active' : ''}
                  onClick={() => setSort(key)}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="queue-list">
            {visible.map((m) => (
              <MarketRow
                key={m.id}
                market={m}
                volume={volume[m.id] ?? 0}
                selected={m.id === selected?.id}
                onSelect={() => selectMarket(m.id)}
                onTrade={(nextSide) => player && openTicket(m.id, nextSide)}
              />
            ))}
            {visible.length === 0 && (
              <p className="empty-activity">
                {query ? 'No candidates match that search.' : 'No markets open yet.'}
              </p>
            )}
          </div>
        </aside>

        {selected ? (
          <MarketStage
            market={selected}
            volume={volume[selected.id] ?? 0}
            authorHandle={selected.author_id ? (handles[selected.author_id] ?? null) : null}
            fills={fills}
            stageRef={stageRef}
            ticketOpen={ticketOpen}
            onTrade={(nextSide) => player && openTicket(selected.id, nextSide)}
            onViewResume={() => setResumeMarketId(selected.id)}
          />
        ) : (
          <section className="market-stage" ref={stageRef}>
            <p className="empty-activity">Waiting for the first candidate to hit the board.</p>
          </section>
        )}
      </section>

      {ticketOpen && selected && player && (
        <div
          className="trade-modal-layer"
          role="presentation"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setTicketOpen(false);
          }}
        >
          <TradeTicket
            market={selected}
            playerId={player.id}
            cash={player.cash}
            held={held}
            side={side}
            onSide={setSide}
            onClose={() => setTicketOpen(false)}
            onFilled={onFilled}
          />
        </div>
      )}

      <nav
        className={`mobile-nav ${ticketOpen ? 'mobile-nav--covered' : ''}`}
        aria-label="Mobile navigation"
      >
        <button
          className={panel === null ? 'active' : ''}
          aria-current={panel === null ? 'page' : undefined}
          onClick={() => setPanel(null)}
        >
          <span aria-hidden="true">⌁</span>MARKETS
        </button>
        <button
          className={panel === 'portfolio' ? 'active' : ''}
          aria-current={panel === 'portfolio' ? 'page' : undefined}
          onClick={() => setPanel('portfolio')}
        >
          <span aria-hidden="true">$</span>PORTFOLIO
        </button>
        <button
          className={`mobile-list ${creating ? 'active' : ''}`}
          disabled={!player}
          onClick={() => player && setCreating(true)}
        >
          <span aria-hidden="true">＋</span>LIST
        </button>
        <button
          className={panel === 'rankings' ? 'active' : ''}
          aria-current={panel === 'rankings' ? 'page' : undefined}
          onClick={() => setPanel('rankings')}
        >
          <span aria-hidden="true">↗</span>RANKINGS
        </button>
      </nav>

      {panel === 'portfolio' && player && (
        <div
          className="modal-layer"
          role="presentation"
          onMouseDown={(e) => e.target === e.currentTarget && setPanel(null)}
        >
          <section className="panel-modal" role="dialog" aria-modal="true" aria-label="Portfolio">
            <div className="modal-head">
              <div>
                <span>{player.handle}</span>
                <h2>Portfolio</h2>
              </div>
              <button onClick={() => setPanel(null)}>CLOSE ×</button>
            </div>
            <Portfolio
              player={player}
              markets={markets}
              refreshKey={refreshKey}
              onGoTrade={() => setPanel(null)}
              onInvite={() => {
                // Close the panel first — two stacked modal layers trap focus
                // in the wrong one.
                setPanel(null);
                setInviting(true);
              }}
            />
          </section>
        </div>
      )}

      {panel === 'rankings' && (
        <div
          className="modal-layer"
          role="presentation"
          onMouseDown={(e) => e.target === e.currentTarget && setPanel(null)}
        >
          <section className="panel-modal" role="dialog" aria-modal="true" aria-label="Rankings">
            <div className="modal-head">
              <div>
                <span>LIVE STANDINGS</span>
                <h2>Best traders</h2>
              </div>
              <button onClick={() => setPanel(null)}>CLOSE ×</button>
            </div>
            <Leaderboard
              players={players}
              markets={markets}
              currentPlayerId={player?.id ?? ''}
            />
          </section>
        </div>
      )}

      {player && creating && (
        <CreateModal
          playerId={player.id}
          onClose={() => setCreating(false)}
          onCreated={async (marketId) => {
            setCreating(false);
            await refreshAll();
            // Drop the author straight onto their own market — it is the whole
            // point of listing, and it is about to be priced by the room.
            setSelectedId(marketId);
            setToast('MARKET OPEN · Reference check closes in 15:00');
          }}
        />
      )}

      {player && inviting && (
        <InviteModal player={player} onClose={() => setInviting(false)} />
      )}

      {resumeMarket && <ResumeViewer market={resumeMarket} onClose={closeResume} />}

      <RevealQueue pending={reveals} onDone={dismissReveal} />

      {toast && (
        <div className="trade-toast" role="status">
          <span>✓</span>
          {toast}
        </div>
      )}
    </main>
  );
}
