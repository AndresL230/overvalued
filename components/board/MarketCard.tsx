'use client';

// ============================================================================
// BOARD lane — one résumé market.
// The summary opens the market; the two quote buttons carry explicit side
// intent into the ticket. Controls are siblings so keyboard behavior is sane.
// ============================================================================

import { useState } from 'react';
import {
  fmtTC,
  priceNoCents,
  priceYesCents,
  type MarketPublic,
  type Side,
} from '@/lib/types';
import { OddsNumber } from './OddsNumber';
import { Sparkline } from './Sparkline';
import { useCountdown } from './useCountdown';
import { useOddsHistory } from './useOddsHistory';

export interface MarketCardProps {
  market: MarketPublic;
  onSelect?: (m: MarketPublic, side?: Side, trigger?: HTMLElement) => void;
  className?: string;
}

/** Cents as "63¢" — board shorthand, distinct from fmtCents' dollar form. */
function cents(c: number): string {
  return `${c}¢`;
}

export function MarketCard({ market, onSelect, className = '' }: MarketCardProps) {
  const [expanded, setExpanded] = useState(false);
  const { history, dir, delta, ticks } = useOddsHistory(
    market.id,
    market.prob_yes_bps,
  );
  const { label, urgent, done } = useCountdown(market.expires_at);

  const resolved = market.status === 'resolved';
  const checking = !resolved && done;
  const interactive = Boolean(onSelect) && !resolved && !checking;

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

  if (resolved) {
    return (
      <article
        className={[
          'rounded-xl border bg-surface px-4 py-3.5',
          verdict === 'real'
            ? 'border-yes/30'
            : verdict === 'larp'
              ? 'border-no/30'
              : 'border-line',
          className,
        ]
          .filter(Boolean)
          .join(' ')}
      >
        <div className="flex items-center gap-4">
          <div className="min-w-0 flex-1">
            <div
              className={`text-[10px] font-bold tracking-[0.16em] uppercase ${
                verdict === 'real'
                  ? 'text-yes'
                  : verdict === 'larp'
                    ? 'text-no'
                    : 'text-muted'
              }`}
            >
              {verdict === 'real'
                ? 'Verified real'
                : verdict === 'larp'
                  ? 'Confirmed larp'
                  : 'Resolved'}
            </div>
            <h3 className="mt-1.5 text-[15px] leading-snug font-semibold text-fg line-clamp-2">
              {market.title}
            </h3>
            <p className="tnum mt-1 text-[11px] text-muted">
              Asked{' '}
              <span className="font-bold text-gold">
                {fmtTC(market.asking_tc)}
              </span>
            </p>
          </div>
          <div className="shrink-0 text-right">
            <OddsNumber
              bps={market.prob_yes_bps}
              className={`block text-3xl leading-none font-black tracking-[-0.04em] ${oddsTint}`}
            />
            <span className="mt-1 block text-[8px] font-bold tracking-[0.13em] text-muted uppercase">
              Final real price
            </span>
          </div>
        </div>
      </article>
    );
  }

  const activate = (side: Side = 'yes', trigger?: HTMLElement) => {
    if (interactive) onSelect?.(market, side, trigger);
  };

  const summary = (
    <>
      <div className="flex items-center justify-between gap-3 text-[11px] font-semibold tracking-[0.14em] uppercase">
        {checking ? (
          <span className="text-hot pulse-urgent">Reference check</span>
        ) : (
          <span className="flex items-center gap-1.5 text-muted">
            <span className="h-1.5 w-1.5 rounded-full bg-yes" />
            Live market
          </span>
        )}

        <span
          className={`tnum tabular-nums ${
            urgent ? 'text-hot pulse-urgent' : 'text-muted'
          }`}
        >
          {checking ? 'CHECKING' : label}
        </span>
      </div>

      <div className="mt-2.5 flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h3 className="text-[17px] leading-snug font-semibold text-fg line-clamp-2">
            {market.title}
          </h3>
          <p className="mt-1.5 flex items-baseline gap-1.5 text-xs text-muted">
            <span className="tracking-[0.1em] uppercase">Asking</span>
            <span className="tnum text-sm font-bold text-gold">
              {fmtTC(market.asking_tc)}
            </span>
          </p>
        </div>

        <div className="shrink-0 text-right">
          <OddsNumber
            bps={market.prob_yes_bps}
            className={`block text-[46px] leading-none font-black tracking-[-0.055em] ${oddsTint}`}
          />
          <div className="mt-1 flex items-center justify-end gap-1.5 text-[9px] font-bold tracking-[0.14em] uppercase">
            <span className="text-muted">Chance real</span>
            {delta !== 0 && (
              <span className={`tnum ${delta > 0 ? 'text-yes' : 'text-no'}`}>
                {delta > 0 ? '▲' : '▼'}
                {Math.abs(Math.round(delta / 100))}
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="mt-3 -mx-1">
        <Sparkline points={history} height={36} />
      </div>
    </>
  );

  return (
    <article
      className={[
        'relative isolate overflow-hidden rounded-xl border bg-surface transition-colors duration-150',
        'border-line',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {/* Price-move flash. Keyed so the CSS animation restarts every tick. */}
      {dir && (
        <span
          key={ticks}
          aria-hidden="true"
          className={`pointer-events-none absolute inset-0 -z-10 ${
            dir === 'up' ? 'flash-up' : 'flash-down'
          }`}
        />
      )}

      {interactive ? (
        <button
          type="button"
          onClick={(event) => activate('yes', event.currentTarget)}
          aria-label={`${market.title}, ${Math.round(
            market.prob_yes_bps / 100,
          )} percent real. Open market.`}
          className="block w-full px-4 pt-3.5 pb-3 text-left transition-colors hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-gold active:bg-surface-2"
        >
          {summary}
        </button>
      ) : (
        <div className="px-4 pt-3.5 pb-3">{summary}</div>
      )}

      {/* --- bullets ------------------------------------------------------- */}
      {market.bullets.length > 0 && (
        <div className="px-4 pb-3">
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
              className="mt-1 -ml-1 inline-flex min-h-11 items-center rounded px-1 text-[11px] font-bold tracking-[0.12em] text-muted uppercase transition-colors hover:text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold"
            >
              {expanded ? 'Collapse' : `Read all ${market.bullets.length} lines`}
            </button>
          )}
        </div>
      )}

      {/* --- prices -------------------------------------------------------- */}
      <div className="grid grid-cols-2 gap-2 px-4 pb-4">
        {interactive ? (
          <>
            <button
              type="button"
              onClick={(event) => activate('yes', event.currentTarget)}
              aria-label={`Buy YES, real, at ${yes} cents`}
              className="flex min-h-12 items-center justify-between rounded-lg border border-yes/45 bg-yes/10 px-3 text-left text-yes transition-colors hover:bg-yes/20 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-yes active:bg-yes/25"
            >
              <span className="text-[10px] font-black tracking-[0.13em] uppercase">
                Yes · real
              </span>
              <span className="tnum text-lg font-black">{cents(yes)}</span>
            </button>
            <button
              type="button"
              onClick={(event) => activate('no', event.currentTarget)}
              aria-label={`Buy NO, larp, at ${no} cents`}
              className="flex min-h-12 items-center justify-between rounded-lg border border-no/45 bg-no/10 px-3 text-left text-no transition-colors hover:bg-no/20 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-no active:bg-no/25"
            >
              <span className="text-[10px] font-black tracking-[0.13em] uppercase">
                No · larp
              </span>
              <span className="tnum text-lg font-black">{cents(no)}</span>
            </button>
          </>
        ) : (
          <>
            <div className="rounded-lg border border-yes/20 bg-ink/40 px-3 py-2 text-yes/70">
              <div className="text-[9px] font-bold tracking-[0.13em] uppercase">
                Yes · real
              </div>
              <div className="tnum mt-0.5 text-lg font-black">{cents(yes)}</div>
            </div>
            <div className="rounded-lg border border-no/20 bg-ink/40 px-3 py-2 text-no/70">
              <div className="text-[9px] font-bold tracking-[0.13em] uppercase">
                No · larp
              </div>
              <div className="tnum mt-0.5 text-lg font-black">{cents(no)}</div>
            </div>
          </>
        )}
      </div>
    </article>
  );
}

export default MarketCard;
