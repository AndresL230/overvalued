-- ===========================================================================
-- LIVELIER BOTS
--
-- Three things killed the board ~15 minutes after seed:
--
--   1. Nothing ever re-seeded. seed_game() mints 5 markets on 3/6/9/12/15-min
--      expiries; once the last one resolved, active count sat at 0 forever.
--   2. bot_tick() hardcoded action_pick := 'buy', so every bot trade pushed in
--      one direction. Buy-only pressure is drift, not liveliness.
--   3. Bots had no opinion — side was random() < 0.5 — so a wildly mispriced
--      market never got corrected and the price carried no signal.
--
-- The fix splits "what do I think" from "act on it", at two different speeds:
--
--   /api/bot-leans  (every ~30s, service role, sees is_real)
--         |  one batched Gemini call -> a lean per (bot, market)
--         v
--     bot_leans  ----read---->  bot_tick(3)   (pg_cron, every 5s)
--         ^                          |
--         '-- refresh_at jitter      +- top up bots under $20 -> $100
--             spreads re-opinions    +- re-seed if active < 5 (one market/tick)
--                                    '- trade: buy the lean, or sell to recycle
--
-- A per-tick LLM call would put Gemini latency in the path of every price move,
-- which is the exact failure being fixed. An outage or a missing key therefore
-- degrades the board's *intelligence*, never its *liveliness*: with no lean row
-- bot_tick invents a random one and keeps trading.
--
-- Nothing in trade() or the pricing/probability math is touched. bot_tick calls
-- trade(); it does not reimplement it. Money stays integer cents, probability
-- stays integer basis points.
-- ===========================================================================


-- ---------------------------------------------------------------------------
-- 1. bot_leans — a bot's opinion about a market, not a queued order.
--
-- One row per (bot, market). `lean` is the side this bot favours, `conviction`
-- (1..3) becomes the share size, `refresh_at` is when the opinion goes stale.
--
-- Staggering is the whole point of refresh_at: it is written per ROW as
-- now() + random(45..120s), never per batch, so bots re-form opinions at
-- different moments and the trades they drive trickle in continuously instead
-- of arriving as one synchronized burst followed by dead air.
-- ---------------------------------------------------------------------------
create table if not exists public.bot_leans (
  bot_id     uuid not null references public.players(id) on delete cascade,
  market_id  uuid not null references public.markets(id) on delete cascade,
  lean       text not null check (lean in ('yes','no')),
  conviction int  not null check (conviction between 1 and 3),
  refresh_at timestamptz not null,
  primary key (bot_id, market_id)
);

-- /api/bot-leans selects the pairs that are missing or stale; this is that scan.
create index if not exists bot_leans_refresh_idx on public.bot_leans (refresh_at);

-- ---------------------------------------------------------------------------
-- 2. bot_market_templates — the anti-repetition pool the re-seeder draws from.
--
-- Gemini tops this up ahead of demand so minting a market never waits on an API
-- call; SQL consumes from it instantly. used_at null means never used, and the
-- oldest used_at is recycled first, so the board cycles through the whole pool
-- before anyone sees a repeat.
-- ---------------------------------------------------------------------------
create table if not exists public.bot_market_templates (
  id         bigint generated always as identity primary key,
  title      text    not null,
  bullets    text[]  not null,
  asking_tc  int     not null,
  is_real    boolean not null,
  used_at    timestamptz          -- null = unused; oldest used_at reused first
);

create index if not exists bot_market_templates_used_idx
  on public.bot_market_templates (used_at nulls first);

