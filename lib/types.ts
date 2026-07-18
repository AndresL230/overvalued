// ============================================================================
// OVERVALUED — app-level types. FROZEN CONTRACT.
// Subagents import from here and must not edit this file.
// ============================================================================
//
// INVARIANTS
//  * All money is integer CENTS. Never a float, never a dollar.
//  * All probability is integer BASIS POINTS, 0..10000, clamped to [200, 9800].
//  * `is_real` is null while a market is active. It is ONLY non-null after
//    the reference check resolves. Do not try to read it before then — the
//    database will not give it to you.
// ============================================================================

export const DEPTH = 80; // must match public.game_depth() in the migration
export const BPS_PER_SHARE = 10000 / DEPTH; // 125 bps = 1.25pp per share
export const BPS_FLOOR = 200;
export const BPS_CEIL = 9800;
export const STARTING_CASH = 10000; // $100.00
export const REFERRAL_BONUS = 5000; // $50.00, paid to BOTH sides
export const MARKET_TTL_MS = 15 * 60 * 1000;
export const RESOLVE_POLL_MS = 2000;

export type Side = 'yes' | 'no';
export type TradeAction = 'buy' | 'sell';
export type MarketStatus = 'active' | 'resolved';

/** A row from the `markets_public` view. The ONLY market shape clients see. */
export interface MarketPublic {
  id: string;
  title: string;
  bullets: string[];
  asking_tc: number; // whole dollars, e.g. 450000
  prob_yes_bps: number; // 200..9800
  expires_at: string; // ISO timestamptz
  status: MarketStatus;
  author_id: string | null;
  created_at: string;
  /** null while active. true = REAL (YES pays), false = LARP (NO pays). */
  is_real: boolean | null;
}

export interface Player {
  id: string;
  handle: string;
  cash: number; // cents
  ref_code: string;
  created_at: string;
}

export interface Position {
  player_id: string;
  market_id: string;
  yes: number;
  no: number;
}

export interface Trade {
  id: number;
  player_id: string;
  market_id: string;
  side: Side;
  action: TradeAction;
  shares: number;
  price_cents: number;
  ts: string;
}

// --- RPC return shapes ------------------------------------------------------

export interface TradeResult {
  ok: boolean;
  error: string | null;
  prob_yes_bps?: number;
  cash?: number;
  price_cents?: number;
  shares?: number;
}

export interface ReferralResult {
  ok: boolean;
  error: string | null;
  already_claimed?: boolean;
}

// --- Pure pricing helpers. Integer in, integer out. -------------------------

/** Marginal YES price in cents for a given probability. */
export function priceYesCents(bps: number): number {
  return Math.round(bps / 100);
}

/** Marginal NO price in cents. Always priceYes + priceNo === 100. */
export function priceNoCents(bps: number): number {
  return 100 - priceYesCents(bps);
}

export function priceForSide(bps: number, side: Side): number {
  return side === 'yes' ? priceYesCents(bps) : priceNoCents(bps);
}

/** Total cents for a fill. Marginal price applies to the whole order. */
export function fillCostCents(bps: number, side: Side, shares: number): number {
  return priceForSide(bps, side) * shares;
}

/**
 * Where the probability lands after this order — mirrors trade() exactly.
 * Use this for the client-side preview so the UI never disagrees with the db.
 */
export function previewBps(
  bps: number,
  side: Side,
  action: TradeAction,
  shares: number,
): number {
  const step = BPS_PER_SHARE * shares;
  const up = (side === 'yes') === (action === 'buy');
  const next = bps + (up ? step : -step);
  return Math.max(BPS_FLOOR, Math.min(BPS_CEIL, next));
}

/** Winning shares pay 100c. Losing shares pay 0. */
export function payoutCents(shares: number): number {
  return shares * 100;
}

// --- Formatting -------------------------------------------------------------

/** 12345 -> "$123.45" */
export function fmtCents(cents: number): string {
  const neg = cents < 0;
  const abs = Math.abs(cents);
  const s = `$${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
  return neg ? `-${s}` : s;
}

/** 5125 -> "51%" */
export function fmtBps(bps: number): string {
  return `${Math.round(bps / 100)}%`;
}

/** 450000 -> "$450K" */
export function fmtTC(dollars: number): string {
  if (dollars >= 1_000_000) return `$${(dollars / 1_000_000).toFixed(1)}M`;
  if (dollars >= 1000) return `$${Math.round(dollars / 1000)}K`;
  return `$${dollars}`;
}

/** ms remaining -> "4:07". Clamps at 0:00. */
export function fmtCountdown(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function msUntil(iso: string): number {
  return new Date(iso).getTime() - Date.now();
}

export function isExpired(m: MarketPublic): boolean {
  return m.status === 'resolved' || msUntil(m.expires_at) <= 0;
}
