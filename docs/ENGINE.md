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
`runStep`, `scoreWindow`, `discard`, `setup`, `trace`, `psi`, `installTarget`.

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
`runner-hosted` is a Genesis-added zone: cards hosted on Personal Workshop,
tracked with power counters (install cost) that tick down by a paid action
or automatically each turn, auto-installing at 0.

## Key modules
- `effects.js` — gainCredits/pay/canPay (bad-publicity pool aware), draw,
  trash, damage* (meat/net/core, flatline), addTags/removeTag, trace*,
  psiGame* (Snowflake, Bullfrog: both sides yield a 0/1/2cr bet back-to-back
  with no payment/event emitted until AFTER both have committed, so neither
  side's pick is visible — even in the log — before both are locked in;
  returns true if the bets differed, matching the printed "if different"
  wording), scoreAgenda/stealAgenda, win, purgeVirus, discardToHandSize*.
  (* = generator; call with `yield*`)
- `game.js` — mulligans, corp/runner turns, action menus, installs
  (ice cost scaling, MU + trash-for-room, uniqueness, install-over),
  score windows (before/after every corp action).
- `run.js` — run timing per Rules Reference: approach (jack-out from 2nd
  approach) → corp rez window → encounter (breaker menu, then unbroken subs
  in order) → approach server → mandatory jack-out decision (offered here too,
  even against an unprotected server or once all ice is passed) → content rez
  window → successful → access. Access: HQ random (seeded), R&D top-in-order,
  Archives and remote servers let the Runner choose the access order when
  more than one card is there (Rules Reference 5.5). Steal is mandatory;
  trashCost offers paid trash.

## Card scripts (cards/registry.js)
`define(code, script)` — keyed by NRDB code. Hooks (all optional, `*` = generator
receiving `(g, ctx)`). Hook sources scanned automatically (engine/hooks.js):
corp identity, rezzed corp installed, scored agendas, runner identity, runner
installed. Register scripts via a `register*(db)` pattern (see cards/pilots.js).

