# Card Coverage — Revised Core (132 cards)

Status: `done` (scripted + tested), `pilot` (in cards/pilots.js), `pending`.
Simplifications MUST be noted here. Wave files: cards/waves-<a|b|c|d>.js

## Batch A (HB + Jinteki) — 32 cards

| Code | Title | Type | Status | Notes |
|------|-------|------|--------|-------|
| 20061 | Haas-Bioroid: Stronger Together | identity | done | |
| 20062 | Project Ares | agenda | done | Runner chooses order of which installed cards to trash if multiple; real rules let the runner choose but our loop resolves one trash decision at a time (no combined "choose N" prompt) — same end result. |
| 20063 | Project Vitruvius | agenda | done | |
| 20064 | Adonis Campaign | asset | done | |
| 20065 | Aggressive Secretary | asset | done | |
| 20066 | Heimdall 1.0 | ice | done | |
| 20067 | Hudson 1.0 | ice | done | Both printed copies of the identical sub set `accessLimit = 1` (idempotent), matching the printed (redundant) text. |
| 20068 | Ichi 1.0 | ice | done | |
| 20069 | Rototurret | ice | done | |
| 20070 | Viktor 1.0 | ice | done | |
| 20071 | Archived Memories | operation | done | If Archives is empty the operation still resolves (emits `search-whiffed`) with no effect, rather than being unplayable; matches "ability does nothing" ruling. |
| 20072 | Biotic Labor | operation | done | |
| 20073 | Green Level Clearance | operation | done | |
| 20074 | Shipment from MirrorMorph | operation | done | Uses `corpInstall` for each of the up to 3 installs (server target chosen by corp each time); install costs are paid normally per engine rules. |
| 20075 | Ash 2X3ZB9CY | upgrade | done | |
| 20076 | Strongbox | upgrade | done | |
| 20093 | Jinteki: Personal Evolution | identity | done | |
| 20094 | Braintrust | agenda | done | |
| 20095 | Nisei MK II | agenda | done | |
| 20096 | Project Junebug | asset | done | |
| 20097 | Ronin | asset | done | Engine's `actions` gate requires the corp card be rezzed to use its click ability; official FAQ ruling allows Ronin's ability to be used while unrezzed. Deviation: our Ronin must be rezzed first (rez is a free action, so this only changes sequencing, not affordability). |
| 20098 | Snare! | asset | done | The mandatory "Runner must reveal it" text while accessing in R&D is not separately modeled — access itself is already a logged/visible engine event, so no additional reveal step was added. |
| 20099 | Himitsu-Bako | ice | done | Implemented as a `runWindowAbility`, so per ENGINE.md it is only offered during corp run-windows (approach/server-approach) rather than as a true anytime priority-window action; per card-specific guidance this is an accepted simplification. |
| 20100 | Neural Katana | ice | done | |
| 20101 | Swordsman | ice | done | |
| 20102 | Wall of Thorns | ice | done | |
| 20103 | Whirlpool | ice | done | |
| 20104 | Yagura | ice | done | |
| 20105 | Celebrity Gift | operation | done | |
| 20106 | Neural EMP | operation | done | |
| 20107 | Trick of Light | operation | done | |
| 20108 | Hokusai Grid | upgrade | done | |

## Batch B (NBN + Weyland + neutral corp) — 40 cards

