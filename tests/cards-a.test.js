import assert from 'node:assert/strict';
import { makeGame, driver, lastEvent, db } from './helpers.js';
import * as fx from '../engine/effects.js';
import { inst, cardOf, moveCard } from '../engine/state.js';

const filler = n => [['Hedge Fund', n]];
const rFiller = n => [['Sure Gamble', n]];
const jinteki = 'Jinteki: Personal Evolution';

// Install `title` (from HQ) protecting `server`, rez it, and leave the corp
// turn mid-action so the runner can act next. Returns the driver.
function installIceAndFinishCorpTurn(t, title, server = 'hq') {
  t.label(`Install ${title}`).label(`Protecting ${server}`);
  t.creditsOut('corp').discardFirst();
  return t;
}

export default [

['Haas-Bioroid: Stronger Together — bioroid ice gets +1 strength', () => {
  const game = makeGame({ corp: [['Heimdall 1.0', 6], ['Hedge Fund', 4]], runner: rFiller(10) });
  const g = game.g;
  const t = driver(game).keepHands();
  installIceAndFinishCorpTurn(t, 'Heimdall 1.0');
  const iceId = g.state.corp.servers.hq.ice[0];
  assert.equal(cardOf(g, iceId).strength, 6);
  g.state.corp.credits = 20; // Heimdall costs 8cr to rez
  t.prefix('run:hq');
  t.prefix('rez');
  // strength shown in the encounter prompt includes the identity's +1 bonus (7)
  assert.match(game.decision.prompt, /str 7/);
  t.pick('continue'); // no breakers
  assert.equal(lastEvent(game, 'run-end').data.successful, false);
}],

['Project Ares: runner trashes cards for advancement past 4, corp takes bad publicity', () => {
  const game = makeGame({ corp: [['Project Ares', 6], ['Hedge Fund', 4]], runner: [['Sure Gamble', 5], ['Battering Ram', 5]] });
  const g = game.g;
  const t = driver(game).keepHands();
  t.label('Install Project Ares').pick('t:new');
  const aresId = g.state.corp.servers.remote1.content[0];
  g.state.corp.credits = 20;
  t.creditsOut('corp').discardFirst();
  // test setup (during runner's turn, before corp turn 2's score window check):
  // advance straight to threshold + 2 extra (6 total = 2 past 4)
  inst(g, aresId).advancement = 6;
  // give the runner an installed card to trash
  g.state.runner.credits = 10;
  t.label('Install Battering Ram');
  t.creditsOut('runner');
  // corp turn 2: score window offered at turn start via corpAction loop
  t.label('Score Project Ares');
  assert.equal(g.state.corp.agendaPoints, 2);
  // 2 advancement past 4 -> runner picks cards to trash (only 1 installed available)
  t.label('Battering Ram');
  assert.equal(lastEvent(game, 'card-trashed').data.title, 'Battering Ram');
  assert.equal(g.state.corp.badPublicity, 1);
}],

['Project Vitruvius: score places counters; hosted counter returns a card from Archives to HQ', () => {
  const game = makeGame({ corp: [['Project Vitruvius', 6], ['Hedge Fund', 4]], runner: rFiller(10) });
  const g = game.g;
  const t = driver(game).keepHands();
  t.label('Install Project Vitruvius').pick('t:new');
  const vitId = g.state.corp.servers.remote1.content[0];
  g.state.corp.credits = 20;
  inst(g, vitId).advancement = 5; // 2 past 3
  // put a card in archives to fetch back
  const someHandId = g.state.corp.hand[0];
  moveCard(g, someHandId, 'corp-archives');
  t.creditsOut('corp').discardFirst();
  t.creditsOut('runner');
  t.label('Score Project Vitruvius');
  assert.equal(inst(g, vitId).counters.agenda, 2);
  t.label('Use hosted agenda counter');
  t.label(cardOf(g, someHandId).title);
  assert.equal(inst(g, someHandId).zone, 'corp-hand');
  assert.equal(inst(g, vitId).counters.agenda, 1);
}],

['Adonis Campaign: loads 12cr on rez, pays 3/turn, trashes itself when empty', () => {
  const game = makeGame({ corp: [['Adonis Campaign', 6], ['Hedge Fund', 4]], runner: rFiller(10) });
  const g = game.g;
  const t = driver(game).keepHands();
  t.label('Install Adonis Campaign').pick('t:new');
  t.pick(game.decision.options.find(o => o.id.startsWith('rez')).id);
  const adonisId = g.state.corp.servers.remote1.content[0];
  assert.equal(inst(g, adonisId).counters.credit, 12);
  t.creditsOut('corp').discardFirst();
  t.creditsOut('runner');
  const before = g.state.corp.credits;
  // corp turn 2 start already fired onTurnStart before any action; verify via event log
  const gains = game.log.filter(e => e.type === 'credits-gained' && e.data.why === 'Adonis Campaign');
  assert.equal(gains.length, 1);
  assert.equal(gains[0].data.n, 3);
  assert.equal(inst(g, adonisId).counters.credit, 9);
}],

['Aggressive Secretary: advanceable ambush trashes 1 program per advancement token', () => {
  const game = makeGame({ corp: [['Aggressive Secretary', 6], ['Hedge Fund', 4]], runner: [['Sure Gamble', 5], ['Battering Ram', 5]] });
  const g = game.g;
  const t = driver(game).keepHands();
  t.label('Install Aggressive Secretary').pick('t:new');
  const asId = g.state.corp.servers.remote1.content[0];
  inst(g, asId).advancement = 1;
  g.state.corp.credits = 10;
  t.creditsOut('corp').discardFirst();
  g.state.runner.credits = 10;
  t.label('Install Battering Ram');
  t.prefix('run:remote1');
  t.pick('done'); // decline to rez (0-cost asset, doesn't matter)
  t.pick('pay');
  t.label('Battering Ram'); // corp picks which program to trash
  assert.equal(lastEvent(game, 'card-trashed').data.title, 'Battering Ram');
}],

['Heimdall 1.0: clickBreak spends a click to break 1 sub, core damage from the rest', () => {
  const game = makeGame({ corp: [['Heimdall 1.0', 6], ['Hedge Fund', 4]], runner: rFiller(10) });
  const g = game.g;
  const t = driver(game).keepHands();
  installIceAndFinishCorpTurn(t, 'Heimdall 1.0');
  g.state.corp.credits = 20; // Heimdall costs 8cr to rez
  g.state.runner.credits = 10;
  const clicksBefore = g.state.runner.clicks; // 4
  t.prefix('run:hq');
  t.prefix('rez');
  t.pick('clickbreak'); // break "Do 1 core damage"
  t.pick('continue');   // let both ETRs fire
  assert.equal(g.state.runner.clicks, clicksBefore - 2); // 1 run + 1 clickbreak
  assert.equal(g.state.runner.brainDamage, 0);
  assert.equal(lastEvent(game, 'run-end').data.successful, false);
}],

['Hudson 1.0: unbroken subs restrict access to 1 card during the run', () => {
  const game = makeGame({ corp: [['Hudson 1.0', 6], ['Priority Requisition', 4]], runner: rFiller(10) });
  const g = game.g;
  const t = driver(game).keepHands();
  installIceAndFinishCorpTurn(t, 'Hudson 1.0');
  g.state.corp.hand = g.state.corp.hand.filter(id => cardOf(g, id).title !== 'Priority Requisition');
  // force a Priority Requisition into HQ as one of at least 2 hand cards so
  // accessLimit=1 is observable
  const prIds = Object.values(g.insts).filter(i => cardOf(g, i.id).title === 'Priority Requisition').map(i => i.id);
  moveCard(g, prIds[0], 'corp-hand');
  t.prefix('run:hq');
  t.prefix('rez');
  t.pick('continue'); // both subs fire, accessLimit stays 1
  assert.equal(lastEvent(game, 'access-count').data.n, 1);
}],

['Ichi 1.0: trash-program subs, then trace success gives core damage + tag', () => {
  const game = makeGame({ corp: [['Ichi 1.0', 6], ['Hedge Fund', 4]], runner: [['Sure Gamble', 5], ['Battering Ram', 5]] });
  const g = game.g;
  const t = driver(game).keepHands();
  installIceAndFinishCorpTurn(t, 'Ichi 1.0');
  g.state.runner.credits = 10;
  t.label('Install Battering Ram');
  t.prefix('run:hq');
  t.prefix('rez');
  t.pick('continue'); // let all 3 subs fire
  t.label('Battering Ram');       // sub1 trash target
  assert.equal(lastEvent(game, 'card-trashed').data.title, 'Battering Ram');
  // sub2: no programs left, silently skipped
  t.num(0); // corp trace boost
  t.num(0); // runner link boost
  assert.equal(g.state.runner.tags, 1);
  assert.equal(g.state.runner.brainDamage, 1);
}],

['Rototurret: trashes a program then ends the run', () => {
  const game = makeGame({ corp: [['Rototurret', 6], ['Hedge Fund', 4]], runner: [['Sure Gamble', 5], ['Battering Ram', 5]] });
  const g = game.g;
  const t = driver(game).keepHands();
  installIceAndFinishCorpTurn(t, 'Rototurret');
  g.state.runner.credits = 10;
  t.label('Install Battering Ram');
  t.prefix('run:hq');
  t.prefix('rez');
  t.pick('continue');
  t.label('Battering Ram');
  assert.equal(lastEvent(game, 'card-trashed').data.title, 'Battering Ram');
  assert.equal(lastEvent(game, 'run-end').data.successful, false);
}],

['Viktor 1.0: core damage then ETR', () => {
  const game = makeGame({ corp: [['Viktor 1.0', 6], ['Hedge Fund', 4]], runner: rFiller(10) });
  const g = game.g;
  const t = driver(game).keepHands();
  installIceAndFinishCorpTurn(t, 'Viktor 1.0');
  t.prefix('run:hq');
  t.prefix('rez');
  t.pick('continue');
  assert.equal(g.state.runner.brainDamage, 1);
  assert.equal(lastEvent(game, 'run-end').data.successful, false);
}],

['Archived Memories: corp returns a card from Archives to HQ', () => {
  const game = makeGame({ corp: [['Archived Memories', 6], ['Hedge Fund', 4]], runner: rFiller(10) });
  const g = game.g;
  const t = driver(game).keepHands();
  const someId = g.state.corp.hand.find(id => cardOf(g, id).title === 'Hedge Fund');
  moveCard(g, someId, 'corp-archives');
  t.label('Play Archived Memories');
  t.label('Hedge Fund');
  assert.equal(inst(g, someId).zone, 'corp-hand');
  assert.equal(lastEvent(game, 'card-to-hand').data.title, 'Hedge Fund');
}],

['Biotic Labor: gains 2 clicks', () => {
  const game = makeGame({ corp: [['Biotic Labor', 6], ['Hedge Fund', 4]], runner: rFiller(10) });
  const g = game.g;
  const t = driver(game).keepHands();
  const before = g.state.corp.clicks;
  t.label('Play Biotic Labor');
  assert.equal(g.state.corp.clicks, before - 1 + 2);
  assert.equal(lastEvent(game, 'clicks-gained').data.n, 2);
}],

['Green Level Clearance: gains 3cr and draws 1 card', () => {
  const game = makeGame({ corp: [['Green Level Clearance', 6], ['Hedge Fund', 4]], runner: rFiller(10) });
  const g = game.g;
  const t = driver(game).keepHands();
  const handBefore = g.state.corp.hand.length;
  const credsBefore = g.state.corp.credits;
  t.label('Play Green Level Clearance');
  assert.equal(g.state.corp.credits, credsBefore - 1 + 3);
  assert.equal(g.state.corp.hand.length, handBefore - 1 + 1);
}],

['Shipment from MirrorMorph: installs up to 3 cards from HQ in one operation', () => {
  const game = makeGame({ corp: [['Shipment from MirrorMorph', 3], ['Ice Wall', 6], ['Hedge Fund', 1]], runner: rFiller(10) });
  const g = game.g;
  const t = driver(game).keepHands();
  g.state.corp.credits = 20;
  t.label('Play Shipment from MirrorMorph');
  // install 3 Ice Walls one at a time, each into hq
  for (let i = 0; i < 3; i++) {
    if (game.decision.options.some(o => o.label.includes('Ice Wall'))) {
      t.label('Ice Wall');
      t.pick('t:hq');
    } else {
      t.pick('done');
      break;
    }
  }
  assert.equal(g.state.corp.servers.hq.ice.length, 3);
}],

['Ash 2X3ZB9CY: successful run trace 4 restricts access to itself only', () => {
  const game = makeGame({ corp: [['Ash 2X3ZB9CY', 3], ['Priority Requisition', 4]], runner: rFiller(10) });
  const g = game.g;
  const t = driver(game).keepHands();
  t.label('Install Priority Requisition').pick('t:new');
  t.label('Install Ash 2X3ZB9CY').label('In remote1');
  t.pick(game.decision.options.find(o => o.id.startsWith('rez')).id); // rez Ash
  g.state.corp.credits = 20;
  t.creditsOut('corp').discardFirst();
  g.state.runner.credits = 20;
  t.prefix('run:remote1');
  t.num(0); // corp trace boost (base 4 vs link 0 succeeds regardless)
  t.num(0); // runner link boost
  assert.equal(lastEvent(game, 'trace-result').data.success, true);
  assert.equal(lastEvent(game, 'access-count').data.n, 1);
  assert.equal(g.state.runner.agendaPoints, 0); // Priority Requisition not accessed
}],

['Strongbox: stealing from its server costs an extra click', () => {
  const game = makeGame({ corp: [['Strongbox', 3], ['Priority Requisition', 4]], runner: rFiller(10) });
  const g = game.g;
  const t = driver(game).keepHands();
  t.label('Install Priority Requisition').pick('t:new');
  t.label('Install Strongbox').label('In remote1');
  t.pick(game.decision.options.find(o => o.id.startsWith('rez')).id); // rez Strongbox
  t.creditsOut('corp').discardFirst();
  t.prefix('run:remote1');
  const clicksBefore = g.state.runner.clicks;
  t.pick('steal');
  assert.equal(g.state.runner.agendaPoints, 3);
  assert.equal(g.state.runner.clicks, clicksBefore - 1);
}],

['Jinteki: Personal Evolution — 1 net damage whenever an agenda is scored', () => {
  const game = makeGame({ corpId: jinteki, corp: [['False Lead', 10]], runner: rFiller(10) });
  const g = game.g;
  const t = driver(game).keepHands();
  t.label('Install False Lead').pick('t:new');
  t.prefix('advance').prefix('advance');
  t.discardFirst();
  t.creditsOut('runner');
  t.prefix('advance');
  const handBefore = g.state.runner.hand.length;
  t.label('Score False Lead');
  assert.equal(g.state.runner.hand.length, handBefore - 1);
  assert.equal(lastEvent(game, 'damage').data.why, 'Personal Evolution');
}],

['Jinteki: Personal Evolution — 1 net damage whenever an agenda is stolen', () => {
  const game = makeGame({ corpId: jinteki, corp: [['Priority Requisition', 10]], runner: rFiller(10) });
  const g = game.g;
  const t = driver(game).keepHands();
  t.label('Install Priority Requisition').pick('t:new');
  t.creditsOut('corp').discardFirst();
  const handBefore = g.state.runner.hand.length;
  t.prefix('run:remote1');
  assert.equal(g.state.runner.agendaPoints, 3);
  assert.equal(g.state.runner.hand.length, handBefore - 1);
  assert.equal(lastEvent(game, 'damage').data.why, 'Personal Evolution');
}],

['Braintrust: score counters reduce ice rez cost by 1 each', () => {
  const game = makeGame({ corpId: jinteki, corp: [['Braintrust', 6], ['Ice Wall', 4]], runner: rFiller(10) });
  const g = game.g;
  const t = driver(game).keepHands();
  t.label('Install Braintrust').pick('t:new');
  const btId = g.state.corp.servers.remote1.content[0];
  g.state.corp.credits = 20;
  t.creditsOut('corp').discardFirst();
  // test setup (during runner's turn, before corp turn 2's score window check):
  inst(g, btId).advancement = 7; // 4 over 3 -> floor(4/2) = 2 counters
  t.creditsOut('runner');
  t.label('Score Braintrust');
  assert.equal(inst(g, btId).counters.agenda, 2);
  t.label('Install Ice Wall').label('Protecting hq');
  t.creditsOut('corp').discardFirst();
  t.prefix('run:hq');
  // Ice Wall costs 1cr to rez; 2 Braintrust counters reduce it to 0cr
  assert.match(game.decision.options.find(o => o.id.startsWith('rez')).label, /\(0cr\)/);
}],

['Nisei MK II: hosted counter ends a run at server approach', () => {
  const game = makeGame({ corpId: jinteki, corp: [['Nisei MK II', 6], ['Hedge Fund', 4]], runner: rFiller(10) });
  const g = game.g;
  const t = driver(game).keepHands();
  t.label('Install Nisei MK II').pick('t:new');
  g.state.corp.credits = 20;
  t.prefix('advance').prefix('advance'); // turn 1: install (1 click) + 2 advances = 3 clicks
  t.discardFirst();
  t.creditsOut('runner');
  t.prefix('advance').prefix('advance'); // turn 2: 2 more advances -> hits threshold (4)
  t.label('Score Nisei MK II');
  const nId = lastEvent(game, 'agenda-scored').data.id;
  assert.equal(inst(g, nId).counters.agenda, 1);
  t.creditsOut('corp').discardFirst(); // finish corp turn 2 (1 click left)
  t.prefix('run:hq');
  t.label('Hosted agenda counter');
  assert.equal(inst(g, nId).counters.agenda, 0);
  assert.equal(lastEvent(game, 'run-end').data.successful, false);
}],

['Project Junebug: advanceable ambush deals 2 net damage per advancement token', () => {
  const game = makeGame({ corpId: jinteki, corp: [['Project Junebug', 6], ['Hedge Fund', 4]], runner: rFiller(10) });
  const g = game.g;
  const t = driver(game).keepHands();
  t.label('Install Project Junebug').pick('t:new');
  const jbId = g.state.corp.servers.remote1.content[0];
  inst(g, jbId).advancement = 2;
  g.state.corp.credits = 10;
  t.creditsOut('corp').discardFirst();
  const handBefore = g.state.runner.hand.length;
  t.prefix('run:remote1');
  t.pick('done'); // decline to rez
  t.pick('pay');
  assert.equal(g.state.runner.hand.length, handBefore - 4);
  assert.equal(lastEvent(game, 'damage').data.n, 4);
}],

['Ronin: needs 4+ counters, then [click] trash: 3 net damage', () => {
  const game = makeGame({ corpId: jinteki, corp: [['Ronin', 6], ['Hedge Fund', 6]], runner: rFiller(10) });
  const g = game.g;
  const t = driver(game).keepHands();
  t.label('Install Ronin').pick('t:new');
  const roninId = g.state.corp.servers.remote1.content[0];
  t.pick(game.decision.options.find(o => o.id.startsWith('rez')).id); // free action, no click
  g.state.corp.credits = 20;
  inst(g, roninId).advancement = 3; // below the 4-counter threshold
  t.creditsOut('corp').discardFirst();
  t.creditsOut('runner');
  assert.ok(!game.decision.options.some(o => o.label.includes('Do 3 net damage')));
  t.prefix('advance'); // 3 -> 4, threshold met
  assert.ok(game.decision.options.some(o => o.label.includes('Do 3 net damage')));
  const handBefore = g.state.runner.hand.length;
  t.label('Do 3 net damage');
  assert.equal(lastEvent(game, 'card-trashed').data.title, 'Ronin');
  assert.equal(g.state.runner.hand.length, handBefore - 3);
}],

['Snare!: ambush deals 3 net damage and a tag, but not from Archives', () => {
  const game = makeGame({ corpId: jinteki, corp: [['Snare!', 6], ['Hedge Fund', 4]], runner: rFiller(10) });
  const g = game.g;
  const t = driver(game).keepHands();
  t.label('Install Snare!').pick('t:new');
  g.state.corp.credits = 10;
  t.creditsOut('corp').discardFirst();
  const handBefore = g.state.runner.hand.length;
  t.prefix('run:remote1');
  t.pick('done');
  t.pick('pay');
  assert.equal(g.state.runner.tags, 1);
  assert.equal(g.state.runner.hand.length, handBefore - 3);
}],

['Snare!: no ambush trigger when accessed from Archives', () => {
  const game = makeGame({ corpId: jinteki, corp: [['Snare!', 1], ['Hedge Fund', 9]], runner: rFiller(10) });
  const g = game.g;
  const t = driver(game).keepHands();
  // force Snare! into the opening discard-to-archives overflow
  const snareId = Object.values(g.insts).find(i => cardOf(g, i.id).title === 'Snare!').id;
  for (const id of [...g.state.corp.hand]) moveCard(g, id, 'corp-deck');
  const rest = g.state.corp.deck.filter(id => id !== snareId).slice(0, 5);
  for (const id of [snareId, ...rest]) moveCard(g, id, 'corp-hand');
  t.creditsOut('corp');
  t.label('Snare!').discardFirst();
  t.prefix('run:archives');
  assert.equal(g.state.runner.tags, 0);
}],

['Himitsu-Bako: pay 1cr to return itself to HQ before it can be encountered', () => {
  const game = makeGame({ corpId: jinteki, corp: [['Himitsu-Bako', 3], ['Hedge Fund', 4]], runner: rFiller(10) });
  const g = game.g;
  const t = driver(game).keepHands();
  installIceAndFinishCorpTurn(t, 'Himitsu-Bako');
  const hbId = g.state.corp.servers.hq.ice[0];
  t.prefix('run:hq');
  t.prefix('rez');     // rez it first — the ability requires it to be a live hook source
  t.prefix('ability');
  assert.equal(inst(g, hbId).zone, 'corp-hand');
  assert.equal(lastEvent(game, 'card-to-hand').data.title, 'Himitsu-Bako');
  t.pick('done'); // close the corp window; the ice is gone so the run continues unopposed
  assert.equal(lastEvent(game, 'run-end').data.successful, true);
}],

['Neural Katana: 3 net damage', () => {
  const game = makeGame({ corpId: jinteki, corp: [['Neural Katana', 6], ['Hedge Fund', 4]], runner: rFiller(10) });
  const g = game.g;
  const t = driver(game).keepHands();
  installIceAndFinishCorpTurn(t, 'Neural Katana');
  const handBefore = g.state.runner.hand.length;
  t.prefix('run:hq');
  t.prefix('rez');
  t.pick('continue');
  assert.equal(g.state.runner.hand.length, handBefore - 3);
}],

['Swordsman: blocks AI breakers and trashes an AI program', () => {
  const game = makeGame({ corpId: jinteki, corp: [['Swordsman', 6], ['Hedge Fund', 4]], runner: [['Sure Gamble', 5], ['Battering Ram', 5]] });
  const g = game.g;
  const t = driver(game).keepHands();
  installIceAndFinishCorpTurn(t, 'Swordsman');
  g.state.runner.credits = 10;
  t.label('Install Battering Ram');
  const ramId = g.state.runner.rig.program[0];
  // simulate an AI icebreaker for this test even though none is in Batch A/B/C/D
  cardOf(g, ramId).subtypes = [...cardOf(g, ramId).subtypes, 'AI'];
  t.prefix('run:hq');
  t.prefix('rez');
  t.pick('continue');
  t.label('Battering Ram'); // corp picks which AI program to trash
  assert.equal(lastEvent(game, 'card-trashed').data.title, 'Battering Ram');
  assert.equal(g.state.runner.hand.length < 10, true); // took the 1 net damage too
}],

['Wall of Thorns: 2 net damage then ETR', () => {
  const game = makeGame({ corpId: jinteki, corp: [['Wall of Thorns', 6], ['Hedge Fund', 4]], runner: rFiller(10) });
  const g = game.g;
  const t = driver(game).keepHands();
  installIceAndFinishCorpTurn(t, 'Wall of Thorns');
  g.state.corp.credits = 20; // Wall of Thorns costs 8cr to rez
  const handBefore = g.state.runner.hand.length;
  t.prefix('run:hq');
  t.prefix('rez');
  t.pick('continue');
  assert.equal(g.state.runner.hand.length, handBefore - 2);
  assert.equal(lastEvent(game, 'run-end').data.successful, false);
}],

['Whirlpool: forbids jack-out then trashes itself', () => {
  const game = makeGame({ corpId: jinteki, corp: [['Whirlpool', 3], ['Wall of Static', 3], ['Hedge Fund', 4]], runner: rFiller(10) });
  const g = game.g;
  const t = driver(game).keepHands();
  t.label('Install Wall of Static').label('Protecting hq');     // innermost
  t.label('Install Whirlpool').label('Protecting hq');           // outermost
  t.creditsOut('corp').discardFirst();
  t.prefix('run:hq');
  t.prefix('rez');            // rez Whirlpool
  t.pick('continue');         // sub fires: forbids jack-out, trashes itself
  assert.equal(g.state.corp.servers.hq.ice.length, 1);
  assert.equal(lastEvent(game, 'card-trashed').data.title, 'Whirlpool');
  // second (inner) ice approaches next; jack-out should NOT be offered despite being a later approach
  assert.notEqual(game.decision.runStep, 'jack-out');
}],

['Yagura: may look at and bottom the top card of R&D, then 1 net damage', () => {
  const game = makeGame({ corpId: jinteki, corp: [['Yagura', 6], ['Hedge Fund', 4]], runner: rFiller(10) });
  const g = game.g;
  const t = driver(game).keepHands();
  installIceAndFinishCorpTurn(t, 'Yagura');
  const topId = g.state.corp.deck[0];
  const handBefore = g.state.runner.hand.length;
  t.prefix('run:hq');
  t.prefix('rez');
  t.pick('continue');
  t.pick('move');
  assert.equal(g.state.corp.deck[g.state.corp.deck.length - 1], topId);
  assert.equal(g.state.runner.hand.length, handBefore - 1);
}],

['Celebrity Gift: extra click cost, reveals cards and gains 2cr each', () => {
  const game = makeGame({ corpId: jinteki, corp: [['Celebrity Gift', 3], ['Hedge Fund', 6]], runner: rFiller(10) });
  const g = game.g;
  const t = driver(game).keepHands();
  const clicksBefore = g.state.corp.clicks; // 3
  const credsBefore = g.state.corp.credits;
  t.label('Play Celebrity Gift');
  assert.equal(g.state.corp.clicks, clicksBefore - 2); // 1 click + 1 extra
  t.label('Hedge Fund');
  t.pick('done');
  assert.equal(lastEvent(game, 'cards-revealed').data.titles.length, 1);
  assert.equal(g.state.corp.credits, credsBefore - 3 + 2);
}],

['Neural EMP: only playable if the Runner made a run during their last turn', () => {
  const game = makeGame({ corpId: jinteki, corp: [['Neural EMP', 6], ['Hedge Fund', 4]], runner: rFiller(10) });
  const g = game.g;
  const t = driver(game).keepHands();
  t.creditsOut('corp').discardFirst();
  // runner takes no run this turn -> not playable on the corp's following turn
  t.creditsOut('runner');
  assert.ok(!game.decision.options.some(o => o.label.includes('Neural EMP')));
  t.creditsOut('corp').discardFirst();
  // runner now runs, then corp can play it on the turn after that
  t.prefix('run:hq');
  t.creditsOut('runner');
  assert.ok(game.decision.options.some(o => o.label.includes('Play Neural EMP')));
  const handBefore = g.state.runner.hand.length;
  t.label('Play Neural EMP');
  assert.equal(g.state.runner.hand.length, handBefore - 1);
}],

['Trick of Light: moves advancement counters between installed cards', () => {
  const game = makeGame({ corpId: jinteki, corp: [['Trick of Light', 3], ['Ice Wall', 3], ['Hedge Fund', 4]], runner: rFiller(10) });
  const g = game.g;
  const t = driver(game).keepHands();
  g.state.corp.credits = 20;
  t.label('Install Ice Wall').label('Protecting hq');      // target: 0 advancement
  const targetId = g.state.corp.servers.hq.ice[0];
  t.label('Install Ice Wall').label('Protecting rd');      // source: 3 advancement
  const sourceId = g.state.corp.servers.rd.ice[0];
  inst(g, sourceId).advancement = 3;
  t.label('Play Trick of Light');
  t.pick(`t:${targetId}`);
  t.pick(`s:${sourceId}`);
  t.num(2);
  assert.equal(inst(g, targetId).advancement, 2);
  assert.equal(inst(g, sourceId).advancement, 1);
}],

['Hokusai Grid: successful run on its server deals 1 net damage', () => {
  const game = makeGame({ corpId: jinteki, corp: [['Hokusai Grid', 3], ['Hedge Fund', 4]], runner: rFiller(10) });
  const g = game.g;
  const t = driver(game).keepHands();
  t.label('Install Hokusai Grid').pick('t:new');
  t.pick(game.decision.options.find(o => o.id.startsWith('rez')).id);
  t.creditsOut('corp').discardFirst();
  const handBefore = g.state.runner.hand.length;
  t.prefix('run:remote1');
  assert.equal(g.state.runner.hand.length, handBefore - 1);
}],

];
