// Runner heuristic AI (Phase 4).
//
// Strategy: set up economy + a full breaker suite, pressure centrals,
// check advanced remotes, steal what it can afford, respect facecheck risk.
// Information discipline: reads own cards freely; for the corp only public
// facts (credits, rezzed cards, faceup archives, advancement counters,
// identity, hand/deck COUNTS — never hidden card identities). See ai/view.js.
import { BaseAI } from './base.js';
import { inst, cardOf, serverIds, isCentral, memoryUsed, memoryLimit } from '../engine/state.js';
import { getScript } from '../cards/registry.js';
import { canPay } from '../engine/effects.js';
import * as view from './view.js';

const ECON_EVENTS = { 'Sure Gamble': 4, 'Easy Mark': 3, 'Lucky Find': 6 };
const ECON_ACTIONS = ['Magnum Opus', 'Armitage Codebusting', 'Liberated Account', 'Kati Jones'];

export class RunnerAI extends BaseAI {
  constructor(opts = {}) {
    super('runner', opts);
    this.handlers = [
      { match: (g, d) => d.setup, fn: (g, d) => this.mulligan(g, d) },
      { match: (g, d) => d.actionMenu, fn: (g, d) => this.action(g, d) },
      { match: (g, d) => d.runStep === 'jack-out', fn: (g, d) => this.jackOut(g, d) },
      { match: (g, d) => d.runStep === 'encounter', fn: (g, d) => this.encounter(g, d) },
      { match: (g, d) => d.runStep === 'pick-sub', fn: (g, d) => this.pickSub(g, d) },
      { match: (g, d) => d.runStep === 'access-trash', fn: (g, d) => this.accessTrash(g, d) },
      { match: (g, d) => d.runStep === 'steal-cost', fn: (g, d) => this.stealCost(g, d) },
      { match: (g, d) => d.runStep === 'bypass', fn: (g, d) => this.bypass(g, d) },
      { match: (g, d) => d.runStep === 'access-ability', fn: () => 'use' },
      { match: (g, d) => d.trace, fn: (g, d) => this.traceBoost(g, d) },
      { match: (g, d) => d.discard, fn: (g, d) => this.discard(g, d) },
      { match: (g, d) => d.hosting, fn: () => 'host' },
      { match: (g, d) => /Not enough MU/.test(d.prompt), fn: (g, d) => this.muTrash(g, d) },
    ];
    this.cardPrompts = [
      [/put which drawn card on the bottom/i, (g, d) => this.bestByInst(g, d, it => -this.cardValue(g, it.card))],
      [/gain 2 credits or expose/i, (g, d) => d.options.find(o => /credit/i.test(o.label))?.id],
      [/choose 1 installed piece of ice to target/i, (g, d) => this.femmeTarget(g, d)],
      [/derez which installed ice|choose 1 unrezzed piece of ice/i,
        (g, d) => this.bestByInst(g, d, it => it.card.cost ?? 0)],
      [/run HQ or R&D/i, (g, d) => d.options[0].id],
      [/run another server/i, (g, d) => d.options.find(o => ['no', 'cancel'].includes(o.id))?.id ?? d.options[0].id],
      [/Pop-up Window: pay 1cr/i, (g, d) =>
        canPay(g, 'runner', 1) ? d.options.find(o => /pay/i.test(o.label))?.id : d.options[0].id],
      [/take 1 tag or end the run/i, (g, d) => this.dataRaven(g, d)],
    ];
  }

  // ---------- setup ----------
  mulligan(g) {
    const hand = g.state.runner.hand.map(id => cardOf(g, id));
    const econ = hand.filter(c => ECON_EVENTS[c.title] || ECON_ACTIONS.includes(c.title)).length;
    const cheap = hand.filter(c => (c.cost ?? 0) <= 2).length;
    if (econ === 0 && cheap <= 1) return 'mulligan';
    return 'keep';
  }

