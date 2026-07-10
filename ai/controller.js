// Binds AI players to a Game. Either seat may be an AI; a human seat simply
// leaves decisions pending for the UI. Also provides autoplay for AI-vs-AI
// games (soak tests, balance checks).
import { Game } from '../engine/game.js';
import { CorpAI } from './corp.js';
import { RunnerAI } from './runner.js';
import { gameConfig } from './decks.js';

export class AIController {
  // ais: {corp?: CorpAI, runner?: RunnerAI}
  constructor(game, ais) {
    this.game = game;
    this.ais = ais;
  }
  aiFor(decision) { return decision ? this.ais[decision.player] ?? null : null; }

  // answer ONE pending decision if it belongs to an AI seat. -> bool answered
  step() {
    const d = this.game.decision;
    const ai = this.aiFor(d);
    if (!ai) return false;
    this.game.choose(ai.decide(this.game, d));
    return true;
  }

  // keep answering until the game ends, a human decision comes up, or the
  // safety valve trips. -> {done, steps, stalled}
  run(maxSteps = 20000) {
    let steps = 0;
    while (steps < maxSteps && !this.game.state.winner && this.step()) steps++;
    return {
      done: !!this.game.state.winner,
      steps,
      stalled: steps >= maxSteps,
    };
  }
}

// Full AI-vs-AI game from precon deck keys. -> {game, result}
export function autoplay({ corpDeck = 'hb-core', runnerDeck = 'gabe-core', seed = 1,
  corpLevel = 'hard', runnerLevel = 'hard', cardsJson, maxSteps = 20000 } = {}) {
  const game = new Game(cardsJson, gameConfig(corpDeck, runnerDeck, seed));
  const ctl = new AIController(game, {
    corp: new CorpAI({ level: corpLevel, seed: seed * 7 + 1 }),
    runner: new RunnerAI({ level: runnerLevel, seed: seed * 13 + 2 }),
  });
  const r = ctl.run(maxSteps);
  return {
    game,
    result: {
      ...r,
      winner: game.state.winner,
      winReason: game.state.winReason,
      turns: game.state.turn,
      corpPoints: game.state.corp.agendaPoints,
      runnerPoints: game.state.runner.agendaPoints,
      aiErrors: game.aiErrors ?? [],
    },
  };
}
