// Decision protocol: rules generators `yield` decision objects; the Game
// driver pauses until a controller (human UI, AI, tutorial, or test script)
// supplies an answer, then resumes the generator with it.
//
// kinds:
//   'options' -> answer is one option id (string)
//   'number'  -> answer is an int in [min, max]
// Every decision has: player ('corp'|'runner'), kind, prompt, context tag.

export function choice(player, prompt, options, ctx = {}) {
  if (!options.length) throw new Error(`empty options for: ${prompt}`);
  return { kind: 'options', player, prompt, options, ...ctx };
}
export function opt(id, label, data = {}) { return { id, label, ...data }; }

export function number(player, prompt, min, max, ctx = {}) {
  return { kind: 'number', player, prompt, min, max, ...ctx };
}

export function validate(decision, answer) {
  if (decision.kind === 'options') {
    if (!decision.options.some(o => o.id === answer)) {
      throw new Error(`invalid answer "${answer}" for "${decision.prompt}". ` +
        `legal: ${decision.options.map(o => o.id).join(', ')}`);
    }
    return answer;
  }
  if (decision.kind === 'number') {
    const n = Number(answer);
    if (!Number.isInteger(n) || n < decision.min || n > decision.max) {
      throw new Error(`invalid number ${answer} (want ${decision.min}..${decision.max})`);
    }
    return n;
  }
  throw new Error(`unknown decision kind ${decision.kind}`);
}
