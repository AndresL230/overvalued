'use client';

// ============================================================================
// EXCHANGE lane — the scrolling tape of recent fills.
//
// The stylesheet animates `.live-tape__track` as a marquee that assumes the
// content is duplicated end-to-end, so it can translate -50% and loop without
// a seam. Hence `doubled`.
// ============================================================================

import { useNow } from '@/components/board/useCountdown';
import { atHandle, marketCode, type TapeFill } from './useExchangeData';

/**
 * Wall clock in the tape's right rail.
 *
 * `useNow` is subscribed HERE rather than in the page, deliberately. It ticks
 * 4x a second; reading it at page level re-renders the whole tree that often,
 * which resets RevealModal's phase timers (its effect keys on an `onDone`
 * that RevealQueue rebuilds each render) and the reveal never completes.
 * Keeping the subscription at the leaf keeps that churn to this one span.
 */
function Clock() {
  const now = useNow();
  if (now === null) return <span className="live-tape__clock" />;
  const d = new Date(now);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  const ss = String(d.getSeconds()).padStart(2, '0');
  return <span className="live-tape__clock">{`NYC · ${hh}:${mm}:${ss}`}</span>;
}

export function LiveTape({ fills }: { fills: TapeFill[] }) {
  if (fills.length === 0) {
    return (
      <div className="live-tape" aria-label="Live trades">
        <span className="live-tape__label">
          <i /> LIVE TAPE
        </span>
        <div className="live-tape__viewport">
          <div className="live-tape__track live-tape__track--idle">
            <span className="tape-trade">NO FILLS YET · BE THE FIRST</span>
          </div>
        </div>
        <Clock />
      </div>
    );
  }

  const doubled = [...fills, ...fills];

  return (
    <div className="live-tape" aria-label="Live trades">
      <span className="live-tape__label">
        <i /> LIVE TAPE
      </span>
      {/* aria-hidden: the duplicated track would read every fill twice. The
          per-market activity list below is the accessible view of this data. */}
      <div className="live-tape__viewport" aria-hidden="true">
        <div className="live-tape__track">
          {doubled.map((fill, index) => (
            <span className="tape-trade" key={`${fill.id}-${index}`}>
              <strong>{atHandle(fill.handle)}</strong>{' '}
              {fill.action === 'buy' ? 'BOUGHT' : 'SOLD'} {fill.shares}{' '}
              {fill.side.toUpperCase()}
              <span className={fill.side === 'yes' ? 'yes-text' : 'no-text'}>
                {fill.priceCents}¢
              </span>
              <span className="tape-market">{marketCode(fill.marketId)}</span>
            </span>
          ))}
        </div>
      </div>
      <Clock />
    </div>
  );
}
