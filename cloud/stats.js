// Phase 8 (hosted): per-game record, saved to Supabase instead of
// localStorage, so match history follows the account rather than one
// browser. Builds on analysis/analyze.js's report (Phase 7) rather than
// inventing a second summary shape (see docs/PROJECT_NOTES.md pointers).
import { supabase } from './supabase.js';

// Pure — no network — so it's unit-testable without a live Supabase
// connection (this row-shaping is the part worth pinning down with a test;
// the network calls below just need Supabase itself, which isn't reachable
// from the dev sandbox — see docs/HOSTING.md).
export function shapeGameRow(report, { userId, side, corpDeck, runnerDeck }) {
  return {
    user_id: userId,
    side,
    corp_deck: corpDeck ?? null,
    runner_deck: runnerDeck ?? null,
    winner: report.winner,
    reason: report.reason,
    turns: report.turns,
    corp_points: report.endgame.corp.agendaPoints,
    runner_points: report.endgame.runner.agendaPoints,
    analysis: report,
  };
}

export async function saveGame(row) {
  return supabase.from('games').insert(row);
}

export async function fetchMyGames(limit = 20) {
  const { data, error } = await supabase
    .from('games')
    .select('*')
    .order('played_at', { ascending: false })
    .limit(limit);
  return { data: data ?? [], error };
}
