// UI bootstrap: setup screen -> Game + AIController -> render/answer loop.
// Pattern per docs/AI.md: the human seat leaves decisions pending; ctl.run()
// answers AI decisions and stops when a human decision (or game end) is up.
import { Game } from '../engine/game.js';
import { createDb } from '../engine/db.js';
import { registerAll } from '../cards/index.js';
import { CorpAI } from '../ai/corp.js';
import { RunnerAI } from '../ai/runner.js';
import { AIController } from '../ai/controller.js';
import { DECKS, gameConfig } from '../ai/decks.js';
import { render } from './render.js';
import { cardPanelHtml, escapeHtml } from './cardtext.js';

async function loadCards() {
  if (window.__CARDS__) return window.__CARDS__;           // bundled build
  const res = await fetch(new URL('../data/cards.json', import.meta.url));
  return res.json();
}

const $ = sel => document.querySelector(sel);

const app = {
  cardsJson: null,
  game: null, ctl: null,
  viewer: 'runner',          // 'corp' | 'runner' | 'all' (watch)
  els: {}, optionMap: { byInst: new Map(), byServer: new Map() },
  lastConfig: null,

  // ---- game flow ----
  start(cfg) {
    this.lastConfig = cfg;
    const seed = cfg.seed;
    this.game = new Game(this.cardsJson, gameConfig(cfg.corpDeck, cfg.runnerDeck, seed));
    const ais = {};
    if (cfg.side !== 'corp') ais.corp = new CorpAI({ level: cfg.level, seed: seed * 7 + 1 });
    if (cfg.side !== 'runner') ais.runner = new RunnerAI({ level: cfg.level, seed: seed * 13 + 2 });
    this.ctl = new AIController(this.game, ais);
    this.viewer = cfg.side === 'watch' ? 'all' : cfg.side;
    $('#setup').style.display = 'none';
    $('#table').style.display = '';
    $('#watch-controls').style.display = cfg.side === 'watch' ? '' : 'none';
    if (cfg.side !== 'watch') this.ctl.run();
    render(this);
  },
  answer(id) {
    try {
      this.game.choose(id);
    } catch (e) {
      console.error(e);
      return;
    }
    this.closePopover();
    if (this.viewer !== 'all') this.ctl.run();
    render(this);
  },
  step(n) {                          // watch mode
    for (let i = 0; i < n; i++) if (this.game.state.winner || !this.ctl.step()) break;
    render(this);
  },
  stepTurn() {
    const g = this.game;
    const startTurn = g.state.turn, startPlayer = g.state.activePlayer;
    for (let i = 0; i < 3000; i++) {
      if (g.state.winner || !this.ctl.step()) break;
      if (g.state.turn !== startTurn || g.state.activePlayer !== startPlayer) break;
    }
    render(this);
  },
  newGame() {
    $('#table').style.display = 'none';
    $('#setup').style.display = '';
  },

  // ---- board interaction ----
  onCardClick(instId, el, card) {
    const opts = this.optionMap.byInst.get(instId) ?? [];
    if (opts.length === 1) return this.answer(opts[0].id);
    if (opts.length > 1) return this.popover(el, opts);
    if (card) this.inspect(card);
  },
  onServerClick(sid, el) {
    const opts = this.optionMap.byServer.get(sid) ?? [];
    if (opts.length === 1) return this.answer(opts[0].id);
    if (opts.length > 1) return this.popover(el, opts);
  },
  inspect(card) {
    this.els.inspector.innerHTML = cardPanelHtml(card);
  },
  popover(anchor, opts) {
    this.closePopover();
    const pop = document.createElement('div');
    pop.className = 'popover';
    for (const o of opts) {
      const b = document.createElement('button');
      b.className = 'btn opt-btn';
      b.textContent = o.label;
      b.addEventListener('click', (e) => { e.stopPropagation(); this.answer(o.id); });
      pop.appendChild(b);
    }
    document.body.appendChild(pop);
    const r = anchor.getBoundingClientRect();
    pop.style.left = `${Math.min(r.left, window.innerWidth - 280)}px`;
    pop.style.top = `${r.bottom + 4}px`;
    this._pop = pop;
  },
  closePopover() {
    if (this._pop) { this._pop.remove(); this._pop = null; }
  },
};

function buildSetup() {
  const corpSel = $('#sel-corp-deck'), runnerSel = $('#sel-runner-deck');
  for (const d of DECKS.corp) corpSel.appendChild(new Option(`${d.name}`, d.key));
  for (const d of DECKS.runner) runnerSel.appendChild(new Option(`${d.name}`, d.key));
  corpSel.value = 'hb-core';
  runnerSel.value = 'gabe-core';
  const deckInfo = () => {
    const side = document.querySelector('input[name=side]:checked').value;
    const corp = DECKS.corp.find(d => d.key === corpSel.value);
    const runner = DECKS.runner.find(d => d.key === runnerSel.value);
    $('#deck-desc').innerHTML =
      `<p><b>${escapeHtml(corp.name)}</b> — ${escapeHtml(corp.description)}</p>
       <p><b>${escapeHtml(runner.name)}</b> — ${escapeHtml(runner.description)}</p>`;
    $('#lbl-corp-deck').textContent = side === 'corp' ? 'Your deck (Corp)' : 'AI Corp deck';
    $('#lbl-runner-deck').textContent = side === 'runner' ? 'Your deck (Runner)' : 'AI Runner deck';
  };
  corpSel.addEventListener('change', deckInfo);
  runnerSel.addEventListener('change', deckInfo);
  for (const r of document.querySelectorAll('input[name=side]')) r.addEventListener('change', deckInfo);
  deckInfo();
  $('#btn-start').addEventListener('click', () => {
    const seedRaw = $('#inp-seed').value.trim();
    app.start({
      side: document.querySelector('input[name=side]:checked').value,
      corpDeck: corpSel.value,
      runnerDeck: runnerSel.value,
      level: $('#sel-level').value,
      seed: seedRaw ? (Number(seedRaw) || 1) : (Math.floor(Math.random() * 2 ** 30) + 1),
    });
  });
}

async function init() {
  app.cardsJson = await loadCards();
  registerAll(createDb(app.cardsJson));
  app.els = {
    corpZone: $('#corp-zone'), midZone: $('#mid-zone'), runnerZone: $('#runner-zone'),
    log: $('#log'), prompt: $('#prompt'), inspector: $('#inspector'),
  };
  document.body.addEventListener('click', () => app.closePopover());
  $('#btn-step1').addEventListener('click', () => app.step(1));
  $('#btn-step25').addEventListener('click', () => app.step(25));
  $('#btn-stepturn').addEventListener('click', () => app.stepTurn());
  buildSetup();
}

init().catch(e => {
  document.body.innerHTML = `<pre style="color:#f66;padding:2em">${escapeHtml(e.stack ?? String(e))}</pre>`;
});
