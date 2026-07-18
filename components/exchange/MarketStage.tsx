'use client';

// ============================================================================
// EXCHANGE lane — the detail pane for the selected market.
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
import { ProbabilityChart, ProbabilityRail } from './ProbabilityChart';
import { atHandle, marketCode, type TapeFill } from './useExchangeData';

export function MarketStage({
  market,
  volume,
  authorHandle,
  fills,
  stageRef,
  ticketOpen,
  onTrade,
  onViewResume,
}: {
  market: MarketPublic;
  volume: number;
  authorHandle: string | null;
  fills: TapeFill[];
  stageRef: React.Ref<HTMLElement>;
  ticketOpen: boolean;
  onTrade: (side: Side, trigger: HTMLElement) => void;
  onViewResume: () => void;
}) {
  const { history, netDelta } = useOddsHistory(market.id, market.prob_yes_bps);
  const { label, urgent } = useCountdown(market.expires_at);

  const yes = priceYesCents(market.prob_yes_bps);
  const no = priceNoCents(market.prob_yes_bps);
  const pts = Math.round(netDelta / 100);
  const resolved = market.status === 'resolved';

  const mine = fills.filter((f) => f.marketId === market.id).slice(0, 3);

  return (
    <section className="market-stage" ref={stageRef}>
      <div className="stage-kicker">
        <span>
          <i /> {resolved ? 'SETTLED' : 'LIVE MARKET'}
        </span>
        <span>
          {marketCode(market.id)} · {market.author_id ? 'SELF-SUBMITTED' : 'HOUSE LISTING'}
        </span>
        <span className={urgent && !resolved ? 'closing-soon' : ''}>
          {resolved ? 'REFERENCE CHECK COMPLETE' : `CLOSES ${label}`}
        </span>
      </div>

      <div className="stage-title-row">
        <div>
          <p>REFERENCE CHECK</p>
          <h1>{market.title}</h1>
          <div className="stage-support-row">
            <span className="stage-handle">
              OPENED BY {authorHandle ? atHandle(authorHandle) : 'THE HOUSE'}
            </span>
            <span className="stage-handle">ASKING {fmtTC(market.asking_tc)}</span>
            <button
              className="resume-open-button"
              aria-haspopup="dialog"
              aria-controls="resume-viewer"
              onClick={onViewResume}
            >
              <span>VIEW RÉSUMÉ</span>
              <small>{market.bullets.length} LINES ↗</small>
            </button>
          </div>
        </div>
        <div className="stage-probability">
          <strong>
            {yes}
            <sup>%</sup>
          </strong>
          <span>
            {/* is_real is null until the reference check lands — never guess it. */}
            {resolved
              ? market.is_real
                ? 'VERIFIED REAL'
                : 'CONFIRMED LARP'
              : 'YES · PASSES'}
          </span>
          <small className={pts >= 0 ? 'positive' : 'negative'}>
            {pts >= 0 ? '▲' : '▼'} {Math.abs(pts)} PTS
          </small>
        </div>
      </div>

      {!resolved && (
        <div
          className={`mobile-stage-actions ${
            ticketOpen ? 'mobile-stage-actions--hidden' : ''
          }`}
        >
          <button className="mobile-yes" onClick={(e) => onTrade('yes', e.currentTarget)}>
            <span>BUY YES</span>
            <strong>{yes}¢</strong>
          </button>
          <button className="mobile-no" onClick={(e) => onTrade('no', e.currentTarget)}>
            <span>BUY NO</span>
            <strong>{no}¢</strong>
          </button>
        </div>
      )}

      <div className="stage-chart-card">
        <div className="chart-head">
          <div>
            <span>MARKET PROBABILITY</span>
            <strong>{yes}¢</strong>
          </div>
          <div>
            <span>NO PRICE</span>
            <strong>{no}¢</strong>
          </div>
          <div>
            <span>SHARES TRADED</span>
            <strong>{volume}</strong>
          </div>
        </div>
        <ProbabilityChart history={history} />
        <ProbabilityRail probability={yes} />
        <div className="rail-labels">
          <span>0 · LARP</span>
          <span>50 · TOO CLOSE</span>
          <span>100 · REAL</span>
        </div>
      </div>

      <section className="market-activity" aria-label="Recent market activity">
        <div className="section-heading">
          <span>THE RÉSUMÉ</span>
          <span>{market.bullets.length} LINES</span>
        </div>
        {market.bullets.map((bullet, i) => (
          <div className="activity-row" key={i}>
            <span>{String(i + 1).padStart(2, '0')}</span>
            <span>{bullet}</span>
          </div>
        ))}
      </section>

      <section className="market-activity" aria-label="Recent fills">
        <div className="section-heading">
          <span>RECENT ACTIVITY</span>
          <span>LIVE</span>
        </div>
        {mine.map((f) => (
          <div className="activity-row" key={f.id}>
            <span>{atHandle(f.handle)}</span>
            <span>
              {f.action === 'buy' ? 'BOUGHT' : 'SOLD'} {f.shares} {f.side.toUpperCase()}
            </span>
            <strong>{f.priceCents}¢</strong>
          </div>
        ))}
        {mine.length === 0 && <p className="empty-activity">No fills on this market yet.</p>}
      </section>
    </section>
  );
}
