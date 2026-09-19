# Card Base Expansion — Inputs Assessment

**Purpose:** before starting card-art work, assess what would be needed to grow
the card pool beyond the Revised Core Set (132 cards / ADN49) into
NetrunnerDB's later expansions. This is a planning document, not an
implementation — nothing here has been built. Written 2026-09-18, based on
the current state of NetrunnerDB, Null Signal Games (NSG), and this repo's
existing data pipeline (`data/build_cards.py`).

## 1. The card pool landscape today

Android: Netrunner had two eras, and NetrunnerDB now hosts both:

- **Classic FFG era (2012–2018):** the Core Set plus roughly twenty
  cycles/deluxe expansions (Genesis, Spin, Lunar, SanSan, Mumbad, Kitara,
  Terminal Directive, Reign and Reverie, etc.) — on the order of 1,700–2,000
  unique cards total. This is the era our Revised Core Set (ADN49) belongs
  to; ADN49 is itself a "greatest hits" reprint of the original Core Set plus
  errata, not a new expansion.
- **Null Signal Games era (2021–present):** after FFG's license lapsed, the
  fan-run nonprofit Null Signal Games (formerly Project NISEI) has continued
  designing and freely releasing new cards under a new continuity. Packs to
  date: System Gateway (77 cards, 2021), Midnight Sun (65, 2022), Parhelion
  (63, 2022) + Borealis cycle (135, 2022), The Automata Initiative (65,
  2023), Rebellion Without Rehearsal (65, 2024) + Liberation cycle (130,
  2024), Elevation (82, 2025), Vantage Point (66, 2026) — roughly 750 more
  unique cards and still growing at 1–2 releases a year.
