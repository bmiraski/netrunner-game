// Shared rules effects: money, cards, damage, tags, traces, scoring, winning.
// Functions that may need player decisions are generators (yield decisions).
import { inst, cardOf, moveCard, handSize, handSizeRaw } from './state.js';
import { choice, opt, number } from './decisions.js';
import { getScript } from '../cards/registry.js';
import { poolsFor, poolTotal, collect, modSum, oncePerTurn } from './hooks.js';

const emit = (g, type, data) =>
  g.log.emit(type, data, { turn: g.state.turn, player: g.state.activePlayer });

export { emit };

// ---- credits ----
export function gainCredits(g, player, n, why = '') {
  g.state[player].credits += n;
  emit(g, 'credits-gained', { who: player, n, why });
}

// ---- virus counters ----
// Card scripts that ADD virus counters to a program should call this
// instead of mutating `it.counters.virus` directly, so Surge ("play only if
// you placed at least 1 virus counter on a program this turn; place 2 more
// on that program") can find which program(s) qualify. Tracked on
// flags.turn (reset every turn start) as a Set of instance ids.
export function addVirusCounter(g, instId, n = 1, why = '') {
  const it = inst(g, instId);
  it.counters.virus = (it.counters.virus ?? 0) + n;
  emit(g, 'counters-added', { id: instId, n, kind: 'virus', total: it.counters.virus });
  if (it.card.type === 'program') (g.state.flags.turn.virusProgramsGained ??= new Set()).add(instId);
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
      // req (Plascrete Carapace): extra availability gate, e.g. "only while
      // a hosted counter remains" — checked like any other req().
      if (pd.req && !pd.req(g, h.it)) continue;
      // perTurn (Muresh Bodysuit): mandatory, auto-applies at most once per
      // turn per source — no prompt, so combine only with auto:true.
      if (pd.perTurn && !oncePerTurn(g, `preventDamage:${h.id}`)) continue;
      let use = pd.auto;
      if (!pd.auto) {
        const p = yield choice('runner',
          `${n} ${type} damage incoming (${why}). Use ${h.it.card.title}?`,
          [opt('prevent', `${h.it.card.title}: prevent up to ${pd.amount === Infinity ? 'all' : pd.amount}`), opt('no', 'Take the damage')],
          { prevention: true });
        use = p === 'prevent';
      }
      if (use) {
        if (pd.trashSelf) trash(g, h.id, 'prevention');
        // consumeCounter (Plascrete Carapace): spend 1 hosted counter of the
        // named kind per use instead of trashing outright; trash once empty.
        if (pd.consumeCounter) {
          const it2 = h.it;
          it2.counters[pd.consumeCounter] = (it2.counters[pd.consumeCounter] ?? 0) - 1;
          emit(g, 'counters-added', { id: h.id, n: -1, kind: pd.consumeCounter, total: it2.counters[pd.consumeCounter] });
          if (it2.counters[pd.consumeCounter] <= 0) trash(g, h.id, 'empty');
        }
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
// Generator: interrupt window for tag prevention (New Angeles City Hall —
// "2cr: prevent 1 tag"), offered once PER TAG so a partial prevention (ran
// out of credits partway through a multi-tag gain) works correctly. Script
// hook: preventTag = {label, req(g,it), effect*(g,{instId})}. When no card
// has this hook (the overwhelming common case) the for-of finds nothing, no
// decision is ever yielded, and this behaves exactly like the old plain
// function — every existing `yield* fx.addTags(...)` call site is safe.
export function* addTags(g, n, why = '') {
  let remaining = n;
  while (remaining > 0) {
    let prevented = false;
    for (const h of collect(g, 'preventTag')) {
      const t = h.script.preventTag;
      if (!t.req(g, h.it)) continue;
      const p = yield choice('runner', `${h.it.card.title}: ${t.label}?`,
        [opt('yes', t.label), opt('no', 'Decline')]);
      if (p === 'yes') { yield* t.effect(g, { instId: h.id }); prevented = true; break; }
    }
    if (!prevented) break;
    remaining--;
  }
  if (remaining > 0) {
    g.state.runner.tags += remaining;
    emit(g, 'tags-added', { n: remaining, total: g.state.runner.tags, why });
  }
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
  // Interrupt window: cards that can reduce/zero the BASE trace strength
  // before any boosts are chosen (Disrupter — "reduce the base trace
  // strength of a trace to 0"). Generic hook: script.traceInterrupt =
  // {label, req(g,it), effect(g,{instId,base}) -> newBase}.
  for (const h of collect(g, 'traceInterrupt')) {
    const t = h.script.traceInterrupt;
    if (!t.req(g, h.it)) continue;
    const p = yield choice('runner', `${h.it.card.title}: ${t.label}?`,
      [opt('yes', t.label), opt('no', 'Decline')]);
    if (p === 'yes') base = yield* t.effect(g, { instId: h.id, base });
  }
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
  // Margin (trace strength above link), for effects sized by "the amount by
  // which your trace strength exceeded the Runner's link strength" (Power
  // Grid Overload, Data Hound, Midseason Replacements, ...). Transient —
  // read it immediately after the yield* fx.trace(...) call that set it,
  // before any other trace can run.
  g.state.flags.lastTraceMargin = Math.max(0, ts - link);
  emit(g, 'trace-result', { ts, link, success, ctx });
  for (const h of collect(g, 'onTraceResolved')) {
    yield* h.fn(g, { success, instId: h.id, ctx });
  }
  return success;
}
export function linkBonus(g) { return modSum(g, 'linkMod'); }

// ---- psi games ----
// "You and the Runner secretly spend 0, 1, or 2 credits. Reveal spent
// credits. <effect> if you and the Runner spent a different number of
// credits." (Snowflake, Bullfrog, and future Psi ice/ops.)
//
// The engine has no true simultaneous decisions — corp and runner each
// yield in turn, like trace() — but unlike trace() neither side's pick may
// be visible to the other before both have committed, or the "secret" part
// is broken (a human runner could see the corp's bet in the log and choose
// to dodge/match it before making their own). So both `number` decisions
// are yielded back-to-back with NO payment or event emitted in between;
// only once both sides have locked in a pick do we pay and reveal
// (`psi-result`), in one shot. AI handlers must likewise not use any
// information from the corp's pick when computing the runner's (ai/corp.js,
// ai/runner.js) — there is nothing in `g.state` to peek at yet regardless,
// since payment is deferred, but the ordering here is what makes that true.
// Returns true if the two bets differed (the printed "if different" case).
export function* psiGame(g, ctx = '') {
  const cMax = Math.min(2, g.state.corp.credits + poolTotal(g, 'corp', 'psi'));
  const rMax = Math.min(2, g.state.runner.credits + poolTotal(g, 'runner', 'psi'));
  const cBet = yield number('corp', `Psi game (${ctx}): secretly bet 0, 1, or 2cr.`, 0, cMax, { psi: true });
  const rBet = yield number('runner', `Psi game (${ctx}): secretly bet 0, 1, or 2cr.`, 0, rMax, { psi: true });
  pay(g, 'corp', cBet, 'psi game', 'psi');
  pay(g, 'runner', rBet, 'psi game', 'psi');
  const same = cBet === rBet;
  emit(g, 'psi-result', { corp: cBet, runner: rBet, same, ctx });
  return !same;
}

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
    // instId: h.id lets a self-referential hook trash/modify itself (New
    // Angeles City Hall: "when you steal an agenda, trash this resource"),
    // mirroring onRunSuccessful's instId — Personal Evolution's existing
    // onAgendaStolen(g) ignores the extra field, so this is backward-safe.
    if (h.id !== id) yield* h.fn(g, { agendaId: id, instId: h.id });
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
  // rezCostBumps: targeted, until-end-of-turn rez cost increases on a
  // specific instance (Cortez Chip) — stored on flags.turn so it clears
  // automatically at the next turn boundary, since the card that set it
  // (trashed to pay its own cost) is no longer a live hook source.
  const bump = g.state.flags.turn.rezCostBumps?.[id] ?? 0;
  return Math.max(0, (it.card.cost ?? 0) + modSum(g, 'rezCostMod', it) + bump);
}
export function* rezFx(g, id, { ignoreCost = false } = {}) {
  const it = inst(g, id);
  if (!ignoreCost) pay(g, 'corp', rezCost(g, id), `rez ${it.card.title}`, it.card.type === 'ice' ? 'rez-ice' : undefined);
  it.rezzed = true; it.faceup = true;
  if (it.card.type === 'ice') g.state.flags.turn.iceRezzed = (g.state.flags.turn.iceRezzed ?? 0) + 1;
  emit(g, it.card.type === 'ice' ? 'ice-rezzed' : 'card-rezzed', { id, code: it.code, title: it.card.title });
  const script = getScript(it.code);
  if (script?.onRez) yield* script.onRez(g, { instId: id });
  if (it.card.type === 'ice') {
    // broadcast hook: any OTHER card reacting to a piece of ice being rezzed
    // (Compromised Employee). Distinct from onRez, which only fires for the
    // ice's own script.
    for (const h of collect(g, 'onIceRezzed')) yield* h.fn(g, { iceId: id });
  }
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
