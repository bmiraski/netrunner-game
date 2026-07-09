# Netrunner Game — Project Notes (session handoff)

**Read this first in any new session.** Companion doc: `BUILD_PLAN.md` (the 9-phase plan — the authoritative roadmap). This file tracks status, decisions, and environment knowledge so any model (including smaller ones doing grunt work) can pick up cleanly.

## Status
- **Phase 1 (card data pipeline): COMPLETE** — 2026-07-08
- **Phase 2 (rules engine): COMPLETE** — 2026-07-08. Generator-based
  deterministic engine; 32 passing tests. Architecture: `docs/ENGINE.md`.
- **Phase 3 (card abilities): IN PROGRESS** — hook layer done; batches A (HB+Jinteki,
  32 cards) and B (NBN+Weyland+neutral corp, 34) done with tests; batch C
  (Anarch+Criminal, 34) done with tests; batch D (Shaper+neutral runner,
  21 cards) not started. Suite: 142 passing. See docs/CARD_COVERAGE.md for per-card status/deviations.
- Original phase plan below:
  Priority order: (a) wire missing engine hooks (turn-start triggers,
  on-successful-run, paid-ability windows), (b) Wave A vanilla/simple cards,
  (c) coverage checklist in docs/CARD_COVERAGE.md. All 33 events/operations
  MUST be scripted or they can't be played at all.

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
engine/               ← rules engine (rng, events, state, decisions, effects,
                        game, run, db) — see ENGINE.md
cards/                ← registry.js + pilots.js (11 pilot scripts)
tests/                ← run-tests.js + core.test.js + coverage.test.js (32 tests)
ai/ ui/ tutorial/ analysis/ stats/   ← empty, Phases 4+
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

## Phase 3 kickoff pointers (next session)
- Read `docs/ENGINE.md` first — it explains the card-script hook API and test
  conventions, and lists engine hooks that still need wiring
- Scripting all 132 cards is ideal subagent grunt work: batch by faction,
  every batch must ship with tests, run `node tests/run-tests.js` green
- Rules Reference + rulebook PDFs are in project knowledge (files/ folder)
