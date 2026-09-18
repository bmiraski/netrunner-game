// Game state model. Pure data + small helpers; no rules logic here.
//
// Zones (inst.zone):
//   corp:  'corp-deck' (R&D), 'corp-hand' (HQ), 'corp-archives',
//          'corp-score', 'server-ice:<sid>', 'server-content:<sid>'
//   runner:'runner-deck' (Stack), 'runner-hand' (Grip), 'runner-discard' (Heap),
//          'runner-score', 'rig-program', 'rig-hardware', 'rig-resource'
//   both:  'identity', 'removed'
// Server ids: 'hq', 'rd', 'archives', 'remote1', 'remote2', ...
import { createRng } from './rng.js';
import { createLog } from './events.js';
import { getScript } from '../cards/registry.js';

export function createState(db, cfg) {
  const rng = createRng(cfg.seed ?? Date.now() % 2 ** 31);
  const log = createLog();
  const insts = {}; // id -> instance
  let nextId = 1;

  function makeInst(code, zone) {
    const card = db.card(code);
    const inst = {
      id: nextId++, code, card, zone,
      rezzed: false, faceup: false,
      advancement: 0, counters: {}, // e.g. {virus: 2, credit: 3, agenda: 1, recurring: 2}
      encounterStr: 0,     // temp strength mod, cleared after encounter
      runStr: 0,           // temp strength mod, cleared at run end ("remainder of this run")
      brokenSubs: [],      // sub indexes broken this encounter
      usedThisEncounter: false,
      hostId: null,        // hosting (Dinosaurus, The Personal Touch)
      installedTurn: null,
      pendingReturnToStack: false, // Test Run: checked once at the owner's next
                                    // end-of-turn (engine/game.js#endOfTurn);
                                    // a generic one-shot delayed-trigger marker,
                                    // not tied to any specific card's script.
    };
    insts[inst.id] = inst;
    return inst;
  }

  function buildSide(spec, side) {
    const idCard = db.card(spec.identity);
    if (idCard.type !== 'identity' || idCard.side !== side) {
      throw new Error(`bad identity for ${side}: ${spec.identity}`);
    }
    const identity = makeInst(spec.identity, 'identity');
    identity.rezzed = true; identity.faceup = true;
    const deck = [];
    for (const { code, qty } of spec.cards) {
      const c = db.card(code);
      if (c.side !== side) throw new Error(`${c.title} is not a ${side} card`);
      for (let i = 0; i < qty; i++) deck.push(makeInst(code, `${side}-deck`).id);
    }
    rng.shuffle(deck);
    return { identity, deck };
  }

  const corpSide = buildSide(cfg.corp, 'corp');
  const runnerSide = buildSide(cfg.runner, 'runner');

  const state = {
    seed: rng.seed,
    turn: 0,                 // increments each corp turn (turn = round)
    activePlayer: null,      // 'corp' | 'runner'
    phase: 'setup',
    winner: null, winReason: null,
    run: null,               // active run object (see run.js)
    flags: {
      turn: {},              // reset at every turn start (both players' turns):
                             // iceRezzed, gabrielHQ, runsMade:[], successfulRuns:[],
                             // stolen:[], oncePerTurn:{code:true}
      lastRunnerTurn: {},    // snapshot of flags.turn at end of runner turn:
                             // {ranServers:[], successfulRuns:[], stolenPoints}
    },
    corp: {
      identity: corpSide.identity.id,
      deck: corpSide.deck, hand: [], archives: [], score: [],
      credits: 5, clicks: 0, agendaPoints: 0,
      badPublicity: 0, baseHandSize: 5,
      servers: {
        hq: { ice: [], content: [] },
        rd: { ice: [], content: [] },
        archives: { ice: [], content: [] },
      },
      remoteCounter: 0,
    },
    runner: {
      identity: runnerSide.identity.id,
      deck: runnerSide.deck, hand: [], discard: [], score: [],
      credits: 5, clicks: 0, agendaPoints: 0,
      tags: 0, brainDamage: 0, baseHandSize: 5, baseMemory: 4,
      baseLink: db.card(cfg.runner.identity).baseLink ?? 0,
      rig: { program: [], hardware: [], resource: [] },
      // Cards hosted-but-not-installed (Personal Workshop): distinct from
      // `rig` because they don't count as installed (no MU cost, no
      // uniqueness/install triggers) until their power counters hit 0 and
      // they move into the rig via a normal runnerInstall() call.
      hosted: [],
    },
  };

  return { db, rng, log, insts, state, makeInst };
}

// ---- helpers (g = the context object returned by createState) ----

export const inst = (g, id) => g.insts[id];
export const cardOf = (g, id) => g.insts[id].card;

