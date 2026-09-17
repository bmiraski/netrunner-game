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
import { TutorialController } from '../tutorial/tutorial.js';
import { hintFor } from '../tutorial/hints.js';
import { render } from './render.js';
import { cardPanelHtml, escapeHtml } from './cardtext.js';
import { analyzeGame } from '../analysis/analyze.js';
import { reviewHtml } from './reviewpanel.js';
import { statsHtml } from './statspanel.js';
import { onAuthChange, sendMagicLink, signOut } from '../cloud/auth.js';
import { shapeGameRow, saveGame, fetchMyGames } from '../cloud/stats.js';

async function loadCards() {
  if (window.__CARDS__) return window.__CARDS__;           // bundled build
  const res = await fetch(new URL('../data/cards.json', import.meta.url));
  return res.json();
}

const $ = sel => document.querySelector(sel);

// Events whose card should be auto-shown in the inspector the moment it
// happens — anything "played" onto the table or publicly revealed, so the
// player can immediately read the details and assess.
const REVEAL_EVENTS = {
  'operation-played': d => d.id,
  'event-played':     d => d.id,
  'runner-installed': d => d.id,
  'card-rezzed':      d => d.id,
  'ice-rezzed':       d => d.id,
  'encounter-ice':    d => d.iceId,
  'card-accessed':    d => d.id,
  'agenda-scored':    d => d.id,
  'agenda-stolen':    d => d.id,
};

