// Game driver + turn structure. The rules run as generators that yield
// decisions; Game pauses on each decision until .choose(answer) is called.
// Works identically for human UI, AI controllers, tutorial, and tests.
import { createState, inst, cardOf, moveCard, memoryUsed, memoryLimit, newRemote, serverIds, isCentral } from './state.js';
import { createDb } from './db.js';
import { choice, opt, validate } from './decisions.js';
import * as fx from './effects.js';
import { doRun } from './run.js';
import { getScript } from '../cards/registry.js';

export class Game {
  // config: {seed, corp: {identity, cards:[{code,qty}]}, runner: {...}}
  constructor(cardsJson, config) {
    this.g = createState(createDb(cardsJson), config);
    this.history = [];
    this.gen = mainLoop(this.g);
    this._advance(undefined);
  }
  _advance(answer) {
    const r = this.gen.next(answer);
    this.pending = r.done ? null : r.value;
  }
  get decision() { return this.pending; }
  get state() { return this.g.state; }
  get log() { return this.g.log.events; }
  choose(answer) {
    if (!this.pending) throw new Error('no pending decision');
    const v = validate(this.pending, answer);
    this.history.push(v);
    this._advance(v);
    return this.pending;
  }
  // replay support: seed + history reproduces the game exactly
}

function* mainLoop(g) {
  const s = g.state;
  fx.draw(g, 'corp', 5); fx.draw(g, 'runner', 5);
  for (const p of ['corp', 'runner']) {
    const m = yield choice(p, 'Keep this starting hand?',
      [opt('keep', 'Keep'), opt('mulligan', 'Mulligan (shuffle back, draw 5)')], { setup: true });
    if (m === 'mulligan') {
      const hand = [...s[p].hand];
      for (const id of hand) moveCard(g, id, `${p}-deck`);
      g.rng.shuffle(s[p].deck);
      fx.draw(g, p, 5);
      fx.emit(g, 'mulligan', { who: p });
    }
  }
  s.phase = 'playing';
  while (!s.winner) {
    yield* corpTurn(g);
    if (s.winner) break;
    yield* runnerTurn(g);
  }
}

// ---------- CORP ----------
function* corpTurn(g) {
  const s = g.state;
  s.turn++; s.activePlayer = 'corp'; s.corp.clicks = 3;
  fx.emit(g, 'turn-start', { who: 'corp', credits: s.corp.credits });
  s.phase = 'corp-draw';
  fx.draw(g, 'corp', 1);              // mandatory draw (deck-out check inside)
  if (s.winner) return;
  s.phase = 'corp-action';
  yield* scoreWindow(g);
  while (s.corp.clicks > 0 && !s.winner) {
    yield* corpAction(g);
    yield* scoreWindow(g);
  }
  if (s.winner) return;
  s.phase = 'corp-discard';
  yield* fx.discardToHandSize(g, 'corp');
  fx.emit(g, 'turn-end', { who: 'corp' });
}

function* scoreWindow(g) {
  const s = g.state;
  while (!s.winner) {
    const scorable = installedCorpCards(g).filter(id => {
      const it = inst(g, id);
      return it.card.type === 'agenda' && it.advancement >= it.card.advancementCost;
    });
    if (!scorable.length) return;
    const pick = yield choice('corp', 'Score an agenda?',
      [...scorable.map(id => opt(`score:${id}`, `Score ${cardOf(g, id).title} (${cardOf(g, id).agendaPoints} pts)`)), opt('pass', 'Not now')],
      { scoreWindow: true });
    if (pick === 'pass') return;
    const id = Number(pick.split(':')[1]);
    const onScore = fx.scoreAgenda(g, id);
    if (onScore) yield* onScore(g, { instId: id });
  }
}