-- ---------------------------------------------------------------------------
-- Lockdown. Neither table is ever client-read.
--
-- bot_market_templates.is_real is the same secret as markets.is_real: it is the
-- answer to a market that has not been minted yet, so leaking it would be worse
-- than leaking the live one. markets protects it with a column-level grant that
-- omits the column; here there is no grant on the table at all, plus RLS with
-- no policy, so anon and authenticated cannot reach any column by any route —
-- PostgREST or Realtime. The SECURITY DEFINER functions below run as the owner
-- and bypass RLS; service_role (used by /api/bot-leans) has BYPASSRLS and an
-- explicit grant.
-- ---------------------------------------------------------------------------
alter table public.bot_leans             enable row level security;
alter table public.bot_market_templates  enable row level security;

revoke all on public.bot_leans            from anon, authenticated;
revoke all on public.bot_market_templates from anon, authenticated;

grant all on public.bot_leans            to service_role;
grant all on public.bot_market_templates to service_role;
grant usage, select on all sequences in schema public to service_role;

-- /api/bot-leans reads markets.is_real to give each bot an informed lean, and
-- reads players to enumerate the bots. Neither grant existed: the init migration
-- only ever granted anon (column-level, omitting is_real) and left service_role
-- with nothing, so the route could authenticate and still get "permission denied
-- for table players". Without this the Gemini loop degrades to random leans
-- permanently and silently — the board still moves, so nothing looks broken.
--
-- This does not weaken the secret. anon keeps the column-level grant that omits
-- is_real; service_role is server-only and its key never reaches the browser.
grant select on public.players, public.markets to service_role;

-- Neither table joins the realtime publication. Nothing here is client-facing.


