#!/usr/bin/env python3
"""Phase 1 data pipeline: normalize NetrunnerDB raw card data (core2_raw.json)
into the game's card schema (cards.json).

Run:  python3 build_cards.py   (from netrunner/data/)

Input : core2_raw.json  {"imageUrlTemplate": str, "cards": [nrdb card objects]}
Output: cards.json      {"meta": {...}, "cards": {code: card}}

Game card schema (all keys always present; null when not applicable):
  code            str   NRDB code, e.g. "20001" (primary key everywhere)
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
  strength        int|null  ice and icebreakers
  memoryCost      int|null  programs (MU)
  trashCost       int|null  corp cards trashable on access
  influence       int|null  faction influence cost (null for IDs/neutral agendas)
  uniqueness      bool  diamond-unique
  deckLimit       int   max copies per deck
  quantity        int   copies in one Revised Core box (drives precon pools)
  baseLink        int|null  runner IDs only
  minimumDeckSize int|null  IDs only
  influenceLimit  int|null  IDs only
  flavor          str|null
  illustrator     str|null
  imageUrl        str   NetrunnerDB card image (enhancement hook; game renders
                        styled text cards by default and works fully offline)
"""
import json
import unicodedata

RAW = "core2_raw.json"
OUT = "cards.json"

def norm(c, tmpl):
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
    }

def main():
    raw = json.load(open(RAW))
    tmpl = raw["imageUrlTemplate"]
    cards = {c["code"]: norm(c, tmpl) for c in raw["cards"]}
    assert len(cards) == 132, f"expected 132 cards, got {len(cards)}"
    assert sum(c["quantity"] for c in cards.values()) == 247
    # sanity: every agenda has points+adv cost; every ice/id typed correctly
    for c in cards.values():
        if c["type"] == "agenda":
            assert c["agendaPoints"] is not None and c["advancementCost"] is not None, c["code"]
        if c["type"] == "identity":
            assert c["minimumDeckSize"] is not None, c["code"]
        if c["type"] == "ice":
            assert c["strength"] is not None, c["code"]
    out = {
        "meta": {
            "set": "Revised Core Set (ADN49)",
            "packCode": "core2",
            "source": "NetrunnerDB API 2.0 / netrunner-cards-json",
            "cardCount": len(cards),
            "totalQuantity": 247,
            "schemaVersion": 1,
        },
        "cards": cards,
    }
    json.dump(out, open(OUT, "w"), indent=1, ensure_ascii=False)
    print(f"wrote {OUT}: {len(cards)} cards OK")

if __name__ == "__main__":
    main()