```
// events & operations (UNSCRIPTED ONES ARE UNPLAYABLE — script all 33)
onPlay*(g,{instId})        effect; cost + click already paid
canPlay(g)                 extra play condition (SEA Source, Neural EMP)
extraClickCost: 1          Celebrity Gift / Singularity additional click
skipAutoDiscard: true      (one-off instance flag, set from onPlay) lets an
                           event opt out of the post-play auto-discard —
                           Networking re-adding itself to the grip

// resources & hardware (installable any time, not gated like events)
canInstall(g)              extra install condition, mirrors canPlay — Data
                           Leak Reversal (only after a central-server run)

// ice
subroutines: [{label, resolve*(g,{iceId})}]   end run: g.state.run.ended = true
onEncounter*(g,{iceId})    Tollbooth, Data Raven, Pop-up Window
activeSubIndices(g,it)     Hive — which printed subs are live
strengthBonus(g,it)        Ice Wall/Hadrian's/Shadow adv counters; Wraparound
clickBreak: true           bioroid "lose click to break 1 sub"
blocksAI: true             Swordsman
advanceable: true          advanceable non-agendas (also assets GRNDL etc.)

// icebreakers
breaker: {types:['barrier'|'code-gate'|'sentry'|'all'],
          boost:{cost,amount,duration:'run'|'encounter'},
          breakCost:{cost, count:N|'all'}}
onEncounterEndIfUsed*(g,{instId})   Faerie trash, Crypsis counter upkeep
bypassAbility: {req(g,it,iceId), cost(g,iceId), effect not needed}  Femme

// triggers
onTurnStart*(g,{instId})   PAD, Adonis, Aesop's, Darwin (owner's turn only)
onTurnEnd*(g,{instId})     fires for the active player at their own turn end
                           (after discard, before the turn-end log event);
                           no card uses this yet
onRunSuccessful*(g,{server,instId})       Gabriel, Datasucker, Hemorrhage
onRunSuccessfulHere*(g,{server,instId})   upgrades: Ash, Bernice, Hokusai
onRunEnd*(g,{server,successful,instId})   DRT, Doppelgänger (queue follow-up:
                                          g.state.run.followUp = [{server}])
onPlayOperation*(g,{operationId})         Weyland BaBW (check subtypes)
onAgendaScored*/onAgendaStolen*(g,{agendaId})  Jinteki: PE
onScore*/onSteal*(g,{instId})   this agenda scored/stolen (Hostile Takeover,
                                Atlas/Vitruvius/Nisei counters)
onRez*(g,{instId})         Elizabeth Mills
onInstall*(g,{instId})     Bank Job load, Imp counters, Rabbit Hole search
onAccess*(g,{instId,server})   ambushes (Snare!, Junebug) — corp pay decision
onTraceResolved*(g,{success,instId,ctx})   Spinal Modem
onIceRezzed*(g,{iceId})    broadcast to ANY card, not just the ice's own
                           onRez (Compromised Employee)
onIceInstalled*(g,{iceId}) broadcast on install, before rez (Amazon
                           Industrial Zone's discount-rez-it offer)
onHardwareInstalled*(g,{instId})  broadcast on hardware install (Replicator
                           searches the stack for a second copy)
approachAbility: {label, req(g,it), effect*}   Snitch, Midori — offered
                           while approaching the ice (may end in jack-out)
traceInterrupt(g,it,{traceCtx})   Disrupter: reduce a trace's base
                           strength to 0 before it resolves

// numeric modifiers (plain functions returning a number)
rezCostMod(g,it,target)    Xanadu +1 ice, Reina first-ice +1 (use
                           g.state.flags.turn.iceRezzed===0), Braintrust -1
iceStrengthMod(g,it,ice)   Ice Carver (check g.state.run?.encounterIce===ice.id)
breakerStrengthMod(g,it,breaker)  Personal Touch (breaker.hostId===it.id? no —
                           PT is hosted ON breaker: check breaker.id===it.hostId)
damageMod(g,it,type)       The Cleaners (+1 meat, corp scored)
linkMod(g,it)              Dyson Mem Chip, Rabbit Hole
memoryMod: 1               +MU hardware/identities (plain number)
hqAccessMod/rdAccessMod(g,it)   HQ Interface / R&D access bonuses
advReqMod(g,it)            agenda advancement requirement modifier
bonusPoints(g,it)          Project Beale extra points
rezCostBumps(g,it,target)  targeted, until-end-of-turn rez cost increase
                           (Cortez Chip) or discount (Amazon Industrial Zone)
memoryCostOverride(g,it)   0 MU at 2+ link (ZU.13 Key Master, Creeper)
handSizeMod(g,it)          Public Sympathy, NBN: The World is Yours
startingHandSize: 9        per-identity opening-hand override (default 5;
                           applies to the mulligan redraw too) — Andromeda
trashCostMod(g,it,target)  +1 trash cost to every installed card while
                           rezzed, including itself (Encryption Protocol)
extraRunClickCost(g,it,sid)  running its server costs an extra [click]
                           (Ruhr Valley)

// economy / pools
recurring: {n, purposes:[...]}  refilled each owner turn; purposes:
   'icebreaker','trace','trash','virus-install','hq-run','remove-tag',
   'install-hardware' (Inside Man), 'advance-ice' (Weyland: BaBW),
   'advance-here' (Simone Diego, own server's root/protecting ice),
   'rez-ice' (TMI, Dedicated Server, Net Police)
   (n may be a function(g,it) — Pheromones, Net Police [Runner's link])

// installed-card click abilities (appear in action menus)
actions: [{label|label(g,it), clicks=1, credits=0, trashSelf, once,
           req(g,it), effect*(g,{instId})}]
   Magnum Opus, Armitage, Liberated, Melange (clicks:3), Ronin, GRNDL...

// prevention / protection
preventDamage: {types:['meat'], amount:3, trashSelf:true}   Crash Space
   (also: auto:true + perTurn for an automatic once-per-turn prevention
   with no decision — Muresh Bodysuit)
preventTrash:  {types:['resource','program','hardware']}    Fall Guy, Sac Con
preventTag: {cost}         generator hook, interrupt -> pay to prevent 1 tag
                           (New Angeles City Hall; trashes itself onSteal)

// access / steal shaping
stealCost: {credits:5} | {clicks:1}    Red Herrings, Strongbox (persistent
   after mid-run trash: push onto g.state.run.extraStealCosts in a trash hook)
   — an AGENDA may also set its own stealCost directly (Fetal AI: 2cr),
   read by stealDecision alongside server upgrades/extraStealCosts
accessAbility: {label, req(g,it,{accessedId}), effect*}     Imp
insteadOfBreach: {label, appliesTo(g,sid), effect*}         Bank Job
runWindowAbility: {label(g,it), req(g,it), effect*}         Nisei counter,
   Himitsu-Bako (corp-side, offered during run windows)

// hosting / consoles
memoryMod, canHostBreaker:true, hostedMemoryFree:true       Dinosaurus
hostOn (via onInstall assigning it.hostId)                  The Personal Touch
Consoles: 'Console' subtype auto-enforced (limit 1)

// misc engine services (import from engine/effects.js and engine/hooks.js)
fx.gainCredits/pay/canPay(g,player,n,purpose)  fx.draw  fx.trash
fx.trashWithPrevention*  fx.damage*(g,type,n,why,{unpreventable})
fx.addTags/removeTag  fx.addBadPublicity/removeBadPublicity
fx.trace*(g,base,ctx)  fx.expose/derez  fx.rezFx*(g,id,{ignoreCost})
fx.scoreAgendaFx*/stealAgendaFx*/forfeit  fx.searchAndPick*/shuffleDeck
hooks.oncePerTurn(g,key)  corpInstall*/runnerInstall*(g,id,{free}) from game.js
doRun*(g,sid,mods) from run.js — run-event mods: accessBonus,
   insteadOnSuccess*/insteadLabel, bypassFirstEncounter, hostedCredits,
   changeServerOnSuccess, onEnd*, accessAbilities[]
Useful flags: g.state.flags.turn.{runsMade,successfulRuns,stolen,iceRezzed,
   tinkered,virusProgramsGained}  g.state.flags.lastRunnerTurn.{ranServers,
   successfulRuns,stolenPoints}
fx.psiGame*(g,ctx)  simultaneous secret 0/1/2cr bid from both sides,
   revealed together — no payment/event emitted until both commit; returns
   true if the bets differed (Snowflake, Bullfrog)
```

