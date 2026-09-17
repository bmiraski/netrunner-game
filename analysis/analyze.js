// Post-game feedback (BUILD_PLAN Phase 7). Rule-based analysis of the event
// log — deterministic heuristics, never AI-generated prose (locked decision,
// PROJECT_NOTES.md). Reads game.log + the final game.state/g read-only;
// analysis/ never mutates the game.
//
// analyzeGame(game) -> report (see bottom of file for shape). `game` is the
// live Game instance (engine/game.js): .log (flat event array), .state,
// .g (context: insts, db). Every log event carries {turn, player} stamped by
// effects.js's emit() wrapper — `turn` is the round number (increments once
// per corp turn and covers that corp turn + the runner turn that follows),
// `player` is whose turn-phase it happened in. Grouping by `turn` is what
// makes the "turn-annotated review" possible without re-simulating the game.
//
// Every finding is a template filled from log data — no free text, no LLM
// calls, so results are exactly reproducible from a given seed + answer
// history (same determinism contract as the engine itself).

const other = side => (side === 'corp' ? 'runner' : 'corp');
const CAP = s => s === 'corp' ? 'Corp' : 'Runner';

// ---- clicks: how many clicks each side spent just clicking for a credit ----
// (the cheapest, least informative click use — a proxy for "grindy" turns
// with nothing better to do, PROJECT_NOTES "floated clicks").
function analyzeClicks(log) {
  const bySide = {
    corp: { creditClicks: 0, turns: {} },
    runner: { creditClicks: 0, turns: {} },
  };
  for (const ev of log) {
    if (ev.type !== 'credits-gained' || ev.data.why !== 'click') continue;
    const side = ev.data.who;
    const b = bySide[side];
    if (!b) continue;
    b.creditClicks++;
    b.turns[ev.turn] = (b.turns[ev.turn] ?? 0) + 1;
  }
  // "grind turn": most of that side's clicks for the turn spent on credits
  // alone (corp gets 3 clicks/turn, runner 4 — click-add/remove effects are
  // rare enough that a fixed threshold below the base is a safe, simple cut).
  const THRESH = { corp: 3, runner: 4 };
  const grindTurns = { corp: [], runner: [] };
  for (const side of ['corp', 'runner']) {
    for (const [turn, n] of Object.entries(bySide[side].turns)) {
      if (n >= THRESH[side]) grindTurns[side].push(Number(turn));
    }
  }
  return {
    corp: { creditClicks: bySide.corp.creditClicks, grindTurns: grindTurns.corp },
    runner: { creditClicks: bySide.runner.creditClicks, grindTurns: grindTurns.runner },
  };
}

// ---- economy: total credits gained/spent per side over the game ----
function analyzeEconomy(log, state) {
  const out = {
    corp: { gained: 0, spent: 0, final: state.corp.credits },
    runner: { gained: 0, spent: 0, final: state.runner.credits },
  };
  for (const ev of log) {
    if (ev.type === 'credits-gained' && out[ev.data.who]) out[ev.data.who].gained += ev.data.n;
    if (ev.type === 'credits-spent' && out[ev.data.who]) out[ev.data.who].spent += ev.data.n;
  }
  return out;
}

// ---- runs: cost (runner credits spent during the run) vs value (accesses /
// agenda points) for every run in the game, in order ----
function analyzeRuns(log) {
  const runs = [];
  let cur = null;
  for (const ev of log) {
    const d = ev.data;
    if (ev.type === 'run-start') {
      cur = { turn: ev.turn, server: d.server, cost: 0, accesses: 0, agendaPoints: 0, successful: null };
    } else if (!cur) {
      continue;
    } else if (ev.type === 'credits-spent' && d.who === 'runner') {
      cur.cost += d.n;
    } else if (ev.type === 'card-accessed') {
      cur.accesses++;
    } else if (ev.type === 'agenda-stolen') {
      cur.agendaPoints += d.points;
    } else if (ev.type === 'run-end') {
      cur.successful = d.successful;
      runs.push(cur);
      cur = null;
    }
  }
  return runs;
}

// ---- scoring timeline: every agenda swing in order, with running totals ----
function analyzeScoring(log) {
  const timeline = [];
  for (const ev of log) {
    if (ev.type === 'agenda-scored') {
      timeline.push({ turn: ev.turn, side: 'corp', title: ev.data.title, points: ev.data.points, total: ev.data.total });
    } else if (ev.type === 'agenda-stolen') {
      timeline.push({ turn: ev.turn, side: 'runner', title: ev.data.title, points: ev.data.points, total: ev.data.total });
    }
  }
  return timeline;
}

