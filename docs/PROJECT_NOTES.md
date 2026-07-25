# Netrunner Game — Project Notes (session handoff)

**Read this first in any new session.** Companion doc: `BUILD_PLAN.md` (the 9-phase plan — the authoritative roadmap). This file tracks status, decisions, and environment knowledge so any model (including smaller ones doing grunt work) can pick up cleanly.

## Status
- **Phase 1 (card data pipeline): COMPLETE** — 2026-07-08
- **Phase 2 (rules engine): COMPLETE** — 2026-07-08. Generator-based
  deterministic engine; 32 passing tests. Architecture: `docs/ENGINE.md`.
- **Phase 3 (card abilities): COMPLETE** — 2026-07-09. All 132/132 cards
  scripted (cards/pilots.js + waves-a/b/c/d.js) with per-card tests.
  Per-card status + every deviation: docs/CARD_COVERAGE.md.
  Known deferred items (need small engine hooks, revisit in Phase 9):
  Datasucker counter SPENDING (needs runner encounter paid-ability hook),
  Pheromones pool spending (needs 'hq-run' payment purpose call site),
  Test Run return-to-stack (needs delayed-trigger facility),
  Archer rez requires scored agenda (not engine-gated — the Corp AI checks;
  the three partially-implemented cards are EXCLUDED from precon decks).
- **Phase 4 (AI opponents): COMPLETE** — 2026-07-09. Architecture: docs/AI.md.
  - ai/: view.js (imperfect-info discipline), base.js (routing + fallback +
    difficulty LEVELS), corp.js, runner.js, controller.js (AIController +
    autoplay), decks.js (7 precon decks, one per identity, core-box legal).
  - Two levels (standard/hard); AIs deterministic (own seeded rng — never
    g.rng); any AI handler error falls back to a safe legal answer
    (game.aiErrors records it — soak asserts none).
  - Suite: 227 passing (163 engine/cards + 44 decks + 16 AI unit + 4 soak).
    tools/soak.js: 120-game matrix clean — 0 stalls, 0 aiErrors, 0 deck-outs,
    corp ~43-58% depending on levels; every matchup playable. Balance
    outliers noted in docs/AI.md (Jinteki-vs-Gabe corp-skewed via flatline,
    Weyland-vs-Reina runner-skewed) — tune in Phase 9.
- **Phase 5 (UI): COMPLETE** — 2026-07-11. Architecture: docs/UI.md.
  - 5a checkpoint: playable browser UI as a pure decision renderer — setup
    screen (side/deck/difficulty/seed, plus watch-AI-vs-AI mode), board
    (servers+ice, rig, hands, trackers), prompt panel, scrollable log, card
    inspector, legal-action highlighting (option ids -> board targets), dark
    cyberpunk theme. Perspective filtering hides corp hidden info from the
    runner viewer in BOTH board and log (leak-tested).
  - User feedback round: setup-screen alignment, sticky CARD DETAILS panel
    with glow flash, auto-inspect of every played/revealed card (play,
    install, rez, encounter, access, score/steal).
  - 5b polish: run panel with per-subroutine broken/unbroken state + pulsing
    current-ice marker, turn banner + click pips + active-player glow +
    effective link (baseLink + linkBonus), keyboard controls (1-9 / Enter /
    Escape, works on popovers, number chips on buttons), hover preview in
    inspector, subtype lines on tiles, paced AI advance (~110ms/decision so
    AI turns animate; window.__PACE__=0 for synchronous tests).
  - tools/bundle.js (esbuild) builds the committed double-clickable
    netrunner.html (~0.3 MB). Verification: suite 232 (tests/ui.test.js);
    tools/ui-smoke.js jsdom full-game click-throughs (runner/corp/watch,
    asserts details panel populates); paced mode separately verified.
  - User decision: remaining bugs found in play are handled in later phases.