-- ---------------------------------------------------------------------------
-- 3. Seed the template pool.
--
-- Same insufferable-LinkedIn register as the seed_game() markets. is_real is
-- deliberately NOT correlated with tone: "Director of Special Projects (scope
-- undisclosed)" is real, "Senior iOS eng, shipped the app in your pocket" is
-- not. If absurdity predicted the answer the game would be trivially solvable
-- from the card alone, which is the failure mode of every clone of this idea.
--
-- Guarded by a not-exists so re-running the migration does not duplicate the
-- pool or clobber used_at bookkeeping.
-- ---------------------------------------------------------------------------
insert into public.bot_market_templates (title, bullets, asking_tc, is_real)
select * from (values
  ('Chief of Staff to the Chief of Staff · asking $380K',
   array[
     'Runs the meeting where we decide which meetings to cancel',
     'Owns the roadmap doc, not the roadmap',
     'Built a Notion database with 41 linked views',
     '"Force multiplier" appears four times in one page'
   ], 380000, false),

  ('Compiler engineer · LLVM backend, 6 yrs · asking $295K',
   array[
     'Landed 130+ patches in the AArch64 backend',
     'Found a miscompile that shipped in three phone OSes',
     'Has no LinkedIn, was found through a mailing list',
     'Writes changelogs longer than the change'
   ], 295000, true),

  ('Head of Founder-Led Growth (the founder is me) · asking $410K',
   array[
     'Grew my personal brand 400%; company revenue flat',
     'Posts a "brutally honest reflection" every Tuesday 9am',
     'Hired a ghostwriter to sound more authentic',
     'Company has two employees, both of them me'
   ], 410000, false),

  ('Payments infra · reconciles $2B/yr in ledger · asking $265K',
   array[
     'Owns the double-entry ledger for six currencies',
     'Caught a 400k cent drift nobody else noticed for a year',
     'Refuses to use floats for money, loudly, in every review',
     'Wrote the runbook the on-call actually opens'
   ], 265000, true),

  ('Community-Led Growth Evangelist · ex-crypto, now agents · asking $550K',
   array[
     'Pivoted the same deck three times without changing a slide',
     'Ran a token launch, then an "AI-native" relaunch',
     'Moderates 11 Discords, active in zero',
     'Bio ends with "views my own (for now)"'
   ], 550000, false),

  ('Data eng who deleted the warehouse and rebuilt it in 6 weeks · asking $255K',
   array[
     'Dropped 900 unused dbt models on purpose',
     'Cut the nightly run from 5h to 26 min',
     'Wrote the incident review of their own outage',
     'Now the only person who understands the lineage graph'
   ], 255000, true),

  ('Director of Special Projects · scope undisclosed · asking $475K',
   array[
     'Reports to the CEO, appears on no org chart',
     'Three-year tenure, zero public artifacts',
     'Every reference call ends with "I can''t really say"',
     'Comp band was created specifically for this hire'
   ], 475000, true),

  ('Senior iOS eng · shipped the app in your pocket · asking $330K',
   array[
     'Owned the checkout flow at 40M MAU',
     'Cut cold start 2.1s → 700ms',
     'Swift concurrency migration, 300k lines',
     'Three WWDC talks, none of them findable'
   ], 330000, false),

  ('Head of AI Strategy & Responsible Velocity · asking $620K',
   array[
     'Authored the AI policy; it is one slide and a vibe',
     'Convened a working group that convened a working group',
     '"Human in the loop" — the human is a Slack channel',
     'Has never opened a terminal, calls this a strength'
   ], 620000, false),

  ('QA lead who caught the bug that would have cost $40M · asking $210K',
   array[
     'Found an off-by-one in the payout path, day before launch',
     'Maintains 1,400 tests and deleted 3,000 more',
     'Files reproductions so good engineers thank them',
     'Was denied a promotion the same quarter'
   ], 210000, true),

  ('Growth PM · 4 experiments, 3 inconclusive, shipped anyway · asking $285K',
   array[
     'Honest about the p-values, which is rarer than it sounds',
     'Killed their own feature after reading the retention curve',
     'Writes the post-mortem before the launch',
     'One win moved signups 11% and they still say "probably noise"'
   ], 285000, true),

  ('Principal Design Technologist & Narrative Systems Lead · asking $460K',
   array[
     'Rebranded the design system twice, shipped neither',
     'Figma file has 812 components, product uses 9',
     'Gave a conference talk titled "Beyond the Button"',
     'Portfolio is a scroll-jacked case study about a case study'
   ], 460000, false),

  ('Kernel dev · Linux mm subsystem · patches upstream · asking $340K',
   array[
     'Maintainer ack on 60+ commits to the page allocator',
     'Bisected a regression across 11 years of history',
     'Email client is mutt and this is non-negotiable',
     'Résumé is a plain text file, 14 lines'
   ], 340000, true),

  ('Head of Remote Culture & Async Rituals · asking $395K',
   array[
     'Invented "Silent Fridays", attendance mandatory',
     'Owns the offsite, the pre-offsite and the offsite retro',
     'Wrote a 40-page handbook nobody has finished',
     'Attrition fell 30% the year they started, which may be a coincidence'
   ], 395000, true),

  ('Technical writer who made the docs people actually read · asking $180K',
   array[
     'Rewrote the getting-started guide; support tickets fell 60%',
     'Reads the source before writing the page',
     'Ships doc PRs alongside the feature, same day',
     'Has opinions about the Oxford comma and is correct'
   ], 180000, false)
) as t(title, bullets, asking_tc, is_real)
where not exists (select 1 from public.bot_market_templates);


-- ---------------------------------------------------------------------------
-- 4. seed_game() — bots seed at $100, not $10,000.
--
-- Identical to the 20260718030000 version except the bankroll. At 1,000,000
-- cents a bot could absorb any human trade without noticing; at 10,000 the
-- per-trade price impact is comparable, so a human's $100 stake is meaningful
-- against them.
--
-- $100 drains — a bot holding shares in a market that resolves against it loses
-- that cash permanently — which is exactly why bot_tick() tops up. Bot cash is
-- invisible to players anyway; is_bot already excludes them from the
-- leaderboard, and that filter must keep working, so is_bot stays true here.
-- ---------------------------------------------------------------------------
create or replace function public.seed_game() returns void
language plpgsql security definer set search_path = public as $$
declare
  bot_id uuid;
