import assert from 'node:assert/strict';
import { makeGame, driver, lastEvent, db } from './helpers.js';
import * as fx from '../engine/effects.js';
import { inst, cardOf, moveCard, memoryLimit } from '../engine/state.js';
import { iceStrength, breakerStrength } from '../engine/run.js';

const filler = n => [['Hedge Fund', n]];
const rFiller = n => [['Sure Gamble', n]];
const reina = 'Reina Roja: Freedom Fighter';

// Note: makeGame's default runner identity is Gabriel Santiago: Consummate
// Professional (scripted in this batch): the first successful run on HQ each
// turn gains 2cr. Tests below that run HQ with the default identity account
// for that credit gain explicitly; tests that don't care about it use RD /
// Archives / a remote instead to keep assertions simple.

// Force `title` (wherever it currently sits) into its owner's hand, swapping
// out an existing hand card to keep hand size stable. Sanctioned direct-state
// setup (see tests/helpers.js docs / cards-b.test.js precedent).
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

// Force `title` to the top of its owner's deck (R&D / Stack), regardless of
// where it currently sits, for deterministic top-of-deck access tests.
function forceTopOfDeck(g, title) {
  const id = Object.values(g.insts).find(i => cardOf(g, i.id).title === title)?.id;
  if (id == null) throw new Error(`no ${title} in this game`);
  const side = cardOf(g, id).side;
  moveCard(g, id, `${side}-deck`, { position: 'top' });
  return id;
}

// Force `title` to be the sole card in the corp's HQ (hand), for
// deterministic single-card HQ access. Mirrors the TGTBT test precedent in
// cards-b.test.js.
function forceSoleHqCard(g, title) {
  const id = Object.values(g.insts).find(i => cardOf(g, i.id).title === title)?.id;
  if (id == null) throw new Error(`no ${title} in this game`);
  for (const other of [...g.state.corp.hand]) if (other !== id) moveCard(g, other, 'corp-deck');
  if (!g.state.corp.hand.includes(id)) moveCard(g, id, 'corp-hand');
  return id;
}