## Tests (tests/)
`node tests/run-tests.js` (node ≥18). Each `*.test.js` default-exports
`[[name, fn], ...]`. Use `makeGame({seed, corp:[[title,qty]...], runner:[...]})`
and `driver(game)`: `.pick(id) .label(substr) .prefix(idPrefix) .num(n)
.keepHands() .creditsOut(player) .discardFirst()`. Direct state mutation for
setup is sanctioned (credits, moveCard); assert outcomes via the event log
(`lastEvent(game, type)`). Remember: corp hand is 6 after mandatory draw —
turns with no plays end in a discard decision.

## Known engine-level simplifications (documented; card notes in CARD_COVERAGE.md)
- Recurring-credit / bad-publicity / Stimhack pools auto-spend before real
  credits (no player choice of source)
- Trigger order is fixed (hook-source scan order), no player ordering choice
- Corp mid-run windows: rez approached ice, rez attacked server content, and
  scripted runWindowAbility cards only
- "May" triggers that are strictly beneficial auto-resolve (PAD, Gabriel)
- Region limit ("Limit 1 region per server") IS enforced (Genesis Cycle):
  `corpInstall()` filters out any server whose content already includes an
  installed Region-subtype upgrade (a brand-new remote is always legal) —
  a generic filter, not a per-card hook, same shape as the existing
  uniqueness check. Covers Hokusai Grid plus the three Genesis regions
  (ChiLo City Grid, Amazon Industrial Zone, Ruhr Valley).
