// Corp heuristic AI (Phase 4).
//
// Strategy: build one protected scoring remote, keep centrals iced, stay
// rich, install-advance-score agendas when a window exists, punish tags.
// Information discipline: reads its own cards freely (legal), but only
// public facts about the runner (rig, credits, tags, hand COUNT — never
// hand contents). See ai/view.js.
import { BaseAI } from './base.js';
import { inst, cardOf, serverIds, isCentral } from '../engine/state.js';
import { getScript } from '../cards/registry.js';
import { rezCost, canPay, linkBonus } from '../engine/effects.js';
import * as view from './view.js';

const ECON_OP_GAIN = { 'Hedge Fund': 4, 'Beanstalk Royalties': 3, 'Restructure': 5, 'Celebrity Gift': 8 };

export class CorpAI extends BaseAI {
  constructor(opts = {}) {
    super('corp', opts);
    this.handlers = [
      { match: (g, d) => d.setup, fn: (g, d) => this.mulligan(g, d) },
      { match: (g, d) => d.scoreWindow, fn: (g, d) => this.scoreWindow(g, d) },
      { match: (g, d) => d.actionMenu, fn: (g, d) => this.action(g, d) },
      { match: (g, d) => d.installTarget, fn: (g, d) => this.installTarget(g, d) },
      { match: (g, d) => d.runStep === 'rez-ice', fn: (g, d) => this.rezIce(g, d) },
      { match: (g, d) => d.runStep === 'rez-content', fn: (g, d) => this.rezContent(g, d) },
      { match: (g, d) => d.trace, fn: (g, d) => this.traceBoost(g, d) },
      { match: (g, d) => d.discard, fn: (g, d) => this.discard(g, d) },
    ];
    this.cardPrompts = [
      [/forfeit which agenda/i, (g, d) => this.bestByInst(g, d, it => -(it.card.agendaPoints ?? 0))],
      [/trash which (program|resource|hardware|AI program)/i, (g, d) => this.bestByInst(g, d, it => it.card.cost ?? 0)],
      [/reveal a card from HQ/i, (g, d) => this.celebrityGift(g, d)],
      [/rez a piece of ice ignoring/i, (g, d) => this.freeRezPick(g, d)],
      [/top card of R&D .* Move to bottom\?/i, (g, d) => this.yagura(g, d)],
      [/place (1 )?advancement token/i, (g, d) => this.advancementTarget(g, d)],
      [/add which card from Archives to HQ/i, (g, d) => this.bestByInst(g, d, it => this.handValue(g, it))],
      // ambushes (Snare!, Junebug, Ghost Branch): pay when affordable & useful
      [/give the Runner .*(tag|net damage)|net damage for each advancement/i, (g, d) => this.ambushPay(g, d)],
    ];
  }

  // ---------- setup ----------
  mulligan(g) {
    const hand = g.state.corp.hand.map(id => cardOf(g, id));
    const ice = hand.filter(c => c.type === 'ice').length;
    const agendas = hand.filter(c => c.type === 'agenda').length;
    if (ice === 0 || agendas >= 4) return 'mulligan';
    return 'keep';
  }

  // ---------- score window: always score (highest points first) ----------
  scoreWindow(g, d) {
    const best = this.bestByInst(g, d, it => it.card.agendaPoints ?? 0,
      { exclude: (it, o) => o.id === 'pass' });
    return best ?? 'pass';
  }

