-- Seed runs on `supabase db reset`. All the actual content lives in seed_game()
-- so that the host panel's reset_game() reseeds the exact same board.
select public.seed_game();
