// Genesis Cycle Wave B (cards/waves-genesis-b.js). Faithful to printed text;
// deviations noted in docs/CARD_COVERAGE.md.
import assert from 'node:assert/strict';
import { makeGame, driver, lastEvent } from './helpers.js';
import * as fx from '../engine/effects.js';
import { inst, cardOf, moveCard } from '../engine/state.js';

// Force `title` (wherever it currently sits) into its owner's hand, swapping
// out an existing hand card to keep hand size stable (cards-c.test.js /
// cards-genesis-a.test.js precedent).
function forceIntoHand(g, title) {
  const id = Object.values(g.insts).find(i => cardOf(g, i.id).title === title)?.id;
  if (id == null) throw new Error(`no ${title} in this game`);
  const zone = inst(g, id).zone;
  if (zone === 'corp-hand' || zone === 'runner-hand') return id;
  const side = cardOf(g, id).side;
  const hand = side === 'corp' ? g.state.corp.hand : g.state.runner.hand;
  if (hand.length > 0) moveCard(g, hand[0], `${side}-deck`);
  moveCard(g, id, `${side}-hand`);
  return id;
}

const filler = n => [['Hedge Fund', n]];
const rFiller = n => [['Sure Gamble', n]];

// Install `title` (ice, from HQ) protecting `server`, rez it, and leave the
// corp turn mid-action so the runner can act next.
function installIceAndFinishCorpTurn(t, title, server = 'hq') {
  t.label(`Install ${title}`).label(`Protecting ${server}`);
  t.creditsOut('corp').discardFirst();
  return t;
}

// Like driver.discardFirst(), but never discards a card titled `keepTitle`
// (cards-genesis-a.test.js precedent) — used whenever a forced-into-hand
// card must survive a mandatory hand-size discard before it gets played.
function discardKeeping(t, g, keepTitle) {
  while (t.game.decision?.discard) {
    const opts = t.d.options;
    const pick = opts.find(o => cardOf(g, Number(o.id.split(':')[1])).title !== keepTitle) ?? opts[0];
    t.pick(pick.id);
  }
  return t;
}

