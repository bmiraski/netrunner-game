# AI Architecture (Phase 4)

How the Corp and Runner AIs work and how to tune them. Written so a future
session can adjust behavior without re-deriving the design. Companion to
`ENGINE.md` (decision protocol) and `PROJECT_NOTES.md` (status).

## Core idea: AIs are decision-answering functions

The engine yields decision objects (`ENGINE.md`); an AI is just an object
with `.side` and `.decide(game, decision) -> answer`. No game loop of its
own, no engine hooks — one protocol serves human UI, AI, tutorial, and tests
identically, so a human can take either seat (or both, or neither).

```
ai/
  base.js        BaseAI: handler routing, generic fallback, difficulty LEVELS
  view.js        imperfect-information helpers (the ONLY way AIs read state)
  corp.js        CorpAI
  runner.js      RunnerAI
  controller.js  AIController (binds AIs to a Game) + autoplay()
  decks.js       8 precon decks (4 corp / 4 runner) + gameConfig()
  index.js       re-exports
```

### Decision routing (base.js)

`decide()` tries, in order:
1. **handlers** — matched on decision context tags (`actionMenu`, `runStep`,
   `scoreWindow`, `trace`, `discard`, `installTarget`, `setup`, `hosting`).
2. **cardPrompts** — regex on `decision.prompt` for card-script decisions
   (Archer forfeit, Celebrity Gift reveals, Snare! pay, Femme target, ...).
3. **generic fallback** — never throws, always legal: prefers affirmative
   option ids (`yes`/`use`/`pay`), avoids passive ones (`cancel`/`no`/...),
   answers `number` decisions with `min`.

Handler errors are caught, recorded on `game.aiErrors`, and fall through to
the fallback — an AI bug can degrade play but can never crash a game. Soak
tests assert `aiErrors` stays empty.

### Determinism

AIs are deterministic given (level, seed, game state). They use their OWN
`createRng` seed — never `g.rng`, which would desync the engine's shuffle/
access stream and break the replay contract. `autoplay()` twice with the same
config produces identical `game.history` (tested).

### Imperfect information (view.js)

Engine state is fully visible in memory, so honesty is enforced by
convention: **heuristic code only reads state through `ai/view.js`**, which
exposes exactly what a player could legally see. Runner sees rezzed ice
stats/subs, faceup cards, advancement counts, corp credits and hand COUNT —
never unrezzed ice identity, corp hand contents, or R&D order. Corp sees the
whole (faceup) rig and runner credits — never grip contents. If you add
heuristics, go through view.js or extend it; don't read `g.insts` hidden
fields directly from corp.js/runner.js.

Useful view helpers: `costToBreak(g, iceId)` (cheapest full break with the
current rig), `iceDanger`/`subThreat` (classify sub labels: kill > trash >
damage > tag > etr), `optionInst(g, optId)` (resolve option ids like
`score:12` / `d:17` to card instances).

## CorpAI strategy (corp.js)

Score-based action menu: every candidate action gets a score, highest wins
(`maybeBlunder` may take 2nd-best at standard level). Key lines of play:

- **Economy discipline**: econ operations early; clicks for credits "with
  purpose" (banking toward an unaffordable econ op or a needed ice rez —
  hard level only: `level.saveDiscipline`). Never installs ice it can't
  plausibly rez (unrezzed ice is cardboard): poverty and 3+ unrezzed ice
  reduce ice-install scores.
- **One scoring remote**: best-iced remote NOT containing an asset. Assets
  always go to their own new remotes. Agendas are only installed when the
  scoring remote is defended AND the bank covers rez + advancement
  (`defenseCost()` gate). Traps (advanceable non-agendas) get bluff
  advancement when protected.
- **Ice placement** (`weakestServer()`): urgency-weighted — remotes holding
  agendas > centrals (more if runner hit them last turn) > empty
  future-scoring remote (if holding agendas) > asset remotes; archives only
  if it holds stealable agendas; caps at 3 ice per server.
