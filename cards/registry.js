// Card script registry. Every card with rules text gets a script keyed by
// its NRDB code. Engine consults scripts at defined hook points.
//
// Script shape (all fields optional):
//   onPlay*(g, {instId})        events & operations: the card's effect
//   canPlay(g)                  extra playability predicate
//   subroutines: [{label, resolve*(g, runCtx)}]   ice
//   breaker: {                  icebreakers
//     types: ['barrier'|'code-gate'|'sentry'|'all'],
//     boost:  {cost, amount},   pay cost => +amount strength (this encounter)
//     breakCost: {cost, count}, pay cost => break `count` subroutine(s)
//   }
//   advanceable: true           non-agenda cards that can be advanced (Ice Wall)
//   onRez*/onScore*/onSteal*/onAccess*/onTurnStart* ...  (Phase 3 hooks)
//
// * = generator function (may yield decisions)
//
// COVERAGE: docs/CARD_COVERAGE.md tracks which of the 132 cards are scripted.
const scripts = {};

export function define(code, script) {
  if (scripts[code]) throw new Error(`duplicate script for ${code}`);
  scripts[code] = script;
}
export function getScript(code) { return scripts[code] ?? null; }
export function scriptedCodes() { return Object.keys(scripts); }
