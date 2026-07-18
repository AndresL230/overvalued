'use client';

// ============================================================================
// EXCHANGE lane — one row in the left-hand market queue.
// ============================================================================

import { useOddsHistory } from '@/components/board/useOddsHistory';
import { useCountdown } from '@/components/board/useCountdown';
import {
  fmtTC,
  priceNoCents,
  priceYesCents,
  type MarketPublic,
  type Side,
} from '@/lib/types';
import { ProbabilityChart } from './ProbabilityChart';
import { marketCode } from './useExchangeData';

export function MarketRow({
  market,
  volume,
  selected,
  onSelect,
  onTrade,
}: {
  market: MarketPublic;
  volume: number;
  selected: boolean;
  onSelect: () => void;
  onTrade: (side: Side, trigger: HTMLElement) => void;
}) {
  const { history, netDelta } = useOddsHistory(market.id, market.prob_yes_bps);
  const { label, urgent } = useCountdown(market.expires_at);

  const yes = priceYesCents(market.prob_yes_bps);
  const no = priceNoCents(market.prob_yes_bps);
  // netDelta is bps across the retained window; the design speaks in points.
  const pts = Math.round(netDelta / 100);

  return (
    <article className={`market-row ${selected ? 'market-row--selected' : ''}`}>
      <button className="market-row__main" onClick={onSelect} aria-pressed={selected}>
        <span className="market-row__meta">
          <span>{marketCode(market.id)}</span>
          <span className={urgent ? 'closing-soon' : ''}>{label}</span>
        </span>
        <span className="market-row__title">{market.title}</span>
        <span className="market-row__sub">
          <span>ASK {fmtTC(market.asking_tc)}</span>
          <span>{volume} SHARES</span>
        </span>
        <span className="market-row__visual">
          <ProbabilityChart history={history} compact />
          <span className="market-row__odds">
            <strong>{yes}%</strong>
            <small className={pts >= 0 ? 'positive' : 'negative'}>
              {pts >= 0 ? '+' : ''}
              {pts} pts
            </small>
          </span>
        </span>
      </button>
      <div className="market-row__actions">
        <button
          className="micro-trade micro-trade--yes"
          onClick={(e) => onTrade('yes', e.currentTarget)}
        >
          YES <strong>{yes}¢</strong>
        </button>
        <button
          className="micro-trade micro-trade--no"
          onClick={(e) => onTrade('no', e.currentTarget)}
        >
          NO <strong>{no}¢</strong>
        </button>
      </div>
    </article>
  );
}
