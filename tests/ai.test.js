// Phase 4 AI unit tests: pin down specific decisions the heuristic AIs make
// in hand-built game states. All tests use level 'hard' (noise 0) so answers
// are fully deterministic given (level, seed, state).
import assert from 'node:assert/strict';
import { makeGame, driver, cardsJson } from './helpers.js';
import { moveCard, inst, cardOf } from '../engine/state.js';
import { CorpAI } from '../ai/corp.js';
import { RunnerAI } from '../ai/runner.js';
import { autoplay } from '../ai/controller.js';

const corpAI = () => new CorpAI({ level: 'hard', seed: 1 });
const runnerAI = () => new RunnerAI({ level: 'hard', seed: 1 });

// Guarantee `n` copies of `title` in a player's opening hand (swap with deck).
// Call BEFORE any decision that builds menus from the hand (i.e. right after
// makeGame, while the mulligan decision is pending).
function ensureInHand(g, side, title, n = 1) {
  const have = () => g.state[side].hand.filter(id => cardOf(g, id).title === title).length;
  while (have() < n) {
    const fromDeck = g.state[side].deck.find(id => cardOf(g, id).title === title);
    const toDeck = g.state[side].hand.find(id => cardOf(g, id).title !== title);
    if (fromDeck == null || toDeck == null) throw new Error(`cannot stack ${title} into ${side} hand`);
    moveCard(g, toDeck, `${side}-deck`);
    moveCard(g, fromDeck, `${side}-hand`);
  }
}

// Shared setup: Hunter rezzed on HQ, runner face-checks it, trace pending.
// Returns at the CORP trace-boost decision (base 3, runner link 0).
function hunterTrace() {
  const game = makeGame({ corp: [['Hunter', 6], ['Hedge Fund', 4]], runner: [['Sure Gamble', 10]] });
  ensureInHand(game.g, 'corp', 'Hunter');
  const t = driver(game).keepHands();
  t.label('Install Hunter').label('Protecting hq');
  t.creditsOut('corp').discardFirst();
  game.g.state.corp.credits = 10;
  t.prefix('run:hq');
  t.prefix('rez:');           // corp rezzes Hunter (1cr) -> 9cr left
  t.pick('continue');         // no breakers: the trace sub fires
  assert.equal(game.decision.player, 'corp');
  assert.ok(game.decision.trace, 'corp trace decision pending');
  return { game, t };
}

