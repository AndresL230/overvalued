// ============================================================================
// BOARD lane — public surface. Everything the app should import lives here.
// ============================================================================

export { MarketCard, type MarketCardProps } from './MarketCard';
export { MarketBoard, sortMarkets, type MarketBoardProps } from './MarketBoard';
export { BigScreenBoard, type BigScreenBoardProps } from './BigScreenBoard';
export { Sparkline, type SparklineProps } from './Sparkline';
export { OddsNumber, type OddsNumberProps } from './OddsNumber';

export {
  useOddsHistory,
  useRecentMoves,
  getOddsHistory,
  recordOdds,
  resetOddsHistory,
  MAX_POINTS,
  type OddsPoint,
  type OddsMove,
  type UseOddsHistory,
} from './useOddsHistory';

export {
  useCountdown,
  useNow,
  usePrefersReducedMotion,
  nextExpiryMs,
  type Countdown,
} from './useCountdown';