export function zoneList(g, zone) {
  // returns the ARRAY holding ids for a zone (so callers can splice)
  const { state } = g;
  const m = {
    'corp-deck': state.corp.deck, 'corp-hand': state.corp.hand,
    'corp-archives': state.corp.archives, 'corp-score': state.corp.score,
    'runner-deck': state.runner.deck, 'runner-hand': state.runner.hand,
    'runner-discard': state.runner.discard, 'runner-score': state.runner.score,
    'rig-program': state.runner.rig.program,
    'rig-hardware': state.runner.rig.hardware,
    'rig-resource': state.runner.rig.resource,
    'runner-hosted': state.runner.hosted,
  };
  if (m[zone]) return m[zone];
  const sm = zone.match(/^server-(ice|content):(.+)$/);
  if (sm) {
    const server = state.corp.servers[sm[2]];
    if (!server) throw new Error(`no server ${sm[2]}`);
    return sm[1] === 'ice' ? server.ice : server.content;
  }
  throw new Error(`unknown zone ${zone}`);
}

export function moveCard(g, id, toZone, opts = {}) {
  const it = inst(g, id);
  if (it.zone !== 'identity' && it.zone !== 'removed') {
    const from = zoneList(g, it.zone);
    const i = from.indexOf(id);
    if (i >= 0) from.splice(i, 1);
  }
  it.zone = toZone;
  if (toZone !== 'removed') {
    const to = zoneList(g, toZone);
    if (opts.position === 'top') to.unshift(id); // index 0 = top of deck
    else to.push(id);
  }
  // leaving play resets in-play state
  if (opts.uninstall !== false && /^(corp|runner)-/.test(toZone)) {
    it.rezzed = false; it.advancement = 0; it.counters = {};
    it.encounterStr = 0; it.runStr = 0; it.brokenSubs = []; it.hostId = null;
    it.pendingReturnToStack = false;
  }
  return it;
}

// A script's memoryCostOverride(g) => number lets a card's effective MU
// cost depend on live game state (ZU.13 Key Master / Creeper: 0 MU — even
// while still in the grip — with 2+ link) instead of the flat printed
// `card.memoryCost`. Takes `g` only (no instance): must work identically
// before and after install, per the printed "even if it is not installed."
export function memoryCostOf(g, card) {
  const script = getScript(card.code);
  return script?.memoryCostOverride ? script.memoryCostOverride(g) : (card.memoryCost ?? 0);
}
export function memoryUsed(g) {
  return g.state.runner.rig.program.reduce((s, id) => {
    const it = inst(g, id);
    if (it.hostId != null) {
      const hostScript = getScript(inst(g, it.hostId).code);
      if (hostScript?.hostedMemoryFree) return s; // Dinosaurus
    }
    return s + memoryCostOf(g, it.card);
  }, 0);
}
export function memoryLimit(g) {
  let n = g.state.runner.baseMemory;
  const idScript = getScript(cardOf(g, g.state.runner.identity).code);
  if (idScript?.memoryMod) n += idScript.memoryMod;         // Chaos Theory
  for (const id of g.state.runner.rig.hardware) {
    const s = getScript(cardOf(g, id).code);
    if (s?.memoryMod) n += s.memoryMod;                     // Dyson, consoles
  }
  return n;
}
export function handSize(g, player) {
  return Math.max(0, handSizeRaw(g, player));
}
// Unclamped max hand size (can go negative from brain damage) — used to detect
// the "maximum hand size below zero at end of turn" flatline condition.
export function handSizeRaw(g, player) {
  const p = g.state[player];
  let n = p.baseHandSize - (player === 'runner' ? p.brainDamage : 0);
  const idScript = getScript(cardOf(g, p.identity).code);
  if (idScript?.handSizeMod) n += idScript.handSizeMod;      // NBN: The World is Yours
  const ids = player === 'runner'
    ? [...p.rig.program, ...p.rig.hardware, ...p.rig.resource]
    : serverIds(g).flatMap(sid => [...g.state.corp.servers[sid].ice, ...g.state.corp.servers[sid].content]);
  for (const id of ids) {
    const it = inst(g, id);
    if (player === 'corp' && !it.rezzed) continue;
    const s = getScript(it.card.code);
    if (s?.handSizeMod) n += s.handSizeMod;                  // Public Sympathy
  }
  return n;
}
export function newRemote(g) {
  const sid = `remote${++g.state.corp.remoteCounter}`;
  g.state.corp.servers[sid] = { ice: [], content: [] };
  return sid;
}
export function serverIds(g) { return Object.keys(g.state.corp.servers); }
export function isCentral(sid) { return sid === 'hq' || sid === 'rd' || sid === 'archives'; }
