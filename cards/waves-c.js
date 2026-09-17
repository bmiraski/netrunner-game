// Batch C: Anarch + Criminal, Revised Core Set (codes 20001-20036, excluding
// pilot codes 20013 Mimic / 20020 Easy Mark). Faithful to printed text;
// deviations noted in docs/CARD_COVERAGE.md.
import { define } from './registry.js';
import * as fx from '../engine/effects.js';
import { inst, cardOf, moveCard, serverIds, isCentral } from '../engine/state.js';
import { choice, opt, number } from '../engine/decisions.js';
import { installedRunner, installedCorp, oncePerTurn } from '../engine/hooks.js';
import { runnerInstall } from '../engine/game.js';
import { doRun, activeSubs } from '../engine/run.js';

let registered = false;
export function registerWavesC(db) {
  if (registered) return; registered = true;
  const code = t => db.titled(t).code;

  // runner picks any server to run (used by Stimhack, Inside Job, Doppelganger)
  function* chooseServer(g, prompt, sids = serverIds(g)) {
    const pick = yield choice('runner', prompt, sids.map(sid => opt(`r:${sid}`, `Run ${sid}`)));
    return pick.split(':')[1];
  }

  // ---------------- Anarch ----------------

  // 20001 Reina Roja: Freedom Fighter — first piece of ice rezzed each turn
  // costs 1 credit more.
  define(code('Reina Roja: Freedom Fighter'), {
    rezCostMod(g, it, target) {
      return target.card.type === 'ice' && (g.state.flags.turn.iceRezzed ?? 0) === 0 ? 1 : 0;
    },
  });

  // 20002 Demolition Run — run HQ or R&D; access -> trash the accessed card
  // at no cost.
  define(code('Demolition Run'), {
    *onPlay(g) {
      const pick = yield choice('runner', 'Demolition Run: run HQ or R&D?',
        [opt('hq', 'Run HQ'), opt('rd', 'Run R&D')]);
      yield* doRun(g, pick, {
        accessAbilities: [{
          label: 'Demolition Run: trash the accessed card at no cost',
          req: () => true,
          *effect(g, { accessedId }) { fx.trash(g, accessedId, 'Demolition Run'); },
        }],
      });
    },
  });

  // 20003 Retrieval Run — run Archives; if successful, instead of breaching,
  // may install 1 program from the heap ignoring all costs.
  define(code('Retrieval Run'), {
    *onPlay(g) {
      yield* doRun(g, 'archives', {
        insteadLabel: 'Install 1 program from the heap, ignoring all costs',
        *insteadOnSuccess(g) {
          const id = yield* fx.searchAndPick(g, 'runner', 'discard', c => c.type === 'program',
            'Retrieval Run: install a program from the heap ignoring all costs?');
          if (id != null) yield* runnerInstall(g, id, { noClick: true, noCost: true });
        },
      });
    },
  });

  // 20004 Singularity — additional cost: spend [click]; run a remote server;
  // if successful, instead of breaching, trash all cards in its root.
  define(code('Singularity'), {
    extraClickCost: 1,
    canPlay(g) { return serverIds(g).some(sid => !isCentral(sid)); },
    *onPlay(g) {
      const sid = yield* chooseServer(g, 'Singularity: run which remote server?',
        serverIds(g).filter(s => !isCentral(s)));
      yield* doRun(g, sid, {
        insteadLabel: 'Trash all cards installed in the root of this server',
        *insteadOnSuccess(g, { server }) {
          for (const id of [...g.state.corp.servers[server].content]) fx.trash(g, id, 'Singularity');
        },
      });
    },
  });

  // 20005 Stimhack — place 9cr on this event, run any server; hosted credits
  // usable during that run; when the run ends, suffer 1 unpreventable core
  // damage (per printed text: "This damage cannot be prevented").
  define(code('Stimhack'), {
    *onPlay(g) {
      const sid = yield* chooseServer(g, 'Stimhack: run which server?');
      yield* doRun(g, sid, {
        hostedCredits: 9,
        *onEnd(g) { yield* fx.damage(g, 'core', 1, 'Stimhack', { unpreventable: true }); },
      });
    },
  });

  // 20006 Cyberfeeder — 1 recurring credit for icebreakers or virus installs.
  define(code('Cyberfeeder'), {
    recurring: { n: 1, purposes: ['icebreaker', 'virus-install'] },
  });

  // 20007 Spinal Modem — console, +1mu, 2 recurring credits for icebreakers;
  // successful trace during a run: 1 core damage.
  define(code('Spinal Modem'), {
    memoryMod: 1,
    recurring: { n: 2, purposes: ['icebreaker'] },
    *onTraceResolved(g, { success }) {
      if (success && g.state.run) yield* fx.damage(g, 'core', 1, 'Spinal Modem');
    },
  });

  // 20008 Darwin — AI breaker; strength = hosted virus counters (printed
  // strength is 0). Turn start: may pay 1cr to add 1 virus counter.
  define(code('Darwin'), {
    breaker: { types: ['all'], breakCost: { cost: 2, count: 1 } },
    breakerStrengthMod(g, it, breaker) {
      return breaker.id === it.id ? (it.counters.virus ?? 0) : 0;
    },
    *onTurnStart(g, { instId }) {
      if (!fx.canPay(g, 'runner', 1)) return;
      const p = yield choice('runner', 'Darwin: pay 1cr to place 1 virus counter on Darwin?',
        [opt('pay', 'Pay 1cr'), opt('no', 'Decline')]);
      if (p !== 'pay') return;
      fx.pay(g, 'runner', 1, 'Darwin');
      const it = inst(g, instId);
      it.counters.virus = (it.counters.virus ?? 0) + 1;
      fx.emit(g, 'counters-added', { id: instId, n: 1, kind: 'virus', total: it.counters.virus });
    },
  });

  // 20009 Datasucker — successful run on a central: +1 virus counter.
  // Hosted virus counter: the rezzed ice currently being encountered gets -1
  // strength until end of the encounter — implemented via `encounterAbility`
  // (a generic runner encounter-side paid-ability hook, engine/run.js) and
  // `it.encounterStr` (already a generic per-instance temp-strength field,
  // cleared after every encounter; now read by `iceStrength()` too). Phase 9:
  // previously deferred for lack of that hook; see docs/CARD_COVERAGE.md.
  define(code('Datasucker'), {
    *onRunSuccessful(g, { server, instId }) {
      if (!['hq', 'rd', 'archives'].includes(server)) return;
      const it = inst(g, instId);
      it.counters.virus = (it.counters.virus ?? 0) + 1;
      fx.emit(g, 'counters-added', { id: instId, n: 1, kind: 'virus', total: it.counters.virus });
    },
    encounterAbility: {
      req(g, it, iceId) { return (it.counters.virus ?? 0) > 0 && inst(g, iceId).rezzed; },
      label: (g, it) => `${it.card.title}: spend hosted virus counter (ice being encountered: -1 strength this encounter)`,
      *effect(g, { instId, iceId }) {
        const it = inst(g, instId);
        it.counters.virus--;
        fx.emit(g, 'counters-added', { id: instId, n: -1, kind: 'virus', total: it.counters.virus });
        inst(g, iceId).encounterStr -= 1;
      },
    },
  });

  // 20010 Force of Nature — code gate breaker: break up to 2 subs / 2cr;
  // boost +1 str / 1cr (this encounter).
  define(code('Force of Nature'), {
    breaker: { types: ['code-gate'],
      boost: { cost: 1, amount: 1 },
      breakCost: { cost: 2, count: 2 } },
  });

  // 20011 Imp — install: 2 virus counters. Access, once per turn: spend a
  // hosted virus counter to trash the accessed card.
  define(code('Imp'), {
    *onInstall(g, { instId }) {
      inst(g, instId).counters.virus = 2;
      fx.emit(g, 'counters-added', { id: instId, n: 2, kind: 'virus', total: 2 });
    },
    accessAbility: {
      label: 'Imp: spend a hosted virus counter to trash the accessed card',
      req: (g, it) => (it.counters.virus ?? 0) > 0 && !(g.state.flags.turn.oncePerTurn?.imp),
      *effect(g, { instId, accessedId }) {
        oncePerTurn(g, 'imp');
        inst(g, instId).counters.virus--;
        fx.trash(g, accessedId, 'Imp');
      },
    },
  });

  // 20012 Hemorrhage — successful run: +1 virus counter. [click], 2 hosted
  // virus counters: the Corp trashes 1 card from HQ (corp chooses).
  define(code('Hemorrhage'), {
    *onRunSuccessful(g, { instId }) {
      const it = inst(g, instId);
      it.counters.virus = (it.counters.virus ?? 0) + 1;
      fx.emit(g, 'counters-added', { id: instId, n: 1, kind: 'virus', total: it.counters.virus });
    },
    actions: [{
      label: 'Spend 2 hosted virus counters: the Corp trashes 1 card from HQ',
      clicks: 1,
      req: (g, it) => (it.counters.virus ?? 0) >= 2,
      *effect(g, { instId }) {
        inst(g, instId).counters.virus -= 2;
        const hand = g.state.corp.hand;
        if (!hand.length) return;
        const pick = yield choice('corp', 'Hemorrhage: choose 1 card from HQ to trash',
          hand.map(id => opt(`t:${id}`, cardOf(g, id).title)));
        fx.trash(g, Number(pick.split(':')[1]), 'Hemorrhage');
      },
    }],
  });

  // 20014 Morning Star — fracter: break any number of barrier subs / 1cr.
  define(code('Morning Star'), {
    breaker: { types: ['barrier'], breakCost: { cost: 1, count: 'all' } },
  });

  // 20015 Ice Carver — while encountering a piece of ice, it gets -1 strength.
  define(code('Ice Carver'), {
    iceStrengthMod(g, it, ice) { return g.state.run?.encounterIce === ice.id ? -1 : 0; },
  });

  // 20016 Liberated Account — install: load 16cr. [click]: take 4cr (or
  // remainder). Trash when empty.
  define(code('Liberated Account'), {
    *onInstall(g, { instId }) {
      inst(g, instId).counters.credit = 16;
      fx.emit(g, 'counters-loaded', { id: instId, n: 16, kind: 'credit' });
    },
    actions: [{
      label: 'Take 4 credits from Liberated Account',
      clicks: 1,
      *effect(g, { instId }) {
        const it = inst(g, instId);
        const n = Math.min(4, it.counters.credit ?? 0);
        it.counters.credit -= n;
        fx.gainCredits(g, 'runner', n, 'Liberated Account');
        if (it.counters.credit <= 0) fx.trash(g, instId, 'Liberated Account empty');
      },
    }],
  });

  // 20017 Scrubber — 2 recurring credits, usable to pay trash costs.
  define(code('Scrubber'), {
    recurring: { n: 2, purposes: ['trash'] },
  });

  // 20018 Xanadu — the rez cost of each piece of ice is increased by 1.
  define(code('Xanadu'), {
    rezCostMod(g, it, target) { return target.card.type === 'ice' ? 1 : 0; },
  });

  // ---------------- Criminal ----------------

  // 20019 Gabriel Santiago: Consummate Professional — first successful run
  // on HQ each turn: gain 2cr.
  define(code('Gabriel Santiago: Consummate Professional'), {
    *onRunSuccessful(g, { server }) {
      if (server === 'hq' && oncePerTurn(g, 'gabriel')) fx.gainCredits(g, 'runner', 2, 'Gabriel Santiago');
    },
  });

  // 20021 Emergency Shutdown — play only if you made a successful run on HQ
  // this turn; derez 1 installed piece of ice (runner's choice of target).
  define(code('Emergency Shutdown'), {
    canPlay(g) { return (g.state.flags.turn.successfulRuns ?? []).includes('hq'); },
    *onPlay(g) {
      const ice = installedCorp(g).filter(id => cardOf(g, id).type === 'ice' && inst(g, id).rezzed);
      if (!ice.length) { fx.emit(g, 'search-whiffed', { why: 'Emergency Shutdown' }); return; }
      const pick = yield choice('runner', 'Emergency Shutdown: derez which installed ice?',
        ice.map(id => opt(`d:${id}`, cardOf(g, id).title)));
      fx.derez(g, Number(pick.split(':')[1]));
    },
  });

  // 20022 Forged Activation Orders — choose 1 unrezzed ice; the Corp may rez
  // it, otherwise they trash it.
  define(code('Forged Activation Orders'), {
    *onPlay(g) {
      const ice = installedCorp(g).filter(id => cardOf(g, id).type === 'ice' && !inst(g, id).rezzed);
      if (!ice.length) { fx.emit(g, 'search-whiffed', { why: 'Forged Activation Orders' }); return; }
      const pick = yield choice('runner', 'Forged Activation Orders: choose 1 unrezzed piece of ice',
        ice.map(id => opt(`t:${id}`, cardOf(g, id).title)));
      const id = Number(pick.split(':')[1]);
      const options = [opt('trash', 'Trash it')];
      if (fx.canPay(g, 'corp', fx.rezCost(g, id))) options.unshift(opt('rez', `Rez it (${fx.rezCost(g, id)}cr)`));
      const p = yield choice('corp', `Forged Activation Orders: rez ${cardOf(g, id).title} or trash it?`, options);
      if (p === 'rez') yield* fx.rezFx(g, id);
      else fx.trash(g, id, 'Forged Activation Orders');
    },
  });

  // 20023 Inside Job — run any server; bypass the first piece of ice
  // encountered during that run.
  define(code('Inside Job'), {
    *onPlay(g) {
      const sid = yield* chooseServer(g, 'Inside Job: run which server?');
      yield* doRun(g, sid, { bypassFirstEncounter: true });
    },
  });

  // 20024 Special Order — search the stack for an icebreaker, reveal it, add
  // it to the grip; shuffle the stack.
  define(code('Special Order'), {
    *onPlay(g) {
      const id = yield* fx.searchAndPick(g, 'runner', 'deck', c => c.subtypes.includes('Icebreaker'),
        'Special Order: search your stack for an icebreaker', { optional: false });
      if (id != null) {
        fx.emit(g, 'card-revealed', { who: 'runner', title: cardOf(g, id).title, why: 'Special Order' });
        moveCard(g, id, 'runner-hand');
        fx.emit(g, 'card-to-hand', { id, title: cardOf(g, id).title, why: 'Special Order' });
      }
      fx.shuffleDeck(g, 'runner');
    },
  });

  // 20025 Doppelganger — console, +1mu. Once per turn: when a successful run
  // ends, may run any server.
  define(code('Doppelgänger'), {
    memoryMod: 1,
    *onRunEnd(g, { successful }) {
      if (!successful) return;
      if (!oncePerTurn(g, 'doppelganger')) return;
      const pick = yield choice('runner', 'Doppelganger: run another server?',
        [...serverIds(g).map(sid => opt(`r:${sid}`, `Run ${sid}`)), opt('no', 'Decline')]);
      if (pick === 'no') return;
      (g.state.run.followUp ??= []).push({ server: pick.split(':')[1] });
    },
  });

  // 20026 HQ Interface — whenever you breach HQ, access 1 additional card.
  define(code('HQ Interface'), {
    hqAccessMod: () => 1,
  });

  // 20027 Aurora — fracter: break 1 barrier sub / 2cr; boost +3 str / 2cr
  // (this encounter).
  define(code('Aurora'), {
    breaker: { types: ['barrier'],
      boost: { cost: 2, amount: 3 },
      breakCost: { cost: 2, count: 1 } },
  });

  // 20028 Faerie — killer: break 1 sentry sub free; boost +1 str / 1cr; used
  // this encounter -> trash itself.
  define(code('Faerie'), {
    breaker: { types: ['sentry'],
      boost: { cost: 1, amount: 1 },
      breakCost: { cost: 0, count: 1 } },
    *onEncounterEndIfUsed(g, { instId }) { fx.trash(g, instId, 'Faerie'); },
  });

  // 20029 Femme Fatale — killer: break 1 sentry sub / 1cr; boost +1 str / 2cr.
  // Install: choose 1 installed ice; may pay 1cr per subroutine it has to
  // bypass it whenever encountered.
  define(code('Femme Fatale'), {
    breaker: { types: ['sentry'],
      boost: { cost: 2, amount: 1 },
      breakCost: { cost: 1, count: 1 } },
    *onInstall(g, { instId }) {
      const ice = installedCorp(g).filter(id => cardOf(g, id).type === 'ice');
      if (!ice.length) return;
      const pick = yield choice('runner', 'Femme Fatale: choose 1 installed piece of ice to target',
        ice.map(id => opt(`t:${id}`, cardOf(g, id).title)));
      const iceId = Number(pick.split(':')[1]);
      inst(g, instId).counters.femmeTarget = iceId;
      fx.emit(g, 'femme-target-chosen', { instId, iceId });
    },
    bypassAbility: {
      req: (g, it, iceId) => iceId === it.counters.femmeTarget,
      cost: (g, iceId) => activeSubs(g, inst(g, iceId)).length,
    },
  });

  // 20030 Peacock — decoder: break 1 code gate sub / 2cr; boost +3 str / 2cr.
  define(code('Peacock'), {
    breaker: { types: ['code-gate'],
      boost: { cost: 2, amount: 3 },
      breakCost: { cost: 2, count: 1 } },
  });

  // 20031 Pheromones — X recurring credits (X = hosted virus counters) for
  // runs on HQ. Successful run on HQ: +1 virus counter.
  // Phase 9: previously deferred (no call site ever passed the 'hq-run'
  // purpose). Fixed at the engine level instead of adding a call site:
  // 'hq-run' is now a CONTEXT purpose in poolsFor() (engine/hooks.js) that
  // matches ANY runner payment made while the in-progress run's server is
  // 'hq' — matching the printed "use these credits during runs on HQ"
  // (not restricted to one payment type), and requiring no changes here.
  define(code('Pheromones'), {
    recurring: { n: (g, it) => it.counters.virus ?? 0, purposes: ['hq-run'] },
    *onRunSuccessful(g, { server, instId }) {
      if (server !== 'hq') return;
      const it = inst(g, instId);
      it.counters.virus = (it.counters.virus ?? 0) + 1;
      fx.emit(g, 'counters-added', { id: instId, n: 1, kind: 'virus', total: it.counters.virus });
    },
  });

  // 20032 Sneakdoor Beta — [click]: run Archives; if it would be declared
  // successful, change the attacked server to HQ for the remainder of the run.
  define(code('Sneakdoor Beta'), {
    actions: [{
      label: 'Run Archives (successful run changes the attacked server to HQ)',
      clicks: 1,
      *effect(g) { yield* doRun(g, 'archives', { changeServerOnSuccess: 'hq' }); },
    }],
  });

  // 20033 Bank Job — install: load 8cr. Successful run on a remote: instead
  // of breaching, may take any number of hosted credits. Trash when empty.
  define(code('Bank Job'), {
    *onInstall(g, { instId }) {
      inst(g, instId).counters.credit = 8;
      fx.emit(g, 'counters-loaded', { id: instId, n: 8, kind: 'credit' });
    },
    insteadOfBreach: {
      label: 'Take hosted credits from Bank Job',
      appliesTo: (g, sid) => !['hq', 'rd', 'archives'].includes(sid),
      *effect(g, { instId }) {
        const it = inst(g, instId);
        const n = yield number('runner', `Bank Job: take how many hosted credits (0-${it.counters.credit})?`, 0, it.counters.credit);
        it.counters.credit -= n;
        if (n) fx.gainCredits(g, 'runner', n, 'Bank Job');
        if (it.counters.credit <= 0) fx.trash(g, instId, 'Bank Job empty');
      },
    },
  });

  // 20034 Crash Space — 2 recurring credits for removing tags; trash:
  // prevent up to 3 meat damage.
  define(code('Crash Space'), {
    recurring: { n: 2, purposes: ['remove-tag'] },
    preventDamage: { types: ['meat'], amount: 3, trashSelf: true },
  });

  // 20035 Fall Guy — prevents another installed resource from being trashed
  // (paid for by trashing Fall Guy). Trash: gain 2cr.
  // Deviation: the printed "trash: gain 2 credits" ability has no click cost
  // and is usable at any time; this engine only exposes installed-card click
  // abilities through the owner's action menu (script.actions), so it is
  // modeled as a clicks:0 action, usable only during the Runner's action
  // window (not truly "any time").
  define(code('Fall Guy'), {
    preventTrash: { types: ['resource'] },
    actions: [{
      label: 'Trash Fall Guy: gain 2 credits',
      clicks: 0,
      trashSelf: true,
      *effect(g) { fx.gainCredits(g, 'runner', 2, 'Fall Guy'); },
    }],
  });

  // 20036 Mr. Li — [click]: draw 2 cards, then put 1 of them on the bottom
  // of the stack.
  define(code('Mr. Li'), {
    actions: [{
      label: 'Draw 2 cards; put 1 of them on the bottom of the stack',
      clicks: 1,
      *effect(g) {
        const drawn = fx.draw(g, 'runner', 2);
        if (!drawn.length) return;
        const pick = yield choice('runner', 'Mr. Li: put which drawn card on the bottom of the stack?',
          drawn.map(id => opt(`b:${id}`, cardOf(g, id).title)));
        const id = Number(pick.split(':')[1]);
        moveCard(g, id, 'runner-deck'); // push = bottom of stack
        fx.emit(g, 'card-moved', { id, to: 'bottom-of-stack' });
      },
    }],
  });
}
