// Pilot card scripts (Phase 2): one of each hook type to prove the design.
// Phase 3 replaces this with full per-faction wave files.
// NOTE: Battering Ram is simplified (breaks 1 sub per payment instead of
// "up to 2") — fix in Phase 3; tracked in CARD_COVERAGE.md.
import { define } from './registry.js';
import * as fx from '../engine/effects.js';

let registered = false;
export function registerPilots(db) {
  if (registered) return; registered = true;
  const code = t => db.titled(t).code;
  const etr = {
    label: 'End the run',
    *resolve(g) { g.state.run.ended = true; fx.emit(g, 'run-ends-sub', {}); },
  };

  // --- economy ---
  define(code('Sure Gamble'), { *onPlay(g) { fx.gainCredits(g, 'runner', 9, 'Sure Gamble'); } });
  define(code('Easy Mark'), { *onPlay(g) { fx.gainCredits(g, 'runner', 3, 'Easy Mark'); } });
  define(code('Hedge Fund'), { *onPlay(g) { fx.gainCredits(g, 'corp', 9, 'Hedge Fund'); } });
  define(code('Beanstalk Royalties'), { *onPlay(g) { fx.gainCredits(g, 'corp', 3, 'Beanstalk Royalties'); } });

  // --- ice ---
  define(code('Wall of Static'), { subroutines: [etr] });
  define(code('Enigma'), {
    subroutines: [
      { label: 'The Runner loses [click], if able', *resolve(g) {
          if (g.state.runner.clicks > 0) g.state.runner.clicks--;
          fx.emit(g, 'click-lost', { who: 'runner' });
      } },
      etr,
    ],
  });
  define(code('Ice Wall'), {
    advanceable: true,
    strengthBonus: (g, it) => it.advancement, // +1 str per advancement
    subroutines: [etr],
  });
  define(code('Hunter'), {
    subroutines: [
      { label: 'Trace 3 - give the Runner 1 tag', *resolve(g) {
          if (yield* fx.trace(g, 3, 'Hunter')) fx.addTags(g, 1, 'Hunter');
      } },
    ],
  });

  // --- icebreakers ---
  define(code('Gordian Blade'), {
    breaker: { types: ['code-gate'], boost: { cost: 1, amount: 1 }, breakCost: { cost: 1, count: 1 } },
  });
  define(code('Battering Ram'), {
    breaker: { types: ['barrier'], boost: { cost: 1, amount: 1 }, breakCost: { cost: 1, count: 1 } },
  });
  define(code('Mimic'), {
    breaker: { types: ['sentry'], breakCost: { cost: 1, count: 1 } }, // no boost
  });
}
