'use client';

// ============================================================================
// EXCHANGE lane — the bar chart and the LARP↔REAL rail.
//
// Ported from codex/clean-trade-modal, but fed from `useOddsHistory` instead
// of a fixture array, so the bars are the real last-40 moves this client has
// been told about over realtime.
// ============================================================================

import type { OddsPoint } from '@/components/board/useOddsHistory';

/** Bars need a floor and a ceiling to scale against; a dead-flat market would
 *  otherwise divide by zero and render nothing at all. */
function scaleOf(values: number[]) {
  const min = Math.max(0, Math.min(...values) - 8);
  const max = Math.min(100, Math.max(...values) + 8);
  return { min, max, range: Math.max(1, max - min) };
}

/** Bars are sized as a fraction of the track, so a series of 2 renders two
 *  slabs half the chart wide. History accumulates from realtime and starts at
 *  a single point, so left-pad to a full frame with the oldest value — the
 *  chart then reads "flat so far" and thickens as real moves arrive. */
const MIN_BARS = 16;

export function ProbabilityChart({
  history,
  compact = false,
}: {
  history: OddsPoint[];
  compact?: boolean;
}) {
  const values = history.length ? history.map((p) => Math.round(p.bps / 100)) : [50];
  const pad = Math.max(0, MIN_BARS - values.length);
  const padded = [...Array<number>(pad).fill(values[0]), ...values];
  const { min, max, range } = scaleOf(padded);
  const now = padded[padded.length - 1];

  return (
    <div
      className={`probability-chart ${compact ? 'probability-chart--compact' : ''}`}
      role="img"
      aria-label={`Recent probability movement, now ${now}%`}
    >
      {!compact && (
        <div className="chart-scale" aria-hidden="true">
          <span>{max}%</span>
          <span>{Math.round((max + min) / 2)}%</span>
          <span>{min}%</span>
        </div>
      )}
      <div className="chart-bars" aria-hidden="true">
        {padded.map((value, index) => (
          <span
            className="chart-bar"
            key={`${value}-${index}`}
            style={{ height: `${16 + ((value - min) / range) * 76}%` }}
          />
        ))}
      </div>
      {!compact && (
        <div className="chart-axis" aria-hidden="true">
          <span>OPEN</span>
          <span>10 MIN</span>
          <span>NOW</span>
        </div>
      )}
    </div>
  );
}

export function ProbabilityRail({ probability }: { probability: number }) {
  return (
    <div className="probability-rail" aria-label={`${probability}% YES probability`}>
      <div className="probability-rail__fill" style={{ width: `${probability}%` }} />
      <div className="probability-rail__marker" style={{ left: `${probability}%` }} />
    </div>
  );
}
