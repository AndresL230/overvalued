# FROZEN CONTRACT — subagents must not edit these files

```
supabase/migrations/*    lib/db.types.ts    lib/types.ts    lib/supabase.ts    CONTRACT.md
```

If you believe one of these files is wrong, **stop and report it** in your final
message. Do not edit it. Another lane is depending on the exact shape below.

**Rules for every lane**

- Import types from `@/lib/types`, the client from `@/lib/supabase`.
- Read markets **only** from the `markets_public` view. Never `from('markets')` —
  anon has no grant on that table's `is_real` column and the query will fail.
- All mutations go through the RPCs listed here. There are no write policies;
  a direct `insert`/`update` from the client will be rejected.
- Do not edit files outside your lane (see ownership map at the bottom).
- Money is **integer cents**. Probability is **integer basis points**. No floats.

---

## 1. Schema

```sql
players(id uuid pk, handle text, cash int, ref_code text unique,
        is_bot bool, created_at timestamptz)
markets(id uuid pk, title text, bullets text[], asking_tc int, is_real bool,
        prob_yes_bps int, expires_at timestamptz, status text,
        author_id uuid, created_at timestamptz)
positions(player_id uuid, market_id uuid, yes int, no int,
          pk(player_id, market_id))
trades(id bigint pk, player_id uuid, market_id uuid, side text, action text,
       shares int, price_cents int, ts timestamptz)
referrals(id bigint pk, code text, referrer_id uuid, referee_id uuid,
          claimed bool, ts timestamptz)   -- unique(referee_id)

-- server-only, added by 20260718040000_livelier_bots.sql. no anon grant,
-- RLS on with no policy. never client-read — do not query these from a lane.
bot_leans(bot_id uuid, market_id uuid, lean text, conviction int,
          refresh_at timestamptz, pk(bot_id, market_id))
bot_market_templates(id bigint pk, title text, bullets text[], asking_tc int,
                     is_real bool, used_at timestamptz)
```

`bot_market_templates.is_real` is the **same secret** as `markets.is_real` — it
is the answer to a market that has not been minted yet. Neither bot table is
reachable by `anon` at all.

`service_role` holds `select` on `players` and `markets` so `/api/bot-leans` can
read `is_real` to give bots an informed lean. Server-only; the key never reaches
the browser, and `anon`'s column-level grant still omits `is_real`.

`status` is `'active' | 'resolved'`. `side` is `'yes' | 'no'`. `action` is
`'buy' | 'sell'`.

### The one security rule that matters

`markets.is_real` is the secret. `anon` has a **column-level grant that omits
it**, so it is unreachable over PostgREST *and* over Realtime — it is never even
serialized into the websocket payload. Clients read `markets_public`, which
exposes `is_real` as `null` while active and face-up once resolved.

---

## 2. TypeScript types (`@/lib/types`)

```ts
export const DEPTH = 80;              // matches public.game_depth()
export const BPS_PER_SHARE = 125;     // 10000 / DEPTH → 1.25pp per share
export const BPS_FLOOR = 200;
export const BPS_CEIL  = 9800;
export const STARTING_CASH = 10000;   // $100.00
export const REFERRAL_BONUS = 5000;   // $50.00 to BOTH sides
export const MARKET_TTL_MS = 900_000; // 15 min
export const RESOLVE_POLL_MS = 2000;

type Side = 'yes' | 'no';
type TradeAction = 'buy' | 'sell';
type MarketStatus = 'active' | 'resolved';

interface MarketPublic {
  id: string;
  title: string;
  bullets: string[];
  asking_tc: number;        // whole dollars, e.g. 450000
  prob_yes_bps: number;     // 200..9800
  expires_at: string;       // ISO
  status: MarketStatus;
  author_id: string | null;
  created_at: string;
  is_real: boolean | null;  // null while active
}

interface Player   { id: string; handle: string; cash: number; ref_code: string; created_at: string }
interface Position { player_id: string; market_id: string; yes: number; no: number }
interface Trade    { id: number; player_id: string; market_id: string; side: Side;
                     action: TradeAction; shares: number; price_cents: number; ts: string }

interface TradeResult    { ok: boolean; error: string | null; prob_yes_bps?: number;
                           cash?: number; price_cents?: number; shares?: number }
interface ReferralResult { ok: boolean; error: string | null; already_claimed?: boolean }
```

### Helpers — use these, don't reimplement pricing

```ts
priceYesCents(bps): number            // round(bps / 100)
priceNoCents(bps): number             // 100 - priceYes
priceForSide(bps, side): number
fillCostCents(bps, side, shares): number    // marginal price × shares
previewBps(bps, side, action, shares): number  // mirrors trade() exactly, clamped
payoutCents(shares): number           // winners get shares × 100c, losers 0
fmtCents(12345) === '$123.45'
fmtBps(5125)    === '51%'
fmtTC(450000)   === '$450K'
fmtCountdown(ms)=== '4:07'            // clamps at 0:00
msUntil(iso): number
isExpired(m: MarketPublic): boolean
```

### The pricing model, stated once

Binary market, no order book, O(1) — intentional.

