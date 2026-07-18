-- ===========================================================================
-- FIX: reset_game() failed when called from the client.
--
-- Supabase loads the `safeupdate` extension for the API roles, which rejects
-- any DELETE or UPDATE without a WHERE clause. reset_game() had two bare
-- statements, so the host panel's reset always failed with
--   "DELETE requires a WHERE clause"
-- even though the identical function ran fine from psql as `postgres`, where
-- the guard is not applied. SECURITY DEFINER changes the privileges the body
-- runs with, not the session-level guard the caller arrived under.
--
-- `where true` is explicit enough to satisfy the guard while still meaning
-- "every row", which is genuinely what a game reset wants.
-- ===========================================================================

create or replace function public.reset_game() returns void
language plpgsql security definer set search_path = public as $$
begin
  truncate table public.positions, public.trades, public.referrals restart identity;
  delete from public.markets where true;
  -- humans keep their identity + ref_code, but go back to a fresh $100
  update public.players set cash = 10000 where true;
  perform public.seed_game();
end $$;

grant execute on function public.reset_game() to anon, authenticated;
