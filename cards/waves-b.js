// Batch B: NBN + Weyland + neutral-corp, Revised Core Set (codes 20077-20092,
// 20109-20132, excluding pilot codes 20088/20090/20129/20130/20131/20132).
// Faithful to printed text; deviations noted in docs/CARD_COVERAGE.md.
import { define, getScript } from './registry.js';
import * as fx from '../engine/effects.js';
import { inst, cardOf, moveCard } from '../engine/state.js';
import { choice, opt, number } from '../engine/decisions.js';
import { installedCorp } from '../engine/hooks.js';

let registered = false;
export function registerWavesB(db) {
  if (registered) return; registered = true;
  const code = t => db.titled(t).code;

  const etr = {
    label: 'End the run',
    *resolve(g) { g.state.run.ended = true; fx.emit(g, 'run-ends-sub', {}); },
  };

  // corp picks 1 installed runner program to trash (Archer)
  function* trashInstalledProgram(g, why) {
    const progs = g.state.runner.rig.program;
    if (!progs.length) return;
    const pick = yield choice('corp', `${why}: trash which program?`,
      progs.map(id => opt(`t:${id}`, cardOf(g, id).title)));
    yield* fx.trashWithPrevention(g, Number(pick.split(':')[1]), why);
  }
  // corp picks 1 installed hardware to trash (Flare)
  function* trashInstalledHardware(g, why) {
    const hw = g.state.runner.rig.hardware;
    if (!hw.length) return;
    const pick = yield choice('corp', `${why}: trash which hardware?`,
      hw.map(id => opt(`t:${id}`, cardOf(g, id).title)));
    yield* fx.trashWithPrevention(g, Number(pick.split(':')[1]), why);
  }
  // cards this batch treats as "can be advanced": printed agendas + scripts
  // with advanceable:true (mirrors the helper pattern in waves-a's Trick of Light)
  function advanceableInstalledIds(g) {
    return installedCorp(g).filter(id => {
      const it = inst(g, id);
      const av = getScript(it.code)?.advanceable;
      return it.card.type === 'agenda' || (typeof av === 'function' ? av(g, it) : av);
    });
  }

  // ---------------- Weyland Consortium ----------------

  // 20077 Weyland Consortium: Building a Better World — play a transaction
  // operation: gain 1cr.
  define(code('Weyland Consortium: Building a Better World'), {
    *onPlayOperation(g, { operationId }) {
      if (cardOf(g, operationId).subtypes.includes('Transaction')) {
        fx.gainCredits(g, 'corp', 1, 'Building a Better World');
      }
    },
  });

  // 20078 Hostile Takeover — score: gain 7cr, take 1 bad publicity.
  define(code('Hostile Takeover'), {
    *onScore(g) {
      fx.gainCredits(g, 'corp', 7, 'Hostile Takeover');
      fx.addBadPublicity(g, 1, 'Hostile Takeover');
    },
  });

  // 20079 Project Atlas — score: 1 agenda counter per hosted advancement past
  // 3; hosted counter: search R&D for any card, reveal it, add to HQ.
  define(code('Project Atlas'), {
    *onScore(g, { instId }) {
      const it = inst(g, instId);
      const n = Math.max(0, it.advancement - 3);
      if (n) {
        it.counters.agenda = (it.counters.agenda ?? 0) + n;
        fx.emit(g, 'counters-added', { id: instId, n, kind: 'agenda', total: it.counters.agenda });
      }
    },
    actions: [{
      label: 'Hosted agenda counter: search R&D for a card and add it to HQ',
      clicks: 0,
      req: (g, it) => (it.counters.agenda ?? 0) > 0,
      *effect(g, { instId }) {
        inst(g, instId).counters.agenda--;
        const id = yield* fx.searchAndPick(g, 'corp', 'deck', () => true,
          'Project Atlas: search R&D for a card to add to HQ');
        if (id != null) {
          moveCard(g, id, 'corp-hand');
          fx.emit(g, 'card-to-hand', { id, title: cardOf(g, id).title, why: 'Project Atlas' });
        }
        fx.shuffleDeck(g, 'corp');
      },
    }],
  });

  // 20080 The Cleaners — while scored, meat damage dealt is increased by 1.
  define(code('The Cleaners'), {
    damageMod(g, it, type) { return type === 'meat' ? 1 : 0; },
  });

  // 20081 Dedicated Response Team — if the Runner is tagged, whenever a
  // successful run ends, do 2 meat damage.
  define(code('Dedicated Response Team'), {
    *onRunEnd(g, { successful }) {
      if (successful && g.state.runner.tags > 0) {
        yield* fx.damage(g, 'meat', 2, 'Dedicated Response Team');
      }
    },
  });

  // 20082 Elizabeth Mills — rez: remove 1 bad publicity. [click][trash]:
  // trash 1 installed location resource, take 1 bad publicity.
  define(code('Elizabeth Mills'), {
    *onRez(g) { fx.removeBadPublicity(g, 1); },
    actions: [{
      label: 'Trash 1 installed location resource; take 1 bad publicity',
      clicks: 1,
      trashSelf: true,
      req: (g) => g.state.runner.rig.resource.some(id => cardOf(g, id).subtypes.includes('Location')),
      *effect(g) {
        const locs = g.state.runner.rig.resource.filter(id => cardOf(g, id).subtypes.includes('Location'));
        const pick = yield choice('corp', 'Elizabeth Mills: trash which location resource?',
          locs.map(id => opt(`t:${id}`, cardOf(g, id).title)));
        yield* fx.trashWithPrevention(g, Number(pick.split(':')[1]), 'Elizabeth Mills');
        fx.addBadPublicity(g, 1, 'Elizabeth Mills');
      },
    }],
  });

  // 20083 GRNDL Refinery — advanceable; [click][trash]: gain 4cr per adv token.
  // Deviation: we don't use the engine's `trashSelf` flag here because
  // moveCard() zeroes `advancement` on trash — we read the counter and trash
  // it ourselves inside `effect` so the payout still reflects the tokens it
  // had (last known information), matching the printed ability.
  define(code('GRNDL Refinery'), {
    advanceable: true,
    actions: [{
      label: 'Trash: gain 4cr for each advancement token on GRNDL Refinery',
      clicks: 1,
      *effect(g, { instId }) {
        const n = inst(g, instId).advancement;
        fx.trash(g, instId, 'GRNDL Refinery');
        fx.gainCredits(g, 'corp', 4 * n, 'GRNDL Refinery');
      },
    }],
  });

  // 20084 Archer — additional rez cost: forfeit 1 agenda. Subs: gain 2cr,
  // trash program x2, ETR.
  // Deviation (per CARD_GUIDANCE): the engine has no additional-rez-cost
  // hook, so this is implemented in onRez: if the Corp has a scored agenda
  // it is forfeited (chosen by the corp); if not, rez proceeds anyway and an
  // 'archer-rez-invalid' event is emitted instead of blocking the rez. Do
  // not rez Archer with no scored agenda in play against this engine.
  define(code('Archer'), {
    *onRez(g, { instId }) {
      const scored = g.state.corp.score.filter(id => cardOf(g, id).type === 'agenda');
      if (!scored.length) { fx.emit(g, 'archer-rez-invalid', { instId }); return; }
      const pick = yield choice('corp', 'Archer: forfeit which agenda (additional rez cost)?',
        scored.map(id => opt(`f:${id}`, cardOf(g, id).title)));
      fx.forfeit(g, 'corp', Number(pick.split(':')[1]));
    },
    subroutines: [
      { label: 'Gain 2 credits', *resolve(g) { fx.gainCredits(g, 'corp', 2, 'Archer'); } },
      { label: 'Trash 1 installed program', *resolve(g) { yield* trashInstalledProgram(g, 'Archer'); } },
      { label: 'Trash 1 installed program', *resolve(g) { yield* trashInstalledProgram(g, 'Archer'); } },
      etr,
    ],
  });

  // 20085 Caduceus — trace 3 -> gain 3cr; trace 2 -> ETR.
  define(code('Caduceus'), {
    subroutines: [
      { label: 'Trace 3 - the Corp gains 3 credits', *resolve(g) {
          if (yield* fx.trace(g, 3, 'Caduceus')) fx.gainCredits(g, 'corp', 3, 'Caduceus');
      } },
      { label: 'Trace 2 - end the run', *resolve(g) {
          if (yield* fx.trace(g, 2, 'Caduceus')) { g.state.run.ended = true; fx.emit(g, 'run-ends-sub', {}); }
      } },
    ],
  });

  // 20086 Hadrian's Wall — advanceable, +1 strength per advancement. ETR x2.
  define(code("Hadrian's Wall"), {
    advanceable: true,
    strengthBonus: (g, it) => it.advancement,
    subroutines: [etr, etr],
  });

  // 20087 Hive — loses 1 printed ETR sub per agenda point in the Corp's score area.
  define(code('Hive'), {
    activeSubIndices(g) {
      const pts = g.state.corp.agendaPoints;
      const n = Math.max(0, 5 - pts);
      return [0, 1, 2, 3, 4].slice(0, n);
    },
    subroutines: [etr, etr, etr, etr, etr],
  });

  // 20089 Shadow — advanceable, +1 strength per advancement. Corp gains 2cr;
  // trace 3 -> 1 tag.
  define(code('Shadow'), {
    advanceable: true,
    strengthBonus: (g, it) => it.advancement,
    subroutines: [
      { label: 'The Corp gains 2 credits', *resolve(g) { fx.gainCredits(g, 'corp', 2, 'Shadow'); } },
      { label: 'Trace 3 - give the Runner 1 tag', *resolve(g) {
          if (yield* fx.trace(g, 3, 'Shadow')) yield* fx.addTags(g, 1, 'Shadow');
      } },
    ],
  });

  // 20091 Punitive Counterstrike — trace 5 -> X meat damage, X = printed
  // agenda points the Runner stole during their last turn.
  define(code('Punitive Counterstrike'), {
    *onPlay(g) {
      if (yield* fx.trace(g, 5, 'Punitive Counterstrike')) {
        const x = g.state.flags.lastRunnerTurn.stolenPoints ?? 0;
        yield* fx.damage(g, 'meat', x, 'Punitive Counterstrike');
      }
    },
  });

  // 20092 Shipment from Kaguya — place 1 advancement on each of up to 2
  // different installed cards that can be advanced.
  define(code('Shipment from Kaguya'), {
    *onPlay(g) {
      const chosen = [];
      for (let i = 0; i < 2; i++) {
        const eligible = advanceableInstalledIds(g).filter(id => !chosen.includes(id));
        if (!eligible.length) break;
        const pick = yield choice('corp', `Shipment from Kaguya: place 1 advancement token on which card? (${i + 1}/2)`,
          [...eligible.map(id => opt(`t:${id}`, `${cardOf(g, id).title} [${inst(g, id).advancement}]`)), opt('done', 'Stop')]);
        if (pick === 'done') break;
        const id = Number(pick.split(':')[1]);
        inst(g, id).advancement++;
        chosen.push(id);
        fx.emit(g, 'card-advanced', { id, advancement: inst(g, id).advancement });
      }
    },
  });

  // ---------------- NBN ----------------

  // 20109 NBN: Making News — 2 recurring credits, trace attempts only.
  define(code('NBN: Making News'), {
    recurring: { n: 2, purposes: ['trace'] },
  });

  // 20110 Project Beale — score: 1 agenda counter per 2 hosted advancement
  // past 3; +1 agenda point per hosted counter.
  // Deviation: engine's scoreAgendaFx adds the agenda's base points to
  // g.state.corp.agendaPoints BEFORE calling onScore, so bonusPoints (which
  // depends on counters placed here) can't retroactively inflate the total
  // this same scoring resolves. onScore adds the bonus to agendaPoints
  // directly as well; bonusPoints stays defined so later agendaPointsOf()
  // calls (e.g. forfeiting Project Beale) still report the correct total.
  define(code('Project Beale'), {
    *onScore(g, { instId }) {
      const it = inst(g, instId);
      const n = Math.max(0, Math.floor((it.advancement - 3) / 2));
      if (n) {
        it.counters.agenda = (it.counters.agenda ?? 0) + n;
        g.state.corp.agendaPoints += n;
        fx.emit(g, 'counters-added', { id: instId, n, kind: 'agenda', total: it.counters.agenda });
      }
    },
    bonusPoints: (g, it) => it.counters.agenda ?? 0,
  });

  // 20111 TGTBT — accessed (any zone): give the Runner 1 tag.
  // Deviation: the "must reveal it while accessing in R&D" clause isn't
  // separately modeled — access is already a logged/visible engine event.
  define(code('TGTBT'), {
    *onAccess(g) { yield* fx.addTags(g, 1, 'TGTBT'); },
  });

  // 20112 Ghost Branch — advanceable asset; accessed: corp may give the
  // Runner 1 tag per advancement token.
  define(code('Ghost Branch'), {
    advanceable: true,
    *onAccess(g, { instId }) {
      const it = inst(g, instId);
      if (it.advancement <= 0) return;
      const p = yield choice('corp', `Ghost Branch: give the Runner ${it.advancement} tag(s)?`,
        [opt('yes', `Give ${it.advancement} tag(s)`), opt('no', 'Decline')]);
      if (p === 'yes') yield* fx.addTags(g, it.advancement, 'Ghost Branch');
    },
  });

  // 20113 Data Raven — encounter: Runner takes 1 tag or ends the run.
  // Hosted power counter: give the Runner 1 tag. Sub: trace 3 -> power counter.
  // Deviation (per CARD_GUIDANCE): the "hosted power counter" ability is
  // usable by the corp at any time in the real game; here it's offered only
  // during corp run-window decisions (runWindowAbility), like Nisei/Himitsu-Bako.
  define(code('Data Raven'), {
    *onEncounter(g) {
      const p = yield choice('runner', 'Data Raven: take 1 tag or end the run?',
        [opt('tag', 'Take 1 tag'), opt('end', 'End the run')]);
      if (p === 'tag') yield* fx.addTags(g, 1, 'Data Raven');
      else { g.state.run.ended = true; fx.emit(g, 'run-ends-sub', { via: 'Data Raven' }); }
    },
    subroutines: [
      { label: 'Trace 3 - place 1 power counter on Data Raven', *resolve(g, { iceId }) {
          if (yield* fx.trace(g, 3, 'Data Raven')) {
            const it = inst(g, iceId);
            it.counters.power = (it.counters.power ?? 0) + 1;
            fx.emit(g, 'counters-added', { id: iceId, n: 1, kind: 'power', total: it.counters.power });
          }
      } },
    ],
    runWindowAbility: {
      label: () => 'Hosted power counter: give the Runner 1 tag',
      req: (g, it) => (it.counters.power ?? 0) > 0,
      *effect(g, { instId }) {
        inst(g, instId).counters.power--;
        yield* fx.addTags(g, 1, 'Data Raven');
      },
    },
  });

  // 20114 Flare — trace 6 -> trash 1 hardware, 2 unpreventable meat damage, ETR.
  define(code('Flare'), {
    subroutines: [
      { label: 'Trace 6 - trash 1 piece of hardware, do 2 meat damage (cannot be prevented), and end the run', *resolve(g) {
          if (yield* fx.trace(g, 6, 'Flare')) {
            yield* trashInstalledHardware(g, 'Flare');
            yield* fx.damage(g, 'meat', 2, 'Flare', { unpreventable: true });
            g.state.run.ended = true;
            fx.emit(g, 'run-ends-sub', {});
          }
      } },
    ],
  });

  // 20115 Pop-up Window — encounter: corp gains 1cr. Sub: ETR unless Runner
  // pays 1cr.
  define(code('Pop-up Window'), {
    *onEncounter(g) { fx.gainCredits(g, 'corp', 1, 'Pop-up Window'); },
    subroutines: [
      { label: 'End the run unless the Runner pays 1 credit', *resolve(g) {
          if (fx.canPay(g, 'runner', 1)) {
            const p = yield choice('runner', 'Pop-up Window: pay 1cr, or end the run?',
              [opt('pay', 'Pay 1cr'), opt('end', 'End the run')]);
            if (p === 'pay') fx.pay(g, 'runner', 1, 'Pop-up Window');
            else { g.state.run.ended = true; fx.emit(g, 'run-ends-sub', {}); }
          } else {
            g.state.run.ended = true; fx.emit(g, 'run-ends-sub', {});
          }
      } },
    ],
  });

  // 20116 Tollbooth — encounter: Runner must pay 3cr if able, else ETR. Sub: ETR.
  define(code('Tollbooth'), {
    *onEncounter(g) {
      if (fx.canPay(g, 'runner', 3)) {
        fx.pay(g, 'runner', 3, 'Tollbooth');
      } else {
        g.state.run.ended = true;
        fx.emit(g, 'run-ends-sub', { via: 'Tollbooth' });
      }
    },
    subroutines: [etr],
  });

  // 20117 Wraparound — +7 strength while no fracter is installed. Sub: ETR.
  define(code('Wraparound'), {
    strengthBonus(g) {
      return g.state.runner.rig.program.some(id => cardOf(g, id).subtypes.includes('Fracter')) ? 0 : 7;
    },
    subroutines: [etr],
  });

  // 20118 Anonymous Tip — draw 3 cards.
  define(code('Anonymous Tip'), { *onPlay(g) { fx.draw(g, 'corp', 3); } });

  // 20119 Closed Accounts — play only if the Runner is tagged; Runner loses
  // all credits.
  define(code('Closed Accounts'), {
    canPlay(g) { return g.state.runner.tags > 0; },
    *onPlay(g) {
      const n = g.state.runner.credits;
      g.state.runner.credits = 0;
      fx.emit(g, 'credits-spent', { who: 'runner', n, why: 'Closed Accounts' });
    },
  });

  // 20120 Psychographics — X <= Runner's tags; pay X, place X advancement
  // tokens on 1 installed card the corp can advance.
  define(code('Psychographics'), {
    *onPlay(g) {
      const max = Math.min(g.state.runner.tags, g.state.corp.credits);
      const eligible = advanceableInstalledIds(g);
      if (max <= 0 || !eligible.length) return;
      const x = yield number('corp', `Psychographics: choose X (0-${max}) advancement tokens to place`, 0, max);
      if (x <= 0) return;
      const pick = yield choice('corp', 'Psychographics: place advancement tokens on which card?',
        eligible.map(id => opt(`t:${id}`, cardOf(g, id).title)));
      const id = Number(pick.split(':')[1]);
      fx.pay(g, 'corp', x, 'Psychographics');
      inst(g, id).advancement += x;
      fx.emit(g, 'card-advanced', { id, advancement: inst(g, id).advancement });
    },
  });

  // 20121 SEA Source — play only if the Runner made a successful run last
  // turn. Trace 3 -> 1 tag.
  define(code('SEA Source'), {
    canPlay(g) { return (g.state.flags.lastRunnerTurn.successfulRuns ?? []).length > 0; },
    *onPlay(g) {
      if (yield* fx.trace(g, 3, 'SEA Source')) yield* fx.addTags(g, 1, 'SEA Source');
    },
  });

  // 20122 Red Herrings — persistent additional steal cost: 5cr.
  define(code('Red Herrings'), { stealCost: { credits: 5 }, persistent: true });

  // 20123 Bernice Mai — successful run on this server: trace 5 -> 1 tag; on
  // failure, trash Bernice Mai.
  define(code('Bernice Mai'), {
    *onRunSuccessfulHere(g, { instId }) {
      const success = yield* fx.trace(g, 5, 'Bernice Mai');
      if (success) yield* fx.addTags(g, 1, 'Bernice Mai');
      else fx.trash(g, instId, 'Bernice Mai');
    },
  });

  // 20124 False Lead — forfeit: if the Runner has 2+ clicks remaining, they
  // lose [click][click].
  define(code('False Lead'), {
    actions: [{
      label: 'Forfeit False Lead: the Runner loses [click][click]',
      clicks: 0,
      req: (g) => g.state.runner.clicks >= 2,
      *effect(g, { instId }) {
        fx.forfeit(g, 'corp', instId);
        g.state.runner.clicks -= 2;
        fx.emit(g, 'clicks-lost', { who: 'runner', n: 2, why: 'False Lead' });
      },
    }],
  });

  // 20125 Priority Requisition — score: may rez 1 installed ice ignoring all costs.
  define(code('Priority Requisition'), {
    *onScore(g) {
      const ice = installedCorp(g).filter(id => cardOf(g, id).type === 'ice' && !inst(g, id).rezzed);
      if (!ice.length) return;
      const pick = yield choice('corp', 'Priority Requisition: rez a piece of ice ignoring all costs?',
        [...ice.map(id => opt(`r:${id}`, cardOf(g, id).title)), opt('none', 'Decline')]);
      if (pick === 'none') return;
      yield* fx.rezFx(g, Number(pick.split(':')[1]), { ignoreCost: true });
    },
  });

  // 20126 Private Security Force — if the Runner is tagged, gains "[click]: 1 meat damage".
  define(code('Private Security Force'), {
    actions: [{
      label: 'Do 1 meat damage',
      clicks: 1,
      req: (g) => g.state.runner.tags > 0,
      *effect(g) { yield* fx.damage(g, 'meat', 1, 'Private Security Force'); },
    }],
  });

  // 20127 Melange Mining Corp. — [click][click][click]: gain 7cr.
  define(code('Melange Mining Corp.'), {
    actions: [{
      label: 'Gain 7 credits',
      clicks: 3,
      *effect(g) { fx.gainCredits(g, 'corp', 7, 'Melange Mining Corp.'); },
    }],
  });

  // 20128 PAD Campaign — turn begins: gain 1cr.
  define(code('PAD Campaign'), {
    *onTurnStart(g) { fx.gainCredits(g, 'corp', 1, 'PAD Campaign'); },
  });
}
