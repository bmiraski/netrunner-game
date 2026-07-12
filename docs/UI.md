# UI Architecture (Phase 5)

How the browser UI works and how to extend it. Companion to `ENGINE.md`
(decision protocol) and `AI.md` (AIController human-seat pattern).

## Core idea: the UI is a decision renderer

The engine yields decision objects; the human seat simply leaves them
pending. The UI's whole job is:

1. render the board from `game.g` (perspective-filtered) + `game.log`
2. render `game.decision` as buttons / a number input / clickable board targets
3. on answer: `game.choose(id)` → `ctl.run()` (AI seat responds) → repaint

No game logic lives in `ui/`. Engine and `ai/` are untouched by Phase 5.

```
ui/
  index.html   shell: setup screen + table layout (dev entry via ES modules)
  main.js      bootstrap, setup screen, app object (game flow + interaction)
  render.js    full repaint: servers/ice, rig, hands, trackers, run banner,
               log, prompt; perspective filtering; option-id -> target map
  cardtext.js  NRDB text markup -> symbol HTML, faction colors, card inspector
  logtext.js   event log entry -> human-readable text (perspective-safe)
  style.css    dark cyberpunk theme
```

## Running it

- **Bundled (double-click):** `netrunner.html` at the repo root is the
  committed single-file build — cards.json, CSS, and all JS inlined.
  Rebuild with `npm run build` (needs `npm install` once for esbuild, or
  `ESBUILD=/path/to/esbuild node tools/bundle.js`).
- **Dev (modular source):** serve the repo root (`python3 -m http.server`)
  and open `/ui/index.html`. `main.js` fetches `../data/cards.json` when
  `window.__CARDS__` is absent.

## Modes and seats

Setup screen: play as Runner, Corp, or watch AI vs AI; pick both decks
(7 precons from `ai/decks.js`), AI difficulty, optional seed (blank = random).
Non-human seats get `CorpAI`/`RunnerAI` (seeds `seed*7+1` / `seed*13+2`,
matching `autoplay`). Watch mode renders viewer `'all'` and drives the game
with Step / Step 25 / Next turn buttons calling `ctl.step()`.

## Perspective filtering (hidden information)

`app.viewer` is `'corp' | 'runner' | 'all'`. Rules enforced in `render.js`:

- Runner viewer: unrezzed ice and facedown server cards render facedown
  (advancement badges still visible); HQ/R&D are counts; Archives shows
  faceup cards + a count; corp hand row is hidden.
- Corp viewer: sees all corp cards (incl. unrezzed ice identity), runner
  grip as card backs. Neither viewer sees deck order.
- The **log** is filtered too (`logtext.js` takes a viewer): corp installs
  render as "a card"/"ice", corp discards as "Corp discards a card" for the
  runner viewer. `tests/ui.test.js` asserts no title leaks.

## Legal-action highlighting

`buildOptionMap(decision)` parses engine option ids to board targets:
`play:|install:|rez:|advance:|score:|break:|boost:|ability:|d:<instId>`,
bare `<instId>`, `t:<sid>`, `run:<sid>`. Matching tiles/servers get
`.actionable` glow; clicking answers directly (single option) or opens a
popover (multiple). The prompt panel always lists every option as a button,
so the board mapping is a convenience, never the only path.

## Card rendering

Styled text cards (locked decision; `imageUrl` on every card is the future
hook). `cardtext.js` escapes everything, then substitutes
`[credit] [click] [subroutine] [trash] [mu] [recurring-credit] [link]` and
re-allows `<strong>`. Clicking any visible card shows the full card in the
"CARD DETAILS" inspector panel with an attention flash (glow animation).
**Auto-inspect:** whenever a card is played/revealed (`REVEAL_EVENTS` in
main.js: operation/event played, install, rez, encounter, access,
score/steal), the newest such card since the last repaint is shown
automatically so the player can immediately assess it. Faction colors in
`FACTION` (cardtext.js).

## Log rendering

`logtext.js eventText(ev, g, viewer)` maps all 73 event types to text
(`{text, cls}` or `null` to skip). Unknown types render dimmed with raw
JSON — `tests/ui.test.js` fails if soak games produce any unknown type, so
new engine events must be added there.

## Verification

- `node tests/run-tests.js` — 232 tests incl. `ui.test.js` (log coverage
  over 4 full AI-vs-AI games × 3 viewers, leak checks, markup over all 132
  cards, option-map parsing, deck resolution).
- `node tools/ui-smoke.js [sides] [seed]` — jsdom loads the BUILT
  `netrunner.html`, starts a game from the setup screen, and plays the human
  seat to game-over by clicking rendered buttons (runner, corp, and watch
  modes). Needs jsdom (`JSDOM_DIR=/path/to/dir-with-node_modules` supported).
  Run after every `npm run build`.

## Phase 5 remaining (post-checkpoint polish list)

- Run visualization: step-by-step subroutine display on the encountered ice
  (broken/unbroken state per sub), approach-position marker on the ice column.
- Keyboard controls (number keys for options, Enter/Escape).
- Nicer card tiles (frame layout closer to real cards), hover previews.
- Turn/click flow affordances: current-player banner, click pips, phase label.
- Animations/pacing for AI actions (log currently jumps a whole AI turn).
- Trackers: recurring-credit pools on cards, link during traces.
- Mobile/narrow layout is out of scope (desktop browser deliverable).