// ---- damage: every damage burst + whether the game ended in a flatline ----
function analyzeDamage(log) {
  const events = [];
  for (const ev of log) {
    if (ev.type === 'damage') events.push({ turn: ev.turn, type: ev.data.type, n: ev.data.n, why: ev.data.why });
  }
  const over = log.filter(e => e.type === 'game-over').pop();
  return { events, flatline: over?.data.reason === 'flatline' };
}

// ---- endgame snapshot: what each side had left when the game ended ----
function analyzeEndgame(state) {
  return {
    corp: { credits: state.corp.credits, handSize: state.corp.hand.length, agendaPoints: state.corp.agendaPoints, badPublicity: state.corp.badPublicity },
    runner: { credits: state.runner.credits, handSize: state.runner.hand.length, agendaPoints: state.runner.agendaPoints, tags: state.runner.tags, brainDamage: state.runner.brainDamage },
  };
}

// ---- findings: the headline turn-annotated callouts, built from the
// sections above rather than re-scanning the log ----
function buildFindings({ winner, clicks, economy, runs, damage, endgame }) {
  const findings = [];
  const add = (severity, turn, side, text) => findings.push({ severity, turn, side, text });

  for (const side of ['corp', 'runner']) {
    for (const turn of clicks[side].grindTurns) {
      add('info', turn, side, `${CAP(side)} spent the whole turn ${turn} clicking for credits — no plays, installs, or runs.`);
    }
  }

  for (const run of runs) {
    if (run.successful === false && run.cost >= 3) {
      add('bad', run.turn, 'runner', `Spent ${run.cost}cr running ${run.server} on turn ${run.turn} and didn't get through.`);
    } else if (run.successful === true && run.agendaPoints >= 2 && run.cost <= 1) {
      add('good', run.turn, 'runner', `Cheap steal: ${run.agendaPoints} agenda points off ${run.server} on turn ${run.turn} for only ${run.cost}cr.`);
    }
  }

  if (winner) {
    const loser = other(winner);
    const snap = endgame[loser];
    if (loser === 'corp' && snap.credits >= 6) {
      add('info', null, 'corp', `Corp ended the game with ${snap.credits}cr still banked and unspent.`);
    }
    if (loser === 'runner' && snap.credits >= 6) {
      add('info', null, 'runner', `Runner ended the game with ${snap.credits}cr still banked and unspent.`);
    }
    if (loser === 'runner' && snap.handSize >= 3) {
      add('info', null, 'runner', `Runner was holding ${snap.handSize} cards in the grip at game end.`);
    }
  }

  if (damage.flatline) {
    add('bad', null, 'runner', 'The game ended in a flatline: damage exceeded the Runner’s grip.');
  }

  return findings.sort((a, b) => (a.turn ?? Infinity) - (b.turn ?? Infinity));
}

export function analyzeGame(game) {
  const log = game.log;
  const state = game.state;
  const clicks = analyzeClicks(log);
  const economy = analyzeEconomy(log, state);
  const runs = analyzeRuns(log);
  const scoring = analyzeScoring(log);
  const damage = analyzeDamage(log);
  const endgame = analyzeEndgame(state);
  const winner = state.winner ?? null;
  const findings = buildFindings({ winner, clicks, economy, runs, damage, endgame });

  return {
    winner,
    reason: state.winReason ?? null,
    turns: state.turn,
    clicks,
    economy,
    runs,
    scoring,
    damage,
    endgame,
    findings,
  };
}

// report shape:
// {
//   winner: 'corp'|'runner'|null, reason: string|null, turns: number,
//   clicks:   { corp:{creditClicks,grindTurns:[turn]}, runner:{...} },
//   economy:  { corp:{gained,spent,final}, runner:{...} },
//   runs:     [ {turn,server,cost,accesses,agendaPoints,successful} ... ],
//   scoring:  [ {turn,side,title,points,total} ... ]  (chronological swings),
//   damage:   { events:[{turn,type,n,why}], flatline:boolean },
//   endgame:  { corp:{credits,handSize,agendaPoints,badPublicity},
//               runner:{credits,handSize,agendaPoints,tags,brainDamage} },
//   findings: [ {severity:'good'|'bad'|'info', turn:number|null, side, text} ]
//             sorted by turn (turn-agnostic findings sort last)
// }
