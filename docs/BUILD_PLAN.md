# Netrunner vs. Computer — Build Plan

> **Status:** Phases 1–6 complete (2026-07-11). All 132 Revised Core cards scripted; heuristic Corp & Runner AIs (2 difficulty levels) + 7 precon decks; browser UI with setup screen, board, prompts, log, and a committed double-clickable `netrunner.html`; 232 passing tests incl. jsdom full-game click-throughs (`docs/ENGINE.md`, `docs/CARD_COVERAGE.md`, `docs/AI.md`, `docs/UI.md`). Code on GitHub: `bmiraski/netrunner-game`. Read `PROJECT_NOTES.md` for current state before starting work. Phase 6 delivered tutorial mode: a 12-step guided first game on a fixed seed (every step validated against the live engine, `docs/TUTORIAL.md`), reactive event callouts, and free play with AI-powered hints. Next: Phase 7 (post-game feedback).

## Decisions (locked)
- **Platform:** Browser app — single self-contained HTML/JS file. Double-click to play on Mac; no install, no server.
- **Card pool:** Full Revised Core Set (ADN49, ~250 unique cards).
- **Visuals:** Styled text cards (faction-colored frames, full rules text). Architecture leaves a hook to swap in NetrunnerDB card images later.
- **Decks:** Preconstructed decks per identity, tuned for AI play.
- **Rules basis:** FFG Rules Reference v1.1 + Revised Core rulebook (already in project knowledge).

## Architecture
```
index.html (single deliverable, bundled from modular source)
├── data/        cards.json — full Revised Core, generated from NetrunnerDB API
├── engine/      game state, turn/click structure, timing windows, runs,
│                accesses, damage, win conditions, trigger/event system
├── cards/       per-card ability scripts registered against the engine
├── ai/          Corp AI + Runner AI (heuristic, difficulty levels)
├── ui/          board, hand, servers, run visualization, action prompts, game log
├── tutorial/    scripted guided game with step-by-step overlays
├── analysis/    post-game feedback from the full game log
└── stats/       localStorage-backed match history + stats screens
```

## Phases

### 1. Card data pipeline
Pull Revised Core card data from the NetrunnerDB API, normalize into `cards.json` (title, type, faction, costs, strength, subtypes, text, influence). Verify counts against the ADN49 card list PDF. Include an `imageUrl` field now so real art can be enabled later.

### 2. Rules engine (the foundation)
Deterministic state machine implementing the Rules Reference: turn structure and clicks, credits/MU/memory, install/rez/advance, the full run timing structure (approach → encounter → pass, subroutines, jack out), accesses (HQ/R&D/Archives/remotes), agenda scoring/stealing, tags, damage types, traces, and win/loss conditions. Every state change flows through an event log — this single log later powers the UI, the tutorial, and the post-game analysis. Engine is UI-independent and fully unit-tested.

### 3. Card abilities — in waves
- Wave A: vanilla cards and simple stat modifiers (~40%)
- Wave B: common patterns — recurring credits, on-access/on-score triggers, standard ice subroutines
- Wave C: unique/complex cards (e.g., Accelerated Beta Test, Midseason Replacements)
A coverage checklist tracks all ~250 cards; nothing ships unimplemented — cards not yet scripted are excluded from decks until done.

### 4. AI opponents
Separate Corp and Runner AIs. Heuristic evaluation: economy tempo, threat assessment, scoring-window detection (Corp), run-value/risk estimation (Runner). Imperfect-information handling: the AI only "knows" what a player legally would. Two difficulty levels at launch (Standard / Hard). Precon decks (2–3 per side across factions) tuned so games are competitive.

### 5. UI
Full board layout: Corp servers with ice, Runner rig (programs/hardware/resources), hands, credit/click trackers, run visualization with step-by-step subroutine prompts, scrollable game log, and clear legal-action highlighting. Keyboard + mouse. Dark cyberpunk theme.

### 6. Tutorial mode
A scripted first game (fixed decks, fixed draws) with overlay callouts teaching: turns and clicks, economy, installing, runs and ice, accessing, scoring/stealing, tags and damage. The engine's prompt system drives it, so the tutorial always reflects real rules. Followed by a "practice game" mode with contextual hints on demand.

### 7. Post-game feedback
Rule-based analysis of the event log: economy efficiency (floated clicks, wasted credits), missed scoring windows, run risk vs. reward, agenda-density awareness, unspent resources at loss, key turning points. Presented as a turn-annotated review screen after each game.

### 8. Stats tracking
Every completed game recorded to localStorage: date, side, identity, opponent deck, result, score, turns, key metrics. Stats screen: win rate over time, by side and faction, trend charts, streaks. JSON export/import so history survives browser data resets.

### 9. Verification & polish
Engine test suite against Rules Reference scenarios, scripted full-game playthroughs (AI vs. AI soak tests), card-by-card behavior checks against printed text, performance pass, then bundle to the single `netrunner.html` deliverable.

## Build order & checkpoints
Phases 1–2 first (engine correctness is everything), then a **playable checkpoint** with a small card subset + basic AI so you can try it early. Then waves of cards (3), AI depth (4), and UI polish (5) iterate together. Tutorial (6), feedback (7), stats (8) follow, verification (9) last. Expect this to span multiple working sessions — the full Revised Core is the long pole.

## Assumptions (flag now if wrong)
- Feedback analysis is rule-based (deterministic heuristics), not AI-generated prose.
- Tutorial teaches Revised Core rules per the FFG Rules Reference (not current NSG rules changes).
- Timed effects like the original Core's trace-heavy cards follow Revised Core errata as printed in ADN49.
- Personal/fan use of card names and text from NetrunnerDB is acceptable to you.