function* corpAction(g) {
  const s = g.state, c = s.corp;
  const options = [opt('credit', 'Gain 1 credit')];
  if (c.deck.length > 0) options.push(opt('draw', 'Draw a card'));
  for (const id of c.hand) {
    const card = cardOf(g, id);
    if (card.type === 'operation') {
      const script = getScript(card.code);
      if (script?.onPlay && fx.canPay(g, 'corp', card.cost ?? 0) && (script.canPlay?.(g) ?? true)) {
        options.push(opt(`play:${id}`, `Play ${card.title} (${card.cost}cr)`));
      }
    } else if (['ice', 'agenda', 'asset', 'upgrade'].includes(card.type)) {
      options.push(opt(`install:${id}`, `Install ${card.title}`));
    }
  }
  for (const id of installedCorpCards(g)) {
    const it = inst(g, id);
    const advanceable = it.card.type === 'agenda' || getScript(it.code)?.advanceable;
    if (advanceable && fx.canPay(g, 'corp', 1)) {
      options.push(opt(`advance:${id}`, `Advance ${it.faceup ? it.card.title : 'card'} in ${serverOf(it)} (1cr) [${it.advancement}]`));
    }
  }
  if (s.runner.tags > 0 && s.runner.rig.resource.length > 0 && fx.canPay(g, 'corp', 2)) {
    options.push(opt('trash-resource', 'Trash a runner resource (2cr, runner is tagged)'));
  }
  if (c.clicks >= 3) options.push(opt('purge', 'Purge virus counters (3 clicks)'));

  const pick = yield choice('corp', `Corp action (${c.clicks} clicks, ${c.credits}cr)`, options, { actionMenu: true });
  const [verb, idStr] = pick.split(':');
  const id = idStr ? Number(idStr) : null;

  switch (verb) {
    case 'credit': c.clicks--; fx.gainCredits(g, 'corp', 1, 'click'); break;
    case 'draw': c.clicks--; fx.draw(g, 'corp', 1); break;
    case 'purge': c.clicks -= 3; fx.purgeVirus(g); break;
    case 'trash-resource': {
      c.clicks--; fx.pay(g, 'corp', 2, 'trash resource');
      const rid = yield choice('corp', 'Trash which resource?',
        s.runner.rig.resource.map(r => opt(`${r}`, cardOf(g, r).title)));
      fx.trash(g, Number(rid), 'tag punishment');
      break;
    }
    case 'advance': {
      c.clicks--; fx.pay(g, 'corp', 1, 'advance');
      inst(g, id).advancement++;
      fx.emit(g, 'card-advanced', { id, advancement: inst(g, id).advancement });
      break;
    }
    case 'play': {
      const card = cardOf(g, id);
      c.clicks--; fx.pay(g, 'corp', card.cost ?? 0, `play ${card.title}`);
      fx.emit(g, 'operation-played', { id, code: card.code, title: card.title });
      yield* getScript(card.code).onPlay(g, { instId: id });
      if (inst(g, id).zone === 'corp-hand') {
        moveCard(g, id, 'corp-archives'); inst(g, id).faceup = true;
      }
      break;
    }
    case 'install': yield* corpInstall(g, id); break;
    default: throw new Error(`bad corp action ${pick}`);
  }
}

function* corpInstall(g, handId) {
  const s = g.state, card = cardOf(g, handId);
  const targets = [];
  if (card.type === 'ice') {
    for (const sid of serverIds(g)) {
      const cost = s.corp.servers[sid].ice.length; // 1cr per existing ice
      if (fx.canPay(g, 'corp', cost)) targets.push(opt(`t:${sid}`, `Protecting ${sid} (${cost}cr)`));
    }
  } else if (card.type === 'upgrade') {
    for (const sid of serverIds(g)) targets.push(opt(`t:${sid}`, `In ${sid}`));
    targets.push(opt('t:new', 'In a NEW remote server'));
  } else { // agenda / asset -> remotes only
    for (const sid of serverIds(g).filter(x => !isCentral(x))) {
      targets.push(opt(`t:${sid}`, `In ${sid}${hasAgendaOrAsset(g, sid) ? ' (trashes existing card)' : ''}`));
    }
    targets.push(opt('t:new', 'In a NEW remote server'));
  }
  targets.push(opt('cancel', 'Cancel'));
  const pick = yield choice('corp', `Install ${card.title} where?`, targets, { installTarget: true });
  if (pick === 'cancel') return;
  let sid = pick.slice(2);
  if (sid === 'new') sid = newRemote(g);

  if (card.type === 'ice') {
    fx.pay(g, 'corp', s.corp.servers[sid].ice.length, 'install ice');
    moveCard(g, handId, `server-ice:${sid}`); // push = outermost
  } else {
    if (card.type !== 'upgrade') {
      for (const ex of [...s.corp.servers[sid].content]) {
        if (['agenda', 'asset'].includes(cardOf(g, ex).type)) fx.trash(g, ex, 'installed over');
      }
    }
    moveCard(g, handId, `server-content:${sid}`);
  }
  const it = inst(g, handId);
  it.faceup = false; it.rezzed = false; it.installedTurn = s.turn;
  s.corp.clicks--;
  fx.emit(g, 'corp-installed', { id: handId, server: sid, type: card.type }); // type public, title hidden
}

// ---------- RUNNER ----------
function* runnerTurn(g) {
  const s = g.state;
  s.activePlayer = 'runner'; s.runner.clicks = 4;
  fx.emit(g, 'turn-start', { who: 'runner', credits: s.runner.credits });
  s.phase = 'runner-action';
  while (s.runner.clicks > 0 && !s.winner) yield* runnerAction(g);
  if (s.winner) return;
  s.phase = 'runner-discard';
  yield* fx.discardToHandSize(g, 'runner');
  fx.emit(g, 'turn-end', { who: 'runner' });
}

