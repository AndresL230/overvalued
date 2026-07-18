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
  const clock = settling ? 'CHECKING' : fmtCountdown(remaining);

  // One `.position-row` per leg rather than a card per market: the side is the
  // thing you actually hold, and the table's 4-column grid reads straight down.
  return (
    <>
      {legs.map((leg) => {
        const flat = leg.pnlCents === 0;
        const tone = flat ? '' : leg.pnlCents > 0 ? 'positive' : 'negative';
        return (
          <div
            key={leg.side}
            className={`position-row ${className}`}
            aria-label={`${market.title}, ${leg.side}`}
          >
            <span>
              {market.title}
              <small>
                <b className={leg.side === 'yes' ? 'yes-text' : 'no-text'}>
                  {leg.side.toUpperCase()}
                </b>{' '}
                · {leg.shares} SH · AVG {leg.avgEntryCents}¢ ·{' '}
                <b className={settling || urgent ? 'closing-soon' : ''}>{clock}</b>
              </small>
            </span>

            <span className="tnum">{leg.markPriceCents}¢</span>

            <span className={`tnum ${tone}`}>
              {flat ? '' : leg.pnlCents > 0 ? '+' : '−'}
              {fmtCents(Math.abs(leg.pnlCents))}
            </span>

            <span className="tnum">
              +{fmtCents(Math.max(0, leg.gainIfRightCents))}
            </span>
          </div>
        );
      })}
    </>
  );
}

export default PositionRow;
