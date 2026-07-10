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
- Next: **Phase 5 — UI** (see BUILD_PLAN.md). Board, hand, run visualization,
  action prompts driven by the same decision protocol the AI answers.
  AIController is human-seat aware: ctl.run() answers AI decisions and stops
  when a human decision is pending (usage snippet in docs/AI.md).

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
engine/               ← rules engine (rng, events, state, decisions, effects,
                        game, run, db) — see ENGINE.md
cards/                ← registry.js + pilots.js + waves-a/b/c/d.js (132 cards)
ai/                   ← view/base/corp/runner/controller/decks — see AI.md
tests/                ← run-tests.js + 9 *.test.js files (227 tests)
tools/                ← soak.js (AI-vs-AI matchup matrix; exit 1 on stall/error)
ui/ tutorial/ analysis/ stats/   ← empty, Phases 5+
```

## Card data facts
- Card codes "20001"–"20132" are the universal primary key
- `quantity` = copies in one Core box (drives legal precon pools); `deckLimit` = max per deck
- Image URLs: `https://card-images.netrunnerdb.com/v2/large/{code}.jpg`
- Text markup in `text`: `[credit] [click] [subroutine] [trash] [mu] [recurring-credit] [link]`, `<strong>` — UI must render these as symbols; `strippedText` is the plain version
- 1 title quirk: "Doppelgänger" (data) vs "Doppelganger" (checklist PDF) — data is correct
- Verified: counts, per-card quantities, and titles all match the ADN49 checklist

## Environment gotchas (learned the hard way)
- Sandbox bash has **no usable outbound network** (curl exit 56). Only `mcp__workspace__web_fetch` works for HTTP.
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

## Phase 5 kickoff pointers (next session)
- Read `docs/ENGINE.md` (decision protocol) + `docs/AI.md` (AIController
  human-seat pattern) first. The UI is a decision renderer: show
  `game.decision`, call `game.choose(answer)`, then `ctl.run()` to let the
  AI seat respond; repaint from the event log (`game.log`).
- Board layout per BUILD_PLAN Phase 5: servers+ice, rig, hands, trackers,
  run visualization, scrollable log, legal-action highlighting, dark theme.
- Card text markup must render `[credit] [click] [subroutine]` etc. as
  symbols (see Card data facts above).
- Single-file deliverable: keep source modular; bundling to netrunner.html
  is Phase 9. During dev a tiny local server or ES-module <script> works
  from the folder directly.
- Good subagent grunt work: card frame CSS per faction, symbol substitution,
  log-entry-to-text rendering table. Keep engine/ai untouched.
- Verify with `node tests/run-tests.js` (227 green) + `node tools/soak.js 5`
  after ANY engine/ai change.
