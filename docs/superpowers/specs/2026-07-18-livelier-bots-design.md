# Livelier Bots — Design

**Date:** 2026-07-18
**Scope:** Backend only. No UI. No changes to trade/price math.

## Problem

The board dies ~15 minutes after seed and drifts in one direction until it does:

- **Nothing re-seeds.** `seed_game()` mints 5 markets on 3/6/9/12/15-minute expiries.
  After the last one resolves, active count is 0 and stays there. The live DB is
  currently 5 resolved / 0 active. This is the top demo-killer.
- **Bots only buy YES-or-NO at random with `action_pick := 'buy'` hardcoded**
  (`20260718000000_init.sql:541`). Buy-only pressure produces monotonic drift,
  not the two-sided movement that makes odds look alive.
- **Bots have no opinion.** Side is `random() < 0.5`, so wildly mispriced markets
  never get corrected and the price carries no signal.

## Non-goals

Explicitly out of scope for this slice:

- Onboarding / handle gate, QR codes, ReferralCard — no UI work at all.
- Résumé upload. Another effort owns `app/api/resume/route.ts`,
  `components/create/CreateSheet.tsx`, `lib/resume-card.ts`. Do not touch them.
- The `MarketPublic` ticker/tagline column fix. The résumé lane owns it.
- The three known backend bugs (buy-then-sell money printer, anon-callable
  `reset_game`, duplicate `create_market` overload). Do not fix, do not regress.

## Architecture

**Gemini decides direction; SQL executes trades.** Two loops at different speeds.
An LLM outage or a missing key degrades the board's *intelligence*, never its
*liveliness*.

```
/api/bot-leans  (every ~30s, service role, sees is_real)
      │  one batched Gemini call → a lean per (bot, market)
      ▼
  bot_leans  ──────read──────►  bot_tick(3)  (pg_cron, every 5s)
      ▲                              │
      └── refresh_at jitter          ├─ top up bots under $20 → $100
          spreads re-opinions        ├─ re-seed if active < 5 (one market/tick)
                                     └─ trade: buy lean side, or sell to recycle
```

### Why the split

A per-tick Gemini call would put LLM latency in the path of every price move — a
slow call means a still board, which is the exact failure being fixed. Assigning
opinions slowly and acting on them quickly decouples the two.

## Schema (pinned — both lanes code against this)

```sql
create table public.bot_leans (
  bot_id     uuid not null references public.players(id) on delete cascade,
  market_id  uuid not null references public.markets(id) on delete cascade,
  lean       text not null check (lean in ('yes','no')),
  conviction int  not null check (conviction between 1 and 3),
  refresh_at timestamptz not null,
  primary key (bot_id, market_id)
);

create table public.bot_market_templates (
  id         bigint generated always as identity primary key,
  title      text    not null,
  bullets    text[]  not null,
  asking_tc  int     not null,
  is_real    boolean not null,
  used_at    timestamptz          -- null = unused; oldest-used reused first
);
```

No anon grant on either table. Neither is client-read. `is_real` on the template
table is server-only and must never be exposed — same rule as `markets.is_real`.

## Components

### 1. `bot_leans` — a bot's opinion, not a queued order

One row per (bot, market). `lean` is the side this bot favors; `conviction`
drives share size (1–3). `refresh_at` is when the opinion goes stale.

**Staggering is the point.** `refresh_at` is written as
`now() + random(45..120s)` **per row**, not per batch. Bots therefore form
opinions at different moments, and the trades those opinions drive trickle in
continuously instead of arriving as a synchronized burst followed by dead air.

### 2. `/api/bot-leans` — the Gemini loop

Service-role Supabase client, so it reads `markets` directly and can see
`is_real`. Selects (bot, market) pairs that are missing or stale, batches them
into **one** Gemini call (`gemini-2.5-flash`), writes leans back with jittered
`refresh_at`.

Prompt rules:

- Lean **slightly** toward `is_real` so wildly mispriced markets get corrected.
- **Require disagreement across bots.** If all four converge on truth, odds snap
  to correct and there is no gap left for a human to trade. Noisy, not perfect.