| Code | Title | Type | Status | Notes |
|------|-------|------|--------|-------|
| 20077 | Weyland Consortium: Building a Better World | identity | done | |
| 20078 | Hostile Takeover | agenda | done | |
| 20079 | Project Atlas | agenda | done | |
| 20080 | The Cleaners | agenda | done | `damageMod` is a passive hook that's live automatically once the agenda is scored (hookSources includes `g.state.corp.score`), so no explicit "interrupt" wiring was needed. |
| 20081 | Dedicated Response Team | asset | done | |
| 20082 | Elizabeth Mills | asset | done | No Location-subtype resource exists yet in Batches A/B; tests simulate one by tagging an existing resource, matching Batch A's Swordsman/AI-breaker test trick. |
| 20083 | GRNDL Refinery | asset | done | Deviation: does **not** use the engine's `actions[].trashSelf` flag. `moveCard()` zeroes `advancement` on trash, so trashing before reading the counter would always pay 0cr. `effect()` reads `it.advancement`, calls `fx.trash` itself, then pays out — same net cost/effect, just sequenced to preserve last-known-information. |
| 20084 | Archer | ice | done | **No additional-rez-cost hook exists in the engine.** `onRez` forfeits a corp-chosen scored agenda if one exists; if the Corp has none scored, rez proceeds anyway and an `archer-rez-invalid` event is emitted instead of blocking the rez (there is no `canRez` hook to prevent it). Do not rez Archer with no scored agenda against this engine — no other card in Batches A-D has an additional rez cost, so this simplification is isolated to Archer. |
| 20085 | Caduceus | ice | done | |
| 20086 | Hadrian's Wall | ice | done | |
| 20087 | Hive | ice | done | |
| 20088 | Ice Wall | ice | pilot | |
| 20089 | Shadow | ice | done | |
| 20090 | Beanstalk Royalties | operation | pilot | |
| 20091 | Punitive Counterstrike | operation | done | Trace always resolves regardless of X (matches printed text, which doesn't gate the trace itself on X > 0); 0 damage is a no-op via `fx.damage`. |
| 20092 | Shipment from Kaguya | operation | done | |
| 20109 | NBN: Making News | identity | done | Engine-wide interaction worth flagging: `engine/effects.js#pay()` auto-spends from **any** recurring-credit pool whenever the caller omits the `purpose` argument (`poolsFor`'s purpose filter is skipped when `purpose` is falsy) — so NBN's "trace only" 2 recurring credits actually get drained by *any* unpurposed corp payment (ice rez, card installs, etc.), not just traces. This is a pre-existing engine simplification (documented in ENGINE.md as "no player choice of source"), but it's stronger than the printed restriction implies. Flagging as a suspected engine-level gap; not fixed per batch rules. The card script itself (`recurring: {n:2, purposes:['trace']}`) is a faithful, minimal implementation — the leak is in the shared pay() path, not in this card's script. |
| 20110 | Project Beale | agenda | done | Deviation: `engine/effects.js#scoreAgendaFx` adds base agenda points to `g.state.corp.agendaPoints` **before** calling `onScore`, so a `bonusPoints` hook that depends on counters placed during that same `onScore` can't retroactively inflate the point total the engine already added. `onScore` therefore adds the bonus directly to `agendaPoints` as well (in addition to defining `bonusPoints`, which keeps future `agendaPointsOf()` calls — e.g. forfeiting Project Beale — correct). |
| 20111 | TGTBT | agenda | done | The "must reveal it while accessing in R&D" clause isn't separately modeled — access is already a logged/visible engine event, matching the Snare!/Ghost Branch precedent from Batch A. |
| 20112 | Ghost Branch | asset | done | |
| 20113 | Data Raven | ice | done | Per CARD_GUIDANCE: the "hosted power counter: give 1 tag" ability is usable by the Corp at any time in the real game; here it's offered only during corp run-window decisions (`runWindowAbility`), matching the Nisei MK II / Himitsu-Bako precedent from Batch A. |
| 20114 | Flare | ice | done | |
| 20115 | Pop-up Window | ice | done | The sub is modeled as an explicit Runner choice (pay 1cr or end the run) rather than an automatic pay-if-able, since the printed text leaves it to the Runner's discretion (unlike Tollbooth's mandatory encounter cost). |
| 20116 | Tollbooth | ice | done | Per CARD_GUIDANCE, the encounter cost auto-pays if the Runner is able (emits the normal `credits-spent` event) and ends the run only if they cannot. |
| 20117 | Wraparound | ice | done | |
| 20118 | Anonymous Tip | operation | done | |
| 20119 | Closed Accounts | operation | done | |
| 20120 | Psychographics | operation | done | If there is no card the Corp can advance, or X's maximum (min(tags, credits)) is 0, the operation resolves as a no-op with no decisions — matching "place 0 advancement tokens" being a legal but vacuous choice. |
| 20121 | SEA Source | operation | done | |
| 20122 | Red Herrings | upgrade | done | |
| 20123 | Bernice Mai | upgrade | done | |
| 20124 | False Lead | agenda | done | Deviation: the "Forfeit this agenda:" ability has no printed click cost and is normally usable at any time; this engine only offers scored-agenda actions during the owner's own action loop (`cardActions`), so it's modeled as a `clicks:0` corp action, usable only during the Corp's turn. Tests simulate the Runner having clicks remaining via direct state mutation since real anytime-timing isn't reachable from the corp side of this engine. |
| 20125 | Priority Requisition | agenda | done | |
| 20126 | Private Security Force | agenda | done | |
| 20127 | Melange Mining Corp. | asset | done | |
| 20128 | PAD Campaign | asset | done | |
| 20129 | Enigma | ice | pilot | |
| 20130 | Hunter | ice | pilot | |
| 20131 | Wall of Static | ice | pilot | |
| 20132 | Hedge Fund | operation | pilot | |

## Batch C (Anarch + Criminal) — 36 cards

| Code | Title | Type | Status | Notes |
|------|-------|------|--------|-------|
| 20001 | Reina Roja: Freedom Fighter | identity | done | |
| 20002 | Demolition Run | event | done | The free-trash access ability is offered via the run's `accessAbilities` mod, which is checked *before* the steal decision in `accessCard`, so it can trash an accessed agenda instead of stealing it (matches "Access -> trash the card you are accessing" applying to any accessed card). |
| 20003 | Retrieval Run | event | done | |
| 20004 | Singularity | event | done | |
| 20005 | Stimhack | event | done | Hosted credits are placed in `run.hostedCredits`, which `effects.js#pay()` already spends for the runner during any active run regardless of the payment's `purpose` — matches "hosted credits are considered to be in your credit pool" for the duration of the run. |
| 20006 | Cyberfeeder | hardware | done | |
| 20007 | Spinal Modem | hardware | done | |
| 20008 | Darwin | program | done | |
| 20009 | Datasucker | program | done | Phase 9: fully implemented, including the hosted-counter spend ability, via a new generic `encounterAbility` hook (engine/run.js) analogous to the corp's `runWindowAbility`. |
| 20010 | Force of Nature | program | done | |
| 20011 | Imp | program | done | |
| 20012 | Hemorrhage | program | done | |
| 20013 | Mimic | program | pilot | |
| 20014 | Morning Star | program | done | |
| 20015 | Ice Carver | resource | done | |
| 20016 | Liberated Account | resource | done | |
| 20017 | Scrubber | resource | done | |
| 20018 | Xanadu | resource | done | |
| 20019 | Gabriel Santiago: Consummate Professional | identity | done | This is the default runner identity used by `tests/helpers.js#makeGame`, so its "first successful HQ run each turn gains 2cr" trigger fires in most other batches' tests that run HQ with the default identity too (e.g. Sneakdoor Beta's redirect-to-HQ, and any card test that runs HQ) — accounted for explicitly in this batch's assertions. |
| 20020 | Easy Mark | event | pilot | |
| 20021 | Emergency Shutdown | event | done | |
| 20022 | Forged Activation Orders | event | done | |
| 20023 | Inside Job | event | done | |
| 20024 | Special Order | event | done | |
| 20025 | Doppelgänger | hardware | done | |
| 20026 | HQ Interface | hardware | done | |
| 20027 | Aurora | program | done | |
| 20028 | Faerie | program | done | |
| 20029 | Femme Fatale | program | done | |
| 20030 | Peacock | program | done | |
| 20031 | Pheromones | program | done | Phase 9: fully implemented. `'hq-run'` is now a CONTEXT purpose in `poolsFor()` (engine/hooks.js) matching ANY runner payment made while the in-progress run's server is HQ, rather than needing a specific payment-type call site — matches the printed "use these credits during runs on HQ" (not restricted to one cost type). |
| 20032 | Sneakdoor Beta | program | done | The server-redirect happens before `onRunSuccessful` hooks fire (`run.js` reassigns `sid` and `s.run.server` first), so Gabriel Santiago's HQ trigger and HQ Interface's access bonus both correctly apply to a Sneakdoor-redirected run; verified in this batch's test. |
| 20033 | Bank Job | resource | done | |
| 20034 | Crash Space | resource | done | |
| 20035 | Fall Guy | resource | done | Deviation (documented in-code): the printed "trash: gain 2 credits" ability has no click cost and is normally usable at any time; this engine only exposes installed-card abilities through the owner's action-menu (`script.actions`), so it's modeled as a `clicks:0` runner action — usable only during the Runner's action window, not truly "any time" (matches the Ronin/False Lead precedent from Batches A/B for anytime-timed abilities). |
| 20036 | Mr. Li | resource | done | |

