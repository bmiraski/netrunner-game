// Validation of the preconstructed AI decks in ai/decks.js.
import assert from 'node:assert/strict';
import { db, cardsJson } from './helpers.js';
import { Game } from '../engine/game.js';
import { DECKS, deckByKey, gameConfig } from '../ai/decks.js';

const BANNED = []; // Phase 9: Datasucker/Pheromones/Test Run are no longer excluded
const ALL = [...DECKS.corp, ...DECKS.runner];
const isNeutral = f => f.startsWith('neutral');

const tests = [];

tests.push(['DECKS has 4 corp and 4 runner decks with unique keys', () => {
  assert.equal(DECKS.corp.length, 4);
  assert.equal(DECKS.runner.length, 4);
  const keys = ALL.map(d => d.key);
  assert.equal(new Set(keys).size, keys.length);
  for (const d of ALL) assert.equal(deckByKey(d.key), d);
}]);

for (const deck of ALL) {
  const label = `deck ${deck.key}`;
  const id = db.byCode[deck.identity];

  tests.push([`${label}: identity is a valid ${deck.side} identity`, () => {
    assert.ok(id, `identity ${deck.identity} exists`);
    assert.equal(id.type, 'identity');
    assert.equal(id.side, deck.side);
    assert.ok(deck.name && deck.description, 'has name and description');
  }]);

  tests.push([`${label}: all codes exist, side matches, no dupes, no banned cards`, () => {
    const seen = new Set();
    for (const { code, qty } of deck.cards) {
      const card = db.byCode[code];
      assert.ok(card, `card ${code} exists in db`);
      assert.notEqual(card.type, 'identity', `${card.title} is not an identity`);
      assert.equal(card.side, deck.side, `${card.title} side matches`);
      assert.ok(!seen.has(code), `${card.title} listed only once`);
      seen.add(code);
      assert.ok(Number.isInteger(qty) && qty >= 1, `${card.title} qty ${qty} valid`);
      assert.ok(!BANNED.includes(code), `${card.title} is not banned`);
    }
  }]);

  tests.push([`${label}: size equals identity minimumDeckSize (${id?.minimumDeckSize})`, () => {
    const size = deck.cards.reduce((n, c) => n + c.qty, 0);
    assert.equal(size, id.minimumDeckSize);
  }]);

  tests.push([`${label}: copies within min(quantity, deckLimit)`, () => {
    for (const { code, qty } of deck.cards) {
      const card = db.byCode[code];
      const max = Math.min(card.quantity, card.deckLimit);
      assert.ok(qty <= max, `${card.title}: ${qty} > max ${max}`);
    }
  }]);

  tests.push([`${label}: influence within limit (${id?.influenceLimit})`, () => {
    let used = 0;
    for (const { code, qty } of deck.cards) {
      const card = db.byCode[code];
      if (card.faction !== id.faction) used += (card.influence || 0) * qty;
    }
    assert.ok(used <= id.influenceLimit, `influence ${used} > ${id.influenceLimit}`);
  }]);

  if (deck.side === 'corp') {
    tests.push([`${label}: agenda points in legal range, agendas in-faction/neutral`, () => {
      const size = deck.cards.reduce((n, c) => n + c.qty, 0);
      const min = 2 * Math.floor(size / 5) + 2;
      const max = min + 1;
      let points = 0;
      for (const { code, qty } of deck.cards) {
        const card = db.byCode[code];
        if (card.type !== 'agenda') continue;
        points += card.agendaPoints * qty;
        assert.ok(card.faction === id.faction || isNeutral(card.faction),
          `agenda ${card.title} (${card.faction}) is in-faction or neutral`);
      }
      assert.ok(points >= min && points <= max,
        `agenda points ${points} outside [${min}, ${max}]`);
    }]);
  }
}

// Every corp deck boots a real Game against some runner deck.
const runnerKeys = DECKS.runner.map(d => d.key);
DECKS.corp.forEach((corp, i) => {
  const runnerKey = runnerKeys[i % runnerKeys.length];
  tests.push([`gameConfig: ${corp.key} vs ${runnerKey} starts a game with a pending mulligan`, () => {
    const cfg = gameConfig(corp.key, runnerKey, 7);
    assert.equal(cfg.seed, 7);
    assert.equal(cfg.corp.identity, corp.identity);
    const game = new Game(cardsJson, cfg);
    assert.ok(game.decision, 'a decision is pending');
    assert.match(game.decision.prompt.toLowerCase(), /mulligan|keep/);
  }]);
});

export default tests;