export default [

// ---------------------------------------------------------------- CorpAI ----
['corp scoreWindow: scores a pending agenda, never passes', () => {
  const game = makeGame({ corp: [['False Lead', 10]], runner: [['Sure Gamble', 10]] });
  const t = driver(game).keepHands();
  t.label('Install False Lead').pick('t:new');
  const g = game.g;
  const agenda = Object.values(g.insts).find(x => x.zone === 'server-content:remote1');
  agenda.advancement = 3;               // fully advanced (3/1)
  t.pick('credit');                     // any corp action -> score window fires
  const d = game.decision;
  assert.ok(d.scoreWindow, 'score window decision pending');
  assert.equal(corpAI().decide(game, d), `score:${agenda.id}`);
}],

['corp rez window: never rezzes Archer without a scored agenda, even when rich', () => {
  const game = makeGame({ corp: [['Archer', 3], ['Hedge Fund', 7]], runner: [['Sure Gamble', 10]] });
  ensureInHand(game.g, 'corp', 'Archer');
  const t = driver(game).keepHands();
  t.label('Install Archer').label('Protecting hq');
  t.creditsOut('corp').discardFirst();
  game.g.state.corp.credits = 20;       // money is not the constraint
  t.prefix('run:hq');
  const d = game.decision;
  assert.equal(d.runStep, 'rez-ice');
  assert.ok(d.options.some(o => o.id.startsWith('rez:')), 'Archer rez is offered');
  assert.equal(game.g.state.corp.score.length, 0);
  assert.equal(corpAI().decide(game, d), 'done');
}],

['corp mulligan: no ice -> mulligan; ice + econ -> keep', () => {
  const noIce = makeGame({ corp: [['Hedge Fund', 10]], runner: [['Sure Gamble', 10]] });
  assert.ok(noIce.decision.setup);
  assert.equal(corpAI().decide(noIce, noIce.decision), 'mulligan');

  const good = makeGame({ corp: [['Enigma', 5], ['Hedge Fund', 5]], runner: [['Sure Gamble', 10]] });
  ensureInHand(good.g, 'corp', 'Enigma');
  assert.equal(corpAI().decide(good, good.decision), 'keep');
}],

['corp trace boost: buys a guaranteed trace when affordable, folds when not', () => {
  const { game } = hunterTrace();
  const d = game.decision;              // Trace 3, corp has 9cr (d.max = 9)
  const ai = corpAI();
  // runner: link 0, 4cr -> need 0+4+1-3 = 2 to be unbeatable
  game.g.state.runner.credits = 4;
  assert.equal(ai.decide(game, d), 2);
  // runner too rich to lock out (needs 28 > 9cr): hard boosts 0
  game.g.state.runner.credits = 30;
  assert.equal(ai.decide(game, d), 0);
}],

['corp discard: tosses a non-agenda, keeps the agenda', () => {
  const game = makeGame({ corp: [['Priority Requisition', 3], ['Hedge Fund', 7]], runner: [['Sure Gamble', 10]] });
  const g = game.g;
  ensureInHand(g, 'corp', 'Priority Requisition');
  ensureInHand(g, 'corp', 'Hedge Fund');
  const t = driver(game).keepHands();
  t.creditsOut('corp');                 // hand 6 > 5 -> discard decision
  const d = game.decision;
  assert.ok(d.discard);
  const answer = corpAI().decide(game, d);
  assert.ok(d.options.some(o => o.id === answer), 'answer is a legal option');
  const it = inst(g, Number(answer.split(':')[1]));
  assert.notEqual(it.card.type, 'agenda', `discarded ${it.card.title}, not an agenda`);
}],

['corp installTarget: ice install follow-up picks a legal t:<sid>, not cancel', () => {
  const game = makeGame({ corp: [['Enigma', 10]], runner: [['Sure Gamble', 10]] });
  driver(game).keepHands();
  const ai = corpAI();                  // same instance across both decisions (intent)
  const first = ai.decide(game, game.decision);
  assert.ok(first.startsWith('install:'), `picked an ice install (got ${first})`);
  game.choose(first);
  const d = game.decision;
  assert.ok(d.installTarget, 'install-target decision pending');
  const target = ai.decide(game, d);
  assert.notEqual(target, 'cancel');
  assert.match(target, /^t:/);
  assert.ok(d.options.some(o => o.id === target), 'target is a legal option');
  assert.ok(['t:hq', 't:rd'].includes(target), `iced an unprotected central (got ${target})`);
}],

// -------------------------------------------------------------- RunnerAI ----
['runner steal-cost: pays additional cost and steals', () => {
  const game = makeGame({ corp: [['Red Herrings', 2], ['Priority Requisition', 2], ['Hedge Fund', 6]], runner: [['Sure Gamble', 10]] });
  const g = game.g;
  ensureInHand(g, 'corp', 'Priority Requisition');
  ensureInHand(g, 'corp', 'Red Herrings');
  const t = driver(game).keepHands();
  t.label('Install Priority Requisition').pick('t:new');
  t.label('Install Red Herrings').pick('t:remote1');
  t.prefix('rez:');                     // rez Red Herrings (free action, 1cr)
  t.creditsOut('corp').discardFirst();
  g.state.runner.credits = 10;
  t.prefix('run:remote1');
  const d = game.decision;
  assert.equal(d.runStep, 'steal-cost');
  assert.match(d.prompt, /Steal Priority Requisition/);
  assert.equal(runnerAI().decide(game, d), 'steal');
}],

['runner access-trash: trashes a cheap asset when rich, leaves it when poor', () => {
  const game = makeGame({ corp: [['PAD Campaign', 10]], runner: [['Sure Gamble', 10]] });
  const t = driver(game).keepHands();
  t.creditsOut('corp').discardFirst();
  game.g.state.runner.credits = 10;
  t.prefix('run:rd');                   // top of R&D is a PAD Campaign
  const d = game.decision;
  assert.equal(d.runStep, 'access-trash');
  const ai = runnerAI();
  assert.equal(ai.decide(game, d), 'trash');   // 4cr trash, 10cr in pocket
  game.g.state.runner.credits = 5;             // 5-4 = 1 left: not worth it (hard)
  assert.equal(ai.decide(game, d), 'leave');
}],

['runner trace boost: pays exactly ts+1-link when affordable, 0 when broke', () => {
  const { game, t } = hunterTrace();
  game.g.state.runner.credits = 8;
  t.num(0);                             // corp declines to boost: ts = 3
  const d = game.decision;
  assert.equal(d.player, 'runner');
  assert.ok(d.trace);
  assert.match(d.prompt, /Trace strength 3 vs link 0/);
  const ai = runnerAI();
  assert.equal(ai.decide(game, d), 4);  // 3+1-0, affordable and small
  game.g.state.runner.credits = 2;      // needed 4 > 2 credits -> concede the trace
  assert.equal(ai.decide(game, d), 0);
}],

['runner encounter: breaks a dangerous sentry with a ready breaker', () => {
  const game = makeGame({ corp: [['Rototurret', 6], ['Hedge Fund', 4]], runner: [['Mimic', 2], ['Sure Gamble', 8]] });
  ensureInHand(game.g, 'corp', 'Rototurret');
  ensureInHand(game.g, 'runner', 'Mimic');
  const t = driver(game).keepHands();
  t.label('Install Rototurret').label('Protecting hq');
  t.creditsOut('corp').discardFirst();
  t.label('Install Mimic');             // str 3 >= Rototurret str 0
  t.prefix('run:hq');
  t.prefix('rez:');                     // corp rezzes Rototurret (trash-program subs)
  const d = game.decision;
  assert.equal(d.runStep, 'encounter');
  const answer = runnerAI().decide(game, d);
  assert.match(answer, /^break:/, `expected a break option, got ${answer}`);
}],

['runner encounter: lets pure-ETR ice end the run on an empty-stakes server', () => {
  const game = makeGame({ corp: [['Wall of Static', 6], ['Hedge Fund', 4]], runner: [['Aurora', 2], ['Sure Gamble', 8]] });
  ensureInHand(game.g, 'corp', 'Wall of Static');
  ensureInHand(game.g, 'runner', 'Aurora');
  const t = driver(game).keepHands();
  t.label('Install Wall of Static').pick('t:new'); // empty remote: nothing at stake
  t.creditsOut('corp').discardFirst();
  game.g.state.runner.credits = 10;
  t.label('Install Aurora');            // str 1: full break costs 2 boost + 2 = 4cr
  t.prefix('run:remote1');
  t.prefix('rez:');
  const d = game.decision;
  assert.equal(d.runStep, 'encounter');
  assert.ok(d.options.some(o => o.id.startsWith('boost:')), 'breaking was on offer');
  assert.equal(runnerAI().decide(game, d), 'continue'); // 4cr > worthBreakingEtr(3)
}],

['runner jack-out: broke runner bails facing remaining unbreakable-cost ice', () => {
  const game = makeGame({ corp: [['Wall of Static', 3], ['Enigma', 3], ['Hedge Fund', 4]], runner: [['Aurora', 2], ['Sure Gamble', 8]] });
  const g = game.g;
  ensureInHand(g, 'runner', 'Aurora');
  // HQ: rezzed Wall of Static innermost, unrezzed Enigma outermost
  const wos = Object.values(g.insts).find(x => x.card.title === 'Wall of Static');
  const enigma = Object.values(g.insts).find(x => x.card.title === 'Enigma');
  moveCard(g, wos.id, 'server-ice:hq');
  wos.rezzed = true; wos.faceup = true;
  moveCard(g, enigma.id, 'server-ice:hq');
  const t = driver(game).keepHands();
  t.creditsOut('corp').discardFirst();
  t.label('Install Aurora');
  t.prefix('run:hq');
  t.pick('done');                       // corp declines to rez Enigma; runner passes it
  const d = game.decision;
  assert.equal(d.runStep, 'jack-out');
  g.state.runner.credits = 0;           // full break of the Wall costs 4cr
  assert.equal(runnerAI().decide(game, d), 'jack-out');
}],

['runner MU prompt: cancels rather than trash a breaker for a lateral swap', () => {
  const game = makeGame({ corp: [['Hedge Fund', 10]], runner: [['Gordian Blade', 5], ['Sure Gamble', 5]] });
  const g = game.g;
  const gordians = Object.values(g.insts)
    .filter(i => i.card.title === 'Gordian Blade').map(i => i.id);
  for (const id of gordians.slice(0, 4)) moveCard(g, id, 'rig-program'); // 4/4 MU
  moveCard(g, gordians[4], 'runner-hand');
  g.state.runner.credits = 10;
  const t = driver(game).keepHands();
  t.creditsOut('corp').discardFirst();
  t.label('Install Gordian Blade');
  const d = game.decision;
  assert.ok(/Not enough MU/.test(d.prompt), d.prompt);
  assert.equal(runnerAI().decide(game, d), 'cancel');
}],

['runner discard: keeps the breaker, tosses an econ event', () => {
  const game = makeGame({ corp: [['Hedge Fund', 10]], runner: [['Mimic', 2], ['Sure Gamble', 8]] });
  const g = game.g;
  ensureInHand(g, 'runner', 'Mimic');
  const t = driver(game).keepHands();
  t.creditsOut('corp').discardFirst();
  t.pick('draw').pick('draw').pick('credit').pick('credit'); // hand 7 > 5
  const d = game.decision;
  assert.ok(d.discard);
  assert.equal(d.player, 'runner');
  const answer = runnerAI().decide(game, d);
  const it = inst(g, Number(answer.split(':')[1]));
  assert.equal(it.card.title, 'Sure Gamble', `discarded ${it.card.title}`);
}],

// ------------------------------------------------------------- legality ----
['legality: 200 autoplay decisions (standard vs standard) all validate, no aiErrors', () => {
  // game.choose validates every answer: an illegal AI answer would throw here.
  const { game, result } = autoplay({
    cardsJson, seed: 3, corpDeck: 'jinteki-core', runnerDeck: 'reina-core',
    corpLevel: 'standard', runnerLevel: 'standard', maxSteps: 200,
  });
  assert.deepEqual(result.aiErrors, []);
  assert.ok(result.winner || result.steps === 200);
  assert.equal(game.history.length, result.steps);
}],

['legality: 250 autoplay decisions (hard vs hard, nbn vs ct) all validate, no aiErrors', () => {
  const { game, result } = autoplay({
    cardsJson, seed: 5, corpDeck: 'nbn-core', runnerDeck: 'ct-core',
    corpLevel: 'hard', runnerLevel: 'hard', maxSteps: 250,
  });
  assert.deepEqual(result.aiErrors, []);
  assert.ok(result.winner || result.steps === 250);
  assert.equal(game.history.length, result.steps);
}],

];
