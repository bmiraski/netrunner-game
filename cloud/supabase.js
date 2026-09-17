// Supabase client — the hosted pivot (accounts + cloud stats) replacing the
// original localStorage-only Phase 8 plan. See docs/HOSTING.md for the full
// setup (schema, redirect URL, invites, deploy).
//
// The URL and "publishable" (anon) key below are DESIGNED to be public —
// Supabase's security model puts access control in Postgres Row Level
// Security policies (db/schema.sql), not in hiding this key. It's safe to
// ship inside the bundled netrunner.html.
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://xnbnevutldtdmyqcafjm.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_eF1Op4CePliVSVXxGsX01g_JwLl_h4c';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
