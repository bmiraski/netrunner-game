// Run state machine per FFG Rules Reference v1.1 timing structure.
// Ice arrays: index 0 = innermost; new ice installs outermost (push).
//
// doRun(g, sid, mods) — mods let run events shape the run:
//   accessBonus            extra accesses (The Maker's Eye)
//   insteadOnSuccess*      optional replacement for breaching (Indexing etc.)
//   bypassFirstEncounter   Inside Job
//   hostedCredits          Stimhack (spendable during run, via pay())
//   onEnd*                 run event cleanup (Stimhack core damage)
//   accessAbilities        [{label, req(g,ctx), effect*(g,ctx)}] (Demolition Run)
import { inst, cardOf, isCentral } from './state.js';
import { choice, opt } from './decisions.js';
import { emit, pay, canPay, stealAgendaFx, trash, rezCost, rezFx } from './effects.js';
import { getScript } from '../cards/registry.js';
import { collect, modSum, installedRunner } from './hooks.js';

export function iceStrength(g, iceId) {
  const it = inst(g, iceId);
  const own = getScript(it.code)?.strengthBonus?.(g, it) ?? 0;
  const ext = modSum(g, 'iceStrengthMod', it); // Ice Carver (encounter-aware)
  return (it.card.strength ?? 0) + own + ext;
}
export function breakerStrength(g, bId) {
  const it = inst(g, bId);
  let n = (it.card.strength ?? 0) + it.encounterStr + it.runStr;
  n += modSum(g, 'breakerStrengthMod', it);   // The Personal Touch, Dinosaurus
  return n;
}
function breakerMatches(g, bId, ice) {
  const script = getScript(inst(g, bId).code);
  const t = script.breaker.types;
  if (t.includes('all')) {
    // AI breakers blocked by Swordsman-style effects
    if (getScript(ice.code)?.blocksAI) return false;
    return true;
  }
  const iceSubtypes = effectiveIceSubtypes(g, ice);
  return iceSubtypes.some(s => t.includes(s));
}
export function effectiveIceSubtypes(g, ice) {
  const base = ice.card.subtypes.map(s => s.toLowerCase().replace(/ /g, '-'));
  const extra = g.state.flags.turn.tinkered?.[ice.id] ?? []; // Tinkering
  return [...base, ...extra];
}
export function activeSubs(g, ice) {
  const script = getScript(ice.code);
  const subs = script?.subroutines ?? [];
  const idx = script?.activeSubIndices?.(g, ice) ?? subs.map((_, i) => i); // Hive
  return idx.map(i => ({ ...subs[i], index: i }));
}

