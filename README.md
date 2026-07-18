# Overvalued

Every résumé is a binary prediction market: **"Passes the reference check?"**

Traders buy **YES** (the résumé is legit) or **NO** (inflated LARP). At a hidden
15-minute deadline the truth flips face-up — real pays YES, fake pays NO — and
the odds reprice violently. One shared URL, no login, mobile-first, everyone
watching the same live market.

Built for a hackathon booth.

---

## Run it

Needs Docker running.

```bash
npm install
npx supabase start          # first run pulls images, takes a few minutes
npx supabase db reset       # applies the migration + seeds 5 bot markets
npm run dev
```

Open <http://localhost:3000>. If your local anon key differs from the one in
`.env.local`, copy it from `npx supabase status`.

| Route | What it is |
|---|---|
| `/` | The game — board, trade, create, portfolio |
| `/board` | Big-screen booth view for a projector or TV |
| `/host` | Operator panel: reset, manual resolve, bot nudge |
| `/debug` | Throwaway Phase-A pipe check. Delete before the booth. |

To play across phones on the same wifi, run `npm run dev -- -H 0.0.0.0` and
point them at `http://<your-lan-ip>:3000`.

---

## The model

Binary market, one per résumé. No order book — pricing is O(1) on purpose.

- Everyone starts with **10000 cents** ($100).
- `prob_yes_bps` is an integer 0–10000, starting at 5000 (50/50).
- `price_yes_cents = round(bps / 100)`, `price_no_cents = 100 - price_yes`.
- **BUY n YES**: costs `price_yes × n`, pushes `prob_yes_bps` up by `125 × n`.
- **BUY n NO**: costs `price_no × n`, pushes it down by the same.
- **SELL** reverses both the cash flow and the price move; you must own the shares.
- `prob_yes_bps` is clamped to `[200, 9800]` after every trade.

The marginal price applies to the whole fill — a 10-share buy costs
`10 × current_price`, not an integral. That is deliberate: it keeps the math
legible to a player holding a phone, and it makes big orders feel punchy.

**Every value is an integer.** Money in cents, probability in basis points.
There is not a single float in the money path.

### DEPTH

`DEPTH = 80`, so each share moves the market `10000 / 80 = 125` bps — **1.25
percentage points**. A 10-share buy swings the odds 12.5 points. Tuned down
from 100 because at DEPTH=100 a single small trade barely registered from
across a room, and the board is the hero screen. Lower is swingier.

It lives in exactly two places, which must agree: `public.game_depth()` in the
migration and `DEPTH` in `lib/types.ts`.

### Resolution

Lazy, so no always-on server is required. `resolve_expired()` finds every
active market past `expires_at`, flips `is_real` face-up, pays each position
(YES pays 100¢ if real else 0, NO the inverse), credits cash, deletes the
positions, and marks the market resolved. Losers get nothing.

It runs at the top of every trade, is polled by the client every 2s, and has a
`pg_cron` job every 5s as a backstop for when nobody is in the room.

### Bots

Four bot traders nudge a random market every 5 seconds via `pg_cron`, so the
odds keep moving with nobody connected. This deliberately does **not** rely on
client polling: browsers throttle timers in background tabs to roughly once a
minute, so a backgrounded projector tab would have frozen the board.

`bot_tick()` is rate-limited internally to one nudge per 1.5s, so the extra
client-side poll costs nothing and just acts as a fallback where `pg_cron`
isn't available.

### The résumé desk (🎲)

The dice asks Claude for one candidate card — ticker, inflated title, three
delusional bullets, asking TC, and a tagline — via `POST /api/resume`.

```bash
# .env.local — server-side only, never NEXT_PUBLIC_
ANTHROPIC_API_KEY=sk-ant-...
```

- Model: `claude-opus-4-8`, `effort: low`, no extended thinking. A booth
  visitor is holding a phone waiting for the dice to land, so this is tuned
  for latency, not depth.
- The JSON shape is pinned with **structured outputs** (`output_config.format`),
  not by asking the model to "return strict JSON" — a malformed card can't
  reach the game.
- `asking_tc` is clamped and rounded server-side so money stays on the integer
  path the market uses.
- The prompt deliberately writes the **same confident register** whether the
  seed is impressive or empty, so the card never hints at whether the résumé
  is real. That's what keeps the market honest.

**No key required.** Without `ANTHROPIC_API_KEY` the route returns 503 and the
client silently falls back to the local wordlist generator
(`components/create/wordlists.ts`), showing "résumé desk offline". Same on
network failure or a >9s timeout. The game still runs with the wifi down —
which is the right property for a booth.

Nothing summarizes résumés; the board line-clamps bullets in CSS.

---

## Keeping the secret

`markets.is_real` is the whole game, and it must never leak while a market is
live. RLS alone would not do it — Realtime broadcasts row payloads.

So `anon` gets a **column-level `SELECT` grant that omits `is_real`**. The
column is unreachable over PostgREST *and* never serialized into the websocket
payload. Clients read the `markets_public` view, which exposes `is_real` as
`null` while active and face-up once resolved.

Verify it yourself:

```sql
set role anon;
select is_real from markets limit 1;   -- ERROR: permission denied
select is_real from markets_public;    -- null until resolved
```

---

## Architecture

```
app/                    routes, layout          (lead)
components/providers/   GameProvider            (lead)
components/board/       live board + big screen
components/trade/       trade ticket
components/create/      list your own résumé
components/portfolio/   cash, positions, referrals
components/reveal/      the 0:00 reveal
components/leaderboard/ scoreboards + host panel
lib/types.ts            integer money/odds helpers   FROZEN
lib/supabase.ts         client singleton             FROZEN
lib/db.types.ts         generated                    FROZEN
supabase/migrations/    schema + RPCs                FROZEN
```

`CONTRACT.md` is the interface the UI lanes were built against — schema, RPC
signatures, return shapes, and file ownership.

**One Realtime channel and one resolve poll exist in the whole app**, both
owned by `GameProvider`. Components consume `useGame()` and never subscribe
themselves; N per-component subscriptions thrash the websocket and make the
odds feel laggy, which is the one thing this game cannot be.

### RPCs

All `SECURITY DEFINER`. There are no write policies — every mutation goes
through one of these.

| RPC | Returns |
|---|---|
| `ensure_player(p_id, p_handle)` | `Player` |
| `create_market(p_player, p_title, p_bullets, p_asking_tc, p_is_real)` | market id |
| `trade(p_player, p_market, p_side, p_action, p_shares)` | `{ok, error, prob_yes_bps, cash}` |
| `resolve_expired()` | count resolved |
| `claim_referral(p_code, p_new_player)` | `{ok, error}` |
| `bot_tick()` | nudges a random market |
| `reset_game()` | wipes the board, reseeds bots |

`trade()` locks the market row `FOR UPDATE`, runs `resolve_expired()` first,
and rejects anything already resolved or expired.

---

## Referrals

Each player gets a short unambiguous `ref_code` (no vowels, no `0/O/1/I/L` —
it gets read off a phone screen at a booth). Sharing
`<origin>/?ref=<code>` pays **$50 to both sides**.

`claim_referral` is idempotent and rejects: missing codes, self-referrals,
anyone who already claimed a referral, and anyone who has already traded.

---

## Identity

No auth. A uuid in `localStorage` under `ov_player_id`, created on first
visit and passed to `ensure_player`. Handle lives under `ov_handle`.

---

## Not built

Prompt/voting rounds are a deliberate non-goal for this cut. The schema leaves
room for a future `rounds` table; none of it is implemented.
