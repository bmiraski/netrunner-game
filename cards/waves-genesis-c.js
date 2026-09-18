// Genesis Cycle Wave C: unique/complex cards (Psi ice, Regions, and the
// remaining novel effects that needed dedicated engine work before they
// could be scripted at all). New primitives added alongside this wave
// (documented at each use site below and in ENGINE.md/CARD_COVERAGE):
//   - memoryCostOf() / memoryCostOverride(g)   (state.js)      — ZU.13 Key Master, Creeper
//   - fx.psiGame()                              (effects.js)   — Snowflake, Bullfrog
//   - Region "limit 1 per server" install filter (game.js#corpInstall, generic)
//                                                                — ChiLo City Grid, Amazon Industrial Zone, Ruhr Valley
//   - traceInterrupt hook                       (effects.js#trace) — Disrupter
//   - blocksRemoteRuns identity flag             (game.js#runnerAction) — Jinteki: Replicating Perfection
//   - trashCostOf() / trashCostMod hook          (run.js)       — Encryption Protocol
//   - fx.addTags() as a generator + preventTag hook (effects.js) — New Angeles City Hall
//   - Sensei's synthetic per-run bonus subroutine (run.js#activeSubs)
//   - approachAbility hook                       (run.js#doRun) — Snitch, Midori
//   - Bullfrog mid-run relocation (s.run.redirect)               (run.js#doRun)
//   - onSubBroken hook / fireSubBroken()          (run.js)      — e3 Feedback Implants
//   - breaker.selfBoostOnBreak                    (run.js)      — Snowball
//   - ice.trashIfFullyBroken                      (run.js#encounterIce) — Oversight AI
//   - preventDamage.req / .consumeCounter         (effects.js#damage) — Plascrete Carapace, Muresh Bodysuit
//   - breaker.breakCost.trashSelf                 (run.js)      — Deus X
//   - onHardwareInstalled broadcast               (game.js#runnerInstall) — Replicator
//   - flags.turn.breakerBuffs                     (run.js#breakerStrength) — The Helpful AI
//   - onIceInstalled broadcast                     (game.js#corpInstall)  — Amazon Industrial Zone
//   - extraRunClickCost()                          (game.js)     — Ruhr Valley
//   - fx.addVirusCounter() + flags.turn.virusProgramsGained     — Nerve Agent, Surge
//   - poolsFor() array purpose + 'advance-here' context purpose (hooks.js) — Simone Diego
//   - runner.hosted zone + 'runner-hosted' in zoneList          (state.js) — Personal Workshop
//   - onAgendaStolen now also passes instId (effects.js#stealAgendaFx)    — New Angeles City Hall
// Faithful to printed text; deviations noted in docs/CARD_COVERAGE.md.
import { define, getScript } from './registry.js';
import * as fx from '../engine/effects.js';
import { inst, cardOf, moveCard, serverIds, newRemote } from '../engine/state.js';
import { choice, opt, number } from '../engine/decisions.js';
import { installedRunner } from '../engine/hooks.js';
import { runnerInstall } from '../engine/game.js';
import { doRun, activeSubs, fireSubBroken, breakerStrength } from '../engine/run.js';