export function* doRun(g, sid, mods = {}) {
  const s = g.state;
  let server = s.corp.servers[sid];
  s.run = {
    server: sid, successful: false, ended: false, cannotJackOut: false,
    bpCredits: s.corp.badPublicity, hostedCredits: mods.hostedCredits ?? 0,
    icePassed: 0, encounters: 0, accessBonus: mods.accessBonus ?? 0,
    accessLimit: null, restrictAccessTo: null, extraStealCosts: [],
    mods,
  };
  emit(g, 'run-start', { server: sid, bpCredits: s.run.bpCredits });
  (s.flags.turn.runsMade ??= []).push(sid);

  let approaches = 0;
  for (let pos = server.ice.length - 1; pos >= 0 && !s.winner; pos--) {
    const iceId = server.ice[pos];
    const ice = inst(g, iceId);
    emit(g, 'approach-ice', { server: sid, position: pos, iceId, rezzed: ice.rezzed, title: ice.rezzed ? ice.card.title : null });

    // 2.1 jack out (not on first approach; Whirlpool can forbid)
    if (approaches > 0 && !s.run.cannotJackOut) {
      const jo = yield choice('runner', 'Jack out or continue the run?',
        [opt('continue', 'Continue the run'), opt('jack-out', 'Jack out')], { runStep: 'jack-out' });
      if (jo === 'jack-out') {
        s.run.ended = true;
        emit(g, 'jack-out', { server: sid });
        break;
      }
    }
    approaches++;

    // 2.2 corp window: rez approached ice / use run-window abilities
    yield* corpRunWindow(g, sid, iceId);
    if (s.run.ended || s.winner) break;

    // 2.3 / 3 encounter if rezzed, else pass
    if (ice.rezzed) {
      let bypass = false;
      if (mods.bypassFirstEncounter && s.run.encounters === 0) bypass = true;
      if (!bypass) bypass = yield* offerBypassAbilities(g, iceId);
      s.run.encounters++;
      if (bypass) {
        emit(g, 'ice-bypassed', { iceId, title: ice.card.title });
      } else {
        yield* encounterIce(g, iceId);
        ice.encounterStr = 0; ice.brokenSubs = [];
        if (s.run.ended || s.winner) break;
      }
    }
    s.run.icePassed++;
    emit(g, 'ice-passed', { iceId, rezzed: ice.rezzed });
    // ice may have left play (Himitsu-Bako); re-sync position
    pos = Math.min(pos, server.ice.length);
  }

  // 4. approach server
  if (!s.run.ended && !s.winner) {
    emit(g, 'approach-server', { server: sid });
    yield* corpRunWindow(g, sid, null);
    if (!s.run.ended && !s.winner) {
      // Sneakdoor Beta: redirect on success
      if (mods.changeServerOnSuccess) {
        emit(g, 'server-changed', { from: sid, to: mods.changeServerOnSuccess });
        sid = mods.changeServerOnSuccess;
        s.run.server = sid;
      }
      s.run.successful = true;
      (s.flags.turn.successfulRuns ??= []).push(sid);
      emit(g, 'run-successful', { server: sid });
      for (const h of collect(g, 'onRunSuccessful')) {
        yield* h.fn(g, { server: sid, instId: h.id });
        if (s.winner) break;
      }
      // upgrades in the attacked server ("whenever successful run on this server")
      for (const cid of [...s.corp.servers[sid].content]) {
        const script = getScript(inst(g, cid).code);
        if (script?.onRunSuccessfulHere && inst(g, cid).rezzed) {
          yield* script.onRunSuccessfulHere(g, { server: sid, instId: cid });
          if (s.winner) break;
        }
      }
      if (!s.winner) {
        // replacement effects instead of breaching (Bank Job, Indexing, ...)
        let replaced = false;
        if (mods.insteadOnSuccess) {
          const c = yield choice('runner', 'Breach the server, or use the replacement effect?',
            [opt('instead', mods.insteadLabel ?? 'Use replacement effect'), opt('breach', 'Breach (access cards)')],
            { runStep: 'instead' });
          if (c === 'instead') { replaced = true; yield* mods.insteadOnSuccess(g, { server: sid }); }
        }
        if (!replaced) {
          const hooks = collect(g, 'insteadOfBreach') // Bank Job (installed cards)
            .filter(h => h.script.insteadOfBreach.appliesTo(g, sid));
          let done = false;
          for (const h of hooks) {
            const c = yield choice('runner', `Use ${h.it.card.title} instead of breaching?`,
              [opt('yes', h.script.insteadOfBreach.label), opt('no', 'Breach normally')], { runStep: 'instead' });
            if (c === 'yes') { yield* h.script.insteadOfBreach.effect(g, { server: sid, instId: h.id }); done = true; break; }
          }
          if (!done) yield* accessServer(g, sid);
        }
      }
    }
  }

  const wasSuccessful = s.run.successful;
  for (const bId of installedRunner(g)) inst(g, bId).runStr = 0; // run-duration boosts expire
  if (mods.onEnd) yield* mods.onEnd(g, { successful: wasSuccessful });
  for (const h of collect(g, 'onRunEnd')) {
    yield* h.fn(g, { server: sid, successful: wasSuccessful, instId: h.id });
    if (s.winner) break;
  }
  const followUps = s.run.followUp ?? [];
  s.run = null;
  emit(g, 'run-end', { server: sid, successful: wasSuccessful });
  // Doppelgänger-style chained runs
  for (const next of followUps) {
    if (!s.winner) yield* doRun(g, next.server, next.mods ?? {});
  }
  return wasSuccessful;
}