- **Phase 6 (Tutorial): COMPLETE** — 2026-07-11. Architecture: docs/TUTORIAL.md.
  - tutorial/: steps.js (12-step guided script authored against the REAL
    seed-11 hb-core-vs-gabe-core replay + one-time EVENT_CALLOUTS),
    tutorial.js (TutorialController: validates each step vs the live
    decision, graceful degrade to free play on mismatch), hints.js
    (hard RunnerAI as advisor -> always-legal suggestions).
  - Guided lessons: clicks/credits, economy events, icebreaker install + MU,
    draw, click-for-credit, run on undefended remote, access + trash cost
    (Adonis), R&D run, bioroid click-break (Viktor 1.0 x2), access, agenda
    steal (Project Ares, 2 pts). Reactive callouts: corp score, tags, damage,
    trace, run-ended-by-sub, purge. Then free play with Hint button.
  - UI: Tutorial button on setup, callout panel (#callout), taught option
    pulses gold, others disabled; answer()/board/keyboard all gated.
  - Verification: suite 237 (tests/tutorial.test.js replays the full script —
    any engine/AI change that shifts the tutorial game fails the build);
    ui-smoke tutorial mode clicks the bundle through guided + free play.
- **Rules-audit correction pass: COMPLETE** — 2026-07-25. An audit against
  the FFG Rules Reference v1.1 found 7 engine-level gaps; 5 were fixed this
  pass (2 remain open/deferred by user choice — see below):
  1. **Trace tie-break** (`engine/effects.js` `trace()`): a trace strength
     equal to link strength now FAILS (favors the Runner), per Rules
     Reference wording ("equal to or greater than" the link means
     unsuccessful) — was `>=` (Corp-favored tie), now `>`.
  2. **Server-approach jack-out** (`engine/run.js` `doRun()`): the Runner now
     gets a mandatory jack-out-or-continue decision at server approach (after
     all ice is passed, or immediately if the server has none) — in addition
     to the existing per-ice jack-out offered from the 2nd approach on.
  3. **`onTurnEnd` hook** (`engine/game.js`): a new generic hook category,
     mirroring `onTurnStart`, fires for the active player at their own turn
     end. No card uses it yet.
  4. **Hand-size-below-zero flatline** (`engine/state.js` + `effects.js`): a
     new `handSizeRaw()` (unclamped) backs a second, distinct flatline check
     in `discardToHandSize()` for the Runner — brain damage that pushes
     effective hand size below zero now flatlines even outside the
     damage-exceeds-grip path.
  5. **Runner-chosen access order** (`engine/run.js` `accessServer()`): when
     breaching Archives or a remote server with more than one card to access,
     the Runner now picks the order (Rules Reference 5.5) instead of a silent
     fixed-array-order loop. HQ (random) and R&D (deck order) are unaffected.
  - Reconciled the full test suite and the guided tutorial script against
    the new decisions: every one of the 64 initially-failing tests turned
    out to need only a new jack-out or access-order answer inserted at the
    right point (or, for the trace-tie test specifically, one such insertion
    that had been masking the real assertion) — no test's expected VALUE
    needed to change for rules-correctness reasons; none of the 64 failures
    actually exercised a genuine strength-equals-link tie. `tutorial/steps.js`
    gained two new
    jack-out steps (remote1 approach after Adonis run; R&D approach after
    Viktor 1.0 is broken). Final count: **237 passing, 0 failing**
    (unchanged from before the audit — no tests added or removed).
    `tools/soak.js 40` (480 games): 0 stalls, 0 aiErrors, 0 unexpected
    deck-outs.
  - Deferred by user choice (still open, not touched this pass): Corp
    non-ice rez window currently only offered at server approach (not also
    for e.g. upgrades rezzed reactively mid-encounter); no generic Runner
    encounter-side paid-ability window (beyond the boost/break menu).
- Next: **Phase 7 — Post-game feedback** (BUILD_PLAN): rule-based analysis of
  the event log (economy efficiency, floated clicks, missed scoring windows,
  run risk/reward, unspent resources at loss, key turning points) presented
  as a turn-annotated review screen after each game. The full game.log is
  already the single source of truth — analysis/ consumes it read-only.

## GitHub (sync at the end of every step)
- Repo: `bmiraski/netrunner-game` (main). Access token: `.git-token` file in
  the project folder (gitignored — never commit it).
- The mounted outputs folder does NOT allow file deletion from sandbox bash,
  which breaks git lock files. Therefore the git dir lives OUTSIDE the mount.
  Per session setup (bash):
  ```
  W=/sessions/<session>/mnt/outputs/netrunner
  git --git-dir=/tmp/nr.git init -q -b main
  G() { git --git-dir=/tmp/nr.git --work-tree=$W "$@"; }
  cd $W && G remote add origin "https://$(cat .git-token)@github.com/bmiraski/netrunner-game.git"
  G fetch -q origin && G reset -q --mixed origin/main   # sync index to remote
  ```
  Then `G add -A && G commit && G push origin main`. A stale `.git/` dir in
  the project folder is dead — ignore it (it's in .gitignore).
- If the folder is empty in a fresh session, restore with the same setup then
  `G checkout origin/main -- .`

## Google Docs mirrors
- BUILD_PLAN.md and PROJECT_NOTES.md are mirrored to the user's Google Drive
  (they feed Claude project memory). Drive connector can only CREATE files,
  not edit — so each sync creates a new doc with the same title; user deletes
  stale copies. Sync whenever these two files change materially.

## Locked decisions
- Browser app, single self-contained HTML deliverable (`netrunner.html`), runs offline on Mac
- Full **Revised Core Set** (ADN49 / pack `core2`), 132 unique cards / 247 copies
- Styled text cards now; real card images later via `imageUrl` field already on every card
- Preconstructed decks (2–3 per side); no deck builder at launch
- Rules basis: FFG Rules Reference v1.1 (PDF in project knowledge)
- Post-game feedback is rule-based analysis of the event log (not AI-generated)
- Stats in localStorage + JSON export/import

## File map (`netrunner/`)
```
data/
  cards.json          ← THE game database. {"meta":…, "cards": {code: card}}
  build_cards.py      ← regenerates cards.json from core2_raw.json.
                        Card schema fully documented in its docstring.
  core2_raw.json      ← raw NRDB data (don't edit; re-fetch if ever needed)
  adn49_checklist.json← card list parsed from ADN49 PDF (verification reference)
  tmp/                ← fetch artifacts, keep until Phase 9, then delete
docs/
  BUILD_PLAN.md       ← 9-phase roadmap (key project document)
  PROJECT_NOTES.md    ← this file
  ENGINE.md           ← engine architecture + how to script cards / write tests
  AI.md               ← AI architecture, difficulty knobs, tuning list
  CARD_COVERAGE.md    ← per-card implementation status + deviations
  UI.md               ← UI architecture (Phase 5): decision renderer, perspective
                        rules, run panel, keyboard, pacing
  TUTORIAL.md         ← tutorial architecture (Phase 6): guided script, callouts, hints
engine/               ← rules engine (rng, events, state, decisions, effects,
                        game, run, db) — see ENGINE.md
cards/                ← registry.js + pilots.js + waves-a/b/c/d.js (132 cards)
ai/                   ← view/base/corp/runner/controller/decks — see AI.md
tests/                ← run-tests.js + 11 *.test.js files (237 tests)
tools/                ← soak.js (AI-vs-AI matrix), bundle.js (esbuild ->
                        netrunner.html), ui-smoke.js (jsdom bundle playthrough)
ui/                   ← browser UI (see docs/UI.md): index.html, main.js,
                        render.js, cardtext.js, logtext.js, style.css
tutorial/             ← guided script + controller + hints — see TUTORIAL.md
netrunner.html        ← COMMITTED single-file build (double-click to play)
analysis/ stats/      ← empty, Phases 7+
```

## Card data facts
- Card codes "20001"–"20132" are the universal primary key
- `quantity` = copies in one Core box (drives legal precon pools); `deckLimit` = max per deck
- Image URLs: `https://card-images.netrunnerdb.com/v2/large/{code}.jpg`
- Text markup in `text`: `[credit] [click] [subroutine] [trash] [mu] [recurring-credit] [link]`, `<strong>` — UI must render these as symbols; `strippedText` is the plain version
- 1 title quirk: "Doppelgänger" (data) vs "Doppelganger" (checklist PDF) — data is correct
- Verified: counts, per-card quantities, and titles all match the ADN49 checklist

## Environment gotchas (learned the hard way)
- Sandbox bash has **no general outbound network** (curl exit 56), but git-over-https to github.com AND `npm install` DO work (allowlisted). Only `mcp__workspace__web_fetch` works for arbitrary HTTP.
- `/tmp` may contain stale dirs from prior sessions owned by another user (rm: Permission denied). Don't fight them — use a fresh path (e.g. `/tmp/nr5.git` when `/tmp/nr.git` is unwritable).
- web_fetch truncates large responses (~100KB); oversize results get saved to a host-side file whose path is in the error — Read that file in chunks instead of re-fetching. For NRDB data, per-card fetches (`/api/2.0/public/card/<code>`) are the reliable fallback.
- Path mapping: outputs folder = `/sessions/<session>/mnt/outputs/` in bash, but the long host path (see system prompt) for Read/Write tools.
- Project knowledge (PDFs, memory) is mounted **read-only**; project docs live here in `netrunner/docs/` instead, and the user copies key docs into Claude.ai project knowledge.
- NRDB card codes are NOT in pack-position order (corp factions interleave) — never assume contiguous code ranges map to factions.

## Conventions for future sessions / smaller models
- cards.json is generated — never hand-edit; change build_cards.py and re-run
- Every game-state change must flow through the engine's event log (powers UI, tutorial, analysis — see BUILD_PLAN Phase 2)
- Card ability scripts live in `cards/`, keyed by card code, registered against engine hooks; maintain a coverage checklist of all 132 codes
- Engine stays UI-independent and deterministic (seedable RNG) for testability
- Write unit tests in `tests/` as engine features land, runnable via `node` in sandbox
- Update the Status section of this file at the end of every working session

## Phase 7 pointers (next session)
- Post-game analysis is rule-based (locked decision) over game.log. Read
  docs/ENGINE.md event catalog notes + ui/logtext.js for every event type.
- Candidate detectors: floated clicks (turn-start credits vs clicks spent on
  'click' credits), wasted credits at loss, agendas left scorable (corp had
  window: scorable agenda + credits while runner poor), run EV in hindsight
  (accesses vs credits spent), damage deaths with cards in grip, turning
  points (agenda swings, big trashes).
- Present as a review screen after game-over (analysis/ module + UI panel or
  overlay); keep detectors unit-tested against scripted logs.
- Rebuild + verify cycle: `npm run build` then `node tools/ui-smoke.js`
  (sandbox: npm install jsdom --prefix /tmp/jsd + JSDOM_DIR=/tmp/jsd,
  npm install esbuild --prefix /tmp/esb + ESBUILD=.../esbuild). Tests:
  `node tests/run-tests.js` (237 green); tutorial replay test breaks loudly
  if engine/AI changes shift the seed-11 tutorial game — re-author per
  docs/TUTORIAL.md.
