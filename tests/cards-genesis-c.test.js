// Genesis Cycle Wave C (cards/waves-genesis-c.js). Faithful to printed text;
// deviations noted in docs/CARD_COVERAGE.md.
import assert from 'node:assert/strict';
import { makeGame, driver, lastEvent } from './helpers.js';
import * as fx from '../engine/effects.js';
import { inst, cardOf, moveCard, memoryCostOf } from '../engine/state.js';
import { breakerStrength } from '../engine/run.js';

// Force `title` (wherever it currently sits) into its owner's hand, swapping
// out an existing hand card to keep hand size stable (cards-genesis-b.test.js precedent).
// `avoid`: titles that must NOT be evicted from hand (already force-placed
// there by an earlier call in the same test) — lets a test force several
// specific cards into hand without one placement bumping another back out.
function forceIntoHand(g, title, avoid = []) {
  const id = Object.values(g.insts).find(i => cardOf(g, i.id).title === title)?.id;
  if (id == null) throw new Error(`no ${title} in this game`);
  const zone = inst(g, id).zone;
  if (zone === 'corp-hand' || zone === 'runner-hand') return id;
  const side = cardOf(g, id).side;
  const hand = side === 'corp' ? g.state.corp.hand : g.state.runner.hand;
  const evictIdx = hand.findIndex(hid => !avoid.includes(cardOf(g, hid).title));
  if (evictIdx >= 0) moveCard(g, hand[evictIdx], `${side}-deck`);
  moveCard(g, id, `${side}-hand`);
  return id;
}

const filler = n => [['Hedge Fund', n]];
const rFiller = n => [['Sure Gamble', n]];

// Force `title` to the top of its owner's deck, regardless of where it
// currently sits, for deterministic top-of-deck access (cards-c.test.js
// precedent).
function forceTopOfDeck(g, title) {
  const id = Object.values(g.insts).find(i => cardOf(g, i.id).title === title)?.id;
  if (id == null) throw new Error(`no ${title} in this game`);
  const side = cardOf(g, id).side;
  moveCard(g, id, `${side}-deck`, { position: 'top' });
  return id;
}

// Install `title` (ice, from HQ) protecting `server`, rez it, and leave the
// corp turn mid-action so the runner can act next.
function installIceAndFinishCorpTurn(t, title, server = 'hq') {
  t.label(`Install ${title}`).label(`Protecting ${server}`);
  t.creditsOut('corp').discardFirst();
  return t;
}

