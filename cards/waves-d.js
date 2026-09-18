// Batch D: Shaper + neutral-runner cards, Revised Core Set (codes 20037-20060,
// excluding pilot codes 20048 Battering Ram / 20049 Gordian Blade). Faithful
// to printed text; deviations noted in docs/CARD_COVERAGE.md.
import { define } from './registry.js';
import { getScript } from './registry.js';
import * as fx from '../engine/effects.js';
import { inst, cardOf, moveCard } from '../engine/state.js';
import { choice, opt } from '../engine/decisions.js';
import { installedRunner, installedCorp } from '../engine/hooks.js';
import { runnerInstall } from '../engine/game.js';
import { doRun } from '../engine/run.js';

let registered = false;
export function registerWavesD(db) {
  if (registered) return; registered = true;
  const code = t => db.titled(t).code;

  // 20037 Chaos Theory: Wünderkind — +1 memory unit.
  define(code('Chaos Theory: Wunderkind'), {
    memoryMod: 1,
  });

  // 20038 Diesel — draw 3 cards.
  define(code('Diesel'), {
    *onPlay(g) { fx.draw(g, 'runner', 3); },
  });

  // 20039 Indexing — run R&D; if successful, instead of breaching, may look
  // at the top 5 cards of R&D and arrange them in any order.
  define(code('Indexing'), {
    *onPlay(g) {
      yield* doRun(g, 'rd', {
        insteadLabel: 'Look at the top 5 cards of R&D and arrange them in any order',
        *insteadOnSuccess(g) {
          const n = Math.min(5, g.state.corp.deck.length);
          if (n === 0) return;
          const top = g.state.corp.deck.slice(0, n);
          const remaining = [...top];
          const order = [];
          while (remaining.length) {
            const pick = yield choice('runner',
              `Indexing: choose the next card for the top of R&D (${order.length + 1} of ${n})`,
              remaining.map(id => opt(`c:${id}`, cardOf(g, id).title)));
            const id = Number(pick.split(':')[1]);
            order.push(id);
            remaining.splice(remaining.indexOf(id), 1);
          }
          // reordering within the same zone (not a zone-to-zone move), so a
          // direct splice on the R&D array is used rather than moveCard.
          g.state.corp.deck.splice(0, n, ...order);
          fx.emit(g, 'deck-rearranged', { who: 'corp', zone: 'rd', n });
        },
      });
    },
  });

  // 20040 Modded — install a program or piece of hardware from the grip,
  // lowering the install cost by 3.
  define(code('Modded'), {
    *onPlay(g) {
      const targets = g.state.runner.hand.filter(id =>
        ['program', 'hardware'].includes(cardOf(g, id).type) &&
        fx.canPay(g, 'runner', Math.max(0, (cardOf(g, id).cost ?? 0) - 3)));
      if (!targets.length) { fx.emit(g, 'search-whiffed', { why: 'Modded' }); return; }
      const pick = yield choice('runner', 'Modded: install a program or piece of hardware (cost -3)',
        targets.map(id => opt(`t:${id}`, `${cardOf(g, id).title} (${Math.max(0, (cardOf(g, id).cost ?? 0) - 3)}cr)`)));
      const id = Number(pick.split(':')[1]);
      yield* runnerInstall(g, id, { noClick: true, discount: 3 });
    },
  });

  // 20041 Notoriety — play only after a successful run this turn on R&D, HQ,
  // and Archives; add Notoriety to the score area as a 1-point agenda.
  define(code('Notoriety'), {
    canPlay(g) {
      const sr = g.state.flags.turn.successfulRuns ?? [];
      return ['rd', 'hq', 'archives'].every(s => sr.includes(s));
    },
    *onPlay(g, { instId }) {
      moveCard(g, instId, 'runner-score');
      g.state.runner.agendaPoints += 1;
      fx.emit(g, 'notoriety-scored', { id: instId, title: 'Notoriety', points: 1, total: g.state.runner.agendaPoints });
      fx.checkAgendaWin(g);
    },
  });

  // 20042 Test Run — search stack or heap for 1 program, install it ignoring
  // all costs; shuffle the stack if it was searched. At the end of this turn,
  // if the program hasn't been uninstalled, it returns to the top of the
  // stack (engine/game.js#endOfTurn's generic `pendingReturnToStack` check —
  // Phase 9: this was previously deferred as a missing delayed-trigger
  // facility; fixed by adding that generic one-shot marker/check).
  define(code('Test Run'), {
    *onPlay(g) {
      const zone = yield choice('runner', 'Test Run: search your stack or heap for a program?',
        [opt('deck', 'Stack'), opt('discard', 'Heap')]);
      const id = yield* fx.searchAndPick(g, 'runner', zone, c => c.type === 'program',
        `Test Run: search your ${zone === 'deck' ? 'stack' : 'heap'} for a program`);
      if (zone === 'deck') fx.shuffleDeck(g, 'runner');
      if (id != null) {
        yield* runnerInstall(g, id, { noClick: true, noCost: true });
        inst(g, id).pendingReturnToStack = true;
      }
    },
  });

  // 20043 The Maker's Eye — run R&D; if successful, access 2 additional
  // cards when breaching R&D.
  define(code("The Maker's Eye"), {
    *onPlay(g) { yield* doRun(g, 'rd', { accessBonus: 2 }); },
  });

  // 20044 Tinkering — choose a piece of ice; it gains sentry, code gate, and
  // barrier until the end of the turn.
  define(code('Tinkering'), {
    *onPlay(g) {
      const ice = installedCorp(g).filter(id => cardOf(g, id).type === 'ice');
      if (!ice.length) { fx.emit(g, 'search-whiffed', { why: 'Tinkering' }); return; }
      const pick = yield choice('runner', 'Tinkering: choose a piece of ice',
        ice.map(id => opt(`t:${id}`, cardOf(g, id).title)));
      const iceId = Number(pick.split(':')[1]);
      (g.state.flags.turn.tinkered ??= {})[iceId] = ['sentry', 'code-gate', 'barrier'];
      fx.emit(g, 'tinkered', { iceId });
    },
  });

  // 20045 Dinosaurus — console; hosts a single non-AI icebreaker for free
  // (no MU cost); hosted icebreaker gets +2 strength.
  define(code('Dinosaurus'), {
    canHostBreaker: true,
    hostedMemoryFree: true,
    breakerStrengthMod(g, it, breaker) { return breaker.hostId === it.id ? 2 : 0; },
  });

  // 20046 Rabbit Hole — +1 link. Install: may search the stack for another
  // copy of Rabbit Hole and install it, paying its cost; shuffle the stack.
  define(code('Rabbit Hole'), {
    linkMod: () => 1,
    *onInstall(g) {
      const id = yield* fx.searchAndPick(g, 'runner', 'deck', c => c.title === 'Rabbit Hole',
        'Rabbit Hole: search your stack for another copy to install?');
      fx.shuffleDeck(g, 'runner');
      if (id != null) yield* runnerInstall(g, id, { noClick: true }); // cost still paid
    },
  });

  // 20047 The Personal Touch — install only on an icebreaker; hosted
  // icebreaker gets +1 strength.
  // Deviation: the printed "install only on an icebreaker" restriction is
  // not enforced as an install-target gate (the engine has no generic
  // install-target-restriction hook for hardware); instead the choice of
  // which installed icebreaker to host on is made via onInstall. If no
  // icebreaker is installed, the install fizzles (emits `search-whiffed`)
  // rather than being blocked outright — per CARD_GUIDANCE the Runner
  // shouldn't play it into that situation.
  define(code('The Personal Touch'), {
    *onInstall(g, { instId }) {
      const breakers = installedRunner(g).filter(id =>
        cardOf(g, id).type === 'program' && getScript(cardOf(g, id).code)?.breaker);
      if (!breakers.length) { fx.emit(g, 'search-whiffed', { why: 'The Personal Touch' }); return; }
      const pick = yield choice('runner', 'The Personal Touch: choose an installed icebreaker to host on',
        breakers.map(id => opt(`t:${id}`, cardOf(g, id).title)));
      const bId = Number(pick.split(':')[1]);
      inst(g, instId).hostId = bId;
      fx.emit(g, 'hosted', { id: instId, on: bId });
    },
    breakerStrengthMod(g, it, breaker) { return it.hostId === breaker.id ? 1 : 0; },
  });

  // 20050 Magnum Opus — program, 2mu; [click]: gain 2 credits.
  define(code('Magnum Opus'), {
    actions: [{
      label: 'Gain 2 credits',
      clicks: 1,
      *effect(g) { fx.gainCredits(g, 'runner', 2, 'Magnum Opus'); },
    }],
  });

  // 20051 Pipeline — killer; break 1 sentry sub / 1cr; boost +1 str / 2cr
  // (remainder of the run).
  define(code('Pipeline'), {
    breaker: { types: ['sentry'],
      boost: { cost: 2, amount: 1, duration: 'run' },
      breakCost: { cost: 1, count: 1 } },
  });

  // 20052 Aesop's Pawnshop — turn start: may trash 1 of your other installed
  // cards; if you do, gain 3 credits.
  define(code("Aesop's Pawnshop"), {
    *onTurnStart(g, { instId }) {
      const others = installedRunner(g).filter(id => id !== instId);
      if (!others.length) return;
      const pick = yield choice('runner', "Aesop's Pawnshop: trash 1 of your other installed cards for 3cr?",
        [...others.map(id => opt(`t:${id}`, cardOf(g, id).title)), opt('no', 'Decline')]);
      if (pick === 'no') return;
      const id = Number(pick.split(':')[1]);
      fx.trash(g, id, "Aesop's Pawnshop");
      fx.gainCredits(g, 'runner', 3, "Aesop's Pawnshop");
    },
  });

  // 20053 All-nighter — [click], trash: gain [click][click] (net +1 click).
  define(code('All-nighter'), {
    actions: [{
      label: 'Trash All-nighter: gain 2 clicks',
      clicks: 1,
      trashSelf: true,
      *effect(g) { g.state.runner.clicks += 2; fx.emit(g, 'clicks-gained', { who: 'runner', n: 2, why: 'All-nighter' }); },
    }],
  });

  // 20054 Sacrificial Construct — interrupt -> trash: prevent a player from
  // trashing 1 installed program or piece of hardware.
  define(code('Sacrificial Construct'), {
    preventTrash: { types: ['program', 'hardware'] },
  });

  // 20055 Infiltration — gain 2 credits or expose 1 card.
  define(code('Infiltration'), {
    *onPlay(g) {
      const targets = installedCorp(g).filter(id => !inst(g, id).rezzed);
      const options = [opt('credits', 'Gain 2 credits')];
      if (targets.length) options.push(opt('expose', 'Expose 1 card'));
      const pick = yield choice('runner', 'Infiltration: gain 2 credits or expose a card?', options);
      if (pick === 'credits') { fx.gainCredits(g, 'runner', 2, 'Infiltration'); return; }
      const tPick = yield choice('runner', 'Infiltration: choose an unrezzed installed card to expose',
        targets.map(id => opt(`t:${id}`, cardOf(g, id).title)));
      fx.expose(g, Number(tPick.split(':')[1]));
    },
  });

  // 20057 Dyson Mem Chip — +1mu, +1 link.
  define(code('Dyson Mem Chip'), {
    memoryMod: 1,
    linkMod: () => 1,
  });

  // 20058 Crypsis — AI icebreaker; break 1 sub (any type) / 1cr; boost +1
  // str / 1cr (this encounter); [click]: place 1 virus counter. Whenever an
  // encounter ends, if used to break a sub during it: remove 1 hosted virus
  // counter, else trash Crypsis.
  define(code('Crypsis'), {
    breaker: { types: ['all'],
      boost: { cost: 1, amount: 1 },
      breakCost: { cost: 1, count: 1 } },
    actions: [{
      label: 'Place 1 virus counter on Crypsis',
      clicks: 1,
      *effect(g, { instId }) {
        fx.addVirusCounter(g, instId, 1, 'Crypsis');
      },
    }],
    *onEncounterEndIfUsed(g, { instId }) {
      const it = inst(g, instId);
      if ((it.counters.virus ?? 0) > 0) it.counters.virus--;
      else fx.trash(g, instId, 'Crypsis');
    },
  });

  // 20059 Armitage Codebusting — install: load 12cr. [click]: take 2cr (or
  // remainder). Trash when empty.
  define(code('Armitage Codebusting'), {
    *onInstall(g, { instId }) {
      inst(g, instId).counters.credit = 12;
      fx.emit(g, 'counters-loaded', { id: instId, n: 12, kind: 'credit' });
    },
    actions: [{
      label: 'Take 2 credits from Armitage Codebusting',
      clicks: 1,
      *effect(g, { instId }) {
        const it = inst(g, instId);
        const n = Math.min(2, it.counters.credit ?? 0);
        it.counters.credit -= n;
        fx.gainCredits(g, 'runner', n, 'Armitage Codebusting');
        if (it.counters.credit <= 0) fx.trash(g, instId, 'Armitage Codebusting empty');
      },
    }],
  });

  // 20060 Underworld Contact — turn start: gain 1cr if you have at least 2
  // link.
  define(code('Underworld Contact'), {
    *onTurnStart(g) {
      const link = g.state.runner.baseLink + fx.linkBonus(g);
      if (link >= 2) fx.gainCredits(g, 'runner', 1, 'Underworld Contact');
    },
  });
}