  // ---------- main action menu ----------
  action(g, d) {
    const s = g.state, r = s.runner;
    const ranked = [];
    const add = (id, score) => { if (d.options.some(o => o.id === id)) ranked.push({ id, score }); };

    // --- tags are a liability (trashable resources, Scorched) ---
    if (r.tags > 0) {
      const corpRich = s.corp.credits >= 4;
      const exposed = r.rig.resource.length > 0;
      add('remove-tag', exposed || corpRich ? 85 : 40);
    }

    // --- economy ---
    for (const id of r.hand) {
      const card = cardOf(g, id);
      const gain = ECON_EVENTS[card.title];
      if (gain) add(`play:${id}`, r.credits < 12 ? 60 + gain : 28 + gain);
    }
    for (const o of d.options) {
      if (!o.id.startsWith('cardact:')) continue;
      const label = o.label;
      if (ECON_ACTIONS.some(t => label.startsWith(t))) {
        add(o.id, r.credits < 10 ? 62 : 20);
      }
    }

    // --- rig building ---
    const needTypes = this.uncoveredIceTypes(g);
    for (const id of r.hand) {
      const card = cardOf(g, id);
      if (!['program', 'hardware', 'resource'].includes(card.type)) continue;
      if (!d.options.some(o => o.id === `install:${id}`)) continue;
      if (card.type === 'program' && !this.muFits(g, card) && !this.muUpgradeWorth(g, card)) continue;
      const v = this.installValue(g, card, needTypes);
      // keep an econ cushion: don't dump every credit into the rig
      if (v > 0 && r.credits - (card.cost ?? 0) >= (v >= 70 ? 0 : 3)) add(`install:${id}`, v);
    }

    // --- runs (only clearly-positive expected value; junk runs bleed tempo) ---
    if (r.clicks >= 1) {
      let best = null;
      for (const sid of serverIds(g)) {
        const ev = this.runEV(g, sid);
        if (ev !== null && (!best || ev > best.ev)) best = { sid, ev };
      }
      if (best && best.ev > 4) add(`run:${best.sid}`, Math.min(90, 28 + best.ev * 0.9));
    }

    // --- draw / credit baselines ---
    // Against Jinteki PE, a thin grip isn't just "less action economy" like
    // it is elsewhere — it's a flatline risk from the very next agenda
    // scored or stolen (either side). Gabriel specifically (see runEV's PE
    // overextension comment) needs the extra nudge toward drawing back up
    // instead of chasing HQ credits into a flatline (Phase 9 tuning).
    const peGabe = this.corpIdentity(g).includes('Personal Evolution') && this.identityTitle(g).startsWith('Gabriel');
    add('draw', peGabe && r.hand.length <= 2 ? 45 :
      r.hand.length <= 1 ? 55 : (r.hand.length <= 3 ? 30 : 8));
    add('credit', r.credits < 5 ? 34 : 10);

    ranked.sort((a, b) => b.score - a.score);
    if (!ranked.length) return this.fallback(g, d);
    return this.maybeBlunder(ranked).id;
  }

  installValue(g, card, needTypes) {
    const script = getScript(card.code);
    if (script?.breaker) {
      const covered = new Set();
      for (const b of view.breakers(g)) b.types.forEach(t => covered.add(t));
      const newTypes = script.breaker.types.filter(t => !covered.has(t));
      if (newTypes.some(t => needTypes.has(t) || t === 'all')) return 80;
      if (newTypes.length) return 55;          // future-proof coverage
      return 15;                               // duplicate
    }
    if (ECON_ACTIONS.includes(card.title)) return 65;
    if (card.type === 'hardware') {
      if (script?.memoryMod && memoryUsed(g) + 1 >= memoryLimit(g)) return 58;
      if (card.subtypes.includes('Console') ) return 50;
      return 30;
    }
    if (card.type === 'resource') return 35;
    if (card.type === 'program') return 25;    // non-breaker utility
    return 0;
  }

  // which rezzed ice types on the board have no matching installed breaker
  uncoveredIceTypes(g) {
    const covered = new Set();
    for (const b of view.breakers(g)) b.types.forEach(t => covered.add(t));
    const need = new Set();
    for (const sid of serverIds(g)) {
      for (const iceId of view.serverIce(g, sid)) {
        const v = view.runnerSeesIce(g, iceId);
        if (!v.rezzed) continue;
        const types = v.subtypes.filter(t => ['barrier', 'code-gate', 'sentry'].includes(t));
        for (const t of types) {
          if (!covered.has(t) && !covered.has('all')) need.add(t);
        }
      }
    }
    return need;
  }