begin
  insert into public.players (id, handle, cash, is_bot) values
    ('b0000000-0000-4000-8000-000000000001', 'RecruiterBot',   10000, true),
    ('b0000000-0000-4000-8000-000000000002', 'VC_Tourist',     10000, true),
    ('b0000000-0000-4000-8000-000000000003', 'ex-FAANG_Guy',   10000, true),
    ('b0000000-0000-4000-8000-000000000004', 'Anon_Degen',     10000, true)
  on conflict (id) do update set cash = 10000, is_bot = true;

  bot_id := 'b0000000-0000-4000-8000-000000000001';

  insert into public.markets
    (title, bullets, asking_tc, is_real, expires_at, author_id, ticker, tagline) values
  ('Chief Vibes Architect · asking $450K',
   array[
     'Owned "culture" at a 6-person startup that never shipped',
     'Certified Scrum Master (expired 2019)',
     'Coined the phrase "radical candor, but chill"',
     'Reports directly to the founder''s dog'
   ], 450000, false, now() + interval '3 minutes', bot_id,
   'VIBE', 'Ex-FAANG (adjacent). Currently between disruptions.'),

  ('Staff SRE · kept prod up through 3 acquisitions · asking $310K',
   array[
     'On-call rotation for 40k RPS payments tier',
     'Wrote the postmortem template the whole org still uses',
     'Cut p99 latency 380ms → 42ms',
     'Has never once said the word "synergy"'
   ], 310000, true, now() + interval '6 minutes', bot_id,
   'SRE', 'Kept the pager quiet for six years.'),

  ('Web3 Growth Alchemist → now "AI-Native" · asking $600K',
   array[
     'Scaled a Discord to 90k members (85k bots)',
     '"Exited" 4 companies, all of them to zero',
     'Rewrote LinkedIn headline 11 times this quarter',
     'Currently building in stealth (unemployed)'
   ], 600000, false, now() + interval '9 minutes', bot_id,
   'WEB3', 'Building in stealth. Very stealth.'),

  ('Backend eng, 8 yrs, boring and correct · asking $240K',
   array[
     'Maintains a Postgres extension you have probably used',
     'Zero side projects, zero newsletter, zero takes',
     'Migrated a 4TB monolith DB with 11 minutes of downtime',
     'Answers Slack within the hour, every time'
   ], 240000, true, now() + interval '12 minutes', bot_id,
   'BORE', 'No newsletter. No takes. Ships.'),

  ('Founding Prompt Engineer & Head of Thought · asking $525K',
   array[
     '"Trained" GPT-4 (used the API)',
     '2.1M impressions on a thread about impressions',
     'Advisor to 14 pre-seed companies, equity in none',
     'Résumé is one page because it is mostly whitespace'
   ], 525000, false, now() + interval '15 minutes', bot_id,
   'PRMT', 'Thought leader, mostly to myself.');
end $$;


-- ---------------------------------------------------------------------------
-- 5. bot_tick(p_nudges int default 1)
--
-- The default is load-bearing: HostPanel and GameProvider both call
-- supabase.rpc('bot_tick') with no args, and CONTRACT.md documents that
-- signature. The old zero-arg function is dropped first — keeping both would
-- leave two overloads for PostgREST to choose between, and lib/db.types.ts
-- (deliberately not regenerated) still declares `Args: never`. A no-argument
-- call resolves to this function with p_nudges defaulted, so every existing
-- call site keeps working unchanged.
--
-- pg_cron calls bot_tick(3).
-- ---------------------------------------------------------------------------
drop function if exists public.bot_tick();

