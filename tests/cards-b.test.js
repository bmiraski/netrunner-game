import assert from 'node:assert/strict';
import { makeGame, driver, lastEvent, db } from './helpers.js';
import * as fx from '../engine/effects.js';
import { inst, cardOf, moveCard } from '../engine/state.js';

const filler = n => [['Hedge Fund', n]];
const rFiller = n => [['Sure Gamble', n]];
const weyland = 'Weyland Consortium: Building a Better World';
const nbn = 'NBN: Making News';

// Install `title` (from HQ) protecting `server`, rez it, and leave the corp
// turn mid-action so the runner can act next. Returns the driver.
function installIceAndFinishCorpTurn(t, title, server = 'hq') {
  t.label(`Install ${title}`).label(`Protecting ${server}`);
  t.creditsOut('corp').discardFirst();
  return t;
}

// Force a specific card (by title, wherever it currently sits) into its
// owner's hand, swapping out an existing hand card to keep hand size stable.
// Sanctioned direct-state setup (see tests/helpers.js docs) used here to make
// multi-turn scenarios deterministic regardless of shuffle.
function forceIntoHand(g, title) {
  const id = Object.values(g.insts).find(i => cardOf(g, i.id).title === title)?.id;
  if (id == null) throw new Error(`no ${title} in this game`);
  const zone = inst(g, id).zone;
  if (zone === 'corp-hand' || zone === 'runner-hand') return id;
  const side = cardOf(g, id).side;
  const hand = side === 'corp' ? g.state.corp.hand : g.state.runner.hand;
  if (hand.length > 0) moveCard(g, hand[0], `${side}-deck`); // make room, keep size stable
  moveCard(g, id, `${side}-hand`);
  return id;
}

