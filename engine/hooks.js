// Hook collection + credit pools. Card scripts hang effects on named hooks;
// these utilities find every live hook of a given name in trigger order.
import { inst, cardOf, serverIds } from './state.js';
import { getScript } from '../cards/registry.js';

// All installed runner card ids (programs, hardware, resources) + hosted cards
export function installedRunner(g) {
  const r = g.state.runner.rig;
  return [...r.program, ...r.hardware, ...r.resource];
}
// All installed corp ids (ice + content, any rez state)
export function installedCorp(g) {
  const out = [];
  for (const sid of serverIds(g)) {
    out.push(...g.state.corp.servers[sid].ice, ...g.state.corp.servers[sid].content);
  }
  return out;
}

// Every source that can carry an active hook, in a stable order:
// corp identity, corp installed (rezzed only unless includeUnrezzed),
// corp scored agendas, runner identity, runner installed.
export function hookSources(g, { includeUnrezzed = false } = {}) {
  const out = [];
  const push = (id, active) => {
    const it = inst(g, id);
    const script = getScript(it.code);
    if (script && active) out.push({ id, it, script });
  };
  push(g.state.corp.identity, true);
  for (const id of installedCorp(g)) push(id, includeUnrezzed || inst(g, id).rezzed);
  for (const id of g.state.corp.score) push(id, true);
  push(g.state.runner.identity, true);
  for (const id of installedRunner(g)) push(id, true);
  return out;
}

// collect(g, 'onRunSuccessful') -> [{id, it, script, fn}]
export function collect(g, hookName, opts) {
  return hookSources(g, opts)
    .filter(s => s.script[hookName])
    .map(s => ({ ...s, fn: s.script[hookName] }));
}

// Sum numeric modifier hooks: modSum(g, 'rezCostMod', target) etc.
export function modSum(g, hookName, ...args) {
  let n = 0;
  for (const s of hookSources(g)) {
    if (s.script[hookName]) n += s.script[hookName](g, s.it, ...args) || 0;
  }
  return n;
}

// ---- credit pools (recurring credits, bad publicity) ----
// script.recurring = {n, purposes: ['icebreaker','trace','trash','virus-install',
//   'hq-run','remove-tag']}  — counters.recurring refilled at owner's turn start.
// Pools auto-spend before real credits (documented simplification).
export function poolsFor(g, player, purpose) {
  // purpose may be a single string or an array of acceptable purposes (a
  // payment can qualify for more than one kind at once — e.g. advancing ice
  // in Simone Diego's server is both 'advance-ice' AND 'advance-here').
  const wanted = Array.isArray(purpose) ? purpose : [purpose];
  const pools = [];
  for (const s of hookSources(g)) {
    if (!s.script.recurring) continue;
    if (s.it.card.side !== player) continue;
    const r = s.script.recurring;
    const purposes = typeof r.purposes === 'function' ? r.purposes(g, s.it) : r.purposes;
    // 'hq-run' is a CONTEXT purpose, not a payment-type purpose like
    // 'icebreaker'/'trace'/'trash': it matches ANY payment (any purpose, or
    // none) made while the in-progress run is on HQ, mirroring how
    // hostedCredits/bpCredits apply "regardless of purpose" during any run
    // (see pay() below). Pheromones (20031) is the only card using it —
    // "Use these credits during runs on HQ" isn't restricted to a payment
    // TYPE, just to WHEN it's spent.
    const hqRunMatch = purposes.includes('hq-run') && g.state.run?.server === 'hq';
    // 'advance-here' is likewise a CONTEXT purpose (Simone Diego: "advance
    // cards in the root of or protecting THIS server"): matches when the
    // advance target (g.state.flags.advanceTargetServer, set by the
    // 'advance' action) is the same server this upgrade is installed in.
    const advanceHereMatch = purposes.includes('advance-here')
      && g.state.flags.turn.advanceTargetServer != null
      && s.it.zone === `server-content:${g.state.flags.turn.advanceTargetServer}`;
    // restricted pools only apply when the payment declares a matching purpose
    if (!hqRunMatch && !advanceHereMatch && !wanted.some(p => purposes.includes(p))) continue;
    if ((s.it.counters.recurring ?? 0) > 0) pools.push(s.it);
  }
  return pools;
}
export function poolTotal(g, player, purpose) {
  let n = poolsFor(g, player, purpose).reduce((a, it) => a + it.counters.recurring, 0);
  if (player === 'runner' && g.state.run) n += g.state.run.bpCredits + (g.state.run.hostedCredits ?? 0);
  return n;
}
// once-per-turn ability gate: returns false if already used this turn
export function oncePerTurn(g, key) {
  const used = (g.state.flags.turn.oncePerTurn ??= {});
  if (used[key]) return false;
  used[key] = true;
  return true;
}

export function refillRecurring(g, player) {
  for (const s of hookSources(g)) {
    if (s.script.recurring && s.it.card.side === player) {
      const r = s.script.recurring;
      s.it.counters.recurring = typeof r.n === 'function' ? r.n(g, s.it) : r.n;
    }
  }
}