create or replace function public.bot_tick(p_nudges int default 1) returns json
language plpgsql security definer set search_path = public as $$
declare
  bot_ids     uuid[] := array[
    'b0000000-0000-4000-8000-000000000001'::uuid,
    'b0000000-0000-4000-8000-000000000002'::uuid,
    'b0000000-0000-4000-8000-000000000003'::uuid,
    'b0000000-0000-4000-8000-000000000004'::uuid
  ];
  n_loops     int;
  i           int;
  last_bot_ts timestamptz;
  active_ct   int;
  tpl         public.bot_market_templates%rowtype;
  target      uuid;
  bot         uuid;
  v_lean      text;
  v_conv      int;
  opp_side    text;
  held_opp    int;
  side_pick   text;
  action_pick text;
  n_shares    int;
  n_trades    int := 0;
  n_minted    int := 0;
  n_topped    int := 0;
  n_skipped   int := 0;
  topped      int;
begin
  -- Only one bot_tick may run at a time, process-wide.
  --
  -- Without this, two concurrent ticks deadlock. trade() takes `players ... for
  -- update` on the bot it is trading as, and a multi-nudge tick holds that lock
  -- for the rest of the transaction. Two ticks that pick the same two bots in
  -- opposite orders form a circular wait, and Postgres kills one:
  --
  --   deadlock detected ... while locking tuple in relation "players"
  --   PL/pgSQL function trade(...) line 28 / bot_tick(integer) line 199
  --
  -- Observed, not theoretical. Overlap is the normal case, not an edge case:
  -- pg_cron fires every 5s and a bot_tick(3) holds locks for 1.4-2.4s of that
  -- window, plus CONTRACT.md still documents client polling of bot_tick as a
  -- fallback. The victim tick aborts and its trades are silently lost, so the
  -- board just quietly moves less than it should.
  --
  -- Serialising is the correct semantics anyway: this is a background nudge
  -- loop, and two simultaneous ticks were never wanted. A *transactional* try-
  -- lock releases on commit or abort, so a crashed tick cannot wedge the loop.
  if not pg_try_advisory_xact_lock(hashtext('overvalued.bot_tick')::bigint) then
    return json_build_object('ok', true, 'skipped', true, 'reason', 'tick already running');
  end if;

  -- clamp: p_nudges is reachable from anon, and each nudge sleeps up to 1.2s,
  -- so an unbounded value would pin a connection and hold row locks for
  -- however long the caller asked for.
  n_loops := greatest(1, least(10, coalesce(p_nudges, 1)));

  for i in 1..n_loops loop
    -- Spread the nudges across the 5s cron window instead of firing three
    -- trades in the same millisecond. ~one trade every 1.7s.
    if i > 1 then
      perform pg_sleep(0.3 + random() * 0.9);   -- 0.3 .. 1.2 s
    end if;

    -- --- 1. top up ---------------------------------------------------------
    -- A bot that resolves on the wrong side loses that cash for good, so
    -- without this the board eventually stalls on four broke bots. Under $20
    -- goes straight back to $100.
    update public.players
       set cash = 10000
     where is_bot and cash < 2000;
    get diagnostics topped = row_count;
    n_topped := n_topped + topped;

    -- --- 2. re-seed --------------------------------------------------------
    -- EXACTLY ONE market per tick, never a batch, so new cards appear
    -- staggered and the reveals stay spaced out rather than arriving in a
    -- clump five minutes later.
    select count(*) into active_ct
      from public.markets
     where status = 'active' and expires_at > now();

    if active_ct < 5 then
      -- unused first, then least-recently-used; random() breaks ties so the
      -- pool does not always come out in the same order.
      select * into tpl
        from public.bot_market_templates
       order by used_at nulls first, random()
       limit 1
         for update skip locked;

      if found then
        insert into public.markets
          (title, bullets, asking_tc, is_real, prob_yes_bps, expires_at, author_id, ticker)
        values (
          tpl.title,
          tpl.bullets,
          tpl.asking_tc,
          tpl.is_real,
          5000,
          -- 3..12 minutes: short enough that a reveal is always near, long
          -- enough that a market has time to actually move.
          now() + make_interval(secs => 180 + random() * 540),
          bot_ids[1],
          -- bot_market_templates has no ticker column (the schema is pinned and
          -- another lane inserts into it), so derive a display symbol from the
          -- title. markets.ticker is nullable and the UI falls back to
          -- marketCode(id), so a null here would be safe too — this is purely
          -- so a minted card reads like a seeded one.
          nullif(upper(substr(regexp_replace(tpl.title, '[^A-Za-z]', '', 'g'), 1, 4)), '')
        );

        update public.bot_market_templates
           set used_at = now()
         where id = tpl.id;

        n_minted := n_minted + 1;
      end if;
    end if;

    -- --- 3. trade ----------------------------------------------------------
    -- Global rate floor, 1500ms -> 400ms. It exists so residual client polling
    -- cannot multiply the movement (N tabs must not produce N x the trades),
    -- not to throttle this call's own nudges.
    --
    -- Two subtleties, both of which silently broke the multi-nudge loop when
    -- this was written the obvious way:
    --
    --  * now() is transaction_timestamp() — frozen for the whole call. So is
    --    the default on trades.ts. Nudge 1's trade therefore lands with
    --    ts = now() exactly, and nudges 2..n each read last_bot_ts = now(),
    --    fail `> now() - 400ms`, and skip. bot_tick(3) yielded ONE trade.
    --    clock_timestamp() advances, so the comparison uses that.
    --  * Even with a live clock, the pg_sleep between nudges is 0.3..1.2s and
    --    the floor is 400ms, so a short sleep would still eat its own nudge.
    --    Intra-call pacing is what pg_sleep is FOR; the floor only has to
    --    fence this call against other callers, so it runs once, on entry.
    if i = 1 then
      select max(ts) into last_bot_ts
        from public.trades t
        join public.players p on p.id = t.player_id
       where p.is_bot;

      if last_bot_ts is not null
         and last_bot_ts > clock_timestamp() - interval '400 milliseconds' then
        n_skipped := n_skipped + 1;
        continue;
      end if;
    end if;

    select id into target
      from public.markets
     where status = 'active' and expires_at > now()
     order by random()
     limit 1;

    if target is null then
      n_skipped := n_skipped + 1;
      continue;
    end if;

    bot := bot_ids[1 + floor(random() * array_length(bot_ids, 1))::int];

    -- The bot's opinion, written by /api/bot-leans from a Gemini call.
    -- refresh_at is the design's own definition of when an opinion goes stale,
    -- so a lapsed row counts as no opinion at all.
    select bl.lean, bl.conviction into v_lean, v_conv
      from public.bot_leans bl
     where bl.bot_id = bot
       and bl.market_id = target
       and bl.refresh_at > now();

    if not found then
      -- THE DEGRADED PATH, and it must work standalone: no GEMINI_API_KEY, a
      -- timed-out route, or simply a market minted since the last lean run.
      -- Invent a random opinion and persist it so the bot stays consistent
      -- with itself until the LLM has something better to say.
      --
      -- Re-rolling on staleness (not only on a missing row) is what makes the
      -- Gemini-down path produce SELLs at all: a bot only ever buys its lean
      -- side, so if the lean never moved it could never come to hold
      -- opposite-side shares, the recycle branch below would be dead code, and
      -- the buy-only monotonic drift this migration exists to kill would
      -- survive intact with the LLM offline. Gemini overwrites these rows on
      -- its next 30s pass; racing it costs nothing, since by refresh_at the
      -- old opinion was expired either way.
      v_lean := case when random() < 0.5 then 'yes' else 'no' end;
      v_conv := 1 + floor(random() * 3)::int;   -- 1..3

      insert into public.bot_leans (bot_id, market_id, lean, conviction, refresh_at)
      values (bot, target, v_lean, v_conv,
              -- per-row jitter, never per-batch: this is what keeps the
              -- re-opinion wave from arriving as one synchronized burst.
              now() + make_interval(secs => 45 + random() * 75))
      on conflict (bot_id, market_id) do update
        set lean       = excluded.lean,
            conviction = excluded.conviction,
            refresh_at = excluded.refresh_at;
    end if;

    opp_side := case when v_lean = 'yes' then 'no' else 'yes' end;

    select case when opp_side = 'yes' then pos.yes else pos.no end
      into held_opp
      from public.positions pos
     where pos.player_id = bot and pos.market_id = target;

    if coalesce(held_opp, 0) > 0 and random() < 0.30 then
      -- Recycle: dump shares the bot no longer believes in. This is what puts
      -- 'sell' into the trade feed at all, and with it two-sided price
      -- movement instead of the old monotonic buy-only drift.
      action_pick := 'sell';
      side_pick   := opp_side;
      n_shares    := least(held_opp, v_conv);
    else
      action_pick := 'buy';
      side_pick   := v_lean;
      n_shares    := v_conv;
    end if;

    -- trade() owns all pricing, clamping, position and cash math. Never
    -- reimplement it here.
    perform public.trade(bot, target, side_pick, action_pick, n_shares);
    n_trades := n_trades + 1;
  end loop;

  return json_build_object(
    'ok', true,
    'skipped', n_trades = 0,
    'nudges', n_loops,
    'trades', n_trades,
    'minted', n_minted,
    'topped_up', n_topped,
    'no_ops', n_skipped
  );
