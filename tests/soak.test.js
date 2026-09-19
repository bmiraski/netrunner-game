// Phase 4 soak tests: full AI-vs-AI games across the precon decks.
import assert from 'node:assert/strict';
import { cardsJson } from './helpers.js';
import { Game } from '../engine/game.js';
import { autoplay, AIController } from '../ai/controller.js';
import { CorpAI } from '../ai/corp.js';
import { DECKS, gameConfig } from '../ai/decks.js';

const WIN_REASONS = ['agendas', 'flatline', 'decked'];

export default [

['full game: hb-core vs gabe-core (seed 11, hard/hard) completes cleanly', () => {
  const { result } = autoplay({
    cardsJson, seed: 11, corpDeck: 'hb-core', runnerDeck: 'gabe-core',
    corpLevel: 'hard', runnerLevel: 'hard',
  });
  assert.ok(['corp', 'runner'].includes(result.winner), `winner set (got ${result.winner})`);
  assert.equal(result.stalled, false);
  assert.deepEqual(result.aiErrors, []);
  assert.ok(WIN_REASONS.includes(result.winReason), `winReason ${result.winReason}`);
  assert.ok(result.turns >= 1);
}],

['all 16 matchups x 2 seeds (standard/standard) finish without stall or aiErrors', () => {
  let corpWins = 0, runnerWins = 0;
  const reasons = {};
  for (const corp of DECKS.corp) {
    for (const runner of DECKS.runner) {
      for (const seed of [1, 2]) {
        const tag = `${corp.key} vs ${runner.key} seed ${seed}`;
        const { result } = autoplay({
          cardsJson, seed, corpDeck: corp.key, runnerDeck: runner.key,
          corpLevel: 'standard', runnerLevel: 'standard',
        });
        assert.equal(result.stalled, false, `${tag}: stalled`);
        assert.deepEqual(result.aiErrors, [], `${tag}: aiErrors`);
        assert.ok(['corp', 'runner'].includes(result.winner), `${tag}: no winner`);
        assert.ok(WIN_REASONS.includes(result.winReason), `${tag}: winReason ${result.winReason}`);
        if (result.winner === 'corp') corpWins++; else runnerWins++;
        reasons[result.winReason] = (reasons[result.winReason] ?? 0) + 1;
      }
    }
  }
  assert.equal(corpWins + runnerWins, 32);
  console.log(`        [soak] 32 games — corp ${corpWins}, runner ${runnerWins}, reasons ${JSON.stringify(reasons)}`);
}],

['determinism: identical autoplay config twice -> identical history', () => {
  const play = () => autoplay({
    cardsJson, seed: 21, corpDeck: 'weyland-core', runnerDeck: 'ct-core',
    corpLevel: 'hard', runnerLevel: 'hard',
  });
  const a = play(), b = play();
  assert.equal(a.result.winner, b.result.winner);
  assert.equal(a.result.turns, b.result.turns);
  assert.deepEqual(a.game.history, b.game.history);
}],

['human seat coexistence: corp-only AIController stops on a runner decision', () => {
  const game = new Game(cardsJson, gameConfig('hb-core', 'gabe-core', 9));
  const ctl = new AIController(game, { corp: new CorpAI({ level: 'hard', seed: 1 }) });
  const r = ctl.run();
  assert.equal(r.done, false);
  assert.equal(r.stalled, false);
  assert.ok(r.steps >= 1, 'the corp mulligan was answered by the AI');
  assert.ok(!game.state.winner);
  assert.ok(game.decision, 'a decision is left pending for the human');
  assert.equal(game.decision.player, 'runner');
}],

];
