import assert from 'node:assert/strict';
import { makeGame, driver, lastEvent } from './helpers.js';
import * as fx from '../engine/effects.js';
import { inst, cardOf, moveCard, memoryLimit, memoryUsed } from '../engine/state.js';
import { breakerStrength, effectiveIceSubtypes } from '../engine/run.js';

const filler = n => [['Hedge Fund', n]];
const rFiller = n => [['Sure Gamble', n]];

// Note: makeGame's default runner identity is Gabriel Santiago: Consummate
// Professional: the first successful run on HQ each turn gains 2cr. Tests
// below that run HQ with the default identity account for that credit gain
// explicitly; tests that don't care about it use RD / Archives / a remote
// instead to keep assertions simple.

// Force `title` (wherever it currently sits) into its owner's hand, swapping
// out an existing hand card to keep hand size stable. Sanctioned direct-state
// setup (see tests/helpers.js docs / cards-b.test.js / cards-c.test.js
// precedent). Returns the forced card's instance id.
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

export default [

['Chaos Theory: Wünderkind: +1 memory unit (5 total)', () => {
  const game = makeGame({ runnerId: 'Chaos Theory: Wunderkind', corp: filler(10), runner: rFiller(10) });
  const g = game.g;
  assert.equal(memoryLimit(g), 5); // base 4 + Chaos Theory's +1
}],

['Diesel: draws 3 cards', () => {
  const game = makeGame({ corp: filler(10), runner: [['Diesel', 1], ...rFiller(9)] });
  const g = game.g;
  const t = driver(game).keepHands();
  t.creditsOut('corp').discardFirst();
  forceIntoHand(g, 'Diesel');
  t.pick('credit'); // rebuild the action menu so it reflects the freshly-forced hand
  const handBefore = g.state.runner.hand.length;
  t.label('Play Diesel');
  assert.equal(g.state.runner.hand.length, handBefore - 1 + 3); // -1 played, +3 drawn
}],

['Indexing: a successful R&D run may replace breaching with rearranging the top 5 cards', () => {
  const game = makeGame({
    corp: [['Ice Wall', 1], ['Enigma', 1], ['Hunter', 1], ['Wall of Static', 1], ['Beanstalk Royalties', 1], ...filler(10)],
    runner: [['Indexing', 1], ...rFiller(9)],
  });
  const g = game.g;
  const t = driver(game).keepHands();
  t.creditsOut('corp').discardFirst();
  const titles5 = ['Ice Wall', 'Enigma', 'Hunter', 'Wall of Static', 'Beanstalk Royalties'];
  const ids5 = titles5.map(ti => Object.values(g.insts).find(i => cardOf(g, i.id).title === ti).id);
  for (const id of ids5) if (!g.state.corp.deck.includes(id)) moveCard(g, id, 'corp-deck');
  g.state.corp.deck = [...ids5, ...g.state.corp.deck.filter(id => !ids5.includes(id))]; // deterministic top 5
  forceIntoHand(g, 'Indexing');
  t.pick('credit'); // rebuild the action menu so it reflects the freshly-forced hand
  t.label('Play Indexing');
  t.pick('continue'); // approach-server jack-out: continue
  t.pick('instead'); // use the replacement effect instead of breaching
  // reverse the 5-card order by always choosing the last remaining option
  for (let i = 0; i < 5; i++) {
    const opts = game.decision.options;
    t.pick(opts[opts.length - 1].id);
  }
  assert.deepEqual(g.state.corp.deck.slice(0, 5), [...ids5].reverse());
  assert.ok(lastEvent(game, 'deck-rearranged'));
  assert.equal(lastEvent(game, 'run-end').data.successful, true);
}],

['Modded: installs a program or piece of hardware from the grip at a 3cr discount, no extra click', () => {
  const game = makeGame({ corp: filler(10), runner: [['Modded', 1], ['Dyson Mem Chip', 1], ...rFiller(8)] });
  const g = game.g;
  const t = driver(game).keepHands();
  t.creditsOut('corp').discardFirst();
  forceIntoHand(g, 'Modded');
  forceIntoHand(g, 'Dyson Mem Chip');
  t.pick('credit'); // rebuild the action menu so it reflects the freshly-forced hand
  const creditsAfterClick = g.state.runner.credits;
  const clicksBefore = g.state.runner.clicks;
  t.label('Play Modded');
  t.label('Dyson Mem Chip'); // install target, discounted to 0cr
  const dysonId = g.state.runner.rig.hardware.find(id => cardOf(g, id).title === 'Dyson Mem Chip');
  assert.equal(inst(g, dysonId).zone, 'rig-hardware');
  assert.equal(g.state.runner.credits, creditsAfterClick); // fully discounted: 3cr cost - 3cr discount = 0
  assert.equal(g.state.runner.clicks, clicksBefore - 1); // only the click to play Modded; the install itself is free
}],

['Notoriety: playable only after successful runs on R&D, HQ, and Archives this turn; scores as a 1-point agenda', () => {
  const game = makeGame({ corp: filler(10), runner: [['Notoriety', 1], ...rFiller(9)] });
  const g = game.g;
  const t = driver(game).keepHands();
  t.creditsOut('corp').discardFirst();
  forceIntoHand(g, 'Notoriety');
  t.prefix('run:rd'); // regenerates the action menu as a side effect
  t.pick('continue'); // approach-server jack-out: continue
  assert.ok(!game.decision.options.some(o => o.label.includes('Play Notoriety'))); // missing hq + archives
  t.prefix('run:hq');
  t.pick('continue'); // approach-server jack-out: continue
  t.prefix('run:archives');
  t.pick('continue'); // approach-server jack-out: continue
  assert.ok(game.decision.options.some(o => o.label.includes('Play Notoriety'))); // all 3 centrals hit this turn
  const notId = Object.values(g.insts).find(i => cardOf(g, i.id).title === 'Notoriety').id;
  const before = g.state.runner.agendaPoints;
  t.label('Play Notoriety');
  assert.equal(g.state.runner.agendaPoints, before + 1);
  assert.equal(inst(g, notId).zone, 'runner-score');
}],

["Test Run: installs a program from the heap ignoring all costs, then returns it to the top of the stack at end of turn", () => {
  const game = makeGame({ corp: filler(10), runner: [['Test Run', 1], ['Morning Star', 1], ...rFiller(8)] });
  const g = game.g;
  const t = driver(game).keepHands();
  t.creditsOut('corp').discardFirst();
  const msId = Object.values(g.insts).find(i => cardOf(g, i.id).title === 'Morning Star').id;
  moveCard(g, msId, 'runner-discard'); // heap
  forceIntoHand(g, 'Test Run');
  t.pick('credit'); // rebuild the action menu so it reflects the freshly-forced hand
  const before = g.state.runner.credits;
  t.label('Play Test Run');
  t.pick('discard'); // search the heap
  t.label('Morning Star');
  assert.equal(inst(g, msId).zone, 'rig-program');
  assert.equal(g.state.runner.credits, before - 3); // Test Run's own cost only; install was free
  assert.equal(inst(g, msId).pendingReturnToStack, true);
  t.creditsOut('runner');
  t.creditsOut('corp').discardFirst(); // advance to runner turn 2
  assert.equal(inst(g, msId).zone, 'runner-deck'); // returned to the stack...
  assert.equal(g.state.runner.deck[0], msId);      // ...specifically to the top
  assert.equal(lastEvent(game, 'card-returned-to-stack').data.title, 'Morning Star');
}],

["Test Run: no return-to-stack if the program was uninstalled before the turn ends", () => {
  const game = makeGame({ corp: filler(10), runner: [['Test Run', 1], ['Morning Star', 1], ...rFiller(8)] });
  const g = game.g;
  const t = driver(game).keepHands();
  t.creditsOut('corp').discardFirst();
  const msId = Object.values(g.insts).find(i => cardOf(g, i.id).title === 'Morning Star').id;
  moveCard(g, msId, 'runner-discard'); // heap
  forceIntoHand(g, 'Test Run');
  t.pick('credit');
  t.label('Play Test Run');
  t.pick('discard');
  t.label('Morning Star');
  assert.equal(inst(g, msId).zone, 'rig-program');
  fx.trash(g, msId, 'test'); // uninstalled before the turn ends
  t.creditsOut('runner');
  t.creditsOut('corp').discardFirst(); // advance to runner turn 2
  assert.equal(inst(g, msId).zone, 'runner-discard'); // stays in the heap, not bounced to the stack
  assert.equal(inst(g, msId).pendingReturnToStack, false);
}],

['The Maker’s Eye: a successful R&D run accesses 3 cards total', () => {
  const game = makeGame({ corp: filler(10), runner: [['The Maker’s Eye', 1], ...rFiller(9)] });
  const g = game.g;
  const t = driver(game).keepHands();
  t.creditsOut('corp').discardFirst();
  forceIntoHand(g, 'The Maker’s Eye');
  t.pick('credit'); // rebuild the action menu so it reflects the freshly-forced hand
  t.label('Play The Maker’s Eye');
  t.pick('continue'); // approach-server jack-out: continue
  assert.equal(lastEvent(game, 'access-count').data.n, 3); // 1 + 2 bonus
  assert.equal(lastEvent(game, 'run-end').data.successful, true);
}],

['Tinkering: chosen ice gains sentry, code gate, and barrier until end of turn', () => {
  const game = makeGame({ corp: [['Ice Wall', 1], ...filler(9)], runner: [['Tinkering', 1], ...rFiller(9)] });
  const g = game.g;
  const t = driver(game).keepHands();
  t.label('Install Ice Wall').label('Protecting hq');
  t.creditsOut('corp').discardFirst();
  const iwId = g.state.corp.servers.hq.ice[0];
  forceIntoHand(g, 'Tinkering');
  t.pick('credit'); // rebuild the action menu so it reflects the freshly-forced hand
  t.label('Play Tinkering');
  t.label('Ice Wall');
  assert.deepEqual(g.state.flags.turn.tinkered[iwId], ['sentry', 'code-gate', 'barrier']);
  const subtypes = effectiveIceSubtypes(g, inst(g, iwId));
  for (const s of ['sentry', 'code-gate', 'barrier']) assert.ok(subtypes.includes(s));
}],

['Dinosaurus: hosted icebreaker gets +2 strength and its memory cost is free', () => {
  const game = makeGame({ corp: filler(10), runner: [['Dinosaurus', 1], ['Gordian Blade', 1], ...rFiller(8)] });
  const g = game.g;
  const t = driver(game).keepHands();
  t.creditsOut('corp').discardFirst();
  g.state.runner.credits = 20;
  forceIntoHand(g, 'Dinosaurus');
  forceIntoHand(g, 'Gordian Blade');
  t.pick('credit'); // rebuild the action menu so it reflects the freshly-forced hand
  t.label('Install Dinosaurus');
  t.label('Install Gordian Blade');
  t.label('Host it');
  const gbId = g.state.runner.rig.program.find(id => cardOf(g, id).title === 'Gordian Blade');
  const dinoId = g.state.runner.rig.hardware.find(id => cardOf(g, id).title === 'Dinosaurus');
  assert.equal(inst(g, gbId).hostId, dinoId);
  assert.equal(breakerStrength(g, gbId), cardOf(g, gbId).strength + 2);
  assert.equal(memoryUsed(g), 0); // Gordian Blade's MU cost doesn't count while hosted
}],

['Rabbit Hole: +1 link; on install, may search the stack for another copy and install it, paying its cost', () => {
  const game = makeGame({ corp: filler(10), runner: [['Rabbit Hole', 2], ...rFiller(8)] });
  const g = game.g;
  const t = driver(game).keepHands();
  t.creditsOut('corp').discardFirst();
  g.state.runner.credits = 10;
  const rhId = forceIntoHand(g, 'Rabbit Hole'); // one copy into hand; keep the other in the stack
  const secondId = Object.values(g.insts).find(i => cardOf(g, i.id).title === 'Rabbit Hole' && i.id !== rhId).id;
  if (!g.state.runner.deck.includes(secondId)) moveCard(g, secondId, 'runner-deck');
  t.pick('credit'); // rebuild the action menu so it reflects the freshly-forced hand
  const before = g.state.runner.credits;
  t.label('Install Rabbit Hole');
  t.label('Rabbit Hole'); // search choice: install the 2nd copy from the stack
  assert.equal(inst(g, secondId).zone, 'rig-hardware');
  assert.equal(g.state.runner.credits, before - 2 - 2); // 1st copy's cost + 2nd copy's cost (still paid)
  assert.equal(fx.linkBonus(g), 2); // both copies grant +1 link each
}],

["The Personal Touch: hosted on an installed icebreaker, giving it +1 strength", () => {
  const game = makeGame({ corp: filler(10), runner: [['Gordian Blade', 1], ['The Personal Touch', 1], ...rFiller(8)] });
  const g = game.g;
  const t = driver(game).keepHands();
  t.creditsOut('corp').discardFirst();
  g.state.runner.credits = 10;
  forceIntoHand(g, 'Gordian Blade');
  forceIntoHand(g, 'The Personal Touch');
  t.pick('credit'); // rebuild the action menu so it reflects the freshly-forced hand
  t.label('Install Gordian Blade');
  const gbId = g.state.runner.rig.program[0];
  t.label('Install The Personal Touch');
  t.label('Gordian Blade'); // choose the installed icebreaker to host on
  const ptId = g.state.runner.rig.hardware.find(id => cardOf(g, id).title === 'The Personal Touch');
  assert.equal(inst(g, ptId).hostId, gbId);
  assert.equal(breakerStrength(g, gbId), cardOf(g, gbId).strength + 1);
}],

['Magnum Opus: [click]: gain 2 credits', () => {
  const game = makeGame({ corp: filler(10), runner: [['Magnum Opus', 1], ...rFiller(9)] });
  const g = game.g;
  const t = driver(game).keepHands();
  t.creditsOut('corp').discardFirst();
  g.state.runner.credits = 10;
  forceIntoHand(g, 'Magnum Opus');
  t.pick('credit'); // rebuild the action menu so it reflects the freshly-forced hand
  t.label('Install Magnum Opus');
  const before = g.state.runner.credits;
  const clicksBefore = g.state.runner.clicks;
  t.label('Gain 2 credits');
  assert.equal(g.state.runner.credits, before + 2);
  assert.equal(g.state.runner.clicks, clicksBefore - 1);
}],

['Pipeline: sentry breaker whose strength boost lasts for the remainder of the run, across multiple ice', () => {
  const game = makeGame({ corp: [['Hunter', 2], ...filler(8)], runner: [['Pipeline', 1], ...rFiller(9)] });
  const g = game.g;
  const t = driver(game).keepHands();
  t.label('Install Hunter').label('Protecting hq'); // innermost, 0cr
  t.label('Install Hunter').label('Protecting hq'); // outermost, 1cr
  t.creditsOut('corp').discardFirst();
  g.state.corp.credits = 20;
  g.state.runner.credits = 20;
  forceIntoHand(g, 'Pipeline');
  t.pick('credit'); // rebuild the action menu so it reflects the freshly-forced hand
  t.label('Install Pipeline');
  const pId = g.state.runner.rig.program[0];
  t.prefix('run:hq');
  t.prefix('rez'); // rez outer Hunter
  t.prefix('boost'); // str 1 -> 2
  t.prefix('boost'); // str 2 -> 3
  t.prefix('boost'); // str 3 -> 4, matches Hunter
  t.prefix('break'); // break the trace sub for 1cr
  t.pick('continue');
  assert.equal(breakerStrength(g, pId), 4); // run-duration boost persists into the next encounter
  t.pick('continue'); // jack-out prompt (2nd approach): continue the run
  t.prefix('rez'); // rez inner Hunter
  assert.ok(game.decision.options.some(o => o.id.startsWith('break:'))); // still str 4: no re-boost needed
  t.prefix('break');
  t.pick('continue');
  t.pick('continue'); // approach-server jack-out: continue
  assert.equal(lastEvent(game, 'run-end').data.successful, true); // both traces broken; tags never given
  assert.equal(g.state.runner.tags, 0);
}],

["Aesop’s Pawnshop: turn start, may trash another installed card for 3 credits", () => {
  const game = makeGame({ corp: filler(10), runner: [['Aesop’s Pawnshop', 1], ['Dyson Mem Chip', 1], ...rFiller(8)] });
  const g = game.g;
  const t = driver(game).keepHands();
  t.creditsOut('corp').discardFirst();
  g.state.runner.credits = 10;
  forceIntoHand(g, 'Aesop’s Pawnshop');
  forceIntoHand(g, 'Dyson Mem Chip');
  t.pick('credit'); // rebuild the action menu so it reflects the freshly-forced hand
  t.label('Install Aesop’s Pawnshop');
  t.label('Install Dyson Mem Chip');
  const dmcId = g.state.runner.rig.hardware.find(id => cardOf(g, id).title === 'Dyson Mem Chip');
  t.creditsOut('runner');
  t.creditsOut('corp').discardFirst(); // corp turn 2
  // runner turn 2 startOfTurn fires Aesop's Pawnshop's onTurnStart immediately
  const before = g.state.runner.credits;
  t.label('Dyson Mem Chip');
  assert.equal(inst(g, dmcId).zone, 'runner-discard');
  assert.equal(g.state.runner.credits, before + 3);
}],

['All-nighter: [click], trash: gain 2 clicks (net +1 click)', () => {
  const game = makeGame({ corp: filler(10), runner: [['All-nighter', 1], ...rFiller(9)] });
  const g = game.g;
  const t = driver(game).keepHands();
  t.creditsOut('corp').discardFirst();
  g.state.runner.credits = 10;
  forceIntoHand(g, 'All-nighter');
  t.pick('credit'); // rebuild the action menu so it reflects the freshly-forced hand
  t.label('Install All-nighter');
  const anId = g.state.runner.rig.resource[0];
  const clicksBefore = g.state.runner.clicks;
  t.label('Trash All-nighter: gain 2 clicks');
  assert.equal(inst(g, anId).zone, 'runner-discard');
  assert.equal(g.state.runner.clicks, clicksBefore - 1 + 2); // 1 click spent to use it, 2 gained
}],

['Sacrificial Construct: trashes itself to prevent a program or piece of hardware from being trashed', () => {
  const game = makeGame({ corp: [['Rototurret', 1], ...filler(9)], runner: [['Sacrificial Construct', 1], ['Magnum Opus', 1], ...rFiller(7)] });
  const g = game.g;
  const t = driver(game).keepHands();
  t.label('Install Rototurret').label('Protecting hq');
  t.creditsOut('corp').discardFirst();
  g.state.corp.credits = 20;
  g.state.runner.credits = 20;
  forceIntoHand(g, 'Sacrificial Construct');
  forceIntoHand(g, 'Magnum Opus');
  t.pick('credit'); // rebuild the action menu so it reflects the freshly-forced hand
  t.label('Install Sacrificial Construct');
  t.label('Install Magnum Opus');
  const moId = g.state.runner.rig.program.find(id => cardOf(g, id).title === 'Magnum Opus');
  const scId = g.state.runner.rig.resource.find(id => cardOf(g, id).title === 'Sacrificial Construct');
  t.prefix('run:hq');
  t.prefix('rez');
  t.pick('continue'); // no breaker installed; the subs fire
  t.pick(`t:${moId}`); // corp chooses Magnum Opus to trash via Rototurret's first sub
  t.pick('prevent'); // Sacrificial Construct trashes itself to save it
  assert.equal(inst(g, moId).zone, 'rig-program'); // saved
  assert.equal(inst(g, scId).zone, 'runner-discard'); // Sacrificial Construct paid the cost
  assert.equal(lastEvent(game, 'trash-prevented').data.saved, 'Magnum Opus');
}],

['Infiltration: gain 2 credits, or expose an unrezzed installed card', () => {
  const game = makeGame({ corp: [['Ice Wall', 1], ...filler(9)], runner: [['Infiltration', 1], ...rFiller(9)] });
  const g = game.g;
  const t = driver(game).keepHands();
  t.label('Install Ice Wall').label('Protecting hq');
  t.creditsOut('corp').discardFirst();
  forceIntoHand(g, 'Infiltration');
  t.pick('credit'); // rebuild the action menu so it reflects the freshly-forced hand
  const before = g.state.runner.credits;
  t.label('Play Infiltration');
  t.label('Expose 1 card');
  t.label('Ice Wall');
  assert.equal(lastEvent(game, 'exposed').data.title, 'Ice Wall');
  assert.equal(g.state.runner.credits, before); // no credits change via the expose branch (0cr play cost)
}],

['Dyson Mem Chip: +1 memory unit, +1 link', () => {
  const game = makeGame({ corp: filler(10), runner: [['Dyson Mem Chip', 1], ...rFiller(9)] });
  const g = game.g;
  const t = driver(game).keepHands();
  t.creditsOut('corp').discardFirst();
  g.state.runner.credits = 10;
  forceIntoHand(g, 'Dyson Mem Chip');
  t.pick('credit'); // rebuild the action menu so it reflects the freshly-forced hand
  t.label('Install Dyson Mem Chip');
  assert.equal(memoryLimit(g), 5); // base 4 + 1
  assert.equal(fx.linkBonus(g), 1);
}],

['Crypsis: AI breaker breaks any subroutine type; self-trashes with no virus counter to spend; blocked by Swordsman', () => {
  // Part 1: breaks an Ice Wall (barrier) sub, then trashes itself (no hosted virus counters)
  {
    const game = makeGame({ corp: [['Ice Wall', 1], ...filler(9)], runner: [['Crypsis', 1], ...rFiller(9)] });
    const g = game.g;
    const t = driver(game).keepHands();
    t.label('Install Ice Wall').label('Protecting hq');
    t.creditsOut('corp').discardFirst();
    g.state.corp.credits = 20;
    g.state.runner.credits = 20;
    forceIntoHand(g, 'Crypsis');
    t.pick('credit'); // rebuild the action menu so it reflects the freshly-forced hand
    t.label('Install Crypsis');
    const crId = g.state.runner.rig.program[0];
    t.prefix('run:hq');
    t.prefix('rez');
    t.prefix('boost'); // str 0 -> 1, matches Ice Wall
    t.prefix('break'); // 1cr: break the ETR sub
    t.pick('continue');
    t.pick('continue'); // approach-server jack-out: continue
    assert.equal(inst(g, crId).zone, 'runner-discard'); // no hosted virus counters to spend -> trashed
    assert.equal(lastEvent(game, 'run-end').data.successful, true);
  }
  // Part 2: a [click]-banked virus counter is spent instead of trashing Crypsis
  {
    const game = makeGame({ corp: [['Ice Wall', 1], ...filler(9)], runner: [['Crypsis', 1], ...rFiller(9)] });
    const g = game.g;
    const t = driver(game).keepHands();
    t.label('Install Ice Wall').label('Protecting hq');
    t.creditsOut('corp').discardFirst();
    g.state.corp.credits = 20;
    g.state.runner.credits = 20;
    forceIntoHand(g, 'Crypsis');
    t.pick('credit'); // rebuild the action menu so it reflects the freshly-forced hand
    t.label('Install Crypsis');
    const crId = g.state.runner.rig.program[0];
    t.label('Place 1 virus counter on Crypsis');
    assert.equal(inst(g, crId).counters.virus, 1);
    t.prefix('run:hq');
    t.prefix('rez');
    t.prefix('boost');
    t.prefix('break');
    t.pick('continue');
    t.pick('continue'); // approach-server jack-out: continue
    assert.equal(inst(g, crId).zone, 'rig-program'); // spent the virus counter instead of trashing itself
    assert.equal(inst(g, crId).counters.virus, 0);
  }
  // Part 3: Swordsman blocks Crypsis's AI breaker type entirely
  {
    const game = makeGame({ corp: [['Swordsman', 1], ...filler(9)], runner: [['Crypsis', 1], ...rFiller(9)] });
    const g = game.g;
    const t = driver(game).keepHands();
    t.label('Install Swordsman').label('Protecting hq');
    t.creditsOut('corp').discardFirst();
    g.state.corp.credits = 20;
    g.state.runner.credits = 20;
    forceIntoHand(g, 'Crypsis');
    t.pick('credit'); // rebuild the action menu so it reflects the freshly-forced hand
    t.label('Install Crypsis');
    t.prefix('run:hq');
    t.prefix('rez');
    assert.equal(game.decision.options.length, 1); // no boost/break options: blocked from breaking Swordsman
    assert.equal(game.decision.options[0].id, 'continue');
    t.pick('continue');
  }
}],

['Armitage Codebusting: loads 12cr; [click] takes 2cr; trashes itself when empty', () => {
  const game = makeGame({ corp: filler(10), runner: [['Armitage Codebusting', 1], ...rFiller(9)] });
  const g = game.g;
  const t = driver(game).keepHands();
  t.creditsOut('corp').discardFirst();
  g.state.runner.credits = 10;
  forceIntoHand(g, 'Armitage Codebusting');
  t.pick('credit'); // rebuild the action menu so it reflects the freshly-forced hand
  t.label('Install Armitage Codebusting');
  const acId = g.state.runner.rig.resource[0];
  assert.equal(inst(g, acId).counters.credit, 12);
  t.label('Take 2 credits from Armitage Codebusting');
  assert.equal(inst(g, acId).counters.credit, 10);
  inst(g, acId).counters.credit = 2; // fast-forward to the last take
  t.label('Take 2 credits from Armitage Codebusting');
  assert.equal(inst(g, acId).zone, 'runner-discard');
  assert.equal(lastEvent(game, 'card-trashed').data.title, 'Armitage Codebusting');
}],

['Underworld Contact: turn start, gains 1cr once combined link reaches 2 (paired with Dyson Mem Chip + Rabbit Hole)', () => {
  const game = makeGame({ corp: filler(10), runner: [['Underworld Contact', 1], ['Dyson Mem Chip', 1], ['Rabbit Hole', 1], ...rFiller(7)] });
  const g = game.g;
  const t = driver(game).keepHands();
  t.creditsOut('corp').discardFirst();
  g.state.runner.credits = 10;
  forceIntoHand(g, 'Underworld Contact');
  forceIntoHand(g, 'Dyson Mem Chip');
  forceIntoHand(g, 'Rabbit Hole');
  t.pick('credit'); // rebuild the action menu so it reflects the freshly-forced hand
  t.label('Install Underworld Contact');
  t.label('Install Dyson Mem Chip');
  t.label('Install Rabbit Hole'); // only 1 copy in this deck -> its search whiffs with no decision
  assert.equal(fx.linkBonus(g), 2); // Dyson +1, Rabbit Hole +1
  g.state.runner.credits = 5;
  t.creditsOut('corp').discardFirst(); // corp turn 2; runner turn 2 startOfTurn fires immediately after
  assert.equal(g.state.runner.credits, 6); // link (2) >= 2: Underworld Contact pays out
}],

];