  // ---------- run expected value (null = don't consider) ----------
  runEV(g, sid) {
    const s = g.state, r = s.runner;
    let value = 0;
    if (sid === 'archives') {
      const faceupAgendas = s.corp.archives.filter(id => {
        const it = inst(g, id);
        return it.faceup && it.card.type === 'agenda';
      }).length;
      value = faceupAgendas ? 90 : 4;
    } else if (sid === 'hq') {
      value = 24 + (this.identityTitle(g).startsWith('Gabriel') ? 14 : 0);
    } else if (sid === 'rd') {
      value = 28;
    } else {
      // remote: only what the runner can see
      for (const id of view.serverContent(g, sid)) {
        const c = view.runnerSeesContent(g, id);
        if (!c.faceup) {
          value += c.advancement >= 3 ? 75 : (c.advancement >= 1 ? 55 : 30);
        } else if (['asset', 'upgrade'].includes(c.type)) {
          const tc = cardOf(g, id).trashCost;
          if (tc != null && canPay(g, 'runner', tc, 'trash')) value += 14;
        }
      }
      if (value === 0) return null;   // empty remote
      // trap respect: Jinteki PE punishes facechecking with a thin grip
      if (this.corpIdentity(g).includes('Personal Evolution') && r.hand.length <= 2) value -= 50;
    }

    // PE overextension (Gabriel specifically): EVERY agenda scored or stolen
    // deals 1 net damage (either side), and Gabriel's own +14 HQ bonus above
    // otherwise makes repeated HQ runs look worth it right up to (and past)
    // the point of flatlining — other runner identities don't have that
    // built-in pull toward over-running HQ, so this stays scoped to Gabriel
    // rather than penalizing every matchup against Jinteki PE (Phase 9
    // tuning, docs/AI.md: "Jinteki PE vs Gabriel skews corp").
    if (this.corpIdentity(g).includes('Personal Evolution') && this.identityTitle(g).startsWith('Gabriel')) {
      if (r.hand.length <= 1) value -= 25;
      else if (r.hand.length <= 2) value -= 12;
    }

    // repeated-run fatigue. R&D's top card only changes when the corp draws,
    // so a second R&D run this turn re-reads the same card — nearly worthless.
    const runsThisTurn = (s.flags.turn.runsMade ?? []).filter(x => x === sid).length;
    value -= runsThisTurn * (sid === 'rd' ? 45 : sid === 'hq' ? 20 : 25);

    // cost & risk from ice. Unrezzed ice only threatens while the corp has
    // rez money left — stacked cardboard the corp can't afford is a bluff.
    let cost = 0, risk = 0, blocked = false, rezBudget = s.corp.credits;
    for (const iceId of view.serverIce(g, sid)) {
      const v = view.runnerSeesIce(g, iceId);
      if (v.rezzed) {
        const br = view.costToBreak(g, iceId);
        if (br) cost += br.cost;
        else {
          const danger = view.iceDanger(g, iceId) ?? 0;
          const etrOnly = v.subs.every(l => view.subThreat(l) === 'etr');
          if (v.clickBreak) cost += 1;             // bioroids: click through
          else if (etrOnly) blocked = true;         // bounce off — run is dead
          else risk += danger;                      // facecheck pain
        }
      } else if (rezBudget >= 3) {
        rezBudget -= 4;                             // assume ~4cr per rez
        cost += 2;
        risk += this.hiddenIceRisk(g);
      }
    }
    if (blocked) return null;
    if (cost > r.credits) return null;              // can't pay to get in
    // desperation: when the corp is close to winning, central pressure is life
    if (s.corp.agendaPoints >= 5 && (isCentral(sid) || value >= 50)) value += 18;
    const reserve = this.level.reserve;
    // hard reads run costs as an investment; standard overpays in tempo
    const costWeight = this.level.key === 'hard' ? 1.6 : 2.2;
    const riskTolerance = this.level.key === 'hard' ? 0.8 : 1.2;
    return value - cost * costWeight - risk * riskTolerance -
      (cost > 0 && r.credits - cost < reserve ? 10 : 0);
  }

  hiddenIceRisk(g) {
    if (!this.level.riskAware) return 3;            // standard: face-checks happily
    const corpId = this.corpIdentity(g);
    const grip = g.state.runner.hand.length;
    let risk = 5;
    if (corpId.includes('Personal Evolution') || corpId.includes('Jinteki')) risk += grip <= 2 ? 20 : 8;
    if (grip <= 1) risk += 10;
    if (!view.breakers(g).length) risk += 8;        // naked facecheck
    return risk;
  }

  identityTitle(g) { return cardOf(g, g.state.runner.identity).title; }
  corpIdentity(g) { return cardOf(g, g.state.corp.identity).title; }

