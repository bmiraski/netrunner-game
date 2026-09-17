-- Netrunner vs. Computer — hosted stats schema (Phase 8, Supabase pivot).
-- Run this once in the Supabase project's SQL Editor (Dashboard -> SQL
-- Editor -> New query -> paste -> Run). See docs/HOSTING.md for full setup.
--
-- One row per completed game, owned by the signed-in user who played it.
-- `analysis` stores the whole analyzeGame() report (Phase 7) as JSON, so the
-- client never has to reconcile two summary shapes (see PROJECT_NOTES.md's
-- Phase 8 pointer) — everything else is just for cheap querying/sorting.

create table if not exists public.games (
  id           bigint generated always as identity primary key,
  user_id      uuid not null references auth.users (id) on delete cascade,
  played_at    timestamptz not null default now(),
  side         text not null check (side in ('corp', 'runner', 'watch')),
  corp_deck    text,
  runner_deck  text,
  winner       text check (winner in ('corp', 'runner')),
  reason       text,
  turns        integer,
  corp_points  integer,
  runner_points integer,
  analysis     jsonb not null
);

create index if not exists games_user_id_played_at_idx
  on public.games (user_id, played_at desc);

-- Row Level Security: every user can only ever see or write their OWN games.
-- This is what actually protects the data — the client ships with a public
-- "anon" key by design (see cloud/supabase.js), so RLS is the real gate.
alter table public.games enable row level security;

create policy "select own games" on public.games
  for select
  using (auth.uid() = user_id);

create policy "insert own games" on public.games
  for insert
  with check (auth.uid() = user_id);

-- No update/delete policy is created on purpose — a played game's record
-- shouldn't be editable from the client. Add one later if you want a
-- "delete this game" button.
