'use client';

import { useEffect, useState } from 'react';
import {
  fmtCents,
  fmtCountdown,
  msUntil,
  payoutCents,
  priceForSide,
  type MarketPublic,
  type Position,
  type Side,
  type Trade,
} from '@/lib/types';

// ---------------------------------------------------------------------------
// One open position. Integer cents everywhere; rounding happens at render.
// ---------------------------------------------------------------------------

export interface Leg {
  side: Side;
  shares: number;
  /** Net cost basis in cents: buys add, sells subtract. */
  basisCents: number;
  /** basis ÷ shares, rounded. Display only. */
  avgEntryCents: number;
  /** Current per-share price in cents. */
  markPriceCents: number;
  /** shares × markPrice. */
  markCents: number;
  /** mark − basis. */
  pnlCents: number;
  /** Gross payout if this side wins. */
  payoutIfRightCents: number;
  /** payout − basis: what you actually pocket if you're right. */
  gainIfRightCents: number;
}

/**
 * Cost basis for one side of one market, from this player's trade history.
 * Buys add price×shares, sells subtract. If the trade log and the position
 * disagree on share count (partial history), the basis is scaled to match the
 * authoritative position so P&L stays sane.
 */
export function computeLeg(
  market: MarketPublic,
  trades: Trade[],
  side: Side,
  shares: number,
): Leg {
  let basis = 0;
  let net = 0;
  for (const t of trades) {
    if (t.market_id !== market.id || t.side !== side) continue;
    const amount = t.price_cents * t.shares;
    if (t.action === 'buy') {
      basis += amount;
      net += t.shares;
    } else {
      basis -= amount;
      net -= t.shares;
    }
  }

  const markPriceCents = priceForSide(market.prob_yes_bps, side);

  if (net > 0 && net !== shares) basis = Math.round((basis * shares) / net);
  if (net <= 0) basis = markPriceCents * shares; // no usable history — mark as basis

  const markCents = markPriceCents * shares;
  const payoutIfRightCents = payoutCents(shares);

  return {
    side,
    shares,
    basisCents: basis,
    avgEntryCents: shares > 0 ? Math.round(basis / shares) : 0,
    markPriceCents,
    markCents,
    pnlCents: markCents - basis,
    payoutIfRightCents,
    gainIfRightCents: payoutIfRightCents - basis,
  };
}

/** Both sides of a position that actually hold shares. */
export function computeLegs(
  market: MarketPublic,
  trades: Trade[],
  position: Position,
): Leg[] {
  const legs: Leg[] = [];
  if (position.yes > 0) legs.push(computeLeg(market, trades, 'yes', position.yes));
  if (position.no > 0) legs.push(computeLeg(market, trades, 'no', position.no));
  return legs;
}

/** Ticks once a second, but only when no parent clock is driving us. */
function useTick(enabled: boolean): void {
  const [, setN] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    const id = setInterval(() => setN((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [enabled]);
}

export interface PositionRowProps {
  position: Position;
  market: MarketPublic;
  /** This player's trades. May include other markets; filtered internally. */
  trades: Trade[];
  /** Parent clock (ms). Pass it to avoid one interval per row. */
  nowMs?: number;
  className?: string;
}

export function PositionRow({
  position,
  market,
  trades,
  nowMs,
  className = '',
}: PositionRowProps) {
  useTick(nowMs === undefined);

  const legs = computeLegs(market, trades, position);
  if (legs.length === 0) return null;

  const remaining = msUntil(market.expires_at);
  const settling = remaining <= 0 || market.status === 'resolved';
  const urgent = !settling && remaining < 60_000;

  const totalPnl = legs.reduce((s, l) => s + l.pnlCents, 0);

  return (
    <article
      className={`rounded-xl border border-line bg-surface p-3 ${className}`}
      aria-label={market.title}
    >
      <header className="flex items-start gap-3">
        <h3 className="min-w-0 flex-1 text-sm font-semibold leading-snug text-fg">
          {market.title}
        </h3>
        <span
          className={`tnum shrink-0 rounded-md px-1.5 py-0.5 text-xs font-semibold ${
            settling
              ? 'bg-hot/15 text-hot pulse-urgent'
              : urgent
                ? 'bg-hot/15 text-hot pulse-urgent'
                : 'bg-surface-2 text-muted'
          }`}
          title={settling ? 'Reference check in progress' : 'Time to reference check'}
        >
          {settling ? 'CHECKING' : fmtCountdown(remaining)}
        </span>
      </header>

      <div className="mt-2 flex flex-col gap-2">
        {legs.map((leg) => {
          const win = leg.pnlCents > 0;
          const flat = leg.pnlCents === 0;
          const tone = flat ? 'text-muted' : win ? 'text-yes' : 'text-no';
          const yes = leg.side === 'yes';
          return (
            <div key={leg.side} className="rounded-lg bg-surface-2 px-2.5 py-2">
              <div className="flex items-center gap-2">
                <span
                  className={`tnum rounded px-1.5 py-0.5 text-[11px] font-bold uppercase tracking-wide ${
                    yes ? 'bg-yes/15 text-yes' : 'bg-no/15 text-no'
                  }`}
                >
                  {leg.side}
                </span>
                <span className="tnum text-sm text-fg">
                  {leg.shares} <span className="text-muted">shares</span>
                </span>
                <span className={`tnum ml-auto text-sm font-semibold ${tone}`}>
                  {flat ? '' : win ? '+' : '−'}
                  {fmtCents(Math.abs(leg.pnlCents))}
                </span>
              </div>

              <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-muted">
                <span className="tnum">
                  avg <span className="text-fg">{leg.avgEntryCents}¢</span>
                </span>
                <span aria-hidden className="text-line">
                  ·
                </span>
                <span className="tnum">
                  mark <span className="text-fg">{leg.markPriceCents}¢</span>
                </span>
                <span aria-hidden className="text-line">
                  ·
                </span>
                <span className="tnum">
                  cost <span className="text-fg">{fmtCents(leg.basisCents)}</span>
                </span>
              </div>

              <div className="tnum mt-1 text-[11px] text-muted">
                If this resolves your way:{' '}
                <span className="font-semibold text-gold">
                  +{fmtCents(Math.max(0, leg.gainIfRightCents))}
                </span>{' '}
                <span className="opacity-70">
                  ({fmtCents(leg.payoutIfRightCents)} payout)
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {legs.length > 1 && (
        <footer className="mt-2 flex items-center justify-between border-t border-line pt-2 text-[11px]">
          <span className="text-muted">Position total</span>
          <span
            className={`tnum font-semibold ${
              totalPnl === 0 ? 'text-muted' : totalPnl > 0 ? 'text-yes' : 'text-no'
            }`}
          >
            {totalPnl === 0 ? '' : totalPnl > 0 ? '+' : '−'}
            {fmtCents(Math.abs(totalPnl))}
          </span>
        </footer>
      )}
    </article>
  );
}

export default PositionRow;