export default [

['Janus 1.0: bioroid sentry, 4x core damage when unbroken', () => {
  const game = makeGame({ corp: [['Janus 1.0', 6], ...filler(9)], runner: rFiller(10) });
  const g = game.g;
  const t = driver(game).keepHands();
  installIceAndFinishCorpTurn(t, 'Janus 1.0');
  g.state.corp.credits = 20; // 15cr rez cost
  t.prefix('run:hq');
  t.prefix('rez');
  t.pick('continue'); // no breakers, all 4 subs fire
  assert.equal(g.state.runner.brainDamage, 4);
}],

['TMI: on rez, trace 2 — success keeps it rezzed', () => {
  const game = makeGame({ corp: [['TMI', 6], ...filler(9)], runner: rFiller(10) });
  const g = game.g;
  const t = driver(game).keepHands();
  installIceAndFinishCorpTurn(t, 'TMI');
  g.state.corp.credits = 20;
  t.prefix('run:hq');
  t.prefix('rez');
  t.num(0); t.num(0); // trace 2 vs 0 link succeeds regardless
  const iceId = g.state.corp.servers.hq.ice[0];
  assert.equal(inst(g, iceId).rezzed, true);
  t.pick('continue'); // ETR sub fires
  assert.equal(lastEvent(game, 'run-end').data.successful, false);
}],

['TMI: on rez, trace 2 — failure derezzes it', () => {
  const game = makeGame({ corp: [['TMI', 6], ...filler(9)], runner: rFiller(10) });
  const g = game.g;
  const t = driver(game).keepHands();
  installIceAndFinishCorpTurn(t, 'TMI');
  g.state.corp.credits = 3; // exactly enough to rez (3cr), nothing left to boost with
  g.state.runner.credits = 10;
  t.prefix('run:hq');
  t.prefix('rez');
  t.num(0); t.num(5); // runner boosts link well past base 2 -> trace fails
  const iceId = g.state.corp.servers.hq.ice[0];
  assert.equal(inst(g, iceId).rezzed, false);
  assert.equal(lastEvent(game, 'derezzed').data.title, 'TMI');
}],

['Dracō: on rez may load power counters for +strength; sub traces 2 for a tag and ends the run', () => {
  const game = makeGame({ corp: [['Dracō', 6], ...filler(9)], runner: rFiller(10) });
  const g = game.g;
  const t = driver(game).keepHands();
  installIceAndFinishCorpTurn(t, 'Dracō');
  g.state.corp.credits = 20;
  t.prefix('run:hq');
  t.prefix('rez');
  t.num(3); // load 3 power counters
  const iceId = g.state.corp.servers.hq.ice[0];
  assert.equal(inst(g, iceId).counters.power, 3);
  t.pick('continue'); // no breakers, the sub fires
  t.num(0); t.num(0); // trace 2 vs 0 link succeeds
  assert.equal(g.state.runner.tags, 1);
  assert.equal(lastEvent(game, 'run-end').data.successful, false);
}],

['Sherlock 1.0: bioroid sentry, trace 4 adds an installed program to the top of the stack', () => {
  const game = makeGame({ corp: [['Sherlock 1.0', 6], ...filler(9)], runner: [['Aurora', 1], ...rFiller(9)] });
  const g = game.g;
  const t = driver(game).keepHands();
  forceIntoHand(g, 'Aurora');
  installIceAndFinishCorpTurn(t, 'Sherlock 1.0');
  g.state.corp.credits = 20;
  g.state.runner.credits = 10;
  t.label('Install Aurora');
  t.prefix('run:hq');
  t.prefix('rez');
  t.pick('continue'); // let both subs fire
  t.num(0); t.num(0); // sub1 trace 4 vs 0 link succeeds
  t.label('Aurora'); // corp chooses which program to send to the stack
  assert.equal(g.state.runner.rig.program.length, 0);
  assert.equal(g.state.runner.deck[0], Object.values(g.insts).find(i => cardOf(g, i.id).title === 'Aurora').id);
  // sub2: no programs left, its trace still resolves but the pick is a no-op
  t.num(0); t.num(0);
}],

['Viper: trace 3 -> lose a click if able; trace 3 -> end the run', () => {
  const game = makeGame({ corp: [['Viper', 6], ...filler(9)], runner: rFiller(10) });
  const g = game.g;
  const t = driver(game).keepHands();
  installIceAndFinishCorpTurn(t, 'Viper');
  g.state.corp.credits = 20;
  const clicksBefore = g.state.runner.clicks;
  t.prefix('run:hq');
  t.prefix('rez');
  t.pick('continue'); // no breakers, both subs fire: sub1 (lose a click) resolves
  // synchronously with no decision, then sub2 (trace 3 -> end the run) yields
  t.num(0); t.num(0); // sub2 trace succeeds
  assert.equal(g.state.runner.clicks, clicksBefore - 1 - 1); // -1 to initiate the run, -1 from sub1
  assert.equal(lastEvent(game, 'run-end').data.successful, false);
}],

['Woodcutter: advanceable while rezzed, gains 1 net-damage sub per advancement', () => {
  const game = makeGame({ corp: [['Woodcutter', 6], ...filler(9)], runner: rFiller(10) });
  const g = game.g;
  const t = driver(game).keepHands();
  g.state.corp.credits = 20;
  forceIntoHand(g, 'Woodcutter');
  t.label('Install Woodcutter').label('Protecting hq');
  // Advancing itself doesn't require the ice to be rezzed (advanceable:
  // true, unconditional — this engine can only rez ice during a run's
  // approach window, so unlike freely-rezzable-anytime real Netrunner, the
  // rez happens below once the Runner actually runs into it).
  t.label('Advance');
  t.label('Advance');
  const iceId = g.state.corp.servers.hq.ice[0];
  assert.equal(inst(g, iceId).advancement, 2);
  t.creditsOut('corp').discardFirst();
  t.prefix('run:hq');
  t.prefix('rez'); // rez during the run's approach window
  t.pick('continue'); // both net-damage subs fire (no breakers)
  assert.equal(g.state.runner.hand.length < 5, true); // took damage
  const handBefore = 5 - 2;
  assert.equal(g.state.runner.hand.length, handBefore);
}],

['Tyrant: advanceable while rezzed, gains 1 end-the-run sub per advancement', () => {
  const game = makeGame({ corp: [['Tyrant', 6], ...filler(9)], runner: rFiller(10) });
  const g = game.g;
  const t = driver(game).keepHands();
  g.state.corp.credits = 20;
  forceIntoHand(g, 'Tyrant');
  t.label('Install Tyrant').label('Protecting hq');
  t.label('Advance');
  const iceId = g.state.corp.servers.hq.ice[0];
  assert.equal(inst(g, iceId).advancement, 1);
  t.creditsOut('corp').discardFirst();
  t.prefix('run:hq');
  t.prefix('rez'); // rez during the run's approach window
  t.pick('continue'); // the single ETR sub fires
  assert.equal(lastEvent(game, 'run-end').data.successful, false);
}],

['Salvage: advanceable while rezzed, gains 1 trace-2-for-a-tag sub per advancement', () => {
  const game = makeGame({ corp: [['Salvage', 6], ...filler(9)], runner: rFiller(10) });
  const g = game.g;
  const t = driver(game).keepHands();
  g.state.corp.credits = 20;
  forceIntoHand(g, 'Salvage');
  t.label('Install Salvage').label('Protecting hq');
  t.label('Advance');
  t.creditsOut('corp').discardFirst();
  t.prefix('run:hq');
  t.prefix('rez'); // rez during the run's approach window
  t.pick('continue');
  t.num(0); t.num(0); // trace 2 vs 0 link succeeds
  assert.equal(g.state.runner.tags, 1);
}],

['Chimera: on rez choose a subtype; derezzes at the end of the (runner\'s) turn', () => {
  const game = makeGame({ corp: [['Chimera', 6], ...filler(9)], runner: rFiller(10) });
  const g = game.g;
  const t = driver(game).keepHands();
  installIceAndFinishCorpTurn(t, 'Chimera');
  t.prefix('run:hq');
  t.prefix('rez');
  t.pick('barrier'); // choose subtype
  const iceId = g.state.corp.servers.hq.ice[0];
  assert.ok(g.state.flags.turn.tinkered[iceId].includes('barrier'));
  assert.equal(inst(g, iceId).rezzed, true);
  t.pick('continue'); // ETR sub fires
  assert.equal(lastEvent(game, 'run-end').data.successful, false);
  t.creditsOut('runner').discardFirst(); // end of runner's turn -> Chimera derezzes
  assert.equal(inst(g, iceId).rezzed, false);
}],

['Hourglass: 3x "the Runner loses [click], if able"', () => {
  const game = makeGame({ corp: [['Hourglass', 6], ...filler(9)], runner: rFiller(10) });
  const g = game.g;
  const t = driver(game).keepHands();
  installIceAndFinishCorpTurn(t, 'Hourglass');
  g.state.corp.credits = 20;
  const clicksBefore = g.state.runner.clicks;
  t.prefix('run:hq');
  t.prefix('rez');
  t.pick('continue'); // all 3 subs fire
  assert.equal(g.state.runner.clicks, Math.max(0, clicksBefore - 1 - 3));
}],

['Uroboros: trace 4 forbids further runs this turn; trace 4 ends the run', () => {
  const game = makeGame({ corp: [['Uroboros', 6], ...filler(9)], runner: rFiller(10) });
  const g = game.g;
  const t = driver(game).keepHands();
  installIceAndFinishCorpTurn(t, 'Uroboros');
  g.state.corp.credits = 20;
  t.prefix('run:hq');
  t.prefix('rez');
  t.pick('continue');
  t.num(0); t.num(0); // sub1 succeeds
  assert.equal(g.state.flags.turn.noMoreRuns, true);
  t.num(0); t.num(0); // sub2 succeeds
  assert.equal(lastEvent(game, 'run-end').data.successful, false);
  assert.ok(!game.decision.options.some(o => o.id.startsWith('run:')));
}],

['Eli 1.0: bioroid barrier, 2x end the run', () => {
  const game = makeGame({ corp: [['Eli 1.0', 6], ...filler(9)], runner: rFiller(10) });
  const g = game.g;
  const t = driver(game).keepHands();
  installIceAndFinishCorpTurn(t, 'Eli 1.0');
  g.state.corp.credits = 20;
  t.prefix('run:hq');
  t.prefix('rez');
  t.pick('continue'); // both ETRs fire
  assert.equal(lastEvent(game, 'run-end').data.successful, false);
}],

['Burke Bugs: trace 0 -> the Runner trashes 1 program (their own choice)', () => {
  const game = makeGame({ corp: [['Burke Bugs', 6], ...filler(9)], runner: [['Aurora', 1], ...rFiller(9)] });
  const g = game.g;
  const t = driver(game).keepHands();
  forceIntoHand(g, 'Aurora');
  installIceAndFinishCorpTurn(t, 'Burke Bugs');
  g.state.corp.credits = 5;
  g.state.runner.credits = 10;
  t.label('Install Aurora');
  t.prefix('run:hq');
  t.prefix('rez');
  t.pick('continue');
  t.num(1); t.num(0); // corp boosts to 1 so trace 0->1 beats link 0
  t.label('Aurora');
  assert.equal(g.state.runner.rig.program.length, 0);
}],

['Data Hound: trace 2 -> look at the top X cards of the stack, trash 1, arrange the rest', () => {
  const game = makeGame({ corp: [['Data Hound', 6], ...filler(9)], runner: rFiller(10) });
  const g = game.g;
  const t = driver(game).keepHands();
  installIceAndFinishCorpTurn(t, 'Data Hound');
  g.state.corp.credits = 20;
  const deckBefore = g.state.runner.deck.length;
  t.prefix('run:hq');
  t.prefix('rez');
  t.pick('continue');
  t.num(0); t.num(0); // trace 2 vs 0 link -> margin 2
  t.prefix('t:'); // corp picks which of the top 2 to trash
  t.prefix('c:'); // corp arranges the remaining 1 card
  assert.equal(g.state.runner.deck.length, deckBefore - 1);
}],

['Power Grid Overload: playable only after a successful run last turn; trace 2 trashes cheap hardware', () => {
  const game = makeGame({ corp: [['Power Grid Overload', 1], ...filler(9)], runner: [['Rabbit Hole', 1], ...rFiller(9)] });
  const g = game.g;
  const t = driver(game).keepHands();
  forceIntoHand(g, 'Power Grid Overload');
  t.creditsOut('corp'); discardKeeping(t, g, 'Power Grid Overload'); // corp turn 1
  g.state.runner.credits = 10;
  forceIntoHand(g, 'Rabbit Hole');
  t.label('Install Rabbit Hole');
  t.prefix('run:archives'); // unprotected, always successful
  t.pick('continue'); // approach-server jack-out: continue
  t.creditsOut('runner').discardFirst(); // end runner turn 1 -> lastRunnerTurn snapshot taken
  assert.ok(game.decision.options.some(o => o.label.startsWith('Play Power Grid Overload')));
  t.label('Play Power Grid Overload');
  t.num(2); t.num(0); // trace 2+2=4 vs link 0 -> margin 4, Rabbit Hole (2cr) eligible
  t.prefix('t:');
  assert.equal(g.state.runner.rig.hardware.length, 0);
}],

['Foxfire: trace 7 -> trash 1 virtual resource or link card', () => {
  const game = makeGame({ corp: [['Foxfire', 1], ...filler(9)], runner: [['Dyson Mem Chip', 1], ...rFiller(9)] });
  const g = game.g;
  const t = driver(game).keepHands();
  forceIntoHand(g, 'Foxfire');
  t.creditsOut('corp'); discardKeeping(t, g, 'Foxfire');
  g.state.runner.credits = 10;
  forceIntoHand(g, 'Dyson Mem Chip');
  t.label('Install Dyson Mem Chip');
  t.creditsOut('runner').discardFirst();
  forceIntoHand(g, 'Foxfire');
  g.state.corp.credits = 10;
  t.label('Play Foxfire');
  t.num(7); t.num(0); // trace 7+7=14 vs link 1 -> success comfortably
  t.prefix('t:');
  assert.equal(g.state.runner.rig.hardware.length, 0);
}],

['Midseason Replacements: playable only after the Runner stole an agenda last turn; trace 6 -> X tags', () => {
  const game = makeGame({
    corp: [['Midseason Replacements', 1], ['Hostile Takeover', 1], ...filler(8)],
    runner: rFiller(10),
  });
  const g = game.g;
  const t = driver(game).keepHands();
  forceIntoHand(g, 'Midseason Replacements');
  forceIntoHand(g, 'Hostile Takeover');
  t.label('Install Hostile Takeover').pick('t:new');
  t.creditsOut('corp'); discardKeeping(t, g, 'Midseason Replacements');
  t.prefix('run:remote1');
  t.pick('continue'); // approach-server jack-out: continue
  // Hostile Takeover has no additional steal cost and no upgrade in the
  // server, so stealDecision steals it immediately with no further decision
  // (no rez prompt either: corpRunWindow never offers to rez an agenda).
  t.creditsOut('runner').discardFirst(); // lastRunnerTurn.stolenPoints snapshot taken
  assert.ok(game.decision.options.some(o => o.label.startsWith('Play Midseason Replacements')));
  // Set credits before playing: the operation's trace boost decision (and
  // its min/max range) is generated synchronously as part of resolving the
  // play, so a credit bump made afterward would be too late to be reflected
  // in that already-frozen decision (the frozen-decision timing rule).
  g.state.corp.credits = 20;
  t.label('Play Midseason Replacements');
  t.num(4); t.num(0); // trace 6+4=10 vs link 0 -> margin 10
  assert.equal(g.state.runner.tags, 10);
}],

['Dedicated Server: 2 recurring credits, usable to rez ice', () => {
  const game = makeGame({ corp: [['Dedicated Server', 1], ['Ice Wall', 1], ...filler(8)], runner: rFiller(10) });
  const g = game.g;
  const t = driver(game).keepHands();
  g.state.corp.credits = 20;
  forceIntoHand(g, 'Dedicated Server');
  t.label('Install Dedicated Server').pick('t:new');
  t.prefix('rez'); // rez Dedicated Server itself
  t.creditsOut('corp').discardFirst();
  t.creditsOut('runner').discardFirst(); // corp turn 2: pool refills
  forceIntoHand(g, 'Ice Wall');
  t.label('Install Ice Wall').label('Protecting hq');
  const iceId = g.state.corp.servers.hq.ice[0];
  t.creditsOut('corp').discardFirst(); // ice can only be rezzed during a run's approach window
  const before = g.state.corp.credits;
  t.prefix('run:hq');
  t.prefix('rez'); // rez during the run's approach window, from Dedicated Server's pool
  assert.equal(inst(g, iceId).rezzed, true);
  assert.equal(g.state.corp.credits, before); // Ice Wall's 1cr rez cost paid entirely from the pool
}],

['Net Police: recurring credits equal to the Runner\'s link, usable during traces', () => {
  const game = makeGame({ corp: [['Net Police', 1], ['TMI', 1], ...filler(8)], runner: [['Dyson Mem Chip', 1], ...rFiller(9)] });
  const g = game.g;
  const t = driver(game).keepHands();
  g.state.corp.credits = 20;
  forceIntoHand(g, 'Net Police');
  forceIntoHand(g, 'TMI');
  t.label('Install Net Police').pick('t:new');
  t.prefix('rez');
  t.creditsOut('corp'); discardKeeping(t, g, 'TMI');
  g.state.runner.credits = 10;
  forceIntoHand(g, 'Dyson Mem Chip');
  t.label('Install Dyson Mem Chip'); // +1 link
  t.creditsOut('runner').discardFirst(); // corp turn 2: Net Police pool refills to 1 (runner's link)
  t.label('Install TMI').label('Protecting rd');
  t.creditsOut('corp').discardFirst(); // ice can only be rezzed during a run's approach window;
  // the recurring pool refilled at corp turn start persists through the
  // Runner's following turn, so it's still available below.
  t.prefix('run:rd');
  t.prefix('rez'); // triggers TMI's onRez trace 2 (TMI's own 3cr rez cost is
  // paid from real credits — Net Police's pool only covers 'trace' purpose)
  const before = g.state.corp.credits;
  t.num(1); // corp boosts 1cr, drawn from Net Police's pool
  t.num(0);
  assert.equal(g.state.corp.credits, before); // boost paid from the pool, not real credits
}],

['Kati Jones: cannot be used more than once per turn', () => {
  const game = makeGame({ corp: filler(10), runner: [['Kati Jones', 1], ...rFiller(9)] });
  const g = game.g;
  const t = driver(game).keepHands();
  t.creditsOut('corp').discardFirst();
  g.state.runner.credits = 10;
  forceIntoHand(g, 'Kati Jones');
  t.label('Install Kati Jones');
  t.label('Place 3 credits on Kati Jones');
  const id = g.state.runner.rig.resource[0];
  assert.equal(inst(g, id).counters.credit, 3);
  // same turn: neither ability is offered again
  assert.ok(!game.decision.options.some(o => o.label.startsWith('Kati Jones')));
  t.creditsOut('runner').discardFirst();
  t.creditsOut('corp').discardFirst(); // next runner turn
  const before = g.state.runner.credits;
  t.label('Take all credits from Kati Jones');
  assert.equal(g.state.runner.credits, before + 3);
  assert.equal(inst(g, id).counters.credit, 0);
}],

['Data Leak Reversal: install only after a successful run on a central server this turn', () => {
  const game = makeGame({ corp: filler(10), runner: [['Data Leak Reversal', 1], ...rFiller(9)] });
  const g = game.g;
  const t = driver(game).keepHands();
  t.creditsOut('corp').discardFirst();
  g.state.runner.credits = 10;
  forceIntoHand(g, 'Data Leak Reversal');
  assert.ok(!game.decision.options.some(o => o.label.startsWith('Install Data Leak Reversal')));
  t.prefix('run:hq'); // unprotected, successful
  t.pick('continue'); // approach-server jack-out: continue
  assert.ok(game.decision.options.some(o => o.label.startsWith('Install Data Leak Reversal')));
  g.state.runner.tags = 1; // set before the post-install decision is generated
  t.label('Install Data Leak Reversal');
  const rdBefore = g.state.corp.deck.length;
  t.label('The Corp trashes the top card of R&D');
  assert.equal(g.state.corp.deck.length, rdBefore - 1);
}],

['R&D Interface: breach R&D accesses 1 additional card', () => {
  const game = makeGame({ corp: filler(10), runner: [['R&D Interface', 1], ...rFiller(9)] });
  const g = game.g;
  const t = driver(game).keepHands();
  t.creditsOut('corp').discardFirst();
  g.state.runner.credits = 10;
  forceIntoHand(g, 'R&D Interface');
  t.label('Install R&D Interface');
  t.prefix('run:rd');
  t.pick('continue'); // approach-server jack-out: continue
  assert.equal(lastEvent(game, 'access-count').data.n, 2);
}],

['Deep Thought: successful R&D runs place virus counters; at 3+, may peek at the top of R&D', () => {
  const game = makeGame({ corp: filler(10), runner: [['Deep Thought', 1], ...rFiller(9)] });
  const g = game.g;
  const t = driver(game).keepHands();
  t.creditsOut('corp').discardFirst();
  g.state.runner.credits = 10;
  forceIntoHand(g, 'Deep Thought');
  t.label('Install Deep Thought');
  t.prefix('run:rd');
  t.pick('continue'); // approach-server jack-out: continue -> run resolves as successful
  const id = g.state.runner.rig.program[0];
  assert.equal(inst(g, id).counters.virus, 1);
  inst(g, id).counters.virus = 3; // fast-forward past 2 more real R&D runs
  t.creditsOut('runner').discardFirst();
  t.creditsOut('corp').discardFirst(); // next runner turn start: Deep Thought offers a peek
  assert.ok(game.decision.options.some(o => o.label === 'Look'));
  t.pick('look');
  assert.equal(lastEvent(game, 'card-peeked').data.title, cardOf(g, g.state.corp.deck[0]).title);
}],

['Fetal AI: 2 net damage on access anywhere but Archives; costs an extra 2cr to steal', () => {
  const game = makeGame({ corp: [['Fetal AI', 1], ...filler(9)], runner: rFiller(10) });
  const g = game.g;
  const t = driver(game).keepHands();
  forceIntoHand(g, 'Fetal AI');
  t.label('Install Fetal AI').pick('t:new');
  const id = g.state.corp.servers.remote1.content[0];
  t.creditsOut('corp').discardFirst(); // end corp turn 1 at 0 advancement (not yet scorable)
  inst(g, id).advancement = 5; // set between turns, so the corp's scoreWindow never re-triggers
  g.state.runner.credits = 10;
  const handBefore = g.state.runner.hand.length;
  t.prefix('run:remote1');
  t.pick('continue'); // approach-server jack-out: continue (agendas are never
  // offered as a rez option, so no decline-to-rez decision appears here)
  assert.equal(g.state.runner.hand.length, handBefore - 2); // 2 net damage on access
  const before = g.state.runner.credits;
  t.pick('steal');
  assert.equal(g.state.runner.credits, before - 2); // additional steal cost
  assert.equal(g.state.corp.agendaPoints, 0);
  assert.equal(g.state.runner.agendaPoints, 2);
}],

['Edge of World: on access, corp may pay 3cr for 1 core damage per protecting ice', () => {
  const game = makeGame({ corp: [['Edge of World', 1], ['Ice Wall', 1], ...filler(8)], runner: rFiller(10) });
  const g = game.g;
  const t = driver(game).keepHands();
  g.state.corp.credits = 20;
  forceIntoHand(g, 'Ice Wall');
  t.label('Install Ice Wall').pick('t:new'); // creates remote1, protected by 1 ice
  forceIntoHand(g, 'Edge of World');
  t.label('Install Edge of World').prefix('t:remote1'); // same server, as content
  t.creditsOut('corp').discardFirst();
  g.state.runner.credits = 10;
  const handBefore = g.state.runner.hand.length;
  t.prefix('run:remote1');
  t.pick('done'); // decline to rez Ice Wall — unrezzed ice never fires its ETR sub
  t.pick('continue'); // approach-server jack-out: continue
  t.pick('done'); // decline to rez Edge of World (irrelevant, no rez cost)
  t.pick('pay'); // pay 3cr for the damage
  assert.equal(g.state.runner.hand.length, handBefore - 1); // 1 ice protecting the server
}],

];