  // ---------- main action menu ----------
  action(g, d) {
    const s = g.state, c = s.corp;
    const has = verb => d.options.some(o => o.id === verb);
    const opts = id => d.options.find(o => o.id === id);
    const ranked = [];
    const add = (id, score) => { if (d.options.some(o => o.id === id)) ranked.push({ id, score }); };

    const handCards = c.hand.map(id => ({ id, card: cardOf(g, id) }));
    const scoringSid = this.scoringRemote(g);
    const runner = view.publicSide(g, 'runner');

    // --- kill / tag punishment ---
    for (const { id, card } of handCards) {
      if (card.type !== 'operation') continue;
      const oid = `play:${id}`;
      if (!d.options.some(o => o.id === oid)) continue;
      if (card.title === 'Scorched Earth' && runner.tags > 0) {
        add(oid, runner.handCount <= 4 ? 95 : 70);
      }
      if (card.title === 'Neural EMP') add(oid, runner.handCount <= 1 ? 92 : (runner.handCount <= 3 ? 45 : 20));
      if (card.title === 'Closed Accounts' && runner.tags > 0 && runner.credits >= 4) add(oid, 68);
      if (card.title === 'SEA Source' && c.credits >= runner.credits + (card.cost ?? 0) + 2) {
        const punish = handCards.some(h => ['Scorched Earth', 'Closed Accounts', 'Psychographics'].includes(h.card.title));
        if (punish) add(oid, 66);
      }
    }
    if (has('trash-resource')) {
      const worst = Math.max(...s.runner.rig.resource.map(id => cardOf(g, id).cost ?? 0), 0);
      add('trash-resource', 50 + Math.min(worst * 4, 20));
    }

    // --- advance toward a score ---
    for (const iid of this.myInstalled(g)) {
      const it = inst(g, iid);
      const oid = `advance:${iid}`;
      if (!d.options.some(o => o.id === oid)) continue;
      if (it.card.type === 'agenda') {
        const req = Math.max(0, it.card.advancementCost + (getScript(it.code)?.advReqMod?.(g, it) ?? 0));
        const left = req - it.advancement;
        if (left <= 0) continue;
        const affordable = Math.min(c.clicks, c.credits);
        if (left <= affordable) add(oid, 88);                    // finish it now
        else if (this.serverIsSafe(g, this.sidOf(it))) add(oid, 62);
      } else if (getScript(it.code)?.advanceable) {
        // traps / advanceable assets: bluff up to 2-3 counters when protected
        if (it.advancement < 2 + this.rng.int(2) && this.serverIsSafe(g, this.sidOf(it))) add(oid, 40);
      }
    }

    // --- install an agenda when there's a defended remote ---
    const agendaInHand = handCards.filter(h => h.card.type === 'agenda')
      .sort((a, b) => a.card.advancementCost - b.card.advancementCost)[0];
    if (agendaInHand && scoringSid && this.serverIsSafe(g, scoringSid) &&
        !this.remoteOccupied(g, scoringSid) &&
        c.credits >= this.defenseCost(g, scoringSid) + Math.min(agendaInHand.card.advancementCost, 3)) {
      this.intent = { handId: agendaInHand.id, sid: scoringSid };
      add(`install:${agendaInHand.id}`, 75);
    }
    // traps/assets into remotes (Jinteki bluffs, econ assets) — only if we
    // can plausibly rez them afterwards
    const assetInHand = handCards.find(h => h.card.type === 'asset');
    if (assetInHand && c.credits >= (assetInHand.card.cost ?? 0)) {
      // assets go in their OWN remotes — never clog the scoring server
      add(`install:${assetInHand.id}`, this.isEconAsset(assetInHand.card) ? 52 : 38);
      if (ranked[ranked.length - 1]?.id === `install:${assetInHand.id}`) {
        this.intentAsset = { handId: assetInHand.id, sid: 'new' };
      }
    }
    const upgradeInHand = handCards.find(h => h.card.type === 'upgrade');
    if (upgradeInHand && scoringSid) add(`install:${upgradeInHand.id}`, 30);

    // --- ice up weak servers (but never outbuild the bank: unrezzed ice
    //     we can't afford to rez is cardboard, not defense) ---
    const iceInHand = handCards.filter(h => h.card.type === 'ice')
      .sort((a, b) => (a.card.cost ?? 0) - (b.card.cost ?? 0));
    const unrezzedIce = this.myInstalled(g)
      .filter(id => inst(g, id).zone.startsWith('server-ice:') && !inst(g, id).rezzed).length;
    if (iceInHand.length) {
      const need = this.weakestServer(g);
      if (need) {
        // pick cheapest ice we could plausibly rez soon
        const pick = iceInHand.find(h => (h.card.cost ?? 0) <= c.credits + 4) ?? iceInHand[0];
        this.intentIce = { handId: pick.id, sid: need.sid };
        let score = 45 + need.urgency;
        if (c.credits < 4) score -= 25;          // broke: money first
        if (unrezzedIce >= 3) score -= 20;       // stop stacking dead ice
        add(`install:${pick.id}`, score);
      }
    }

    // --- economy ---
    for (const { id, card } of handCards) {
      if (card.type !== 'operation') continue;
      const gain = ECON_OP_GAIN[card.title] ?? (card.subtypes.includes('Transaction') ? 3 : 0);
      if (gain > 0) add(`play:${id}`, c.credits < 10 ? 58 + gain : 30 + gain);
    }
    for (const o of d.options) {
      if (!o.id.startsWith('cardact:')) continue;
      const it = view.optionInst(g, o.id.split(':').slice(0, 2).join(':'));
      const label = o.label.toLowerCase();
      if (label.includes('gain') && label.includes('credit')) {
        add(o.id, c.credits < 12 ? 56 : 25);
      } else if (label.includes('draw')) {
        add(o.id, c.hand.length <= 2 ? 40 : 10);
      }
    }
    // rez econ assets as a free action (Melange/Adonis/PAD tick on turn start)
    for (const o of d.options) {
      if (!o.id.startsWith('rez:')) continue;
      const it = view.optionInst(g, o.id);
      if (it && this.isEconAsset(it.card) && c.credits - rezCost(g, it.id) >= 2) add(o.id, 60);
    }

    // --- purge when virus pressure builds ---
    const virus = Object.values(g.insts)
      .filter(x => x.zone.startsWith('rig-'))
      .reduce((a, x) => a + (x.counters.virus ?? 0), 0);
    if (virus >= 3) add('purge', 48 + virus * 2);

    // --- baselines ---
    add('draw', c.hand.length <= 2 ? 42 : (c.hand.length <= 4 ? 22 : 6));
    // click for credits with PURPOSE: bank toward an unaffordable econ op,
    // or toward rezzing ice that actually protects something
    let saveTarget = 0;
    for (const { card } of handCards) {
      if (card.type === 'operation' &&
          (ECON_OP_GAIN[card.title] || card.subtypes.includes('Transaction')) &&
          (card.cost ?? 0) > c.credits) saveTarget = Math.max(saveTarget, card.cost);
    }
    for (const iid of this.myInstalled(g)) {
      const it = inst(g, iid);
      if (!it.zone.startsWith('server-ice:') || it.rezzed) continue;
      const sid = this.sidOf(it);
      if ((isCentral(sid) && sid !== 'archives') || this.serverHasStakes(g, sid)) {
        const rc = rezCost(g, iid);
        if (rc > c.credits) saveTarget = Math.max(saveTarget, rc);
      }
    }
    if (saveTarget > 0 && c.credits < saveTarget && this.level.saveDiscipline) add('credit', 54);
    add('credit', c.credits < 6 ? 35 : 12);

    ranked.sort((a, b) => b.score - a.score);
    if (!ranked.length) return this.fallback(g, d);
    const choice = this.maybeBlunder(ranked).id;
    // remember install intent for the follow-up target decision
    if (choice.startsWith('install:')) {
      const hid = Number(choice.split(':')[1]);
      if (this.intent?.handId !== hid) {
        if (this.intentIce?.handId === hid) this.intent = this.intentIce;
        else if (this.intentAsset?.handId === hid) this.intent = this.intentAsset;
        else this.intent = null;
      }
    } else this.intent = null;
    this.intentIce = this.intentAsset = null;
    return choice;
  }

