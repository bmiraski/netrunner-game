import assert from 'node:assert/strict';
import { makeGame, driver, lastEvent } from './helpers.js';
import { inst, cardOf, moveCard } from '../engine/state.js';

const filler = n => [['Hedge Fund', n]];
const rFiller = n => [['Sure Gamble', n]];

export default [

['mulligan: fresh 5-card hand, deck reshuffled, deterministic given seed', () => {
  // snapshot hands right after each mulligan resolves, before corp turn 1's
  // mandatory draw touches the corp hand again.
  const run = () => {
    const game = makeGame({ seed: 7, corp: filler(10), runner: rFiller(10) });
    const t = driver(game);
    t.pick('mulligan');
    const corpHand = [...game.state.corp.hand];
    const corpDeck = game.state.corp.deck.length;
    t.pick('mulligan');
    const runnerHand = [...game.state.runner.hand];
    const runnerDeck = game.state.runner.deck.length;
    return { game, corpHand, corpDeck, runnerHand, runnerDeck };
  };
  const a = run();
  assert.equal(a.corpHand.length, 5);
  assert.equal(a.runnerHand.length, 5);
  assert.equal(a.corpDeck, 5);     // 10 total - 5 in hand
  assert.equal(a.runnerDeck, 5);
  const mulliganEvents = a.game.log.filter(e => e.type === 'mulligan');
  assert.deepEqual(mulliganEvents.map(e => e.data.who), ['corp', 'runner']);

  const b = run();                 // same seed + same choices -> same hands
  assert.deepEqual(a.corpHand, b.corpHand);
  assert.deepEqual(a.runnerHand, b.runnerHand);
}],

['archives access: hand-overflow discards are accessed, turned faceup, agenda stolen', () => {
  const game = makeGame({ corp: [['Priority Requisition', 1], ['Hedge Fund', 9]], runner: rFiller(10) });
  const g = game.g;
  // test setup: force a deterministic 6-card opening hand containing Priority
  // Requisition, so the mandatory draw guarantees a 2-card discard overflow.
  const corpIds = Object.values(g.insts).filter(i => i.card.side === 'corp' && i.zone !== 'identity').map(i => i.id);
  const prId = corpIds.find(id => cardOf(g, id).title === 'Priority Requisition');
  const rest = corpIds.filter(id => id !== prId).slice(0, 5);
  for (const id of [...g.state.corp.hand]) moveCard(g, id, 'corp-deck');   // clear the random opening hand
  for (const id of [prId, ...rest]) moveCard(g, id, 'corp-hand');         // deterministic 6-card hand

  const t = driver(game).keepHands();
  t.creditsOut('corp');
  t.label('Priority Requisition').discardFirst();   // discard PR + 1 more (hand 7 -> 5)
  assert.equal(game.state.corp.archives.length, 2);
  const otherId = game.state.corp.archives.find(id => id !== prId);

  t.prefix('run:archives');
  assert.equal(lastEvent(game, 'access-count').data.n, 2);
  assert.equal(lastEvent(game, 'run-end').data.successful, true);
  assert.equal(game.state.runner.agendaPoints, 3);
  assert.equal(inst(g, prId).zone, 'runner-score');
  assert.equal(inst(g, otherId).faceup, true);      // non-agenda archive card turned faceup
}],

['HQ access is random-but-seeded: exactly 1 card accessed, deterministic', () => {
  const setup = seed => {
    const game = makeGame({ seed, corp: filler(10), runner: rFiller(10) });
    const t = driver(game).keepHands();
    t.creditsOut('corp').discardFirst();
    t.prefix('run:hq');
    return game;
  };
  const a = setup(99);
  assert.equal(lastEvent(a, 'access-count').data.n, 1);
  assert.ok(lastEvent(a, 'card-accessed'));
  assert.equal(lastEvent(a, 'run-end').data.successful, true);

  const b = setup(99);
  assert.equal(lastEvent(a, 'card-accessed').data.code, lastEvent(b, 'card-accessed').data.code);
}],

['jack out: no decision on first approach, offered on second; run-end unsuccessful', () => {
  const game = makeGame({ corp: [['Wall of Static', 6], ['Hedge Fund', 4]], runner: rFiller(10) });
  const t = driver(game).keepHands();
  t.label('Install Wall of Static').label('Protecting hq');   // innermost, 0cr
  t.label('Install Wall of Static').label('Protecting hq');   // outermost, 1cr
  t.creditsOut('corp').discardFirst();
  t.prefix('run:hq');
  // first approach (outermost ice): no jack-out offered, only the rez decision
  assert.equal(game.decision.runStep, 'rez-ice');
  t.pick('done');
  assert.equal(lastEvent(game, 'ice-passed').data.rezzed, false);
  // second approach (innermost ice): jack-out is now offered
  assert.equal(game.decision.runStep, 'jack-out');
  t.pick('jack-out');
  assert.ok(lastEvent(game, 'jack-out'));
  assert.equal(lastEvent(game, 'run-end').data.successful, false);
}],

['unrezzed ice: corp declines to rez, runner passes without encounter, run succeeds', () => {
  const game = makeGame({ corp: [['Wall of Static', 6], ['Hedge Fund', 4]], runner: rFiller(10) });
  const t = driver(game).keepHands();
  t.label('Install Wall of Static').label('Protecting archives');
  t.creditsOut('corp').discardFirst();
  // no cards have been discarded to archives yet -> a genuinely empty access
  t.prefix('run:archives');
  assert.equal(game.decision.runStep, 'rez-ice');
  t.pick('done');
  assert.equal(lastEvent(game, 'ice-passed').data.rezzed, false);
  assert.equal(lastEvent(game, 'access-count').data.n, 0);
  assert.equal(lastEvent(game, 'run-successful').data.server, 'archives');
  assert.equal(lastEvent(game, 'run-end').data.successful, true);
}],

['ice ordering: approach order is outermost (most recently installed) first', () => {
  const game = makeGame({ corp: [['Wall of Static', 3], ['Ice Wall', 3], ['Hedge Fund', 4]], runner: rFiller(10) });
  const g = game.g;
  const t = driver(game).keepHands();
  t.label('Install Wall of Static').label('Protecting hq');   // innermost
  t.label('Install Ice Wall').label('Protecting hq');         // outermost
  t.creditsOut('corp').discardFirst();
  t.prefix('run:hq');

  const approach1 = lastEvent(game, 'approach-ice');
  assert.equal(approach1.data.position, 1);
  assert.equal(cardOf(g, approach1.data.iceId).title, 'Ice Wall');
  t.pick('done');

  assert.equal(game.decision.runStep, 'jack-out');
  t.pick('continue');
  const approach2 = lastEvent(game, 'approach-ice');
  assert.equal(approach2.data.position, 0);
  assert.equal(cardOf(g, approach2.data.iceId).title, 'Wall of Static');
  t.pick('done');

  assert.equal(lastEvent(game, 'run-end').data.successful, true);
}],

['Enigma: unbroken sub costs the runner a click, then ETR ends the run', () => {
  const game = makeGame({ corp: [['Enigma', 6], ['Hedge Fund', 4]], runner: rFiller(10) });
  const t = driver(game).keepHands();
  t.label('Install Enigma').label('Protecting hq');
  t.creditsOut('corp').discardFirst();
  const clicksBefore = game.state.runner.clicks;   // 4, fresh runner turn
  t.prefix('run:hq');                              // -1 click for the run itself
  t.prefix('rez');
  assert.equal(game.decision.options.length, 1);   // no breakers installed
  t.pick('continue');
  assert.equal(lastEvent(game, 'click-lost').data.who, 'runner');
  assert.equal(game.state.runner.clicks, clicksBefore - 2);   // 1 for run + 1 from sub
  assert.equal(lastEvent(game, 'run-end').data.successful, false);
}],

['Mimic: breaks a sentry sub with no boost option ever offered', () => {
  const game = makeGame({ corp: [['Hunter', 6], ['Hedge Fund', 4]], runner: [['Mimic', 5], ['Sure Gamble', 5]] });
  const t = driver(game).keepHands();
  t.label('Install Hunter').label('Protecting hq');
  t.creditsOut('corp').discardFirst();
  game.g.state.runner.credits = 10;
  t.label('Install Mimic');
  const mimicId = game.state.runner.rig.program[0];
  // test setup: Mimic (str 3) has no boost ability and can never legally reach
  // Hunter's str 4 on its own; simulate an external strength source so the
  // break option becomes available and we can exercise the "no boost" check.
  inst(game.g, mimicId).encounterStr = 1;
  t.prefix('run:hq');
  t.prefix('rez');
  assert.ok(!game.decision.options.some(o => o.id.startsWith('boost:')));
  t.label('break "Trace 3');
  assert.ok(!game.decision.options.some(o => o.id.startsWith('boost:')));
  t.pick('continue');
  assert.equal(game.state.runner.tags, 0);          // trace sub never fired
  assert.equal(lastEvent(game, 'run-end').data.successful, true);
}],

['Gordian Blade cannot break a barrier: only "continue" is offered', () => {
  const game = makeGame({ corp: [['Wall of Static', 6], ['Hedge Fund', 4]], runner: [['Gordian Blade', 5], ['Sure Gamble', 5]] });
  const t = driver(game).keepHands();
  t.label('Install Wall of Static').label('Protecting hq');
  t.creditsOut('corp').discardFirst();
  game.g.state.runner.credits = 10;
  t.label('Install Gordian Blade');
  t.prefix('run:hq');
  t.prefix('rez');
  assert.equal(game.decision.options.length, 1);
  assert.equal(game.decision.options[0].id, 'continue');
  t.pick('continue');
  assert.equal(lastEvent(game, 'run-end').data.successful, false);
}],

['corp trash-resource action: requires a tag, costs 2cr + a click', () => {
  const game = makeGame({ corp: filler(10), runner: [['Armitage Codebusting', 5], ['Sure Gamble', 5]] });
  const t = driver(game).keepHands();
  t.creditsOut('corp').discardFirst();
  t.label('Install Armitage Codebusting');
  const armitageId = game.state.runner.rig.resource[0];
  game.g.state.runner.tags = 1;   // test setup: simulate the runner being tagged
  t.creditsOut('runner');

  const creditsBefore = game.state.corp.credits;
  const clicksBefore = game.state.corp.clicks;      // fresh corp turn 2, clicks = 3
  t.pick('trash-resource');
  t.pick(String(armitageId));
  assert.equal(lastEvent(game, 'card-trashed').data.title, 'Armitage Codebusting');
  assert.equal(game.state.runner.rig.resource.length, 0);
  assert.equal(game.state.corp.credits, creditsBefore - 2);
  assert.equal(game.state.corp.clicks, clicksBefore - 1);
}],

['purge: clears virus counters game-wide and costs all 3 clicks', () => {
  const game = makeGame({ corp: filler(10), runner: rFiller(10) });
  const t = driver(game).keepHands();
  // test setup: virus counters on an arbitrary instance (purge is global)
  const targetId = game.state.runner.identity;
  inst(game.g, targetId).counters.virus = 3;
  assert.equal(game.state.corp.clicks, 3);
  t.pick('purge');
  assert.equal(inst(game.g, targetId).counters.virus, 0);
  assert.equal(game.state.corp.clicks, 0);
  assert.ok(lastEvent(game, 'virus-purged'));
}],

['install-over: installing an asset into an occupied remote trashes the old one', () => {
  const game = makeGame({ corp: [['PAD Campaign', 10]], runner: rFiller(10) });
  const t = driver(game).keepHands();
  t.label('Install PAD Campaign').pick('t:new');
  t.label('Install PAD Campaign').label('In remote1');
  assert.equal(lastEvent(game, 'card-trashed').data.why, 'installed over');
  assert.equal(lastEvent(game, 'card-trashed').data.title, 'PAD Campaign');
  assert.equal(game.state.corp.servers.remote1.content.length, 1);
}],

['ice install cost scales with existing ice on the server: 0cr, 1cr, 2cr', () => {
  const game = makeGame({ corp: [['Wall of Static', 6], ['Hedge Fund', 4]], runner: rFiller(10) });
  const t = driver(game).keepHands();
  const c0 = game.state.corp.credits;
  t.label('Install Wall of Static').label('Protecting hq');
  assert.equal(game.state.corp.credits, c0);
  t.label('Install Wall of Static');
  assert.ok(game.decision.options.find(o => o.id === 't:hq').label.includes('(1cr)'));
  t.pick('t:hq');
  assert.equal(game.state.corp.credits, c0 - 1);
  t.label('Install Wall of Static');
  assert.ok(game.decision.options.find(o => o.id === 't:hq').label.includes('(2cr)'));
  t.pick('t:hq');
  assert.equal(game.state.corp.credits, c0 - 1 - 2);
}],

['uniqueness: installing a second unique copy trashes the first', () => {
  // uses Xanadu (unique resource); consoles like Doppelgänger are now blocked
  // from a second install entirely by the "limit 1 console" rule
  const game = makeGame({ corp: filler(10), runner: [['Xanadu', 5], ['Sure Gamble', 5]] });
  const t = driver(game).keepHands();
  t.creditsOut('corp').discardFirst();
  game.g.state.runner.credits = 10;
  t.label('Install Xanadu');
  const firstId = game.state.runner.rig.resource[0];
  t.label('Install Xanadu');
  assert.equal(lastEvent(game, 'card-trashed').data.why, 'uniqueness');
  assert.equal(lastEvent(game, 'card-trashed').data.id, firstId);
  assert.equal(game.state.runner.rig.resource.length, 1);
}],

['bad publicity: bpCredits pool pays part of an access trash cost', () => {
  const game = makeGame({ corp: [['PAD Campaign', 10]], runner: rFiller(10) });
  const t = driver(game).keepHands();
  t.label('Install PAD Campaign').pick('t:new');
  t.creditsOut('corp').discardFirst();
  game.g.state.corp.badPublicity = 2;   // test setup
  game.g.state.runner.credits = 5;      // test setup: enough to cover the rest
  const before = game.state.runner.credits;
  t.prefix('run:remote1');
  assert.equal(lastEvent(game, 'run-start').data.bpCredits, 2);
  t.pick('done');    // decline to rez PAD Campaign before access
  t.pick('trash');   // PAD Campaign trash cost is 4cr; 2 come from the bp pool
  assert.equal(lastEvent(game, 'card-trashed').data.title, 'PAD Campaign');
  assert.equal(before - game.state.runner.credits, 2);   // only the non-bp remainder is real credits
}],

['score window: agenda reaching threshold offers Score immediately mid-turn', () => {
  const game = makeGame({ corp: [['False Lead', 10]], runner: rFiller(10) });
  const t = driver(game).keepHands();
  t.label('Install False Lead').pick('t:new');
  t.prefix('advance').prefix('advance');   // turn 1: install + 2 advances = 3 clicks
  t.discardFirst();
  t.creditsOut('runner');

  const turnEndsBefore = game.log.filter(e => e.type === 'turn-end' && e.data.who === 'corp').length;
  t.prefix('advance');   // turn 2, click 1: 3rd advancement hits the threshold
  assert.equal(game.decision.scoreWindow, true);
  assert.ok(game.decision.options.some(o => o.id.startsWith('score:')));
  assert.equal(game.state.corp.clicks, 2);   // clicks remain: this is mid-turn, not turn-end
  const turnEndsAfter = game.log.filter(e => e.type === 'turn-end' && e.data.who === 'corp').length;
  assert.equal(turnEndsAfter, turnEndsBefore);

  t.label('Score False Lead');
  assert.equal(game.state.corp.agendaPoints, 1);
  assert.equal(game.state.corp.clicks, 2);   // scoring itself doesn't cost a click
}],

['trace boosting: runner link exceeding boosted trace strength avoids the tag', () => {
  const game = makeGame({ corp: [['Hunter', 6], ['Hedge Fund', 4]], runner: rFiller(10) });
  const t = driver(game).keepHands();
  t.label('Install Hunter').label('Protecting hq');
  t.creditsOut('corp').discardFirst();
  game.g.state.runner.credits = 20;   // test setup: fund the link boost
  t.prefix('run:hq');
  t.prefix('rez');
  t.pick('continue');   // no breakers; the trace sub fires
  const corpCreditsBefore = game.state.corp.credits;
  const runnerCreditsBefore = game.state.runner.credits;
  t.num(2);   // corp boosts trace 3 -> 5
  t.num(6);   // runner boosts link 0 -> 6, exceeding the trace
  assert.equal(game.state.runner.tags, 0);
  assert.equal(game.state.corp.credits, corpCreditsBefore - 2);
  // -6 link boost, +2 Gabriel (run still succeeds after failed trace)
  assert.equal(game.state.runner.credits, runnerCreditsBefore - 6 + 2);
  assert.equal(lastEvent(game, 'trace-result').data.success, false);
}],

];
