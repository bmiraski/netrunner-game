// Contextual hints (Phase 6 "practice" support): ask the hard-level RunnerAI
// what it would do with the pending decision, and phrase it as a suggestion.
// Always legal by construction (the AI only returns legal answers).
import { RunnerAI } from '../ai/runner.js';

const advisor = new RunnerAI({ level: 'hard', seed: 99 });

export function hintFor(game) {
  const d = game.decision;
  if (!d || d.player !== 'runner') return null;
  const answer = advisor.decide(game, d);
  if (d.kind === 'number') {
    return { answer, text: `Suggestion: choose ${answer}.` };
  }
  const opt = d.options.find(o => o.id === answer);
  return { answer, text: `Suggestion: ${opt ? opt.label : answer}.` };
}