## Batch D (Shaper + neutral runner) — 24 cards

| Code | Title | Type | Status | Notes |
|------|-------|------|--------|-------|
| 20037 | Chaos Theory: Wünderkind | identity | done | |
| 20038 | Diesel | event | done | |
| 20039 | Indexing | event | done | Reordering the top 5 of R&D is done via a direct splice on `g.state.corp.deck` (reordering within the same zone) rather than `moveCard`, since `moveCard` models zone-to-zone transfers, not in-place reordering. |
| 20040 | Modded | event | done | |
| 20041 | Notoriety | event | done | |
| 20042 | Test Run | event | done | Phase 9: fully implemented, including the printed "when your turn ends, if that program has not been uninstalled, add it to the top of your stack" clause. Uses a new generic one-shot delayed-trigger pattern: a per-instance `pendingReturnToStack` flag set on install, checked once at `endOfTurn` (engine/game.js), which returns the card to the top of the stack via `moveCard()` if it's still installed. |
| 20043 | The Maker’s Eye | event | done | |
| 20044 | Tinkering | event | done | |
| 20045 | Dinosaurus | hardware | done | |
| 20046 | Rabbit Hole | hardware | done | |
| 20047 | The Personal Touch | hardware | done | Deviation (documented in-code): the printed "install only on an icebreaker" restriction is not enforced as an install-target gate (no generic install-target-restriction hook for hardware exists); instead the target icebreaker is chosen via `onInstall`. If no icebreaker is installed, the install fizzles (emits `search-whiffed`) rather than being blocked outright. |
| 20048 | Battering Ram | program | pilot | |
| 20049 | Gordian Blade | program | pilot | |
| 20050 | Magnum Opus | program | done | |
| 20051 | Pipeline | program | done | |
| 20052 | Aesop’s Pawnshop | resource | done | |
| 20053 | All-nighter | resource | done | |
| 20054 | Sacrificial Construct | resource | done | |
| 20055 | Infiltration | event | done | |
| 20056 | Sure Gamble | event | pilot | |
| 20057 | Dyson Mem Chip | hardware | done | |
| 20058 | Crypsis | program | done | |
| 20059 | Armitage Codebusting | resource | done | |
| 20060 | Underworld Contact | resource | done | |