const app = {
  cardsJson: null,
  game: null, ctl: null,
  viewer: 'runner',          // 'corp' | 'runner' | 'all' (watch)
  els: {}, optionMap: { byInst: new Map(), byServer: new Map() },
  lastConfig: null,
  tutorial: null, eventCallouts: [], hintText: null,
  user: null,                // signed-in Supabase user, or null (cloud/auth.js)

  // tutorial helpers (no-ops outside tutorial mode)
  allowedId() {
    return this.tutorial && !this.tutorial.done && this.game.decision?.player === 'runner'
      ? this.tutorial.allowedOptionId() : null;
  },
  drainTutorial() {
    if (this.tutorial) this.eventCallouts.push(...this.tutorial.drainEventCallouts());
  },
  showHint() {
    const hint = hintFor(this.game);
    this.hintText = hint ? hint.text : 'No decision pending.';
    this.repaint();
  },
  // every render() call site routes through here so a completed game gets
  // saved exactly once, regardless of which path (click, AI pump tick,
  // watch-mode step) produced the final decision.
  repaint() {
    render(this);
    this.maybeSaveGame();
  },
  maybeSaveGame() {
    if (!this.game || this._saved || !this.game.state.winner || !this.user) return;
    this._saved = true;
    const report = analyzeGame(this.game);
    const cfg = this.lastConfig ?? {};
    const row = shapeGameRow(report, {
      userId: this.user.id,
      side: cfg.tutorial ? 'runner' : cfg.side,
      corpDeck: cfg.tutorial ? 'tutorial' : cfg.corpDeck,
      runnerDeck: cfg.tutorial ? 'tutorial' : cfg.runnerDeck,
    });
    saveGame(row).then(({ error }) => {
      if (error) console.error('save game to Supabase failed:', error.message ?? error);
    });
  },

  // ---- game flow ----
  start(cfg) {
    this.lastConfig = cfg;
    this._saved = false;
    this.tutorial = null; this.eventCallouts = []; this.hintText = null;
    const seed = cfg.seed;
    this.game = new Game(this.cardsJson, gameConfig(cfg.corpDeck, cfg.runnerDeck, seed));
    const ais = {};
    if (cfg.side !== 'corp') ais.corp = new CorpAI({ level: cfg.level, seed: seed * 7 + 1 });
    if (cfg.side !== 'runner') ais.runner = new RunnerAI({ level: cfg.level, seed: seed * 13 + 2 });
    this.ctl = new AIController(this.game, ais);
    this.viewer = cfg.side === 'watch' ? 'all' : cfg.side;
    this._seen = 0;
    $('#setup').style.display = 'none';
    $('#table').style.display = '';
    $('#watch-controls').style.display = cfg.side === 'watch' ? '' : 'none';
    this.els.inspector.innerHTML =
      '<div class="inspector-head">CARD DETAILS</div><div class="inspector-empty">Hover or click any card — details appear here.</div>';
    this._shownCard = null;
    this.repaint();
    this.autoInspect();
    if (cfg.side !== 'watch') this.pump();
  },
  startTutorial() {
    this.lastConfig = { tutorial: true };
    this._saved = false;
    this.tutorial = new TutorialController(this.cardsJson);
    this.eventCallouts = []; this.hintText = null;
    this.game = this.tutorial.game;
    this.ctl = this.tutorial.ctl;
    this.viewer = 'runner';
    this._seen = 0;
    this._shownCard = null;
    $('#setup').style.display = 'none';
    $('#table').style.display = '';
    $('#watch-controls').style.display = 'none';
    this.els.inspector.innerHTML =
      '<div class="inspector-head">CARD DETAILS</div><div class="inspector-empty">Hover or click any card — details appear here.</div>';
    this.drainTutorial();
    this.repaint();
    this.autoInspect();
    this.pump();
  },
  answer(id) {
    if (this._pacing) return;                   // AI still animating
    const allowed = this.allowedId();
    if (allowed && id !== allowed) return;      // tutorial: only the taught move
    const wasRunner = this.game.decision?.player === 'runner';
    try {
      this.game.choose(id);
    } catch (e) {
      console.error(e);
      return;
    }
    if (this.tutorial && wasRunner) { this.tutorial.onAnswered(); this.hintText = null; }
    this.closePopover();
    this.drainTutorial();
    this.repaint();
    this.autoInspect();
    if (this.viewer !== 'all') this.pump();
  },
  // paced AI advance: one AI decision per tick so the log/board animate
  // instead of jumping a whole turn. window.__PACE__ = 0 -> synchronous
  // (used by the jsdom smoke test).
  pump() {
    const pace = window.__PACE__ ?? 110;
    if (pace <= 0) {
      this.ctl.run();
      this.drainTutorial();
      this.repaint();
      this.autoInspect();
      return;
    }
    if (this._pacing) return;
    this._pacing = true;
    const tick = () => {
      const progressed = !this.game.state.winner && this.ctl.step();
      this.drainTutorial();
      this.repaint();
      this.autoInspect();
      const d = this.game.decision;
      if (progressed && !this.game.state.winner && d && this.ctl.ais[d.player]) {
        this._paceTimer = setTimeout(tick, pace);
        return;
      }
      this._pacing = false;
      this.repaint();                              // repaint with prompt active
    };
    tick();
  },
  step(n) {                          // watch mode
    for (let i = 0; i < n; i++) if (this.game.state.winner || !this.ctl.step()) break;
    this.repaint();
    this.autoInspect();
  },
  stepTurn() {
    const g = this.game;
    const startTurn = g.state.turn, startPlayer = g.state.activePlayer;
    for (let i = 0; i < 3000; i++) {
      if (g.state.winner || !this.ctl.step()) break;
      if (g.state.turn !== startTurn || g.state.activePlayer !== startPlayer) break;
    }
    this.repaint();
    this.autoInspect();
  },
  // show the most recently played/revealed card in the inspector (new events
  // since the last repaint only — manual inspects are never overridden by
  // stale history)
  autoInspect() {
    const evs = this.game.log;
    for (let i = evs.length - 1; i >= this._seen; i--) {
      const pick = REVEAL_EVENTS[evs[i].type];
      if (!pick) continue;
      const it = this.game.g.insts[pick(evs[i].data)];
      if (it) { this.inspect(it.card); break; }
    }
    this._seen = evs.length;
  },
  newGame() {
    clearTimeout(this._paceTimer);
    this._pacing = false;
    this.closeReview();
    $('#table').style.display = 'none';
    $('#setup').style.display = '';
  },

  // ---- post-game review (Phase 7) ----
  showReview() {
    const report = analyzeGame(this.game);
    this.els.review.innerHTML = reviewHtml(report);
    this.els.review.style.display = 'flex';
    this.els.review.querySelector('.review-close').addEventListener('click', () => this.closeReview());
  },
  closeReview() {
    this.els.review.style.display = 'none';
    this.els.review.innerHTML = '';
  },

  // ---- my stats (Phase 8, hosted) ----
  async showStats() {
    this.els.stats.innerHTML = statsHtml([]);
    this.els.stats.style.display = 'flex';
    this.els.stats.querySelector('.review-close').addEventListener('click', () => this.closeStats());
    const { data, error } = await fetchMyGames();
    this.els.stats.innerHTML = statsHtml(data, { error });
    this.els.stats.querySelector('.review-close').addEventListener('click', () => this.closeStats());
  },
  closeStats() {
    this.els.stats.style.display = 'none';
    this.els.stats.innerHTML = '';
  },

  // ---- auth (cloud/auth.js) ----
  enterApp(user) {
    this.user = user;
    $('#auth').style.display = 'none';
    $('#setup').style.display = '';
    $('#auth-whoami').textContent = user.email ?? '';
  },
  leaveApp() {
    this.user = null;
    $('#table').style.display = 'none';
    $('#setup').style.display = 'none';
    $('#auth').style.display = '';
    $('#auth-status').textContent = '';
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
    const el = this.els.inspector;
    el.innerHTML = '<div class="inspector-head">CARD DETAILS</div>' + cardPanelHtml(card);
    this._shownCard = card;
    // restart the attention flash
    el.classList.remove('inspector-flash');
    void el.offsetWidth;
    el.classList.add('inspector-flash');
    el.scrollTop = 0;
  },
  // hover preview: same panel, no flash (don't grab attention on mouse-over)
  preview(card) {
    if (card === this._shownCard) return;
    this._shownCard = card;
    const el = this.els.inspector;
    el.classList.remove('inspector-flash');
    el.innerHTML = '<div class="inspector-head">CARD DETAILS</div>' + cardPanelHtml(card);
    el.scrollTop = 0;
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

function wireAuth() {
  $('#auth-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = $('#auth-email').value.trim();
    if (!email) return;
    $('#auth-status').textContent = 'Sending…';
    const { error } = await sendMagicLink(email);
    $('#auth-status').textContent = error
      ? `Couldn't send a link: ${error.message}`
      : `Check ${email} for a login link.`;
  });
  $('#btn-signout').addEventListener('click', async () => {
    await signOut();
  });
  onAuthChange((session) => {
    if (session?.user) app.enterApp(session.user);
    else app.leaveApp();
  });
}

async function init() {
  app.cardsJson = await loadCards();
  registerAll(createDb(app.cardsJson));
  app.els = {
    corpZone: $('#corp-zone'), midZone: $('#mid-zone'), runnerZone: $('#runner-zone'),
    log: $('#log'), prompt: $('#prompt'), inspector: $('#inspector'), callout: $('#callout'),
    review: $('#review'), stats: $('#stats'),
  };
  wireAuth();
  $('#btn-stats').addEventListener('click', () => app.showStats());
  $('#btn-tutorial').addEventListener('click', () => app.startTutorial());
  document.body.addEventListener('click', () => app.closePopover());
  $('#btn-step1').addEventListener('click', () => app.step(1));
  $('#btn-step25').addEventListener('click', () => app.step(25));
  $('#btn-stepturn').addEventListener('click', () => app.stepTurn());

  // keyboard: 1-9 pick a prompt option, Enter = sole option / confirm number,
  // Escape closes the popover
  document.addEventListener('keydown', (e) => {
    if ($('#table').style.display === 'none') return;    // setup screen
    if (e.key === 'Escape') {
      if (app.els.review.style.display !== 'none') { app.closeReview(); return; }
      if (app.els.stats.style.display !== 'none') { app.closeStats(); return; }
      app.closePopover(); return;
    }
    if (e.target.tagName === 'INPUT') {
      if (e.key === 'Enter') { $('.num-row button')?.click(); e.preventDefault(); }
      return;
    }
    const pop = document.querySelector('.popover');
    const scope = pop ?? $('#prompt');
    const opts = [...scope.querySelectorAll('.opt-btn')];
    if (!opts.length) return;
    if (e.key >= '1' && e.key <= '9') {
      opts[Number(e.key) - 1]?.click();
      e.preventDefault();
    } else if (e.key === 'Enter' && opts.length === 1) {
      opts[0].click();
      e.preventDefault();
    }
  });
  buildSetup();
}

init().catch(e => {
  document.body.innerHTML = `<pre style="color:#f66;padding:2em">${escapeHtml(e.stack ?? String(e))}</pre>`;
});
