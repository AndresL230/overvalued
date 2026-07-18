-- ===========================================================================
-- Résumé cards gain a ticker and a tagline.
--
-- The LLM-backed generator returns a full candidate card:
--   { ticker, title, bullets[3], asking_tc, tagline }
-- Ticker is the Polymarket-ish 3–5 letter symbol; tagline is the one-line
-- sting under the title. Both are cosmetic and safe to expose publicly.
--
-- create_market() gains two OPTIONAL trailing parameters so every existing
-- 5-argument caller keeps working unchanged — PostgREST fills the defaults.
-- ===========================================================================

alter table public.markets add column if not exists ticker  text;
alter table public.markets add column if not exists tagline text;

-- markets_public is the only surface clients read, so the new columns have to
-- be threaded through it. is_real stays masked until resolution.
--
-- `create or replace view` only permits APPENDING columns — inserting them
-- mid-list errors — so ticker/tagline go on the end rather than next to the
-- other display fields.
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
  case when m.status = 'resolved' then m.is_real else null end as is_real,
  m.ticker,
  m.tagline
from public.markets m;

grant select on public.markets_public to anon, authenticated;

-- Extend the column-level grant so the new fields are readable over PostgREST
-- and Realtime — but is_real still is not.
grant select (id, title, bullets, asking_tc, ticker, tagline, prob_yes_bps,
              expires_at, status, author_id, created_at)
  on public.markets to anon, authenticated;

create or replace function public.create_market(
  p_player    uuid,
  p_title     text,
  p_bullets   text[],
  p_asking_tc int,
  p_is_real   boolean,
  p_ticker    text default null,
  p_tagline   text default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  new_id uuid;
begin
  if p_title is null or btrim(p_title) = '' then
    raise exception 'title required';
  end if;

  insert into public.markets (
    title, bullets, asking_tc, is_real, prob_yes_bps, expires_at, author_id,
    ticker, tagline
  )
  values (
    btrim(p_title),
    coalesce(p_bullets, '{}'),
    coalesce(p_asking_tc, 0),
    coalesce(p_is_real, false),
    5000,
    now() + public.market_ttl(),
    p_player,
    -- tickers are display symbols: uppercase, letters only, 3–5 chars
    nullif(upper(regexp_replace(coalesce(p_ticker, ''), '[^A-Za-z]', '', 'g')), ''),
    nullif(btrim(coalesce(p_tagline, '')), '')
  )
  returning id into new_id;

  return new_id;
end $$;

grant execute on function
  public.create_market(uuid, text, text[], int, boolean, text, text)
  to anon, authenticated;

-- Reseed with tickers so a host reset doesn't wipe them back to null.
create or replace function public.seed_game() returns void
language plpgsql security definer set search_path = public as $$
declare
  bot_id uuid;
begin
  insert into public.players (id, handle, cash, is_bot) values
    ('b0000000-0000-4000-8000-000000000001', 'RecruiterBot',   1000000, true),
    ('b0000000-0000-4000-8000-000000000002', 'VC_Tourist',     1000000, true),
    ('b0000000-0000-4000-8000-000000000003', 'ex-FAANG_Guy',   1000000, true),
    ('b0000000-0000-4000-8000-000000000004', 'Anon_Degen',     1000000, true)
  on conflict (id) do update set cash = 1000000, is_bot = true;

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

-- Backfill the currently-live board too.
update public.markets set ticker = 'VIBE',
  tagline = 'Ex-FAANG (adjacent). Currently between disruptions.'
  where title like 'Chief Vibes%' and ticker is null;
update public.markets set ticker = 'SRE',
  tagline = 'Kept the pager quiet for six years.'
  where title like 'Staff SRE%' and ticker is null;
update public.markets set ticker = 'WEB3',
  tagline = 'Building in stealth. Very stealth.'
  where title like 'Web3 Growth%' and ticker is null;
update public.markets set ticker = 'BORE',
  tagline = 'No newsletter. No takes. Ships.'
  where title like 'Backend eng%' and ticker is null;
update public.markets set ticker = 'PRMT',
  tagline = 'Thought leader, mostly to myself.'
  where title like 'Founding Prompt%' and ticker is null;
