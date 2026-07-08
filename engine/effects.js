// Shared rules effects: money, cards, damage, tags, traces, scoring, winning.
// Functions that may need player decisions are generators (yield decisions).
import { inst, cardOf, moveCard, handSize } from './state.js';
import { choice, opt, number } from './decisions.js';
import { getScript } from '../cards/registry.js';

const emit = (g, type, data) =>
  g.log.emit(type, data, { turn: g.state.turn, player: g.state.activePlayer });

export { emit };

// ---- credits ----
export function gainCredits(g, player, n, why = '') {
  g.state[player].credits += n;
  emit(g, 'credits-gained', { who: player, n, why });
}
export function canPay(g, player, n) {
  let avail = g.state[player].credits;
  if (player === 'runner' && g.state.run) avail += g.state.run.bpCredits;
  return avail >= n;
}
export function pay(g, player, n, why = '') {
  if (n === 0) return;
  let rest = n;
  if (player === 'runner' && g.state.run && g.state.run.bpCredits > 0) {
    const used = Math.min(g.state.run.bpCredits, rest);
    g.state.run.bpCredits -= used; rest -= used;
  }
  if (g.state[player].credits < rest) throw new Error(`${player} cannot pay ${n}`);
  g.state[player].credits -= rest;
  emit(g, 'credits-spent', { who: player, n, why });
}

// ---- cards ----
export function draw(g, player, n = 1) {
  const p = g.state[player];
  for (let i = 0; i < n; i++) {
    if (p.deck.length === 0) {
      if (player === 'corp') { win(g, 'runner', 'decked'); }
      return false;
    }
    moveCard(g, p.deck[0], `${player}-hand`);
    emit(g, 'card-drawn', { who: player, handSize: p.hand.length });
  }
  return true;
}

export function trash(g, id, why = '') {
  const it = inst(g, id);
  const owner = it.card.side;
  const to = owner === 'corp' ? 'corp-archives' : 'runner-discard';
  it.faceup = true; // trashed corp cards go to archives faceup
  moveCard(g, id, to);
  emit(g, 'card-trashed', { id, code: it.code, title: it.card.title, why });
}

// ---- damage ----
export function* damage(g, type, n, why = '') {
  // type: 'meat' | 'net' | 'core' (brain)
  const r = g.state.runner;
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

// ---- tags ----
export function addTags(g, n, why = '') {
  g.state.runner.tags += n;
  emit(g, 'tags-added', { n, total: g.state.runner.tags, why });
}
export function removeTag(g, n = 1) {
  g.state.runner.tags = Math.max(0, g.state.runner.tags - n);
  emit(g, 'tag-removed', { total: g.state.runner.tags });
}

// ---- traces ----
export function* trace(g, base, ctx = '') {
  // Corp boosts trace strength, then Runner boosts link. Success if ts >= link.
  const c = g.state.corp, r = g.state.runner;
  emit(g, 'trace-start', { base, ctx });
  const cBoost = yield number('corp', `Trace ${base} (${ctx}): boost trace strength? (1cr each)`, 0, c.credits, { trace: true });
  pay(g, 'corp', cBoost, 'trace boost');
  const ts = base + cBoost;
  const maxR = r.credits + (g.state.run?.bpCredits ?? 0);
  const rBoost = yield number('runner', `Trace strength ${ts} vs link ${r.baseLink}: boost link? (1cr each)`, 0, maxR, { trace: true });
  pay(g, 'runner', rBoost, 'link boost');
  const link = r.baseLink + rBoost;
  const success = ts >= link;
  emit(g, 'trace-result', { ts, link, success, ctx });
  return success;
}

// ---- agendas / winning ----
export function scoreAgenda(g, id) {
  const it = inst(g, id);
  it.faceup = true;
  moveCard(g, id, 'corp-score');
  g.state.corp.agendaPoints += it.card.agendaPoints;
  emit(g, 'agenda-scored', { id, code: it.code, title: it.card.title, points: it.card.agendaPoints, total: g.state.corp.agendaPoints });
  checkAgendaWin(g);
  return getScript(it.code)?.onScore ?? null; // Phase 3: on-score abilities
}

export function stealAgenda(g, id) {
  const it = inst(g, id);
  it.faceup = true;
  moveCard(g, id, 'runner-score');
  g.state.runner.agendaPoints += it.card.agendaPoints;
  emit(g, 'agenda-stolen', { id, code: it.code, title: it.card.title, points: it.card.agendaPoints, total: g.state.runner.agendaPoints });
  checkAgendaWin(g);
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

// ---- misc actions' effects ----
export function purgeVirus(g) {
  for (const it of Object.values(g.insts)) {
    if (it.counters.virus) it.counters.virus = 0;
  }
  emit(g, 'virus-purged', {});
}

// ---- discard down to hand size (shared by both discard phases) ----
export function* discardToHandSize(g, player) {
  const p = g.state[player];
  const max = handSize(g, player);
  while (p.hand.length > max) {
    const pick = yield choice(player, `Discard down to ${max}: choose a card`,
      p.hand.map(id => opt(`d:${id}`, cardOf(g, id).title, { instId: id })),
      { discard: true });
    const id = Number(pick.split(':')[1]);
    moveCard(g, id, player === 'corp' ? 'corp-archives' : 'runner-discard');
    // corp discards to archives FACEDOWN
    if (player === 'corp') inst(g, id).faceup = false;
    emit(g, 'card-discarded', { who: player, id, code: inst(g, id).code });
  }
}