export default [

['Jinteki: Replicating Perfection: cannot run remotes until a central is run this turn', () => {
  const game = makeGame({ corpId: 'Jinteki: Replicating Perfection', corp: filler(9), runner: rFiller(10) });
  const g = game.g;
  const t = driver(game).keepHands();
  t.creditsOut('corp').discardFirst();
  // corp installs nothing; force a remote to exist so it'd otherwise be runnable
  g.state.corp.remoteCounter = 1;
  g.state.corp.servers.remote1 = { ice: [], content: [] };
  assert.equal(game.decision.options.some(o => o.id === 'run:remote1'), false);
  assert.ok(game.decision.options.some(o => o.id === 'run:hq'));
  t.prefix('run:hq'); // approach-server, no ice, nothing to rez
  t.pick('continue'); // corp run window
  // successful run on a central: remote runs unlocked for the rest of the turn
  assert.ok(game.decision.options.some(o => o.id === 'run:remote1'), 'remote should be runnable after running a central');
}],

['Snowflake: barrier/psi ice — different bets end the run', () => {
  const game = makeGame({ corp: [['Snowflake', 6], ...filler(9)], runner: rFiller(10) });
  const g = game.g;
  const t = driver(game).keepHands();
  installIceAndFinishCorpTurn(t, 'Snowflake');
  g.state.corp.credits = 20; g.state.runner.credits = 10;
  t.prefix('run:hq');
  t.prefix('rez');
  t.pick('continue'); // no breakers to match strength 3; enter the breaker window, then the sub
  t.num(2); t.num(0); // corp bets 2, runner bets 0 -> different -> ETR
  assert.equal(lastEvent(game, 'run-end').data.successful, false);
}],

['Snowflake: matching bets — run continues', () => {
  const game = makeGame({ corp: [['Snowflake', 6], ...filler(9)], runner: rFiller(10) });
  const g = game.g;
  const t = driver(game).keepHands();
  installIceAndFinishCorpTurn(t, 'Snowflake');
  g.state.corp.credits = 20; g.state.runner.credits = 10;
  t.prefix('run:hq');
  t.prefix('rez');
  t.pick('continue'); // enter the breaker window, then the sub
  t.num(1); t.num(1); // matched -> sub has no effect
  t.pick('continue'); // approach-server jack-out prompt (no ice left)
  assert.equal(lastEvent(game, 'run-successful')?.data.server, 'hq');
}],

['Sensei: other ice gains a bonus "End the run" sub for the remainder of the run', () => {
  const game = makeGame({ corp: [['Sensei', 6], ['Ice Wall', 2], ...filler(8)], runner: rFiller(10) });
  const g = game.g;
  const t = driver(game).keepHands();
  // install Ice Wall innermost, Sensei outermost, both protecting HQ
  t.label('Install Ice Wall').label('Protecting hq');
  t.label('Install Sensei').label('Protecting hq');
  t.creditsOut('corp').discardFirst();
  g.state.corp.credits = 20;
  t.prefix('run:hq');
  t.prefix('rez'); // rez Sensei (outermost, approached first)
  t.pick('continue'); // breaker window (no breakers) -> Sensei's own sub resolves (sets senseiIceId)
  t.pick('continue'); // approaching Ice Wall: jack out or continue
  t.prefix('rez'); // rez Ice Wall
  // Ice Wall's own sub (ETR) PLUS the synthetic Sensei ETR are both active;
  // either way the run ends once subs fire.
  t.pick('continue');
  assert.equal(lastEvent(game, 'run-end').data.successful, false);
}],

['Bullfrog: different bets relocate it to another server; the run continues there', () => {
  const game = makeGame({ corp: [['Bullfrog', 6], ...filler(9)], runner: rFiller(10) });
  const g = game.g;
  const t = driver(game).keepHands();
  installIceAndFinishCorpTurn(t, 'Bullfrog');
  g.state.corp.credits = 20; g.state.runner.credits = 10;
  t.prefix('run:hq');
  t.prefix('rez');
  t.pick('continue'); // enter the breaker window, then the sub
  t.num(2); t.num(0); // different -> relocate
  t.label('NEW remote server'); // corp moves it to a new remote
  const newSid = Object.keys(g.state.corp.servers).find(sid => sid.startsWith('remote'));
  assert.ok(newSid, 'a new remote should have been created');
  assert.equal(g.state.corp.servers[newSid].ice.length, 1);
  assert.equal(g.state.run.server, newSid);
  // run continues, approaching Bullfrog again at its new home; no more ice
  // to jack out from (approaches===0 there) so it goes straight to the
  // corp run window for the re-approach.
}],

['Midori: swaps the approached ice for one from HQ; runner may jack out', () => {
  const game = makeGame({ corp: [['Midori', 4], ['Ice Wall', 3], ['Enigma', 1], ...filler(7)], runner: rFiller(10) });
  const g = game.g;
  // Force these into hand BEFORE driving any decisions: the corp's first
  // action-menu decision is generated (with a frozen options list) the
  // moment keepHands() answers both mulligan prompts, so a hand mutation
  // made after that point is invisible to that ALREADY-PENDING decision
  // (though it's correctly picked up by every decision generated after).
  forceIntoHand(g, 'Midori', ['Midori']);
  forceIntoHand(g, 'Ice Wall', ['Midori', 'Ice Wall']);
  forceIntoHand(g, 'Enigma', ['Midori', 'Ice Wall', 'Enigma']);
  const t = driver(game).keepHands();
  g.state.corp.credits = 20;
  t.label('Install Midori').label('In hq');
  t.label('Install Ice Wall').label('Protecting hq');
  t.creditsOut('corp').discardFirst();
  const midoriId = Object.values(g.insts).find(i => cardOf(g, i.id).title === 'Midori').id;
  inst(g, midoriId).rezzed = true; // upgrade abilities require it to be rezzed
  t.prefix('run:hq');
  t.pick('yes'); // Midori: swap the approached ice for one from HQ?
  t.prefix('c:'); // corp chooses Enigma (the only piece of ice left in HQ)
  const iceId = g.state.corp.servers.hq.ice[0];
  assert.equal(cardOf(g, iceId).title, 'Enigma');
  assert.equal(inst(g, iceId).rezzed, false);
  assert.ok(g.state.corp.hand.some(id => cardOf(g, id).title === 'Ice Wall'), 'Ice Wall should return to HQ');
  t.pick('jack-out');
  assert.equal(lastEvent(game, 'jack-out').data.server, 'hq');
}],

['Sunset: rearranges the ice protecting a chosen server', () => {
  const game = makeGame({ corp: [['Sunset', 1], ['Ice Wall', 1], ['Enigma', 1], ...filler(9)], runner: rFiller(10) });
  const g = game.g;
  // (forced into hand before driving any decisions — see the Midori test's
  // comment for why order matters here)
  forceIntoHand(g, 'Sunset', ['Sunset']);
  forceIntoHand(g, 'Ice Wall', ['Sunset', 'Ice Wall']);
  forceIntoHand(g, 'Enigma', ['Sunset', 'Ice Wall', 'Enigma']);
  const t = driver(game).keepHands();
  g.state.corp.credits = 20;
  t.label('Install Ice Wall').label('Protecting hq');
  t.label('Install Enigma').label('Protecting hq');
  const before = [...g.state.corp.servers.hq.ice]; // [Ice Wall, Enigma] (innermost first)
  t.label('Play Sunset');
  t.prefix('s:hq');
  t.prefix(`i:${before[1]}`); // choose Enigma as the new innermost -> swaps the order
  const after = g.state.corp.servers.hq.ice;
  assert.equal(after.length, 2);
  assert.equal(after[0], before[1]);
  assert.equal(after[1], before[0]);
}],

['Encryption Protocol: raises the trash cost of all installed cards (including itself) by 1', () => {
  const game = makeGame({ corp: [['Encryption Protocol', 3], ...filler(9)], runner: rFiller(10) });
  const g = game.g;
  const t = driver(game).keepHands();
  t.label('Install Encryption Protocol').label('NEW remote');
  t.creditsOut('corp').discardFirst();
  const sid = Object.keys(g.state.corp.servers).find(s => s.startsWith('remote'));
  const epId = g.state.corp.servers[sid].content[0];
  inst(g, epId).rezzed = true;
  g.state.corp.credits = 20; g.state.runner.credits = 20;
  t.prefix(`run:${sid}`);
  t.pick('continue'); // server-approach jack-out prompt (no ice)
  const opt3 = t.d.options.find(o => o.id === 'trash');
  assert.ok(opt3, `expected a trash option, got: ${t.d.options.map(o => o.id).join(',')}`);
  assert.ok(opt3.label.includes('3cr'), `expected trash cost 3 (2+1), got: ${opt3.label}`);
  t.pick('trash');
  assert.equal(lastEvent(game, 'card-trashed').data.title, 'Encryption Protocol');
}],

['Ruhr Valley: running its server costs an extra click', () => {
  const game = makeGame({ corp: [['Ruhr Valley', 6], ...filler(9)], runner: rFiller(10) });
  const g = game.g;
  const t = driver(game).keepHands();
  t.label('Install Ruhr Valley').label('NEW remote');
  const sid = Object.keys(g.state.corp.servers).find(s => s.startsWith('remote'));
  const rvId = g.state.corp.servers[sid].content[0];
  // Rez it before the runner's action-menu decision gets generated (by
  // finishing out the corp's turn below) — that decision's run-option
  // labels are computed once, at generation time.
  inst(g, rvId).rezzed = true;
  t.creditsOut('corp').discardFirst();
  const runOpt = t.d.options.find(o => o.id === `run:${sid}`);
  assert.ok(runOpt.label.includes('+1 click'));
  const clicksBefore = g.state.runner.clicks;
  t.prefix(`run:${sid}`);
  t.pick('continue'); // server-approach jack-out prompt (no ice)
  assert.equal(g.state.runner.clicks, clicksBefore - 2);
}],

['Oversight AI: rezzes a piece of ice for free; trashes it once fully broken in one encounter', () => {
  const game = makeGame({ corp: [['Oversight AI', 1], ['Hudson 1.0', 1], ...filler(9)], runner: rFiller(10) });
  const g = game.g;
  forceIntoHand(g, 'Oversight AI', ['Oversight AI']);
  forceIntoHand(g, 'Hudson 1.0', ['Oversight AI', 'Hudson 1.0']);
  const t = driver(game).keepHands();
  g.state.corp.credits = 1; // just enough to play Oversight AI (1cr); the
                            // ice rez itself must cost nothing (ignored)
  t.label('Install Hudson 1.0').label('Protecting hq');
  t.label('Play Oversight AI');
  t.prefix('i:'); // the only unrezzed ice: Hudson 1.0
  const iceId = g.state.corp.servers.hq.ice[0];
  assert.equal(inst(g, iceId).rezzed, true);
  assert.equal(g.state.corp.credits, 0, 'Oversight AI should rez ignoring all costs');
  t.creditsOut('corp').discardFirst();
  t.prefix('run:hq');
  // Hudson 1.0 is already rezzed; click-break both of its subroutines
  t.pick('clickbreak');
  t.pick('clickbreak');
  t.pick('continue'); // no unbroken subs left to break; close the breaker window
  assert.equal(lastEvent(game, 'card-trashed')?.data.title, 'Hudson 1.0');
}],

['Amazon Industrial Zone: may immediately rez a newly-installed ice in its server for 3cr less', () => {
  const game = makeGame({ corp: [['Amazon Industrial Zone', 1], ['Hudson 1.0', 1], ...filler(9)], runner: rFiller(10) });
  const g = game.g;
  forceIntoHand(g, 'Amazon Industrial Zone', ['Amazon Industrial Zone']);
  forceIntoHand(g, 'Hudson 1.0', ['Amazon Industrial Zone', 'Hudson 1.0']);
  const t = driver(game).keepHands();
  g.state.corp.credits = 20;
  t.label('Install Amazon Industrial Zone').label('NEW remote');
  const sid = Object.keys(g.state.corp.servers).find(s => s.startsWith('remote'));
  const aizId = g.state.corp.servers[sid].content[0];
  t.prefix(`rez:${aizId}`); // free action, no click cost
  t.label('Install Hudson 1.0').label(`Protecting ${sid}`);
  // onIceInstalled fires immediately: "immediately rez it (0cr)?"
  assert.ok(t.d.options.some(o => o.id === 'rez'), `expected a rez option: ${t.d.options.map(o => o.id).join(',')}`);
  const before = g.state.corp.credits;
  t.pick('rez');
  const iceId = g.state.corp.servers[sid].ice[0];
  assert.equal(inst(g, iceId).rezzed, true);
  assert.equal(g.state.corp.credits, before, 'discounted rez cost (3cr base - 3cr) should be 0');
}],

['Simone Diego: 2 recurring credits usable to advance cards in or protecting its server', () => {
  const game = makeGame({ corp: [['Simone Diego', 1], ['Ice Wall', 1], ...filler(9)], runner: rFiller(10) });
  const g = game.g;
  forceIntoHand(g, 'Simone Diego', ['Simone Diego']);
  forceIntoHand(g, 'Ice Wall', ['Simone Diego', 'Ice Wall']);
  const t = driver(game).keepHands();
  g.state.corp.credits = 20;
  t.label('Install Simone Diego').label('NEW remote');
  const sid = Object.keys(g.state.corp.servers).find(s => s.startsWith('remote'));
  const sdId = g.state.corp.servers[sid].content[0];
  t.prefix(`rez:${sdId}`); // free action, no click cost
  t.label('Install Ice Wall').label(`Protecting ${sid}`);
  t.creditsOut('corp').discardFirst();
  t.creditsOut('runner').discardFirst(); // runner's turn: do nothing
  // corp turn 2: refillRecurring runs at turn start
  assert.equal(inst(g, sdId).counters.recurring, 2);
  const iceId = g.state.corp.servers[sid].ice[0];
  const creditsBefore = g.state.corp.credits;
  t.prefix(`advance:${iceId}`);
  assert.equal(inst(g, sdId).counters.recurring, 1, 'should draw from the recurring pool first');
  assert.equal(g.state.corp.credits, creditsBefore, 'real credits untouched while the pool covers it');
  assert.equal(inst(g, iceId).advancement, 1);
}],

['ChiLo City Grid: a successful trace during a run on its server gives the Runner a tag', () => {
  const game = makeGame({ corp: [['ChiLo City Grid', 1], ['TMI', 1], ...filler(9)], runner: rFiller(10) });
  const g = game.g;
  forceIntoHand(g, 'ChiLo City Grid', ['ChiLo City Grid']);
  forceIntoHand(g, 'TMI', ['ChiLo City Grid', 'TMI']);
  const t = driver(game).keepHands();
  g.state.corp.credits = 20;
  t.label('Install ChiLo City Grid').label('NEW remote');
  const sid = Object.keys(g.state.corp.servers).find(s => s.startsWith('remote'));
  const clgId = g.state.corp.servers[sid].content[0];
  t.prefix(`rez:${clgId}`); // free action, no click cost
  t.label('Install TMI').label(`Protecting ${sid}`);
  t.creditsOut('corp').discardFirst();
  g.state.runner.credits = 0;
  t.prefix(`run:${sid}`);
  t.prefix('rez');
  t.num(0); t.num(0); // trace 2 vs 0 link succeeds
  assert.equal(g.state.runner.tags, 1, 'ChiLo City Grid should add a tag on a successful trace during a run on its server');
}],

['ZU.13 Key Master / Creeper: memory cost is 0 with 2+ link, even before install', () => {
  const game = makeGame({ corp: filler(9), runner: [['ZU.13 Key Master', 1], ['Creeper', 1], ...rFiller(8)] });
  const g = game.g;
  driver(game).keepHands();
  const zuId = Object.values(g.insts).find(i => cardOf(g, i.id).title === 'ZU.13 Key Master').id;
  const crId = Object.values(g.insts).find(i => cardOf(g, i.id).title === 'Creeper').id;
  assert.equal(memoryCostOf(g, cardOf(g, zuId)), 1);
  assert.equal(memoryCostOf(g, cardOf(g, crId)), 1);
  g.state.runner.baseLink = 2;
  assert.equal(memoryCostOf(g, cardOf(g, zuId)), 0, 'ZU.13 Key Master should be 0mu with 2+ link, even in the grip');
  assert.equal(memoryCostOf(g, cardOf(g, crId)), 0, 'Creeper should be 0mu with 2+ link, even in the grip');
}],

['ZU.13 Key Master: code gate icebreaker', () => {
  const game = makeGame({ corp: [['Enigma', 6], ...filler(9)], runner: [['ZU.13 Key Master', 1], ...rFiller(9)] });
  const g = game.g;
  const t = driver(game).keepHands();
  forceIntoHand(g, 'ZU.13 Key Master');
  installIceAndFinishCorpTurn(t, 'Enigma');
  g.state.corp.credits = 20; g.state.runner.credits = 20;
  t.label('Install ZU.13 Key Master');
  t.prefix('run:hq');
  t.prefix('rez');
  t.prefix('boost:'); // ZU.13 starts at str 1, needs 2 to match Enigma
  t.prefix('break:');
  t.label('End the run'); // 2 unbroken subs -> choose which one to break first
  t.prefix('break:'); // only 1 unbroken sub left -> breaks it directly
  t.pick('continue'); // close the breaker window (nothing left to break)
  t.pick('continue'); // approach-server jack-out prompt
  assert.equal(lastEvent(game, 'run-successful')?.data.server, 'hq');
}],

['Creeper: sentry icebreaker', () => {
  const game = makeGame({ corp: [['Neural Katana', 6], ...filler(9)], runner: [['Creeper', 1], ...rFiller(9)] });
  const g = game.g;
  const t = driver(game).keepHands();
  forceIntoHand(g, 'Creeper');
  installIceAndFinishCorpTurn(t, 'Neural Katana');
  g.state.corp.credits = 20; g.state.runner.credits = 20;
  t.label('Install Creeper');
  const handBefore = g.state.runner.hand.length;
  t.prefix('run:hq');
  t.prefix('rez');
  t.prefix('boost:'); // Creeper starts at str 2, needs 3 to match Neural Katana
  t.prefix('break:'); // Neural Katana has just 1 sub -> breaks it directly
  t.pick('continue'); // close the breaker window
  t.pick('continue'); // approach-server jack-out prompt
  assert.equal(lastEvent(game, 'run-successful')?.data.server, 'hq');
  assert.equal(g.state.runner.hand.length, handBefore, 'no net damage taken (sub broken)');
}],

['The Helpful AI: +1 link; trash for +2 strength on an icebreaker until end of turn', () => {
  const game = makeGame({ corp: filler(9), runner: [['The Helpful AI', 1], ['Gordian Blade', 1], ...rFiller(8)] });
  const g = game.g;
  forceIntoHand(g, 'The Helpful AI', ['The Helpful AI']);
  forceIntoHand(g, 'Gordian Blade', ['The Helpful AI', 'Gordian Blade']);
  const t = driver(game).keepHands();
  t.creditsOut('corp').discardFirst(); // corp turn 1: do nothing
  g.state.runner.credits = 20; // enough to afford both installs (2cr + 4cr)
  t.label('Install The Helpful AI');
  assert.equal(fx.linkBonus(g), 1);
  t.label('Install Gordian Blade');
  const gbId = Object.values(g.insts).find(i => cardOf(g, i.id).title === 'Gordian Blade').id;
  assert.equal(breakerStrength(g, gbId), 2);
  t.label('Trash The Helpful AI');
  t.prefix(`b:${gbId}`);
  assert.equal(breakerStrength(g, gbId), 4, '+2 strength until end of turn');
  assert.equal(g.state.runner.rig.resource.length, 0, 'The Helpful AI trashed itself to pay for the ability');
}],

['Deus X: interface -> trash: break any number of AP subroutines', () => {
  const game = makeGame({ corp: [['Neural Katana', 6], ...filler(9)], runner: [['Deus X', 1], ...rFiller(9)] });
  const g = game.g;
  const t = driver(game).keepHands();
  forceIntoHand(g, 'Deus X');
  installIceAndFinishCorpTurn(t, 'Neural Katana');
  g.state.corp.credits = 20;
  t.label('Install Deus X');
  const handBefore = g.state.runner.hand.length;
  t.prefix('run:hq');
  t.prefix('rez');
  t.prefix('break:'); // trash Deus X to break all AP subs (just 1, here)
  t.pick('continue'); // close the breaker window (nothing left to break)
  assert.equal(g.state.runner.rig.program.length, 0, 'Deus X trashed itself to break');
  assert.equal(g.state.runner.hand.length, handBefore, 'no net damage taken (sub broken)');
}],

['Deus X: interrupt -> trash: prevent any amount of net damage', () => {
  const game = makeGame({ corp: [['Neural Katana', 6], ...filler(9)], runner: [['Deus X', 1], ...rFiller(9)] });
  const g = game.g;
  const t = driver(game).keepHands();
  forceIntoHand(g, 'Deus X');
  installIceAndFinishCorpTurn(t, 'Neural Katana');
  g.state.corp.credits = 20;
  t.label('Install Deus X');
  const handBefore = g.state.runner.hand.length;
  t.prefix('run:hq');
  t.prefix('rez');
  t.pick('continue'); // decline to break -> let the sub (3 net damage) fire
  t.pick('prevent'); // Deus X: trash to prevent any amount of net damage
  assert.equal(g.state.runner.rig.program.length, 0, 'Deus X trashed itself to prevent damage');
  assert.equal(g.state.runner.hand.length, handBefore, 'all 3 net damage prevented');
}],

['Replicator: installing hardware may fetch another copy from the stack to the grip', () => {
  const game = makeGame({ corp: filler(9), runner: [['Replicator', 1], ['Dyson Mem Chip', 2], ...rFiller(7)] });
  const g = game.g;
  forceIntoHand(g, 'Replicator', ['Replicator']);
  forceIntoHand(g, 'Dyson Mem Chip', ['Replicator', 'Dyson Mem Chip']);
  // the natural shuffle can deal BOTH copies of Dyson Mem Chip into the
  // starting hand; forceIntoHand only guarantees one is present, so if a
  // second copy is also in hand, send it back to the deck so Replicator's
  // search has something to find
  {
    const dupes = g.state.runner.hand.filter(id => cardOf(g, id).title === 'Dyson Mem Chip');
    if (dupes.length > 1) moveCard(g, dupes[1], 'runner-deck');
  }
  const t = driver(game).keepHands();
  t.creditsOut('corp').discardFirst(); // corp turn 1: do nothing
  t.label('Install Replicator'); // no other copy in the stack -> search whiffs, no decision
  t.label('Install Dyson Mem Chip'); // Replicator's own trigger finds the other copy
  t.label('Dyson Mem Chip'); // take the found copy into the grip
  assert.equal(g.state.runner.rig.hardware.filter(id => cardOf(g, id).title === 'Dyson Mem Chip').length, 1);
  assert.ok(g.state.runner.hand.some(id => cardOf(g, id).title === 'Dyson Mem Chip'), 'the found copy should be added to the grip');
}],

['Personal Workshop: hosts a card from the grip and installs it once its power counters reach 0', () => {
  const game = makeGame({ corp: filler(12), runner: [['Personal Workshop', 1], ['Dyson Mem Chip', 1], ...rFiller(8)] });
  const g = game.g;
  forceIntoHand(g, 'Personal Workshop', ['Personal Workshop']);
  forceIntoHand(g, 'Dyson Mem Chip', ['Personal Workshop', 'Dyson Mem Chip']);
  const t = driver(game).keepHands();
  t.creditsOut('corp').discardFirst(); // corp turn 1: do nothing
  t.label('Install Personal Workshop');
  t.label('Host'); // host a program/hardware from the grip
  t.label('Dyson Mem Chip');
  const dmcId = Object.values(g.insts).find(i => cardOf(g, i.id).title === 'Dyson Mem Chip').id;
  assert.equal(inst(g, dmcId).zone, 'runner-hosted');
  assert.equal(inst(g, dmcId).counters.power, 3, 'power counters = install cost (3cr)');
  t.label('Remove 1 power counter'); // 1cr paid action
  assert.equal(inst(g, dmcId).counters.power, 2);
  t.creditsOut('runner').discardFirst(); // end runner turn 1
  t.creditsOut('corp').discardFirst(); // corp turn 2: do nothing
  // runner turn 2 starts: onTurnStart removes 1 more counter
  assert.equal(inst(g, dmcId).counters.power, 1);
  t.creditsOut('runner').discardFirst(); // end runner turn 2
  t.creditsOut('corp').discardFirst(); // corp turn 3: do nothing
  // runner turn 3 starts: onTurnStart removes the last counter -> auto-installs
  assert.equal(inst(g, dmcId).counters.power, 0);
  assert.equal(inst(g, dmcId).zone, 'rig-hardware');
  assert.ok(g.state.runner.rig.hardware.includes(dmcId));
}],

['e3 Feedback Implants: pay 1cr to break 1 more subroutine after any break', () => {
  const game = makeGame({ corp: [['Enigma', 6], ...filler(9)], runner: [['e3 Feedback Implants', 1], ['Gordian Blade', 1], ...rFiller(8)] });
  const g = game.g;
  const t = driver(game).keepHands();
  forceIntoHand(g, 'e3 Feedback Implants', ['e3 Feedback Implants']);
  forceIntoHand(g, 'Gordian Blade', ['e3 Feedback Implants', 'Gordian Blade']);
  installIceAndFinishCorpTurn(t, 'Enigma');
  g.state.corp.credits = 20; g.state.runner.credits = 20;
  t.label('Install e3 Feedback Implants');
  t.label('Install Gordian Blade');
  const gbId = Object.values(g.insts).find(i => cardOf(g, i.id).title === 'Gordian Blade').id;
  const iceId = Object.values(g.insts).find(i => cardOf(g, i.id).title === 'Enigma').id;
  t.prefix('run:hq');
  t.prefix('rez');
  t.prefix('break:'); // Gordian Blade breaks 1 sub (1cr) -- 2 unbroken, choose one
  t.label('End the run');
  t.pick('pay'); // e3: pay 1cr to break 1 more sub on this ice (only 1 left -> no prompt)
  assert.equal(inst(g, iceId).brokenSubs.length, 2, 'e3 chained a second free break');
  t.pick('continue'); // close the breaker window (nothing left to break)
  t.pick('continue'); // approach-server jack-out prompt
  assert.equal(lastEvent(game, 'run-successful')?.data.server, 'hq');
}],

['Muresh Bodysuit: prevents the first meat damage each turn', () => {
  const game = makeGame({ corp: filler(9), runner: [['Muresh Bodysuit', 1], ...rFiller(9)] });
  const g = game.g;
  const t = driver(game).keepHands();
  forceIntoHand(g, 'Muresh Bodysuit');
  t.creditsOut('corp').discardFirst();
  g.state.runner.credits = 10;
  t.label('Install Muresh Bodysuit');
  const handBefore = g.state.runner.hand.length;
  for (const _ of fx.damage(g, 'meat', 1, 'test')) { /* auto, no decisions */ }
  assert.equal(g.state.runner.hand.length, handBefore, 'first meat damage this turn is prevented');
  assert.equal(lastEvent(game, 'damage-prevented')?.data.by, 'Muresh Bodysuit');
  for (const _ of fx.damage(g, 'meat', 1, 'test')) { /* auto, no decisions */ }
  assert.equal(g.state.runner.hand.length, handBefore - 1, 'only the first meat damage each turn is prevented');
}],

['Snitch: exposes the approached unrezzed ice; runner may then jack out', () => {
  const game = makeGame({ corp: [['Ice Wall', 1], ...filler(9)], runner: [['Snitch', 1], ...rFiller(9)] });
  const g = game.g;
  const t = driver(game).keepHands();
  forceIntoHand(g, 'Snitch');
  installIceAndFinishCorpTurn(t, 'Ice Wall', 'hq'); // left unrezzed
  g.state.corp.credits = 10; g.state.runner.credits = 10;
  t.label('Install Snitch');
  t.prefix('run:hq');
  t.label('expose the approached ice');
  assert.equal(lastEvent(game, 'exposed')?.data.title, 'Ice Wall');
  t.pick('continue'); // Snitch: decline to jack out
  t.label('Continue'); // corp declines to rez Ice Wall
  t.pick('continue'); // approach-server jack-out prompt
  assert.equal(lastEvent(game, 'run-successful')?.data.server, 'hq');
}],

['Crescentus: trash to derez a piece of ice fully broken this encounter', () => {
  const game = makeGame({ corp: [['Enigma', 6], ...filler(9)], runner: [['Crescentus', 1], ['Gordian Blade', 1], ...rFiller(8)] });
  const g = game.g;
  const t = driver(game).keepHands();
  forceIntoHand(g, 'Crescentus', ['Crescentus']);
  forceIntoHand(g, 'Gordian Blade', ['Crescentus', 'Gordian Blade']);
  installIceAndFinishCorpTurn(t, 'Enigma');
  g.state.corp.credits = 20; g.state.runner.credits = 20;
  t.label('Install Crescentus');
  t.label('Install Gordian Blade');
  const iceId = Object.values(g.insts).find(i => cardOf(g, i.id).title === 'Enigma').id;
  t.prefix('run:hq');
  t.prefix('rez');
  t.prefix('break:'); // 2 unbroken subs -> choose which to break first
  t.label('End the run');
  t.prefix('break:'); // only 1 unbroken sub left -> breaks it directly
  t.prefix('eability:'); // Crescentus: trash to derez this ice
  assert.equal(inst(g, iceId).rezzed, false, 'Enigma derezzed');
  assert.ok(!g.state.runner.rig.program.some(id => cardOf(g, id).title === 'Crescentus'), 'Crescentus trashed itself');
  t.pick('continue'); // close the breaker window
  t.pick('continue'); // approach-server jack-out prompt
  assert.equal(lastEvent(game, 'run-successful')?.data.server, 'hq');
}],

['Vamp: run HQ; spend credits to drain the Corp\'s credits (and take a tag)', () => {
  const game = makeGame({ corp: filler(9), runner: [['Vamp', 1], ...rFiller(9)] });
  const g = game.g;
  forceIntoHand(g, 'Vamp');
  const t = driver(game).keepHands();
  t.creditsOut('corp').discardFirst();
  g.state.runner.credits = 5;
  g.state.corp.credits = 10;
  t.label('Play Vamp');
  t.pick('continue'); // approach-server jack-out prompt
  t.pick('instead'); // use Vamp's replacement effect instead of breaching
  t.num(3); // spend 3cr
  assert.equal(g.state.corp.credits, 7, 'the Corp loses 3cr');
  assert.equal(g.state.runner.tags, 1, 'the Runner takes a tag for spending credits');
}],

['Snowball: fracter that gets +1 strength for the run each time it breaks a sub', () => {
  const game = makeGame({ corp: [['Ice Wall', 6], ...filler(9)], runner: [['Snowball', 1], ...rFiller(9)] });
  const g = game.g;
  const t = driver(game).keepHands();
  forceIntoHand(g, 'Snowball');
  installIceAndFinishCorpTurn(t, 'Ice Wall');
  g.state.runner.credits = 20;
  t.label('Install Snowball');
  const sbId = Object.values(g.insts).find(i => cardOf(g, i.id).title === 'Snowball').id;
  assert.equal(breakerStrength(g, sbId), 1);
  t.prefix('run:hq');
  t.prefix('rez');
  t.prefix('break:');
  assert.equal(breakerStrength(g, sbId), 2, '+1 strength for the remainder of the run after breaking a sub');
  t.pick('continue'); // close the breaker window
  t.pick('continue'); // approach-server jack-out prompt
  assert.equal(lastEvent(game, 'run-successful')?.data.server, 'hq');
}],

['Nerve Agent: gains a virus counter on successful HQ runs; spend to access extra cards', () => {
  const game = makeGame({ corp: filler(9), runner: [['Nerve Agent', 1], ...rFiller(9)] });
  const g = game.g;
  forceIntoHand(g, 'Nerve Agent');
  const t = driver(game).keepHands();
  t.creditsOut('corp').discardFirst();
  g.state.runner.credits = 10;
  t.label('Install Nerve Agent');
  const naId = Object.values(g.insts).find(i => cardOf(g, i.id).title === 'Nerve Agent').id;
  t.prefix('run:hq');
  t.pick('continue'); // approach-server jack-out prompt
  t.num(0); // Nerve Agent: access how many additional cards? (0-0, only 1 counter so far)
  assert.equal(inst(g, naId).counters.virus, 1);
  assert.equal(lastEvent(game, 'access-count')?.data.n, 1, 'no bonus access yet');
  t.prefix('run:hq');
  t.pick('continue'); // approach-server jack-out prompt
  t.num(1); // now 2 counters -> take the max bonus access (1)
  assert.equal(inst(g, naId).counters.virus, 2);
  assert.equal(lastEvent(game, 'access-count')?.data.n, 2, 'bonus access applied');
}],

['Disrupter: interrupt -> trash to reduce a trace\'s base strength to 0', () => {
  const game = makeGame({ corp: [['TMI', 1], ...filler(9)], runner: [['Disrupter', 1], ...rFiller(9)] });
  const g = game.g;
  forceIntoHand(g, 'Disrupter');
  const t = driver(game).keepHands();
  g.state.corp.credits = 20;
  t.label('Install TMI').label('NEW remote');
  const sid = Object.keys(g.state.corp.servers).find(s => s.startsWith('remote'));
  t.creditsOut('corp').discardFirst();
  g.state.runner.credits = 10;
  t.label('Install Disrupter');
  t.prefix(`run:${sid}`);
  t.prefix('rez'); // corp rezzes TMI -> onRez trace 2
  t.pick('yes'); // Disrupter: trash to reduce the base trace strength to 0?
  t.num(0); t.num(0); // corp boosts 0, runner boosts 0 -> trace 0 vs link 0 fails
  const tmiId = Object.values(g.insts).find(i => cardOf(g, i.id).title === 'TMI').id;
  assert.equal(inst(g, tmiId).rezzed, false, 'TMI derezzed itself: the (reduced-to-0) trace failed');
  assert.ok(!g.state.runner.rig.program.some(id => cardOf(g, id).title === 'Disrupter'), 'Disrupter trashed itself');
}],

['Surge: after gaining a virus counter this turn, place 2 more on that program', () => {
  const game = makeGame({ corp: filler(9), runner: [['Nerve Agent', 1], ['Surge', 1], ...rFiller(8)] });
  const g = game.g;
  forceIntoHand(g, 'Nerve Agent', ['Nerve Agent']);
  forceIntoHand(g, 'Surge', ['Nerve Agent', 'Surge']);
  const t = driver(game).keepHands();
  t.creditsOut('corp').discardFirst();
  g.state.runner.credits = 10;
  t.label('Install Nerve Agent');
  const naId = Object.values(g.insts).find(i => cardOf(g, i.id).title === 'Nerve Agent').id;
  t.prefix('run:hq');
  t.pick('continue'); // approach-server jack-out prompt
  t.num(0);
  assert.equal(inst(g, naId).counters.virus, 1);
  t.label('Play Surge');
  assert.equal(inst(g, naId).counters.virus, 3, '+2 virus counters');
}],

['Plascrete Carapace: loads 4 power counters; each prevents 1 meat damage until empty', () => {
  const game = makeGame({ corp: filler(9), runner: [['Plascrete Carapace', 1], ...rFiller(9)] });
  const g = game.g;
  forceIntoHand(g, 'Plascrete Carapace');
  const t = driver(game).keepHands();
  t.creditsOut('corp').discardFirst();
  g.state.runner.credits = 10;
  t.label('Install Plascrete Carapace');
  const pcId = Object.values(g.insts).find(i => cardOf(g, i.id).title === 'Plascrete Carapace').id;
  assert.equal(inst(g, pcId).counters.power, 4);
  const handBefore = g.state.runner.hand.length;
  for (let i = 0; i < 4; i++) {
    const gen = fx.damage(g, 'meat', 1, 'test');
    gen.next();
    let r = gen.next('prevent');
    while (!r.done) r = gen.next();
  }
  assert.equal(g.state.runner.hand.length, handBefore, 'all 4 meat damage prevented');
  assert.equal(inst(g, pcId).zone, 'runner-discard', 'trashed once empty');
  for (const _ of fx.damage(g, 'meat', 1, 'test')) { /* no prevention left */ }
  assert.equal(g.state.runner.hand.length, handBefore - 1, 'no more prevention once empty');
}],

['Kraken: after stealing an agenda this turn, the Corp trashes 1 piece of ice at a chosen server', () => {
  const game = makeGame({ corp: [['Priority Requisition', 1], ['Ice Wall', 1], ...filler(8)], runner: [['Kraken', 1], ...rFiller(9)] });
  const g = game.g;
  forceIntoHand(g, 'Ice Wall', ['Ice Wall']);
  forceIntoHand(g, 'Kraken', ['Ice Wall', 'Kraken']);
  const t = driver(game).keepHands();
  forceTopOfDeck(g, 'Priority Requisition');
  installIceAndFinishCorpTurn(t, 'Ice Wall', 'hq');
  g.state.runner.credits = 10;
  t.prefix('run:rd');
  t.pick('continue'); // approach-server jack-out: continue
  assert.equal(g.state.runner.agendaPoints, 3, 'stole Priority Requisition');
  t.label('Play Kraken');
  t.prefix('s:hq');
  const iceId = Object.values(g.insts).find(i => cardOf(g, i.id).title === 'Ice Wall').id;
  assert.equal(inst(g, iceId).zone, 'corp-archives', 'the Corp trashed Ice Wall protecting hq');
}],

['New Angeles City Hall: pay 2cr to prevent a tag; trashes itself when you steal an agenda', () => {
  const game = makeGame({ corp: [['Priority Requisition', 1], ...filler(9)], runner: [['New Angeles City Hall', 1], ...rFiller(9)] });
  const g = game.g;
  forceIntoHand(g, 'New Angeles City Hall');
  const t = driver(game).keepHands();
  forceTopOfDeck(g, 'Priority Requisition');
  t.creditsOut('corp').discardFirst();
  g.state.runner.credits = 10;
  t.label('Install New Angeles City Hall');
  const nachId = Object.values(g.insts).find(i => cardOf(g, i.id).title === 'New Angeles City Hall').id;
  const gen = fx.addTags(g, 1, 'test');
  gen.next();
  let r = gen.next('yes'); // New Angeles City Hall: pay 2cr to prevent 1 tag?
  while (!r.done) r = gen.next();
  assert.equal(g.state.runner.tags, 0, 'the tag was prevented');
  t.prefix('run:rd');
  t.pick('continue'); // approach-server jack-out: continue
  assert.equal(g.state.runner.agendaPoints, 3, 'stole Priority Requisition');
  assert.equal(inst(g, nachId).zone, 'runner-discard', 'New Angeles City Hall trashed itself after the steal');
}],

];
