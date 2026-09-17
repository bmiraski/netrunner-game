// Phase 7: post-game feedback (analysis/analyze.js). Detectors are pure
// functions over the event log — most cases here drive the real engine
// (proving the detector reads genuine event shapes); a couple build a
// synthetic log fixture to pin down run cost/value verdicts without having
// to hand-script an exact ice/breaker cost scenario.
import assert from 'node:assert/strict';
import { makeGame, driver } from './helpers.js';
import * as fx from '../engine/effects.js';
import { analyzeGame } from '../analysis/analyze.js';
import { autoplay } from '../ai/controller.js';
import { cardsJson } from './helpers.js';
import { DECKS } from '../ai/decks.js';

const filler = n => [['Hedge Fund', n]];
const rFiller = n => [['Sure Gamble', n]];

export default [

['clicks: a turn spent entirely clicking for credits is flagged as a grind turn', () => {
  const game = makeGame({ corp: filler(10), runner: rFiller(10) });
  const t = driver(game).keepHands();
  t.creditsOut('corp');                 // 3/3 corp clicks -> credit
  const report = analyzeGame(game);
  assert.deepEqual(report.clicks.corp.grindTurns, [1]);
  assert.equal(report.clicks.corp.creditClicks, 3);
  assert.equal(report.clicks.runner.grindTurns.length, 0, 'runner has not acted yet');
  assert.ok(report.findings.some(f => f.side === 'corp' && f.turn === 1 && /clicking for credits/.test(f.text)));
}],

['clicks: a turn with a real play is not flagged, even with some credit-clicks', () => {
  const game = makeGame({ corp: filler(10), runner: rFiller(10) });
  const t = driver(game).keepHands();
  t.label('Play Hedge Fund').pick('credit').pick('credit');   // 1 play + 2 credit clicks
  const report = analyzeGame(game);
  assert.deepEqual(report.clicks.corp.grindTurns, []);
  assert.equal(report.clicks.corp.creditClicks, 2);
}],

['economy: totals gained/spent match the log, final = live state credits', () => {
  const game = makeGame({ corp: filler(10), runner: rFiller(10) });
  const t = driver(game).keepHands();
  t.label('Play Hedge Fund');           // 5 -5 +9 = 9cr
  t.creditsOut('corp').discardFirst();  // +2 more clicks-for-credit -> 11cr
  const report = analyzeGame(game);
  assert.equal(report.economy.corp.final, game.state.corp.credits);
  assert.equal(report.economy.corp.gained, 9 + 2);   // Hedge Fund (9) + 2 click credits
  assert.equal(report.economy.corp.spent, 5);        // Hedge Fund cost
}],

['scoring: an unprotected steal appears in the timeline with a running total', () => {
  const game = makeGame({ corp: [['Priority Requisition', 4], ['Hedge Fund', 6]], runner: rFiller(10) });
  const g = game.g;
  const t = driver(game).keepHands();
  t.label('Install Priority Requisition').pick('t:new');
  t.creditsOut('corp').discardFirst();
  g.state.runner.credits = 10;
  t.prefix('run:remote1');
  t.pick('continue');                   // approach-server jack-out: continue -> auto-accessed & stolen (no extra cost)
  assert.equal(g.state.runner.agendaPoints, 3);
  const report = analyzeGame(game);
  assert.equal(report.scoring.length, 1);
  assert.deepEqual(report.scoring[0], { turn: 1, side: 'runner', title: 'Priority Requisition', points: 3, total: 3 });
  const run = report.runs.at(-1);
  assert.equal(run.server, 'remote1');
  assert.equal(run.successful, true);
  assert.equal(run.agendaPoints, 3);
  assert.equal(run.cost, 0);
  assert.ok(report.findings.some(f => f.severity === 'good' && /Cheap steal/.test(f.text)));
}],

['damage: flatline is recorded and surfaces as a finding', () => {
  const game = makeGame({ corp: filler(10), runner: rFiller(10) });
  driver(game).keepHands();
  const g = game.g;
  g.state.runner.hand.length = 0;
  for (const _ of fx.damage(g, 'meat', 1, 'test')) { /* no decisions */ }
  assert.equal(game.state.winner, 'corp');
  const report = analyzeGame(game);
  assert.equal(report.damage.flatline, true);
  assert.ok(report.findings.some(f => f.severity === 'bad' && /flatline/.test(f.text)));
}],

['runs: cost/value verdicts on a synthetic log fixture', () => {
  // hand-built minimal fixture — pins the verdict thresholds without needing
  // a specific ice/breaker cost scenario to reproduce a real "costly whiff".
  const fakeGame = {
    log: [
      { i: 0, type: 'run-start', turn: 1, player: 'runner', data: { server: 'hq' } },
      { i: 1, type: 'credits-spent', turn: 1, player: 'runner', data: { who: 'runner', n: 2, why: 'boost breaker' } },
      { i: 2, type: 'credits-spent', turn: 1, player: 'runner', data: { who: 'runner', n: 1, why: 'break subroutine' } },
      { i: 3, type: 'run-end', turn: 1, player: 'runner', data: { server: 'hq', successful: false } },
      { i: 4, type: 'run-start', turn: 3, player: 'runner', data: { server: 'remote1' } },
      { i: 5, type: 'card-accessed', turn: 3, player: 'runner', data: { server: 'remote1', title: 'Some Agenda' } },
      { i: 6, type: 'agenda-stolen', turn: 3, player: 'runner', data: { title: 'Some Agenda', points: 2, total: 2 } },
      { i: 7, type: 'run-end', turn: 3, player: 'runner', data: { server: 'remote1', successful: true } },
      { i: 8, type: 'game-over', turn: 5, player: 'corp', data: { winner: 'runner', reason: 'agendas' } },
    ],
    state: {
      winner: 'runner', winReason: 'agendas', turn: 5,
      corp: { credits: 2, hand: [], agendaPoints: 5, badPublicity: 0 },
      runner: { credits: 3, hand: [], agendaPoints: 7, tags: 0, brainDamage: 0 },
    },
  };
  const report = analyzeGame(fakeGame);
  assert.equal(report.runs.length, 2);
  assert.equal(report.runs[0].cost, 3);
  assert.equal(report.runs[0].successful, false);
  assert.equal(report.runs[1].cost, 0);
  assert.equal(report.runs[1].agendaPoints, 2);
  assert.ok(report.findings.some(f => f.severity === 'bad' && /didn.t get through/.test(f.text)));
  assert.ok(report.findings.some(f => f.severity === 'good' && /Cheap steal/.test(f.text)));
}],

['soak: analyzeGame never throws and stays internally consistent across full AI-vs-AI games', () => {
  for (const corp of DECKS.corp) {
    for (const runner of DECKS.runner) {
      const { game, result } = autoplay({ cardsJson, seed: 5, corpDeck: corp.key, runnerDeck: runner.key, corpLevel: 'standard', runnerLevel: 'standard' });
      assert.ok(result.winner, `${corp.key} vs ${runner.key}: no winner`);
      const report = analyzeGame(game);
      assert.equal(report.winner, game.state.winner);
      assert.equal(report.endgame.corp.agendaPoints, game.state.corp.agendaPoints);
      assert.equal(report.endgame.runner.agendaPoints, game.state.runner.agendaPoints);
      const lastCorpScore = [...report.scoring].reverse().find(s => s.side === 'corp');
      const lastRunnerScore = [...report.scoring].reverse().find(s => s.side === 'runner');
      if (lastCorpScore) assert.equal(lastCorpScore.total, game.state.corp.agendaPoints);
      if (lastRunnerScore) assert.equal(lastRunnerScore.total, game.state.runner.agendaPoints);
      for (const f of report.findings) {
        assert.ok(['good', 'bad', 'info'].includes(f.severity), `bad severity ${f.severity}`);
        assert.equal(typeof f.text, 'string');
      }
    }
  }
}],

];
