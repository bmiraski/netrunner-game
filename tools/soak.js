#!/usr/bin/env node
// AI soak harness: every corp precon vs every runner precon, N seeds each.
//
//   node tools/soak.js [nSeeds] [corpLevel] [runnerLevel]
//
// Defaults: 5 seeds, hard vs hard. Prints a per-matchup table (wins, flatlines,
// decked, avg turns, stalls, AI errors) plus totals. Exits 1 if any game
// stalled or produced an AI error.
import { readFileSync } from 'node:fs';
import { createDb } from '../engine/db.js';
import { registerAll } from '../cards/index.js';
import { autoplay } from '../ai/controller.js';
import { DECKS } from '../ai/decks.js';

const cardsJson = JSON.parse(
  readFileSync(new URL('../data/cards.json', import.meta.url), 'utf8'));
registerAll(createDb(cardsJson));

const nSeeds = Number(process.argv[2] ?? 5);
const corpLevel = process.argv[3] ?? 'hard';
const runnerLevel = process.argv[4] ?? 'hard';
if (!Number.isInteger(nSeeds) || nSeeds < 1) {
  console.error('usage: node tools/soak.js [nSeeds >= 1] [corpLevel] [runnerLevel]');
  process.exit(2);
}

const rows = [];
const start = Date.now();
for (const corp of DECKS.corp) {
  for (const runner of DECKS.runner) {
    const row = { matchup: `${corp.key} vs ${runner.key}`, games: 0,
      corpWins: 0, runnerWins: 0, flatlines: 0, decked: 0, turns: 0, stalls: 0, aiErrors: 0 };
    for (let seed = 1; seed <= nSeeds; seed++) {
      const { result } = autoplay({
        cardsJson, seed, corpDeck: corp.key, runnerDeck: runner.key, corpLevel, runnerLevel,
      });
      row.games++;
      row.turns += result.turns;
      row.aiErrors += result.aiErrors.length;
      if (result.stalled || !result.winner) { row.stalls++; continue; }
      if (result.winner === 'corp') row.corpWins++; else row.runnerWins++;
      if (result.winReason === 'flatline') row.flatlines++;
      if (result.winReason === 'decked') row.decked++;
    }
    rows.push(row);
  }
}

const total = rows.reduce((a, r) => {
  for (const k of ['games', 'corpWins', 'runnerWins', 'flatlines', 'decked', 'turns', 'stalls', 'aiErrors']) a[k] += r[k];
  return a;
}, { matchup: 'TOTAL', games: 0, corpWins: 0, runnerWins: 0, flatlines: 0, decked: 0, turns: 0, stalls: 0, aiErrors: 0 });

const cols = [
  ['matchup', r => r.matchup, 30],
  ['games', r => r.games, 6],
  ['corpW', r => r.corpWins, 6],
  ['runW', r => r.runnerWins, 6],
  ['flatline', r => r.flatlines, 9],
  ['decked', r => r.decked, 7],
  ['avgTurns', r => (r.turns / r.games).toFixed(1), 9],
  ['stalls', r => r.stalls, 7],
  ['aiErr', r => r.aiErrors, 6],
];
const line = r => cols.map(([, f, w]) => String(f(r)).padEnd(w)).join('');

console.log(`soak: ${rows.length} matchups x ${nSeeds} seeds = ${total.games} games (corp ${corpLevel} vs runner ${runnerLevel})\n`);
console.log(cols.map(([h, , w]) => h.padEnd(w)).join(''));
console.log('-'.repeat(cols.reduce((a, [, , w]) => a + w, 0)));
for (const r of rows) console.log(line(r));
console.log('-'.repeat(cols.reduce((a, [, , w]) => a + w, 0)));
console.log(line(total));
console.log(`\ncorp win rate ${(100 * total.corpWins / total.games).toFixed(0)}%, ` +
  `runner win rate ${(100 * total.runnerWins / total.games).toFixed(0)}%, ` +
  `${Date.now() - start}ms`);

if (total.stalls || total.aiErrors) {
  console.error(`\nFAIL: ${total.stalls} stalled game(s), ${total.aiErrors} AI error(s)`);
  process.exit(1);
}
