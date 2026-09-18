// Genesis Cycle Wave A (cards/waves-genesis-a.js). Faithful to printed text;
// deviations noted in docs/CARD_COVERAGE.md.
import assert from 'node:assert/strict';
import { makeGame, driver } from './helpers.js';
import * as fx from '../engine/effects.js';
import { inst, cardOf, moveCard } from '../engine/state.js';

// Force `title` (wherever it currently sits) into its owner's hand, swapping
// out an existing hand card to keep hand size stable. Mirrors the
// cards-c.test.js precedent. Used throughout below since these test decks
// use single copies of their target card amid filler, which the initial
// 5-card draw is not guaranteed to include.
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

// Like driver.discardFirst(), but never discards a card titled `keepTitle`
// (used for cards that must survive a discard phase while still sitting in
// hand, e.g. an operation not yet played) — the plain "always pick the first
// option" discard can otherwise pick exactly that card if it happens to have
// landed at the front of the hand array.
function discardKeeping(t, g, keepTitle) {
  while (t.game.decision?.discard) {
    const opts = t.d.options;
    const pick = opts.find(o => cardOf(g, Number(o.id.split(':')[1])).title !== keepTitle) ?? opts[0];
    t.pick(pick.id);
  }
  return t;
}

const hb = 'Haas-Bioroid: Stronger Together';
const wbbi = 'Weyland Consortium: Because We Built It';
const nbnTwiy = 'NBN: The World is Yours';
const whizzard = 'Whizzard: Master Gamer';
const andromeda = 'Andromeda: Dispossessed Ristie';

