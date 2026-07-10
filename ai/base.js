// Shared AI plumbing: decision routing, generic fallbacks, difficulty knobs.
//
// An AI is an object with .side and .decide(game, decision) -> answer.
// decide() must ALWAYS return a legal answer and never throw: specific
// handlers first, then prompt-matched card handlers, then a generic fallback.
// Determinism: AIs use their own seeded rng (never g.rng — consuming the
// game's rng stream would change shuffles/HQ picks and break replays).
import { createRng } from '../engine/rng.js';
import { optionInst } from './view.js';

export const LEVELS = {
  // standard: blunders sometimes, spends freely, face-checks carelessly
  standard: { key: 'standard', noise: 0.25, reserve: 1, saveDiscipline: false, riskAware: false },
  // hard: no blunders, banks credits with a plan, respects facecheck risk
  hard:     { key: 'hard',     noise: 0,    reserve: 3, saveDiscipline: true,  riskAware: true },
};

export class BaseAI {
  // opts: {level: 'standard'|'hard', seed}
  constructor(side, opts = {}) {
    this.side = side;
    this.level = LEVELS[opts.level ?? 'standard'] ?? LEVELS.standard;
    this.rng = createRng(opts.seed ?? 1);
    this.intent = null;   // cross-decision plan (e.g. install target)
    this.handlers = [];   // [{match(g, d) -> bool, fn(g, d) -> answer}]
    this.cardPrompts = []; // [[regex, fn(g, d, match) -> answer|null]]
  }

  decide(game, d) {
    const g = game.g;
    try {
      for (const h of this.handlers) {
        if (h.match(g, d)) {
          const a = h.fn(g, d);
          if (a !== null && a !== undefined && this.isLegal(d, a)) return a;
        }
      }
      for (const [re, fn] of this.cardPrompts) {
        const m = d.prompt.match(re);
        if (m) {
          const a = fn(g, d, m);
          if (a !== null && a !== undefined && this.isLegal(d, a)) return a;
        }
      }
    } catch (e) {
      // fall through to the generic answer; never crash the game
      (game.aiErrors ??= []).push({ prompt: d.prompt, error: e.message });
    }
    return this.fallback(g, d);
  }

  isLegal(d, a) {
    if (d.kind === 'options') return d.options.some(o => o.id === a);
    const n = Number(a);
    return Number.isInteger(n) && n >= d.min && n <= d.max;
  }

  // generic fallback: safe, prompt-agnostic
  fallback(g, d) {
    if (d.kind === 'number') return d.min;
    // prefer explicit "affirmative" ids, avoid cancel-ish ids
    const ids = d.options.map(o => o.id);
    for (const pref of ['yes', 'use', 'pay', 'keep', 'ok']) {
      if (ids.includes(pref)) return pref;
    }
    const passive = new Set(['cancel', 'no', 'stop', 'done', 'pass', 'leave', 'jack-out', 'mulligan']);
    const active = d.options.find(o => !passive.has(o.id));
    return (active ?? d.options[0]).id;
  }

  // pick the option whose referenced card instance maximizes score(inst);
  // options without an inst are skipped. Returns null if none match.
  bestByInst(g, d, score, { exclude = () => false } = {}) {
    let best = null, bestScore = -Infinity;
    for (const o of d.options) {
      const it = optionInst(g, o.id);
      if (!it || exclude(it, o)) continue;
      const sc = score(it, o);
      if (sc > bestScore) { best = o.id; bestScore = sc; }
    }
    return best;
  }

  // deterministic difficulty noise: occasionally take the 2nd-best action
  maybeBlunder(ranked) {
    if (ranked.length > 1 && this.level.noise > 0 && this.rng.next() < this.level.noise) {
      return ranked[1];
    }
    return ranked[0];
  }
}