function* runnerAction(g) {
  const s = g.state, r = s.runner;
  const options = [opt('credit', 'Gain 1 credit')];
  if (r.deck.length > 0) options.push(opt('draw', 'Draw a card'));
  for (const id of r.hand) {
    const card = cardOf(g, id);
    if (card.type === 'event') {
      const script = getScript(card.code);
      if (script?.onPlay && fx.canPay(g, 'runner', card.cost ?? 0) && (script.canPlay?.(g) ?? true)) {
        options.push(opt(`play:${id}`, `Play ${card.title} (${card.cost}cr)`));
      }
    } else if (['program', 'hardware', 'resource'].includes(card.type)) {
      if (fx.canPay(g, 'runner', card.cost ?? 0)) options.push(opt(`install:${id}`, `Install ${card.title} (${card.cost}cr)`));
    }
  }
  for (const sid of serverIds(g)) options.push(opt(`run:${sid}`, `Run on ${sid}`));
  if (r.tags > 0 && fx.canPay(g, 'runner', 2)) options.push(opt('remove-tag', 'Remove 1 tag (2cr)'));

  const pick = yield choice('runner', `Runner action (${r.clicks} clicks, ${r.credits}cr)`, options, { actionMenu: true });
  const [verb, arg] = pick.split(':');

  switch (verb) {
    case 'credit': r.clicks--; fx.gainCredits(g, 'runner', 1, 'click'); break;
    case 'draw': r.clicks--; fx.draw(g, 'runner', 1); break;
    case 'remove-tag': r.clicks--; fx.pay(g, 'runner', 2, 'remove tag'); fx.removeTag(g); break;
    case 'run': r.clicks--; yield* doRun(g, arg); break;
    case 'play': {
      const id = Number(arg), card = cardOf(g, id);
      r.clicks--; fx.pay(g, 'runner', card.cost ?? 0, `play ${card.title}`);
      fx.emit(g, 'event-played', { id, code: card.code, title: card.title });
      yield* getScript(card.code).onPlay(g, { instId: id });
      if (inst(g, id).zone === 'runner-hand') moveCard(g, id, 'runner-discard');
      break;
    }
    case 'install': yield* runnerInstall(g, Number(arg)); break;
    default: throw new Error(`bad runner action ${pick}`);
  }
}

function* runnerInstall(g, handId) {
  const g_ = g, s = g.state, card = cardOf(g, handId);
  // programs: enforce memory, offer trashing installed programs to make room
  if (card.type === 'program') {
    while (memoryUsed(g) + (card.memoryCost ?? 0) > memoryLimit(g)) {
      const progs = s.runner.rig.program;
      if (!progs.length) { fx.emit(g, 'install-failed', { id: handId, why: 'MU' }); return; }
      const pick = yield choice('runner', `Not enough MU for ${card.title}. Trash a program?`,
        [...progs.map(id => opt(`${id}`, `Trash ${cardOf(g, id).title}`)), opt('cancel', 'Cancel install')]);
      if (pick === 'cancel') return;
      fx.trash(g, Number(pick), 'MU room');
    }
  }
  // uniqueness rule: new unique in play trashes existing copies
  if (card.uniqueness) {
    for (const zone of ['rig-program', 'rig-hardware', 'rig-resource']) {
      for (const ex of [...zoneIds(g, zone)]) {
        if (cardOf(g, ex).code === card.code) fx.trash(g, ex, 'uniqueness');
      }
    }
  }
  fx.pay(g, 'runner', card.cost ?? 0, `install ${card.title}`);
  moveCard(g, handId, `rig-${card.type}`);
  const it = inst(g, handId);
  it.faceup = true; it.rezzed = true; it.installedTurn = s.turn;
  s.runner.clicks--;
  fx.emit(g, 'runner-installed', { id: handId, code: card.code, title: card.title });
  const script = getScript(card.code);
  if (script?.onInstall) yield* script.onInstall(g, { instId: handId });
}

// ---------- shared helpers ----------
function installedCorpCards(g) {
  const out = [];
  for (const sid of serverIds(g)) {
    out.push(...g.state.corp.servers[sid].content, ...g.state.corp.servers[sid].ice);
  }
  return out;
}
function hasAgendaOrAsset(g, sid) {
  return g.state.corp.servers[sid].content
    .some(id => ['agenda', 'asset'].includes(cardOf(g, id).type));
}
function serverOf(it) {
  const m = it.zone.match(/^server-(?:ice|content):(.+)$/);
  return m ? m[1] : it.zone;
}
function zoneIds(g, zone) {
  const m = { 'rig-program': g.state.runner.rig.program, 'rig-hardware': g.state.runner.rig.hardware, 'rig-resource': g.state.runner.rig.resource };
  return m[zone];
}