- `price_yes_cents = round(prob_yes_bps / 100)`, `price_no = 100 - price_yes`.
- BUY n YES: cost `price_yes × n`, `prob_yes_bps += 125 × n`.
- BUY n NO: cost `price_no × n`, `prob_yes_bps -= 125 × n`.
- SELL reverses both the cash flow and the price move. You must own the shares.
- `prob_yes_bps` is clamped to `[200, 9800]` after every trade.
- **The marginal price applies to the whole fill.** A 10-share buy costs
  `10 × current_price`, not an integral. This is deliberate.

---

## 3. RPCs — exact signatures

Call with `supabase.rpc(name, args)`. Argument names are **positional-by-name**
and must match exactly.

```ts
// Create-on-first-visit. Safe to call repeatedly; never resets cash.
supabase.rpc('ensure_player', { p_id: string, p_handle: string })
  // → Player (as Json)

// expires_at is always now() + 15 min, set server-side.
supabase.rpc('create_market', {
  p_player: string, p_title: string, p_bullets: string[],
  p_asking_tc: number, p_is_real: boolean,
}) // → string (the new market id)

// Runs resolve_expired() first, locks the market row FOR UPDATE,
// rejects if resolved or expired.
supabase.rpc('trade', {
  p_player: string, p_market: string,
  p_side: Side, p_action: TradeAction, p_shares: number,
}) // → TradeResult

// Lazy resolution. Idempotent, cheap, safe to poll every 2s.
supabase.rpc('resolve_expired') // → number (count resolved)

// Idempotent. Credits 5000c to BOTH sides on success.
supabase.rpc('claim_referral', { p_code: string, p_new_player: string })
  // → ReferralResult

// Nudges active markets. p_nudges defaults to 1, so the no-arg call below is
// unchanged; pg_cron calls bot_tick(3). Clamped to 10.
//
// Serialised by a transactional advisory lock: concurrent callers return
// { ok: true, skipped: true, reason: 'tick already running' } rather than
// deadlocking on the `players ... for update` that trade() takes. Rate floor is
// 400ms, so N clients polling still does NOT produce N× the movement.
//
// Each nudge also tops bots under $20 back up to $100, and re-seeds ONE market
// from bot_market_templates when active count < 5 — so the board never empties.
supabase.rpc('bot_tick')            // → Json
supabase.rpc('bot_tick', { p_nudges: 3 })

// Host panel only. Wipes the board, resets every player to $100, reseeds bots.
supabase.rpc('reset_game') // → void
```

### Error strings `trade()` can return (`ok: false`)

`shares must be a positive integer` · `side must be yes or no` ·
`action must be buy or sell` · `unknown player` · `unknown market` ·
`market already resolved` · `reference check is in progress` ·
`not enough cash` · `you do not own that many shares`

### Error strings `claim_referral()` can return

`no code` · `invalid code` · `no self-referrals, nice try` ·
`you already used a referral` · `too late — you already traded` · `unknown player`

---

## 4. Client usage example

```tsx
'use client';
import { supabase } from '@/lib/supabase';
import { fmtBps, fmtCents, type MarketPublic, type TradeResult } from '@/lib/types';

// read the board — markets_public ONLY
const { data } = await supabase
  .from('markets_public')
  .select('*')
  .order('expires_at', { ascending: true });
const markets = (data ?? []) as MarketPublic[];

// place a trade
const { data: raw, error } = await supabase.rpc('trade', {
  p_player: playerId, p_market: marketId,
  p_side: 'yes', p_action: 'buy', p_shares: 5,
});
const res = raw as unknown as TradeResult;
if (!res.ok) toast(res.error);
```

### Realtime — do NOT open your own channel

Phase C mounts **one** provider that subscribes to `postgres_changes` on the
`markets` table and exposes live markets through context. Consume that. Opening
a second channel per component will thrash the websocket.

The realtime payload carries the `markets` row **without `is_real`** (column
grant). When a row flips to `status='resolved'`, the provider refetches
`markets_public` to pick up the revealed `is_real`. Never infer the answer from
the price.

### `lib/db.types.ts` is knowingly stale

It does **not** describe `bot_leans` or `bot_market_templates`. This is
deliberate: neither table has an anon grant and neither is ever client-read, so
regenerating buys nothing. `/api/bot-leans` uses an untyped service-role client.
Regenerate if a lane ever needs them from the client — but no lane should.

### Identity

A uuid in `localStorage` under key **`ov_player_id`**, created with
`crypto.randomUUID()` on first visit, then passed to `ensure_player`. No auth.
Handle lives in `localStorage` under **`ov_handle`**.

Referral link format: `<origin>/?ref=<ref_code>`. The create-player flow reads
`?ref=CODE` and calls `claim_referral` immediately after the player row exists.

---

## 5. File ownership map

| Lane | Owns | Must not touch |
|---|---|---|
| **BOARD** | `components/board/*` | everything else |
| **TRADE** | `components/trade/*` | everything else |
| **CREATE** | `components/create/*` | everything else |
| **PORTFOLIO** | `components/portfolio/*` | everything else |
| **REVEAL** | `components/reveal/*`, `components/leaderboard/*` | everything else |
| **LEAD (Phase C)** | `app/*`, `lib/*`, `components/providers/*` | — |

Export a clearly-named default or named component from an `index.tsx` in your
folder so Phase C can mount it without guessing. Assume you will be rendered
inside a dark, mobile-first page. Do not add global CSS or edit
`app/globals.css` — scope styles with Tailwind classes.
