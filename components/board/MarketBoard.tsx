'use client';

// ============================================================================
// BOARD lane — the phone board. Mobile-first scrolling list.
// Data comes in as props; this component never fetches. Phase C owns the
// realtime provider and passes `markets` down.
// ============================================================================

import { useMemo } from 'react';
import { fmtCountdown, type MarketPublic } from '@/lib/types';
import { MarketCard } from './MarketCard';
import { nextExpiryMs, useNow } from './useCountdown';

export interface MarketBoardProps {
  markets: MarketPublic[];
  onSelect?: (m: MarketPublic) => void;
  onViewResume?: (m: MarketPublic) => void;
  /** Sticky "N live · next check M:SS" strip. */
  showHeader?: boolean;
  emptyLabel?: string;
  className?: string;
}

const ts = (iso: string) => new Date(iso).getTime();

/** Active first, soonest expiry first. Resolved sink to the bottom, newest of
 *  them first, so the thing that just flipped is the one you scroll into. */
export function sortMarkets(markets: MarketPublic[]): MarketPublic[] {
  return [...markets].sort((a, b) => {
    const ar = a.status === 'resolved' ? 1 : 0;
    const br = b.status === 'resolved' ? 1 : 0;
    if (ar !== br) return ar - br;
    if (ar === 1) return ts(b.expires_at) - ts(a.expires_at);
    return ts(a.expires_at) - ts(b.expires_at);
  });
}

export function MarketBoard({
  markets,
  onSelect,
  onViewResume,
  showHeader = true,
  emptyLabel = 'No markets yet. Post a résumé and let the floor price it.',
  className = '',
}: MarketBoardProps) {
  const sorted = useMemo(() => sortMarkets(markets), [markets]);
  const now = useNow();

  const active = sorted.filter((m) => m.status !== 'resolved');
  const resolved = sorted.filter((m) => m.status === 'resolved');

  // `now` is only read to re-render this on the shared ticker.
  const nextMs = now === null ? null : nextExpiryMs(active.map((m) => m.expires_at));

  if (sorted.length === 0) {
    return (
      <div
        className={`flex min-h-[45vh] items-center justify-center px-8 text-center ${className}`}
      >
        <p className="max-w-[26ch] text-sm leading-relaxed text-muted text-balance">
          {emptyLabel}
        </p>
      </div>
    );
  }

  return (
    <div className={className}>
      {showHeader && (
        <div className="sticky top-0 z-20 -mx-4 mb-3 border-b border-line bg-ink/85 px-4 py-2.5 backdrop-blur-md">
          <div className="flex items-baseline justify-between gap-3 text-[11px] font-bold tracking-[0.16em] uppercase">
            <span className="flex items-center gap-2 text-muted">
              <span className="h-1.5 w-1.5 rounded-full bg-yes" />
              <span className="tnum text-fg">{active.length}</span> live
            </span>
            <span className="text-muted">
              Next check{' '}
              <span
                className={`tnum ${
                  nextMs !== null && nextMs <= 30_000 ? 'text-hot pulse-urgent' : 'text-fg'
                }`}
              >
                {nextMs === null ? '—:—' : fmtCountdown(nextMs)}
              </span>
            </span>
          </div>
        </div>
      )}

      <ul className="flex flex-col gap-3 pb-24">
        {active.map((m) => (
          <li key={m.id}>
            <MarketCard
              market={m}
              onSelect={onSelect}
              onViewResume={onViewResume}
            />
          </li>
        ))}

        {resolved.length > 0 && (
          <li
            aria-hidden="true"
            className="mt-3 flex items-center gap-3 px-0.5 text-[10px] font-bold tracking-[0.2em] text-muted uppercase"
          >
            <span className="h-px flex-1 bg-line" />
            Settled
            <span className="h-px flex-1 bg-line" />
          </li>
        )}

        {resolved.map((m) => (
          <li key={m.id}>
            <MarketCard market={m} onViewResume={onViewResume} />
          </li>
        ))}
      </ul>
    </div>
  );
}

export default MarketBoard;