- **Score windows**: always scores, highest points first.
- **Rez decisions** (run windows): rez approached ice when affordable and
  the server matters; **Archer is never rezzed without a scored agenda**
  (the engine does not gate this — see CARD_COVERAGE.md; the AI check in
  `rezIce()` is the required guard, and Priority Requisition's free-rez
  prompt also excludes Archer so it can't eat the just-scored agenda).
- **Traces**: guarantee-or-fold — boosts exactly enough to beat
  link + runner credits when affordable, else 0 (standard bluffs up to 2).
- **Punishment**: Scorched Earth at ≤4 grip, Neural EMP at ≤1 grip, Closed
  Accounts vs rich tagged runner, resource trashing, SEA Source only with a
  follow-up in hand. Purges at 3+ virus counters.
- **Discard**: keeps agendas (Archives is stealable) and ice; tosses
  situational operations first (`handValue()`).

## RunnerAI strategy (runner.js)

- **Run EV model** (`runEV`): value per server (advanced remote cards 55–75,
  R&D 28, HQ 24 + Gabriel bonus, archives 90 if faceup agendas else 4,
  faceup trashable assets +14) minus break costs (×1.6 hard / ×2.2 standard)
  minus facecheck risk. Only clearly-positive EV (>4) runs are proposed.
  - Unrezzed ice threatens only while the corp's `rezBudget` lasts (~4cr per
    rez assumed) — stacked ice over a broke corp is read as a bluff.
  - Repeat-run fatigue: R&D −45 (top card unchanged until corp draws!),
    HQ −20, remotes −25 per run already made this turn.
  - Desperation: corp at 5+ points adds +18 to central/high-value runs.
  - Jinteki PE respect: facedown remotes at ≤2 grip lose 50 value; hidden
    ice risk scales up vs Jinteki with a thin grip (`hiddenIceRisk`, hard
    level only: `level.riskAware`).
- **Encounters**: break with the cheapest at-strength breaker; boost only
  when finishing the break is affordable; click through bioroids; tanks
  pure-ETR ice unless the server is worth it (`worthBreakingEtr`); breaks
  the scariest sub first when count-limited (kill > trash > damage > tag).
- **Jack-out**: leaves when remaining rezzed ice is unpayable, is a pure-ETR
  wall, or (hard) when danger is high with a thin grip.
- **Economy/rig**: Sure Gamble/Magnum Opus/Armitage prioritized when poor;
  breakers installed by coverage need (uncovered rezzed ice types first);
  MU-aware (won't propose installs that don't fit unless clearly upgrading);
  never trashes a better program for MU room (cancels instead).
- **Tags**: cleared urgently when resources are installed or the corp is
  rich; traces beaten exactly (ts+1−link) when cheap, released when not.
- **Access**: always steals (pays steal costs); trashes assets ≤3cr freely,
  ≤5cr with a cushion (hard trashes deeper — economy denial).

## Difficulty levels (base.js LEVELS)

| knob | standard | hard |
|---|---|---|
| noise (2nd-best action chance) | 0.25 | 0 |
| credit reserve | 1 | 3 |
| saveDiscipline (corp banks with purpose) | off | on |
| riskAware (runner respects facecheck) | off | on |
| runner cost weight / trash depth / trace spend | looser | tighter |

Measured (40 games/config, mixed matchups): corp wins 50–60% everywhere;
hard corp > standard corp; hard-vs-hard ≈ 52%.

## Playing games

```js
import { autoplay, AIController, CorpAI, RunnerAI, DECKS, gameConfig } from './ai/index.js';
// AI vs AI:
const { game, result } = autoplay({ cardsJson, seed: 7, corpDeck: 'nbn-core',
  runnerDeck: 'ct-core', corpLevel: 'hard', runnerLevel: 'standard' });
// Human runner vs AI corp (Phase 5 UI):
const g = new Game(cardsJson, gameConfig('hb-core', 'gabe-core', seed));
const ctl = new AIController(g, { corp: new CorpAI({ level: 'hard', seed }) });
ctl.run();          // answers corp decisions, stops at the runner's turn
// ... UI answers runner decision via g.choose(...), then ctl.run() again.
```

`node tools/soak.js [nSeeds] [corpLevel] [runnerLevel]` — full matchup table
(wins, flatlines, decked, stalls, aiErrors); exit 1 on any stall/aiError.

## Precon decks (ai/decks.js)

