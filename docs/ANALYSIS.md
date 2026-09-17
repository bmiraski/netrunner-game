# Post-Game Analysis Architecture (Phase 7)

How the post-game review works and how to extend it. Companion to
`docs/ENGINE.md` (the event log this all runs on) and `docs/UI.md` (the
decision renderer it plugs into).

## Core idea: rule-based, not AI-generated (locked decision)

Every finding is a template filled from log data — deterministic heuristics
over `game.log`, never free text from a model. Same determinism contract as
the engine: a given seed + answer history always produces the exact same
review. `analysis/` reads `game.log` and the final `game.state`/`game.g`
read-only; it never mutates the game.

```
analysis/
  analyze.js    analyzeGame(game) -> report (detectors + findings)
ui/
  reviewpanel.js   reviewHtml(report) -> HTML for the overlay
```

## Why the log alone is enough

Every event is stamped by `effects.js`'s single `emit()` wrapper with
`{turn, player}` — `turn` is the round number (increments once per corp turn
and covers that corp turn plus the runner turn after it), `player` is whose
turn-phase the event happened in. That's what makes a "turn-annotated
review" possible without re-simulating the game: group events by `turn` and
you have the whole story in order.

## Detectors (analyze.js)

- **clicks** — counts `credits-gained` events with `why: 'click'` per side
  per turn. A turn where that count hits the side's base click total (3 for
  Corp, 4 for Runner) is a "grind turn" — nothing but clicking for credits
  happened. This is the practical stand-in for "floated clicks": the engine
  forces every click to be spent each turn (no early pass), so the
  inefficiency to catch is spending them all on the cheapest option, not
  leaving them unused.
- **economy** — total credits gained/spent per side over the whole game
  (summed from `credits-gained`/`credits-spent`), plus final banked credits
  from live state.
- **runs** — slices the log between each `run-start`/`run-end` pair (runs
  never nest — a chained follow-up run, e.g. Doppelgänger, starts only after
  the outer run's `run-end` is emitted) and sums the Runner's
  `credits-spent` inside that window as the run's cost, against its
  accesses and any agenda points stolen. Verdicts are conservative: only the
  two clear extremes are flagged (a costly failed run, a cheap big steal) —
  we don't have enough information from the log alone to judge whether an
  unflagged run was "correct" (e.g. an ambush access isn't the Runner's
  fault).
- **scoring** — the chronological list of `agenda-scored`/`agenda-stolen`
  events with running totals; this is the turning-points backbone.
- **damage** — every `damage` event, plus whether the game ended in a
  flatline (`game-over` reason `'flatline'`).
- **endgame** — final credits/hand/agenda points/tags snapshot per side from
  live state, used for "unspent resources at loss" findings.

`buildFindings()` turns the sections above into the flat, turn-sorted
`findings` list (`{severity: 'good'|'bad'|'info', turn, side, text}`) the UI
leads with. Adding a new detector: write a pure `analyze*(log, state)`
function, fold its output into the report in `analyzeGame()`, and add
matching `add(...)` calls in `buildFindings()` — keep every finding's text a
template over data, never a hand-written narrative of one specific game.

## UI integration (ui/reviewpanel.js, ui/main.js, ui/render.js)

- Game-over prompt (`renderPrompt` in `render.js`) gets a second button,
  "Review game", next to "New game" — only appears once `game.state.winner`
  is set.
- `app.showReview()` (main.js) calls `analyzeGame(this.game)`, renders
  `reviewHtml(report)` into the `#review` overlay, and shows it; `Escape` or
  the Close button (`app.closeReview()`) dismiss it. The overlay sits above
  the board (`position: fixed`, `.review-overlay`) so it works from any
  viewer/mode without touching the table underneath.
- `reviewpanel.js` is pure rendering (same split as `logtext.js`/
  `cardtext.js`) — sections for Findings, Scoring timeline, Economy, Runs,
  and End of game, styled to match the existing dark-cyberpunk theme
  (`rv-*` classes in `style.css`).

## Verification

- `tests/analysis.test.js` — detector unit tests against real driven games
  (grind-turn detection, economy totals, an unprotected steal's scoring
  entry, a flatline), a synthetic log fixture pinning the run cost/value
  verdict thresholds without needing to reproduce an exact ice/breaker cost
  scenario, and a soak-style pass over all 12 precon matchups asserting
  `analyzeGame` never throws and its totals stay consistent with
  `game.state`.
- `tests/ui.test.js` — `reviewHtml(analyzeGame(...))` renders without
  throwing or leaking `undefined`/`null`/`[object ...]` across four full
  AI-vs-AI games.
- `tools/ui-smoke.js` — every mode (runner, corp, watch, tutorial) clicks
  "Review game" after game-over in the BUILT bundle, asserts the overlay
  opens with content, then closes it — real DOM, not just string output.
