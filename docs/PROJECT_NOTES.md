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
  **Resolved in Phase 9 (2026-09-18)** — see the Phase 9 status entry below;
  all three are now fully implemented and included in precon decks.
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
    for e.g. upgrades rezzed reactively mid-encounter). The other deferred
    item, a generic Runner encounter-side paid-ability window (beyond the
    boost/break menu), was **resolved in Phase 9 (2026-09-18)** — see below
    (`script.encounterAbility` in engine/run.js).
- **Phase 7 (Post-game feedback): COMPLETE** — 2026-09-16. Architecture:
  `docs/ANALYSIS.md`.
  - `analysis/analyze.js`: `analyzeGame(game)` — rule-based (no AI-generated
    text) detectors over `game.log` + final state: click-grind detection
    (turns spent entirely clicking for credits), economy totals, per-run
    cost/value (slices the log between `run-start`/`run-end`), the agenda
    scoring timeline (turning points), damage/flatline summary, and an
    endgame snapshot (unspent resources at loss). Findings are flat,
    turn-sorted, template-only.
  - `ui/reviewpanel.js` + a "Review game" button on the game-over prompt
    (`ui/render.js`) opening a full-screen overlay (`app.showReview()` /
    `closeReview()` in `main.js`); Escape or Close dismiss it.
  - Verification: `tests/analysis.test.js` (7 tests: driven-game detector
    checks, a synthetic-log fixture for run verdict thresholds, a soak pass
    over all 12 matchups asserting no throws and totals consistent with
    `game.state`); `tests/ui.test.js` gained a review-panel no-throw/no-leak
    check; `tools/ui-smoke.js` clicks "Review game" → asserts the overlay
    opens with content → closes it, in every mode (runner/corp/watch/
    tutorial), against the BUILT bundle. Suite: **245 passing, 0 failing**.