// Corp window during a run: rez ice/content + scripted run-window abilities
// (Nisei MK II counter, Himitsu-Bako). approachedIceId=null at server approach.
function* corpRunWindow(g, sid, approachedIceId) {
  const s = g.state;
  while (!s.winner && !s.run.ended) {
    const options = [];
    if (approachedIceId != null) {
      const ice = inst(g, approachedIceId);
      if (!ice.rezzed && canPay(g, 'corp', rezCost(g, approachedIceId))) {
        options.push(opt(`rez:${approachedIceId}`, `Rez ${ice.card.title} (${rezCost(g, approachedIceId)}cr)`, { hidden: true }));
      }
    } else {
      for (const id of s.corp.servers[sid].content) {
        const it = inst(g, id);
        if (!it.rezzed && it.card.type !== 'agenda' && canPay(g, 'corp', rezCost(g, id))) {
          options.push(opt(`rez:${id}`, `Rez ${it.card.title} (${rezCost(g, id)}cr)`));
        }
      }
    }
    for (const h of collect(g, 'runWindowAbility')) {
      if (h.it.card.side !== 'corp') continue;
      const a = h.script.runWindowAbility;
      if (a.req(g, h.it)) options.push(opt(`ability:${h.id}`, a.label(g, h.it)));
    }
    if (!options.length) return;
    const pick = yield choice('corp', approachedIceId != null ? 'Approach window: rez or act?' : 'Server approach: rez or act?',
      [...options, opt('done', 'Continue')], { runStep: approachedIceId != null ? 'rez-ice' : 'rez-content' });
    if (pick === 'done') return;
    const [verb, idStr] = pick.split(':');
    const id = Number(idStr);
    if (verb === 'rez') yield* rezFx(g, id);
    else yield* getScript(inst(g, id).code).runWindowAbility.effect(g, { instId: id });
  }
}

function* offerBypassAbilities(g, iceId) {
  for (const h of collect(g, 'bypassAbility')) {  // Femme Fatale
    const b = h.script.bypassAbility;
    if (!b.req(g, h.it, iceId)) continue;
    const cost = b.cost(g, iceId);
    if (!canPay(g, 'runner', cost, 'icebreaker')) continue;
    const c = yield choice('runner', `${h.it.card.title}: bypass ${inst(g, iceId).card.title} for ${cost}cr?`,
      [opt('bypass', `Bypass (${cost}cr)`), opt('no', 'Encounter it')], { runStep: 'bypass' });
    if (c === 'bypass') { pay(g, 'runner', cost, 'bypass', 'icebreaker'); return true; }
  }
  return false;
}

