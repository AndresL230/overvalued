-- ============================================================================
-- OVERVALUED — binary prediction market on résumés
-- ============================================================================
-- ASSUMPTIONS (hackathon scope):
--  * No auth. Identity is a client-generated uuid held in localStorage.
--  * All money in integer CENTS. All probability in integer BASIS POINTS.
--    No floats anywhere in the money/probability path.
--  * RLS is permissive (anon can do everything through the RPCs), but the
--    `is_real` column is protected by COLUMN-LEVEL grants, not RLS, so it is
--    physically unreachable by anon over PostgREST *and* over Realtime.
--  * Schema left open to a future `rounds` table (not built).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Tunables
-- ---------------------------------------------------------------------------
-- DEPTH controls how violently the odds move. Each share moves the market by
-- (10000 / DEPTH) basis points. DEPTH=80 => 125 bps (1.25pp) per share, so a
-- 10-share buy swings the market 12.5 points. Punchy on purpose: this is a
-- party game, not a real exchange. Lower = swingier.
create or replace function public.game_depth() returns int
  language sql immutable as $$ select 80 $$;

-- Probability is clamped to this band so a market is never a dead certainty
-- and there is always a trade to make.
create or replace function public.bps_floor() returns int
  language sql immutable as $$ select 200 $$;
create or replace function public.bps_ceil() returns int
  language sql immutable as $$ select 9800 $$;

-- Every market lives for exactly 15 minutes from creation.
create or replace function public.market_ttl() returns interval
  language sql immutable as $$ select interval '15 minutes' $$;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
create table if not exists public.players (
  id          uuid primary key,
  handle      text        not null,
  cash        int         not null default 10000,   -- cents. everyone starts at $100
  ref_code    text        not null unique,
  is_bot      boolean     not null default false,
  created_at  timestamptz not null default now()
);

create table if not exists public.markets (
  id            uuid primary key default gen_random_uuid(),
  title         text        not null,
  bullets       text[]      not null default '{}',
  asking_tc     int         not null default 0,     -- asking total comp, in whole dollars
  is_real       boolean     not null,               -- THE SECRET. never exposed while active.
  prob_yes_bps  int         not null default 5000,
  expires_at    timestamptz not null,
  status        text        not null default 'active',
  author_id     uuid        references public.players(id) on delete set null,
  created_at    timestamptz not null default now(),
  constraint markets_status_chk check (status in ('active','resolved')),
  constraint markets_bps_chk    check (prob_yes_bps between 0 and 10000)
);
create index if not exists markets_status_expires_idx on public.markets (status, expires_at);

create table if not exists public.positions (
  player_id  uuid not null references public.players(id) on delete cascade,
  market_id  uuid not null references public.markets(id) on delete cascade,
  yes        int  not null default 0,
  no         int  not null default 0,
  primary key (player_id, market_id),
  constraint positions_nonneg_chk check (yes >= 0 and no >= 0)
);

create table if not exists public.trades (
  id           bigint generated always as identity primary key,
  player_id    uuid not null references public.players(id) on delete cascade,
  market_id    uuid not null references public.markets(id) on delete cascade,
  side         text not null,   -- 'yes' | 'no'
  action       text not null,   -- 'buy' | 'sell'
  shares       int  not null,
  price_cents  int  not null,   -- marginal price paid per share for the whole fill
  ts           timestamptz not null default now(),
  constraint trades_side_chk   check (side in ('yes','no')),
  constraint trades_action_chk check (action in ('buy','sell')),
  constraint trades_shares_chk check (shares > 0)
);
create index if not exists trades_market_ts_idx on public.trades (market_id, ts desc);
create index if not exists trades_player_idx    on public.trades (player_id);

create table if not exists public.referrals (
  id          bigint generated always as identity primary key,
  code        text not null,
  referrer_id uuid not null references public.players(id) on delete cascade,
  referee_id  uuid not null references public.players(id) on delete cascade,
  claimed     boolean not null default true,
  ts          timestamptz not null default now(),
  -- one claim per referee, ever. this is what makes claim_referral idempotent.
  constraint referrals_one_per_referee unique (referee_id)
);

-- ---------------------------------------------------------------------------
-- ref_code generation
-- ---------------------------------------------------------------------------
create or replace function public.gen_ref_code() returns text
language plpgsql as $$
declare
  -- no vowels, no 0/O/1/I/L — unambiguous when read off a phone screen at a booth
  alphabet text := '23456789BCDFGHJKMNPQRSTVWXYZ';
  code text;
  i int;
begin
  loop
    code := '';
    for i in 1..5 loop
      code := code || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    end loop;
    exit when not exists (select 1 from public.players where ref_code = code);
  end loop;
  return code;