  // ---------- during runs ----------
  jackOut(g) {
    const s = g.state, run = s.run;
    if (!run) return 'continue';
    const ice = view.serverIce(g, run.server);
    // remaining ice = those not yet passed (array index 0 innermost;
    // approach order is outermost -> innermost)
    const remaining = ice.slice(0, ice.length - run.icePassed);
    let cost = 0, danger = 0;
    for (const iceId of remaining) {
      const v = view.runnerSeesIce(g, iceId);
      if (!v.rezzed) { danger += this.hiddenIceRisk(g) / 2; continue; }
      const br = view.costToBreak(g, iceId);
      if (br) cost += br.cost;
      else if (v.subs.every(l => view.subThreat(l) === 'etr')) return 'jack-out'; // hard wall
      else danger += view.iceDanger(g, iceId) ?? 0;
    }
    if (cost > s.runner.credits) return 'jack-out';
    if (this.level.riskAware && danger >= 25 && s.runner.hand.length <= 2) return 'jack-out';
    return 'continue';
  }

  encounter(g, d) {
    const s = g.state;
    const iceId = d.iceId;
    const ice = inst(g, iceId);
    const v = view.runnerSeesIce(g, iceId);
    const unbroken = v.subs.filter((_, i) => !ice.brokenSubs.includes(i));
    if (!unbroken.length) return 'continue';

    const threat = unbroken.reduce((a, l) => a + (view.THREAT_WEIGHT[view.subThreat(l)] ?? 1), 0);
    const etrOnly = unbroken.every(l => view.subThreat(l) === 'etr');

    // ready to break? (breaker strength already >= ice strength)
    const breaks = d.options.filter(o => o.id.startsWith('break:'));
    if (breaks.length) {
      // cheapest break option
      const best = breaks.map(o => {
        const b = view.breakers(g).find(x => x.id === Number(o.id.split(':')[1]));
        return { id: o.id, cost: b?.breakCost?.cost ?? 99 };
      }).sort((a, b) => a.cost - b.cost)[0];
      if (!etrOnly || this.worthBreakingEtr(g, best.cost, unbroken.length)) return best.id;
    }

    // boost a matching breaker toward strength — only if finishing is affordable
    const boosts = d.options.filter(o => o.id.startsWith('boost:'));
    for (const o of boosts) {
      const bId = Number(o.id.split(':')[1]);
      const b = view.breakers(g).find(x => x.id === bId);
      if (!b?.boost || !b.breakCost) continue;
      const gap = v.strength - b.strength;
      if (gap <= 0) continue;                      // already there; break instead
      const boostsNeeded = Math.ceil(gap / b.boost.amount);
      const total = boostsNeeded * b.boost.cost + b.breakCost.cost;
      if (!canPay(g, 'runner', total, 'icebreaker')) continue;
      if (etrOnly && !this.worthBreakingEtr(g, total, unbroken.length)) continue;
      return o.id;
    }

    // bioroid click-break when it saves the run and we have clicks to spare
    if (d.options.some(o => o.id === 'clickbreak') && (threat >= 8 || !etrOnly || s.runner.clicks >= 2)) {
      return 'clickbreak';
    }

    // face the music: tank subs we can't or won't break
    return 'continue';
  }

  // paying to break pure end-the-run ice is only worth it when the server matters
  worthBreakingEtr(g, cost, nSubs) {
    const run = g.state.run;
    if (!run) return false;
    const sid = run.server;
    let stake = isCentral(sid) ? 8 : 0;
    for (const id of view.serverContent(g, sid)) {
      const c = view.runnerSeesContent(g, id);
      if (!c.faceup && c.advancement >= 2) stake += 20;
      else stake += 6;
    }
    return cost <= Math.max(3, stake) && canPay(g, 'runner', cost, 'icebreaker');
  }

  pickSub(g, d) {
    // break the scariest subroutine first
    let best = null, bestW = -1;
    for (const o of d.options) {
      if (o.id === 'stop') continue;
      const w = view.THREAT_WEIGHT[view.subThreat(o.label)] ?? 1;
      if (w > bestW) { best = o.id; bestW = w; }
    }
    return best;
  }

