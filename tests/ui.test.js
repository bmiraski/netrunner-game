// Phase 5 UI tests — the DOM-free parts: log text table coverage, card text
// markup, and decision-option -> board-target parsing. (Board rendering
// itself needs a browser; the bundle smoke-check covers load errors.)
import assert from 'node:assert/strict';
import { cardsJson, db } from './helpers.js';
import { autoplay } from '../ai/index.js';
import { eventText } from '../ui/logtext.js';
import { markupToHtml, factionColor } from '../ui/cardtext.js';
import { buildOptionMap } from '../ui/render.js';
import { analyzeGame } from '../analysis/analyze.js';
import { reviewHtml } from '../ui/reviewpanel.js';
import { statsHtml } from '../ui/statspanel.js';

export default [

  ['stats panel renders empty, populated, and error states without throwing', () => {
    assert.ok(statsHtml([]).includes('No games recorded'));
    const rows = [
      { played_at: '2026-09-16T12:00:00Z', side: 'runner', corp_deck: 'hb-core', runner_deck: 'gabe-core', winner: 'runner', reason: 'agendas', turns: 8 },
      { played_at: '2026-09-15T12:00:00Z', side: 'corp', corp_deck: 'weyland-core', runner_deck: null, winner: 'corp', reason: 'flatline', turns: 5 },
    ];
    const html = statsHtml(rows);
    assert.ok(!/undefined|\[object/.test(html), `bad interpolation: ${html}`);
    assert.ok(html.includes('Win rate'));
    assert.ok(statsHtml([], { error: new Error('boom') }).includes('boom'));
  }],

  ['review panel renders without throwing or leaking undefined across full games', () => {
    for (const [corpDeck, runnerDeck, seed] of [
      ['hb-core', 'gabe-core', 3], ['jinteki-core', 'reina-core', 5],
      ['nbn-core', 'ct-core', 7], ['weyland-core', 'gabe-core', 11],
    ]) {
      const { game } = autoplay({ cardsJson, seed, corpDeck, runnerDeck });
      const html = reviewHtml(analyzeGame(game));
      assert.ok(html.includes('POST-GAME REVIEW'));
      assert.ok(!/undefined|null|\[object/.test(html), `bad interpolation for ${corpDeck} vs ${runnerDeck}: contains undefined/null/[object]`);
    }
  }],

  ['log rendering covers every event type in full games (no unknowns, no throws)', () => {
    const seen = new Set(), unknown = new Set();
    for (const [corpDeck, runnerDeck, seed] of [
      ['hb-core', 'gabe-core', 3], ['jinteki-core', 'reina-core', 5],
      ['nbn-core', 'ct-core', 7], ['weyland-core', 'gabe-core', 11],
    ]) {
      const { game } = autoplay({ cardsJson, seed, corpDeck, runnerDeck });
      for (const viewer of ['corp', 'runner', 'all']) {
        for (const ev of game.log) {
          seen.add(ev.type);
          const r = eventText(ev, game.g, viewer);
          if (r === null) continue;
          assert.equal(typeof r.text, 'string');
          assert.ok(r.text.length > 0, `empty text for ${ev.type}`);
          if (r.cls === 'log-unknown') unknown.add(ev.type);
          assert.ok(!/undefined|#\d+|\[object/.test(r.text),
            `bad interpolation for ${ev.type}: "${r.text}"`);
        }
      }
    }
    assert.deepEqual([...unknown], [], `unmapped event types: ${[...unknown].join(', ')}`);
    assert.ok(seen.size >= 30, `soak games only produced ${seen.size} event types`);
  }],

  ['runner-viewer log never leaks facedown corp card titles on install/discard', () => {
    const { game } = autoplay({ cardsJson, seed: 3, corpDeck: 'hb-core', runnerDeck: 'gabe-core' });
    for (const ev of game.log) {
      if (ev.type === 'corp-installed') {
        const r = eventText(ev, game.g, 'runner');
        const title = game.g.insts[ev.data.id].card.title;
        assert.ok(!r.text.includes(title), `leak: ${r.text}`);
      }
      if (ev.type === 'card-discarded' && ev.data.who === 'corp') {
        const r = eventText(ev, game.g, 'runner');
        assert.equal(r.text, 'Corp discards a card.');
      }
    }
  }],

  ['card text markup renders for all 132 cards (no leftover tokens, escaped html)', () => {
    for (const card of Object.values(cardsJson.cards)) {
      const html = markupToHtml(card.text ?? '');
      assert.ok(!/\[(credit|click|subroutine|trash|mu|recurring-credit|link)\]/.test(html),
        `unreplaced token in ${card.title}`);
      assert.ok(!/<(?!\/?(strong|br|span|i)\b)[a-z]/i.test(html),
        `unexpected tag in ${card.title}: ${html}`);
      assert.ok(factionColor(card.faction).startsWith('#'), `no color for ${card.faction}`);
    }
  }],

  ['buildOptionMap parses engine option-id shapes to board targets', () => {
    const dec = {
      kind: 'options', player: 'corp', prompt: 'x',
      options: [
        { id: 'play:12', label: 'p' }, { id: 'install:12', label: 'i' },
        { id: 'rez:9', label: 'r' }, { id: 'advance:9', label: 'a' },
        { id: 'score:44', label: 's' }, { id: 'run:hq', label: 'run' },
        { id: 't:remote1', label: 't' }, { id: '77', label: 'bare' },
        { id: 'sub:2', label: 'sub' }, { id: 'credit', label: 'verb-only' },
        { id: 'pass', label: 'pass' },
      ],
    };
    const { byInst, byServer } = buildOptionMap(dec);
    assert.deepEqual([...byInst.keys()].sort((a, b) => a - b), [9, 12, 44, 77]);
    assert.equal(byInst.get(12).length, 2);
    assert.deepEqual([...byServer.keys()].sort(), ['hq', 'remote1']);
    assert.deepEqual(buildOptionMap(null).byInst.size, 0);
  }],

  ['all eight precon decks resolve for the setup screen', async () => {
    const { DECKS, gameConfig } = await import('../ai/decks.js');
    assert.equal(DECKS.corp.length, 4);
    assert.equal(DECKS.runner.length, 4);
    for (const d of [...DECKS.corp, ...DECKS.runner]) {
      assert.ok(d.name && d.description, `deck ${d.key} missing name/description`);
      assert.ok(db.card(d.identity).type === 'identity');
    }
    for (const c of DECKS.corp) for (const r of DECKS.runner) gameConfig(c.key, r.key, 1);
  }],
];