end $$;

create or replace function public.players_set_ref_code() returns trigger
language plpgsql as $$
begin
  if new.ref_code is null or new.ref_code = '' then
    new.ref_code := public.gen_ref_code();
  end if;
  return new;
end $$;

drop trigger if exists players_ref_code_trg on public.players;
create trigger players_ref_code_trg
  before insert on public.players
  for each row execute function public.players_set_ref_code();

-- ref_code is NOT NULL, so give it a placeholder default the trigger overwrites.
alter table public.players alter column ref_code set default '';

-- ---------------------------------------------------------------------------
-- markets_public — the ONLY market surface clients are allowed to read.
-- is_real is NULL while the market is active, and face-up once resolved.
-- The view is SECURITY DEFINER by default (security_invoker = off), so it can
-- read the is_real column that anon has no grant on.
-- ---------------------------------------------------------------------------
create or replace view public.markets_public as
select
  m.id,
  m.title,
  m.bullets,
  m.asking_tc,
  m.prob_yes_bps,
  m.expires_at,
  m.status,
  m.author_id,
  m.created_at,
  case when m.status = 'resolved' then m.is_real else null end as is_real
from public.markets m;

-- ---------------------------------------------------------------------------
-- resolve_expired() — lazy resolution. No always-on server required.
-- Flips is_real face-up, pays every position, wipes positions, marks resolved.
-- YES pays 100c if real else 0. NO is the inverse. Losers get nothing.
-- ---------------------------------------------------------------------------
create or replace function public.resolve_expired() returns int
language plpgsql security definer set search_path = public as $$
declare
  m record;
  n int := 0;
begin
  for m in
    select id, is_real
      from public.markets
     where status = 'active'
       and expires_at <= now()
     order by id
     for update skip locked
  loop
    -- credit winners. one UPDATE per market, not per player.
    update public.players p
       set cash = p.cash + pay.amount
      from (
        select pos.player_id,
               case when m.is_real then pos.yes * 100 else pos.no * 100 end as amount
          from public.positions pos
         where pos.market_id = m.id
      ) pay
     where p.id = pay.player_id
       and pay.amount > 0;

    delete from public.positions where market_id = m.id;
    update public.markets set status = 'resolved' where id = m.id;
    n := n + 1;
  end loop;
  return n;
end $$;

