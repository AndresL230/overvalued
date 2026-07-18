import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/db.types';

// Client singleton. No auth — anon key only, identity is a localStorage uuid.
// Module-scope so that every component shares ONE websocket to Realtime.
//
// Built on first use, not on import. GameProvider sits in the root layout, so
// this module ends up in every route's bundle — throwing at module scope took
// down `next build` while prerendering /_not-found, a page that never touches
// Supabase. Deferring it keeps the missing-config error at the call site.

let client: SupabaseClient<Database> | undefined;

function getClient(): SupabaseClient<Database> {
  if (client) return client;

  // Read these as literal process.env.X lookups. Next inlines NEXT_PUBLIC_
  // values at build time only where it can see them statically — pulling them
  // through a variable would leave them undefined in the browser bundle.
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error(
      'Missing NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY. Run `npx supabase start` and copy them into .env.local',
    );
  }

  client = createClient<Database>(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    realtime: {
      // party game: we want odds to feel instant, so let events through fast
      params: { eventsPerSecond: 40 },
    },
  });

  return client;
}

export const supabase = new Proxy({} as SupabaseClient<Database>, {
  get(_target, prop) {
    const c = getClient();
    const value = Reflect.get(c, prop);
    // bind so `this` still points at the real client, not the proxy
    return typeof value === 'function' ? value.bind(c) : value;
  },
});
