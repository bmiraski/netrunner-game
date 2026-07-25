// Shared rules effects: money, cards, damage, tags, traces, scoring, winning.
// Functions that may need player decisions are generators (yield decisions).
import { inst, cardOf, moveCard, handSize, handSizeRaw } from './state.js';
import { choice, opt, number } from './decisions.js';
import { getScript } from '../cards/registry.js';
import { poolsFor, poolTotal, collect, modSum } from './hooks.js';

const emit = (g, type, data) =>
  g.log.emit(type, data, { turn: g.state.turn, player: g.state.activePlayer });

export { emit };

// ---- credits ----
export function gainCredits(g, player, n, why = '') {
  g.state[player].credits += n;
  emit(g, 'credits-gained', { who: player, n, why });
}

// purpose: undefined | 'icebreaker' | 'trace' | 'trash' | 'virus-install'
//          | 'hq-run' | 'remove-tag'  — unlocks matching recurring-credit pools.
export function canPay(g, player, n, purpose) {
  return g.state[player].credits + poolTotal(g, player, purpose) >= n;
}
export function pay(g, player, n, why = '', purpose) {
  if (n === 0) return;
  let rest = n;
  // recurring-credit pools first (documented simplification: auto-spend)
  for (const it of poolsFor(g, player, purpose)) {
    const used = Math.min(it.counters.recurring, rest);
    it.counters.recurring -= used; rest -= used;
    if (used) emit(g, 'pool-credits-spent', { from: it.card.title, used, why });
    if (!rest) return;
  }
  if (player === 'runner' && g.state.run) {
    for (const key of ['hostedCredits', 'bpCredits']) {   // Stimhack, bad pub
      const avail = g.state.run[key] ?? 0;
      const used = Math.min(avail, rest);
      g.state.run[key] = avail - used; rest -= used;
      if (!rest) { emit(g, 'credits-spent', { who: player, n, why }); return; }
    }
  }
  if (g.state[player].credits < rest) throw new Error(`${player} cannot pay ${n} (${why})`);
  g.state[player].credits -= rest;
  emit(g, 'credits-spent', { who: player, n, why });
}

// ---- cards ----
export function draw(g, player, n = 1) {
  const p = g.state[player];
  const drawn = [];
  for (let i = 0; i < n; i++) {
    if (p.deck.length === 0) {
      if (player === 'corp') { win(g, 'runner', 'decked'); }
      return drawn;
    }
    drawn.push(p.deck[0]);
    moveCard(g, p.deck[0], `${player}-hand`);
    emit(g, 'card-drawn', { who: player, handSize: p.hand.length });
  }
  return drawn;
}

export function trash(g, id, why = '') {
  const it = inst(g, id);
  // trash hosted cards along with their host
  for (const other of Object.values(g.insts)) {
    if (other.hostId === id && !other.zone.startsWith('corp-') && !other.zone.startsWith('runner-')) {
      trash(g, other.id, 'host trashed');
    }
  }
  const owner = it.card.side;
  const to = owner === 'corp' ? 'corp-archives' : 'runner-discard';
  it.faceup = true; // trashed corp cards go to archives faceup
  moveCard(g, id, to);
  emit(g, 'card-trashed', { id, code: it.code, title: it.card.title, why });
}

// Trash with prevention window (Fall Guy, Sacrificial Construct).
// kind: 'resource' | 'program' | 'hardware'
export function* trashWithPrevention(g, id, why = '') {
  const it = inst(g, id);
  const kind = it.card.type;
  for (const h of collect(g, 'preventTrash')) {
    if (h.id === id) continue;
    if (!h.script.preventTrash.types.includes(kind)) continue;
    const p = yield choice('runner',
      `${it.card.title} is being trashed (${why}). Use ${h.it.card.title} to prevent?`,
      [opt('prevent', `Trash ${h.it.card.title} to prevent`), opt('no', 'Allow it')],
      { prevention: true });
    if (p === 'prevent') {
      trash(g, h.id, 'prevention');
      emit(g, 'trash-prevented', { saved: it.card.title, by: h.it.card.title });
      return false;
    }
  }
  trash(g, id, why);
  return true;
}

