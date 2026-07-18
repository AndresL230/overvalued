'use client';

// ============================================================================
// BOARD lane — one résumé market.
// The whole card is the tap target (it opens the TRADE sheet); the only nested
// control is the bullets toggle, which stops propagation.
// ============================================================================

import { useState } from 'react';
import {
  fmtCents,
  fmtTC,
  priceNoCents,
  priceYesCents,
  type MarketPublic,
} from '@/lib/types';
import { OddsNumber } from './OddsNumber';
import { Sparkline } from './Sparkline';
import { useCountdown } from './useCountdown';
import { useOddsHistory } from './useOddsHistory';

export interface MarketCardProps {
  market: MarketPublic;
  onSelect?: (m: MarketPublic) => void;
  onViewResume?: (m: MarketPublic) => void;
  className?: string;
}

/** Cents as "63¢" — board shorthand, distinct from fmtCents' dollar form. */
function cents(c: number): string {
  return `${c}¢`;
}

export function MarketCard({
  market,
  onSelect,
  onViewResume,
  className = '',
}: MarketCardProps) {
  const [expanded, setExpanded] = useState(false);
  const { history, dir, delta, ticks } = useOddsHistory(
    market.id,
    market.prob_yes_bps,
  );
  const { label, urgent, done } = useCountdown(market.expires_at);

  const resolved = market.status === 'resolved';
  const checking = !resolved && done;
  const interactive = Boolean(onSelect) && !resolved;

  const yes = priceYesCents(market.prob_yes_bps);
  const no = priceNoCents(market.prob_yes_bps);

  // Only commit to a colour when the market is actually leaning, so the big
  // number doesn't strobe between green and red while it sits near even.
  const oddsTint =
    market.prob_yes_bps >= 5500
      ? 'text-yes'
      : market.prob_yes_bps <= 4500
        ? 'text-no'
        : 'text-fg';

  const verdict = resolved
    ? market.is_real === true
      ? 'real'
      : market.is_real === false
        ? 'larp'
        : 'unknown'
    : null;

  const activate = () => {
    if (interactive) onSelect?.(market);
  };

  return (
    <article
      role={interactive ? 'button' : undefined}
      tabIndex={interactive ? 0 : undefined}
      onClick={activate}
      onKeyDown={(e) => {
        if (!interactive) return;
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          activate();
        }
      }}
      aria-label={
        interactive
          ? `${market.title}, ${Math.round(market.prob_yes_bps / 100)} percent real. Trade.`
          : undefined
      }
      className={[
        'relative isolate overflow-hidden rounded-2xl border bg-surface',
        'px-4 pt-3.5 pb-4 transition-colors duration-150',
        resolved
          ? verdict === 'real'
            ? 'border-yes/35 opacity-60'
            : 'border-no/35 opacity-60'
          : 'border-line',
        interactive
          ? 'cursor-pointer select-none hover:border-gold/35 hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold active:scale-[0.995]'
          : '',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {/* Price-move flash. Keyed so the CSS animation restarts every tick. */}
      {dir && !resolved && (
        <span
          key={ticks}
          aria-hidden="true"
          className={`pointer-events-none absolute inset-0 -z-10 ${
            dir === 'up' ? 'flash-up' : 'flash-down'
          }`}
        />
      )}

      {/* --- meta row ------------------------------------------------------ */}
      <div className="flex items-center justify-between gap-3 text-[11px] font-semibold tracking-[0.14em] uppercase">
        {resolved ? (
          <span className={verdict === 'real' ? 'text-yes' : 'text-no'}>
            {verdict === 'real' ? 'Verified real' : verdict === 'larp' ? 'Confirmed larp' : 'Resolved'}
          </span>
        ) : checking ? (
          <span className="text-hot pulse-urgent">Reference check</span>
        ) : (
          <span className="flex items-center gap-1.5 text-muted">
            <span className="h-1.5 w-1.5 rounded-full bg-yes" />
            Live
          </span>
        )}

        {!resolved && (
          <span
            className={`tnum tabular-nums ${
              urgent ? 'text-hot pulse-urgent' : 'text-muted'
            }`}
          >
            {checking ? 'CHECKING' : label}
          </span>
        )}
      </div>

      {/* --- headline ------------------------------------------------------ */}
      <div className="mt-2.5 flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h3 className="text-[17px] leading-snug font-semibold text-fg line-clamp-2">
            {market.title}
          </h3>
          <p className="mt-1 flex items-baseline gap-1.5 text-xs text-muted">
            <span className="tracking-[0.1em] uppercase">Asking</span>
            <span className="tnum text-sm font-bold text-gold">
              {fmtTC(market.asking_tc)}
            </span>
          </p>
        </div>

        <div className="shrink-0 text-right">
          <OddsNumber
            bps={market.prob_yes_bps}
            className={`block text-5xl leading-none font-black tracking-tight ${oddsTint}`}
          />
          <div className="mt-1 flex items-center justify-end gap-1.5 text-[10px] font-bold tracking-[0.12em] uppercase">
            <span className="text-muted">Real</span>
            {delta !== 0 && !resolved && (
              <span className={`tnum ${delta > 0 ? 'text-yes' : 'text-no'}`}>
                {delta > 0 ? '▲' : '▼'}
                {Math.abs(Math.round(delta / 100))}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* --- sparkline ----------------------------------------------------- */}
      <div className="mt-3 -mx-1">
        <Sparkline points={history} height={40} />
      </div>

      {/* --- bullets ------------------------------------------------------- */}
      {market.bullets.length > 0 && (
        <div className="mt-3">
          {expanded ? (
            <ul className="space-y-1.5">
              {market.bullets.map((b, i) => (
                <li
                  key={`${i}-${b.slice(0, 12)}`}
                  className="flex gap-2 text-[13px] leading-snug text-muted"
                >
                  <span aria-hidden="true" className="text-line select-none">
                    ▸
                  </span>
                  <span className="min-w-0 flex-1">{b}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-[13px] leading-snug text-muted line-clamp-2">
              {market.bullets.join('  ·  ')}
            </p>
          )}

          {market.bullets.length > 1 && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setExpanded((v) => !v);
              }}
              aria-expanded={expanded}
              className="mt-1.5 -ml-1 rounded px-1 py-1 text-[11px] font-bold tracking-[0.12em] text-muted uppercase transition-colors hover:text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold"
            >
              {expanded ? 'Collapse' : `Read all ${market.bullets.length} lines`}
            </button>
          )}
        </div>
      )}

      {onViewResume && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onViewResume(market);
          }}
          aria-haspopup="dialog"
          aria-controls="resume-viewer"
          className="mt-3 flex min-h-11 w-full items-center justify-between rounded-xl border border-line bg-surface-2 px-3 text-left transition-colors hover:border-gold/45 hover:bg-line/65 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold"
        >
          <span className="text-[12px] font-extrabold tracking-[0.1em] text-fg uppercase">
            View résumé
          </span>
          <span className="text-[10px] font-bold tracking-[0.12em] text-gold uppercase">
            1 page ↗
          </span>
        </button>
      )}

      {/* --- prices -------------------------------------------------------- */}
      <div className="mt-3.5 grid grid-cols-2 gap-2">
        <div className="rounded-xl border border-yes/40 bg-yes/10 px-3 py-2">
          <div className="text-[10px] font-bold tracking-[0.16em] text-yes uppercase">
            Yes · real
          </div>
          <div className="tnum mt-0.5 text-xl leading-none font-bold text-yes">
            {cents(yes)}
          </div>
        </div>
        <div className="rounded-xl border border-no/40 bg-no/10 px-3 py-2">
          <div className="text-[10px] font-bold tracking-[0.16em] text-no uppercase">
            No · larp
          </div>
          <div className="tnum mt-0.5 text-xl leading-none font-bold text-no">
            {cents(no)}
          </div>
        </div>
      </div>

      {/* Winners paid 100¢/share; make the stake legible without a tooltip. */}
      {!resolved && (
        <p className="mt-2 text-[11px] text-muted">
          Winning shares pay {fmtCents(100)} each
        </p>
      )}

      {/* --- resolved stamp ------------------------------------------------ */}
      {resolved && verdict !== 'unknown' && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute top-1/2 right-4 -translate-y-1/2"
        >
          <span
            className={`stamp block rounded-lg border-4 px-3 py-1 text-2xl font-black tracking-[0.08em] uppercase ${
              verdict === 'real'
                ? 'border-yes/70 text-yes'
                : 'border-no/70 text-no'
            }`}
          >
            {verdict === 'real' ? 'Real' : 'Larp'}
          </span>
        </div>
      )}
    </article>
  );
}

export default MarketCard;