export default [

['Weyland: Building a Better World — playing a transaction operation gains 1cr', () => {
  const game = makeGame({ corpId: weyland, corp: [['Beanstalk Royalties', 6], ['Hedge Fund', 4]], runner: rFiller(10) });
  const g = game.g;
  const t = driver(game).keepHands();
  const credsBefore = g.state.corp.credits;
  t.label('Play Beanstalk Royalties');
  // Beanstalk Royalties (Transaction, 0cr) grants 3cr; identity grants +1cr more.
  assert.equal(g.state.corp.credits, credsBefore + 3 + 1);
}],

['Hostile Takeover: score gains 7cr and takes 1 bad publicity', () => {
  const game = makeGame({ corpId: weyland, corp: [['Hostile Takeover', 6], ['Hedge Fund', 4]], runner: rFiller(10) });
  const g = game.g;
  const t = driver(game).keepHands();
  t.label('Install Hostile Takeover').pick('t:new');
  g.state.corp.credits = 20;
  t.creditsOut('corp').discardFirst();
  t.creditsOut('runner');
  t.prefix('advance').prefix('advance');
  const credsBefore = g.state.corp.credits;
  t.label('Score Hostile Takeover');
  assert.equal(g.state.corp.credits, credsBefore + 7);
  assert.equal(g.state.corp.badPublicity, 1);
}],

['Project Atlas: score counters; hosted counter searches R&D and adds a card to HQ', () => {
  const game = makeGame({ corpId: weyland, corp: [['Project Atlas', 6], ['Hedge Fund', 4]], runner: rFiller(10) });
  const g = game.g;
  const t = driver(game).keepHands();
  t.label('Install Project Atlas').pick('t:new');
  const paId = g.state.corp.servers.remote1.content[0];
  g.state.corp.credits = 20;
  inst(g, paId).advancement = 4; // 1 past 3
  t.creditsOut('corp').discardFirst();
  t.creditsOut('runner');
  const deckBefore = [...g.state.corp.deck];
  t.label('Score Project Atlas');
  assert.equal(inst(g, paId).counters.agenda, 1);
  t.label('Hosted agenda counter');
  const topId = deckBefore[0];
  t.pick(`s:${topId}`);
  assert.equal(inst(g, topId).zone, 'corp-hand');
  assert.equal(inst(g, paId).counters.agenda, 0);
  assert.equal(lastEvent(game, 'deck-shuffled').data.who, 'corp');
}],

['The Cleaners: while scored, meat damage dealt is increased by 1', () => {
  const game = makeGame({ corpId: weyland, corp: [['The Cleaners', 6], ['Hedge Fund', 4]], runner: rFiller(10) });
  const g = game.g;
  const t = driver(game).keepHands();
  t.label('Install The Cleaners').pick('t:new');
  const tcId = g.state.corp.servers.remote1.content[0];
  g.state.corp.credits = 20;
  inst(g, tcId).advancement = 5;
  t.creditsOut('corp').discardFirst();
  t.creditsOut('runner');
  t.label('Score The Cleaners');
  const handBefore = g.state.runner.hand.length;
  const gen = fx.damage(g, 'meat', 1, 'test');
  let r = gen.next();
  while (!r.done) r = gen.next(); // no prevention sources installed -> never yields
  assert.equal(g.state.runner.hand.length, handBefore - 2); // 1 printed + 1 from The Cleaners
}],

['Dedicated Response Team: 2 meat damage whenever a successful run ends while the Runner is tagged', () => {
  const game = makeGame({ corpId: weyland, corp: [['Dedicated Response Team', 6], ['Hedge Fund', 4]], runner: rFiller(10) });
  const g = game.g;
  const t = driver(game).keepHands();
  t.label('Install Dedicated Response Team').pick('t:new');
  t.pick(game.decision.options.find(o => o.id.startsWith('rez')).id);
  t.creditsOut('corp').discardFirst();
  g.state.runner.tags = 1;
  const handBefore = g.state.runner.hand.length;
  t.prefix('run:hq');
  assert.equal(g.state.runner.hand.length, handBefore - 2);
  assert.equal(lastEvent(game, 'damage').data.why, 'Dedicated Response Team');
}],

['Dedicated Response Team: no damage when the Runner is not tagged', () => {
  const game = makeGame({ corpId: weyland, corp: [['Dedicated Response Team', 6], ['Hedge Fund', 4]], runner: rFiller(10) });
  const g = game.g;
  const t = driver(game).keepHands();
  t.label('Install Dedicated Response Team').pick('t:new');
  t.pick(game.decision.options.find(o => o.id.startsWith('rez')).id);
  t.creditsOut('corp').discardFirst();
  const handBefore = g.state.runner.hand.length;
  t.prefix('run:hq');
  assert.equal(g.state.runner.hand.length, handBefore);
}],

['Elizabeth Mills: rez removes 1 bad publicity; ability trashes a location resource for 1 more', () => {
  const game = makeGame({ corpId: weyland, corp: [['Elizabeth Mills', 6], ['Hedge Fund', 4]], runner: [['Sure Gamble', 5], ['Mr. Li', 1]] });
  const g = game.g;
  const t = driver(game).keepHands();
  g.state.corp.badPublicity = 2;
  t.label('Install Elizabeth Mills').pick('t:new');
  t.pick(game.decision.options.find(o => o.id.startsWith('rez')).id);
  assert.equal(g.state.corp.badPublicity, 1);
  t.creditsOut('corp').discardFirst();
  // Simulate the Runner having an installed "location" resource — no
  // Location-subtype resource exists yet in Batches A/B; simulate one the
  // way Batch A's Swordsman test simulates an AI-subtype breaker.
  const mrLiId = Object.values(g.insts).find(i => cardOf(g, i.id).title === 'Mr. Li').id;
  moveCard(g, mrLiId, 'rig-resource');
  inst(g, mrLiId).faceup = true; inst(g, mrLiId).rezzed = true;
  cardOf(g, mrLiId).subtypes = [...cardOf(g, mrLiId).subtypes, 'Location'];
  t.creditsOut('runner');
  t.label('Trash 1 installed location resource');
  t.label('Mr. Li');
  assert.equal(lastEvent(game, 'card-trashed').data.title, 'Mr. Li');
  assert.equal(g.state.corp.badPublicity, 2);
}],

['GRNDL Refinery: advanceable, trash for 4cr per advancement token', () => {
  const game = makeGame({ corpId: weyland, corp: [['GRNDL Refinery', 6], ['Hedge Fund', 4]], runner: rFiller(10) });
  const g = game.g;
  const t = driver(game).keepHands();
  g.state.corp.credits = 20;
  t.label('Install GRNDL Refinery').pick('t:new');
  t.pick(game.decision.options.find(o => o.id.startsWith('rez')).id);
  const grId = g.state.corp.servers.remote1.content[0];
  inst(g, grId).advancement = 3;
  const credsBefore = g.state.corp.credits;
  t.label('Trash: gain 4cr');
  assert.equal(g.state.corp.credits, credsBefore + 12);
  assert.equal(lastEvent(game, 'card-trashed').data.title, 'GRNDL Refinery');
}],

['Archer: rezzing forfeits a scored agenda, then subs fire (credits, program trash x2, ETR)', () => {
  const game = makeGame({ corpId: weyland, corp: [['Archer', 3], ['Hostile Takeover', 3], ['Hedge Fund', 4]], runner: [['Sure Gamble', 5], ['Battering Ram', 5]] });
  const g = game.g;
  const t = driver(game).keepHands();
  g.state.corp.credits = 20;
  forceIntoHand(g, 'Hostile Takeover');
  t.label('Install Hostile Takeover').pick('t:new');
  t.creditsOut('corp').discardFirst();
  t.creditsOut('runner');
  t.prefix('advance').prefix('advance'); // advancement 2 meets cost 2, 1 click left
  forceIntoHand(g, 'Archer'); // before scoring resolves (menu rebuilt right after)
  t.label('Score Hostile Takeover');
  assert.equal(g.state.corp.agendaPoints, 1);
  t.label('Install Archer').label('Protecting hq');
  t.discardFirst();
  g.state.runner.credits = 10;
  t.label('Install Battering Ram');
  t.prefix('run:hq');
  t.prefix('rez');
  t.label('Hostile Takeover'); // forfeit choice (additional rez cost)
  assert.equal(g.state.corp.agendaPoints, 0);
  const credsBefore = g.state.corp.credits;
  t.pick('continue');
  t.label('Battering Ram'); // first program-trash sub
  assert.equal(lastEvent(game, 'card-trashed').data.title, 'Battering Ram');
  // second program-trash sub silently whiffs (no programs left); ETR follows automatically
  assert.equal(g.state.corp.credits, credsBefore + 2);
  assert.equal(lastEvent(game, 'run-end').data.successful, false);
}],

['Archer: rezzing with no scored agenda emits archer-rez-invalid instead of blocking', () => {
  const game = makeGame({ corpId: weyland, corp: [['Archer', 6], ['Hedge Fund', 4]], runner: rFiller(10) });
  const g = game.g;
  const t = driver(game).keepHands();
  installIceAndFinishCorpTurn(t, 'Archer');
  const iceId = g.state.corp.servers.hq.ice[0];
  t.prefix('run:hq');
  t.prefix('rez');
  assert.equal(lastEvent(game, 'archer-rez-invalid').data.instId, iceId);
  assert.equal(inst(g, iceId).rezzed, true);
}],

['Caduceus: trace 3 gains 3cr, trace 2 ends the run', () => {
  const game = makeGame({ corpId: weyland, corp: [['Caduceus', 6], ['Hedge Fund', 4]], runner: rFiller(10) });
  const g = game.g;
  const t = driver(game).keepHands();
  installIceAndFinishCorpTurn(t, 'Caduceus');
  g.state.corp.credits = 20;
  t.prefix('run:hq');
  t.prefix('rez');
  const credsBefore = g.state.corp.credits;
  t.pick('continue');
  t.num(0); t.num(0); // trace 3 boosts
  assert.equal(g.state.corp.credits, credsBefore + 3);
  t.num(0); t.num(0); // trace 2 boosts
  assert.equal(lastEvent(game, 'run-end').data.successful, false);
}],

["Hadrian's Wall: advanceable, +1 strength per advancement, ETR x2", () => {
  const game = makeGame({ corpId: weyland, corp: [["Hadrian's Wall", 6], ['Hedge Fund', 4]], runner: rFiller(10) });
  const g = game.g;
  const t = driver(game).keepHands();
  installIceAndFinishCorpTurn(t, "Hadrian's Wall");
  const hwId = g.state.corp.servers.hq.ice[0];
  inst(g, hwId).advancement = 2;
  g.state.corp.credits = 20;
  t.prefix('run:hq');
  t.prefix('rez');
  assert.match(game.decision.prompt, /str 9/); // printed 7 + 2 advancement
  t.pick('continue');
  assert.equal(lastEvent(game, 'run-end').data.successful, false);
}],

['Hive: loses 1 printed ETR sub per agenda point in the score area', () => {
  const game = makeGame({ corpId: weyland, corp: [['Hive', 6], ['Hedge Fund', 4]], runner: rFiller(10) });
  const g = game.g;
  const t = driver(game).keepHands();
  installIceAndFinishCorpTurn(t, 'Hive');
  g.state.corp.agendaPoints = 3; // loses 3 of 5 subs -> 2 active
  g.state.corp.credits = 20;
  t.prefix('run:hq');
  t.prefix('rez');
  assert.equal(lastEvent(game, 'encounter-ice').data.subs.length, 2);
  t.pick('continue');
  assert.equal(lastEvent(game, 'run-end').data.successful, false);
}],

['Shadow: advanceable, +1 strength per advancement; gains credits then traces for a tag', () => {
  const game = makeGame({ corpId: weyland, corp: [['Shadow', 6], ['Hedge Fund', 4]], runner: rFiller(10) });
  const g = game.g;
  const t = driver(game).keepHands();
  installIceAndFinishCorpTurn(t, 'Shadow');
  const shId = g.state.corp.servers.hq.ice[0];
  inst(g, shId).advancement = 2;
  g.state.corp.credits = 20;
  t.prefix('run:hq');
  t.prefix('rez');
  assert.match(game.decision.prompt, /str 3/); // printed 1 + 2 advancement
  const credsBefore = g.state.corp.credits;
  t.pick('continue');
  assert.equal(g.state.corp.credits, credsBefore + 2);
  t.num(0); t.num(0);
  assert.equal(g.state.runner.tags, 1);
}],

['Punitive Counterstrike: trace 5 deals meat damage equal to points stolen last turn', () => {
  const game = makeGame({ corpId: weyland, corp: [['Punitive Counterstrike', 3], ['Priority Requisition', 3], ['Hedge Fund', 4]], runner: rFiller(10) });
  const g = game.g;
  const t = driver(game).keepHands();
  g.state.corp.credits = 20;
  forceIntoHand(g, 'Priority Requisition');
  t.label('Install Priority Requisition').pick('t:new');
  forceIntoHand(g, 'Punitive Counterstrike'); // before the corp's turn ends
  t.creditsOut('corp').discardFirst();
  t.prefix('run:remote1');
  t.creditsOut('runner');
  assert.equal(g.state.flags.lastRunnerTurn.stolenPoints, 3);
  const handBefore = g.state.runner.hand.length;
  t.label('Play Punitive Counterstrike');
  t.num(0); t.num(0);
  assert.equal(g.state.runner.hand.length, handBefore - 3);
}],

['Shipment from Kaguya: places 1 advancement on each of up to 2 distinct advanceable cards', () => {
  const game = makeGame({ corpId: weyland, corp: [['Shipment from Kaguya', 3], ['Ice Wall', 3], ['Hedge Fund', 4]], runner: rFiller(10) });
  const g = game.g;
  const t = driver(game).keepHands();
  g.state.corp.credits = 20;
  t.label('Install Ice Wall').label('Protecting hq');
  const iw1 = g.state.corp.servers.hq.ice[0];
  t.label('Install Ice Wall').label('Protecting rd');
  const iw2 = g.state.corp.servers.rd.ice[0];
  t.label('Play Shipment from Kaguya');
  t.pick(`t:${iw1}`);
  t.pick(`t:${iw2}`);
  assert.equal(inst(g, iw1).advancement, 1);
  assert.equal(inst(g, iw2).advancement, 1);
}],

['NBN: Making News — 2 recurring credits refill each corp turn, usable for trace boosts', () => {
  // Drives fx.trace directly (bypassing a rez/install payment) so the
  // assertion isn't muddied by this engine's pay(), which auto-spends ANY
  // recurring pool first when a payment omits an explicit purpose (see
  // docs/CARD_COVERAGE.md) — that would drain the trace-only pool via an
  // unrelated cost before this test gets to exercise it.
  const game = makeGame({ corpId: nbn, corp: filler(6), runner: rFiller(10) });
  const g = game.g;
  driver(game).keepHands();
  const idInst = inst(g, g.state.corp.identity);
  assert.equal(idInst.counters.recurring, 2); // refilled at the corp's turn start
  g.state.corp.credits = 0;
  const gen = fx.trace(g, 3, 'test');
  const first = gen.next().value; // corp boost decision
  assert.equal(first.max, 2); // 0 real credits + 2 recurring (trace-purpose pool)
  gen.next(2); // corp spends both recurring credits to boost
  assert.equal(idInst.counters.recurring, 0);
  assert.equal(lastEvent(game, 'pool-credits-spent').data.used, 2);
}],

['Project Beale: counters from excess advancement add bonus agenda points', () => {
  const game = makeGame({ corpId: nbn, corp: [['Project Beale', 6], ['Hedge Fund', 6]], runner: rFiller(10) });
  const g = game.g;
  const t = driver(game).keepHands();
  t.label('Install Project Beale').pick('t:new');
  const pbId = g.state.corp.servers.remote1.content[0];
  g.state.corp.credits = 20;
  inst(g, pbId).advancement = 7; // 4 past 3 -> floor(4/2)=2 counters -> +2 points
  t.creditsOut('corp').discardFirst();
  t.creditsOut('runner');
  t.label('Score Project Beale');
  assert.equal(inst(g, pbId).counters.agenda, 2);
  assert.equal(g.state.corp.agendaPoints, 2 + 2);
}],

['TGTBT: any access gives the Runner 1 tag and is stolen', () => {
  const game = makeGame({ corpId: nbn, corp: [['TGTBT', 1], ['Hedge Fund', 9]], runner: rFiller(10) });
  const g = game.g;
  const t = driver(game).keepHands();
  forceIntoHand(g, 'TGTBT');
  // force TGTBT to be the sole card in HQ for a deterministic single-card access
  const tgtbtId = Object.values(g.insts).find(i => cardOf(g, i.id).title === 'TGTBT').id;
  for (const id of [...g.state.corp.hand]) if (id !== tgtbtId) moveCard(g, id, 'corp-deck');
  t.creditsOut('corp').discardFirst();
  t.prefix('run:hq');
  assert.equal(g.state.runner.tags, 1);
  assert.equal(g.state.runner.agendaPoints, 1);
}],

['Ghost Branch: advanceable ambush, corp may give tags equal to advancement on access', () => {
  const game = makeGame({ corpId: nbn, corp: [['Ghost Branch', 6], ['Hedge Fund', 4]], runner: rFiller(10) });
  const g = game.g;
  const t = driver(game).keepHands();
  t.label('Install Ghost Branch').pick('t:new');
  const gbId = g.state.corp.servers.remote1.content[0];
  inst(g, gbId).advancement = 2;
  t.creditsOut('corp').discardFirst();
  t.prefix('run:remote1');
  t.pick('done'); // decline to rez (asset is 0cr, doesn't matter for access)
  t.label('Give 2 tag');
  assert.equal(g.state.runner.tags, 2);
}],

['Data Raven: encounter forces a tag-or-end choice; trace success loads a power counter usable as a corp ability', () => {
  const game = makeGame({ corpId: nbn, corp: [['Data Raven', 6], ['Hedge Fund', 4]], runner: rFiller(10) });
  const g = game.g;
  const t = driver(game).keepHands();
  installIceAndFinishCorpTurn(t, 'Data Raven');
  const drId = g.state.corp.servers.hq.ice[0];
  g.state.corp.credits = 20;
  t.prefix('run:hq');
  t.prefix('rez');
  t.pick('tag'); // take the tag instead of ending the run
  assert.equal(g.state.runner.tags, 1);
  t.pick('continue'); // no breakers
  t.num(0); t.num(0); // trace 3 (base 3 >= link 0 -> succeeds)
  assert.equal(inst(g, drId).counters.power, 1);
  t.prefix('ability'); // corp spends the power counter for another tag at server-approach
  assert.equal(g.state.runner.tags, 2);
  assert.equal(inst(g, drId).counters.power, 0);
}],

['Data Raven: choosing to end the run stops the run without a tag', () => {
  const game = makeGame({ corpId: nbn, corp: [['Data Raven', 6], ['Hedge Fund', 4]], runner: rFiller(10) });
  const g = game.g;
  const t = driver(game).keepHands();
  installIceAndFinishCorpTurn(t, 'Data Raven');
  g.state.corp.credits = 20;
  t.prefix('run:hq');
  t.prefix('rez');
  t.pick('end');
  assert.equal(g.state.runner.tags, 0);
  assert.equal(lastEvent(game, 'run-end').data.successful, false);
}],

['Flare: trace 6 trashes hardware, deals unpreventable meat damage, and ends the run', () => {
  const game = makeGame({ corpId: nbn, corp: [['Flare', 3], ['Hedge Fund', 6]], runner: rFiller(10) });
  const g = game.g;
  const t = driver(game).keepHands();
  installIceAndFinishCorpTurn(t, 'Flare');
  g.state.corp.credits = 20;
  const handBefore = g.state.runner.hand.length;
  t.prefix('run:hq');
  t.prefix('rez');
  t.pick('continue');
  t.num(0); t.num(0);
  assert.equal(g.state.runner.hand.length, handBefore - 2);
  assert.equal(lastEvent(game, 'run-end').data.successful, false);
}],

['Pop-up Window: encounter gains 1cr; sub lets the Runner pay 1cr or end the run', () => {
  const game = makeGame({ corpId: nbn, corp: [['Pop-up Window', 6], ['Hedge Fund', 4]], runner: rFiller(10) });
  const g = game.g;
  const t = driver(game).keepHands();
  installIceAndFinishCorpTurn(t, 'Pop-up Window');
  const credsBefore = g.state.corp.credits;
  t.prefix('run:hq');
  t.prefix('rez');
  assert.equal(g.state.corp.credits, credsBefore + 1);
  t.pick('continue');
  const runnerCredsBefore = g.state.runner.credits;
  t.pick('pay');
  // -1 sub payment, +2 Gabriel (successful HQ run completes before next decision)
  assert.equal(g.state.runner.credits, runnerCredsBefore - 1 + 2);
  assert.equal(lastEvent(game, 'run-end').data.successful, true);
}],

['Pop-up Window: Runner declines to pay and the run ends', () => {
  const game = makeGame({ corpId: nbn, corp: [['Pop-up Window', 6], ['Hedge Fund', 4]], runner: rFiller(10) });
  const g = game.g;
  const t = driver(game).keepHands();
  installIceAndFinishCorpTurn(t, 'Pop-up Window');
  t.prefix('run:hq');
  t.prefix('rez');
  t.pick('continue');
  t.pick('end');
  assert.equal(lastEvent(game, 'run-end').data.successful, false);
}],

['Tollbooth: encounter charges 3cr if able, else ends the run; sub is a plain ETR', () => {
  const game = makeGame({ corpId: nbn, corp: [['Tollbooth', 6], ['Hedge Fund', 4]], runner: rFiller(10) });
  const g = game.g;
  const t = driver(game).keepHands();
  installIceAndFinishCorpTurn(t, 'Tollbooth');
  g.state.corp.credits = 20;
  g.state.runner.credits = 10;
  const runnerCredsBefore = g.state.runner.credits;
  t.prefix('run:hq');
  t.prefix('rez');
  assert.equal(g.state.runner.credits, runnerCredsBefore - 3);
  t.pick('continue');
  assert.equal(lastEvent(game, 'run-end').data.successful, false);
}],

['Tollbooth: Runner unable to pay 3cr has the run ended immediately at encounter', () => {
  const game = makeGame({ corpId: nbn, corp: [['Tollbooth', 6], ['Hedge Fund', 4]], runner: rFiller(10) });
  const g = game.g;
  const t = driver(game).keepHands();
  installIceAndFinishCorpTurn(t, 'Tollbooth');
  g.state.corp.credits = 20;
  g.state.runner.credits = 0;
  t.prefix('run:hq');
  t.prefix('rez');
  assert.equal(lastEvent(game, 'run-end').data.successful, false);
}],

['Wraparound: +7 strength while no fracter is installed; loses the bonus once one is', () => {
  const game = makeGame({ corpId: nbn, corp: [['Wraparound', 6], ['Hedge Fund', 4]], runner: [['Sure Gamble', 5], ['Battering Ram', 5]] });
  const g = game.g;
  const t = driver(game).keepHands();
  installIceAndFinishCorpTurn(t, 'Wraparound');
  g.state.corp.credits = 20;
  g.state.runner.credits = 10;
  t.prefix('run:hq');
  t.prefix('rez');
  assert.match(game.decision.prompt, /str 7/);
  t.pick('continue'); // ETR fires
  t.label('Install Battering Ram');
  const ramId = g.state.runner.rig.program[0];
  cardOf(g, ramId).subtypes = [...cardOf(g, ramId).subtypes, 'Fracter'];
  t.prefix('run:hq');
  assert.match(game.decision.prompt, /str 0/);
  t.pick('continue');
}],

['Anonymous Tip: draws 3 cards', () => {
  const game = makeGame({ corpId: nbn, corp: [['Anonymous Tip', 3], ['Hedge Fund', 15]], runner: rFiller(10) });
  const g = game.g;
  const t = driver(game).keepHands();
  const handBefore = g.state.corp.hand.length;
  t.label('Play Anonymous Tip');
  assert.equal(g.state.corp.hand.length, handBefore - 1 + 3);
}],

['Closed Accounts: only playable while the Runner is tagged; strips all their credits', () => {
  const game = makeGame({ corpId: nbn, corp: [['Closed Accounts', 3], ['Hedge Fund', 6]], runner: rFiller(10) });
  const g = game.g;
  const t = driver(game).keepHands();
  t.creditsOut('corp').discardFirst();
  t.creditsOut('runner');
  assert.ok(!game.decision.options.some(o => o.label.includes('Closed Accounts')));
  g.state.runner.tags = 1;
  g.state.runner.credits = 10;
  t.pick('credit'); // rebuild the action menu now that the Runner is tagged
  assert.ok(game.decision.options.some(o => o.label.includes('Closed Accounts')));
  t.label('Play Closed Accounts');
  assert.equal(g.state.runner.credits, 0);
}],

['Psychographics: X bounded by tags and credits; places X advancement on a chosen card', () => {
  // Uses the Weyland identity (not NBN: Making News) so the assertion on real
  // credits spent isn't muddied by NBN's recurring trace-credit pool, which
  // this engine's pay() auto-spends first for any payment without an
  // explicit purpose (see docs/CARD_COVERAGE.md).
  const game = makeGame({ corpId: weyland, corp: [['Psychographics', 3], ['Ice Wall', 3], ['Hedge Fund', 4]], runner: rFiller(10) });
  const g = game.g;
  const t = driver(game).keepHands();
  g.state.corp.credits = 20;
  t.label('Install Ice Wall').label('Protecting hq');
  const iwId = g.state.corp.servers.hq.ice[0];
  g.state.runner.tags = 2;
  const credsBefore = g.state.corp.credits;
  t.label('Play Psychographics');
  t.num(2);
  t.pick(`t:${iwId}`);
  assert.equal(inst(g, iwId).advancement, 2);
  assert.equal(g.state.corp.credits, credsBefore - 2);
}],

["SEA Source: only playable after a successful run during the Runner's last turn", () => {
  const game = makeGame({ corpId: nbn, corp: [['SEA Source', 6], ['Hedge Fund', 4]], runner: rFiller(10) });
  const g = game.g;
  const t = driver(game).keepHands();
  t.creditsOut('corp').discardFirst();
  // runner takes no run this turn -> not playable on the corp's following turn
  t.creditsOut('runner');
  assert.ok(!game.decision.options.some(o => o.label.includes('SEA Source')));
  t.creditsOut('corp').discardFirst();
  // runner now runs, then corp can play it on the turn after that
  t.prefix('run:hq');
  t.creditsOut('runner');
  assert.ok(game.decision.options.some(o => o.label.includes('Play SEA Source')));
  t.label('Play SEA Source');
  t.num(0); t.num(0);
  assert.equal(g.state.runner.tags, 1);
}],

['Red Herrings: persistent additional steal cost of 5cr', () => {
  const game = makeGame({ corpId: nbn, corp: [['Red Herrings', 3], ['Priority Requisition', 4]], runner: rFiller(10) });
  const g = game.g;
  const t = driver(game).keepHands();
  t.label('Install Priority Requisition').pick('t:new');
  t.label('Install Red Herrings').label('In remote1');
  t.pick(game.decision.options.find(o => o.id.startsWith('rez')).id);
  t.creditsOut('corp').discardFirst();
  g.state.runner.credits = 10;
  t.prefix('run:remote1');
  const credsBefore = g.state.runner.credits;
  t.pick('steal');
  assert.equal(g.state.runner.agendaPoints, 3);
  assert.equal(g.state.runner.credits, credsBefore - 5);
}],

['Bernice Mai: successful run traces for a tag on success', () => {
  const game = makeGame({ corpId: nbn, corp: [['Bernice Mai', 3], ['Hedge Fund', 4]], runner: rFiller(10) });
  const g = game.g;
  const t = driver(game).keepHands();
  t.label('Install Bernice Mai').label('In a NEW remote server');
  t.pick(game.decision.options.find(o => o.id.startsWith('rez')).id);
  const bmId = g.state.corp.servers.remote1.content[0];
  t.creditsOut('corp').discardFirst();
  g.state.corp.credits = 0;
  g.state.runner.credits = 0;
  t.prefix('run:remote1');
  t.num(0); // corp cannot boost (0cr)
  t.num(0); // runner cannot boost (0cr) -> trace 5 vs link 0 succeeds
  assert.equal(g.state.runner.tags, 1);
  assert.equal(inst(g, bmId).zone, 'server-content:remote1');
}],

['Bernice Mai: trashes itself when the trace fails', () => {
  const game = makeGame({ corpId: nbn, corp: [['Bernice Mai', 3], ['Hedge Fund', 4]], runner: rFiller(10) });
  const g = game.g;
  const t = driver(game).keepHands();
  t.label('Install Bernice Mai').label('In a NEW remote server');
  t.pick(game.decision.options.find(o => o.id.startsWith('rez')).id);
  const bmId = g.state.corp.servers.remote1.content[0];
  t.creditsOut('corp').discardFirst();
  // boost the runner's link past the trace strength so it fails
  g.state.runner.baseLink = 10;
  g.state.corp.credits = 0;
  g.state.runner.credits = 0;
  t.prefix('run:remote1');
  t.num(0);
  t.num(0);
  assert.equal(g.state.runner.tags, 0);
  assert.equal(lastEvent(game, 'card-trashed').data.title, 'Bernice Mai');
}],

['False Lead: forfeiting costs the Runner 2 clicks if they have 2+ remaining', () => {
  const game = makeGame({ corpId: nbn, corp: [['False Lead', 3], ['Hedge Fund', 6]], runner: rFiller(10) });
  const g = game.g;
  const t = driver(game).keepHands();
  t.label('Install False Lead').pick('t:new');
  g.state.corp.credits = 20;
  t.prefix('advance').prefix('advance');
  t.discardFirst();
  t.creditsOut('runner');
  t.prefix('advance');
  // simulate the Runner currently having clicks remaining — this ability is
  // normally usable anytime; our engine only offers scored-agenda actions
  // during the owner's own action loop (see CARD_COVERAGE.md). Must be set
  // before the score resolves so the freshly-built action menu reflects it.
  g.state.runner.clicks = 3;
  t.label('Score False Lead');
  const scoredId = lastEvent(game, 'agenda-scored').data.id;
  t.label('Forfeit False Lead');
  assert.equal(inst(g, scoredId).zone, 'removed');
  assert.equal(g.state.runner.clicks, 1);
}],

['Priority Requisition: score may rez an installed ice ignoring all costs', () => {
  const game = makeGame({ corpId: nbn, corp: [['Priority Requisition', 6], ['Ice Wall', 4]], runner: rFiller(10) });
  const g = game.g;
  const t = driver(game).keepHands();
  g.state.corp.credits = 20;
  t.label('Install Ice Wall').label('Protecting hq');
  const iwId = g.state.corp.servers.hq.ice[0];
  t.label('Install Priority Requisition').pick('t:new');
  const prId = g.state.corp.servers.remote1.content[0];
  inst(g, prId).advancement = 5;
  t.creditsOut('corp').discardFirst();
  t.creditsOut('runner');
  g.state.corp.credits = 0; // ice would normally cost 1cr to rez
  t.label('Score Priority Requisition');
  t.pick(`r:${iwId}`);
  assert.equal(inst(g, iwId).rezzed, true);
  assert.equal(g.state.corp.credits, 0);
}],

['Private Security Force: scored agenda gains a click ability to deal meat damage while the Runner is tagged', () => {
  const game = makeGame({ corpId: nbn, corp: [['Private Security Force', 6], ['Hedge Fund', 6]], runner: rFiller(10) });
  const g = game.g;
  const t = driver(game).keepHands();
  t.label('Install Private Security Force').pick('t:new');
  g.state.corp.credits = 20;
  t.prefix('advance').prefix('advance'); // turn 1: install (1 click) + 2 advances
  t.discardFirst();
  t.creditsOut('runner');
  t.prefix('advance').prefix('advance'); // turn 2: 2 more advances -> hits threshold (4)
  t.label('Score Private Security Force');
  assert.ok(!game.decision.options.some(o => o.label.includes('Do 1 meat damage')));
  g.state.runner.tags = 1;
  g.state.corp.clicks += 1; // grant a spare click purely to exercise the ability in this test
  t.pick('credit'); // rebuild the action menu now that the Runner is tagged
  assert.ok(game.decision.options.some(o => o.label.includes('Do 1 meat damage')));
  const handBefore = g.state.runner.hand.length;
  t.label('Do 1 meat damage');
  assert.equal(g.state.runner.hand.length, handBefore - 1);
}],

['Melange Mining Corp.: 3 clicks gains 7cr', () => {
  const game = makeGame({ corpId: nbn, corp: [['Melange Mining Corp.', 3], ['Hedge Fund', 6]], runner: rFiller(10) });
  const g = game.g;
  const t = driver(game).keepHands();
  t.label('Install Melange Mining Corp.').pick('t:new');
  t.pick(game.decision.options.find(o => o.id.startsWith('rez')).id);
  t.creditsOut('corp').discardFirst();
  t.creditsOut('runner');
  const credsBefore = g.state.corp.credits;
  const clicksBefore = g.state.corp.clicks;
  t.label('Gain 7 credits');
  assert.equal(g.state.corp.credits, credsBefore + 7);
  assert.equal(g.state.corp.clicks, clicksBefore - 3);
}],

['PAD Campaign: gains 1cr at the start of the Corp turn', () => {
  const game = makeGame({ corpId: nbn, corp: [['PAD Campaign', 6], ['Hedge Fund', 4]], runner: rFiller(10) });
  const g = game.g;
  const t = driver(game).keepHands();
  t.label('Install PAD Campaign').pick('t:new');
  t.pick(game.decision.options.find(o => o.id.startsWith('rez')).id);
  t.creditsOut('corp').discardFirst();
  t.creditsOut('runner');
  const gains = game.log.filter(e => e.type === 'credits-gained' && e.data.why === 'PAD Campaign');
  assert.equal(gains.length, 1);
  assert.equal(gains[0].data.n, 1);
}],

];