// ---- damage ----
export function* damage(g, type, n, why = '', { unpreventable = false } = {}) {
  const r = g.state.runner;
  // interrupt-style boosts (The Cleaners: meat +1)
  n += modSum(g, 'damageMod', type);
  // prevention window (Crash Space etc.)
  if (!unpreventable) {
    for (const h of collect(g, 'preventDamage')) {
      if (n <= 0) break;
      const pd = h.script.preventDamage;
      if (!pd.types.includes(type)) continue;
      const p = yield choice('runner',
        `${n} ${type} damage incoming (${why}). Use ${h.it.card.title}?`,
        [opt('prevent', `${h.it.card.title}: prevent up to ${pd.amount}`), opt('no', 'Take the damage')],
        { prevention: true });
      if (p === 'prevent') {
        if (pd.trashSelf) trash(g, h.id, 'prevention');
        n = Math.max(0, n - pd.amount);
        emit(g, 'damage-prevented', { by: h.it.card.title, remaining: n });
      }
    }
  }
  if (n <= 0) return;
  emit(g, 'damage', { type, n, why });
  if (n > r.hand.length) { win(g, 'corp', 'flatline'); return; }
  for (let i = 0; i < n; i++) {
    const id = g.rng.pick(r.hand);
    moveCard(g, id, 'runner-discard');
    emit(g, 'damage-card-lost', { id, code: inst(g, id).code, type });
  }
  if (type === 'core') {
    r.brainDamage += n;
    emit(g, 'brain-damage', { total: r.brainDamage });
  }
}

// ---- tags / bad publicity ----
export function addTags(g, n, why = '') {
  g.state.runner.tags += n;
  emit(g, 'tags-added', { n, total: g.state.runner.tags, why });
}
export function removeTag(g, n = 1) {
  g.state.runner.tags = Math.max(0, g.state.runner.tags - n);
  emit(g, 'tag-removed', { total: g.state.runner.tags });
}
export function addBadPublicity(g, n, why = '') {
  g.state.corp.badPublicity += n;
  emit(g, 'bad-publicity', { n, total: g.state.corp.badPublicity, why });
}
export function removeBadPublicity(g, n = 1) {
  g.state.corp.badPublicity = Math.max(0, g.state.corp.badPublicity - n);
  emit(g, 'bad-publicity', { n: -n, total: g.state.corp.badPublicity });
}

// ---- traces ----
export function* trace(g, base, ctx = '') {
  const c = g.state.corp, r = g.state.runner;
  emit(g, 'trace-start', { base, ctx });
  const cMax = c.credits + poolTotal(g, 'corp', 'trace');
  const cBoost = yield number('corp', `Trace ${base} (${ctx}): boost trace strength? (1cr each)`, 0, cMax, { trace: true });
  pay(g, 'corp', cBoost, 'trace boost', 'trace');
  const ts = base + cBoost;
  const rMax = r.credits + poolTotal(g, 'runner', 'trace');
  const rBoost = yield number('runner', `Trace strength ${ts} vs link ${r.baseLink + linkBonus(g)}: boost link? (1cr each)`, 0, rMax, { trace: true });
  pay(g, 'runner', rBoost, 'link boost', 'trace');
  const link = r.baseLink + linkBonus(g) + rBoost;
  // Ties favor the Runner: trace succeeds only if strength strictly exceeds link
  // (Rules Reference: "If the link strength is equal to or greater than the
  // trace strength, then the trace is unsuccessful").
  const success = ts > link;
  emit(g, 'trace-result', { ts, link, success, ctx });
  for (const h of collect(g, 'onTraceResolved')) {
    yield* h.fn(g, { success, instId: h.id, ctx });
  }
  return success;
}
export function linkBonus(g) { return modSum(g, 'linkMod'); }

// ---- agendas / winning ----
export function* scoreAgendaFx(g, id) {
  const it = inst(g, id);
  it.faceup = true;
  moveCard(g, id, 'corp-score', { uninstall: false }); // keep counters/advancements
  it.rezzed = true;
  g.state.corp.agendaPoints += agendaPointsOf(g, it);
  emit(g, 'agenda-scored', { id, code: it.code, title: it.card.title, points: agendaPointsOf(g, it), total: g.state.corp.agendaPoints });
  const script = getScript(it.code);
  if (script?.onScore) yield* script.onScore(g, { instId: id });
  for (const h of collect(g, 'onAgendaScored')) {
    if (h.id !== id) yield* h.fn(g, { agendaId: id });
  }
  checkAgendaWin(g);
}

export function* stealAgendaFx(g, id) {
  const it = inst(g, id);
  it.faceup = true;
  moveCard(g, id, 'runner-score', { uninstall: false });
  g.state.runner.agendaPoints += agendaPointsOf(g, it);
  emit(g, 'agenda-stolen', { id, code: it.code, title: it.card.title, points: agendaPointsOf(g, it), total: g.state.runner.agendaPoints });
  (g.state.flags.turn.stolen ??= []).push(id);
  const script = getScript(it.code);
  if (script?.onSteal) yield* script.onSteal(g, { instId: id });
  for (const h of collect(g, 'onAgendaStolen')) {
    if (h.id !== id) yield* h.fn(g, { agendaId: id });
  }
  checkAgendaWin(g);
}

