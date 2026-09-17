// Phase 8 (hosted): the pure, unit-testable slice of cloud/stats.js.
// The actual Supabase network calls (saveGame/fetchMyGames) need a live
// project this sandbox can't reach — see docs/HOSTING.md. shapeGameRow is
// where the logic worth pinning down lives; the network calls are thin
// pass-throughs to the Supabase client.
import assert from 'node:assert/strict';
import { autoplay } from '../ai/controller.js';
import { cardsJson } from './helpers.js';
import { analyzeGame } from '../analysis/analyze.js';
import { shapeGameRow } from '../cloud/stats.js';

export default [

['shapeGameRow: maps an analyzeGame() report + config into a DB row', () => {
  const { game } = autoplay({ cardsJson, seed: 3, corpDeck: 'hb-core', runnerDeck: 'gabe-core' });
  const report = analyzeGame(game);
  const row = shapeGameRow(report, {
    userId: 'user-123', side: 'runner', corpDeck: 'hb-core', runnerDeck: 'gabe-core',
  });
  assert.equal(row.user_id, 'user-123');
  assert.equal(row.side, 'runner');
  assert.equal(row.corp_deck, 'hb-core');
  assert.equal(row.runner_deck, 'gabe-core');
  assert.equal(row.winner, game.state.winner);
  assert.equal(row.reason, game.state.winReason);
  assert.equal(row.turns, game.state.turn);
  assert.equal(row.corp_points, game.state.corp.agendaPoints);
  assert.equal(row.runner_points, game.state.runner.agendaPoints);
  assert.equal(row.analysis, report);   // the whole Phase 7 report, not re-derived
}],

['shapeGameRow: missing deck info (e.g. tutorial) maps to null, not undefined', () => {
  const { game } = autoplay({ cardsJson, seed: 5, corpDeck: 'jinteki-core', runnerDeck: 'reina-core' });
  const report = analyzeGame(game);
  const row = shapeGameRow(report, { userId: 'u', side: 'runner' });
  assert.equal(row.corp_deck, null);
  assert.equal(row.runner_deck, null);
}],

];