export default [

['Mandatory Upgrades: scored, corp gets 1 additional click every turn', () => {
  const game = makeGame({ corp: [['Mandatory Upgrades', 1], ...filler(9)], runner: rFiller(10) });
  const g = game.g;
  const t = driver(game).keepHands();
  forceIntoHand(g, 'Mandatory Upgrades');
  t.label('Install Mandatory Upgrades').pick('t:new');
  const id = g.state.corp.servers.remote1.content[0];
  t.creditsOut('corp').discardFirst();
  inst(g, id).advancement = 6;
  t.creditsOut('runner');
  t.label('Score Mandatory Upgrades');
  assert.equal(g.state.corp.agendaPoints, 2);
  // corp turn 3 starts with 4 clicks (3 printed + 1 Mandatory Upgrades)
  t.creditsOut('corp').discardFirst();
  t.creditsOut('runner');
  assert.equal(g.state.corp.clicks, 4);
}],

['Restructured Datapool: scored, [click] traces 2, success gives a tag', () => {
  const game = makeGame({ corp: [['Restructured Datapool', 1], ...filler(9)], runner: rFiller(10) });
  const g = game.g;
  const t = driver(game).keepHands();
  forceIntoHand(g, 'Restructured Datapool');
  t.label('Install Restructured Datapool').pick('t:new');
  const id = g.state.corp.servers.remote1.content[0];
  t.creditsOut('corp').discardFirst();
  inst(g, id).advancement = 5;
  t.creditsOut('runner');
  t.label('Score Restructured Datapool');
  const tagsBefore = g.state.runner.tags;
  t.label('Trace 2');
  t.num(0); t.num(0); // base 2 vs 0 link succeeds regardless
  assert.equal(g.state.runner.tags, tagsBefore + 1);
}],

['Big Brother: only playable while tagged; gives 2 tags', () => {
  const game = makeGame({ corp: [['Big Brother', 1], ...filler(9)], runner: rFiller(10) });
  const g = game.g;
  const t = driver(game).keepHands();
  forceIntoHand(g, 'Big Brother');
  // corp turn 1 action menu: not tagged yet, so Big Brother isn't offered
  assert.ok(!game.decision.options.some(o => o.label.startsWith('Play Big Brother')));
  t.creditsOut('corp'); discardKeeping(t, g, 'Big Brother');
  g.state.runner.tags = 1; // set before corp turn 2's action menu is generated
  t.creditsOut('runner');
  t.label('Play Big Brother');
  assert.equal(g.state.runner.tags, 3);
}],

['Freelancer: only playable while tagged; trashes up to 2 resources', () => {
  // Two plain non-unique resources with no trash-prevention hooks of their
  // own (Kati Jones is unique, Fall Guy prevents another resource's trash —
  // both would complicate this test).
  const game = makeGame({ corp: [['Freelancer', 1], ...filler(9)], runner: [['Crash Space', 1], ['Bank Job', 1], ...rFiller(8)] });
  const g = game.g;
  const t = driver(game).keepHands();
  forceIntoHand(g, 'Freelancer');
  t.creditsOut('corp'); discardKeeping(t, g, 'Freelancer');
  g.state.runner.credits = 10;
  forceIntoHand(g, 'Crash Space');
  forceIntoHand(g, 'Bank Job');
  t.label('Install Crash Space');
  t.label('Install Bank Job');
  g.state.runner.tags = 1; // set before corp turn 2's action menu is generated
  t.creditsOut('runner');
  t.label('Play Freelancer');
  t.prefix('t:'); // trash first resource
  t.prefix('t:'); // trash second resource
  assert.equal(g.state.runner.rig.resource.length, 0);
}],

['Executive Retreat: score places an agenda counter and shuffles HQ into R&D; hosted counter draws 5', () => {
  const game = makeGame({ corp: [['Executive Retreat', 1], ...filler(9)], runner: rFiller(10) });
  const g = game.g;
  const t = driver(game).keepHands();
  forceIntoHand(g, 'Executive Retreat');
  t.label('Install Executive Retreat').pick('t:new');
  const id = g.state.corp.servers.remote1.content[0];
  t.creditsOut('corp').discardFirst();
  inst(g, id).advancement = 5;
  t.creditsOut('runner');
  const rdBefore = g.state.corp.deck.length;
  const handBefore = g.state.corp.hand.length;
  t.label('Score Executive Retreat');
  assert.equal(inst(g, id).counters.agenda, 1);
  assert.equal(g.state.corp.hand.length, 0); // HQ fully shuffled into R&D
  assert.equal(g.state.corp.deck.length, rdBefore + handBefore); // HQ cards moved into the deck
  t.label('Hosted agenda counter');
  assert.equal(g.state.corp.hand.length, 5);
  assert.equal(inst(g, id).counters.agenda, 0);
}],

['Corporate War: score with >=7cr gains 7cr, otherwise loses all credits', () => {
  const game = makeGame({ corp: [['Corporate War', 1], ...filler(9)], runner: rFiller(10) });
  const g = game.g;
  const t = driver(game).keepHands();
  forceIntoHand(g, 'Corporate War');
  t.label('Install Corporate War').pick('t:new');
  const id = g.state.corp.servers.remote1.content[0];
  t.creditsOut('corp').discardFirst();
  inst(g, id).advancement = 4;
  g.state.corp.credits = 3; // below 7
  t.creditsOut('runner');
  t.label('Score Corporate War');
  assert.equal(g.state.corp.credits, 0);
}],

['Government Contracts: [click][click] gains 4 credits', () => {
  const game = makeGame({ corp: [['Government Contracts', 1], ...filler(9)], runner: rFiller(10) });
  const g = game.g;
  const t = driver(game).keepHands();
  forceIntoHand(g, 'Government Contracts');
  t.label('Install Government Contracts').pick('t:new');
  const id = g.state.corp.servers.remote1.content[0];
  t.creditsOut('corp').discardFirst();
  inst(g, id).advancement = 5;
  t.creditsOut('runner');
  t.label('Score Government Contracts');
  const before = g.state.corp.credits;
  const clicksBefore = g.state.corp.clicks;
  t.label('Gain 4 credits');
  assert.equal(g.state.corp.credits, before + 4);
  assert.equal(g.state.corp.clicks, clicksBefore - 2);
}],

['Rework: shuffles a chosen HQ card into R&D', () => {
  const game = makeGame({ corp: [['Rework', 1], ...filler(9)], runner: rFiller(10) });
  const g = game.g;
  const t = driver(game).keepHands();
  forceIntoHand(g, 'Rework');
  const rdBefore = g.state.corp.deck.length;
  t.label('Play Rework');
  t.prefix('s:'); // shuffle first offered HQ card
  assert.equal(g.state.corp.deck.length, rdBefore + 1);
}],

['Commercialization: gains 1cr per advancement token on a chosen piece of ice', () => {
  const game = makeGame({ corp: [['Commercialization', 1], ['Ice Wall', 1], ...filler(8)], runner: rFiller(10) });
  const g = game.g;
  const t = driver(game).keepHands();
  g.state.corp.credits = 20;
  forceIntoHand(g, 'Ice Wall');
  t.label('Install Ice Wall').label('Protecting hq');
  const iceId = g.state.corp.servers.hq.ice[0];
  inst(g, iceId).advancement = 3;
  forceIntoHand(g, 'Commercialization');
  const before = g.state.corp.credits;
  t.label('Play Commercialization');
  t.prefix('i:');
  assert.equal(g.state.corp.credits, before + 3);
}],

['Private Contracts: loads 14cr on rez, [click] takes 2cr, trashes when empty', () => {
  const game = makeGame({ corp: [['Private Contracts', 1], ...filler(9)], runner: rFiller(10) });
  const g = game.g;
  const t = driver(game).keepHands();
  g.state.corp.credits = 20;
  forceIntoHand(g, 'Private Contracts');
  t.label('Install Private Contracts').pick('t:new');
  const id = g.state.corp.servers.remote1.content[0];
  t.prefix('rez');
  assert.equal(inst(g, id).counters.credit, 14);
  const before = g.state.corp.credits;
  t.label('Take 2 credits from Private Contracts');
  assert.equal(g.state.corp.credits, before + 2);
  assert.equal(inst(g, id).counters.credit, 12);
}],

['Eve Campaign: loads 16cr on rez, takes 2cr at turn start, trashes when empty', () => {
  const game = makeGame({ corpId: hb, corp: [['Eve Campaign', 1], ...filler(9)], runner: rFiller(10) });
  const g = game.g;
  const t = driver(game).keepHands();
  g.state.corp.credits = 20;
  forceIntoHand(g, 'Eve Campaign');
  t.label('Install Eve Campaign').pick('t:new');
  const id = g.state.corp.servers.remote1.content[0];
  t.prefix('rez');
  assert.equal(inst(g, id).counters.credit, 16);
  t.creditsOut('corp').discardFirst();
  const before = g.state.corp.credits; // corp turn 1 over; capture before corp turn 2's onTurnStart fires
  t.creditsOut('runner'); // ends runner turn 1 -> corp turn 2 starts, Eve Campaign's onTurnStart pays out
  assert.equal(g.state.corp.credits, before + 2);
  assert.equal(inst(g, id).counters.credit, 14);
}],

['Marked Accounts: takes 1cr at turn start if able; [click] loads 3cr', () => {
  const game = makeGame({ corp: [['Marked Accounts', 1], ...filler(9)], runner: rFiller(10) });
  const g = game.g;
  const t = driver(game).keepHands();
  forceIntoHand(g, 'Marked Accounts');
  t.label('Install Marked Accounts').pick('t:new');
  const id = g.state.corp.servers.remote1.content[0];
  t.prefix('rez'); // free action
  assert.equal(inst(g, id).counters.credit ?? 0, 0);
  t.label('Place 3 credits from the bank on Marked Accounts');
  assert.equal(inst(g, id).counters.credit, 3);
  t.creditsOut('corp').discardFirst();
  t.creditsOut('runner');
  // next corp turn start already resolved the 1cr trickle before this action menu
  assert.equal(inst(g, id).counters.credit, 2);
}],

['NBN: The World is Yours — max hand size increased by 1', () => {
  const game = makeGame({ corpId: nbnTwiy, corp: filler(10), runner: rFiller(10) });
  const g = game.g;
  const t = driver(game).keepHands();
  t.creditsOut('corp');
  // mandatory turn-1 draw takes the corp to 6 cards; with the +1 hand size
  // mod that's within the cap, so no discard is forced (default cap would
  // force a discard back down to 5)
  assert.equal(g.state.corp.hand.length, 6);
}],

['Compromised Employee: 1 recurring credit for traces; gains 1cr whenever the Corp rezzes ice', () => {
  const game = makeGame({ corp: [['Ice Wall', 1], ...filler(9)], runner: [['Compromised Employee', 1], ...rFiller(9)] });
  const g = game.g;
  const t = driver(game).keepHands();
  g.state.corp.credits = 20;
  forceIntoHand(g, 'Ice Wall');
  t.label('Install Ice Wall').label('Protecting hq');
  t.creditsOut('corp').discardFirst();
  g.state.runner.credits = 10;
  forceIntoHand(g, 'Compromised Employee');
  t.label('Install Compromised Employee');
  const before = g.state.runner.credits;
  t.prefix('run:hq');
  t.prefix('rez'); // corp rezzes Ice Wall mid-approach
  assert.equal(g.state.runner.credits, before + 1);
  t.pick('continue'); // no breakers, end the run cleanly
}],

['Weyland Consortium: Because We Built It — 1 recurring credit to advance ice', () => {
  const game = makeGame({ corpId: wbbi, corp: [['Ice Wall', 1], ...filler(9)], runner: rFiller(10) });
  const g = game.g;
  const t = driver(game).keepHands();
  forceIntoHand(g, 'Ice Wall');
  t.label('Install Ice Wall').label('Protecting hq');
  const iceId = g.state.corp.servers.hq.ice[0];
  g.state.corp.credits = 0;
  t.label('Advance');
  assert.equal(inst(g, iceId).advancement, 1); // paid from the recurring pool, not real credits
  assert.equal(g.state.corp.credits, 0);
}],

['Cortez Chip: trash to make a target ice cost 2cr more to rez this turn', () => {
  const game = makeGame({ corp: [['Ice Wall', 1], ...filler(9)], runner: [['Cortez Chip', 1], ...rFiller(9)] });
  const g = game.g;
  const t = driver(game).keepHands();
  g.state.corp.credits = 20;
  forceIntoHand(g, 'Ice Wall');
  t.label('Install Ice Wall').label('Protecting hq');
  const iceId = g.state.corp.servers.hq.ice[0];
  const printedCost = cardOf(g, iceId).cost;
  t.creditsOut('corp').discardFirst();
  g.state.runner.credits = 10;
  forceIntoHand(g, 'Cortez Chip');
  t.label('Install Cortez Chip');
  t.label('Trash Cortez Chip');
  t.prefix('i:');
  assert.equal(g.state.corp.servers.hq.ice.length, 1); // sanity: ice untouched, still installed
  assert.equal(g.state.flags.turn.rezCostBumps[iceId], 2);
  assert.equal(fx.rezCost(g, iceId), printedCost + 2);
}],

['Whizzard: Master Gamer — 3 recurring credits to trash cards', () => {
  const game = makeGame({ runnerId: whizzard, corp: [['Adonis Campaign', 1], ...filler(9)], runner: rFiller(10) });
  const g = game.g;
  const t = driver(game).keepHands();
  g.state.corp.credits = 20;
  forceIntoHand(g, 'Adonis Campaign');
  t.label('Install Adonis Campaign').pick('t:new');
  t.creditsOut('corp').discardFirst();
  g.state.runner.credits = 0;
  t.prefix('run:remote1');
  t.pick('continue'); // approach-server jack-out: continue
  t.pick('done'); // decline to rez
  t.pick('trash'); // access -> trash Adonis Campaign (3cr trash cost), paid from recurring pool
  assert.equal(g.state.runner.credits, 0); // paid entirely from Whizzard's recurring pool
}],

['Quality Time: draws 5 cards', () => {
  const game = makeGame({ corp: filler(10), runner: [['Quality Time', 1], ...rFiller(9)] });
  const g = game.g;
  const t = driver(game).keepHands();
  t.creditsOut('corp').discardFirst(); // corp turn 1, so it's the runner's turn to act
  g.state.runner.credits = 10;
  forceIntoHand(g, 'Quality Time');
  const before = g.state.runner.hand.length;
  t.label('Play Quality Time');
  assert.equal(g.state.runner.hand.length, before - 1 + 5); // -1 played, +5 drawn
}],

['Satellite Uplink: exposes up to 2 unrezzed installed corp cards', () => {
  const game = makeGame({ corp: [['Ice Wall', 7], ...filler(3)], runner: [['Satellite Uplink', 1], ...rFiller(9)] });
  const g = game.g;
  const t = driver(game).keepHands();
  g.state.corp.credits = 20;
  t.label('Install Ice Wall').label('Protecting hq');
  t.label('Install Ice Wall').label('Protecting rd');
  t.creditsOut('corp').discardFirst();
  g.state.runner.credits = 10;
  forceIntoHand(g, 'Satellite Uplink');
  t.label('Play Satellite Uplink');
  t.prefix('e:');
  t.prefix('e:');
  assert.equal(game.log.filter(e => e.type === 'exposed').length, 2);
}],

['Inside Man: 2 recurring credits to install hardware', () => {
  const game = makeGame({ corp: filler(10), runner: [['Inside Man', 1], ['Rabbit Hole', 1], ...rFiller(8)] });
  const g = game.g;
  const t = driver(game).keepHands();
  // both target cards forced into hand before corp turn 1 even starts, so
  // they're already there (and reflected) the moment each fresh runner
  // decision is generated later — a decision snapshot doesn't retroactively
  // pick up a hand mutation made after it was yielded.
  g.state.runner.credits = 10;
  forceIntoHand(g, 'Inside Man');
  forceIntoHand(g, 'Rabbit Hole');
  t.creditsOut('corp').discardFirst(); // corp turn 1, so it's the runner's turn to act
  t.label('Install Inside Man');
  // Inside Man's recurring pool refills at the start of ITS OWN side's next
  // turn (refillRecurring runs at turn start, before any mid-turn install
  // could benefit) — so installing Rabbit Hole in this same turn would pay
  // from real credits. Run out this turn and the next corp turn first.
  t.creditsOut('runner').discardFirst();
  t.creditsOut('corp').discardFirst();
  const before = g.state.runner.credits; // real credits carried into runner turn 2, pool now refilled
  t.label('Install Rabbit Hole');
  assert.equal(g.state.runner.rig.hardware.some(id => cardOf(g, id).title === 'Rabbit Hole'), true);
  assert.equal(g.state.runner.credits, before); // Rabbit Hole (2cr) paid entirely from Inside Man's recurring pool
}],

['Joshua B.: may gain a click at turn start, taking a tag when that turn ends', () => {
  const game = makeGame({ corp: filler(10), runner: [['Joshua B.', 1], ...rFiller(9)] });
  const g = game.g;
  const t = driver(game).keepHands();
  t.creditsOut('corp').discardFirst(); // corp turn 1
  g.state.runner.credits = 10;
  forceIntoHand(g, 'Joshua B.');
  t.label('Install Joshua B.');
  t.creditsOut('runner').discardFirst(); // end runner turn 1
  t.creditsOut('corp').discardFirst(); // corp turn 2
  // runner turn 2 start: Joshua B. offers the click
  const clicksBefore = g.state.runner.clicks;
  t.label('Gain [click]');
  assert.equal(g.state.runner.clicks, clicksBefore + 1);
  const tagsBefore = g.state.runner.tags;
  t.creditsOut('runner');
  assert.equal(g.state.runner.tags, tagsBefore + 1);
}],

['Networking: removes 1 tag; may pay 1cr to keep it in the grip instead of the heap', () => {
  const game = makeGame({ corp: filler(10), runner: [['Networking', 1], ...rFiller(9)] });
  const g = game.g;
  const t = driver(game).keepHands();
  g.state.runner.tags = 1;
  g.state.runner.credits = 5;
  const netId = forceIntoHand(g, 'Networking');
  t.creditsOut('corp').discardFirst(); // corp turn 1, so it's the runner's turn to act
  t.label('Play Networking');
  t.pick('pay');
  assert.equal(g.state.runner.tags, 0);
  assert.equal(inst(g, netId).zone, 'runner-hand'); // kept, not discarded
}],

['Public Sympathy: max hand size increased by 2', () => {
  const game = makeGame({ corp: filler(10), runner: [['Public Sympathy', 1], ...rFiller(20)] });
  const g = game.g;
  const t = driver(game).keepHands();
  g.state.runner.credits = 10;
  forceIntoHand(g, 'Public Sympathy');
  t.creditsOut('corp').discardFirst(); // corp turn 1, so it's the runner's turn to act
  t.label('Install Public Sympathy'); // hand now 4
  fx.draw(g, 'runner', 5); // hand now 9, well past either cap
  // discard-to-hand-size at end of turn only kicks the runner down to 7
  // (baseHandSize 5 + Public Sympathy's +2), not 5
  t.creditsOut('runner').discardFirst();
  assert.equal(g.state.runner.hand.length, 7);
}],

['Andromeda: Dispossessed Ristie — draws a starting hand of 9 cards', () => {
  const game = makeGame({ runnerId: andromeda, corp: filler(10), runner: rFiller(20) });
  const g = game.g;
  assert.equal(g.state.runner.hand.length, 9);
  const t = driver(game);
  t.pick('keep'); // corp keep
  t.pick('mulligan'); // runner mulligan: redraw should also be 9
  assert.equal(g.state.runner.hand.length, 9);
}],

];
