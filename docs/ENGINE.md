# Engine Architecture (Phase 2)

How the rules engine works and how to extend it. Written so a smaller model
can script cards (Phase 3) without re-deriving the design. Read alongside
`PROJECT_NOTES.md`.

## Core idea: generators + decisions
All rules logic is written as JS **generator functions** that `yield` decision
objects and receive the answer back. `Game` (engine/game.js) drives the
generator; `game.decision` is the pending decision, `game.choose(answer)`
resumes. One protocol serves human UI, AI, tutorial, and tests.

Decision kinds (engine/decisions.js):
- `options`: `{player, prompt, options: [{id, label, ...}]}` → answer = option id
- `number`: `{player, prompt, min, max}` → answer = integer

Decisions carry context tags used by controllers/tests: `actionMenu`,
`runStep`, `scoreWindow`, `discard`, `setup`, `trace`, `installTarget`.

**Determinism contract:** seed + answer history replays the game exactly
(`game.history`). Never call `Math.random()`; use `g.rng`. Never mutate state
outside an engine/effect/card-script path — everything observable must emit an
event on `g.log`.

## The `g` context
`{db, rng, log, insts, state}` (engine/state.js). `insts[id]` = card instance:
`{id, code, card, zone, rezzed, faceup, advancement, counters, encounterStr,
brokenSubs, installedTurn}`. `state` holds both players, servers, run state.
Zones are strings (see state.js header comment); `moveCard(g, id, zone)` is
the ONLY way to move cards. Ice arrays: index 0 = innermost, push = outermost.

## Key modules
- `effects.js` — gainCredits/pay/canPay (bad-publicity pool aware), draw,
  trash, damage* (meat/net/core, flatline), addTags/removeTag, trace*,
  scoreAgenda/stealAgenda, win, purgeVirus, discardToHandSize*.
  (* = generator; call with `yield*`)
- `game.js` — mulligans, corp/runner turns, action menus, installs
  (ice cost scaling, MU + trash-for-room, uniqueness, install-over),
  score windows (before/after every corp action).
- `run.js` — run timing per Rules Reference: approach (jack-out from 2nd
  approach) → corp rez window → encounter (breaker menu, then unbroken subs
  in order) → approach server → content rez window → successful → access.
  Access: HQ random (seeded), R&D top-in-order, Archives all faceup,
  remotes all content. Steal is mandatory; trashCost offers paid trash.

## Card scripts (cards/registry.js)
`define(code, script)` — keyed by NRDB code. Hooks (all optional, `*` = generator):
```
onPlay*(g, {instId})      event/operation effect (cost already paid, click spent)
canPlay(g)                extra playability predicate (else card unplayable!)
subroutines: [{label, resolve*(g, {iceId})}]
breaker: {types:[...], boost:{cost,amount}, breakCost:{cost,count}}
strengthBonus(g, inst)    extra ice strength (e.g. Ice Wall advancements)
advanceable: true         advanceable non-agenda
onAccess*/onInstall*/onScore*   wired; more hooks land in Phase 3
```
IMPORTANT: events/operations WITHOUT a script never appear in action menus —
Phase 3 must script all 33 of them. Installables work unscripted (vanilla).
Register scripts via a `register*(db)` function pattern (see cards/pilots.js).

To end a run from a subroutine: `g.state.run.ended = true`.
Breaker subtype matching: lowercase, spaces→dashes ('Code Gate'→'code-gate');
`types:['all']` matches anything (AI breakers).

## Tests (tests/)
`node tests/run-tests.js` (node ≥18). Each `*.test.js` default-exports
`[[name, fn], ...]`. Use `makeGame({seed, corp:[[title,qty]...], runner:[...]})`
and `driver(game)`: `.pick(id) .label(substr) .prefix(idPrefix) .num(n)
.keepHands() .creditsOut(player) .discardFirst()`. Direct state mutation for
setup is sanctioned (credits, moveCard); assert outcomes via the event log
(`lastEvent(game, type)`). Remember: corp hand is 6 after mandatory draw —
turns with no plays end in a discard decision.

## Known simplifications (fix in Phase 3, tracked in CARD_COVERAGE.md)
- Battering Ram breaks 1 sub per payment (card says "up to 2")
- Paid-ability windows are minimal (breakers + rez windows only)
- Corp can only rez the approached ice / attacked server's content mid-run
- No on-successful-run / turn-start-trigger hooks wired yet (PAD Campaign
  doesn't pay out, identities do nothing, etc.)
- Region/console limits not enforced (no such cards scripted yet)
