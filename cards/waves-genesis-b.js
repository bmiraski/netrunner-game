// Genesis Cycle Wave B: common patterns (trace ice, bioroid ice, advanceable
// ice, recurring credits, on-access/on-score/on-steal triggers) — the next
// batch after Wave A, still using only existing engine primitives plus a
// handful of small, generic hook additions made alongside this wave
// (documented at each use site below and in ENGINE.md/CARD_COVERAGE):
//   - trace() now stashes g.state.flags.lastTraceMargin (ts - link, floored
//     at 0) for margin-sized effects (Power Grid Overload, Data Hound,
//     Midseason Replacements)      — engine/effects.js#trace
//   - 'rez-ice' payment purpose (recurring credits usable for ice rez costs)
//                                                          — Dedicated Server
//   - advanceable may be a function (g, it) => bool, not just a literal
//     true, so "advance only while rezzed" ice can gate itself
//                                                — Woodcutter, Tyrant, Salvage
//   - derezAtTurnEnd instance flag: derezzes at the end of ANY turn (not
//     just the card's own side's turn, unlike onTurnEnd hooks) — Chimera
//   - noMoreRuns turn flag: hides the Runner's "Run on X" options for the
//     rest of the turn                                    — Uroboros
//   - preventDamage.auto + .perTurn (mandatory, no prompt, at most once per
//     turn per source)                                    — Muresh Bodysuit
//     (Muresh itself ships in Wave C; the primitive is added here since
//     Wave B's Woodcutter/Tyrant/Salvage advanceable work touched the same
//     area of the file — see docs/CARD_COVERAGE.md for the actual pending
//     status of each card)
//   - canInstall(g) hook for runner program/hardware/resource installs
//     (mirrors event canPlay)                              — Data Leak Reversal
//   - stealDecision now also reads the accessed agenda's OWN stealCost
//     (previously only upgrades-in-server and persistent extras)
//                                                                  — Fetal AI
// Faithful to printed text; deviations noted in docs/CARD_COVERAGE.md.
import { define } from './registry.js';
import * as fx from '../engine/effects.js';
import { inst, cardOf, moveCard } from '../engine/state.js';
import { choice, opt, number } from '../engine/decisions.js';
import { installedRunner, oncePerTurn } from '../engine/hooks.js';

