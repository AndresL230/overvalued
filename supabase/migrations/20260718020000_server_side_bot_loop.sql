-- ===========================================================================
-- Move the bot loop server-side.
--
-- The bot loop was driven purely by connected clients polling bot_tick(). That
-- works while someone is looking at the app, but browsers throttle timers in
-- background tabs to roughly once a minute — so if the booth's projector tab
-- lost foreground, or every phone was pocketed, the odds simply stopped moving.
-- For a board whose entire job is to look alive, that is the worst failure.
--
-- pg_cron 1.5+ supports sub-minute schedules, so the bots now run in the
-- database every 5 seconds regardless of who is watching. bot_tick() is still
-- internally rate-limited to one nudge per 1.5s, so the client-side poll can
-- stay as a harmless fallback for environments without pg_cron.
-- ===========================================================================

do $$
begin
  perform cron.schedule('overvalued-bots', '5 seconds', 'select public.bot_tick();');
  -- Resolution is latency-sensitive at 0:00, and the once-a-minute backstop
  -- could leave a market hanging for up to 59s with nobody connected.
  perform cron.unschedule('overvalued-resolve');
  perform cron.schedule('overvalued-resolve', '5 seconds', 'select public.resolve_expired();');
exception when others then
  raise notice 'pg_cron scheduling unavailable (%), relying on client polling', sqlerrm;
end $$;
