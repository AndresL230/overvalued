'use client';

// ============================================================================
// BOARD lane — the booth projector variant (/board).
// 1920x1080 landscape, read from across a room, zero interactivity. Nothing
// here is tappable and nothing here fetches: it is a display surface.
// ============================================================================

import { useMemo } from 'react';
import {
  fmtBps,
  fmtCountdown,
  fmtTC,
  priceNoCents,
  priceYesCents,
  type MarketPublic,
} from '@/lib/types';
import { OddsNumber } from './OddsNumber';
import { Sparkline } from './Sparkline';
import { sortMarkets } from './MarketBoard';
import { nextExpiryMs, useCountdown, useNow } from './useCountdown';
import { useOddsHistory, useRecentMoves } from './useOddsHistory';

export interface BigScreenBoardProps {
  markets: MarketPublic[];
  /** Cells the grid will show before it stops. Extra markets are dropped. */
  maxCells?: number;
  title?: string;
  className?: string;
}

const MARQUEE_CSS = `
@keyframes ov-board-marquee {
  from { transform: translate3d(0, 0, 0); }
  to   { transform: translate3d(-50%, 0, 0); }
}
.ov-marquee-track {
  animation: ov-board-marquee 42s linear infinite;
  will-change: transform;
}
@media (prefers-reduced-motion: reduce) {
  .ov-marquee-track { animation: none; }
}
`;

function columnsFor(n: number): string {
  if (n <= 2) return 'grid-cols-1';
  if (n <= 4) return 'grid-cols-2';
  if (n <= 9) return 'grid-cols-3';
  return 'grid-cols-4';
}

// --- one cell ---------------------------------------------------------------

function BigCell({ market }: { market: MarketPublic }) {
  const { history, dir, ticks } = useOddsHistory(market.id, market.prob_yes_bps);
  const { label, urgent, done } = useCountdown(market.expires_at);

  const resolved = market.status === 'resolved';
  const real = market.is_real === true;
  const yes = priceYesCents(market.prob_yes_bps);
  const no = priceNoCents(market.prob_yes_bps);

  const oddsTint =
    market.prob_yes_bps >= 5500
      ? 'text-yes'
      : market.prob_yes_bps <= 4500
        ? 'text-no'
        : 'text-fg';

  return (
    <div
      className={[
        'relative isolate flex min-h-0 flex-col overflow-hidden rounded-3xl border bg-surface p-6',
        resolved
          ? real
            ? 'border-yes/40 opacity-55'
            : 'border-no/40 opacity-55'
          : 'border-line',
      ].join(' ')}
    >
      {dir && !resolved && (
        <span
          key={ticks}
          aria-hidden="true"
          className={`pointer-events-none absolute inset-0 -z-10 ${
            dir === 'up' ? 'flash-up' : 'flash-down'
          }`}
        />
      )}

      <div className="flex items-center justify-between text-lg font-bold tracking-[0.18em] uppercase">
        <span className="truncate text-gold tnum">{fmtTC(market.asking_tc)}</span>
        {resolved ? (
          <span className={real ? 'text-yes' : 'text-no'}>
            {real ? 'Real' : 'Larp'}
          </span>
        ) : (
          <span
            className={`tnum ${urgent ? 'text-hot pulse-urgent' : 'text-muted'}`}
          >
            {done ? 'CHECKING' : label}
          </span>
        )}
      </div>

      <h3 className="mt-3 line-clamp-2 text-[2rem] leading-[1.12] font-bold text-fg">
        {market.title}
      </h3>

      <div className="mt-auto flex items-end justify-between gap-4 pt-4">
        <OddsNumber
          bps={market.prob_yes_bps}
          className={`text-[6.5rem] leading-[0.85] font-black tracking-tighter ${oddsTint}`}
        />
        <div className="flex shrink-0 flex-col items-end gap-1.5 pb-2 text-2xl font-bold">
          <span className="tnum text-yes">YES {yes}¢</span>
          <span className="tnum text-no">NO {no}¢</span>
        </div>
      </div>

      <div className="mt-3 -mx-1">
        <Sparkline points={history} height={56} strokeWidth={3} />
      </div>
    </div>
  );
}

