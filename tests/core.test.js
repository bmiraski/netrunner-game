import assert from 'node:assert/strict';
import { makeGame, driver, lastEvent, db } from './helpers.js';
import * as fx from '../engine/effects.js';
import { moveCard } from '../engine/state.js';

const filler = n => [['Hedge Fund', n]];
const rFiller = n => [['Sure Gamble', n]];

export default [

['turn structure: clicks, credits, mandatory draw, discard', () => {
  const game = makeGame({ corp: filler(10), runner: rFiller(10) });
  const t = driver(game).keepHands();
  // corp: 5 hand +1 mandatory draw = 6; 3 clicks on credits -> 8cr; discard 1
  t.creditsOut('corp');
  assert.equal(game.state.corp.credits, 8);
  t.discardFirst();
  assert.equal(game.state.corp.hand.length, 5);
  // runner: 4 clicks on credits -> 9cr, hand 5, no discard
  t.creditsOut('runner');
  assert.equal(game.state.runner.credits, 9);
  assert.equal(game.state.turn, 2);           // corp turn 2 has begun
  assert.equal(game.decision.player, 'corp');
}],

['economy events/operations: Hedge Fund and Sure Gamble', () => {
  const game = makeGame({ corp: filler(10), runner: rFiller(10) });
  const t = driver(game).keepHands();
  t.label('Play Hedge Fund');          // 5 - 5 + 9 = 9
  assert.equal(game.state.corp.credits, 9);
  t.creditsOut('corp').discardFirst(); // +2 clicks -> 11
  assert.equal(game.state.corp.credits, 11);
  t.label('Play Sure Gamble');         // 5 - 5 + 9 = 9
  assert.equal(game.state.runner.credits, 9);
}],

['ice: install, rez, unbroken ETR ends the run', () => {
  const game = makeGame({ corp: [['Wall of Static', 6], ['Hedge Fund', 4]], runner: rFiller(10) });
  const t = driver(game).keepHands();
  t.label('Install Wall of Static').label('Protecting hq');
  t.creditsOut('corp').discardFirst();
  t.prefix('run:hq');                    // runner runs HQ
  t.pick('rez');                         // corp rezzes Wall of Static (3cr)
  assert.equal(game.state.corp.credits, 7 - 3);
  t.pick('continue');                    // no breakers: let subs fire
  assert.equal(lastEvent(game, 'run-end').data.successful, false);
  assert.equal(game.state.runner.clicks, 3);
}],

['icebreaker: Battering Ram boosts and breaks Wall of Static', () => {
  const game = makeGame({ corp: [['Wall of Static', 6], ['Priority Requisition', 4]], runner: [['Battering Ram', 5], ['Sure Gamble', 5]] });
  const t = driver(game).keepHands();
  t.label('Install Wall of Static').label('Protecting hq');
  t.creditsOut('corp').discardFirst();
  game.g.state.runner.credits = 12;      // test setup: fund the runner
  t.label('Install Battering Ram');      // 2cr install
  t.prefix('run:hq');
  t.pick('rez');
  // Wall of Static str 3, Ram base 1: boost twice, break the ETR sub
  t.label('+1 strength').label('+1 strength').label('break "End the run"');
  t.pick('continue');
  assert.equal(lastEvent(game, 'run-end').data.successful, true);
  // access hit either Priority Requisition (steal) or Wall of Static (no trash cost)
  const stolen = game.state.runner.agendaPoints;
  assert.ok(stolen === 0 || stolen === 3);
}],

['agenda: install in remote, advance, score', () => {
  const game = makeGame({ corp: [['False Lead', 10]], runner: rFiller(10) });
  const t = driver(game).keepHands();
  // turn 1: install False Lead (3/1) in new remote, advance twice (2cr)
  t.label('Install False Lead').pick('t:new');
  t.prefix('advance').prefix('advance');
  t.discardFirst();
  t.creditsOut('runner');                // runner does nothing relevant
  // turn 2: advance third time -> score window fires
  t.prefix('advance');
  t.label('Score False Lead');
  assert.equal(game.state.corp.agendaPoints, 1);
  assert.equal(lastEvent(game, 'agenda-scored').data.title, 'False Lead');
}],

['steal: runner accesses agenda in remote', () => {
  const game = makeGame({ corp: [['Priority Requisition', 10]], runner: rFiller(10) });
  const t = driver(game).keepHands();
  t.label('Install Priority Requisition').pick('t:new');
  t.creditsOut('corp').discardFirst();
  t.prefix('run:remote1');
  assert.equal(game.state.runner.agendaPoints, 3);
  assert.equal(lastEvent(game, 'run-end').data.successful, true);
}],

['R&D access: steal from top of deck', () => {
  const game = makeGame({ corp: [['Priority Requisition', 10]], runner: rFiller(10) });
  const t = driver(game).keepHands();
  t.creditsOut('corp').discardFirst();
  t.prefix('run:rd');
  assert.equal(game.state.runner.agendaPoints, 3);
}],

['asset access: pay trash cost, card goes to archives', () => {
  const game = makeGame({ corp: [['PAD Campaign', 10]], runner: rFiller(10) });
  const t = driver(game).keepHands();
  t.creditsOut('corp').discardFirst();
  t.prefix('run:rd');
  t.prefix('trash');
  const pad = db.titled('PAD Campaign');
  // archives: 1 discarded (facedown) + 1 trashed via access (faceup)
  assert.equal(game.state.corp.archives.length, 2);
  assert.equal(lastEvent(game, 'card-trashed').data.title, 'PAD Campaign');
  assert.equal(game.state.runner.credits, 5 - pad.trashCost);
}],

['trace: Hunter lands a tag; runner removes it', () => {
  const game = makeGame({ corp: [['Hunter', 6], ['Hedge Fund', 4]], runner: rFiller(10) });
  const t = driver(game).keepHands();
  t.label('Install Hunter').label('Protecting hq');
  t.creditsOut('corp').discardFirst();
  t.prefix('run:hq');
  t.pick('rez').pick('continue');
  t.num(0);                              // corp trace boost 0 (base 3)
  t.num(0);                              // runner link boost 0 (link 0)
  assert.equal(game.state.runner.tags, 1);
  // access HQ then remove the tag
  while (game.decision && !game.decision.actionMenu) driver(game).pick(game.decision.options[0].id);
  t.pick('remove-tag');
  assert.equal(game.state.runner.tags, 0);
  assert.equal(game.state.runner.credits, 3);
}],

['advanceable ice: Ice Wall gains strength', () => {
  const game = makeGame({ corp: [['Ice Wall', 6], ['Hedge Fund', 4]], runner: [['Battering Ram', 5], ['Sure Gamble', 5]] });
  const t = driver(game).keepHands();
  t.label('Install Ice Wall').label('Protecting rd');
  t.prefix('advance');                   // Ice Wall str 1 -> 2
  t.creditsOut('corp').discardFirst();
  game.g.state.runner.credits = 10;
  t.label('Install Battering Ram');
  t.prefix('run:rd');
  t.pick('rez');
  // Ram str 1 vs Ice Wall str 2: one boost required before break appears
  t.label('+1 strength').label('break "End the run"').pick('continue');
  assert.equal(lastEvent(game, 'run-end').data.successful, true);
}],

['memory limit: 5th program forces trash prompt', () => {
  const game = makeGame({ corp: filler(10), runner: [['Gordian Blade', 5], ['Sure Gamble', 5]] });
  const t = driver(game).keepHands();
  const g = game.g;
  // test setup: 4 Gordians already in the rig (4/4 MU used), 5th in hand
  const gordians = Object.values(g.insts)
    .filter(i => i.card.title === 'Gordian Blade').map(i => i.id);
  for (const id of gordians.slice(0, 4)) moveCard(g, id, 'rig-program');
  moveCard(g, gordians[4], 'runner-hand');
  g.state.runner.credits = 10;
  t.creditsOut('corp').discardFirst();   // finish corp turn -> runner menu builds fresh
  t.label('Install Gordian Blade');
  assert.ok(game.decision.prompt.includes('Not enough MU'), game.decision.prompt);
  t.label('Trash Gordian Blade');
  assert.equal(game.state.runner.rig.program.length, 4);
  assert.equal(game.state.runner.discard.length, 1);
}],

['flatline: damage exceeding grip wins for corp', () => {
  const game = makeGame({ corp: filler(10), runner: rFiller(10) });
  driver(game).keepHands();
  const g = game.g;
  g.state.runner.hand.length = 0;
  for (const _ of fx.damage(g, 'meat', 1, 'test')) { /* no decisions */ }
  assert.equal(game.state.winner, 'corp');
  assert.equal(game.state.winReason, 'flatline');
}],

['core damage: reduces hand size permanently', () => {
  const game = makeGame({ corp: filler(10), runner: rFiller(10) });
  driver(game).keepHands();
  const g = game.g;
  for (const _ of fx.damage(g, 'core', 2, 'test')) { }
  assert.equal(g.state.runner.brainDamage, 2);
  assert.equal(game.state.winner, null);
}],

['deck-out: corp loses when it must draw from empty R&D', () => {
  const game = makeGame({ corp: filler(6), runner: rFiller(10) });
  const t = driver(game).keepHands();
  // corp deck: 6 - 5 (start) - 1 (turn draw) = 0 left
  t.creditsOut('corp').discardFirst();
  t.creditsOut('runner');
  // corp turn 2 mandatory draw from empty deck -> runner wins
  assert.equal(game.state.winner, 'runner');
  assert.equal(game.state.winReason, 'decked');
}],

['determinism: same seed + same choices = same log', () => {
  const play = () => {
    const game = makeGame({ seed: 123, corp: filler(10), runner: rFiller(10) });
    const t = driver(game).keepHands();
    t.creditsOut('corp').discardFirst().creditsOut('runner');
    t.pick('draw').creditsOut('corp').discardFirst();
    return game;
  };
  const a = play(), b = play();
  assert.equal(a.log.length, b.log.length);
  assert.deepEqual(a.state.corp.hand, b.state.corp.hand);
  assert.deepEqual(a.state.runner.hand, b.state.runner.hand);
  assert.equal(JSON.stringify(a.history), JSON.stringify(b.history));
}],

];