- **Hosted pivot + Phase 8 (Stats tracking): IN PROGRESS** — 2026-09-17.
  User request: run online for a small invite-only group ("me + a few
  friends") with per-account cloud stats instead of `localStorage`.
  Architecture + full setup steps: `docs/HOSTING.md`.
  - `cloud/supabase.js` (client — URL + public anon key, safe to ship;
    RLS is the real gate), `cloud/auth.js` (passwordless magic-link
    sign-in/out, session listener), `cloud/stats.js` (`shapeGameRow()` pure
    + `saveGame()`/`fetchMyGames()`).
  - `db/schema.sql`: the `games` table + Row Level Security (each account
    sees only its own rows) — NOT YET RUN against the live project (that's
    on the human-only checklist below).
  - `ui/main.js`: `#auth` screen gates `#setup`/`#table` until a session
    exists; every render call now routes through `app.repaint()`, which
    also calls `app.maybeSaveGame()` — the first repaint after
    `game.state.winner` saves one row built from Phase 7's `analyzeGame()`
    report. `ui/statspanel.js`: "My stats" overlay (past games, win rate).
  - Verification: `tests/cloud.test.js` (`shapeGameRow()`), `tests/ui.test.js`
    gained a stats-panel render check, `tools/ui-smoke.js` now polyfills
    `window.fetch` (jsdom has none) — but the actual Supabase network calls
    are UNTESTED from here: this sandbox has no route to Supabase. Suite:
    **248 passing, 0 failing**.
  - **Trade-off:** magic-link sign-in needs an http(s) origin to redirect
    back to — the double-click-a-local-file workflow no longer works for
    sign-in. `netrunner.html` now needs serving (local dev server or real
    hosting) rather than opening directly.
  - **Remaining — human-only, can't be done from a sandbox session:**
    (1) run `db/schema.sql` in the Supabase SQL Editor, (2) turn off public
    signup in Supabase Auth settings, (3) set the Site URL / redirect
    allow-list once a real hosting URL exists, (4) invite each friend by
    email via the Supabase dashboard, (5) connect the GitHub repo to
    Vercel/Netlify/Cloudflare Pages for hosting, (6) do the first real
    sign-in + save-a-game smoke test in an actual browser. Full steps in
    `docs/HOSTING.md`.
  - **First live test (2026-09-16) hit a real bug, now fixed:** Ben deployed
    to Netlify with Site URL set correctly, but the invite link redirected to
    a Netlify 404 ("Page not found") carrying
    `#error=access_denied&error_code=otp_expired&...` in the fragment. Root
    cause: `tools/bundle.js` only ever wrote `netrunner.html`, and Netlify
    (like most static hosts) serves `index.html` for the bare root URL with
    no config — since Supabase's Site URL is just the bare origin, the
    redirect landed on a path nothing was serving. Fixed by having the build
    write `index.html` alongside `netrunner.html` (identical content); see
    "Known issue" in `docs/HOSTING.md` for full detail, including the
    separate (already-explained-by-the-error) otp_expired half of the
    symptom — that invite link was also just spent/expired and needs a
    resend regardless of the 404 fix. Rebuilt, full suite + ui-smoke re-run
    clean (248 passing), committed and pushed. **Next step for Ben:** pull,
    redeploy (or just let Netlify auto-deploy off the push), then send a
    *fresh* invite from the Supabase dashboard and click it promptly.
  - **Follow-up fix (2026-09-18):** the "My Stats" panel rendered visually
    broken (head/body side-by-side, squeezed into a corner) — `#stats` was
    missing `flex-direction: column`. Fixed in CSS; Ben confirmed it looks
    right. Committed as `13ea55e`.
- **Phase 9 (deferred cards + AI tuning): IN PROGRESS** — 2026-09-18. User
  request: finish the 3 previously-deferred cards and tune the two
  known-bad AI matchups, before starting card-art work.
  - **Datasucker 20009 (counter spending)** — fully implemented via a new
    generic hook, `script.encounterAbility` (engine/run.js), analogous to
    the corp's existing `runWindowAbility`: lets a runner card register a
    paid ability offered during ice encounter (alongside boost/break). Also
    required `iceStrength()` to read the already-generic per-instance
    `encounterStr` field (it didn't before) so spending a counter actually
    lowers the ice's strength for that encounter.
  - **Pheromones 20031 (pool spending)** — fully implemented at the engine
    level: `'hq-run'` is now a CONTEXT purpose in `poolsFor()`
    (engine/hooks.js) that matches ANY runner payment made while the
    in-progress run's server is HQ, rather than requiring a specific
    payment-type call site. No card-script changes were needed.
  - **Test Run 20042 (return-to-stack)** — fully implemented via a new
    generic one-shot delayed-trigger pattern: a per-instance
    `pendingReturnToStack` boolean (engine/state.js), set on install,
    scanned once at `endOfTurn` (engine/game.js) and resolved by moving the
    card to the top of the runner's stack if it's still installed.
  - All three cards re-added to their native-faction precon decks
    (`ai/decks.js`) with no net influence/size change: Reina gains
    Datasucker (Crypsis 2→0), Gabe gains Pheromones (Crypsis 2→1), Chaos
    Theory gains Test Run (Crypsis 1→0, Rabbit Hole 2→1). All verified
    deck-legal; `tests/decks.test.js`'s `BANNED` list is now empty.
  - **AI tuning — Jinteki PE vs Gabriel: FIXED.** Was ~8-2 corp
    (77.5%/22.5%, flatline-heavy). Root cause: Gabriel's own +2cr
    first-successful-HQ-run bonus pulls him into repeated HQ runs even as
    PE punishes every access. Fixed with two Gabriel+PE-scoped changes in
    `ai/runner.js` (an overextension penalty in `runEV()`, a higher
    draw-priority baseline in `action()` at thin grip) — scoping to
    Gabriel specifically (not "any runner vs PE") was essential; two
    earlier unscoped attempts overcorrected and collateral-damaged the
    otherwise-healthy jinteki-vs-reina/ct matchups. Final soak numbers:
    jinteki-vs-gabe ~19/21, jinteki-vs-reina ~19/21, jinteki-vs-ct ~18/22 —
    all in the game's normal variance. Full writeup: `docs/AI.md`.
  - **AI tuning — Weyland vs Reina: investigated, not fixed.** Still skews
    runner (~42.5%/57.5%). Root cause found (most Weyland barriers are ≤5
    strength regardless of rez timing, so Morning Star trivializes them
    either way — only Ice Wall is advanceable among the vulnerable pieces,
    and reaching strength 6 costs 5 clicks). A targeted fix was tried,
    measured as not improving the matchup, and reverted rather than shipped
    unproven; `ai/corp.js` has zero net diff. Left open for a future
    session with the diagnosis preserved in `docs/AI.md`.
  - Test suite: **252 passing** (added Datasucker + 2 Pheromones tests to
    `tests/cards-c.test.js`, replaced the old weak Test Run test with 2 new
    ones in `tests/cards-d.test.js`).
  - Docs updated: `docs/CARD_COVERAGE.md` (all three rows), `docs/AI.md`
    (tuning list), this file, `BUILD_PLAN.md`.
  - **Remaining Phase 9 scope** (per BUILD_PLAN's phase 9 description):
    performance pass, and real card art (`imageUrl`) — explicitly deferred
    by Ben pending a separate assessment of what's needed to expand the
    card pool into future NetrunnerDB expansions (requested alongside this
    Phase 9 work; not yet produced as of this entry).
- Then: remaining **Phase 9 — Verification & polish** items (BUILD_PLAN),
  and the card-art / expansion work once the assessment above is in hand.

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
- Browser app, single-page bundle (`netrunner.html`). ~~Runs offline on Mac~~
  — superseded 2026-09-17 (Hosted pivot): now served over http(s) with
  Supabase-backed accounts; see `docs/HOSTING.md`.
- Full **Revised Core Set** (ADN49 / pack `core2`), 132 unique cards / 247 copies
- Styled text cards now; real card images later via `imageUrl` field already on every card
- Preconstructed decks (2–3 per side); no deck builder at launch
- Rules basis: FFG Rules Reference v1.1 (PDF in project knowledge)
- Post-game feedback is rule-based analysis of the event log (not AI-generated)
- ~~Stats in localStorage + JSON export/import~~ — superseded 2026-09-17:
  stats in Supabase (Postgres), per-account, invite-only sign-in. See
  `docs/HOSTING.md`.

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
  ANALYSIS.md         ← post-game analysis architecture (Phase 7): detectors,
                        findings, review overlay
  HOSTING.md          ← Hosted pivot (Phase 8): Supabase setup, deploy, invites
engine/               ← rules engine (rng, events, state, decisions, effects,
                        game, run, db) — see ENGINE.md
cards/                ← registry.js + pilots.js + waves-a/b/c/d.js (132 cards)
ai/                   ← view/base/corp/runner/controller/decks — see AI.md
tests/                ← run-tests.js + 13 *.test.js files (248 tests)
tools/                ← soak.js (AI-vs-AI matrix), bundle.js (esbuild ->
                        netrunner.html), ui-smoke.js (jsdom bundle playthrough)
ui/                   ← browser UI (see docs/UI.md): index.html, main.js,
                        render.js, cardtext.js, logtext.js, reviewpanel.js,
                        statspanel.js, style.css
tutorial/             ← guided script + controller + hints — see TUTORIAL.md
analysis/             ← analyze.js (rule-based post-game detectors) — see ANALYSIS.md
cloud/                ← supabase.js, auth.js, stats.js — see HOSTING.md
db/                   ← schema.sql (games table + RLS) — run in Supabase, see HOSTING.md
netrunner.html        ← COMMITTED single-file build (now needs http(s) to
                        sign in — see HOSTING.md; no longer double-click-only)
index.html            ← identical copy of netrunner.html, written by the same
                        build step so static hosts serve the app at the bare
                        root URL by default (see HOSTING.md "Known issue")
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

## Hosted pivot / Phase 8 pointers (next session)
- The CODE side of the hosted pivot is done (see Status above) — what's left
  is the human-only checklist in `docs/HOSTING.md` (run `db/schema.sql`,
  lock down public signup, set the Supabase redirect URL, invite people,
  deploy, then do the first real sign-in + save-a-game test in a browser).
  Nothing else needs building until that checklist surfaces a problem.
- If it does surface a problem: the likely failure points are (a) the
  redirect URL not matching between Supabase settings and wherever it's
  actually served from (magic link sends you back to a blank/error page),
  or (b) RLS policy typos (`insert`/`select` silently return no rows/error
  rather than throwing loudly — check the browser console, `saveGame`'s
  error is logged there).
- Still not built: JSON export/import for match history (was the
  `localStorage`-era plan; less urgent now that the data lives in Postgres,
  but still nice to have as a personal backup/portability option) and any
  trend charts/streaks beyond the plain win-rate number in "My stats."
- Rebuild + verify cycle: `npm run build` then `node tools/ui-smoke.js`
  (jsdom must be resolvable: `npm install jsdom`, or `JSDOM_DIR=...` if
  installed elsewhere; esbuild likewise via `npm install` or `ESBUILD=...`;
  note `npm install <pkg>` without `--no-save` prunes anything installed
  with `--no-save` earlier in the same session, e.g. jsdom — reinstall it
  after adding a real dependency). Tests: `node tests/run-tests.js`
  (248 green); tutorial replay test breaks loudly if engine/AI changes shift
  the seed-11 tutorial game — re-author per docs/TUTORIAL.md.
- After the hosted pivot is verified live: **Phase 9 — Verification &
  polish** (BUILD_PLAN) is the last phase — see the punch list of deferred
  items called out in the Rules-audit and Phase 4/5 bullets above (three
  partially-scripted cards, two open rules-engine gaps, AI balance
  outliers, real card art).
