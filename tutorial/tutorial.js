// TutorialController (Phase 6): wraps a fixed-seed Game + Corp AI and walks
// the GUIDED_STEPS script. The UI stays a decision renderer — this class only
// says which option is allowed and which callout to show. Engine/ai untouched.
import { Game } from '../engine/game.js';
import { CorpAI } from '../ai/corp.js';
import { AIController } from '../ai/controller.js';
import { gameConfig } from '../ai/decks.js';
import {
  GUIDED_STEPS, EVENT_CALLOUTS,
  TUTORIAL_SEED, TUTORIAL_CORP_DECK, TUTORIAL_RUNNER_DECK,
} from './steps.js';

export class TutorialController {
  constructor(cardsJson) {
    this.game = new Game(cardsJson,
      gameConfig(TUTORIAL_CORP_DECK, TUTORIAL_RUNNER_DECK, TUTORIAL_SEED));
    this.ctl = new AIController(this.game, {
      corp: new CorpAI({ level: 'standard', seed: TUTORIAL_SEED * 7 + 1 }),
    });
    this.stepIndex = 0;
    this.mismatch = null;        // set if the script diverges from the game
    this.shownEvents = new Set();
    this.logMark = 0;
  }

  get guided() { return !this.mismatch && this.stepIndex < GUIDED_STEPS.length; }
  get done() { return !this.guided; }

  // current guided step, validated against the live decision. On mismatch the
  // tutorial degrades gracefully to free play (and records why, for tests).
  currentStep() {
    if (!this.guided) return null;
    const d = this.game.decision;
    if (!d || d.player !== 'runner') return null;
    const step = GUIDED_STEPS[this.stepIndex];
    const m = step.match ?? {};
    if ((m.ctx && !(m.ctx in d)) ||
        (m.promptIncludes && !d.prompt.includes(m.promptIncludes))) {
      this.mismatch = `step ${this.stepIndex}: decision "${d.prompt}" does not match ${JSON.stringify(m)}`;
      return null;
    }
    return step;
  }

  // the single permitted option id for the current guided step (null = all)
  allowedOptionId() {
    const step = this.currentStep();
    if (!step || !step.allow) return null;
    const d = this.game.decision;
    let opt = null;
    if (step.allow.id) opt = d.options.find(o => o.id === step.allow.id);
    else if (step.allow.labelIncludes) opt = d.options.find(o => o.label.includes(step.allow.labelIncludes));
    if (!opt) {
      this.mismatch = `step ${this.stepIndex}: no option ${JSON.stringify(step.allow)} in "${d.prompt}"`;
      return null;
    }
    return opt.id;
  }

  // callout for the pending decision: {title, text, step:'3/12'} or null
  callout() {
    const step = this.currentStep();
    if (!step) return null;
    return { title: step.title, text: step.text, step: `${this.stepIndex + 1}/${GUIDED_STEPS.length}` };
  }

  // call after every game.choose() answered by the runner seat
  onAnswered() {
    if (this.guided) this.stepIndex++;
  }

  // one-time event callouts from new log entries -> [{title, text}]
  drainEventCallouts() {
    const out = [];
    const evs = this.game.log;
    for (; this.logMark < evs.length; this.logMark++) {
      const type = evs[this.logMark].type;
      const c = EVENT_CALLOUTS[type];
      if (c && !this.shownEvents.has(type)) {
        this.shownEvents.add(type);
        out.push(c);
      }
    }
    return out;
  }
}
