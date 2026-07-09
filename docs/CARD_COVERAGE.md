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
| 20001 | Reina Roja: Freedom Fighter | identity | scripted (tests pending) | |
| 20002 | Demolition Run | event | scripted (tests pending) | |
| 20003 | Retrieval Run | event | scripted (tests pending) | |
| 20004 | Singularity | event | scripted (tests pending) | |
| 20005 | Stimhack | event | scripted (tests pending) | |
| 20006 | Cyberfeeder | hardware | scripted (tests pending) | |
| 20007 | Spinal Modem | hardware | scripted (tests pending) | |
| 20008 | Darwin | program | scripted (tests pending) | |
| 20009 | Datasucker | program | scripted (tests pending) | |
| 20010 | Force of Nature | program | scripted (tests pending) | |
| 20011 | Imp | program | scripted (tests pending) | |
| 20012 | Hemorrhage | program | scripted (tests pending) | |
| 20013 | Mimic | program | pilot | |
| 20014 | Morning Star | program | scripted (tests pending) | |
| 20015 | Ice Carver | resource | scripted (tests pending) | |
| 20016 | Liberated Account | resource | scripted (tests pending) | |
| 20017 | Scrubber | resource | scripted (tests pending) | |
| 20018 | Xanadu | resource | scripted (tests pending) | |
| 20019 | Gabriel Santiago: Consummate Professional | identity | scripted (tests pending) | |
| 20020 | Easy Mark | event | pilot | |
| 20021 | Emergency Shutdown | event | scripted (tests pending) | |
| 20022 | Forged Activation Orders | event | scripted (tests pending) | |
| 20023 | Inside Job | event | scripted (tests pending) | |
| 20024 | Special Order | event | scripted (tests pending) | |
| 20025 | Doppelgänger | hardware | scripted (tests pending) | |
| 20026 | HQ Interface | hardware | scripted (tests pending) | |
| 20027 | Aurora | program | scripted (tests pending) | |
| 20028 | Faerie | program | scripted (tests pending) | |
| 20029 | Femme Fatale | program | scripted (tests pending) | |
| 20030 | Peacock | program | scripted (tests pending) | |
| 20031 | Pheromones | program | scripted (tests pending) | |
| 20032 | Sneakdoor Beta | program | scripted (tests pending) | |
| 20033 | Bank Job | resource | scripted (tests pending) | |
| 20034 | Crash Space | resource | scripted (tests pending) | |
| 20035 | Fall Guy | resource | scripted (tests pending) | |
| 20036 | Mr. Li | resource | scripted (tests pending) | |

## Batch D (Shaper + neutral runner) — 24 cards

| Code | Title | Type | Status | Notes |
|------|-------|------|--------|-------|
| 20037 | Chaos Theory: Wünderkind | identity | pending | |
| 20038 | Diesel | event | pending | |
| 20039 | Indexing | event | pending | |
| 20040 | Modded | event | pending | |
| 20041 | Notoriety | event | pending | |
| 20042 | Test Run | event | pending | |
| 20043 | The Maker’s Eye | event | pending | |
| 20044 | Tinkering | event | pending | |
| 20045 | Dinosaurus | hardware | pending | |
| 20046 | Rabbit Hole | hardware | pending | |
| 20047 | The Personal Touch | hardware | pending | |
| 20048 | Battering Ram | program | pilot | |
| 20049 | Gordian Blade | program | pilot | |
| 20050 | Magnum Opus | program | pending | |
| 20051 | Pipeline | program | pending | |
| 20052 | Aesop’s Pawnshop | resource | pending | |
| 20053 | All-nighter | resource | pending | |
| 20054 | Sacrificial Construct | resource | pending | |
| 20055 | Infiltration | event | pending | |
| 20056 | Sure Gamble | event | pilot | |
| 20057 | Dyson Mem Chip | hardware | pending | |
| 20058 | Crypsis | program | pending | |
| 20059 | Armitage Codebusting | resource | pending | |
| 20060 | Underworld Contact | resource | pending | |