  // ---------- install target ----------
  installTarget(g, d) {
    const wanted = this.intent;
    this.intent = null;
    const pick = sid => d.options.find(o => o.id === `t:${sid}`)?.id;
    if (wanted?.sid && pick(wanted.sid)) return pick(wanted.sid);
    if (wanted?.sid === 'new' && pick('new')) return pick('new');

    // heuristic fallback: parse the card being installed from the prompt
    const m = d.prompt.match(/^Install (.+) where\?$/);
    const title = m?.[1];
    const card = title ? Object.values(g.insts).find(x => x.card.title === title && x.zone === 'corp-hand')?.card : null;
    if (card?.type === 'ice') {
      const need = this.weakestServer(g);
      if (need && pick(need.sid)) return pick(need.sid);
      const first = d.options.find(o => o.id.startsWith('t:') && o.id !== 't:new');
      return (first ?? d.options[0]).id;
    }
    if (card?.type === 'upgrade') return pick('hq') ?? pick('new') ?? d.options[0].id;
    // agenda/asset: safest empty remote, else new
    const sid = this.scoringRemote(g);
    if (sid && !this.remoteOccupied(g, sid) && pick(sid)) return pick(sid);
    return pick('new') ?? d.options.find(o => o.id !== 'cancel')?.id;
  }

