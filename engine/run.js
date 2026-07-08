// Run state machine per FFG Rules Reference v1.1 timing structure.
// Ice arrays: index 0 = innermost; new ice installs outermost (push).
import { inst, cardOf, isCentral } from './state.js';
import { choice, opt } from './decisions.js';
import { emit, pay, canPay, stealAgenda, trash, win } from './effects.js';
import { getScript } from '../cards/registry.js';

export function iceStrength(g, iceId) {
  const it = inst(g, iceId);
  const extra = getScript(it.code)?.strengthBonus?.(g, it) ?? 0;
  return (it.card.strength ?? 0) + extra;
}
export function breakerStrength(g, bId) {
  const it = inst(g, bId);
  return (it.card.strength ?? 0) + it.encounterStr;
}
function breakerMatches(script, ice) {
  const t = script.breaker.types;
  return t.includes('all') ||
    ice.card.subtypes.some(s => t.includes(s.toLowerCase().replace(' ', '-')));
}

export function* doRun(g, sid) {
  const s = g.state;
  const server = s.corp.servers[sid];
  s.run = {
    server: sid, successful: false, ended: false,
    bpCredits: s.corp.badPublicity, icePassed: 0,
  };
  emit(g, 'run-start', { server: sid, bpCredits: s.run.bpCredits });

  let approaches = 0;
  for (let pos = server.ice.length - 1; pos >= 0 && !s.winner; pos--) {
    const iceId = server.ice[pos];
    const ice = inst(g, iceId);
    emit(g, 'approach-ice', { server: sid, position: pos, iceId, rezzed: ice.rezzed, title: ice.rezzed ? ice.card.title : null });

    // 2.1 jack out (not on first approach of the run)
    if (approaches > 0) {
      const jo = yield choice('runner', 'Jack out or continue the run?',
        [opt('continue', 'Continue the run'), opt('jack-out', 'Jack out')], { runStep: 'jack-out' });
      if (jo === 'jack-out') {
        s.run.ended = true;
        emit(g, 'jack-out', { server: sid });
        break;
      }
    }
    approaches++;

    // 2.2 corp may rez the approached ice
    if (!ice.rezzed && canPay(g, 'corp', ice.card.cost ?? 0)) {
      const rz = yield choice('corp', `Rez ${ice.card.title} (${ice.card.cost}cr) protecting ${sid}?`,
        [opt('rez', `Rez (${ice.card.cost}cr)`), opt('no', 'Leave unrezzed')],
        { runStep: 'rez-ice', iceId, hidden: ice.card.title }); // AI: title is hidden info for runner only
      if (rz === 'rez') {
        pay(g, 'corp', ice.card.cost ?? 0, `rez ${ice.card.title}`);
        ice.rezzed = true; ice.faceup = true;
        emit(g, 'ice-rezzed', { iceId, code: ice.code, title: ice.card.title });
      }
    }

    // 2.3 / 3 encounter if rezzed, else pass
    if (ice.rezzed) {
      yield* encounterIce(g, iceId);
      ice.encounterStr = 0; ice.brokenSubs = [];
      if (s.run.ended || s.winner) break;
    }
    s.run.icePassed++;
    emit(g, 'ice-passed', { iceId, rezzed: ice.rezzed });
  }

  // 4. approach server
  if (!s.run.ended && !s.winner) {
    emit(g, 'approach-server', { server: sid });
    yield* corpRezWindow(g, sid);
    s.run.successful = true;
    emit(g, 'run-successful', { server: sid });
    // Phase 3 hook: on-successful-run abilities (Gabriel, Datasucker, ...)
    yield* accessServer(g, sid);
  }

  const wasSuccessful = s.run.successful;
  s.run = null;
  emit(g, 'run-end', { server: sid, successful: wasSuccessful });
  return wasSuccessful;
}

