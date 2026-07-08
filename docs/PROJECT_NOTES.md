# Netrunner Game — Project Notes (session handoff)

**Read this first in any new session.** Companion doc: `BUILD_PLAN.md` (the 9-phase plan — the authoritative roadmap). This file tracks status, decisions, and environment knowledge so any model (including smaller ones doing grunt work) can pick up cleanly.

## Status
- **Phase 1 (card data pipeline): COMPLETE** — 2026-07-08
- Next: **Phase 2 — rules engine** (see BUILD_PLAN.md)

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
engine/ cards/ ai/ ui/ tutorial/ analysis/ stats/ tests/   ← empty, Phases 2+
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

## Phase 2 kickoff pointers (next session)
- Implement in JS (ES modules in `engine/`, bundled to single HTML in Phase 9)
- Start: game state model + turn/click structure + economy actions, then run timing structure per Rules Reference v1.1 pp. "Timing of a Run"
- Rules Reference + rulebook PDFs are in project knowledge (files/ folder)