function* encounterIce(g, iceId) {
  const s = g.state;
  const ice = inst(g, iceId);
  const script = getScript(ice.code);
  s.run.encounterIce = iceId;
  emit(g, 'encounter-ice', { iceId, code: ice.code, title: ice.card.title, strength: iceStrength(g, iceId), subs: activeSubs(g, ice).map(x => x.label) });

  if (script?.onEncounter) {           // Tollbooth, Data Raven, Pop-up Window
    yield* script.onEncounter(g, { iceId });
    if (s.run.ended || s.winner) { s.run.encounterIce = null; return; }
  }

  // 3.1 breaker window
  while (!s.winner) {
    const subs = activeSubs(g, ice);
    const options = [opt('continue', 'Continue (let unbroken subroutines fire)')];
    for (const bId of installedRunner(g)) {
      const b = inst(g, bId);
      const bs = getScript(b.code)?.breaker;
      if (!bs || b.card.type !== 'program') continue;
      if (!breakerMatches(g, bId, ice)) continue;
      if (bs.boost && canPay(g, 'runner', bs.boost.cost, 'icebreaker')) {
        options.push(opt(`boost:${bId}`, `${b.card.title}: +${bs.boost.amount} strength (${bs.boost.cost}cr) [now ${breakerStrength(g, bId)} vs ${iceStrength(g, iceId)}]`));
      }
      if (bs.breakCost && canPay(g, 'runner', bs.breakCost.cost, 'icebreaker') &&
          breakerStrength(g, bId) >= iceStrength(g, iceId)) {
        const unbroken = subs.filter(x => !ice.brokenSubs.includes(x.index));
        if (unbroken.length) {
          const n = bs.breakCost.count === 'all' ? unbroken.length : Math.min(bs.breakCost.count, unbroken.length);
          options.push(opt(`break:${bId}`, `${b.card.title}: break ${n === 1 ? `"${unbroken[0].label}"` : `up to ${n} subroutines`} (${bs.breakCost.cost}cr)`));
        }
      }
    }
    if (script?.clickBreak && s.runner.clicks > 0) {   // bioroid ice
      const unbroken = activeSubs(g, ice).filter(x => !ice.brokenSubs.includes(x.index));
      if (unbroken.length) options.push(opt('clickbreak', `Spend [click] to break "${unbroken[0].label}"`));
    }
    if (options.length === 1 && activeSubs(g, ice).length === 0) break;
    const pick = yield choice('runner', `Encountering ${ice.card.title} (str ${iceStrength(g, iceId)})`, options, { runStep: 'encounter', iceId });
    if (pick === 'continue') break;
    if (pick === 'clickbreak') {
      s.runner.clicks--;
      const target = activeSubs(g, ice).find(x => !ice.brokenSubs.includes(x.index));
      ice.brokenSubs.push(target.index);
      emit(g, 'sub-broken', { iceId, sub: target.label, via: 'click' });
      continue;
    }
    const [verb, bIdStr] = pick.split(':');
    const bId = Number(bIdStr);
    const bs = getScript(inst(g, bId).code).breaker;
    if (verb === 'boost') {
      pay(g, 'runner', bs.boost.cost, 'boost breaker', 'icebreaker');
      if (bs.boost.duration === 'run') inst(g, bId).runStr += bs.boost.amount;
      else inst(g, bId).encounterStr += bs.boost.amount;
      emit(g, 'breaker-boosted', { breakerId: bId, strength: breakerStrength(g, bId) });
    } else {
      pay(g, 'runner', bs.breakCost.cost, 'break subroutine', 'icebreaker');
      inst(g, bId).usedThisEncounter = true;
      let remaining = bs.breakCost.count === 'all' ? Infinity : bs.breakCost.count;
      while (remaining > 0) {
        const unbroken = activeSubs(g, ice).filter(x => !ice.brokenSubs.includes(x.index));
        if (!unbroken.length) break;
        let target = unbroken[0];
        if (unbroken.length > 1 && remaining !== Infinity) {
          const which = yield choice('runner', 'Break which subroutine?',
            [...unbroken.map(x => opt(`sub:${x.index}`, x.label)), opt('stop', 'Done breaking')], { runStep: 'pick-sub' });
          if (which === 'stop') break;
          target = unbroken.find(x => x.index === Number(which.split(':')[1]));
        }
        ice.brokenSubs.push(target.index);
        emit(g, 'sub-broken', { iceId, sub: target.label });
        remaining--;
      }
    }
  }

  // 3.2 unbroken subroutines in printed order
  for (const sub of activeSubs(g, ice)) {
    if (ice.brokenSubs.includes(sub.index) || s.run.ended || s.winner) continue;
    emit(g, 'subroutine-fires', { iceId, sub: sub.label });
    yield* sub.resolve(g, { iceId });
  }

  // encounter cleanup: temp strength + used-breaker triggers (Faerie, Crypsis)
  for (const bId of [...installedRunner(g)]) {
    const b = inst(g, bId);
    b.encounterStr = 0;
    if (b.usedThisEncounter) {
      b.usedThisEncounter = false;
      const script2 = getScript(b.code);
      if (script2?.onEncounterEndIfUsed) yield* script2.onEncounterEndIfUsed(g, { instId: bId });
    }
  }
  s.run.encounterIce = null;
}

export function* accessServer(g, sid) {
  const s = g.state;
  let ids = [];
  if (sid === 'hq') {
    const bonus = s.run ? s.run.accessBonus + modSum(g, 'hqAccessMod') : 0;
    const pool = [...s.corp.hand];
    for (let i = 0; i < Math.min(1 + bonus, pool.length); i++) {
      const id = g.rng.pick(pool);
      pool.splice(pool.indexOf(id), 1);
      ids.push(id);
    }
  } else if (sid === 'rd') {
    const bonus = s.run ? s.run.accessBonus + modSum(g, 'rdAccessMod') : 0;
    ids = s.corp.deck.slice(0, 1 + bonus);
  } else if (sid === 'archives') {
    ids = [...s.corp.archives];
    for (const id of ids) inst(g, id).faceup = true;
  } else {
    ids = [...s.corp.servers[sid].content];
  }
  if (s.run?.restrictAccessTo != null) ids = ids.filter(id => id === s.run.restrictAccessTo); // Ash
  if (s.run?.accessLimit != null) ids = ids.slice(0, s.run.accessLimit);                     // Hudson
  emit(g, 'access-count', { server: sid, n: ids.length });

  for (const id of ids) {
    if (s.winner || (s.run && s.run.endAccess)) return;
    yield* accessCard(g, id, sid);
  }
}