- Conviction reflects confidence, not truth — a confident wrong bot is good.

Also tops up `bot_market_templates` with freshly generated cursed markets when
unused rows run low. Gemini generates ahead of demand; SQL consumes instantly, so
minting never waits on an API call.

**Never blocks.** `AbortSignal.timeout(8000)`. On timeout, error, or absent
`GEMINI_API_KEY`, the route returns non-fatally and SQL falls back to random
leans. The board keeps moving with zero Gemini involvement.

### 3. `bot_tick(p_nudges int default 1)` — the trading loop

`p_nudges` has a default, so the existing no-arg call sites and the documented
`supabase.rpc('bot_tick')` signature keep working. pg_cron calls `bot_tick(3)`.

Each nudge, spread by a randomized `pg_sleep(0.3..1.2s)` — ~one trade every
1.7s, staggered across the 5s window rather than three landing at once:

1. **Top up** — any bot under $20 goes back to $100.
2. **Re-seed** — if active markets < 5, mint exactly **one** template-backed
   market with `expires_at = now() + random(3..12 min)`. One per tick, never a
   batch, so new markets appear staggered and reveals stay spaced.
3. **Trade** — buy the bot's lean side at `conviction` shares. If the bot holds
   opposite-side shares, ~30% of the time sell them instead to recycle cash.
   Both sides and both actions now appear, killing the monotonic drift.

Global rate floor drops 1500ms → 400ms so residual client polling still cannot
multiply movement.

### 4. Bankroll

`seed_game()` seeds bots at `10000` cents ($100), down from `1000000`. Small
per-trade price impact keeps a human's $100 stake meaningful.

$100 drains — bots are net-lossy because a bot holding shares in a market that
resolves against it loses that cash permanently. The top-up in `bot_tick`
guarantees the board never stalls on a broke bot. Bot cash is invisible to
players; they are already excluded from the leaderboard via the `is_bot` filter.

### 5. Scheduling

pg_cron + `pg_net` POST to `/api/bot-leans` every 30s, wrapped in the same
`exception when others then raise notice` pattern as
`20260718020000_server_side_bot_loop.sql`. If `pg_net` is unavailable it degrades
to random leans rather than failing the migration. Vercel Cron is the
deploy-time alternative.

## Frozen-file changes (deliberate, per CONTRACT.md)

- **New migration** `20260718040000_livelier_bots.sql`. Migrations are frozen;
  this is an additive migration, not an edit to an existing one.
- **`CONTRACT.md`** updated in the same commit: `bot_leans`,
  `bot_market_templates`, the `bot_tick` parameter, and the bot bankroll change.
- **`lib/db.types.ts` is deliberately NOT regenerated.** The new tables have no
  anon grant and are never client-read, and the résumé lane currently has `lib/`
  open — regenerating invites a merge collision for zero benefit. This leaves
  `db.types.ts` knowingly stale w.r.t. the two new tables; noted in CONTRACT.md.
- **`lib/types.ts` is NOT touched.** Nothing here is client-facing.

## Environment

`SUPABASE_SERVICE_ROLE_KEY` is absent from `.env.local` and is required by
`/api/bot-leans`. Must be added (and to `.env.example`). `GEMINI_API_KEY` is
already present, so a live roll is verifiable.

## Verification

Local Supabase is running, so this is verified by observation, not assertion:

1. **Board never empties** — sustained run; poll active market count; assert it
   never reaches 0 and re-seed fires below 5.
2. **Two-sided flow** — query bot rows in `trades`; assert both `side` values
   *and* both `action` values are present.
3. **No broke bots** — assert `min(cash)` across `is_bot` players stays > 0.
4. **Staggering** — assert `refresh_at` values are spread, not clustered at one
   timestamp; assert bot trade timestamps are spaced, not bursty.
5. **Degraded path** — unset `GEMINI_API_KEY`, confirm leans still populate
   randomly and the board still moves.
6. **No regressions** — the three known backend bugs behave exactly as before.
