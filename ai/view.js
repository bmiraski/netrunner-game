// Imperfect-information view helpers for the AIs (Phase 4).
//
// The engine state is fully visible in memory; the AIs keep to the honor
// system by ONLY reading state through these helpers, which expose exactly
// what a player could legally observe. Anything not exposed here (opponent
// hand contents, R&D order, facedown/unrezzed card identities) must not be
// read by AI heuristic code.
import { inst, cardOf, serverIds, isCentral } from '../engine/state.js';
import { getScript } from '../cards/registry.js';
import { iceStrength, breakerStrength, activeSubs, effectiveIceSubtypes } from '../engine/run.js';

// ---- public facts (both sides) ----
export function publicSide(g, p) {
  const s = g.state[p];
  return {
    credits: s.credits, clicks: s.clicks, agendaPoints: s.agendaPoints,
    handCount: s.hand.length, deckCount: s.deck.length,
    tags: g.state.runner.tags, badPublicity: g.state.corp.badPublicity,
  };
}

// instance ids of ice protecting a server (index 0 = innermost)
export function serverIce(g, sid) { return g.state.corp.servers[sid].ice; }
export function serverContent(g, sid) { return g.state.corp.servers[sid].content; }
export function allServerIds(g) { return serverIds(g); }
export { isCentral };

// what the RUNNER knows about a piece of corp ice
export function runnerSeesIce(g, iceId) {
  const it = inst(g, iceId);
  if (!it.rezzed) return { id: iceId, rezzed: false, advancement: it.advancement };
  return {
    id: iceId, rezzed: true, code: it.code, title: it.card.title,
    subtypes: effectiveIceSubtypes(g, it),
    strength: iceStrength(g, iceId),
    subs: activeSubs(g, it).map(x => x.label),
    clickBreak: !!getScript(it.code)?.clickBreak,
  };
}

// what the RUNNER knows about a card in a remote/upgrade slot
export function runnerSeesContent(g, id) {
  const it = inst(g, id);
  if (!it.rezzed && !it.faceup) {
    return { id, faceup: false, advancement: it.advancement, installedTurn: it.installedTurn };
  }
  return { id, faceup: true, code: it.code, title: it.card.title, type: it.card.type, advancement: it.advancement };
}

// runner's own rig (all faceup — corp may see this too)
export function rig(g) {
  const r = g.state.runner.rig;
  return { program: [...r.program], hardware: [...r.hardware], resource: [...r.resource] };
}

// installed runner icebreakers with live stats (public — rig is faceup)
export function breakers(g) {
  const out = [];
  for (const id of g.state.runner.rig.program) {
    const b = getScript(inst(g, id).code)?.breaker;
    if (!b) continue;
    out.push({
      id, title: cardOf(g, id).title, types: b.types,
      strength: breakerStrength(g, id),
      boost: b.boost ?? null, breakCost: b.breakCost ?? null,
    });
  }
  return out;
}

// cheapest credit cost for the runner to fully break `iceId` with the current
// rig, or null if no installed breaker can engage it. Public information when
// the ice is rezzed (both sides may call this on rezzed ice).
export function costToBreak(g, iceId) {
  const it = inst(g, iceId);
  if (!it.rezzed) return null;
  const str = iceStrength(g, iceId);
  const subs = activeSubs(g, it);
  if (!subs.length) return { cost: 0, breakerId: null };
  let best = null;
  for (const b of breakers(g)) {
    if (!matches(g, b, it)) continue;
    let boostCost = 0;
    if (b.strength < str) {
      if (!b.boost) continue;
      const boosts = Math.ceil((str - b.strength) / b.boost.amount);
      boostCost = boosts * b.boost.cost;
    }
    if (!b.breakCost) continue;
    const uses = b.breakCost.count === 'all' ? 1 : Math.ceil(subs.length / b.breakCost.count);
    const cost = boostCost + uses * b.breakCost.cost;
    if (!best || cost < best.cost) best = { cost, breakerId: b.id };
  }
  return best;
}

function matches(g, b, ice) {
  if (b.types.includes('all')) return !getScript(ice.code)?.blocksAI;
  return effectiveIceSubtypes(g, ice).some(s => b.types.includes(s));
}

// classify a rezzed piece of ice's unbroken threat from subroutine labels
// (string heuristics over printed sub text — legal: text is public once rezzed)
export function subThreat(label) {
  const l = label.toLowerCase();
  if (l.includes('flatline') || l.includes('brain') || l.includes('core damage')) return 'kill';
  if (l.includes('damage')) return 'damage';
  if (l.includes('trash') && (l.includes('program') || l.includes('hardware') || l.includes('installed'))) return 'trash';
  if (l.includes('tag')) return 'tag';
  if (l.includes('end the run')) return 'etr';
  if (l.includes('trace')) return 'trace';
  return 'other';
}
export const THREAT_WEIGHT = { kill: 40, damage: 8, trash: 10, tag: 4, trace: 3, etr: 2, other: 1 };

export function iceDanger(g, iceId) {
  const v = runnerSeesIce(g, iceId);
  if (!v.rezzed) return null;
  return v.subs.reduce((a, s) => a + (THREAT_WEIGHT[subThreat(s)] ?? 1), 0);
}

// option-id helpers: many engine prompts use ids like 'score:12', 't:remote1',
// bare inst ids ('17'), or 'd:17'. Extract an instance if one is referenced.
export function optionInst(g, optId) {
  const m = String(optId).match(/(\d+)$/);
  if (!m) return null;
  return g.insts[Number(m[1])] ?? null;
}
