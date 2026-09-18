// Game driver + turn structure. The rules run as generators that yield
// decisions; Game pauses on each decision until .choose(answer) is called.
import { createState, inst, cardOf, moveCard, memoryUsed, memoryLimit, newRemote, serverIds, isCentral } from './state.js';
import { createDb } from './db.js';
import { choice, opt, validate } from './decisions.js';
import * as fx from './effects.js';
import { doRun } from './run.js';
import { getScript } from '../cards/registry.js';
import { collect, installedRunner, installedCorp, refillRecurring } from './hooks.js';

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
}

function* mainLoop(g) {
  const s = g.state;
  // startingHandSize: per-identity override of the printed 5-card opening
  // hand (Andromeda: Dispossessed Ristie draws 9) — applies to both the
  // initial draw and a mulligan's redraw.
  const startingHandSize = p => getScript(cardOf(g, s[p].identity).code)?.startingHandSize ?? 5;
  fx.draw(g, 'corp', startingHandSize('corp')); fx.draw(g, 'runner', startingHandSize('runner'));
  for (const p of ['corp', 'runner']) {
    const n = startingHandSize(p);
    const m = yield choice(p, 'Keep this starting hand?',
      [opt('keep', 'Keep'), opt('mulligan', `Mulligan (shuffle back, draw ${n})`)], { setup: true });
    if (m === 'mulligan') {
      const hand = [...s[p].hand];
      for (const id of hand) moveCard(g, id, `${p}-deck`);
      g.rng.shuffle(s[p].deck);
      fx.draw(g, p, n);
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

function* startOfTurn(g, player) {
  const s = g.state;
  s.flags.turn = {};
  refillRecurring(g, player);
  fx.emit(g, 'turn-start', { who: player, credits: s[player].credits });
  for (const h of collect(g, 'onTurnStart')) {
    if (h.it.card.side !== player) continue;
    if (h.it.card.side === 'corp' && !h.it.rezzed && h.it.card.type !== 'identity') continue;
    yield* h.fn(g, { instId: h.id });
    if (s.winner) return;
  }
}

// "When your turn ends..." conditionals (Rules Reference: fires for the
// active player at the end of their own discard phase, before the turn passes).
function* endOfTurn(g, player) {
  const s = g.state;
  for (const h of collect(g, 'onTurnEnd')) {
    if (h.it.card.side !== player) continue;
    if (h.it.card.side === 'corp' && !h.it.rezzed && h.it.card.type !== 'identity') continue;
    yield* h.fn(g, { instId: h.id });
    if (s.winner) return;
  }
  // Generic one-shot delayed-trigger check (Test Run): a card can mark its
  // own installed instance with `pendingReturnToStack = true` at install time
  // instead of needing a script-level onTurnEnd hook (the fetched program's
  // own script isn't Test Run's to modify). Checked once per turn, self-
  // clearing, and a no-op if the card already left play (installedRunner()
  // only lists what's currently installed).
  if (player === 'runner') {
    for (const id of installedRunner(g)) {
      const it = inst(g, id);
      if (!it.pendingReturnToStack) continue;
      it.pendingReturnToStack = false;
      moveCard(g, id, 'runner-deck', { position: 'top' });
      fx.emit(g, 'card-returned-to-stack', { id, title: it.card.title });
    }
  }
}

// ---------- CORP ----------
function* corpTurn(g) {
  const s = g.state;
  s.turn++; s.activePlayer = 'corp'; s.corp.clicks = 3;
  yield* startOfTurn(g, 'corp');
  if (s.winner) return;
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
  if (s.winner) return;
  yield* endOfTurn(g, 'corp');
  if (s.winner) return;
  fx.emit(g, 'turn-end', { who: 'corp' });
}

function* scoreWindow(g) {
  const s = g.state;
  while (!s.winner) {
    const scorable = installedCorp(g).filter(id => {
      const it = inst(g, id);
      return it.card.type === 'agenda' && it.advancement >= advancementRequirement(g, it);
    });
    if (!scorable.length) return;
    const pick = yield choice('corp', 'Score an agenda?',
      [...scorable.map(id => opt(`score:${id}`, `Score ${cardOf(g, id).title} (${cardOf(g, id).agendaPoints} pts)`)), opt('pass', 'Not now')],
      { scoreWindow: true });
    if (pick === 'pass') return;
    yield* fx.scoreAgendaFx(g, Number(pick.split(':')[1]));
  }
}
function advancementRequirement(g, it) {
  return Math.max(0, it.card.advancementCost + (getScript(it.code)?.advReqMod?.(g, it) ?? 0));
}

// installed-card click abilities (script.actions)
function cardActions(g, player) {
  const out = [];
  const sources = player === 'corp'
    ? [...installedCorp(g), ...g.state.corp.score, g.state.corp.identity]
    : [...installedRunner(g), g.state.runner.identity];
  for (const id of sources) {
    const it = inst(g, id);
    const script = getScript(it.code);
    if (!script?.actions) continue;
    if (player === 'corp' && !it.rezzed && it.card.type !== 'identity') continue;
    script.actions.forEach((a, i) => {
      const clicks = a.clicks ?? 1;
      if (g.state[player].clicks < clicks) return;
      if (a.credits && !fx.canPay(g, player, a.credits)) return;
      if (a.req && !a.req(g, it)) return;
      out.push({ id: `cardact:${id}:${i}`, label: `${it.card.title}: ${typeof a.label === 'function' ? a.label(g, it) : a.label}`, instId: id, action: a, clicks });
    });
  }
  return out;
}
function* runCardAction(g, player, entry) {
  const { action: a, instId } = entry;
  g.state[player].clicks -= entry.clicks;
  if (a.credits) fx.pay(g, player, a.credits, `use ${inst(g, instId).card.title}`);
  fx.emit(g, 'card-ability', { id: instId, title: inst(g, instId).card.title });
  if (a.trashSelf) fx.trash(g, instId, 'ability cost');
  yield* a.effect(g, { instId });
}

function* corpAction(g) {
  const s = g.state, c = s.corp;
  const options = [opt('credit', 'Gain 1 credit')];
  if (c.deck.length > 0) options.push(opt('draw', 'Draw a card'));
  for (const id of c.hand) {
    const card = cardOf(g, id);
    if (card.type === 'operation') {
      const script = getScript(card.code);
      const extraClicks = script?.extraClickCost ?? 0;
      if (script?.onPlay && fx.canPay(g, 'corp', card.cost ?? 0) && c.clicks >= 1 + extraClicks && (script.canPlay?.(g) ?? true)) {
        options.push(opt(`play:${id}`, `Play ${card.title} (${card.cost}cr${extraClicks ? ', extra click' : ''})`));
      }
    } else if (['ice', 'agenda', 'asset', 'upgrade'].includes(card.type)) {
      options.push(opt(`install:${id}`, `Install ${card.title}`));
    }
  }
  // free action: rez non-ice installed cards
  for (const id of installedCorp(g)) {
    const it = inst(g, id);
    if (!it.rezzed && !['ice', 'agenda'].includes(it.card.type) && fx.canPay(g, 'corp', fx.rezCost(g, id))) {
      options.push(opt(`rez:${id}`, `Rez ${it.card.title} (${fx.rezCost(g, id)}cr) — free action`));
    }
  }
  for (const id of installedCorp(g)) {
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
  for (const e of cardActions(g, 'corp')) options.push(opt(e.id, e.label));

  const pick = yield choice('corp', `Corp action (${c.clicks} clicks, ${c.credits}cr)`, options, { actionMenu: true });
  const [verb, idStr] = pick.split(':');
  const id = idStr ? Number(idStr) : null;

  switch (verb) {
    case 'credit': c.clicks--; fx.gainCredits(g, 'corp', 1, 'click'); break;
    case 'draw': c.clicks--; fx.draw(g, 'corp', 1); break;
    case 'purge': c.clicks -= 3; fx.purgeVirus(g); break;
    case 'rez': yield* fx.rezFx(g, id); break; // free action, no click
    case 'cardact': {
      const entry = cardActions(g, 'corp').find(e => e.id === pick);
      yield* runCardAction(g, 'corp', entry);
      break;
    }
    case 'trash-resource': {
      c.clicks--; fx.pay(g, 'corp', 2, 'trash resource');
      const rid = yield choice('corp', 'Trash which resource?',
        s.runner.rig.resource.map(r => opt(`${r}`, cardOf(g, r).title)));
      yield* fx.trashWithPrevention(g, Number(rid), 'tag punishment');
      break;
    }
    case 'advance': {
      c.clicks--;
      fx.pay(g, 'corp', 1, 'advance', cardOf(g, id).type === 'ice' ? 'advance-ice' : undefined);
      inst(g, id).advancement++;
      fx.emit(g, 'card-advanced', { id, advancement: inst(g, id).advancement });
      break;
    }
    case 'play': {
      const card = cardOf(g, id);
      const script = getScript(card.code);
      c.clicks -= 1 + (script.extraClickCost ?? 0);
      fx.pay(g, 'corp', card.cost ?? 0, `play ${card.title}`);
      fx.emit(g, 'operation-played', { id, code: card.code, title: card.title, subtypes: card.subtypes });
      for (const h of collect(g, 'onPlayOperation')) yield* h.fn(g, { operationId: id }); // Weyland BaBW
      yield* script.onPlay(g, { instId: id });
      if (inst(g, id).zone === 'corp-hand') {
        moveCard(g, id, 'corp-archives'); inst(g, id).faceup = true;
      }
      break;
    }
    case 'install': yield* corpInstall(g, id); break;
    default: throw new Error(`bad corp action ${pick}`);
  }
}

export function* corpInstall(g, handId, { noClick = false, noCost = false } = {}) {
  const free = noClick && noCost; // legacy
  const s = g.state, card = cardOf(g, handId);
  const targets = [];
  if (card.type === 'ice') {
    for (const sid of serverIds(g)) {
      const cost = s.corp.servers[sid].ice.length;
      if (noCost || fx.canPay(g, 'corp', cost)) targets.push(opt(`t:${sid}`, `Protecting ${sid} (${noCost ? 0 : cost}cr)`));
    }
    targets.push(opt('t:new', 'Protecting a NEW remote server'));
  } else if (card.type === 'upgrade') {
    for (const sid of serverIds(g)) targets.push(opt(`t:${sid}`, `In ${sid}`));
    targets.push(opt('t:new', 'In a NEW remote server'));
  } else {
    for (const sid of serverIds(g).filter(x => !isCentral(x))) {
      targets.push(opt(`t:${sid}`, `In ${sid}${hasAgendaOrAsset(g, sid) ? ' (trashes existing card)' : ''}`));
    }
    targets.push(opt('t:new', 'In a NEW remote server'));
  }
  targets.push(opt('cancel', 'Cancel'));
  const pick = yield choice('corp', `Install ${card.title} where?`, targets, { installTarget: true });
  if (pick === 'cancel') return false;
  let sid = pick.slice(2);
  if (sid === 'new') sid = newRemote(g);

  if (card.type === 'ice') {
    if (!noCost) fx.pay(g, 'corp', s.corp.servers[sid].ice.length, 'install ice');
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
  if (!noClick) s.corp.clicks--;
  fx.emit(g, 'corp-installed', { id: handId, server: sid, type: card.type });
  return true;
}

// ---------- RUNNER ----------
function* runnerTurn(g) {
  const s = g.state;
  s.activePlayer = 'runner'; s.runner.clicks = 4;
  yield* startOfTurn(g, 'runner');
  if (s.winner) return;
  s.phase = 'runner-action';
  while (s.runner.clicks > 0 && !s.winner) yield* runnerAction(g);
  if (s.winner) return;
  s.phase = 'runner-discard';
  yield* fx.discardToHandSize(g, 'runner');
  if (s.winner) return;
  // snapshot for corp cards that read "during the Runner's last turn"
  s.flags.lastRunnerTurn = {
    ranServers: s.flags.turn.runsMade ?? [],
    successfulRuns: s.flags.turn.successfulRuns ?? [],
    stolenPoints: (s.flags.turn.stolen ?? [])
      .reduce((a, id) => a + (inst(g, id).card.agendaPoints ?? 0), 0),
  };
  yield* endOfTurn(g, 'runner');
  if (s.winner) return;
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
      const extraClicks = script?.extraClickCost ?? 0;
      if (script?.onPlay && fx.canPay(g, 'runner', card.cost ?? 0) && r.clicks >= 1 + extraClicks && (script.canPlay?.(g) ?? true)) {
        options.push(opt(`play:${id}`, `Play ${card.title} (${card.cost}cr${extraClicks ? ', extra click' : ''})`));
      }
    } else if (['program', 'hardware', 'resource'].includes(card.type)) {
      if (fx.canPay(g, 'runner', card.cost ?? 0) && !consoleBlocked(g, card)) {
        options.push(opt(`install:${id}`, `Install ${card.title} (${card.cost}cr)`));
      }
    }
  }
  for (const sid of serverIds(g)) options.push(opt(`run:${sid}`, `Run on ${sid}`));
  if (r.tags > 0 && fx.canPay(g, 'runner', 2, 'remove-tag')) options.push(opt('remove-tag', 'Remove 1 tag (2cr)'));
  for (const e of cardActions(g, 'runner')) options.push(opt(e.id, e.label));

  const pick = yield choice('runner', `Runner action (${r.clicks} clicks, ${r.credits}cr)`, options, { actionMenu: true });
  const [verb, arg] = pick.split(':');

  switch (verb) {
    case 'credit': r.clicks--; fx.gainCredits(g, 'runner', 1, 'click'); break;
    case 'draw': r.clicks--; fx.draw(g, 'runner', 1); break;
    case 'remove-tag': r.clicks--; fx.pay(g, 'runner', 2, 'remove tag', 'remove-tag'); fx.removeTag(g); break;
    case 'run': r.clicks--; yield* doRun(g, arg); break;
    case 'cardact': {
      const entry = cardActions(g, 'runner').find(e => e.id === pick);
      yield* runCardAction(g, 'runner', entry);
      break;
    }
    case 'play': {
      const id = Number(arg), card = cardOf(g, id);
      const script = getScript(card.code);
      r.clicks -= 1 + (script.extraClickCost ?? 0);
      fx.pay(g, 'runner', card.cost ?? 0, `play ${card.title}`);
      fx.emit(g, 'event-played', { id, code: card.code, title: card.title });
      yield* script.onPlay(g, { instId: id });
      const it = inst(g, id);
      // skipAutoDiscard: a one-off exemption an event's own onPlay can set
      // (Networking) when it deliberately returns itself to the grip instead
      // of the normal post-play discard.
      if (it.zone === 'runner-hand' && !it.skipAutoDiscard) moveCard(g, id, 'runner-discard');
      it.skipAutoDiscard = false;
      break;
    }
    case 'install': yield* runnerInstall(g, Number(arg)); break;
    default: throw new Error(`bad runner action ${pick}`);
  }
}

function consoleBlocked(g, card) {
  if (!card.subtypes.includes('Console')) return false;
  return installedRunner(g).some(id => cardOf(g, id).subtypes.includes('Console'));
}

export function* runnerInstall(g, handId, { noClick = false, noCost = false, discount = 0 } = {}) {
  const s = g.state, card = cardOf(g, handId);
  if (card.type === 'program') {
    while (memoryUsed(g) + (card.memoryCost ?? 0) > memoryLimit(g)) {
      const progs = s.runner.rig.program.filter(id => !hostedMemoryFree(g, id));
      if (!progs.length) { fx.emit(g, 'install-failed', { id: handId, why: 'MU' }); return false; }
      const pick = yield choice('runner', `Not enough MU for ${card.title}. Trash a program?`,
        [...progs.map(id => opt(`${id}`, `Trash ${cardOf(g, id).title}`)), opt('cancel', 'Cancel install')]);
      if (pick === 'cancel') return false;
      fx.trash(g, Number(pick), 'MU room');
    }
  }
  if (card.uniqueness) {
    for (const ex of [...installedRunner(g)]) {
      if (cardOf(g, ex).code === card.code) fx.trash(g, ex, 'uniqueness');
    }
  }
  const cost = noCost ? 0 : Math.max(0, (card.cost ?? 0) - discount);
  const installPurpose = card.type === 'hardware' ? 'install-hardware'
    : card.subtypes.includes('Virus') ? 'virus-install' : undefined;
  if (cost) fx.pay(g, 'runner', cost, `install ${card.title}`, installPurpose);
  moveCard(g, handId, `rig-${card.type}`);
  const it = inst(g, handId);
  it.faceup = true; it.rezzed = true; it.installedTurn = s.turn;
  if (!noClick) s.runner.clicks--;
  fx.emit(g, 'runner-installed', { id: handId, code: card.code, title: card.title });
  // hosting: offer to host new non-AI icebreakers on a host with capacity
  const script = getScript(card.code);
  if (card.type === 'program' && script?.breaker && !card.subtypes.includes('AI')) {
    for (const hw of installedRunner(g)) {
      const hs = getScript(cardOf(g, hw).code);
      if (hs?.canHostBreaker && !Object.values(g.insts).some(x => x.hostId === hw)) {
        const c = yield choice('runner', `Host ${card.title} on ${cardOf(g, hw).title}?`,
          [opt('host', 'Host it'), opt('no', 'Install normally')], { hosting: true });
        if (c === 'host') { it.hostId = hw; fx.emit(g, 'hosted', { id: handId, on: hw }); }
        break;
      }
    }
  }
  if (script?.onInstall) yield* script.onInstall(g, { instId: handId });
  return true;
}
function hostedMemoryFree(g, id) {
  const it = inst(g, id);
  if (it.hostId == null) return false;
  return !!getScript(inst(g, it.hostId).code)?.hostedMemoryFree;
}

// ---------- shared helpers ----------
function hasAgendaOrAsset(g, sid) {
  return g.state.corp.servers[sid].content
    .some(id => ['agenda', 'asset'].includes(cardOf(g, id).type));
}
function serverOf(it) {
  const m = it.zone.match(/^server-(?:ice|content):(.+)$/);
  return m ? m[1] : it.zone;
}
