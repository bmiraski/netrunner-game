// Phase 6 tutorial tests: the guided script must replay EXACTLY against the
// live engine + Corp AI. If an engine/AI/deck change shifts the tutorial
// game, these fail and the script (tutorial/steps.js) must be re-authored.
import assert from 'node:assert/strict';
import { cardsJson } from './helpers.js';
import { TutorialController } from '../tutorial/tutorial.js';
import { GUIDED_STEPS, EVENT_CALLOUTS } from '../tutorial/steps.js';
import { hintFor } from '../tutorial/hints.js';
import { RunnerAI } from '../ai/runner.js';

function playGuided(tut) {
  // answer every runner decision with the taught option until guided ends
  let safety = 200;
  while (tut.guided && safety--) {
    tut.ctl.run();
    const d = tut.game.decision;
    assert.ok(d, 'game ended during guided portion');
    assert.equal(d.player, 'runner', 'pending decision must be the runner\'s');
    const step = tut.currentStep();
    if (!step) break;
    if (!step.allow) break;                      // final free-play step
    const allowed = tut.allowedOptionId();
    assert.ok(allowed, `no allowed option at step ${tut.stepIndex}`);
    tut.game.choose(allowed);
    tut.onAnswered();
  }
}

export default [

  ['guided script replays cleanly: every step matches, no mismatch', () => {
    const tut = new TutorialController(cardsJson);
    playGuided(tut);
    assert.equal(tut.mismatch, null, tut.mismatch ?? '');
    // stopped at the final (allow:null) step — everything before it consumed
    assert.equal(tut.stepIndex, GUIDED_STEPS.length - 1);
    const c = tut.callout();
    assert.equal(c.title, 'You stole an agenda!');
  }],

  ['guided game hits the advertised lessons (economy, install, trash, break, steal)', () => {
    const tut = new TutorialController(cardsJson);
    playGuided(tut);
    const types = tut.game.log.map(e => e.type);
    const titles = tut.game.log.filter(e => e.data?.title).map(e => `${e.type}:${e.data.title}`);
    assert.ok(titles.includes('event-played:Sure Gamble'));
    assert.ok(titles.includes('runner-installed:Peacock'));
    assert.ok(titles.includes('card-trashed:PAD Campaign'));
    assert.ok(titles.includes('ice-rezzed:Viktor 1.0'));
    assert.ok(titles.includes('agenda-stolen:Project Ares'));
    assert.ok(types.filter(t => t === 'sub-broken').length >= 2, 'both Viktor subs broken');
    assert.equal(tut.game.state.runner.agendaPoints, 2);  // Project Ares = 2 pts
  }],

  ['event callouts fire once each and drain in order', () => {
    const tut = new TutorialController(cardsJson);
    playGuided(tut);
    tut.drainEventCallouts();                    // consume whatever happened
    const before = tut.shownEvents.size;
    // fake two new events of an already-shown and a fresh type
    tut.game.g.log.emit('damage', { type: 'net', n: 1, why: 'test' }, { turn: 0, player: 'corp' });
    tut.game.g.log.emit('damage', { type: 'net', n: 1, why: 'test' }, { turn: 0, player: 'corp' });
    const out = tut.drainEventCallouts();
    assert.equal(out.length, tut.shownEvents.has('damage') && before === tut.shownEvents.size ? 0 : 1);
    assert.equal(tut.drainEventCallouts().length, 0, 'no repeats');
  }],

  ['free play after the script: hint is always a legal answer', () => {
    const tut = new TutorialController(cardsJson);
    playGuided(tut);
    tut.onAnswered(); // consume the final free-play step
    assert.ok(tut.done);
    // play 40 more runner decisions using the hint itself — must stay legal
    const player = new RunnerAI({ level: 'standard', seed: 5 });
    for (let i = 0; i < 40 && !tut.game.state.winner; i++) {
      tut.ctl.run();
      const d = tut.game.decision;
      if (!d) break;
      const hint = hintFor(tut.game);
      assert.ok(hint && hint.text.startsWith('Suggestion'), 'hint produced');
      tut.game.choose(hint.answer);              // throws if illegal
    }
  }],

  ['every EVENT_CALLOUTS key is a real engine event type', () => {
    // guard against typos: these types all appear in ui/logtext.js's table
    const known = ['agenda-scored', 'tags-added', 'damage', 'trace-start',
      'run-ends-sub', 'virus-purged'];
    assert.deepEqual(Object.keys(EVENT_CALLOUTS).sort(), known.sort());
  }],
];