// --- ticker -----------------------------------------------------------------

function Ticker({ markets }: { markets: MarketPublic[] }) {
  const moves = useRecentMoves(markets, 20);

  const items =
    moves.length > 0
      ? moves.map((m) => (
          <span key={m.key} className="flex shrink-0 items-center gap-3 px-7">
            <span className="max-w-[34ch] truncate text-muted">{m.title}</span>
            <span
              className={`tnum font-black ${m.delta > 0 ? 'text-yes' : 'text-no'}`}
            >
              {m.delta > 0 ? '▲' : '▼'} {fmtBps(m.to)}
            </span>
            <span className="tnum text-line">
              from {fmtBps(m.from)}
            </span>
          </span>
        ))
      : [
          <span key="idle" className="flex shrink-0 items-center gap-3 px-7 text-muted">
            Waiting for the floor to move…
          </span>,
        ];

  return (
    <div className="relative flex h-[76px] shrink-0 items-center overflow-hidden border-t border-line bg-surface">
      <div className="z-10 flex h-full shrink-0 items-center bg-gold px-6 text-2xl font-black tracking-[0.16em] text-ink uppercase">
        Tape
      </div>
      <div className="relative flex-1 overflow-hidden">
        <div className="ov-marquee-track flex w-max items-center text-2xl font-semibold whitespace-nowrap">
          <div className="flex items-center">{items}</div>
          <div className="flex items-center" aria-hidden="true">
            {items}
          </div>
        </div>
      </div>
    </div>
  );
}

// --- board ------------------------------------------------------------------

export function BigScreenBoard({
  markets,
  maxCells = 8,
  title = 'Overvalued',
  className = '',
}: BigScreenBoardProps) {
  const sorted = useMemo(() => sortMarkets(markets), [markets]);
  const now = useNow();

  const active = sorted.filter((m) => m.status !== 'resolved');
  const cells = sorted.slice(0, maxCells);
  const nextMs =
    now === null ? null : nextExpiryMs(active.map((m) => m.expires_at));
  const urgent = nextMs !== null && nextMs <= 30_000;

  return (
    <div
      className={`flex h-screen w-full flex-col overflow-hidden bg-ink ${className}`}
    >
      <style>{MARQUEE_CSS}</style>

      {/* --- header ------------------------------------------------------- */}
      <header className="flex shrink-0 items-end justify-between border-b border-line px-10 py-6">
        <div>
          <h1 className="text-6xl leading-none font-black tracking-tighter text-fg">
            {title}
            <span className="text-hot">.</span>
          </h1>
          <p className="mt-2 text-xl font-semibold tracking-[0.22em] text-muted uppercase">
            Résumé prediction market · real or larp
          </p>
        </div>

        <div className="flex items-center gap-10">
          <div className="text-right">
            <div className="text-lg font-bold tracking-[0.2em] text-muted uppercase">
              Live markets
            </div>
            <div className="tnum text-6xl leading-none font-black text-fg">
              {active.length}
            </div>
          </div>
          <div className="text-right">
            <div className="text-lg font-bold tracking-[0.2em] text-muted uppercase">
              Next reference check in
            </div>
            <div
              className={`tnum text-[5.5rem] leading-[0.9] font-black tracking-tighter ${
                urgent ? 'text-hot pulse-urgent' : 'text-gold'
              }`}
            >
              {nextMs === null ? '—:—' : fmtCountdown(nextMs)}
            </div>
          </div>
        </div>
      </header>

      {/* --- grid --------------------------------------------------------- */}
      <main className="min-h-0 flex-1 p-6">
        {cells.length === 0 ? (
          <div className="flex h-full items-center justify-center">
            <p className="max-w-[22ch] text-center text-5xl leading-tight font-bold text-muted text-balance">
              No markets on the board. Post a résumé.
            </p>
          </div>
        ) : (
          <div
            className={`grid h-full auto-rows-fr gap-5 ${columnsFor(cells.length)}`}
          >
            {cells.map((m) => (
              <BigCell key={m.id} market={m} />
            ))}
          </div>
        )}
      </main>

      <Ticker markets={markets} />
    </div>
  );
}

export default BigScreenBoard;