  accessTrash(g, d) {
    const m = d.prompt.match(/Trash for (\d+)cr/);
    const cost = m ? Number(m[1]) : 99;
    const credits = g.state.runner.credits;
    // trashing corp assets/upgrades is usually tempo-positive if cheap;
    // hard commits to economy denial
    if (cost <= 3 && credits - cost >= 2) return 'trash';
    if (cost <= 5 && credits - cost >= (this.level.key === 'hard' ? 3 : 5)) return 'trash';
    return 'leave';
  }

  stealCost(g, d) {
    // steal whenever the engine says we can afford it (it gates affordability)
    const m = d.prompt.match(/(\d+)cr/);
    const cr = m ? Number(m[1]) : 0;
    if (cr > 0 && g.state.runner.credits - cr < 1 && g.state.runner.clicks === 0) {
      // completely broke afterwards — still steal: agendas win games
    }
    return 'steal';
  }

  bypass(g, d) {
    const m = d.prompt.match(/for (\d+)cr\?/);
    const cost = m ? Number(m[1]) : 99;
    return cost <= 4 && canPay(g, 'runner', cost, 'icebreaker') ? 'bypass' : 'no';
  }

  dataRaven(g, d) {
    // take the tag if we can clear it later; end the run when tags are lethal
    const tagOpt = d.options.find(o => /tag/i.test(o.label));
    const endOpt = d.options.find(o => /end/i.test(o.label));
    if (g.state.runner.credits >= 4 || g.state.runner.rig.resource.length === 0) {
      return (tagOpt ?? d.options[0]).id;
    }
    return (endOpt ?? d.options[0]).id;
  }

  traceBoost(g, d) {
    const m = d.prompt.match(/Trace strength (\d+) vs link (\d+)/);
    if (!m) return 0;
    const ts = Number(m[1]), link = Number(m[2]);
    const needed = ts + 1 - link;   // trace succeeds on ties
    if (needed <= 0) return 0;
    const credits = g.state.runner.credits;
    const maxSpend = this.level.key === 'hard' ? 6 : 4;
    const exposed = g.state.runner.rig.resource.length > 0;
    if (needed <= Math.min(d.max, credits, maxSpend + (exposed ? 3 : 0))) return needed;
    return 0;
  }

  discard(g, d) {
    return this.bestByInst(g, d, it => -this.cardValue(g, it.card)) ?? d.options[0].id;
  }
  cardValue(g, card) {
    const script = getScript(card.code);
    if (script?.breaker) {
      const covered = new Set();
      for (const b of view.breakers(g)) b.types.forEach(t => covered.add(t));
      return script.breaker.types.some(t => !covered.has(t)) ? 90 : 40;
    }
    if (ECON_EVENTS[card.title] || ECON_ACTIONS.includes(card.title)) return 60;
    if (card.type === 'hardware') return 45;
    if (card.type === 'program') return 50;
    return 30;
  }

  muTrash(g, d) {
    // never trash a strictly better program to make room; prefer cancel
    const cancel = d.options.find(o => o.id === 'cancel');
    const m = d.prompt.match(/Not enough MU for (.+)\. Trash/);
    const incoming = m ? Object.values(g.insts).find(x => x.card.title === m[1] && x.zone === 'runner-hand') : null;
    if (!incoming) return cancel?.id ?? d.options[0].id;
    const incomingV = this.cardValue(g, incoming.card);
    let worst = null, worstV = Infinity;
    for (const o of d.options) {
      if (o.id === 'cancel') continue;
      const it = view.optionInst(g, o.id);
      if (!it) continue;
      const v = this.cardValue(g, it.card);
      if (v < worstV) { worst = o.id; worstV = v; }
    }
    if (worst && worstV < incomingV - 10) return worst;
    return cancel?.id ?? d.options[0].id;
  }

  femmeTarget(g, d) {
    // target the nastiest rezzed ice (bypass value), else the outermost anything
    return this.bestByInst(g, d, it =>
      it.rezzed ? (view.iceDanger(g, it.id) ?? 0) + (it.card.strength ?? 0) : 0);
  }

  // MU helpers
  muFits(g, card) {
    return memoryUsed(g) + (card.memoryCost ?? 0) <= memoryLimit(g);
  }
  muUpgradeWorth(g, card) {
    // allow install-over when the incoming card clearly beats our worst program
    const incoming = this.cardValue(g, card);
    const worst = Math.min(...g.state.runner.rig.program.map(id => this.cardValue(g, cardOf(g, id))), Infinity);
    return worst !== Infinity && incoming > worst + 10;
  }
}
