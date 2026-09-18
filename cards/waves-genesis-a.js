// Genesis Cycle Wave A: net-new cards scriptable with only existing engine
// primitives, plus a handful of small, generic hook additions made alongside
// this wave (documented at each use site below and in ENGINE.md/CARD_COVERAGE):
//   - handSizeMod            (state.js#handSizeRaw)      — Public Sympathy, NBN: TWIY
//   - onIceRezzed broadcast  (effects.js#rezFx)          — Compromised Employee
//   - rezCostBumps           (effects.js#rezCost)        — Cortez Chip
//   - 'advance-ice' / 'install-hardware' payment purposes (game.js)
//                                                         — Because We Built It, Inside Man
//   - skipAutoDiscard        (game.js runner 'play' case) — Networking
//   - startingHandSize       (game.js#mainLoop)          — Andromeda
// Faithful to printed text; deviations noted in docs/CARD_COVERAGE.md.
import { define } from './registry.js';
import * as fx from '../engine/effects.js';
import { inst, cardOf, moveCard } from '../engine/state.js';
import { choice, opt } from '../engine/decisions.js';
import { installedCorp } from '../engine/hooks.js';

let registered = false;
export function registerWavesGenesisA(db) {
  if (registered) return; registered = true;
  const code = t => db.titled(t).code;

  // ---------------- Corp ----------------

  // 02011 Mandatory Upgrades — you have 1 additional click to spend each turn.
  define(code('Mandatory Upgrades'), {
    *onTurnStart(g) {
      g.state.corp.clicks += 1;
      fx.emit(g, 'clicks-gained', { who: 'corp', n: 1, why: 'Mandatory Upgrades' });
    },
  });

  // 02016 Restructured Datapool — [click]: Trace[2]; success -> 1 tag.
  define(code('Restructured Datapool'), {
    actions: [{
      label: '[click]: Trace 2 — if successful, give the Runner 1 tag',
      clicks: 1,
      *effect(g) {
        if (yield* fx.trace(g, 2, 'Restructured Datapool')) yield* fx.addTags(g, 1, 'Restructured Datapool');
      },
    }],
  });

  // 02035 Big Brother — play only if the Runner is tagged; give 2 tags.
  define(code('Big Brother'), {
    canPlay(g) { return g.state.runner.tags > 0; },
    *onPlay(g) { yield* fx.addTags(g, 2, 'Big Brother'); },
  });

  // 02040 Freelancer — play only if the Runner is tagged; trash up to 2
  // installed resources (Corp chooses).
  define(code('Freelancer'), {
    canPlay(g) { return g.state.runner.tags > 0; },
    *onPlay(g) {
      for (let i = 0; i < 2; i++) {
        const resources = g.state.runner.rig.resource;
        if (!resources.length) break;
        const pick = yield choice('corp', `Freelancer: trash a resource? (${i}/2 trashed)`,
          [...resources.map(id => opt(`t:${id}`, cardOf(g, id).title)), opt('done', 'Stop trashing')]);
        if (pick === 'done') break;
        yield* fx.trashWithPrevention(g, Number(pick.split(':')[1]), 'Freelancer');
      }
    },
  });

  // 02039 Executive Retreat — score: 1 agenda counter, shuffle HQ into R&D.
  // [click], hosted agenda counter: draw 5 cards.
  define(code('Executive Retreat'), {
    *onScore(g, { instId }) {
      const it = inst(g, instId);
      it.counters.agenda = (it.counters.agenda ?? 0) + 1;
      fx.emit(g, 'counters-added', { id: instId, n: 1, kind: 'agenda', total: it.counters.agenda });
      for (const id of [...g.state.corp.hand]) moveCard(g, id, 'corp-deck');
      fx.shuffleDeck(g, 'corp');
      fx.emit(g, 'hq-shuffled-into-rd', {});
    },
    actions: [{
      label: 'Hosted agenda counter: draw 5 cards',
      clicks: 1,
      req: (g, it) => (it.counters.agenda ?? 0) > 0,
      *effect(g, { instId }) {
        inst(g, instId).counters.agenda--;
        fx.draw(g, 'corp', 5);
      },
    }],
  });

  // 02120 Corporate War — score: if you have >=7cr, gain 7cr; otherwise lose
  // all credits.
  define(code('Corporate War'), {
    *onScore(g) {
      if (g.state.corp.credits >= 7) fx.gainCredits(g, 'corp', 7, 'Corporate War');
      else { g.state.corp.credits = 0; fx.emit(g, 'credits-lost', { who: 'corp', why: 'Corporate War' }); }
    },
  });

  // 02077 Government Contracts — [click][click]: gain 4cr.
  define(code('Government Contracts'), {
    actions: [{
      label: '[click][click]: Gain 4 credits',
      clicks: 2,
      *effect(g) { fx.gainCredits(g, 'corp', 4, 'Government Contracts'); },
    }],
  });

  // 02093 Rework — shuffle 1 card from HQ into R&D.
  define(code('Rework'), {
    *onPlay(g, { instId }) {
      const eligible = g.state.corp.hand.filter(id => id !== instId);
      if (!eligible.length) { fx.emit(g, 'search-whiffed', { why: 'Rework' }); return; }
      const pick = yield choice('corp', 'Rework: shuffle which card from HQ into R&D?',
        eligible.map(id => opt(`s:${id}`, cardOf(g, id).title)));
      moveCard(g, Number(pick.split(':')[1]), 'corp-deck');
      fx.shuffleDeck(g, 'corp');
    },
  });

  // 02058 Commercialization — choose a piece of ice; gain 1cr per advancement
  // token on it.
  define(code('Commercialization'), {
    *onPlay(g) {
      const ice = installedCorp(g).filter(id => cardOf(g, id).type === 'ice');
      if (!ice.length) { fx.emit(g, 'search-whiffed', { why: 'Commercialization' }); return; }
      const pick = yield choice('corp', 'Commercialization: choose a piece of ice',
        ice.map(id => opt(`i:${id}`, `${cardOf(g, id).title} [${inst(g, id).advancement}]`)));
      const it = inst(g, Number(pick.split(':')[1]));
      if (it.advancement > 0) fx.gainCredits(g, 'corp', it.advancement, 'Commercialization');
    },
  });

  // 02059 Private Contracts — load 14cr on rez; [click]: take 2cr; trash
  // when empty.
  define(code('Private Contracts'), {
    *onRez(g, { instId }) {
      inst(g, instId).counters.credit = 14;
      fx.emit(g, 'counters-loaded', { id: instId, n: 14, kind: 'credit' });
    },
    actions: [{
      label: 'Take 2 credits from Private Contracts',
      clicks: 1,
      *effect(g, { instId }) {
        const it = inst(g, instId);
        const n = Math.min(2, it.counters.credit ?? 0);
        it.counters.credit -= n;
        fx.gainCredits(g, 'corp', n, 'Private Contracts');
        if (it.counters.credit <= 0) fx.trash(g, instId, 'Private Contracts empty');
      },
    }],
  });

  // 02092 Eve Campaign — load 16cr on rez; turn start: take 2cr; trash when
  // empty.
  define(code('Eve Campaign'), {
    *onRez(g, { instId }) {
      inst(g, instId).counters.credit = 16;
      fx.emit(g, 'counters-loaded', { id: instId, n: 16, kind: 'credit' });
    },
    *onTurnStart(g, { instId }) {
      const it = inst(g, instId);
      const n = Math.min(2, it.counters.credit ?? 0);
      it.counters.credit -= n;
      fx.gainCredits(g, 'corp', n, 'Eve Campaign');
      if (it.counters.credit <= 0) fx.trash(g, instId, 'Eve Campaign empty');
    },
  });

  // 02055 Marked Accounts — turn start: take 1cr if able. [click]: place 3cr
  // from the bank on Marked Accounts.
  define(code('Marked Accounts'), {
    *onTurnStart(g, { instId }) {
      const it = inst(g, instId);
      if ((it.counters.credit ?? 0) > 0) {
        it.counters.credit--;
        fx.gainCredits(g, 'corp', 1, 'Marked Accounts');
      }
    },
    actions: [{
      label: 'Place 3 credits from the bank on Marked Accounts',
      clicks: 1,
      *effect(g, { instId }) {
        const it = inst(g, instId);
        it.counters.credit = (it.counters.credit ?? 0) + 3;
        fx.emit(g, 'counters-loaded', { id: instId, n: 3, kind: 'credit' });
      },
    }],
  });

  // 02114 NBN: The World is Yours — max hand size +1.
  define(code('NBN: The World is Yours'), {
    handSizeMod: 1,
  });

  // 02025 Compromised Employee — 1 recurring credit for traces; gain 1cr
  // whenever the Corp rezzes a piece of ice.
  define(code('Compromised Employee'), {
    recurring: { n: 1, purposes: ['trace'] },
    *onIceRezzed(g) { fx.gainCredits(g, 'runner', 1, 'Compromised Employee'); },
  });

  // 02076 Weyland Consortium: Because We Built It — 1 recurring credit to
  // advance ice.
  define(code('Weyland Consortium: Because We Built It'), {
    recurring: { n: 1, purposes: ['advance-ice'] },
  });

  // 02005 Cortez Chip — trash: choose a piece of ice; the Corp must pay 2cr
  // extra to rez it until the end of the turn.
  define(code('Cortez Chip'), {
    actions: [{
      label: 'Trash Cortez Chip: target ice costs 2cr more to rez this turn',
      clicks: 0,
      trashSelf: true,
      req: (g) => installedCorp(g).some(id => cardOf(g, id).type === 'ice'),
      *effect(g) {
        const ice = installedCorp(g).filter(id => cardOf(g, id).type === 'ice');
        const pick = yield choice('runner', 'Cortez Chip: choose a piece of ice',
          ice.map(id => opt(`i:${id}`, cardOf(g, id).title)));
        const id = Number(pick.split(':')[1]);
        const bumps = (g.state.flags.turn.rezCostBumps ??= {});
        bumps[id] = (bumps[id] ?? 0) + 2;
        fx.emit(g, 'rez-cost-bumped', { id, n: 2, why: 'Cortez Chip' });
      },
    }],
  });

  // ---------------- Runner ----------------

  // 02001 Whizzard: Master Gamer — 3 recurring credits to trash cards.
  define(code('Whizzard: Master Gamer'), {
    recurring: { n: 3, purposes: ['trash'] },
  });

  // 02087 Quality Time — draw 5 cards.
  define(code('Quality Time'), {
    *onPlay(g) { fx.draw(g, 'runner', 5); },
  });

  // 02023 Satellite Uplink — expose up to 2 cards.
  define(code('Satellite Uplink'), {
    *onPlay(g) {
      const seen = [];
      for (let i = 0; i < 2; i++) {
        const targets = installedCorp(g).filter(id => !inst(g, id).rezzed && !seen.includes(id));
        if (!targets.length) break;
        const pick = yield choice('runner', `Satellite Uplink: expose a card? (${i}/2 exposed)`,
          [...targets.map(id => opt(`e:${id}`, cardOf(g, id).title)), opt('done', 'Stop exposing')]);
        if (pick === 'done') break;
        const id = Number(pick.split(':')[1]);
        seen.push(id);
        fx.expose(g, id);
      }
    },
  });

  // 02068 Inside Man — 2 recurring credits to install hardware.
  define(code('Inside Man'), {
    recurring: { n: 2, purposes: ['install-hardware'] },
  });

  // 02042 Joshua B. — turn start: may gain [click]; if you do, take 1 tag
  // when this turn ends.
  define(code('Joshua B.'), {
    *onTurnStart(g, { instId }) {
      const p = yield choice('runner', 'Joshua B.: gain [click]? (take 1 tag when this turn ends)',
        [opt('yes', 'Gain [click]'), opt('no', 'Decline')]);
      if (p !== 'yes') return;
      g.state.runner.clicks += 1;
      fx.emit(g, 'clicks-gained', { who: 'runner', n: 1, why: 'Joshua B.' });
      inst(g, instId).counters.joshuaPending = 1;
    },
    *onTurnEnd(g, { instId }) {
      const it = inst(g, instId);
      if (!it.counters.joshuaPending) return;
      it.counters.joshuaPending = 0;
      yield* fx.addTags(g, 1, 'Joshua B.');
    },
  });

  // 02084 Networking — remove 1 tag. Then, may pay 1cr to add this event
  // back to the grip instead of discarding it.
  define(code('Networking'), {
    *onPlay(g, { instId }) {
      fx.removeTag(g, 1);
      if (!fx.canPay(g, 'runner', 1)) return;
      const p = yield choice('runner', 'Networking: pay 1cr to add Networking to your grip instead of the heap?',
        [opt('pay', 'Pay 1cr'), opt('no', 'Let it go to the heap')]);
      if (p !== 'pay') return;
      fx.pay(g, 'runner', 1, 'Networking');
      inst(g, instId).skipAutoDiscard = true;
    },
  });

  // 02050 Public Sympathy — max hand size +2.
  define(code('Public Sympathy'), {
    handSizeMod: 2,
  });

  // 02083 Andromeda: Dispossessed Ristie — starting hand of 9 cards.
  define(code('Andromeda: Dispossessed Ristie'), {
    startingHandSize: 9,
  });
}