-- ---------------------------------------------------------------------------
-- create_market()
-- ---------------------------------------------------------------------------
create or replace function public.create_market(
  p_player    uuid,
  p_title     text,
  p_bullets   text[],
  p_asking_tc int,
  p_is_real   boolean
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  new_id uuid;
begin
  if p_title is null or btrim(p_title) = '' then
    raise exception 'title required';
  end if;

  insert into public.markets (title, bullets, asking_tc, is_real, prob_yes_bps, expires_at, author_id)
  values (
    btrim(p_title),
    coalesce(p_bullets, '{}'),
    coalesce(p_asking_tc, 0),
    coalesce(p_is_real, false),
    5000,
    now() + public.market_ttl(),
    p_player
  )
  returning id into new_id;

  return new_id;
end $$;

-- ---------------------------------------------------------------------------
-- trade() — the whole exchange, O(1), no order book.
-- Marginal price applies to the entire fill. Intentional.
-- ---------------------------------------------------------------------------
create or replace function public.trade(
  p_player uuid,
  p_market uuid,
  p_side   text,
  p_action text,
  p_shares int
) returns json
language plpgsql security definer set search_path = public as $$
declare
  m            public.markets%rowtype;
  pl           public.players%rowtype;
  pos          public.positions%rowtype;
  price_yes    int;
  price_no     int;
  unit_price   int;
  gross        int;
  bps_step     int;
  bps_delta    int;
  new_bps      int;
  held         int;
begin
  -- every trade first sweeps up anything that has expired
  perform public.resolve_expired();

  if p_shares is null or p_shares <= 0 then
    return json_build_object('ok', false, 'error', 'shares must be a positive integer');
  end if;
  if p_side not in ('yes','no') then
    return json_build_object('ok', false, 'error', 'side must be yes or no');
  end if;
  if p_action not in ('buy','sell') then
    return json_build_object('ok', false, 'error', 'action must be buy or sell');
  end if;

  select * into pl from public.players where id = p_player for update;
  if not found then
    return json_build_object('ok', false, 'error', 'unknown player');
  end if;

  -- lock the market so concurrent traders serialize on the price
  select * into m from public.markets where id = p_market for update;
  if not found then
    return json_build_object('ok', false, 'error', 'unknown market');
  end if;
  if m.status <> 'active' then
    return json_build_object('ok', false, 'error', 'market already resolved');
  end if;
  if m.expires_at <= now() then
    return json_build_object('ok', false, 'error', 'reference check is in progress');
  end if;

  price_yes := round(m.prob_yes_bps::numeric / 100)::int;
  price_no  := 100 - price_yes;
  unit_price := case when p_side = 'yes' then price_yes else price_no end;
  gross := unit_price * p_shares;

  select * into pos from public.positions
   where player_id = p_player and market_id = p_market;
  if not found then
    pos.yes := 0;
    pos.no  := 0;
  end if;

  bps_step := 10000 / public.game_depth();

  if p_action = 'buy' then
    if pl.cash < gross then
      return json_build_object('ok', false, 'error', 'not enough cash');
    end if;
    -- buying YES pushes probability up, buying NO pushes it down
    bps_delta := case when p_side = 'yes' then bps_step * p_shares
                      else -bps_step * p_shares end;

    insert into public.positions (player_id, market_id, yes, no)
    values (p_player, p_market,
            case when p_side = 'yes' then p_shares else 0 end,
            case when p_side = 'no'  then p_shares else 0 end)
    on conflict (player_id, market_id) do update
      set yes = public.positions.yes + excluded.yes,
          no  = public.positions.no  + excluded.no;

    update public.players set cash = cash - gross where id = p_player
      returning cash into pl.cash;

  else -- sell
    held := case when p_side = 'yes' then pos.yes else pos.no end;
    if held < p_shares then
      return json_build_object('ok', false, 'error', 'you do not own that many shares');
    end if;
    -- selling is the mirror of buying
    bps_delta := case when p_side = 'yes' then -bps_step * p_shares
                      else bps_step * p_shares end;

    update public.positions
       set yes = yes - (case when p_side = 'yes' then p_shares else 0 end),
           no  = no  - (case when p_side = 'no'  then p_shares else 0 end)
     where player_id = p_player and market_id = p_market;

    update public.players set cash = cash + gross where id = p_player
      returning cash into pl.cash;
  end if;

  new_bps := greatest(public.bps_floor(),
                      least(public.bps_ceil(), m.prob_yes_bps + bps_delta));

  update public.markets set prob_yes_bps = new_bps where id = p_market;

  insert into public.trades (player_id, market_id, side, action, shares, price_cents)
  values (p_player, p_market, p_side, p_action, p_shares, unit_price);

  return json_build_object(
    'ok', true,
    'error', null,
    'prob_yes_bps', new_bps,
    'cash', pl.cash,
    'price_cents', unit_price,
    'shares', p_shares
  );
end $$;

-- ---------------------------------------------------------------------------
-- claim_referral() — 5000c to BOTH sides. Idempotent.
-- ---------------------------------------------------------------------------
create or replace function public.claim_referral(
  p_code    text,
  p_new_player uuid
) returns json
language plpgsql security definer set search_path = public as $$
declare
  referrer public.players%rowtype;
  existing public.referrals%rowtype;
  code_norm text;
begin
  code_norm := upper(btrim(coalesce(p_code, '')));
  if code_norm = '' then
    return json_build_object('ok', false, 'error', 'no code');
  end if;

  -- idempotency: replaying the exact same claim is a no-op success
  select * into existing from public.referrals where referee_id = p_new_player;
  if found then
    if existing.code = code_norm then
      return json_build_object('ok', true, 'error', null, 'already_claimed', true);
    end if;
    return json_build_object('ok', false, 'error', 'you already used a referral');
  end if;

  select * into referrer from public.players where ref_code = code_norm;
  if not found then
    return json_build_object('ok', false, 'error', 'invalid code');
  end if;
  if referrer.id = p_new_player then
    return json_build_object('ok', false, 'error', 'no self-referrals, nice try');
  end if;
  if not exists (select 1 from public.players where id = p_new_player) then
    return json_build_object('ok', false, 'error', 'unknown player');
  end if;
  -- must be a genuinely fresh account: no trades, no positions
  if exists (select 1 from public.trades where player_id = p_new_player)
     or exists (select 1 from public.positions where player_id = p_new_player) then
    return json_build_object('ok', false, 'error', 'too late — you already traded');
  end if;

  insert into public.referrals (code, referrer_id, referee_id, claimed)
  values (code_norm, referrer.id, p_new_player, true);

  update public.players set cash = cash + 5000
   where id in (referrer.id, p_new_player);

  return json_build_object('ok', true, 'error', null, 'already_claimed', false);
exception
  when unique_violation then
    -- lost a race with a concurrent identical claim; treat as already done
    return json_build_object('ok', true, 'error', null, 'already_claimed', true);
end $$;

-- ---------------------------------------------------------------------------
-- ensure_player() — create-on-first-visit. Returns the player row.
-- ---------------------------------------------------------------------------
create or replace function public.ensure_player(
  p_id     uuid,
  p_handle text
) returns json
language plpgsql security definer set search_path = public as $$
declare
  pl public.players%rowtype;
begin
  select * into pl from public.players where id = p_id;
  if found then
    -- allow a rename, but never reset cash
    if p_handle is not null and btrim(p_handle) <> '' and btrim(p_handle) <> pl.handle then
      update public.players set handle = btrim(p_handle) where id = p_id
        returning * into pl;
    end if;
  else
    insert into public.players (id, handle)
    values (p_id, coalesce(nullif(btrim(p_handle), ''), 'anon'))
    returning * into pl;
  end if;

  return json_build_object(
    'id', pl.id, 'handle', pl.handle, 'cash', pl.cash,
    'ref_code', pl.ref_code, 'created_at', pl.created_at
  );
end $$;

-- ---------------------------------------------------------------------------
-- SEED — bot players + 5 cursed markets on staggered expiries
-- ---------------------------------------------------------------------------
create or replace function public.seed_game() returns void
language plpgsql security definer set search_path = public as $$
declare
  bot_id uuid;
begin
  -- bot traders. stable uuids so reseeding is idempotent.
  insert into public.players (id, handle, cash, is_bot) values
    ('b0000000-0000-4000-8000-000000000001', 'RecruiterBot',   1000000, true),
    ('b0000000-0000-4000-8000-000000000002', 'VC_Tourist',     1000000, true),
    ('b0000000-0000-4000-8000-000000000003', 'ex-FAANG_Guy',   1000000, true),
    ('b0000000-0000-4000-8000-000000000004', 'Anon_Degen',     1000000, true)
  on conflict (id) do update set cash = 1000000, is_bot = true;

  bot_id := 'b0000000-0000-4000-8000-000000000001';

  -- staggered expiries so the booth gets a reveal every ~3 minutes
  insert into public.markets (title, bullets, asking_tc, is_real, expires_at, author_id) values
  ('Chief Vibes Architect · asking $450K',
   array[
     'Owned "culture" at a 6-person startup that never shipped',
     'Certified Scrum Master (expired 2019)',
     'Coined the phrase "radical candor, but chill"',
     'Reports directly to the founder''s dog'
   ], 450000, false, now() + interval '3 minutes', bot_id),

  ('Staff SRE · kept prod up through 3 acquisitions · asking $310K',
   array[
     'On-call rotation for 40k RPS payments tier',
     'Wrote the postmortem template the whole org still uses',
     'Cut p99 latency 380ms → 42ms',
     'Has never once said the word "synergy"'
   ], 310000, true, now() + interval '6 minutes', bot_id),

  ('Web3 Growth Alchemist → now "AI-Native" · asking $600K',
   array[
     'Scaled a Discord to 90k members (85k bots)',
     '"Exited" 4 companies, all of them to zero',
     'Rewrote LinkedIn headline 11 times this quarter',
     'Currently building in stealth (unemployed)'
   ], 600000, false, now() + interval '9 minutes', bot_id),

  ('Backend eng, 8 yrs, boring and correct · asking $240K',
   array[
     'Maintains a Postgres extension you have probably used',
     'Zero side projects, zero newsletter, zero takes',
     'Migrated a 4TB monolith DB with 11 minutes of downtime',
     'Answers Slack within the hour, every time'
   ], 240000, true, now() + interval '12 minutes', bot_id),

  ('Founding Prompt Engineer & Head of Thought · asking $525K',
   array[
     '"Trained" GPT-4 (used the API)',
     '2.1M impressions on a thread about impressions',
     'Advisor to 14 pre-seed companies, equity in none',
     'Résumé is one page because it is mostly whitespace'
   ], 525000, false, now() + interval '15 minutes', bot_id);
end $$;

-- ---------------------------------------------------------------------------
-- bot_tick() — nudges a random active market so odds are never still.
-- Rate-limited internally (max one nudge per BOT_COOLDOWN) so that N connected
-- clients polling this concurrently does NOT produce N times the movement.
-- ---------------------------------------------------------------------------
create or replace function public.bot_tick() returns json
language plpgsql security definer set search_path = public as $$
declare
  last_bot_ts timestamptz;
  target      uuid;
  bot         uuid;
  side_pick   text;
  action_pick text;
  n_shares    int;
  bot_ids     uuid[] := array[
    'b0000000-0000-4000-8000-000000000001'::uuid,
    'b0000000-0000-4000-8000-000000000002'::uuid,
    'b0000000-0000-4000-8000-000000000003'::uuid,
    'b0000000-0000-4000-8000-000000000004'::uuid
  ];
begin
  select max(ts) into last_bot_ts
    from public.trades t
    join public.players p on p.id = t.player_id
   where p.is_bot;

  if last_bot_ts is not null and last_bot_ts > now() - interval '1500 milliseconds' then
    return json_build_object('ok', true, 'skipped', true);
  end if;

  select id into target
    from public.markets
   where status = 'active' and expires_at > now()
   order by random()
   limit 1;

  if target is null then
    return json_build_object('ok', true, 'skipped', true);
  end if;

  bot         := bot_ids[1 + floor(random() * array_length(bot_ids, 1))::int];
  side_pick   := case when random() < 0.5 then 'yes' else 'no' end;
  action_pick := 'buy';                       -- bots only buy; keeps positions non-negative
  n_shares    := 1 + floor(random() * 3)::int; -- 1..3 shares => 1.25pp .. 3.75pp nudge

  perform public.trade(bot, target, side_pick, action_pick, n_shares);
  return json_build_object('ok', true, 'skipped', false);
end $$;

-- ---------------------------------------------------------------------------
-- reset_game() — wipe the board, keep humans, reseed bots. For the host panel.
-- ---------------------------------------------------------------------------
create or replace function public.reset_game() returns void
language plpgsql security definer set search_path = public as $$
begin
  truncate table public.positions, public.trades, public.referrals restart identity;
  delete from public.markets;
  -- humans keep their identity + ref_code, but go back to a fresh $100
  update public.players set cash = 10000;
  perform public.seed_game();
end $$;

-- ---------------------------------------------------------------------------
-- Grants / RLS  (permissive — hackathon, no auth)
-- ---------------------------------------------------------------------------
alter table public.players   enable row level security;
alter table public.markets   enable row level security;
alter table public.positions enable row level security;
alter table public.trades    enable row level security;
alter table public.referrals enable row level security;

drop policy if exists anon_read_players   on public.players;
drop policy if exists anon_read_markets   on public.markets;
drop policy if exists anon_read_positions on public.positions;
drop policy if exists anon_read_trades    on public.trades;
drop policy if exists anon_read_referrals on public.referrals;

create policy anon_read_players   on public.players   for select using (true);
create policy anon_read_markets   on public.markets   for select using (true);
create policy anon_read_positions on public.positions for select using (true);
create policy anon_read_trades    on public.trades    for select using (true);
create policy anon_read_referrals on public.referrals for select using (true);

-- Writes happen ONLY through SECURITY DEFINER rpcs, so no write policies exist.

grant usage on schema public to anon, authenticated;

grant select on public.players, public.positions, public.trades, public.referrals
  to anon, authenticated;

-- THE IMPORTANT ONE: column-level select on markets that OMITS is_real.
-- This is what makes the secret unreachable over both PostgREST and Realtime —
-- Supabase Realtime respects column privileges, so is_real is never even
-- serialized into the websocket payload.
revoke all on public.markets from anon, authenticated;
grant select (id, title, bullets, asking_tc, prob_yes_bps, expires_at, status, author_id, created_at)
  on public.markets to anon, authenticated;

-- Clients read markets through this and only this.
grant select on public.markets_public to anon, authenticated;

grant execute on function
  public.ensure_player(uuid, text),
  public.create_market(uuid, text, text[], int, boolean),
  public.trade(uuid, uuid, text, text, int),
  public.resolve_expired(),
  public.claim_referral(text, uuid),
  public.bot_tick(),
  public.reset_game(),
  public.seed_game()
  to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Realtime on markets — this is what makes odds move in every tab at once.
-- ---------------------------------------------------------------------------
alter table public.markets replica identity full;
do $$
begin
  alter publication supabase_realtime add table public.markets;
exception when duplicate_object then null;
end $$;

-- ---------------------------------------------------------------------------
-- pg_cron backup sweep, once a minute. The client 2s poll is the primary
-- path; this exists so markets still resolve with nobody in the room.
-- Guarded: if pg_cron is unavailable the migration still succeeds.
-- ---------------------------------------------------------------------------
do $$
begin
  create extension if not exists pg_cron;
  perform cron.schedule('overvalued-resolve', '* * * * *', 'select public.resolve_expired();');
exception when others then
  raise notice 'pg_cron unavailable (%), relying on client poll for resolution', sqlerrm;
end $$;