let registered = false;
export function registerWavesGenesisC(db) {
  if (registered) return; registered = true;
  const code = t => db.titled(t).code;

  // ================= Corp =================

  // ---------------- Jinteki ----------------

  // 02031 Jinteki: Replicating Perfection — the Runner cannot run on remote
  // servers, except for the rest of the turn once they've run a central.
  // Generic identity flag, checked in runnerAction()'s run-option builder.
  define(code('Jinteki: Replicating Perfection'), {
    blocksRemoteRuns: true,
  });

  // 02015 Snowflake — barrier, psi ice. Sub: psi game; end the run if the
  // bets differed.
  define(code('Snowflake'), {
    subroutines: [{
      label: 'Psi Game: end the run if you and the Runner spent a different number of credits',
      *resolve(g) {
        if (yield* fx.psiGame(g, 'Snowflake')) {
          g.state.run.ended = true;
          fx.emit(g, 'run-ends-sub', {});
        }
      },
    }],
  });

  // 02034 Sensei — code gate. Sub: for the remainder of this run, every
  // OTHER piece of ice gains "Subroutine: End the run" after its own subs.
  // Implemented via g.state.run.senseiIceId, consulted generically by
  // activeSubs() (run.js) for any ice that isn't Sensei itself.
  define(code('Sensei'), {
    subroutines: [{
      label: 'For the remainder of this run, other ice gains "Subroutine: End the run" after its own subroutines',
      *resolve(g, { iceId }) { g.state.run.senseiIceId = iceId; },
    }],
  });

  // 02073 Bullfrog — code gate, deflector, psi ice. Sub: psi game; if the
  // bets differed AND this ice is still installed, move it to the outermost
  // position of another server (the run continues from there).
  define(code('Bullfrog'), {
    subroutines: [{
      label: 'Psi Game: move this ice to the outermost position of another server',
      *resolve(g, { iceId }) {
        const different = yield* fx.psiGame(g, 'Bullfrog');
        if (!different) return;
        const it = inst(g, iceId);
        if (!it.zone.startsWith('server-ice:')) return; // must still be installed
        const curSid = it.zone.split(':')[1];
        const targets = serverIds(g).filter(sid => sid !== curSid)
          .map(sid => opt(`t:${sid}`, `Protecting ${sid}`));
        targets.push(opt('t:new', 'Protecting a NEW remote server'));
        const pick = yield choice('corp', 'Bullfrog: move this ice to the outermost position of which server?', targets);
        let sid = pick.slice(2);
        if (sid === 'new') sid = newRemote(g);
        moveCard(g, iceId, `server-ice:${sid}`);
        g.state.run.redirect = { sid, pos: g.state.corp.servers[sid].ice.length - 1 };
        fx.emit(g, 'ice-moved', { iceId, to: sid });
      },
    }],
  });

  // 02113 Midori — sysop upgrade. Whenever the Runner approaches a piece of
  // ice protecting this server, may swap it for 1 piece of ice from HQ
  // (installed unrezzed, at the SAME position); if swapped, Runner may jack
  // out. Once per run.
  define(code('Midori'), {
    approachAbility: {
      label: 'swap the approached ice for 1 piece of ice from HQ (installed unrezzed)',
      req(g, it, iceId, sid) {
        const ownSid = it.zone.startsWith('server-content:') ? it.zone.split(':')[1] : null;
        if (ownSid !== sid || g.state.run.midoriUsed) return false;
        return g.state.corp.hand.some(id => cardOf(g, id).type === 'ice');
      },
      *effect(g, { iceId, sid }) {
        g.state.run.midoriUsed = true;
        const hqIce = g.state.corp.hand.filter(id => cardOf(g, id).type === 'ice');
        const pick = yield choice('corp', 'Midori: swap in which piece of ice from HQ?',
          hqIce.map(id => opt(`c:${id}`, cardOf(g, id).title)));
        const newId = Number(pick.split(':')[1]);
        const server = g.state.corp.servers[sid];
        const pos = server.ice.indexOf(iceId);
        moveCard(g, iceId, 'corp-hand');
        fx.emit(g, 'card-to-hand', { id: iceId, title: cardOf(g, iceId).title, why: 'Midori' });
        moveCard(g, newId, `server-ice:${sid}`); // pushed outermost by default...
        server.ice.splice(server.ice.indexOf(newId), 1);
        server.ice.splice(pos, 0, newId);        // ...then repositioned to the swapped-out slot
        const newIt = inst(g, newId);
        newIt.faceup = false; newIt.rezzed = false;
        fx.emit(g, 'corp-installed', { id: newId, server: sid, type: 'ice' });
        const jo = yield choice('runner', 'Midori swapped the approached ice. Jack out?',
          [opt('jack-out', 'Jack out'), opt('continue', 'Continue the run')]);
        if (jo === 'jack-out') { g.state.run.ended = true; fx.emit(g, 'jack-out', { server: sid }); }
      },
    },
  });

  // 02054 Sunset — operation. Choose a server; arrange the ice protecting it
  // in any order.
  define(code('Sunset'), {
    canPlay(g) { return serverIds(g).some(sid => g.state.corp.servers[sid].ice.length > 1); },
    *onPlay(g) {
      const sids = serverIds(g).filter(sid => g.state.corp.servers[sid].ice.length > 1);
      const pick = yield choice('corp', 'Sunset: choose a server to rearrange its ice',
        sids.map(sid => opt(`s:${sid}`, sid)));
      const sid = pick.split(':')[1];
      const server = g.state.corp.servers[sid];
      const total = server.ice.length;
      const order = [];
      const remaining = [...server.ice];
      while (remaining.length > 1) {
        const p2 = yield choice('corp',
          `Sunset: choose the next-innermost piece of ice for ${sid} (${order.length + 1} of ${total})`,
          remaining.map(id => opt(`i:${id}`, inst(g, id).rezzed ? cardOf(g, id).title : 'Unrezzed ice')));
        const id = Number(p2.split(':')[1]);
        order.push(id);
        remaining.splice(remaining.indexOf(id), 1);
      }
      order.push(remaining[0]);
      server.ice.length = 0;
      server.ice.push(...order);
      fx.emit(g, 'deck-rearranged', { who: 'corp', n: order.length, zone: `${sid} ice` });
    },
  });

  // ---------------- Haas-Bioroid ----------------

  // 02029 Encryption Protocol — the trash cost of all installed cards
  // (including this one, while rezzed) is increased by 1.
  define(code('Encryption Protocol'), {
    trashCostMod: () => 1,
  });

  // 02111 Ruhr Valley — region upgrade. Additional cost to run this server:
  // spend [click]. Generic extraRunClicks field, summed by
  // extraRunClickCost() (game.js). Region limit enforced generically.
  define(code('Ruhr Valley'), {
    extraRunClicks: 1,
  });

  // ---------------- Weyland Consortium ----------------

  // 02079 Oversight AI — operation, condition counter. Rez a piece of ice
  // ignoring all costs; that ice is trashed if all its subroutines are
  // broken during a single encounter, for as long as it remains installed.
  define(code('Oversight AI'), {
    canPlay(g) {
      return serverIds(g).some(sid => g.state.corp.servers[sid].ice.some(id => !inst(g, id).rezzed));
    },
    *onPlay(g) {
      const targets = [];
      for (const sid of serverIds(g)) {
        for (const id of g.state.corp.servers[sid].ice) if (!inst(g, id).rezzed) targets.push(id);
      }
      const pick = yield choice('corp', 'Oversight AI: rez which piece of unrezzed ice, ignoring all costs?',
        targets.map(id => opt(`i:${id}`, cardOf(g, id).title)));
      const iceId = Number(pick.split(':')[1]);
      yield* fx.rezFx(g, iceId, { ignoreCost: true });
      inst(g, iceId).trashIfFullyBroken = true;
    },
  });

  // 02038 Amazon Industrial Zone — region upgrade. Whenever you install a
  // piece of ice protecting this server, may immediately rez it for 3cr
  // less (reusing the rezCostBumps mechanism with a negative bump).
  define(code('Amazon Industrial Zone'), {
    *onIceInstalled(g, { instId, iceId, server }) {
      const it = inst(g, instId);
      const ownSid = it.zone.startsWith('server-content:') ? it.zone.split(':')[1] : null;
      if (ownSid !== server || inst(g, iceId).rezzed) return;
      const discounted = Math.max(0, fx.rezCost(g, iceId) - 3);
      if (!fx.canPay(g, 'corp', discounted)) return;
      const c = yield choice('corp',
        `Amazon Industrial Zone: immediately rez ${inst(g, iceId).card.title} (${discounted}cr)?`,
        [opt('rez', 'Rez it'), opt('no', 'Decline')]);
      if (c !== 'rez') return;
      (g.state.flags.turn.rezCostBumps ??= {})[iceId] = (g.state.flags.turn.rezCostBumps[iceId] ?? 0) - 3;
      yield* fx.rezFx(g, iceId);
    },
  });

  // 02099 Simone Diego — sysop upgrade, unique. 2 recurring credits,
  // spendable to advance cards in the root of or protecting this server
  // (the 'advance-here' context purpose, engine/hooks.js#poolsFor).
  define(code('Simone Diego'), {
    recurring: { n: 2, purposes: ['advance-here'] },
  });

  // ---------------- NBN ----------------

  // 02036 ChiLo City Grid — region upgrade. Whenever there is a successful
  // trace during a run on this server, give the Runner 1 tag.
  define(code('ChiLo City Grid'), {
    *onTraceResolved(g, { success, instId }) {
      if (!success || !g.state.run) return;
      const it = inst(g, instId);
      const ownSid = it.zone.startsWith('server-content:') ? it.zone.split(':')[1] : null;
      if (ownSid !== g.state.run.server) return;
      yield* fx.addTags(g, 1, 'ChiLo City Grid');
    },
  });

  // ================= Runner =================

  // ---------------- Shaper ----------------

  // 02007 ZU.13 Key Master — decoder, cloud icebreaker. 0 MU with 2+ link
  // (even while not installed).
  define(code('ZU.13 Key Master'), {
    memoryCostOverride(g) { return (g.state.runner.baseLink + fx.linkBonus(g)) >= 2 ? 0 : 1; },
    breaker: { types: ['code-gate'], boost: { cost: 1, amount: 1 }, breakCost: { cost: 1, count: 1 } },
  });

  // 02008 The Helpful AI — +1 link. Trash: choose an installed icebreaker;
  // it gets +2 strength until the end of the turn.
  define(code('The Helpful AI'), {
    linkMod: () => 1,
    actions: [{
      label: 'Trash The Helpful AI: an icebreaker gets +2 strength until end of turn',
      clicks: 0,
      trashSelf: true,
      req: (g) => installedRunner(g).some(id => cardOf(g, id).type === 'program' && getScript(cardOf(g, id).code)?.breaker),
      *effect(g) {
        const breakers = installedRunner(g).filter(id => cardOf(g, id).type === 'program' && getScript(cardOf(g, id).code)?.breaker);
        const pick = yield choice('runner', 'The Helpful AI: choose an icebreaker for +2 strength until end of turn',
          breakers.map(id => opt(`b:${id}`, cardOf(g, id).title)));
        const bId = Number(pick.split(':')[1]);
        (g.state.flags.turn.breakerBuffs ??= {})[bId] = (g.state.flags.turn.breakerBuffs[bId] ?? 0) + 2;
        fx.emit(g, 'breaker-boosted', { breakerId: bId, strength: breakerStrength(g, bId) });
      },
    }],
  });

  // 02066 Deus X — icebreaker. Interface -> trash: break any number of AP
  // subroutines. Interrupt -> trash: prevent any amount of net damage.
  define(code('Deus X'), {
    breaker: { types: ['ap'], breakCost: { trashSelf: true, count: 'all' } },
    preventDamage: { types: ['net'], amount: Infinity, trashSelf: true },
  });

  // 02088 Replicator — whenever you install a piece of hardware (including
  // Replicator), may search the stack for another copy, add it to the grip,
  // and shuffle.
  define(code('Replicator'), {
    *onHardwareInstalled(g, { installedId }) {
      const title = cardOf(g, installedId).title;
      const id = yield* fx.searchAndPick(g, 'runner', 'deck', c => c.title === title,
        `Replicator: search your stack for another copy of ${title}?`);
      fx.shuffleDeck(g, 'runner');
      if (id != null) {
        moveCard(g, id, 'runner-hand');
        fx.emit(g, 'card-to-hand', { id, title, why: 'Replicator' });
      }
    },
  });

  // 02089 Creeper — killer, cloud icebreaker. 0 MU with 2+ link.
  define(code('Creeper'), {
    memoryCostOverride(g) { return (g.state.runner.baseLink + fx.linkBonus(g)) >= 2 ? 0 : 1; },
    breaker: { types: ['sentry'], boost: { cost: 1, amount: 1 }, breakCost: { cost: 2, count: 1 } },
  });

  // 02049 Personal Workshop — [click]: host a program/hardware from the grip
  // with power counters = its install cost. 1cr, or automatically at the
  // start of your turn: remove 1 hosted power counter. At 0 counters: install
  // that card, ignoring all costs. Hosted (not installed) cards live in the
  // new `runner-hosted` zone (state.js) rather than the rig.
  function* removeWorkshopCounter(g, cid) {
    const it = inst(g, cid);
    it.counters.power = (it.counters.power ?? 0) - 1;
    fx.emit(g, 'counters-added', { id: cid, n: -1, kind: 'power', total: it.counters.power });
    if (it.counters.power <= 0) {
      it.hostId = null;
      yield* runnerInstall(g, cid, { noClick: true, noCost: true });
    }
  }
  define(code('Personal Workshop'), {
    actions: [
      {
        label: 'Host a program or piece of hardware from your grip on Personal Workshop',
        clicks: 1,
        req: (g) => g.state.runner.hand.some(id => ['program', 'hardware'].includes(cardOf(g, id).type)),
        *effect(g, { instId }) {
          const hand = g.state.runner.hand.filter(id => ['program', 'hardware'].includes(cardOf(g, id).type));
          const pick = yield choice('runner', 'Personal Workshop: host which card?',
            hand.map(id => opt(`h:${id}`, `${cardOf(g, id).title} (${cardOf(g, id).cost ?? 0}cr)`)));
          const cid = Number(pick.split(':')[1]);
          const cost = cardOf(g, cid).cost ?? 0;
          moveCard(g, cid, 'runner-hosted');
          const cIt = inst(g, cid);
          cIt.hostId = instId;
          cIt.counters.power = cost;
          fx.emit(g, 'hosted', { id: cid, on: instId });
        },
      },
      {
        label: 'Remove 1 power counter from a hosted card (1cr)',
        clicks: 0,
        credits: 1,
        req: (g, it) => g.state.runner.hosted.some(id => inst(g, id).hostId === it.id && (inst(g, id).counters.power ?? 0) > 0),
        *effect(g, { instId }) {
          const opts_ = g.state.runner.hosted.filter(id => inst(g, id).hostId === instId && (inst(g, id).counters.power ?? 0) > 0);
          let cid = opts_[0];
          if (opts_.length > 1) {
            const pick = yield choice('runner', 'Personal Workshop: remove a power counter from which hosted card?',
              opts_.map(id => opt(`c:${id}`, cardOf(g, id).title)));
            cid = Number(pick.split(':')[1]);
          }
          yield* removeWorkshopCounter(g, cid);
        },
      },
    ],
    *onTurnStart(g, { instId }) {
      const hosted = g.state.runner.hosted.filter(id => inst(g, id).hostId === instId);
      if (!hosted.length) return;
      let cid = hosted[0];
      if (hosted.length > 1) {
        const pick = yield choice('runner', 'Personal Workshop: remove a power counter from which hosted card?',
          hosted.map(id => opt(`c:${id}`, cardOf(g, id).title)));
        cid = Number(pick.split(':')[1]);
      }
      yield* removeWorkshopCounter(g, cid);
    },
  });

  // ---------------- Criminal ----------------

  // 02024 e3 Feedback Implants — whenever you break a subroutine on a piece
  // of ice, may pay 1cr to break 1 more subroutine on that ice. Fires via
  // the generic onSubBroken hook and re-triggers fireSubBroken() itself so
  // stacked e3-style effects (or multiple copies) chain correctly.
  define(code('e3 Feedback Implants'), {
    *onSubBroken(g, { iceId }) {
      const ice = inst(g, iceId);
      if (!ice.rezzed || !g.state.run) return;
      const unbroken = activeSubs(g, ice).filter(x => !ice.brokenSubs.includes(x.index));
      if (!unbroken.length || !fx.canPay(g, 'runner', 1)) return;
      const p = yield choice('runner', 'e3 Feedback Implants: pay 1cr to break 1 more subroutine on this ice?',
        [opt('pay', 'Pay 1cr'), opt('no', 'Decline')]);
      if (p !== 'pay') return;
      fx.pay(g, 'runner', 1, 'e3 Feedback Implants');
      let target = unbroken[0];
      if (unbroken.length > 1) {
        const pick = yield choice('runner', 'e3 Feedback Implants: break which subroutine?',
          unbroken.map(x => opt(`s:${x.index}`, x.label)));
        target = unbroken.find(x => String(x.index) === pick.split(':')[1]);
      }
      ice.brokenSubs.push(target.index);
      fx.emit(g, 'sub-broken', { iceId, sub: target.label, via: 'e3' });
      yield* fireSubBroken(g, iceId, null);
    },
  });

  // 02044 Muresh Bodysuit — the first time each turn you would suffer meat
  // damage, prevent 1 (mandatory, no cost — preventDamage.auto + .perTurn).
  define(code('Muresh Bodysuit'), {
    preventDamage: { types: ['meat'], amount: 1, auto: true, perTurn: true },
  });

  // 02045 Snitch — once per run, may expose an unrezzed ice when you
  // approach it, then may jack out.
  define(code('Snitch'), {
    approachAbility: {
      label: 'expose the approached ice',
      req(g, it, iceId) {
        return !inst(g, iceId).rezzed && !g.state.run.snitchUsed;
      },
      *effect(g, { iceId, sid }) {
        g.state.run.snitchUsed = true;
        fx.expose(g, iceId);
        const jo = yield choice('runner', 'Snitch: jack out?',
          [opt('jack-out', 'Jack out'), opt('continue', 'Continue the run')]);
        if (jo === 'jack-out') { g.state.run.ended = true; fx.emit(g, 'jack-out', { server: sid }); }
      },
    },
  });

  // 02065 Crescentus — trash: derez a piece of ice you fully broke during
  // this encounter. encounterAbility (like Datasucker), scoped to the ice
  // currently being encountered.
  define(code('Crescentus'), {
    encounterAbility: {
      req(g, it, iceId) {
        const ice = inst(g, iceId);
        if (!ice.rezzed) return false;
        const subs = activeSubs(g, ice);
        return subs.length > 0 && subs.every(s => ice.brokenSubs.includes(s.index));
      },
      label: () => 'Crescentus: trash to derez this ice',
      *effect(g, { instId, iceId }) {
        fx.trash(g, instId, 'Crescentus');
        fx.derez(g, iceId);
      },
    },
  });

  // ---------------- Anarch ----------------

  // 02021 Vamp — run HQ; if successful, instead of breaching, may spend X
  // credits to make the Corp lose X credits; if you spent any, take 1 tag.
  define(code('Vamp'), {
    *onPlay(g) {
      yield* doRun(g, 'hq', {
        insteadLabel: 'Spend credits to drain the Corp\'s credits',
        *insteadOnSuccess(g) {
          const maxX = g.state.runner.credits;
          if (maxX <= 0) return;
          const x = yield number('runner', `Vamp: spend how many credits? (Corp loses that many)`, 0, maxX);
          if (x <= 0) return;
          fx.pay(g, 'runner', x, 'Vamp');
          const loss = Math.min(x, g.state.corp.credits);
          g.state.corp.credits -= loss;
          fx.emit(g, 'credits-lost', { who: 'corp', n: loss, why: 'Vamp' });
          yield* fx.addTags(g, 1, 'Vamp');
        },
      });
    },
  });

  // 02027 Snowball — fracter. Interface -> 1cr: break 1 barrier sub. Gets +1
  // strength for the remainder of the run each time it breaks a sub.
  define(code('Snowball'), {
    breaker: { types: ['barrier'], boost: { cost: 1, amount: 1 }, breakCost: { cost: 1, count: 1 }, selfBoostOnBreak: 1 },
  });

  // 02041 Nerve Agent — virus program. Successful run on HQ: +1 virus
  // counter. Then (same trigger, since breach immediately follows a
  // successful run absent a replacement effect): choose a number less than
  // hosted virus counters; access that many additional cards.
  define(code('Nerve Agent'), {
    *onRunSuccessful(g, { server, instId }) {
      if (server !== 'hq') return;
      fx.addVirusCounter(g, instId, 1, 'Nerve Agent');
      const counters = inst(g, instId).counters.virus ?? 0;
      if (counters < 1) return;
      const n = yield number('runner', `Nerve Agent: access how many additional cards? (0-${counters - 1})`, 0, counters - 1);
      if (n > 0 && g.state.run) g.state.run.accessBonus += n;
    },
  });

  // 02061 Disrupter — interrupt -> trash: reduce the base trace strength of
  // a trace to 0.
  define(code('Disrupter'), {
    traceInterrupt: {
      label: 'trash: reduce the base trace strength to 0',
      req: () => true,
      *effect(g, { instId }) { fx.trash(g, instId, 'Disrupter'); return 0; },
    },
  });

  // 02081 Surge — play only if you placed at least 1 virus counter on a
  // program this turn; place 2 more virus counters on that program.
  define(code('Surge'), {
    canPlay(g) {
      return [...(g.state.flags.turn.virusProgramsGained ?? [])].some(id => inst(g, id).zone.startsWith('rig-'));
    },
    *onPlay(g) {
      const ids = [...(g.state.flags.turn.virusProgramsGained ?? [])].filter(id => inst(g, id).zone.startsWith('rig-'));
      if (!ids.length) return;
      let target = ids[0];
      if (ids.length > 1) {
        const pick = yield choice('runner', 'Surge: place 2 virus counters on which program?',
          ids.map(id => opt(`p:${id}`, cardOf(g, id).title)));
        target = Number(pick.split(':')[1]);
      }
      fx.addVirusCounter(g, target, 2, 'Surge');
    },
  });

  // ---------------- Neutral (Runner) ----------------

  // 02009 Plascrete Carapace — install: load 4 power counters. Interrupt ->
  // hosted power counter: prevent 1 meat damage; trashed when empty.
  define(code('Plascrete Carapace'), {
    *onInstall(g, { instId }) {
      inst(g, instId).counters.power = 4;
      fx.emit(g, 'counters-loaded', { id: instId, n: 4, kind: 'power' });
    },
    preventDamage: { types: ['meat'], amount: 1, req: (g, it) => (it.counters.power ?? 0) > 0, consumeCounter: 'power' },
  });

  // 02090 Kraken — play only if you stole an agenda this turn. Choose a
  // server; the Corp trashes 1 piece of ice protecting it (Corp chooses).
  define(code('Kraken'), {
    canPlay(g) {
      return (g.state.flags.turn.stolen?.length ?? 0) > 0 && serverIds(g).some(sid => g.state.corp.servers[sid].ice.length > 0);
    },
    *onPlay(g) {
      const sids = serverIds(g).filter(sid => g.state.corp.servers[sid].ice.length > 0);
      const pick = yield choice('runner', 'Kraken: choose a server (the Corp trashes 1 piece of ice protecting it)',
        sids.map(sid => opt(`s:${sid}`, sid)));
      const sid = pick.split(':')[1];
      const ice = g.state.corp.servers[sid].ice;
      let target = ice[0];
      if (ice.length > 1) {
        const p2 = yield choice('corp', `Kraken: trash which piece of ice protecting ${sid}?`,
          ice.map(id => opt(`i:${id}`, inst(g, id).rezzed ? cardOf(g, id).title : 'Unrezzed ice')));
        target = Number(p2.split(':')[1]);
      }
      fx.trash(g, target, 'Kraken');
    },
  });

  // 02109 New Angeles City Hall — unique. Interrupt -> 2cr: prevent 1 tag.
  // When you steal an agenda, trash this resource (self-referential
  // onAgendaStolen, using the instId now passed alongside agendaId).
  define(code('New Angeles City Hall'), {
    preventTag: {
      label: 'pay 2cr to prevent 1 tag',
      req: (g) => fx.canPay(g, 'runner', 2),
      *effect(g) { fx.pay(g, 'runner', 2, 'New Angeles City Hall'); },
    },
    *onAgendaStolen(g, { instId }) {
      fx.trash(g, instId, 'New Angeles City Hall: stole an agenda');
    },
  });
}