  // ---------- run windows ----------
  rezIce(g, d) {
    const s = g.state;
    const sid = s.run?.server;
    const valuable = sid && (isCentral(sid) || this.serverHasStakes(g, sid));
    for (const o of d.options) {
      if (!o.id.startsWith('rez:')) continue;
      const it = view.optionInst(g, o.id);
      if (!it) continue;
      if (it.card.title === 'Archer' && !s.corp.score.length) continue; // engine can't gate this
      const cost = rezCost(g, it.id);
      if (!canPay(g, 'corp', cost)) continue;
      const reserve = valuable ? 0 : this.level.reserve;
      if (s.corp.credits - cost >= reserve) return o.id;
    }
    // run-window abilities (e.g. Nisei MK II counter): fire ETR when it matters
    const ability = d.options.find(o => o.id.startsWith('ability:'));
    if (ability && valuable) return ability.id;
    return 'done';
  }

  rezContent(g, d) {
    // rez upgrades that shape the access (Ash, Red Herrings, Hokusai)
    for (const o of d.options) {
      if (!o.id.startsWith('rez:')) continue;
      const it = view.optionInst(g, o.id);
      if (!it) continue;
      if (it.card.type === 'upgrade' && canPay(g, 'corp', rezCost(g, it.id))) return o.id;
    }
    const ability = d.options.find(o => o.id.startsWith('ability:'));
    if (ability) return ability.id;
    return 'done';
  }

  // ---------- traces: guarantee the trace or fold ----------
  traceBoost(g, d) {
    const r = g.state.runner;
    const runnerLink = r.baseLink + linkBonus(g);
    const m = d.prompt.match(/^Trace (\d+)/);
    const base = m ? Number(m[1]) : 0;
    // to guarantee: trace strength must reach link + runner credits (their max boost)
    const needed = Math.max(0, runnerLink + r.credits + 1 - base);
    if (needed <= d.max && needed <= g.state.corp.credits) return Math.min(needed, d.max);
    if (this.level.key === 'standard') return Math.min(2, d.max); // sometimes bluff
    return 0;
  }

  // ---------- discard ----------
  discard(g, d) {
    // keep agendas & ice & econ; toss situational ops and dead weight
    return this.bestByInst(g, d, it => -this.handValue(g, it)) ?? d.options[0].id;
  }
  handValue(g, it) {
    const c = it.card;
    if (c.type === 'agenda') return 100 + (c.agendaPoints ?? 0);
    if (c.type === 'ice') return 60 - (c.cost ?? 0);
    if (c.type === 'operation') {
      if (ECON_OP_GAIN[c.title] || c.subtypes.includes('Transaction')) return 55;
      return 30;
    }
    if (c.type === 'asset') return this.isEconAsset(c) ? 45 : 35;
    return 25;
  }

  // ---------- card-prompt specifics ----------
  celebrityGift(g, d) {
    // reveal non-agendas only; stop rather than leak agenda positions
    const nonAgenda = this.bestByInst(g, d, it => it.card.type === 'agenda' ? -100 : (50 - (it.card.cost ?? 0)),
      { exclude: it => it.card.type === 'agenda' });
    if (nonAgenda) return nonAgenda;
    return d.options.find(o => ['done', 'stop', 'no'].includes(o.id))?.id ?? null;
  }
  freeRezPick(g, d) {
    // most expensive non-Archer ice (Archer would forfeit the agenda we just scored)
    return this.bestByInst(g, d, it => it.card.cost ?? 0,
      { exclude: it => it.card.title === 'Archer' })
      ?? d.options.find(o => ['no', 'pass', 'done'].includes(o.id))?.id ?? null;
  }
  yagura(g, d) {
    const top = g.state.corp.deck[0];
    if (top != null && cardOf(g, top).type === 'agenda') {
      return d.options.find(o => ['yes', 'bottom', 'move'].includes(o.id))?.id ?? d.options[0].id;
    }
    return d.options.find(o => ['no', 'leave', 'keep'].includes(o.id))?.id ?? null;
  }
  advancementTarget(g, d) {
    // finish agendas first, then fatten traps
    return this.bestByInst(g, d, it => {
      if (it.card.type === 'agenda') return 50 + it.advancement;
      if (getScript(it.code)?.advanceable) return 20 + it.advancement;
      return 0;
    });
  }
  ambushPay(g, d) {
    // fire ambushes when affordable — the runner walked into it
    const yes = d.options.find(o => ['yes', 'pay', 'use'].includes(o.id));
    return yes?.id ?? null;
  }

