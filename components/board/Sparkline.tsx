'use client';

// ============================================================================
// BOARD lane — dependency-free odds sparkline.
// Inline SVG, no chart library, no layout measurement. Colour comes from
// `currentColor`, so the trend tint is a single Tailwind text-* class.
// ============================================================================

import { useId } from 'react';
import type { OddsPoint } from './useOddsHistory';

export interface SparklineProps {
  /** Oldest → newest. Only the last `maxPoints` are drawn. */
  points: OddsPoint[];
  width?: number;
  height?: number;
  maxPoints?: number;
  strokeWidth?: number;
  /** Soft gradient under the line. */
  showArea?: boolean;
  /** Dot on the most recent point. */
  showDot?: boolean;
  /** Force a tint instead of deriving it from the trend. */
  trend?: 'up' | 'down' | 'flat';
  className?: string;
}

/**
 * Never let a 20bps wobble fill the whole box — that reads as chaos rather
 * than a market. Domains narrower than this get padded out to it.
 */
const MIN_DOMAIN_BPS = 600;

type Pt = { x: number; y: number };

const r = (n: number) => Math.round(n * 100) / 100;

/**
 * Catmull-Rom → cubic bezier. Low tension: enough to soften the corners
 * without inventing overshoot that never happened in the data.
 */
function smoothPath(pts: Pt[]): string {
  if (pts.length === 0) return '';
  if (pts.length === 1) return `M ${r(pts[0].x)} ${r(pts[0].y)}`;
  if (pts.length === 2) {
    return `M ${r(pts[0].x)} ${r(pts[0].y)} L ${r(pts[1].x)} ${r(pts[1].y)}`;
  }
  const t = 0.18;
  let d = `M ${r(pts[0].x)} ${r(pts[0].y)}`;
  for (let i = 0; i < pts.length - 1; i += 1) {
    const p0 = pts[i - 1] ?? pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] ?? p2;
    const c1x = p1.x + (p2.x - p0.x) * t;
    const c1y = p1.y + (p2.y - p0.y) * t;
    const c2x = p2.x - (p3.x - p1.x) * t;
    const c2y = p2.y - (p3.y - p1.y) * t;
    d += ` C ${r(c1x)} ${r(c1y)}, ${r(c2x)} ${r(c2y)}, ${r(p2.x)} ${r(p2.y)}`;
  }
  return d;
}

export function Sparkline({
  points,
  width = 240,
  height = 44,
  maxPoints = 40,
  strokeWidth = 2,
  showArea = true,
  showDot = true,
  trend,
  className = '',
}: SparklineProps) {
  const uid = useId().replace(/:/g, '');
  const data = points.length > maxPoints ? points.slice(-maxPoints) : points;

  const first = data[0]?.bps ?? 0;
  const last = data[data.length - 1]?.bps ?? 0;
  const net = last - first;
  const dir: 'up' | 'down' | 'flat' =
    trend ?? (net > 0 ? 'up' : net < 0 ? 'down' : 'flat');

  const tint =
    dir === 'up' ? 'text-yes' : dir === 'down' ? 'text-no' : 'text-muted';

  // Vertical domain: tight around the data, floored at MIN_DOMAIN_BPS.
  const values = data.map((p) => p.bps);
  const lo = values.length ? Math.min(...values) : 0;
  const hi = values.length ? Math.max(...values) : 0;
  const mid = (lo + hi) / 2;
  const span = Math.max(hi - lo, MIN_DOMAIN_BPS);
  const yMin = mid - span / 2;
  const yMax = mid + span / 2;

  const padY = height * 0.14; // headroom so the stroke never clips
  const toY = (bps: number) =>
    height - padY - ((bps - yMin) / (yMax - yMin)) * (height - padY * 2);

  const pts: Pt[] =
    data.length === 1
      ? [
          { x: 0, y: toY(data[0].bps) },
          { x: width, y: toY(data[0].bps) },
        ]
      : data.map((p, i) => ({
          x: (i / (data.length - 1)) * width,
          y: toY(p.bps),
        }));

  const line = smoothPath(pts);
  const area = `${line} L ${r(width)} ${height} L 0 ${height} Z`;
  const tip = pts[pts.length - 1];

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width="100%"
      height={height}
      preserveAspectRatio="none"
      aria-hidden="true"
      className={`${tint} overflow-visible ${className}`}
    >
      {showArea && data.length > 0 && (
        <>
          <defs>
            <linearGradient id={`sparkfill-${uid}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="currentColor" stopOpacity="0.26" />
              <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
            </linearGradient>
          </defs>
          <path d={area} fill={`url(#sparkfill-${uid})`} stroke="none" />
        </>
      )}
      <path
        d={line}
        fill="none"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
      {showDot && tip && (
        <>
          <circle cx={r(tip.x)} cy={r(tip.y)} r={strokeWidth * 2.4} fill="currentColor" opacity="0.22" />
          <circle cx={r(tip.x)} cy={r(tip.y)} r={strokeWidth * 1.1} fill="currentColor" />
        </>
      )}
    </svg>
  );
}

export default Sparkline;
