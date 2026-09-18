#!/usr/bin/env python3
"""Data pipeline: normalize NetrunnerDB raw card data into the game's card
schema (cards.json).

Sources:
  core2_raw.json        Revised Core Set (ADN49), 132 cards.
                         Shape: {"imageUrlTemplate": str, "cards": [nrdb card objects]}
  genesis_raw_*.json    Genesis Cycle packs (wla/ta/ce/asis/hs/fp), 20 cards each,
                         120 cards total. Shape: [nrdb card objects] (no wrapper;
                         these came from the netrunner-cards-json per-pack mirror).

Genesis cards whose title already exists in Revised Core (a straight reprint,
e.g. Imp, Morning Star, Project Atlas) are DROPPED from the merge -- the
existing Revised Core printing/code stays canonical everywhere (precons,
scripts, docs). Only the ~79 net-new Genesis titles are added, keeping their
own 02xxx codes (no numeric collision with the 20xxx Revised Core range).

Run:  python3 build_cards.py   (from netrunner-game/data/)
Output: cards.json      {"meta": {...}, "cards": {code: card}}

Game card schema (all keys always present; null when not applicable):
  code            str   NRDB code, e.g. "20001" / "02015" (primary key everywhere)
  title           str   display title (may contain diacritics, e.g. Doppelgänger)
  strippedTitle   str   ASCII-ish title for matching/search
  side            "runner" | "corp"
  faction         anarch|criminal|shaper|haas-bioroid|jinteki|nbn|
                  weyland-consortium|neutral-runner|neutral-corp
  type            identity|event|hardware|program|resource|
                  agenda|asset|ice|operation|upgrade
  subtypes        [str] parsed from keywords, e.g. ["Icebreaker","Killer"]
  text            str   rules text with NRDB markup ([credit], [click], etc.)
  strippedText    str   plain rules text (use for tooltips/search)
  cost            int|null  play/install/rez cost (null = no cost, e.g. agendas/IDs)
  advancementCost int|null  agendas only
  agendaPoints    int|null  agendas only
  strength        int|null  ice and icebreakers (null also for variable-strength
                  AI breakers like Darwin, which computes strength at runtime)
  memoryCost      int|null  programs (MU)
  trashCost       int|null  corp cards trashable on access
  influence       int|null  faction influence cost (null for IDs/neutral agendas)
  uniqueness      bool  diamond-unique
  deckLimit       int   max copies per deck
  quantity        int   copies in one Revised Core box / Genesis pack (drives
                  precon pools; not meaningful across packs)
  baseLink        int|null  runner IDs only
  minimumDeckSize int|null  IDs only
  influenceLimit  int|null  IDs only
  flavor          str|null
  illustrator     str|null
  imageUrl        str   NetrunnerDB card image (enhancement hook; game renders
                        styled text cards by default and works fully offline)
  pack            str   pack code this printing came from, e.g. "core2", "wla"
"""
import glob
import json
import unicodedata

CORE_RAW = "core2_raw.json"
GENESIS_GLOB = "genesis_raw_*.json"
OUT = "cards.json"

GENESIS_PACKS = {
    "genesis_raw_wla.json": "wla",     # What Lies Ahead
    "genesis_raw_ta.json": "ta",       # Trace Amount
    "genesis_raw_ce.json": "ce",       # Cyber Exodus
    "genesis_raw_asis.json": "asis",   # A Study in Static
    "genesis_raw_hs.json": "hs",       # Humanity's Shadow
    "genesis_raw_fp.json": "fp",       # Future Proof
}

def norm(c, tmpl, pack):
    sub = c.get("keywords") or ""
    return {
        "code": c["code"],
        "title": c["title"],
        "strippedTitle": c.get("stripped_title") or unicodedata.normalize(
            "NFKD", c["title"]).encode("ascii", "ignore").decode(),
        "side": c["side_code"],
        "faction": c["faction_code"],
        "type": c["type_code"],
        "subtypes": [s.strip() for s in sub.split(" - ")] if sub else [],
        "text": c.get("text") or "",
        "strippedText": c.get("stripped_text") or "",
        "cost": c.get("cost"),
        "advancementCost": c.get("advancement_cost"),
        "agendaPoints": c.get("agenda_points"),
        "strength": c.get("strength"),
        "memoryCost": c.get("memory_cost"),
        "trashCost": c.get("trash_cost"),
        "influence": c.get("faction_cost"),
        "uniqueness": bool(c.get("uniqueness")),
        "deckLimit": c.get("deck_limit", 3),
        "quantity": c.get("quantity", 3),
        "baseLink": c.get("base_link"),
        "minimumDeckSize": c.get("minimum_deck_size"),
        "influenceLimit": c.get("influence_limit"),
        "flavor": c.get("flavor"),
        "illustrator": c.get("illustrator"),
        "imageUrl": tmpl.replace("{code}", c["code"]),
        "pack": pack,
    }

def check_invariants(cards):
    for c in cards.values():
        if c["type"] == "agenda":
            assert c["agendaPoints"] is not None and c["advancementCost"] is not None, c["code"]
        if c["type"] == "identity":
            assert c["minimumDeckSize"] is not None, c["code"]
        if c["type"] == "ice":
            # Variable-strength AI-type ice does not exist in these sets; every
            # ice card must have a printed base strength.
            assert c["strength"] is not None, c["code"]

def main():
    raw = json.load(open(CORE_RAW))
    tmpl = raw["imageUrlTemplate"]
    core_cards = {c["code"]: norm(c, tmpl, "core2") for c in raw["cards"]}
    assert len(core_cards) == 132, f"expected 132 core cards, got {len(core_cards)}"
    assert sum(c["quantity"] for c in core_cards.values()) == 247
    check_invariants(core_cards)

    core_titles = {c["strippedTitle"].lower() for c in core_cards.values()}

    genesis_new = {}
    genesis_dupes = []
    for path in sorted(glob.glob(GENESIS_GLOB)):
        import os
        pack = GENESIS_PACKS.get(os.path.basename(path))
        if pack is None:
            continue
        for c in json.load(open(path)):
            n = norm(c, tmpl, pack)
            key = n["strippedTitle"].lower()
            if key in core_titles:
                genesis_dupes.append(n["code"])
                continue
            genesis_new[n["code"]] = n

    assert len(genesis_dupes) == 41, f"expected 41 Genesis reprints of Revised Core titles, got {len(genesis_dupes)}"
    assert len(genesis_new) == 79, f"expected 79 net-new Genesis cards, got {len(genesis_new)}"
    check_invariants(genesis_new)

    cards = {**core_cards, **genesis_new}
    assert len(cards) == 132 + 79 == 211

    out = {
        "meta": {
            "set": "Revised Core Set (ADN49) + Genesis Cycle",
            "packCode": "core2",
            "packs": ["core2", "wla", "ta", "ce", "asis", "hs", "fp"],
            "source": "NetrunnerDB API 2.0 / netrunner-cards-json",
            "cardCount": len(cards),
            "coreCardCount": len(core_cards),
            "genesisNewCardCount": len(genesis_new),
            "genesisReprintCount": len(genesis_dupes),
            "totalQuantity": sum(c["quantity"] for c in cards.values()),
            "schemaVersion": 1,
        },
        "cards": cards,
    }
    json.dump(out, open(OUT, "w"), indent=1, ensure_ascii=False)
    print(f"wrote {OUT}: {len(cards)} cards OK "
          f"({len(core_cards)} core + {len(genesis_new)} Genesis net-new, "
          f"{len(genesis_dupes)} Genesis reprints skipped)")

if __name__ == "__main__":
    main()
