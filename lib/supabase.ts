import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/db.types';

// Client singleton. No auth — anon key only, identity is a localStorage uuid.
// Module-scope so that every component shares ONE websocket to Realtime.

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  throw new Error(
    'Missing NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY. Run `npx supabase start` and copy them into .env.local',
  );
}

export const supabase = createClient<Database>(url, anonKey, {
  auth: { persistSession: false, autoRefreshToken: false },
  realtime: {
    // party game: we want odds to feel instant, so let events through fast
    params: { eventsPerSecond: 40 },
  },
});
