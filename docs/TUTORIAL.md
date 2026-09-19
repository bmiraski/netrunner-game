# Tutorial Architecture (Phase 6)

How tutorial mode works and how to re-author it. Companion to `docs/UI.md`
(decision renderer) and `docs/ENGINE.md` (decision protocol).

## Core idea: the tutorial is a constrained decision stream

The engine's prompt system drives everything, so the tutorial always reflects
real rules (BUILD_PLAN Phase 6). Tutorial mode is a normal game — fixed decks
(`hb-core` vs `gabe-core`), fixed seed (11), Corp AI standard with a fixed
seed — plus a script that, while active, restricts each runner decision to
the single taught option and shows an overlay callout explaining why.
Determinism makes this sound: fixed seed + deterministic Corp AI + forced
runner answers ⇒ the exact same game every time.

```
tutorial/
  steps.js      GUIDED_STEPS (the authored script) + EVENT_CALLOUTS + seed/decks
  tutorial.js   TutorialController: wraps Game + AIController(corp), validates
                each step against the live decision, tracks progress
  hints.js      hintFor(game): asks a hard-level RunnerAI what it would do,
                phrased as a suggestion (always legal by construction)
```

## The guided script (steps.js)

14 steps covering: keep hand → Sure Gamble (clicks & credits) → install
Peacock (icebreakers, MU) → draw → click-for-credit → run undefended remote →
trash PAD Campaign (access & trash costs) → run R&D → click-break Viktor 1.0
twice (ice, subroutines, bioroids) → continue to access → Project Ares stolen
(win condition) → final step releases control (allow: null) into free play.

Each step has `match` (context tag / prompt substring, validated against the
live decision) and `allow` (option id or label substring — the one permitted
choice). If validation ever fails, `mismatch` is recorded and the tutorial
degrades gracefully to free play — the UI never dead-ends.

`EVENT_CALLOUTS` are one-time reactive lessons keyed on log event types
(corp scores, tags, damage, trace, run-ends-sub, purge) — they teach
corp-driven concepts whenever they first actually happen, guided or not.

## UI integration (ui/main.js, ui/render.js)

- Setup screen: "Tutorial — learn to play" button → `app.startTutorial()`.
- `app.allowedId()` gates everything: non-taught prompt buttons render
  disabled (`.opt-locked`), the taught one pulses gold (`.opt-taught`),
  board-click targets are filtered to the taught option, and `app.answer()`
  rejects anything else — so keyboard/popover paths are safe too.
- `#callout` panel (sidebar, above the prompt): guided step callouts with a
  step counter; queued event callouts (dismiss with "Got it") take priority;
  in free play it becomes the Hint panel.
- Hints: `hintFor` runs the hard RunnerAI on the pending decision and shows
  "Suggestion: <option label>". Cleared after each answer.

## Re-authoring after engine/AI changes

`tests/tutorial.test.js` replays the whole guided script and fails on any
mismatch — an engine, AI, or deck change that shifts the tutorial game breaks
the build visibly. To re-author: run `data/tmp/trace-tutorial.mjs` (gitignored
probe; recreate from this doc's companion history if missing) or write a
10-line trace loop: force answers, print each runner decision, adjust
`GUIDED_STEPS` to the new reality. Seed selection: probe openings for
Sure Gamble + breakers in the runner's first hand.

## Verification

- `tests/tutorial.test.js` (5 tests): clean replay, lesson coverage
  (Sure Gamble / Peacock / PAD Campaign trash / Viktor rez / 2 sub breaks /
  Ares steal, 2 pts), event-callout once-only semantics, hint legality over
  40 free-play decisions, EVENT_CALLOUTS key validity.
- `tools/ui-smoke.js` tutorial mode: clicks through the BUILT bundle — guided
  portion via the only-enabled buttons, then random free play to game over;
  asserts callouts rendered throughout.