  // ---------- board evaluation helpers (own info + public info only) ----------
  myInstalled(g) {
    return Object.values(g.insts)
      .filter(x => x.zone.startsWith('server-content:') || x.zone.startsWith('server-ice:'))
      .map(x => x.id);
  }
  sidOf(it) {
    const m = it.zone.match(/^server-(?:ice|content):(.+)$/);
    return m ? m[1] : null;
  }
  remotes(g) { return serverIds(g).filter(sid => !isCentral(sid)); }
  remoteOccupied(g, sid) {
    return g.state.corp.servers[sid].content
      .some(id => ['agenda', 'asset'].includes(cardOf(g, id).type));
  }
  // the dedicated scoring server: best-iced remote NOT hosting an asset
  // (asset remotes are economy real estate, not scoring real estate)
  scoringRemote(g) {
    const rs = this.remotes(g).filter(sid =>
      !g.state.corp.servers[sid].content.some(id => cardOf(g, id).type === 'asset'));
    if (!rs.length) return null;
    return rs.slice().sort((a, b) =>
      g.state.corp.servers[b].ice.length - g.state.corp.servers[a].ice.length)[0];
  }
  serverIsSafe(g, sid) {
    if (!sid) return false;
    const ice = g.state.corp.servers[sid].ice;
    if (!ice.length) return false;
    // safe enough if at least one piece is rezzed or rezzable
    return ice.some(id => inst(g, id).rezzed || canPay(g, 'corp', rezCost(g, id)));
  }
  // credits needed to rez the cheapest still-unrezzed ice on this server
  defenseCost(g, sid) {
    const unrezzed = g.state.corp.servers[sid].ice.filter(id => !inst(g, id).rezzed);
    if (!unrezzed.length) return 0;
    return Math.min(...unrezzed.map(id => rezCost(g, id)));
  }
  serverHasStakes(g, sid) {
    return g.state.corp.servers[sid]?.content
      .some(id => ['agenda', 'asset', 'upgrade'].includes(cardOf(g, id).type));
  }
  weakestServer(g) {
    // urgency-weighted: centrals the runner hits, the scoring remote, bare HQ/R&D
    const runs = g.state.flags.lastRunnerTurn?.successfulRuns ?? [];
    const entries = [];
    for (const sid of serverIds(g)) {
      const sv = g.state.corp.servers[sid];
      const iceN = sv.ice.length;
      let urgency = 0;
      if (sid === 'archives') {
        // archives only needs ice if there are stealable agendas in it
        const hot = sv.content.length || g.state.corp.archives
          .some(id => cardOf(g, id).type === 'agenda');
        urgency = hot && iceN === 0 ? 10 : 0;
      } else if (isCentral(sid)) {
        urgency = Math.max(0, 2 - iceN) * 8 + (runs.includes(sid) ? 12 : 0);
      } else if (sv.content.some(id => ['agenda'].includes(cardOf(g, id).type))) {
        urgency = Math.max(0, 2 - iceN) * 12;         // protect the score!
      } else if (sv.content.length) {
        urgency = iceN === 0 ? 4 : 0;                 // asset remotes: low priority
      } else {
        // empty remote: future scoring server — worth deepening if we hold agendas
        const holdingAgenda = g.state.corp.hand.some(id => cardOf(g, id).type === 'agenda');
        urgency = holdingAgenda && iceN < 2 ? 9 - iceN * 3 : 0;
      }
      if (iceN >= 3) urgency = 0;
      if (urgency > 0) entries.push({ sid, urgency });
    }
    // no scoring-capable remote at all? found one (ice over a new server)
    if (!this.scoringRemote(g) &&
        g.state.corp.hand.some(id => cardOf(g, id).type === 'agenda')) {
      entries.push({ sid: 'new', urgency: 14 });
    }
    if (!entries.length) return null;
    return entries.sort((a, b) => b.urgency - a.urgency)[0];
  }
  isEconAsset(card) {
    return ['PAD Campaign', 'Adonis Campaign', 'Melange Mining Corp.', 'Marilyn Campaign'].includes(card.title);
  }
}