function* encounterIce(g, iceId) {
  const s = g.state;
  const ice = inst(g, iceId);
  const script = getScript(ice.code);
  const subs = script?.subroutines ?? [];
  emit(g, 'encounter-ice', { iceId, code: ice.code, title: ice.card.title, strength: iceStrength(g, iceId), subs: subs.map(x => x.label) });

  // 3.1 breaker window: boost strength / break subroutines
  while (!s.winner) {
    const options = [opt('continue', 'Continue (let unbroken subroutines fire)')];
    for (const bId of s.runner.rig.program) {
      const b = inst(g, bId);
      const bs = getScript(b.code)?.breaker;
      if (!bs || !breakerMatches(getScript(b.code), ice)) continue;
      if (bs.boost && canPay(g, 'runner', bs.boost.cost)) {
        options.push(opt(`boost:${bId}`, `${b.card.title}: +${bs.boost.amount} strength (${bs.boost.cost}cr) [now ${breakerStrength(g, bId)}]`));
      }
      if (bs.breakCost && canPay(g, 'runner', bs.breakCost.cost) &&
          breakerStrength(g, bId) >= iceStrength(g, iceId)) {
        subs.forEach((sub, i) => {
          if (!ice.brokenSubs.includes(i)) {
            options.push(opt(`break:${bId}:${i}`, `${b.card.title}: break "${sub.label}" (${bs.breakCost.cost}cr)`));
          }
        });
      }
    }
    if (options.length === 1 && subs.length === 0) break; // nothing to do, no subs
    const pick = yield choice('runner', `Encountering ${ice.card.title} (str ${iceStrength(g, iceId)})`, options, { runStep: 'encounter', iceId });
    if (pick === 'continue') break;
    const [verb, bIdStr, subIdxStr] = pick.split(':');
    const bId = Number(bIdStr);
    const bs = getScript(inst(g, bId).code).breaker;
    if (verb === 'boost') {
      pay(g, 'runner', bs.boost.cost, 'boost breaker');
      inst(g, bId).encounterStr += bs.boost.amount;
      emit(g, 'breaker-boosted', { breakerId: bId, strength: breakerStrength(g, bId) });
    } else {
      pay(g, 'runner', bs.breakCost.cost, 'break subroutine');
      ice.brokenSubs.push(Number(subIdxStr));
      emit(g, 'sub-broken', { iceId, sub: subs[Number(subIdxStr)].label });
    }
  }
  // reset breaker temp strength after encounter
  for (const bId of s.runner.rig.program) inst(g, bId).encounterStr = 0;

  // 3.2 unbroken subroutines resolve in printed order
  for (let i = 0; i < subs.length; i++) {
    if (ice.brokenSubs.includes(i) || s.run.ended || s.winner) continue;
    emit(g, 'subroutine-fires', { iceId, sub: subs[i].label });
    yield* subs[i].resolve(g, { iceId });
  }
}

function* corpRezWindow(g, sid) {
  // 4.2: corp may rez non-ice cards in/protecting the attacked server
  const server = g.state.corp.servers[sid];
  while (!g.state.winner) {
    const rezzable = server.content.filter(id => {
      const it = inst(g, id);
      return !it.rezzed && it.card.type !== 'agenda' && canPay(g, 'corp', it.card.cost ?? 0);
    });
    if (!rezzable.length) return;
    const pick = yield choice('corp', `Rez cards in ${sid} before access?`,
      [...rezzable.map(id => opt(`rez:${id}`, `Rez ${cardOf(g, id).title} (${cardOf(g, id).cost}cr)`)), opt('done', 'No (continue to access)')],
      { runStep: 'rez-content' });
    if (pick === 'done') return;
    const id = Number(pick.split(':')[1]);
    const it = inst(g, id);
    pay(g, 'corp', it.card.cost ?? 0, `rez ${it.card.title}`);
    it.rezzed = true; it.faceup = true;
    emit(g, 'card-rezzed', { id, code: it.code, title: it.card.title });
  }
}

export function* accessServer(g, sid) {
  const s = g.state;
  const bonus = s.accessBonus[sid] ?? 0; // Phase 3: HQ Interface etc.
  let ids = [];
  if (sid === 'hq') {
    const pool = [...s.corp.hand];
    for (let i = 0; i < Math.min(1 + bonus, pool.length); i++) {
      const id = g.rng.pick(pool);
      pool.splice(pool.indexOf(id), 1);
      ids.push(id);
    }
  } else if (sid === 'rd') {
    ids = s.corp.deck.slice(0, 1 + bonus); // top of R&D, in order
  } else if (sid === 'archives') {
    ids = [...s.corp.archives];
    for (const id of ids) inst(g, id).faceup = true;
  } else {
    ids = [...s.corp.servers[sid].content]; // plus upgrades; all content
  }
  emit(g, 'access-count', { server: sid, n: ids.length });

  for (const id of ids) {
    if (s.winner) return;
    const it = inst(g, id);
    emit(g, 'card-accessed', { server: sid, id, code: it.code, title: it.card.title, type: it.card.type });
    const script = getScript(it.code);
    if (script?.onAccess) yield* script.onAccess(g, { instId: id, server: sid });
    if (s.winner) return;
    if (it.card.type === 'agenda' && it.zone !== 'runner-score') {
      stealAgenda(g, id);
    } else if (it.card.trashCost != null && it.zone !== 'corp-archives') {
      if (canPay(g, 'runner', it.card.trashCost)) {
        const t = yield choice('runner', `Accessed ${it.card.title}. Trash for ${it.card.trashCost}cr?`,
          [opt('trash', `Trash (${it.card.trashCost}cr)`), opt('leave', 'Leave it')], { runStep: 'access-trash' });
        if (t === 'trash') {
          pay(g, 'runner', it.card.trashCost, `trash ${it.card.title}`);
          trash(g, id, 'accessed');
        }
      }
    }
  }
}