end $$;

grant execute on function public.bot_tick(int) to anon, authenticated;


-- ---------------------------------------------------------------------------
-- 6. Where pg_net should POST the lean refresh.
--
-- Overridable per environment without editing a migration:
--   alter database postgres set app.bot_leans_url = 'https://…/api/bot-leans';
-- The default is the host-side Next dev server as seen from inside the
-- Supabase Postgres container.
-- ---------------------------------------------------------------------------
create or replace function public.bot_leans_url() returns text
language sql stable as $$
  select coalesce(
    nullif(current_setting('app.bot_leans_url', true), ''),
    'http://host.docker.internal:3000/api/bot-leans'
  )
$$;


-- ---------------------------------------------------------------------------
-- 7. Scheduling.
--
-- Same guard pattern as 20260718020000: every scheduling statement sits inside
-- `exception when others then raise notice`, so a platform without pg_cron or
-- pg_net still applies this migration cleanly. Without pg_net the leans table
-- simply never gets an LLM opinion and bot_tick falls back to random leans —
-- the board is dumber, not deader. Vercel Cron is the deploy-time alternative
-- for the /api/bot-leans half.
-- ---------------------------------------------------------------------------
do $$
begin
  -- unschedule throws if the job does not exist, so it gets its own guard
  -- rather than aborting the reschedule below.
  begin
    perform cron.unschedule('overvalued-bots');
  exception when others then
    raise notice 'no existing overvalued-bots job (%)', sqlerrm;
  end;

  perform cron.schedule('overvalued-bots', '5 seconds', 'select public.bot_tick(3);');
exception when others then
  raise notice 'pg_cron scheduling unavailable (%), relying on client polling', sqlerrm;
end $$;

do $$
begin
  create extension if not exists pg_net;

  begin
    perform cron.unschedule('overvalued-bot-leans');
  exception when others then
    raise notice 'no existing overvalued-bot-leans job (%)', sqlerrm;
  end;

  perform cron.schedule(
    'overvalued-bot-leans',
    '30 seconds',
    $cron$
      select net.http_post(
        url     := public.bot_leans_url(),
        headers := '{"Content-Type": "application/json"}'::jsonb,
        body    := '{}'::jsonb,
        timeout_milliseconds := 8000
      )
    $cron$
  );
exception when others then
  raise notice 'pg_net/pg_cron unavailable (%), bots fall back to random leans', sqlerrm;
end $$;