export default [

['Reina Roja: first piece of ice rezzed each turn costs 1cr more, second does not', () => {
  const game = makeGame({ runnerId: reina, corp: [['Ice Wall', 6], ['Hedge Fund', 4]], runner: rFiller(10) });
  const g = game.g;
  const t = driver(game).keepHands();
  t.label('Install Ice Wall').label('Protecting hq');
  t.label('Install Ice Wall').label('Protecting rd');
  t.creditsOut('corp').discardFirst();
  t.prefix('run:hq');
  let rezOpt = game.decision.options.find(o => o.id.startsWith('rez'));
  assert.match(rezOpt.label, /\(2cr\)/); // 1 printed + 1 Reina (first ice this turn)
  t.pick(rezOpt.id);
  t.pick('continue');
  t.prefix('run:rd');
  rezOpt = game.decision.options.find(o => o.id.startsWith('rez'));
  assert.match(rezOpt.label, /\(1cr\)/); // no bonus: not the first ice rezzed this turn
  t.pick(rezOpt.id);
  t.pick('continue');
}],

['Demolition Run: free trash on R&D access, even an agenda (not stolen)', () => {
  const game = makeGame({ corp: [['Priority Requisition', 1], ['Hedge Fund', 9]], runner: [['Demolition Run', 1], ...rFiller(9)] });
  const g = game.g;
  const t = driver(game).keepHands();
  t.creditsOut('corp').discardFirst();
  forceTopOfDeck(g, 'Priority Requisition');
  forceIntoHand(g, 'Demolition Run');
  const before = g.state.runner.credits;
  t.label('Play Demolition Run');
  t.label('Run R&D');
  t.label('Demolition Run'); // access ability offered
  assert.equal(lastEvent(game, 'card-trashed').data.title, 'Priority Requisition');
  assert.equal(g.state.runner.agendaPoints, 0); // trashed, not stolen
  assert.equal(g.state.runner.credits, before - 2); // just the play cost; trash was free
}],

['Retrieval Run: successful Archives run installs a program from the heap ignoring all costs', () => {
  const game = makeGame({ corp: filler(10), runner: [['Retrieval Run', 1], ['Morning Star', 1], ...rFiller(8)] });
  const g = game.g;
  const t = driver(game).keepHands();
  t.creditsOut('corp').discardFirst();
  const msId = Object.values(g.insts).find(i => cardOf(g, i.id).title === 'Morning Star').id;
  moveCard(g, msId, 'runner-discard'); // heap
  forceIntoHand(g, 'Retrieval Run');
  const before = g.state.runner.credits;
  t.label('Play Retrieval Run');
  t.label('Install 1 program from the heap');
  t.label('Morning Star');
  assert.equal(inst(g, msId).zone, 'rig-program');
  assert.equal(g.state.runner.credits, before - 3); // Retrieval Run's own cost only; install was free
}],

['Singularity: extra click cost; successful remote run trashes all cards in its root', () => {
  const game = makeGame({ corp: [['Adonis Campaign', 1], ...filler(9)], runner: [['Singularity', 1], ...rFiller(9)] });
  const g = game.g;
  const t = driver(game).keepHands();
  t.label('Install Adonis Campaign').pick('t:new');
  t.creditsOut('corp').discardFirst();
  forceIntoHand(g, 'Singularity');
  const clicksBefore = g.state.runner.clicks;
  t.label('Play Singularity');
  t.pick('r:remote1');
  t.pick('done'); // decline to rez Adonis Campaign
  t.label('Trash all cards installed in the root');
  assert.equal(g.state.corp.servers.remote1.content.length, 0);
  assert.equal(lastEvent(game, 'card-trashed').data.title, 'Adonis Campaign');
  assert.equal(g.state.runner.clicks, clicksBefore - 2); // play click + extra click; the run itself costs no extra click
}],

['Stimhack: hosted credits pay an access trash cost; unpreventable core damage at run end', () => {
  const game = makeGame({ corp: [['Adonis Campaign', 1], ...filler(9)], runner: [['Stimhack', 1], ...rFiller(9)] });
  const g = game.g;
  const t = driver(game).keepHands();
  t.creditsOut('corp').discardFirst();
  forceSoleHqCard(g, 'Adonis Campaign');
  forceIntoHand(g, 'Stimhack');
  g.state.runner.credits = 0;
  const brainBefore = g.state.runner.brainDamage;
  t.label('Play Stimhack');
  t.pick('r:hq');
  t.pick('trash'); // trash Adonis Campaign (3cr), paid entirely from Stimhack's hosted pool
  assert.equal(lastEvent(game, 'card-trashed').data.title, 'Adonis Campaign');
  // real credits: 0 + 2 (Gabriel, first successful HQ run) - 0 (trash paid from hosted pool)
  assert.equal(g.state.runner.credits, 2);
  assert.equal(g.state.runner.brainDamage, brainBefore + 1); // unpreventable core damage at run end
}],

['Cyberfeeder: recurring credit pays for an icebreaker break cost', () => {
  const game = makeGame({ corp: [['Ice Wall', 1], ...filler(9)], runner: [['Cyberfeeder', 1], ['Morning Star', 1], ...rFiller(8)] });
  const g = game.g;
  const t = driver(game).keepHands();
  t.label('Install Ice Wall').label('Protecting hq');
  t.creditsOut('corp').discardFirst();
  g.state.runner.credits = 20;
  forceIntoHand(g, 'Cyberfeeder');
  t.label('Install Cyberfeeder');
  const cfId = g.state.runner.rig.hardware[0];
  forceIntoHand(g, 'Morning Star');
  t.pick('credit'); // rebuild the action menu so it reflects the freshly-forced hand
  t.label('Install Morning Star');
  inst(g, cfId).counters.recurring = 1; // simulate the refill that would occur at this turn's start had it been installed already (sanctioned direct-state setup)
  g.state.runner.credits = 0;
  t.prefix('run:hq');
  t.prefix('rez');
  t.prefix('break');
  t.pick('continue');
  assert.equal(inst(g, cfId).counters.recurring, 0);
  const spends = game.log.filter(e => e.type === 'pool-credits-spent');
  assert.equal(spends[spends.length - 1].data.from, 'Cyberfeeder');
  assert.equal(lastEvent(game, 'run-end').data.successful, true);
}],

['Spinal Modem: +1mu; a successful trace during a run deals 1 core damage', () => {
  const game = makeGame({ corp: [['Caduceus', 1], ...filler(9)], runner: [['Spinal Modem', 1], ...rFiller(9)] });
  const g = game.g;
  const t = driver(game).keepHands();
  t.label('Install Caduceus').label('Protecting hq');
  t.creditsOut('corp').discardFirst();
  g.state.runner.credits = 20;
  t.label('Install Spinal Modem');
  assert.equal(memoryLimit(g), 5); // base 4 + 1
  const brainBefore = g.state.runner.brainDamage;
  t.prefix('run:hq');
  t.prefix('rez');
  t.pick('continue'); // no breaker
  t.num(0); t.num(0); // trace 3 (Caduceus sub 1) vs link 0 -> succeeds
  t.num(0); t.num(0); // trace 2 (Caduceus sub 2) vs link 0 -> succeeds, ends the run
  assert.equal(g.state.runner.brainDamage, brainBefore + 2); // 1 core damage per successful trace
  assert.equal(lastEvent(game, 'run-end').data.successful, false); // ended by Caduceus's 2nd sub
}],

['Darwin: strength equals hosted virus counters; turn start may pay 1cr for a counter', () => {
  const game = makeGame({ corp: filler(10), runner: [['Darwin', 1], ...rFiller(9)] });
  const g = game.g;
  const t = driver(game).keepHands();
  t.creditsOut('corp').discardFirst();
  g.state.runner.credits = 20;
  t.label('Install Darwin');
  const dId = g.state.runner.rig.program[0];
  assert.equal(breakerStrength(g, dId), 0);
  t.creditsOut('runner').discardFirst();
  t.creditsOut('corp').discardFirst(); // corp turn 2
  // runner turn 2 startOfTurn fires Darwin's onTurnStart immediately
  t.pick('pay');
  assert.equal(inst(g, dId).counters.virus, 1);
  assert.equal(breakerStrength(g, dId), 1);
}],

['Datasucker: successful run on a central adds a virus counter; a remote run does not', () => {
  const game = makeGame({ corp: [['Adonis Campaign', 1], ...filler(9)], runner: [['Datasucker', 1], ...rFiller(9)] });
  const g = game.g;
  const t = driver(game).keepHands();
  t.label('Install Adonis Campaign').pick('t:new');
  t.creditsOut('corp').discardFirst();
  g.state.runner.credits = 20;
  t.label('Install Datasucker');
  const dsId = g.state.runner.rig.program[0];
  t.prefix('run:rd');
  assert.equal(inst(g, dsId).counters.virus, 1);
  t.prefix('run:remote1');
  t.pick('done'); // decline to rez Adonis Campaign
  assert.equal(inst(g, dsId).counters.virus, 1); // unchanged: remote isn't a central server
  t.pick('leave'); // decline the access-trash prompt
}],

['Force of Nature: boosts to match strength, then breaks up to 2 code gate subs for 2cr', () => {
  const game = makeGame({ corp: [['Enigma', 1], ...filler(9)], runner: [['Force of Nature', 1], ...rFiller(9)] });
  const g = game.g;
  const t = driver(game).keepHands();
  t.label('Install Enigma').label('Protecting hq');
  t.creditsOut('corp').discardFirst();
  g.state.corp.credits = 20;
  g.state.runner.credits = 20;
  t.label('Install Force of Nature');
  const clicksBefore = g.state.runner.clicks;
  t.prefix('run:hq');
  t.prefix('rez');
  t.prefix('boost'); // +1 str: 1 -> 2, matches Enigma's strength
  t.prefix('break'); // break up to 2 subs for 2cr
  t.prefix('sub'); // choose which sub to break first
  t.pick('continue');
  assert.equal(lastEvent(game, 'run-end').data.successful, true); // both subs broken: click-loss and ETR never fire
  assert.equal(g.state.runner.clicks, clicksBefore - 1); // only the run click; no click lost
}],

['Imp: 2 virus counters on install; access ability trashes for free, once per turn', () => {
  const game = makeGame({ corp: [['Adonis Campaign', 2], ...filler(8)], runner: [['Imp', 1], ...rFiller(9)] });
  const g = game.g;
  const t = driver(game).keepHands();
  t.label('Install Adonis Campaign').pick('t:new');
  t.creditsOut('corp').discardFirst();
  g.state.runner.credits = 10;
  t.label('Install Imp');
  const impId = g.state.runner.rig.program[0];
  assert.equal(inst(g, impId).counters.virus, 2);
  const acIds = Object.values(g.insts).filter(i => cardOf(g, i.id).title === 'Adonis Campaign').map(i => i.id);
  const installedAc = g.state.corp.servers.remote1.content[0];
  const secondAc = acIds.find(id => id !== installedAc);
  // force the second (uninstalled) Adonis Campaign to be the sole HQ card
  for (const other of [...g.state.corp.hand]) if (other !== secondAc) moveCard(g, other, 'corp-deck');
  if (!g.state.corp.hand.includes(secondAc)) moveCard(g, secondAc, 'corp-hand');
  t.prefix('run:remote1');
  t.pick('done'); // decline to rez the installed Adonis Campaign
  t.label('Imp:'); // "Imp: spend a hosted virus counter to trash the accessed card"
  assert.equal(inst(g, impId).counters.virus, 1);
  assert.equal(lastEvent(game, 'card-trashed').data.title, 'Adonis Campaign');
  t.prefix('run:hq');
  // once-per-turn: Imp's ability must not be offered again this turn
  assert.ok(!game.decision.options.some(o => o.label.includes('Imp:')));
  t.pick('leave'); // decline the normal paid trash
  assert.equal(inst(g, impId).counters.virus, 1); // unchanged
}],

['Hemorrhage: successful runs add virus counters; click+2 counters makes the Corp trash from HQ', () => {
  const game = makeGame({ corp: [['Hedge Fund', 10]], runner: [['Hemorrhage', 1], ...rFiller(9)] });
  const g = game.g;
  const t = driver(game).keepHands();
  t.creditsOut('corp').discardFirst();
  g.state.runner.credits = 10;
  t.label('Install Hemorrhage');
  const hId = g.state.runner.rig.program[0];
  t.prefix('run:rd');
  assert.equal(inst(g, hId).counters.virus, 1);
  t.prefix('run:archives');
  assert.equal(inst(g, hId).counters.virus, 2);
  const clicksBefore = g.state.runner.clicks;
  t.label('Spend 2 hosted virus counters');
  t.label('Hedge Fund');
  assert.equal(inst(g, hId).counters.virus, 0);
  assert.equal(lastEvent(game, 'card-trashed').data.title, 'Hedge Fund');
  assert.equal(g.state.runner.clicks, clicksBefore - 1);
}],

['Morning Star: breaks any number of barrier subs for 1cr', () => {
  const game = makeGame({ corp: [['Ice Wall', 1], ...filler(9)], runner: [['Morning Star', 1], ...rFiller(9)] });
  const g = game.g;
  const t = driver(game).keepHands();
  t.label('Install Ice Wall').label('Protecting hq');
  t.creditsOut('corp').discardFirst();
  g.state.runner.credits = 20;
  forceIntoHand(g, 'Morning Star');
  t.pick('credit'); // rebuild the action menu so it reflects the freshly-forced hand
  t.label('Install Morning Star');
  t.prefix('run:hq');
  t.prefix('rez');
  const before = g.state.runner.credits;
  t.prefix('break');
  t.pick('continue');
  // -1 for the break, +2 Gabriel (first successful HQ run this turn)
  assert.equal(g.state.runner.credits, before - 1 + 2);
  assert.equal(lastEvent(game, 'run-end').data.successful, true); // ETR broken
}],

['Ice Carver: -1 ice strength only while it is being encountered', () => {
  const game = makeGame({ corp: [['Ice Wall', 1], ...filler(9)], runner: [['Ice Carver', 1], ...rFiller(9)] });
  const g = game.g;
  const t = driver(game).keepHands();
  t.label('Install Ice Wall').label('Protecting hq');
  t.creditsOut('corp').discardFirst();
  g.state.runner.credits = 20;
  t.label('Install Ice Carver');
  const iwId = g.state.corp.servers.hq.ice[0];
  assert.equal(iceStrength(g, iwId), 1); // no active encounter: no penalty
  t.prefix('run:hq');
  t.prefix('rez');
  assert.match(game.decision.prompt, /str 0/); // 1 - 1 during the encounter
  t.pick('continue');
}],

['Liberated Account: loads 16cr; [click] takes 4cr; trashes itself when empty', () => {
  const game = makeGame({ corp: filler(10), runner: [['Liberated Account', 1], ...rFiller(9)] });
  const g = game.g;
  const t = driver(game).keepHands();
  t.creditsOut('corp').discardFirst();
  g.state.runner.credits = 10;
  forceIntoHand(g, 'Liberated Account');
  t.pick('credit'); // rebuild the action menu so it reflects the freshly-forced hand
  t.label('Install Liberated Account');
  const laId = g.state.runner.rig.resource[0];
  assert.equal(inst(g, laId).counters.credit, 16);
  t.label('Take 4 credits');
  assert.equal(inst(g, laId).counters.credit, 12);
  inst(g, laId).counters.credit = 4; // fast-forward to the last take
  t.label('Take 4 credits');
  assert.equal(inst(g, laId).zone, 'runner-discard');
  assert.equal(lastEvent(game, 'card-trashed').data.title, 'Liberated Account');
}],

['Scrubber: recurring credits pay a trash cost alongside real credits', () => {
  const game = makeGame({ corp: [['Adonis Campaign', 1], ...filler(9)], runner: [['Scrubber', 1], ...rFiller(9)] });
  const g = game.g;
  const t = driver(game).keepHands();
  t.creditsOut('corp').discardFirst();
  g.state.runner.credits = 10;
  t.label('Install Scrubber');
  const scId = g.state.runner.rig.resource[0];
  inst(g, scId).counters.recurring = 2; // simulate refill (see Cyberfeeder test note)
  forceSoleHqCard(g, 'Adonis Campaign');
  g.state.runner.credits = 1; // 1 real + 2 pooled = exactly the 3cr trash cost
  t.prefix('run:hq');
  t.pick('trash');
  assert.equal(inst(g, scId).counters.recurring, 0);
  // 1 real - 1 real (rest of the 3cr trash cost, after 2cr from the pool) + 2 (Gabriel, first successful HQ run)
  assert.equal(g.state.runner.credits, 2);
  const spends = game.log.filter(e => e.type === 'pool-credits-spent');
  assert.equal(spends[spends.length - 1].data.from, 'Scrubber');
  assert.equal(spends[spends.length - 1].data.used, 2);
  assert.equal(lastEvent(game, 'card-trashed').data.title, 'Adonis Campaign');
}],

['Xanadu: increases the rez cost of every piece of ice by 1cr', () => {
  const game = makeGame({ corp: [['Ice Wall', 1], ...filler(9)], runner: [['Xanadu', 1], ...rFiller(9)] });
  const g = game.g;
  const t = driver(game).keepHands();
  t.label('Install Ice Wall').label('Protecting hq');
  t.creditsOut('corp').discardFirst();
  g.state.runner.credits = 10;
  t.label('Install Xanadu');
  t.prefix('run:hq');
  const rezOpt = game.decision.options.find(o => o.id.startsWith('rez'));
  assert.match(rezOpt.label, /\(2cr\)/); // printed 1cr + Xanadu's +1
  t.pick(rezOpt.id);
  t.pick('continue');
}],

['Gabriel Santiago: gains 2cr on the first successful HQ run each turn only', () => {
  const game = makeGame({ corp: filler(10), runner: rFiller(10) }); // default identity
  const g = game.g;
  const t = driver(game).keepHands();
  t.creditsOut('corp').discardFirst();
  const before = g.state.runner.credits;
  t.prefix('run:hq');
  assert.equal(g.state.runner.credits, before + 2);
  t.prefix('run:hq'); // second HQ run this turn: no further bonus
  assert.equal(g.state.runner.credits, before + 2);
}],

['Emergency Shutdown: only playable after a successful HQ run this turn; derezzes 1 ice', () => {
  const game = makeGame({ corp: [['Ice Wall', 1], ...filler(9)], runner: [['Emergency Shutdown', 1], ['Morning Star', 1], ...rFiller(8)] });
  const g = game.g;
  const t = driver(game).keepHands();
  t.label('Install Ice Wall').label('Protecting hq');
  t.creditsOut('corp').discardFirst();
  g.state.corp.credits = 20;
  g.state.runner.credits = 20;
  forceIntoHand(g, 'Morning Star');
  forceIntoHand(g, 'Emergency Shutdown');
  t.pick('credit'); // rebuild the action menu so it reflects the freshly-forced hand
  assert.ok(!game.decision.options.some(o => o.label.includes('Play Emergency Shutdown'))); // canPlay gates it, even though it's in hand
  t.label('Install Morning Star');
  t.prefix('run:hq');
  t.prefix('rez');
  t.prefix('break'); // Morning Star breaks Ice Wall's ETR so the run succeeds
  t.pick('continue');
  assert.equal(lastEvent(game, 'run-end').data.successful, true);
  assert.ok(game.decision.options.some(o => o.label.includes('Play Emergency Shutdown')));
  const iceId = g.state.corp.servers.hq.ice[0];
  assert.equal(inst(g, iceId).rezzed, true);
  t.label('Play Emergency Shutdown');
  t.label('Ice Wall');
  assert.equal(inst(g, iceId).rezzed, false);
  assert.equal(lastEvent(game, 'derezzed').data.title, 'Ice Wall');
}],

['Forged Activation Orders: Corp rezzes the chosen ice when able', () => {
  const game = makeGame({ corp: [['Ice Wall', 1], ...filler(9)], runner: [['Forged Activation Orders', 1], ...rFiller(9)] });
  const g = game.g;
  const t = driver(game).keepHands();
  t.label('Install Ice Wall').label('Protecting hq');
  t.creditsOut('corp').discardFirst();
  g.state.corp.credits = 10;
  forceIntoHand(g, 'Forged Activation Orders');
  const iceId = g.state.corp.servers.hq.ice[0];
  t.label('Play Forged Activation Orders');
  t.label('Ice Wall');
  t.label('Rez it');
  assert.equal(inst(g, iceId).rezzed, true);
}],

['Forged Activation Orders: Corp trashes the chosen ice when unable to afford the rez', () => {
  const game = makeGame({ corp: [['Ice Wall', 1], ...filler(9)], runner: [['Forged Activation Orders', 1], ...rFiller(9)] });
  const g = game.g;
  const t = driver(game).keepHands();
  t.label('Install Ice Wall').label('Protecting hq');
  t.creditsOut('corp').discardFirst();
  g.state.corp.credits = 0;
  forceIntoHand(g, 'Forged Activation Orders');
  t.label('Play Forged Activation Orders');
  t.label('Ice Wall');
  assert.equal(game.decision.options.length, 1); // only "Trash it": can't afford to rez
  t.pick('trash');
  assert.equal(lastEvent(game, 'card-trashed').data.title, 'Ice Wall');
}],

['Inside Job: bypasses the first (and only) piece of ice encountered', () => {
  const game = makeGame({ corp: [['Ice Wall', 1], ...filler(9)], runner: [['Inside Job', 1], ...rFiller(9)] });
  const g = game.g;
  const t = driver(game).keepHands();
  t.label('Install Ice Wall').label('Protecting hq');
  t.creditsOut('corp').discardFirst();
  g.state.corp.credits = 20;
  forceIntoHand(g, 'Inside Job');
  t.label('Play Inside Job');
  t.pick('r:hq');
  t.prefix('rez');
  assert.equal(lastEvent(game, 'ice-bypassed').data.title, 'Ice Wall');
  assert.equal(lastEvent(game, 'run-end').data.successful, true);
}],

['Special Order: tutors an icebreaker to the grip and shuffles the stack', () => {
  const game = makeGame({ corp: filler(10), runner: [['Special Order', 1], ['Morning Star', 1], ...rFiller(8)] });
  const g = game.g;
  const t = driver(game).keepHands();
  t.creditsOut('corp').discardFirst();
  const msId = Object.values(g.insts).find(i => cardOf(g, i.id).title === 'Morning Star').id;
  moveCard(g, msId, 'runner-deck');
  forceIntoHand(g, 'Special Order');
  t.label('Play Special Order');
  t.label('Morning Star');
  assert.equal(inst(g, msId).zone, 'runner-hand');
  assert.equal(lastEvent(game, 'card-revealed').data.title, 'Morning Star');
  assert.equal(lastEvent(game, 'deck-shuffled').data.who, 'runner');
}],

["Doppelgänger: +1mu; once per turn, a successful run's end lets you run again", () => {
  const game = makeGame({ corp: filler(10), runner: [['Doppelgänger', 1], ...rFiller(9)] });
  const g = game.g;
  const t = driver(game).keepHands();
  t.creditsOut('corp').discardFirst();
  g.state.runner.credits = 10;
  t.label('Install Doppelgänger');
  assert.equal(memoryLimit(g), 5); // base 4 + 1
  const before = g.state.runner.credits;
  t.prefix('run:rd');
  t.label('Run hq'); // Doppelgänger's follow-up run choice
  const successfulServers = game.log.filter(e => e.type === 'run-successful').map(e => e.data.server);
  assert.deepEqual(successfulServers, ['rd', 'hq']);
  assert.equal(g.state.runner.credits, before + 2); // Gabriel: the follow-up run was on HQ
}],

['HQ Interface: breaching HQ accesses 1 additional card', () => {
  const game = makeGame({ corp: [['Hedge Fund', 10]], runner: [['HQ Interface', 1], ...rFiller(9)] });
  const g = game.g;
  const t = driver(game).keepHands();
  t.creditsOut('corp').discardFirst();
  g.state.runner.credits = 10;
  t.label('Install HQ Interface');
  t.prefix('run:hq');
  assert.equal(lastEvent(game, 'access-count').data.n, 2); // 1 + 1 bonus
}],

['Aurora: breaks 1 barrier sub for 2cr', () => {
  const game = makeGame({ corp: [['Ice Wall', 1], ...filler(9)], runner: [['Aurora', 1], ...rFiller(9)] });
  const g = game.g;
  const t = driver(game).keepHands();
  t.label('Install Ice Wall').label('Protecting hq');
  t.creditsOut('corp').discardFirst();
  g.state.runner.credits = 20;
  t.label('Install Aurora');
  t.prefix('run:hq');
  t.prefix('rez');
  t.prefix('break');
  t.pick('continue');
  assert.equal(lastEvent(game, 'run-end').data.successful, true);
}],

['Peacock: breaks a code gate sub for 2cr', () => {
  const game = makeGame({ corp: [['Enigma', 1], ...filler(9)], runner: [['Peacock', 1], ...rFiller(9)] });
  const g = game.g;
  const t = driver(game).keepHands();
  t.label('Install Enigma').label('Protecting hq');
  t.creditsOut('corp').discardFirst();
  g.state.corp.credits = 20;
  g.state.runner.credits = 20;
  t.label('Install Peacock');
  t.prefix('run:hq');
  t.prefix('rez');
  const before = g.state.runner.credits;
  t.prefix('break');
  if (game.decision.options.some(o => o.id.startsWith('sub:'))) {
    t.pick(game.decision.options.find(o => o.id.startsWith('sub:')).id);
  }
  assert.equal(g.state.runner.credits, before - 2);
  t.pick('continue');
}],

['Faerie: breaks 1 sentry sub for free, then trashes itself for having been used', () => {
  const game = makeGame({ corp: [['Hunter', 1], ...filler(9)], runner: [['Faerie', 1], ...rFiller(9)] });
  const g = game.g;
  const t = driver(game).keepHands();
  t.label('Install Hunter').label('Protecting hq');
  t.creditsOut('corp').discardFirst();
  g.state.corp.credits = 20;
  g.state.runner.credits = 20;
  t.label('Install Faerie');
  const faerieId = g.state.runner.rig.program[0];
  t.prefix('run:hq');
  t.prefix('rez');
  t.prefix('boost'); // str 2 -> 3
  t.prefix('boost'); // str 3 -> 4, matches Hunter
  t.prefix('break'); // free
  t.pick('continue');
  assert.equal(inst(g, faerieId).zone, 'runner-discard');
  assert.equal(lastEvent(game, 'card-trashed').data.title, 'Faerie');
  assert.equal(lastEvent(game, 'run-end').data.successful, true);
}],

['Femme Fatale: bypasses the chosen ice by paying 1cr per subroutine', () => {
  const game = makeGame({ corp: [['Ice Wall', 1], ...filler(9)], runner: [['Femme Fatale', 1], ...rFiller(9)] });
  const g = game.g;
  const t = driver(game).keepHands();
  t.label('Install Ice Wall').label('Protecting hq');
  t.creditsOut('corp').discardFirst();
  g.state.corp.credits = 20;
  g.state.runner.credits = 20;
  forceIntoHand(g, 'Femme Fatale');
  t.pick('credit'); // rebuild the action menu so it reflects the freshly-forced hand
  t.label('Install Femme Fatale');
  t.label('Ice Wall'); // choose the installed ice to target
  t.prefix('run:hq');
  t.prefix('rez');
  t.pick('bypass'); // 1cr per sub; Ice Wall has 1
  assert.equal(lastEvent(game, 'ice-bypassed').data.title, 'Ice Wall');
  assert.equal(lastEvent(game, 'run-end').data.successful, true);
}],

['Pheromones: a successful run on HQ adds a virus counter (spending is a documented engine gap)', () => {
  const game = makeGame({ corp: filler(10), runner: [['Pheromones', 1], ...rFiller(9)] });
  const g = game.g;
  const t = driver(game).keepHands();
  t.creditsOut('corp').discardFirst();
  g.state.runner.credits = 10;
  t.label('Install Pheromones');
  const phId = g.state.runner.rig.program[0];
  assert.equal(inst(g, phId).counters.virus ?? 0, 0);
  t.prefix('run:hq');
  assert.equal(inst(g, phId).counters.virus, 1);
}],

['Sneakdoor Beta: a successful Archives run redirects to HQ (Gabriel triggers)', () => {
  const game = makeGame({ corp: [['Hedge Fund', 10]], runner: [['Sneakdoor Beta', 1], ...rFiller(9)] });
  const g = game.g;
  const t = driver(game).keepHands();
  t.creditsOut('corp').discardFirst();
  g.state.runner.credits = 10;
  t.label('Install Sneakdoor Beta');
  const before = g.state.runner.credits;
  t.label('Run Archives');
  assert.equal(lastEvent(game, 'server-changed').data.to, 'hq');
  assert.equal(g.state.runner.credits, before + 2); // Gabriel: the redirected run counted as HQ
}],

['Bank Job: loads 8cr; a successful remote run may take hosted credits instead of breaching; self-trashes when empty', () => {
  const game = makeGame({ corp: [['Adonis Campaign', 1], ...filler(9)], runner: [['Bank Job', 1], ...rFiller(9)] });
  const g = game.g;
  const t = driver(game).keepHands();
  t.label('Install Adonis Campaign').pick('t:new');
  t.creditsOut('corp').discardFirst();
  g.state.runner.credits = 10;
  t.label('Install Bank Job');
  const bjId = g.state.runner.rig.resource[0];
  assert.equal(inst(g, bjId).counters.credit, 8);
  const before = g.state.runner.credits;
  t.prefix('run:remote1');
  t.pick('done'); // decline to rez Adonis Campaign
  t.pick('yes'); // use Bank Job instead of breaching
  t.num(5);
  assert.equal(g.state.runner.credits, before + 5);
  assert.equal(inst(g, bjId).counters.credit, 3);
  t.prefix('run:remote1');
  t.pick('done');
  t.pick('yes');
  t.num(3); // take the remainder -> empties and self-trashes
  assert.equal(inst(g, bjId).zone, 'runner-discard');
  assert.equal(lastEvent(game, 'card-trashed').data.title, 'Bank Job');
}],

['Crash Space: recurring credits pay the remove-tag action; trashing it prevents meat damage', () => {
  const game = makeGame({ corp: filler(10), runner: [['Crash Space', 1], ...rFiller(9)] });
  const g = game.g;
  const t = driver(game).keepHands();
  t.creditsOut('corp').discardFirst();
  g.state.runner.credits = 10;
  t.label('Install Crash Space');
  const csId = g.state.runner.rig.resource[0];
  inst(g, csId).counters.recurring = 2; // simulate refill (see Cyberfeeder test note)
  g.state.runner.tags = 1;
  t.pick('credit'); // rebuild the action menu now that the Runner is tagged (Closed Accounts precedent, cards-b.test.js)
  t.pick('remove-tag');
  assert.equal(g.state.runner.tags, 0);
  assert.equal(inst(g, csId).counters.recurring, 0);
  // Crash Space is still installed; exercise its damage-prevention side too
  const handBefore = g.state.runner.hand.length;
  const gen = fx.damage(g, 'meat', 2, 'test');
  gen.next();
  let r = gen.next('prevent');
  while (!r.done) r = gen.next();
  assert.equal(g.state.runner.hand.length, handBefore); // fully prevented (up to 3)
  assert.equal(inst(g, csId).zone, 'runner-discard');
  assert.equal(lastEvent(game, 'damage-prevented').data.by, 'Crash Space');
}],

["Fall Guy: prevents another installed resource from being trashed by trashing itself", () => {
  const game = makeGame({ corp: filler(10), runner: [['Fall Guy', 1], ['Mr. Li', 1], ...rFiller(8)] });
  const g = game.g;
  const t = driver(game).keepHands();
  t.creditsOut('corp').discardFirst();
  g.state.runner.credits = 10;
  forceIntoHand(g, 'Fall Guy');
  t.label('Install Fall Guy');
  const fgId = g.state.runner.rig.resource.find(id => cardOf(g, id).title === 'Fall Guy');
  forceIntoHand(g, 'Mr. Li');
  t.pick('credit'); // rebuild the action menu so it reflects the freshly-forced hand
  t.label('Install Mr. Li');
  const mrLiId = g.state.runner.rig.resource.find(id => cardOf(g, id).title === 'Mr. Li');
  g.state.runner.tags = 1; // enables the Corp's tag-punishment trash action
  t.creditsOut('runner').discardFirst();
  t.pick('trash-resource');
  t.pick(`${mrLiId}`);
  t.pick('prevent');
  assert.equal(inst(g, mrLiId).zone, 'rig-resource'); // saved
  assert.equal(inst(g, fgId).zone, 'runner-discard'); // Fall Guy paid the cost
  assert.equal(lastEvent(game, 'trash-prevented').data.saved, 'Mr. Li');
}],

['Fall Guy: trash action gains 2cr, usable during the action window', () => {
  const game = makeGame({ corp: filler(10), runner: [['Fall Guy', 1], ...rFiller(9)] });
  const g = game.g;
  const t = driver(game).keepHands();
  t.creditsOut('corp').discardFirst();
  g.state.runner.credits = 10;
  t.label('Install Fall Guy');
  const fgId = g.state.runner.rig.resource[0];
  const before = g.state.runner.credits;
  t.label('Trash Fall Guy');
  assert.equal(g.state.runner.credits, before + 2);
  assert.equal(inst(g, fgId).zone, 'runner-discard');
}],

['Mr. Li: draws 2 cards, then puts 1 of them on the bottom of the stack', () => {
  const game = makeGame({ corp: filler(10), runner: [['Mr. Li', 1], ...rFiller(9)] });
  const g = game.g;
  const t = driver(game).keepHands();
  t.creditsOut('corp').discardFirst();
  g.state.runner.credits = 10;
  t.label('Install Mr. Li');
  const topTwo = g.state.runner.deck.slice(0, 2);
  const handBefore = g.state.runner.hand.length;
  t.label('Draw 2 cards');
  t.pick(`b:${topTwo[0]}`);
  assert.equal(g.state.runner.hand.length, handBefore + 1); // +2 drawn, -1 to bottom
  assert.equal(g.state.runner.deck[g.state.runner.deck.length - 1], topTwo[0]);
}],

];
