// Batch A: Haas-Bioroid + Jinteki, Revised Core Set (codes 20061-20076,
// 20093-20108). Faithful to printed text; deviations noted in
// docs/CARD_COVERAGE.md.
import { define, getScript } from './registry.js';
import * as fx from '../engine/effects.js';
import { inst, cardOf, moveCard } from '../engine/state.js';
import { choice, opt, number } from '../engine/decisions.js';
import { installedRunner, installedCorp } from '../engine/hooks.js';
import { corpInstall } from '../engine/game.js';

let registered = false;
export function registerWavesA(db) {
  if (registered) return; registered = true;
  const code = t => db.titled(t).code;

  const etr = {
    label: 'End the run',
    *resolve(g) { g.state.run.ended = true; fx.emit(g, 'run-ends-sub', {}); },
  };

  // corp picks 1 installed runner program to trash (Ichi 1.0, Rototurret)
  function* trashInstalledProgram(g, why) {
    const progs = g.state.runner.rig.program;
    if (!progs.length) return;
    const pick = yield choice('corp', `${why}: trash which program?`,
      progs.map(id => opt(`t:${id}`, cardOf(g, id).title)));
    yield* fx.trashWithPrevention(g, Number(pick.split(':')[1]), why);
  }
  // corp picks 1 installed AI program to trash (Swordsman)
  function* trashInstalledAIProgram(g, why) {
    const progs = g.state.runner.rig.program.filter(id => cardOf(g, id).subtypes.includes('AI'));
    if (!progs.length) return;
    const pick = yield choice('corp', `${why}: trash which AI program?`,
      progs.map(id => opt(`t:${id}`, cardOf(g, id).title)));
    yield* fx.trashWithPrevention(g, Number(pick.split(':')[1]), why);
  }
  // corp picks any card from Archives to add to HQ (Archived Memories, Vitruvius, Himitsu-Bako)
  function* archiveToHQ(g, why) {
    const arch = g.state.corp.archives;
    if (!arch.length) { fx.emit(g, 'search-whiffed', { zone: 'archives', why }); return; }
    const pick = yield choice('corp', `${why}: add which card from Archives to HQ?`,
      arch.map(id => opt(`a:${id}`, cardOf(g, id).title)));
    const id = Number(pick.split(':')[1]);
    moveCard(g, id, 'corp-hand');
    fx.emit(g, 'card-to-hand', { id, title: cardOf(g, id).title, why });
  }

  // ---------------- Haas-Bioroid ----------------

  // 20061 Haas-Bioroid: Stronger Together — all bioroid ice has +1 strength.
  define(code('Haas-Bioroid: Stronger Together'), {
    iceStrengthMod(g, it, ice) { return ice.card.subtypes.includes('Bioroid') ? 1 : 0; },
  });

  // 20062 Project Ares — score: Runner trashes 1 installed card per hosted
  // advancement counter past 4; if >=1 trashed, corp takes 1 bad publicity.
  define(code('Project Ares'), {
    *onScore(g, { instId }) {
      const it = inst(g, instId);
      const n = Math.max(0, it.advancement - 4);
      let trashedAny = false;
      for (let i = 0; i < n; i++) {
        const installed = installedRunner(g);
        if (!installed.length) break;
        const pick = yield choice('runner', 'Project Ares: choose an installed card to trash',
          installed.map(id => opt(`t:${id}`, cardOf(g, id).title)));
        const trashed = yield* fx.trashWithPrevention(g, Number(pick.split(':')[1]), 'Project Ares');
        if (trashed) trashedAny = true;
      }
      if (trashedAny) fx.addBadPublicity(g, 1, 'Project Ares');
    },
  });

  // 20063 Project Vitruvius — score: 1 agenda counter per hosted advancement
  // past 3; hosted counter: add 1 card from Archives to HQ.
  define(code('Project Vitruvius'), {
    *onScore(g, { instId }) {
      const it = inst(g, instId);
      const n = Math.max(0, it.advancement - 3);
      if (n) {
        it.counters.agenda = (it.counters.agenda ?? 0) + n;
        fx.emit(g, 'counters-added', { id: instId, n, kind: 'agenda', total: it.counters.agenda });
      }
    },
    actions: [{
      label: 'Use hosted agenda counter: add card from Archives to HQ',
      clicks: 0,
      req: (g, it) => (it.counters.agenda ?? 0) > 0 && g.state.corp.archives.length > 0,
      *effect(g, { instId }) {
        inst(g, instId).counters.agenda--;
        yield* archiveToHQ(g, 'Project Vitruvius');
      },
    }],
  });

  // 20064 Adonis Campaign — load 12cr on rez; take 3/turn; trash when empty.
  define(code('Adonis Campaign'), {
    *onRez(g, { instId }) {
      inst(g, instId).counters.credit = 12;
      fx.emit(g, 'counters-loaded', { id: instId, n: 12, kind: 'credit' });
    },
    *onTurnStart(g, { instId }) {
      const it = inst(g, instId);
      const n = Math.min(3, it.counters.credit ?? 0);
      it.counters.credit -= n;
      fx.gainCredits(g, 'corp', n, 'Adonis Campaign');
      if (it.counters.credit <= 0) fx.trash(g, instId, 'Adonis Campaign empty');
    },
  });

  // 20065 Aggressive Secretary — advanceable ambush: pay 2, trash 1 program
  // per advancement token (corp picks each program).
  define(code('Aggressive Secretary'), {
    advanceable: true,
    *onAccess(g, { instId }) {
      const it = inst(g, instId);
      if (!fx.canPay(g, 'corp', 2)) return;
      const p = yield choice('corp', 'Pay 2cr: trash 1 program for each advancement token on Aggressive Secretary?',
        [opt('pay', 'Pay 2cr'), opt('no', 'Decline')]);
      if (p !== 'pay') return;
      fx.pay(g, 'corp', 2, 'Aggressive Secretary');
      for (let i = 0; i < it.advancement; i++) yield* trashInstalledProgram(g, 'Aggressive Secretary');
    },
  });

  // 20066 Heimdall 1.0 — bioroid barrier: core damage, ETR, ETR.
  define(code('Heimdall 1.0'), {
    clickBreak: true,
    subroutines: [
      { label: 'Do 1 core damage', *resolve(g) { yield* fx.damage(g, 'core', 1, 'Heimdall 1.0'); } },
      etr,
      etr,
    ],
  });

  // 20067 Hudson 1.0 — bioroid code gate: limit access to 1 card, twice printed.
  define(code('Hudson 1.0'), {
    clickBreak: true,
    subroutines: [
      { label: 'The Runner cannot access more than 1 card during this run',
        *resolve(g) { g.state.run.accessLimit = 1; fx.emit(g, 'access-limited', { n: 1 }); } },
      { label: 'The Runner cannot access more than 1 card during this run',
        *resolve(g) { g.state.run.accessLimit = 1; fx.emit(g, 'access-limited', { n: 1 }); } },
    ],
  });

  // 20068 Ichi 1.0 — bioroid sentry: trash program x2, trace 1 -> core dmg + tag.
  define(code('Ichi 1.0'), {
    clickBreak: true,
    subroutines: [
      { label: 'Trash 1 installed program', *resolve(g) { yield* trashInstalledProgram(g, 'Ichi 1.0'); } },
      { label: 'Trash 1 installed program', *resolve(g) { yield* trashInstalledProgram(g, 'Ichi 1.0'); } },
      { label: 'Trace 1 - do 1 core damage and give the Runner 1 tag', *resolve(g) {
          if (yield* fx.trace(g, 1, 'Ichi 1.0')) {
            yield* fx.damage(g, 'core', 1, 'Ichi 1.0');
            fx.addTags(g, 1, 'Ichi 1.0');
          }
      } },
    ],
  });

  // 20069 Rototurret — sentry: trash program, ETR.
  define(code('Rototurret'), {
    subroutines: [
      { label: 'Trash 1 installed program', *resolve(g) { yield* trashInstalledProgram(g, 'Rototurret'); } },
      etr,
    ],
  });

  // 20070 Viktor 1.0 — bioroid code gate: core damage, ETR.
  define(code('Viktor 1.0'), {
    clickBreak: true,
    subroutines: [
      { label: 'Do 1 core damage', *resolve(g) { yield* fx.damage(g, 'core', 1, 'Viktor 1.0'); } },
      etr,
    ],
  });

  // 20071 Archived Memories — add 1 card from Archives to HQ.
  define(code('Archived Memories'), {
    *onPlay(g) { yield* archiveToHQ(g, 'Archived Memories'); },
  });

  // 20072 Biotic Labor — gain [click][click].
  define(code('Biotic Labor'), {
    *onPlay(g) { g.state.corp.clicks += 2; fx.emit(g, 'clicks-gained', { who: 'corp', n: 2, why: 'Biotic Labor' }); },
  });

  // 20073 Green Level Clearance — gain 3cr, draw 1.
  define(code('Green Level Clearance'), {
    *onPlay(g) { fx.gainCredits(g, 'corp', 3, 'Green Level Clearance'); fx.draw(g, 'corp', 1); },
  });

  // 20074 Shipment from MirrorMorph — install up to 3 cards from HQ.
  define(code('Shipment from MirrorMorph'), {
    *onPlay(g, { instId }) {
      for (let i = 0; i < 3; i++) {
        const eligible = g.state.corp.hand.filter(id =>
          id !== instId && ['ice', 'agenda', 'asset', 'upgrade'].includes(cardOf(g, id).type));
        if (!eligible.length) break;
        const pick = yield choice('corp', `Shipment from MirrorMorph: install a card from HQ? (${i + 1}/3)`,
          [...eligible.map(id => opt(`i:${id}`, cardOf(g, id).title)), opt('done', 'Stop installing')]);
        if (pick === 'done') break;
        const ok = yield* corpInstall(g, Number(pick.split(':')[1]), { noClick: true });
        if (!ok) break;
      }
    },
  });

  // 20075 Ash 2X3ZB9CY — successful run here: trace 4, restrict access on success.
  define(code('Ash 2X3ZB9CY'), {
    *onRunSuccessfulHere(g, { instId }) {
      if (yield* fx.trace(g, 4, 'Ash 2X3ZB9CY')) {
        g.state.run.restrictAccessTo = instId;
        fx.emit(g, 'access-restricted', { to: instId });
      }
    },
  });

  // 20076 Strongbox — additional cost to steal from this server: 1 click; persistent.
  define(code('Strongbox'), {
    stealCost: { clicks: 1 },
    persistent: true,
  });

  // ---------------- Jinteki ----------------

  // 20093 Jinteki: Personal Evolution — any agenda scored or stolen: 1 net damage.
  define(code('Jinteki: Personal Evolution'), {
    *onAgendaScored(g) { yield* fx.damage(g, 'net', 1, 'Personal Evolution'); },
    *onAgendaStolen(g) { yield* fx.damage(g, 'net', 1, 'Personal Evolution'); },
  });

  // 20094 Braintrust — score: 1 counter per 2 advancement over 3; -1 ice rez per counter.
  define(code('Braintrust'), {
    *onScore(g, { instId }) {
      const it = inst(g, instId);
      const n = Math.max(0, Math.floor((it.advancement - 3) / 2));
      if (n) {
        it.counters.agenda = (it.counters.agenda ?? 0) + n;
        fx.emit(g, 'counters-added', { id: instId, n, kind: 'agenda', total: it.counters.agenda });
      }
    },
    rezCostMod(g, it, target) {
      if (target.card.type !== 'ice') return 0;
      return -(it.counters.agenda ?? 0);
    },
  });

  // 20095 Nisei MK II — score: 1 agenda counter; hosted counter: end the run.
  define(code('Nisei MK II'), {
    *onScore(g, { instId }) {
      const it = inst(g, instId);
      it.counters.agenda = (it.counters.agenda ?? 0) + 1;
      fx.emit(g, 'counters-added', { id: instId, n: 1, kind: 'agenda', total: it.counters.agenda });
    },
    runWindowAbility: {
      label: () => 'Hosted agenda counter: end the run',
      req: (g, it) => (it.counters.agenda ?? 0) > 0 && !!g.state.run,
      *effect(g, { instId }) {
        inst(g, instId).counters.agenda--;
        g.state.run.ended = true;
        fx.emit(g, 'run-ends-sub', { via: 'Nisei MK II' });
      },
    },
  });

  // 20096 Project Junebug — advanceable ambush: pay 1, 2 net dmg per adv token.
  define(code('Project Junebug'), {
    advanceable: true,
    *onAccess(g, { instId }) {
      const it = inst(g, instId);
      if (!fx.canPay(g, 'corp', 1)) return;
      const p = yield choice('corp', 'Pay 1cr: do 2 net damage for each advancement token on Project Junebug?',
        [opt('pay', 'Pay 1cr'), opt('no', 'Decline')]);
      if (p !== 'pay') return;
      fx.pay(g, 'corp', 1, 'Project Junebug');
      yield* fx.damage(g, 'net', 2 * it.advancement, 'Project Junebug');
    },
  });

  // 20097 Ronin — advanceable; [click], trash: 3 net damage (needs 4+ counters).
  define(code('Ronin'), {
    advanceable: true,
    actions: [{
      label: '[click], trash: Do 3 net damage',
      clicks: 1,
      trashSelf: true,
      req: (g, it) => it.advancement >= 4,
      *effect(g) { yield* fx.damage(g, 'net', 3, 'Ronin'); },
    }],
  });

  // 20098 Snare! — ambush (not from Archives): pay 4, tag + 3 net damage.
  define(code('Snare!'), {
    *onAccess(g, { server }) {
      if (server === 'archives') return;
      if (!fx.canPay(g, 'corp', 4)) return;
      const p = yield choice('corp', 'Pay 4cr: give the Runner 1 tag and do 3 net damage?',
        [opt('pay', 'Pay 4cr'), opt('no', 'Decline')]);
      if (p !== 'pay') return;
      fx.pay(g, 'corp', 4, 'Snare!');
      fx.addTags(g, 1, 'Snare!');
      yield* fx.damage(g, 'net', 3, 'Snare!');
    },
  });

  // 20099 Himitsu-Bako — barrier; 1cr: return itself to HQ. Sub: ETR.
  define(code('Himitsu-Bako'), {
    subroutines: [etr],
    runWindowAbility: {
      label: () => 'Pay 1cr: add Himitsu-Bako to HQ',
      req: (g) => fx.canPay(g, 'corp', 1),
      *effect(g, { instId }) {
        fx.pay(g, 'corp', 1, 'Himitsu-Bako');
        moveCard(g, instId, 'corp-hand');
        fx.emit(g, 'card-to-hand', { id: instId, title: 'Himitsu-Bako', why: 'Himitsu-Bako' });
      },
    },
  });

  // 20100 Neural Katana — sentry: 3 net damage.
  define(code('Neural Katana'), {
    subroutines: [{ label: 'Do 3 net damage', *resolve(g) { yield* fx.damage(g, 'net', 3, 'Neural Katana'); } }],
  });

  // 20101 Swordsman — blocks AI breakers; trash AI program, 1 net damage.
  define(code('Swordsman'), {
    blocksAI: true,
    subroutines: [
      { label: 'Trash 1 installed AI program', *resolve(g) { yield* trashInstalledAIProgram(g, 'Swordsman'); } },
      { label: 'Do 1 net damage', *resolve(g) { yield* fx.damage(g, 'net', 1, 'Swordsman'); } },
    ],
  });

  // 20102 Wall of Thorns — barrier: 2 net damage, ETR.
  define(code('Wall of Thorns'), {
    subroutines: [
      { label: 'Do 2 net damage', *resolve(g) { yield* fx.damage(g, 'net', 2, 'Wall of Thorns'); } },
      etr,
    ],
  });

  // 20103 Whirlpool — trap: cannot jack out for remainder of run; trash self.
  define(code('Whirlpool'), {
    subroutines: [{
      label: 'The Runner cannot jack out for the remainder of this run; trash Whirlpool',
      *resolve(g, { iceId }) {
        g.state.run.cannotJackOut = true;
        fx.emit(g, 'cannot-jack-out', {});
        fx.trash(g, iceId, 'Whirlpool');
      },
    }],
  });

  // 20104 Yagura — code gate: look at top of R&D (may bottom it), 1 net damage.
  define(code('Yagura'), {
    subroutines: [
      { label: 'Look at the top card of R&D; you may add it to the bottom', *resolve(g) {
          const deck = g.state.corp.deck;
          if (!deck.length) return;
          const topId = deck[0];
          fx.emit(g, 'card-revealed', { who: 'corp', title: cardOf(g, topId).title, why: 'Yagura' });
          const p = yield choice('corp', `Yagura: top card of R&D is ${cardOf(g, topId).title}. Move to bottom?`,
            [opt('move', 'Move to bottom'), opt('no', 'Leave on top')]);
          if (p === 'move') {
            moveCard(g, topId, 'corp-deck');
            fx.emit(g, 'card-moved', { id: topId, to: 'bottom-of-rd' });
          }
      } },
      { label: 'Do 1 net damage', *resolve(g) { yield* fx.damage(g, 'net', 1, 'Yagura'); } },
    ],
  });

  // 20105 Celebrity Gift — extra click cost; reveal up to 5 HQ cards, gain 2cr each.
  define(code('Celebrity Gift'), {
    extraClickCost: 1,
    *onPlay(g, { instId }) {
      const revealed = [];
      for (let i = 0; i < 5; i++) {
        const remaining = g.state.corp.hand.filter(id => id !== instId && !revealed.includes(id));
        if (!remaining.length) break;
        const pick = yield choice('corp', `Celebrity Gift: reveal a card from HQ? (${revealed.length} revealed)`,
          [...remaining.map(id => opt(`r:${id}`, cardOf(g, id).title)), opt('done', 'Stop revealing')]);
        if (pick === 'done') break;
        revealed.push(Number(pick.split(':')[1]));
      }
      if (revealed.length) {
        fx.emit(g, 'cards-revealed', { who: 'corp', titles: revealed.map(id => cardOf(g, id).title) });
        fx.gainCredits(g, 'corp', 2 * revealed.length, 'Celebrity Gift');
      }
    },
  });

  // 20106 Neural EMP — play only if the Runner made a run last turn; 1 net damage.
  define(code('Neural EMP'), {
    canPlay(g) { return (g.state.flags.lastRunnerTurn.ranServers ?? []).length > 0; },
    *onPlay(g) { yield* fx.damage(g, 'net', 1, 'Neural EMP'); },
  });

  // 20107 Trick of Light — move up to 2 advancement counters between installed cards.
  define(code('Trick of Light'), {
    *onPlay(g) {
      const advanceableIds = installedCorp(g).filter(id => {
        const it = inst(g, id);
        return it.card.type === 'agenda' || getScript(it.code)?.advanceable;
      });
      if (!advanceableIds.length) return;
      const targetPick = yield choice('corp', 'Trick of Light: choose the card to advance',
        advanceableIds.map(id => opt(`t:${id}`, `${cardOf(g, id).title} [${inst(g, id).advancement}]`)));
      const targetId = Number(targetPick.split(':')[1]);
      const sources = installedCorp(g).filter(id => id !== targetId && inst(g, id).advancement > 0);
      if (!sources.length) return;
      const sourcePick = yield choice('corp', 'Trick of Light: move advancement counters from which card?',
        sources.map(id => opt(`s:${id}`, `${cardOf(g, id).title} [${inst(g, id).advancement}]`)));
      const sourceId = Number(sourcePick.split(':')[1]);
      const maxMove = Math.min(2, inst(g, sourceId).advancement);
      const n = yield number('corp', `Move how many advancement counters (up to ${maxMove})?`, 0, maxMove);
      inst(g, sourceId).advancement -= n;
      inst(g, targetId).advancement += n;
      fx.emit(g, 'advancement-moved', { from: sourceId, to: targetId, n });
    },
  });

  // 20108 Hokusai Grid — successful run here: 1 net damage.
  define(code('Hokusai Grid'), {
    *onRunSuccessfulHere(g) { yield* fx.damage(g, 'net', 1, 'Hokusai Grid'); },
  });
}