- **Formats:** NSG maintains three parallel formats — **Standard** (a
  rotating "current" pool, NSG's flagship organized-play format), **Startup**
  (a small, low-barrier rotating pool starting from System Gateway), and
  **Eternal** (every card ever printed, no rotation). A **Ban List**
  (formerly "Most Wanted List"/MWL") restricts specific cards or errata-adjusts
  them within Standard/Startup; Eternal has historically run with a lighter
  or no ban list.

This matters immediately: "expand the card base" is not one target, it's a
choice between at least four differently-sized, differently-shaped pools
(see §6).

## 2. Data pipeline: bigger input, different input

`data/build_cards.py` today consumes a single hand-fetched raw dump
(`core2_raw.json`) from what its own header calls "NetrunnerDB API 2.0 /
netrunner-cards-json" — a flat per-card object (`code`, `side_code`,
`faction_code`, `type_code`, `keywords` string, etc.) — and hard-asserts
exactly 132 cards / 247 total quantity. That assertion alone means the script
as written cannot ingest anything else without editing.

More significant: NetrunnerDB has moved to a newer API
(`api.netrunnerdb.com`, "v3") with a materially different schema:

- Cards and **printings** are split — a card can have multiple printings
  (reprints, alt arts, errata'd text over time), with `latest_printing_id`
  and a `printing_ids` list, rather than one flat object per physical card.
- Classification fields (`card_type_id`, `side_id`, `faction_id`,
  `card_subtype_ids`) are numeric IDs needing a separate lookup/reference
  table, not the old inline `type_code`/`faction_code` strings.
- Legality now lives in `format_ids` and a `restrictions`/`in_restriction`
  object per card, to support the Standard/Startup rotation and ban list
  described above — the old API had none of this because the classic game
  never rotated.

Practically, this means "point `build_cards.py` at a bigger file" doesn't
work. The normalizer needs a real rewrite: either (a) target the new v3 API
and add a translation layer for the printing/format/restriction model, or
(b) use one of the community-maintained flat JSON mirrors (e.g.
`Null-Signal-Games/netrunnerdb-api-server`'s output, or the older
`netrunner-cards-json` family of repos) if one of them already normalizes
both eras into one flat shape — worth a short spike to check before
committing to (a).

A second, easy-to-miss landmine: **card codes are not guaranteed unique
across eras.** The engine and every card script in this project use `code`
as the primary key everywhere (per `build_cards.py`'s own docstring). Classic
codes are sequential five-digit strings starting at `01001`; NSG appears to
have restarted its own numbering from the same range for the new continuity.
If Revised Core (classic, codes `20001`–`20132`) is ever combined with an
NSG pack in the same `cards.json`, the collision risk needs an explicit
check — most likely a per-source prefix (e.g. `classic:01001` vs.
`nsg:01001`) threaded through the schema, the engine, every card script, and
every test fixture. That's a mechanical but pervasive change, worth doing
once, deliberately, rather than discovering it mid-way through scripting a
pack.

## 3. New mechanics and keywords

Each expansion pack exists to introduce new design space, so — unlike the
mostly-vanilla-heavy Revised Core — a new pack should be expected to need a
*higher* rate of new generic engine hooks per card, not a lower one. This
project's own Phase 9 is a small preview of that pattern: three cards from
the *original* 132-card pool sat deferred for months because they needed
genuinely new engine facilities (a runner encounter-side paid-ability
window, a context-scoped recurring-credit purpose, a one-shot delayed
trigger) rather than reuse of existing hooks — and each of those turned out
to be a small, clean, reusable addition once identified. Expect that pattern
to repeat, roughly once every few cards, in any new pack: new subtypes (the
NSG era alone has introduced several, e.g. "Deva," "Constellation," "Mod,"
and expanded "Trap"/"Directive" usage), new timing windows, and mechanics
with no Revised Core analogue at all.

The right process is the one already used for Phase 3 and reused for Phase
9: read every card's printed text, bucket it into vanilla / matches-an-
existing-pattern / needs-a-new-hook, script and test each card individually,
and update `docs/CARD_COVERAGE.md`. There's no shortcut that skips reading
each card.

## 4. Scripting effort, sized against what we know

Phase 3 scripted all 132 Revised Core cards (in four waves, vanilla through
unique/complex) across roughly one project phase, with per-card tests. A
single new pack (System Gateway at 77 cards, Elevation at 82, a classic
cycle box at 60–90) is smaller in raw count than that — call it half to
two-thirds the size — but, per §3, should be assumed denser in per-card
engine work, since packs are specifically designed to not just be "more of
the same." A reasonable planning assumption is that a new pack costs
roughly comparable effort to a full Revised Core wave, not less, despite the
smaller card count. Adding several packs (a full cycle, or a season of NSG
releases) compounds linearly at that same rate — there's no economy of
scale here, each card still has to be individually read, scripted, and
tested.

## 5. Deckbuilding, rotation, and the ban list

This project's decks (`ai/decks.js`) are fixed, hand-tuned precons — one
per identity, checked for legality by `tests/decks.test.js` (size, influence,
quantity caps, in-faction agendas) but with no notion of *format* at all,
because Revised Core never needed one. Expanding the pool reopens that
question:

- **Staying Eternal-with-fixed-precons** (add cards to the pool, keep
  hand-curating a small number of precon decks from whatever's legal
  "ever") is the smallest change — it's exactly today's architecture, just
  with a bigger `cards.json` to pick new precon cards from. No rotation
  model, no ban-list model, no legality-by-date logic needed.
- **Modeling Standard or Startup** (so the game enforces which cards are
  currently tournament-legal, mirrors real organized play, and updates as
  NSG rotates cards) is a materially bigger lift: it needs the `format_ids`/
  `restrictions` data from the new API (§2), a notion of "current date" or a
  pinned format snapshot, and ongoing maintenance every time NSG rotates or
  updates the ban list — an ongoing cost, not a one-time build.
- A **Ban List** by itself (independent of rotation) is a small, bounded
  addition — a static exclude-list, similar in shape to the (currently
  empty) `BANNED` array already sitting in `tests/decks.test.js`.

Given this project's stated audience ("me + a few friends" via the Phase 8
hosted pivot, not organized tournament play), staying Eternal-with-fixed-
precons and skipping rotation entirely is the pragmatic recommendation
unless Ben specifically wants real constructed deckbuilding against
NSG's current Standard metagame.

## 6. AI heuristic scaling

The Corp/Runner AI heuristics are hand-tuned per identity and, increasingly,
per matchup — this session's own Jinteki-PE-vs-Gabriel fix added an explicit
`identityTitle().startsWith('Gabriel')` check alongside the existing PE
check. That approach works at "7 decks, one per identity" scale, where every
matchup can be individually soak-tested and tuned by hand. It does not scale
linearly: each new precon deck added is a new matchup against all existing
decks, and new archetypes from later packs (NSG in particular has leaned
into more explicit combo/synergy archetypes than the Revised Core's simpler
identities) increase the chance that a generic heuristic misreads a new
card's actual value. Two honest options: (a) keep the precon count small and
deliberately curated as the pool grows (add one or two new decks per
expansion phase, soak-test and tune each the way Jinteki-Gabe was tuned this
session), or (b) invest in a more data-driven heuristic layer (e.g. a
declarative "archetype tags" system cards can register into, that the AI
reads generically) before the per-identity special-casing becomes
unmanageable. (a) is far less work up front and matches this project's
existing style; (b) only pays off once the deck count is large enough that
hand-tuning stops being tractable.

## 7. Licensing — the one to settle before card art specifically

`BUILD_PLAN.md`'s own "Assumptions" section already flags "personal/fan use
of card names and text from NetrunnerDB is acceptable to you" as something
to confirm rather than a legal ruling. Nothing found in this pass changes
that for card **text and stats**: NSG's whole reason for existing is to keep
the game freely available to fans, and the classic FFG-era text has been the
basis of NetrunnerDB and every fan tool (Jinteki.net included) for over a
decade without incident. The recommendation is the same as before —
personal/friends-group use, not a public or monetized release — and that
recommendation now explicitly extends to the newer NSG-era text as well.

**Card art is a separate and stricter question**, and this is the
concrete new finding worth flagging before that work starts: Null Signal
Games' own published visual-assets policy (CC BY-ND 4.0, covering specific
icon/symbol assets for content creators) explicitly states that **card art,
frames, and card backs are excluded from public use "regardless of" that
license.** In other words, even NSG's own newer illustrations aren't
released for reuse the way the icon set is — the underlying artwork remains
under normal copyright, held by the original illustrators/FFG/Asmodee (for
classic cards) or NSG's contracted artists (for new ones). The existing
`imageUrl` hook (Phase 1) pointing at NetrunnerDB's hosted card images was
fine as an unused architectural placeholder; actually wiring it up to
display real card art in a shipped tool — even a "just friends" one — is a
different and more exposed decision than reusing card text, and is worth an
explicit go/no-go from Ben specifically, separate from the text/data
question above, before any art work begins.

**Decision (2026-09-18): go, self-hosted, board tiles + inspector.** Ben's
own call, made with the risk above already on the table: "Since this is
still an invite only game, and although a public Github, it isn't like
anyone is searching for this." That's the same personal/friends-group
posture §7 already recommends for card text, extended by Ben to art. Images
are self-hosted in `cards-art/` (downloaded once from NetrunnerDB's
`card-images.netrunnerdb.com` CDN, not hotlinked) rather than remotely
loaded from NSG's or FFG's infrastructure at request time, which keeps the
repo self-contained and doesn't put live traffic on NSG's servers. This is
not a reassessment of the underlying copyright position in the paragraph
above — that's unchanged, the art is still under normal copyright — it's a
record that Ben weighed it and chose to proceed anyway for this small,
non-public-facing use. Revisit this call before ever making the repo's
*game* more discoverable/promoted (a different exposure level than "public
but nobody's looking"). See `docs/UI.md` ("Card art") for the implementation.

## 8. Decision needed from Ben before implementation starts

This assessment surfaces a choice rather than a single obvious next step.
In order of increasing scope:

- **A. One more classic cycle or deluxe box** (~60–100 cards, reuses the
  existing v2-shaped API/schema, no rotation to model) — smallest lift,
  good pilot for validating the process at a slightly larger scale before
  committing further.
- **B. System Gateway** (NSG's first pack, 77 cards, Startup-legal) —
  natural "what's next" pick since it's the start of the still-growing
  modern era, but requires building the new v3 API ingestion path (§2) from
  day one rather than deferring it.
- **C. A full Standard-legal card pool** — moderate card count but requires
  the rotation/format model from §5.
- **D. Everything NetrunnerDB has (Eternal)** — biggest one-time and ongoing
  scripting/AI-tuning cost (§4, §6), but no rotation logic needed and no
  "which pack next" question ever again.

Recommendation: A or B as a bounded pilot, to validate the pipeline rewrite,
the scripting cadence, and the AI-tuning approach at real (if modest) scale
before deciding whether to keep going toward C or D. Either way, the pipeline
and code-collision work in §2 needs doing once regardless of which pool is
chosen, so it's the right first step whichever direction Ben picks.

## Sources

- [NetrunnerDB — Sets catalog](https://netrunnerdb.com/en/sets)
- [NetrunnerDB API docs — get a single card](https://api.netrunnerdb.com/api/docs/cards/get_a_single_card)
- [Null Signal Games — Visual Assets usage terms](https://nullsignal.games/about/nsg-visual-assets/)
- [Null Signal Games — Players](https://nullsignal.games/players/)
- [Null Signal Games — Frequently Asked Questions](https://nullsignal.games/about/frequently-asked-questions/)