export function* accessCard(g, id, sid) {
  const s = g.state;
  const it = inst(g, id);
  emit(g, 'card-accessed', { server: sid, id, code: it.code, title: it.card.title, type: it.card.type });
  const script = getScript(it.code);
  if (script?.onAccess) {
    yield* script.onAccess(g, { instId: id, server: sid });
    if (s.winner) return;
    if (it.zone.startsWith('corp-') && it.zone !== 'corp-hand' && sid !== 'archives' && sid !== 'rd' && sid !== 'hq') return;
  }
  // runner access abilities (Imp, Demolition Run)
  for (const h of collect(g, 'accessAbility')) {
    const a = h.script.accessAbility;
    if (!a.req(g, h.it, { accessedId: id })) continue;
    const c = yield choice('runner', `Accessed ${it.card.title}. Use ${h.it.card.title}?`,
      [opt('use', a.label), opt('no', 'Continue')], { runStep: 'access-ability' });
    if (c === 'use') { yield* a.effect(g, { instId: h.id, accessedId: id }); return; }
  }
  for (const a of (s.run?.mods.accessAbilities ?? [])) {  // from run events
    if (!a.req(g, { accessedId: id })) continue;
    const c = yield choice('runner', `Accessed ${it.card.title}. ${a.label}?`,
      [opt('use', a.label), opt('no', 'Continue')], { runStep: 'access-ability' });
    if (c === 'use') { yield* a.effect(g, { accessedId: id }); return; }
  }
  if (it.card.type === 'agenda' && it.zone !== 'runner-score' && it.zone !== 'corp-score') {
    yield* stealDecision(g, id, sid);
  } else if (it.card.trashCost != null && !it.zone.startsWith('corp-archives')) {
    if (canPay(g, 'runner', it.card.trashCost, 'trash')) {
      const t = yield choice('runner', `Accessed ${it.card.title}. Trash for ${it.card.trashCost}cr?`,
        [opt('trash', `Trash (${it.card.trashCost}cr)`), opt('leave', 'Leave it')], { runStep: 'access-trash' });
      if (t === 'trash') {
        pay(g, 'runner', it.card.trashCost, `trash ${it.card.title}`, 'trash');
        trash(g, id, 'accessed');
      }
    }
  }
}

function* stealDecision(g, id, sid) {
  const s = g.state;
  const it = inst(g, id);
  // additional steal costs (Strongbox click, Red Herrings 5cr; persistent)
  const costs = [];
  const inServer = sid && s.corp.servers[sid] ? s.corp.servers[sid].content : [];
  for (const uid of inServer) {
    const u = inst(g, uid);
    const sc = getScript(u.code)?.stealCost;
    if (sc && u.rezzed) costs.push(sc);
  }
  costs.push(...(s.run?.extraStealCosts ?? []));           // persistent after trash
  const clickCost = costs.reduce((a, c) => a + (c.clicks ?? 0), 0);
  const credCost = costs.reduce((a, c) => a + (c.credits ?? 0), 0);
  if (!clickCost && !credCost) { yield* stealAgendaFx(g, id); return; }
  const affordable = s.runner.clicks >= clickCost && canPay(g, 'runner', credCost);
  if (!affordable) { emit(g, 'steal-unaffordable', { id, title: it.card.title }); return; }
  const c = yield choice('runner',
    `Steal ${it.card.title}? Additional cost: ${clickCost ? clickCost + ' click ' : ''}${credCost ? credCost + 'cr' : ''}`,
    [opt('steal', 'Pay and steal'), opt('no', 'Do not steal')], { runStep: 'steal-cost' });
  if (c === 'steal') {
    s.runner.clicks -= clickCost;
    if (credCost) pay(g, 'runner', credCost, 'steal cost');
    yield* stealAgendaFx(g, id);
  }
}