export function agendaPointsOf(g, it) {
  const script = getScript(it.code);
  return (it.card.agendaPoints ?? 0) + (script?.bonusPoints?.(g, it) ?? 0); // Beale
}

export function forfeit(g, player, id) {
  const it = inst(g, id);
  g.state[player].agendaPoints -= agendaPointsOf(g, it);
  moveCard(g, id, 'removed');
  emit(g, 'agenda-forfeited', { who: player, id, title: it.card.title });
}

export function checkAgendaWin(g) {
  if (g.state.corp.agendaPoints >= 7) win(g, 'corp', 'agendas');
  else if (g.state.runner.agendaPoints >= 7) win(g, 'runner', 'agendas');
}

export function win(g, player, reason) {
  if (g.state.winner) return;
  g.state.winner = player; g.state.winReason = reason;
  emit(g, 'game-over', { winner: player, reason });
}

// ---- rez / derez / expose ----
export function rezCost(g, id) {
  const it = inst(g, id);
  return Math.max(0, (it.card.cost ?? 0) + modSum(g, 'rezCostMod', it));
}
export function* rezFx(g, id, { ignoreCost = false } = {}) {
  const it = inst(g, id);
  if (!ignoreCost) pay(g, 'corp', rezCost(g, id), `rez ${it.card.title}`);
  it.rezzed = true; it.faceup = true;
  if (it.card.type === 'ice') g.state.flags.turn.iceRezzed = (g.state.flags.turn.iceRezzed ?? 0) + 1;
  emit(g, it.card.type === 'ice' ? 'ice-rezzed' : 'card-rezzed', { id, code: it.code, title: it.card.title });
  const script = getScript(it.code);
  if (script?.onRez) yield* script.onRez(g, { instId: id });
}
export function derez(g, id) {
  const it = inst(g, id);
  it.rezzed = false;
  emit(g, 'derezzed', { id, code: it.code, title: it.card.title });
}
export function expose(g, id) {
  const it = inst(g, id);
  emit(g, 'exposed', { id, code: it.code, title: it.card.title });
}

// ---- misc ----
export function purgeVirus(g) {
  for (const it of Object.values(g.insts)) {
    if (it.counters.virus) it.counters.virus = 0;
  }
  emit(g, 'virus-purged', {});
}

export function* discardToHandSize(g, player) {
  const p = g.state[player];
  // Flatline: maximum hand size below zero (brain damage) at end of turn —
  // distinct from the "damage exceeds grip" flatline check in damage() above.
  if (player === 'runner' && handSizeRaw(g, player) < 0) {
    win(g, 'corp', 'flatline');
    return;
  }
  const max = handSize(g, player);
  while (p.hand.length > max) {
    const pick = yield choice(player, `Discard down to ${max}: choose a card`,
      p.hand.map(id => opt(`d:${id}`, cardOf(g, id).title, { instId: id })),
      { discard: true });
    const id = Number(pick.split(':')[1]);
    moveCard(g, id, player === 'corp' ? 'corp-archives' : 'runner-discard');
    if (player === 'corp') inst(g, id).faceup = false; // corp discards facedown
    emit(g, 'card-discarded', { who: player, id, code: inst(g, id).code });
  }
}

// search a zone list for cards matching pred; runner/corp picks one (or none)
export function* searchAndPick(g, player, zone, pred, prompt, { optional = true } = {}) {
  const p = g.state[player];
  const list = zone === 'deck' ? p.deck : p.discard ?? p.archives;
  const matches = list.filter(id => pred(cardOf(g, id)));
  const options = matches.map(id => opt(`s:${id}`, cardOf(g, id).title));
  if (optional || !options.length) options.push(opt('none', 'None / cancel'));
  if (!matches.length) { emit(g, 'search-whiffed', { zone }); return null; }
  const pick = yield choice(player, prompt, options, { search: true });
  return pick === 'none' ? null : Number(pick.split(':')[1]);
}
export function shuffleDeck(g, player) {
  g.rng.shuffle(g.state[player].deck);
  emit(g, 'deck-shuffled', { who: player });
}

// legacy names used by older tests
export { scoreAgendaFx as scoreAgenda, stealAgendaFx as stealAgenda };
