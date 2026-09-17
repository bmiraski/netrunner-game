# Netrunner vs. Computer — Build Plan

> **Status:** Phases 1–7 complete, Phase 8 code-complete (live-hosting steps still human-only, see below), Phase 9 in progress (2026-09-18) — deferred cards finished, AI tuning partially done, see below. All 132 Revised Core cards scripted and fully implemented (the three previously-deferred cards — Datasucker, Pheromones, Test Run — were closed out in Phase 9); heuristic Corp & Runner AIs (2 difficulty levels) + 7 precon decks (now including all 132 cards); browser UI with setup screen, board, prompts, log; tutorial mode; rule-based post-game review; invite-only magic-link sign-in with cloud-saved match history (Supabase); 252 passing tests (`docs/ENGINE.md`, `docs/CARD_COVERAGE.md`, `docs/AI.md`, `docs/UI.md`, `docs/TUTORIAL.md`, `docs/ANALYSIS.md`, `docs/HOSTING.md`). Code on GitHub: `bmiraski/netrunner-game`. Read `PROJECT_NOTES.md` for current state before starting work. Remaining on Phase 8: the human-only setup steps in `docs/HOSTING.md` (run the DB schema, invite people, deploy, point Supabase's redirect URL at the real host) haven't been done yet — the code is ready but unverified against the live project from this sandbox (no network route to Supabase here). Remaining on Phase 9: the Weyland-vs-Reina AI matchup is investigated but not fixed (see `docs/AI.md`), a performance pass, and real card art — the last is deliberately on hold pending a separate assessment of what's needed to expand the card pool into future NetrunnerDB expansions (see `docs/PROJECT_NOTES.md`).

## Hosted pivot (2026-09-17)
Originally scoped as a purely local, offline, single-file tool (see the
platform decision below, as first written). Revised at the user's request to
run online for a small invite-only group ("me + a few friends") with
per-account cloud stats instead of `localStorage`. This supersedes the
platform decision's "no server" clause and the original Phase 8 description's
`localStorage`-only plan — see `docs/HOSTING.md` for the full architecture,
setup steps, and the trade-off this introduces (magic-link sign-in needs the
app served over http(s); it can no longer run from a double-clicked local
file). The engine/AI/cards/UI/tutorial/analysis code is unaffected — this
pivot only touches the account/persistence layer.

## Decisions (locked)
- **Platform:** Browser app, single-page bundle. ~~Single self-contained
  HTML/JS file, double-click to play, no install, no server~~ — superseded
  2026-09-17: now served over http(s) with Supabase-backed accounts (see
  Hosted pivot above). Still no custom backend server to write/run —
  Supabase (BaaS) plus static hosting covers it.
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
├── cloud/       Supabase client, auth, and stats (Hosted pivot — see docs/HOSTING.md)
└── db/          schema.sql for the hosted `games` table + RLS
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
~~Every completed game recorded to localStorage~~ — superseded by the Hosted
pivot (2026-09-17): every completed game recorded to Supabase (`cloud/stats.js`,
`db/schema.sql`), keyed to the signed-in account instead of the browser, so
history follows the person rather than the device. Stats screen ("My stats",
`ui/statspanel.js`): win rate, past games with side/decks/result/turns.
JSON export/import (not yet built) is a smaller nice-to-have now that the
data already lives in a real database rather than being the only copy.

### 9. Verification & polish
Engine test suite against Rules Reference scenarios, scripted full-game playthroughs (AI vs. AI soak tests), card-by-card behavior checks against printed text, performance pass, then bundle to the single `netrunner.html` deliverable. **2026-09-18:** closed out the three cards left deferred from Phase 3 (Datasucker, Pheromones, Test Run) via small generic engine additions rather than card-specific hacks, re-added them to precon decks, and tuned the Jinteki-PE-vs-Gabriel AI matchup (see `docs/AI.md`). Weyland-vs-Reina was investigated but left open — a tried fix showed no measurable improvement and was reverted. Performance pass and real card art remain; card art is on hold pending a separate assessment of the inputs needed to expand the card pool into future NetrunnerDB expansions.

## Build order & checkpoints
Phases 1–2 first (engine correctness is everything), then a **playable checkpoint** with a small card subset + basic AI so you can try it early. Then waves of cards (3), AI depth (4), and UI polish (5) iterate together. Tutorial (6), feedback (7), stats (8) follow, verification (9) last. Expect this to span multiple working sessions — the full Revised Core is the long pole.

## Assumptions (flag now if wrong)
- Feedback analysis is rule-based (deterministic heuristics), not AI-generated prose.
- Tutorial teaches Revised Core rules per the FFG Rules Reference (not current NSG rules changes).
- Timed effects like the original Core's trace-heavy cards follow Revised Core errata as printed in ADN49.
- Personal/fan use of card names and text from NetrunnerDB is acceptable to you.