let registered = false;
export function registerWavesGenesisB(db) {
  if (registered) return; registered = true;
  const code = t => db.titled(t).code;

  const etr = {
    label: 'End the run',
    *resolve(g) { g.state.run.ended = true; fx.emit(g, 'run-ends-sub', {}); },
  };
  const loseClickSub = {
    label: 'The Runner loses [click], if able',
    *resolve(g) {
      if (g.state.runner.clicks > 0) {
        g.state.runner.clicks--;
        fx.emit(g, 'clicks-lost', { who: 'runner', n: 1, why: 'subroutine' });
      }
    },
  };
  // Shared by Woodcutter/Tyrant/Salvage: "gains <sub> for each hosted
  // advancement counter" — a generous static array (capped at 8, far beyond
  // any realistic advancement count) with activeSubIndices slicing to the
  // current advancement total.
  const advancedSubIndices = (g, ice) => {
    const n = Math.min(ice.advancement, 8);
    return Array.from({ length: n }, (_, i) => i);
  };

  // ---------------- Corp: ice ----------------

  // 02012 Janus 1.0 — bioroid sentry: 4x core damage.
  define(code('Janus 1.0'), {
    clickBreak: true,
    subroutines: [
      { label: 'Do 1 core damage', *resolve(g) { yield* fx.damage(g, 'core', 1, 'Janus 1.0'); } },
      { label: 'Do 1 core damage', *resolve(g) { yield* fx.damage(g, 'core', 1, 'Janus 1.0'); } },
      { label: 'Do 1 core damage', *resolve(g) { yield* fx.damage(g, 'core', 1, 'Janus 1.0'); } },
      { label: 'Do 1 core damage', *resolve(g) { yield* fx.damage(g, 'core', 1, 'Janus 1.0'); } },
    ],
  });

  // 02017 TMI — on rez: trace 2, derez if unsuccessful. Sub: end the run.
  define(code('TMI'), {
    *onRez(g, { instId }) {
      if (!(yield* fx.trace(g, 2, 'TMI'))) fx.derez(g, instId);
    },
    subroutines: [etr],
  });

  // 02020 Dracō — on rez: spend any number of credits, place that many power
  // counters (+strength each). Sub: trace 2 -> tag + end the run.
  define(code('Dracō'), {
    *onRez(g, { instId }) {
      const max = g.state.corp.credits;
      const x = yield number('corp', 'Dracō: spend how many credits to place power counters?', 0, max);
      if (x > 0) {
        fx.pay(g, 'corp', x, 'Dracō');
        const it = inst(g, instId);
        it.counters.power = (it.counters.power ?? 0) + x;
        fx.emit(g, 'counters-added', { id: instId, n: x, kind: 'power', total: it.counters.power });
      }
    },
    strengthBonus: (g, it) => it.counters.power ?? 0,
    subroutines: [{
      label: 'Trace 2 - give the Runner 1 tag and end the run',
      *resolve(g) {
        if (yield* fx.trace(g, 2, 'Dracō')) {
          yield* fx.addTags(g, 1, 'Dracō');
          g.state.run.ended = true;
          fx.emit(g, 'run-ends-sub', {});
        }
      },
    }],
  });

  // 02030 Sherlock 1.0 — bioroid sentry: 2x trace 4 -> add an installed
  // program to the top of the Runner's stack (corp's choice).
  define(code('Sherlock 1.0'), {
    clickBreak: true,
    subroutines: [0, 1].map(() => ({
      label: 'Trace 4 - add 1 installed program to the top of the stack',
      *resolve(g) {
        if (yield* fx.trace(g, 4, 'Sherlock 1.0')) {
          const progs = g.state.runner.rig.program;
          if (!progs.length) return;
          const pick = yield choice('corp', 'Sherlock 1.0: add which installed program to the top of the stack?',
            progs.map(id => opt(`t:${id}`, cardOf(g, id).title)));
          const id = Number(pick.split(':')[1]);
          const title = cardOf(g, id).title;
          moveCard(g, id, 'runner-deck', { position: 'top' });
          fx.emit(g, 'card-returned-to-stack', { id, title });
        }
      },
    })),
  });

  // 02052 Viper — code gate: trace 3 -> lose click if able; trace 3 -> end
  // the run.
  define(code('Viper'), {
    subroutines: [
      loseClickSub,
      { label: 'Trace 3 - end the run', *resolve(g) {
          if (yield* fx.trace(g, 3, 'Viper')) { g.state.run.ended = true; fx.emit(g, 'run-ends-sub', {}); }
      } },
    ],
  });

  // 02057 Woodcutter — advanceable while rezzed (per printed text; this
  // engine restricts ice rez to the run-approach window, so — matching the
  // existing Shadow/Hadrian's Wall precedent in waves-b.js — advancing is
  // simply unconditional here). Gains "do 1 net damage" per hosted
  // advancement counter.
  define(code('Woodcutter'), {
    advanceable: true,
    activeSubIndices: advancedSubIndices,
    subroutines: Array(8).fill({ label: 'Do 1 net damage', *resolve(g) { yield* fx.damage(g, 'net', 1, 'Woodcutter'); } }),
  });

  // 02060 Chimera — on rez: choose sentry/code gate/barrier (reuses the
  // Tinkering per-ice subtype-override flag, scoped to just the chosen
  // type); derezzes at the end of any turn. Sub: end the run.
  define(code('Chimera'), {
    *onRez(g, { instId }) {
      const pick = yield choice('corp', 'Chimera: choose a subtype for this ice',
        [opt('sentry', 'Sentry'), opt('code-gate', 'Code Gate'), opt('barrier', 'Barrier')]);
      (g.state.flags.turn.tinkered ??= {})[instId] = [pick];
      inst(g, instId).derezAtTurnEnd = true;
      fx.emit(g, 'chimera-typed', { instId, type: pick });
    },
    subroutines: [etr],
  });

  // 02071 Hourglass — code gate: 3x "the Runner loses [click], if able."
  define(code('Hourglass'), {
    subroutines: [loseClickSub, loseClickSub, loseClickSub],
  });

  // 02074 Uroboros — sentry: trace 4 -> Runner cannot make another run this
  // turn; trace 4 -> end the run.
  define(code('Uroboros'), {
    subroutines: [
      { label: 'Trace 4 - the Runner cannot make another run this turn', *resolve(g) {
          if (yield* fx.trace(g, 4, 'Uroboros')) { g.state.flags.turn.noMoreRuns = true; fx.emit(g, 'no-more-runs', {}); }
      } },
      { label: 'Trace 4 - end the run', *resolve(g) {
          if (yield* fx.trace(g, 4, 'Uroboros')) { g.state.run.ended = true; fx.emit(g, 'run-ends-sub', {}); }
      } },
    ],
  });

  // 02078 Tyrant — advanceable while rezzed (see Woodcutter note above re:
  // the Shadow/Hadrian's Wall precedent). Gains "end the run" per hosted
  // advancement counter.
  define(code('Tyrant'), {
    advanceable: true,
    activeSubIndices: advancedSubIndices,
    subroutines: Array(8).fill(etr),
  });

  // 02096 Data Hound — sentry: trace 2 -> look at the top X cards of the
  // stack (X = trace margin), trash 1, arrange the rest on top.
  define(code('Data Hound'), {
    subroutines: [{
      label: 'Trace 2 - look at the top X cards of the stack, trash 1, and arrange the rest',
      *resolve(g) {
        if (!(yield* fx.trace(g, 2, 'Data Hound'))) return;
        const x = g.state.flags.lastTraceMargin;
        const n = Math.min(x, g.state.runner.deck.length);
        if (n === 0) return;
        const top = g.state.runner.deck.slice(0, n);
        const pick = yield choice('corp', 'Data Hound: trash which card?',
          top.map(id => opt(`t:${id}`, cardOf(g, id).title)));
        const trashId = Number(pick.split(':')[1]);
        fx.trash(g, trashId, 'Data Hound');
        const remaining = top.filter(id => id !== trashId);
        const order = [];
        const pool = [...remaining];
        while (pool.length) {
          const p2 = yield choice('corp', `Data Hound: choose the next card for the top of the stack (${order.length + 1} of ${remaining.length})`,
            pool.map(id => opt(`c:${id}`, cardOf(g, id).title)));
          const id2 = Number(p2.split(':')[1]);
          order.push(id2); pool.splice(pool.indexOf(id2), 1);
        }
        if (remaining.length) {
          // trashId is already spliced out by fx.trash, so `remaining` is
          // still sitting at the very front of the deck (in its original
          // relative order) — replace that front region with the chosen
          // order (same technique as Indexing's R&D rearrangement).
          g.state.runner.deck.splice(0, remaining.length, ...order);
          fx.emit(g, 'deck-rearranged', { who: 'runner', zone: 'stack', n: remaining.length });
        }
      },
    }],
  });

  // 02098 Salvage — advanceable while rezzed (see Woodcutter note above re:
  // the Shadow/Hadrian's Wall precedent). Gains "trace 2 -> 1 tag" per
  // hosted advancement counter.
  define(code('Salvage'), {
    advanceable: true,
    activeSubIndices: advancedSubIndices,
    subroutines: Array(8).fill({
      label: 'Trace 2 - give the Runner 1 tag',
      *resolve(g) { if (yield* fx.trace(g, 2, 'Salvage')) yield* fx.addTags(g, 1, 'Salvage'); },
    }),
  });

  // 02110 Eli 1.0 — bioroid barrier: 2x end the run.
  define(code('Eli 1.0'), {
    clickBreak: true,
    subroutines: [etr, etr],
  });

  // 02119 Burke Bugs — sentry: trace 0 -> Runner trashes 1 program (their
  // own choice, per the default rule for self-affecting effects).
  define(code('Burke Bugs'), {
    subroutines: [{
      label: 'Trace 0 - the Runner trashes 1 program',
      *resolve(g) {
        if (!(yield* fx.trace(g, 0, 'Burke Bugs'))) return;
        const progs = g.state.runner.rig.program;
        if (!progs.length) return;
        const pick = yield choice('runner', 'Burke Bugs: trash which program?',
          progs.map(id => opt(`t:${id}`, cardOf(g, id).title)));
        yield* fx.trashWithPrevention(g, Number(pick.split(':')[1]), 'Burke Bugs');
      },
    }],
  });

  // ---------------- Corp: operations ----------------

  // 02037 Power Grid Overload — play only if the Runner made a successful
  // run last turn. Trace 2 -> trash 1 installed hardware costing <= margin.
  define(code('Power Grid Overload'), {
    canPlay(g) { return (g.state.flags.lastRunnerTurn.successfulRuns ?? []).length > 0; },
    *onPlay(g) {
      if (!(yield* fx.trace(g, 2, 'Power Grid Overload'))) return;
      const x = g.state.flags.lastTraceMargin;
      const eligible = g.state.runner.rig.hardware.filter(id => (cardOf(g, id).cost ?? 0) <= x);
      if (!eligible.length) return;
      const pick = yield choice('corp', `Power Grid Overload: trash which piece of hardware (cost <= ${x})?`,
        eligible.map(id => opt(`t:${id}`, cardOf(g, id).title)));
      yield* fx.trashWithPrevention(g, Number(pick.split(':')[1]), 'Power Grid Overload');
    },
  });

  // 02100 Foxfire — trace 7 -> trash 1 virtual resource or 1 link card.
  define(code('Foxfire'), {
    *onPlay(g) {
      if (!(yield* fx.trace(g, 7, 'Foxfire'))) return;
      const eligible = installedRunner(g).filter(id => {
        const st = cardOf(g, id).subtypes;
        return st.includes('Virtual') || st.includes('Link');
      });
      if (!eligible.length) return;
      const pick = yield choice('corp', 'Foxfire: trash which virtual resource or link card?',
        eligible.map(id => opt(`t:${id}`, cardOf(g, id).title)));
      yield* fx.trashWithPrevention(g, Number(pick.split(':')[1]), 'Foxfire');
    },
  });

  // 02116 Midseason Replacements — play only if the Runner stole an agenda
  // last turn. Trace 6 -> X tags, X = trace margin.
  define(code('Midseason Replacements'), {
    canPlay(g) { return (g.state.flags.lastRunnerTurn.stolenPoints ?? 0) > 0; },
    *onPlay(g) {
      if (yield* fx.trace(g, 6, 'Midseason Replacements')) {
        const x = g.state.flags.lastTraceMargin;
        if (x > 0) yield* fx.addTags(g, x, 'Midseason Replacements');
      }
    },
  });

  // ---------------- Corp: assets / agendas (on-access, on-score, recurring) --

  // 02032 Fetal AI — ambush agenda: reveal on R&D access (informational —
  // not separately modeled); 2 net damage when accessed anywhere except
  // Archives; steal costs an additional 2cr (via the agenda's own stealCost,
  // now read by stealDecision — see file header).
  define(code('Fetal AI'), {
    stealCost: { credits: 2 },
    *onAccess(g, { server }) {
      if (server === 'archives') return;
      yield* fx.damage(g, 'net', 2, 'Fetal AI');
    },
  });

  // 02053 Edge of World — ambush asset: on access, corp may pay 3cr to do 1
  // core damage per piece of ice protecting this server.
  define(code('Edge of World'), {
    *onAccess(g, { server }) {
      if (!fx.canPay(g, 'corp', 3)) return;
      const p = yield choice('corp', 'Edge of World: pay 3cr to do 1 core damage per ice protecting this server?',
        [opt('pay', 'Pay 3cr'), opt('no', 'Decline')]);
      if (p !== 'pay') return;
      fx.pay(g, 'corp', 3, 'Edge of World');
      const n = server && g.state.corp.servers[server] ? g.state.corp.servers[server].ice.length : 0;
      yield* fx.damage(g, 'core', n, 'Edge of World');
    },
  });

  // 02072 Dedicated Server — 2 recurring credits, usable to rez ice.
  define(code('Dedicated Server'), {
    recurring: { n: 2, purposes: ['rez-ice'] },
  });

  // 02075 Net Police — X recurring credits (X = the Runner's link strength
  // when the pool refills, at the Corp's turn start), usable during traces.
  define(code('Net Police'), {
    recurring: { n: (g) => g.state.runner.baseLink + fx.linkBonus(g), purposes: ['trace'] },
  });

  // ---------------- Runner ----------------

  // 02091 Kati Jones — cannot be used more than once per turn. [click]: load
  // 3cr. [click]: take all hosted credits.
  define(code('Kati Jones'), {
    actions: [
      {
        label: 'Place 3 credits on Kati Jones',
        clicks: 1,
        req: (g, it) => !g.state.flags.turn.oncePerTurn?.[`kati:${it.id}`],
        *effect(g, { instId }) {
          oncePerTurn(g, `kati:${instId}`);
          const it = inst(g, instId);
          it.counters.credit = (it.counters.credit ?? 0) + 3;
          fx.emit(g, 'counters-loaded', { id: instId, n: 3, kind: 'credit' });
        },
      },
      {
        label: 'Take all credits from Kati Jones',
        clicks: 1,
        req: (g, it) => (it.counters.credit ?? 0) > 0 && !g.state.flags.turn.oncePerTurn?.[`kati:${it.id}`],
        *effect(g, { instId }) {
          oncePerTurn(g, `kati:${instId}`);
          const it = inst(g, instId);
          fx.gainCredits(g, 'runner', it.counters.credit, 'Kati Jones');
          it.counters.credit = 0;
        },
      },
    ],
  });

  // 02103 Data Leak Reversal — install only if you made a successful run on
  // a central server this turn. If tagged: [click]: the Corp trashes the
  // top card of R&D.
  define(code('Data Leak Reversal'), {
    canInstall(g) {
      return (g.state.flags.turn.successfulRuns ?? []).some(sid => ['hq', 'rd', 'archives'].includes(sid));
    },
    actions: [{
      label: 'The Corp trashes the top card of R&D',
      clicks: 1,
      req: (g) => g.state.runner.tags > 0,
      *effect(g) {
        const id = g.state.corp.deck[0];
        if (id != null) fx.trash(g, id, 'Data Leak Reversal');
      },
    }],
  });

  // 02107 R&D Interface — breach R&D: access 1 additional card.
  define(code('R&D Interface'), {
    rdAccessMod: () => 1,
  });

  // 02108 Deep Thought — virus: successful run on R&D places 1 virus
  // counter. At 3+ counters: turn start, may look at the top card of R&D.
  define(code('Deep Thought'), {
    *onRunSuccessful(g, { instId, server }) {
      if (server !== 'rd') return;
      fx.addVirusCounter(g, instId, 1, 'Deep Thought');
    },
    *onTurnStart(g, { instId }) {
      const it = inst(g, instId);
      if ((it.counters.virus ?? 0) < 3) return;
      const top = g.state.corp.deck[0];
      if (top == null) return;
      const p = yield choice('runner', 'Deep Thought: look at the top card of R&D?',
        [opt('look', 'Look'), opt('no', 'Skip')]);
      if (p === 'look') fx.emit(g, 'card-peeked', { title: cardOf(g, top).title });
    },
  });
}