8 decks (4 corp, 4 runner), one per identity, single-core-box legal
(tests/decks.test.js verifies size, influence, quantity caps, agenda points,
in-faction agendas). Archer IS included (AI-gated, above). Phase 9 closed
the three remaining engine gaps that had excluded cards from these decks —
Datasucker 20009, Pheromones 20031, and Test Run 20042 are now fully
implemented (see CARD_COVERAGE.md) and included in their native-faction
precons (Reina: Datasucker; Gabe: Pheromones; Chaos Theory: Test Run), with
no net influence/size change. The Genesis Cycle pass later added a new 8th
precon, `andromeda-core` (Andromeda: Dispossessed Ristie), built entirely
from the Criminal + neutral-runner pool at 0 influence — see the matchup
soak below.

## Known limitations / Phase 9 tuning list

- **Jinteki PE vs Gabriel — FIXED.** Skewed corp ~8-2 (77.5% corp win rate
  over a soak run), flatline-heavy: Gabe's own +2cr HQ-run bonus pulled him
  into repeated HQ runs even as PE's damage-per-agenda made every one of
  those runs riskier than for other runners. Root cause was Gabriel-specific
  (his identity bonus, not "any runner vs PE" — other identities don't have
  the same built-in pull toward over-running HQ). Fixed in `ai/runner.js`
  with two changes, both scoped to `corpIdentity().includes('Personal
  Evolution') && identityTitle().startsWith('Gabriel')`:
  - `runEV()`: an overextension penalty (−25 at grip ≤1, −12 at grip ≤2) on
    top of the existing PE facedown-remote penalty.
  - `action()`: a higher draw-priority baseline at thin grip (45 at ≤2 cards)
    so Gabriel draws back up instead of chasing HQ credits into a flatline.
  Two earlier unscoped attempts (larger magnitudes, no Gabriel/PE gating)
  overcorrected the target matchup past 50/50 the wrong way and collateral-
  damaged the previously-healthy jinteki-vs-reina and jinteki-vs-ct
  matchups; the final Gabriel-scoped version leaves those untouched.
  Soak result (post-fix): jinteki-vs-gabe ~19/21 (47.5%/52.5%),
  jinteki-vs-reina ~19/21, jinteki-vs-ct ~18/22 — all within the game's
  normal matchup variance.
- **Weyland vs Reina — investigated, not fixed.** Skews runner (~42.5%/
  57.5%). Hypothesis was that Weyland could value advanceable-ice rez
  timing better against Morning Star (flat 1cr-per-sub, strength-5
  breaker). Root-caused instead: most of Weyland's barrier suite is ≤5
  strength regardless of rez/advance timing, so Morning Star trivializes it
  either way — only Ice Wall is advanceable among the vulnerable pieces,
  and reaching strength 6 costs 5 clicks, which isn't a lever the AI can
  realistically pull turn-to-turn. Tried a targeted ice-type-preference
  reorder in `ai/corp.js` (prefer non-barrier ice vs Reina), scoped to
  Weyland-vs-Reina only after an unscoped first attempt collateral-damaged
  hb/jinteki-vs-reina; even correctly scoped, it showed no measurable
  improvement to the target matchup (16/24 vs. the 17/23 baseline —
  statistically indistinguishable, if anything slightly worse). Reverted
  rather than ship a non-improving change; `ai/corp.js` has zero net diff
  from before this investigation. Left open for a future session — the
  diagnostic groundwork above (strength distribution, the Ice Wall
  exception) should save re-deriving it from scratch.
- **Andromeda (new 8th precon) vs all 4 corp decks — soak-tested, healthy,
  no tuning needed.** `tools/soak.js 20 standard standard` and `20 hard
  hard` both showed every andromeda-core row within normal variance (no
  stalls, no aiErrors, 640 games total across the two runs). The one row
  that looked skewed at 20 seeds — weyland-core vs andromeda-core, 65%/35%
  corp at hard/hard — was re-run at 60 seeds/hard-hard per matchup and
  settled to 53.3%/46.7%, i.e. sampling noise, not a real skew: at n=20 the
  binomial standard error is ~11%, so a 65/35 read is under 1.5 SE from
  50/50. All four andromeda-core matchups landed in the 51.7%-56.7% corp
  range on the 60-seed runs — comparable to or tighter than the
  already-accepted jinteki-vs-gabe/reina baselines above. No AI or deck
  change made for this matchup.
- Corp never intentionally over-advances traps beyond 3, and never
  double-installs upgrades; Runner ignores Sneakdoor-style redirect value in
  runEV (plays it fine when scripted mods fire, just doesn't seek it).
- No multi-turn planning (each decision is scored fresh); `intent` only
  bridges install → install-target.
