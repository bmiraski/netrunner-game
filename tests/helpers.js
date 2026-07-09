// Test helpers: build games from card titles, drive decisions tersely.
import { readFileSync } from 'node:fs';
import { Game } from '../engine/game.js';
import { createDb } from '../engine/db.js';
import { registerAll } from '../cards/index.js';

export const cardsJson = JSON.parse(
  readFileSync(new URL('../data/cards.json', import.meta.url), 'utf8'));
const db = createDb(cardsJson);
registerAll(db);

export { db };

// deck: [['Sure Gamble', 3], ...]
export function makeGame({ seed = 42, corpId = 'Haas-Bioroid: Stronger Together',
  runnerId = 'Gabriel Santiago: Consummate Professional', corp = [], runner = [] }) {
  const spec = list => list.map(([t, qty]) => ({ code: db.titled(t).code, qty }));
  return new Game(cardsJson, {
    seed,
    corp: { identity: db.titled(corpId).code, cards: spec(corp) },
    runner: { identity: db.titled(runnerId).code, cards: spec(runner) },
  });
}

export function driver(game) {
  return {
    game,
    get d() {
      if (!game.decision) throw new Error(`no pending decision (winner: ${game.state.winner})`);
      return game.decision;
    },
    ctx() { return `@ [${this.d.player}] "${this.d.prompt}" opts: ${this.d.options?.map(o => `${o.id}=${o.label}`).join(' | ')}`; },
    pick(id) { game.choose(id); return this; },
    label(sub) {
      const o = this.d.options.find(o => o.label.includes(sub));
      if (!o) throw new Error(`no option labeled ~"${sub}" ${this.ctx()}`);
      game.choose(o.id); return this;
    },
    prefix(p) {
      const o = this.d.options.find(o => o.id.startsWith(p));
      if (!o) throw new Error(`no option id ~"${p}*" ${this.ctx()}`);
      game.choose(o.id); return this;
    },
    num(n) { game.choose(n); return this; },
    keepHands() { return this.pick('keep').pick('keep'); },
    // corp/runner spend all remaining clicks on credits
    creditsOut(player) {
      while (game.decision?.actionMenu && game.decision.player === player) this.pick('credit');
      return this;
    },
    discardFirst() { // answer a discard prompt with the first card
      while (game.decision?.discard) this.pick(this.d.options[0].id);
      return this;
    },
  };
}

export function lastEvent(game, type) {
  const es = game.log.filter(e => e.type === type);
  return es[es.length - 1];
}
