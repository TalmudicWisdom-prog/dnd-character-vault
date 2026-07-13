#!/usr/bin/env python3
"""Extract the locally supplied FFXIV companion spell pack and review report.

This script intentionally performs no network access. It uses only the supplied PDF
and the repository's embedded SRD data. Generated output is deterministic and keeps
unmatched names explicitly unavailable instead of inventing rules text.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from collections import defaultdict
from pathlib import Path

from pypdf import PdfReader


SOURCE_ID = "ffxiv-companion-dawntrail"
SOURCE_VERSION = "2025-02-18"
SOURCE = {
    "id": SOURCE_ID,
    "displayName": "Final Fantasy Companion Guide",
    "shortLabel": "FFXIV",
    "sourceType": "Homebrew",
    "version": SOURCE_VERSION,
    "optional": True,
}

CLASS_ABILITIES = {
    "Astrologian": "wis",
    "Gridanian Bard": "cha",
    "Black Mage": "int",
    "Dancer": "cha",
    "Paladin (Sultansworn)": "cha",
    "Pictomancer": "cha",
    "Reaper": "wis",
    "Red Mage": "cha",
    "Sage": "int",
    "Scholar": "int",
    "Summoner": "cha",
    "White Mage": "wis",
    "Artificer": "int",
    "Bard": "cha",
    "Cleric": "wis",
    "Druid": "wis",
    "Paladin": "cha",
    "Ranger": "wis",
    "Sorcerer": "cha",
    "Warlock": "cha",
    "Wizard": "int",
    "Geomancy": "wis",
    "Mhachi": "int",
    "Enchanter": "int",
    "Void Mage": "int",
    "Elementalist": "wis",
    "Spirit Master": "wis",
    "Ampdapori": "wis",
    "Blue Mage — Lore Keeper": "int",
    "Blue Mage — Fell Guard": "wis",
    "Blue Mage — Whalaqee": "cha",
}

MAIN_CLASS_HEADINGS = {
    "astrologianspells": "Astrologian",
    "bardspells": "Gridanian Bard",
    "blackmagespells": "Black Mage",
    "bluemagespells": "Blue Mage",
    "dancerspells": "Dancer",
    "paladinspells": "Paladin (Sultansworn)",
    "pictomancerspells": "Pictomancer",
    "reaperspells": "Reaper",
    "redmagespells": "Red Mage",
    "sagespells": "Sage",
    "scholarspells": "Scholar",
    "summonerspells": "Summoner",
    "whitemagespells": "White Mage",
}

BASE_CLASS_HEADINGS = {
    "Artificier": "Artificer",
    "Bard": "Bard",
    "Cleric": "Cleric",
    "Druid": "Druid",
    "Paladin": "Paladin",
    "Ranger": "Ranger",
    "Sorcerer": "Sorcerer",
    "Warlock": "Warlock",
    "Wizard": "Wizard",
}

SUBCLASS_TABLES = [
    (37, "Astrologian", "Geomancy", {
        1: ["Create or Destroy Water", "Earth Tremor"],
        2: ["Dust Devil", "Gust of Wind"],
        3: ["Erupting Earth", "Tidal Wave"],
        4: ["Stone Shape", "Watery Sphere"],
        5: ["Control Winds", "Wall of Stone"],
    }),
    (47, "Black Mage", "Mhachi", {
        1: ["Chromatic Orb", "Witch Bolt"],
        2: ["Aganazzar’s Scorcher", "Snilloc’s Snowball Swarm"],
        3: ["Call Lightning", "Sleet Storm"],
        4: ["Ice Storm", "Storm Sphere"],
        5: ["Cone of Cold", "Immolation"],
    }),
    (48, "Black Mage", "Enchanter", {
        1: ["Bless", "Cause Fear"],
        2: ["Enlarge/Reduce", "Magic Weapon"],
        3: ["Slow", "Haste"],
        4: ["Blight", "Charm Monster"],
        5: ["Dominate Person", "Hold Monster"],
    }),
    (48, "Black Mage", "Void Mage", {
        1: ["Armor of Agathys", "Arms of Hadar"],
        2: ["Ray of Enfeeblement", "Shadow Blade"],
        3: ["Hunger of Hadar", "Summon Lesser Demon"],
        4: ["Banishment", "Summon Greater Demon"],
        5: ["Contact Other Plane", "Negative Energy Flood"],
    }),
    (167, "White Mage", "Elementalist", {
        1: ["Earth Tremor", "Thunderwave"],
        2: ["Earthbind", "Maximilian’s Earthen Grasp"],
        3: ["Erupting Earth", "Melf’s Minute Meteors"],
        4: ["Stoneskin", "Watery Sphere"],
        5: ["Conjure Elemental", "Control Winds"],
    }),
    (168, "White Mage", "Spirit Master", {
        1: ["Heroism", "Sanctuary"],
        2: ["Enhance Ability", "Protection from Poison"],
        3: ["Aura of Vitality", "Beacon of Hope"],
        4: ["Regen", "Tetragammaton"],
        5: ["Assize", "Asylum"],
    }),
    (169, "White Mage", "Ampdapori", {
        1: ["Bless", "Magic Missile"],
        2: ["Moonbeam", "Sleep"],
        3: ["Daylight", "Spirit Guardians"],
        4: ["Banishment", "Wall of Fire"],
        5: ["Dawn", "Hallow"],
    }),
]

HEADER_RE = re.compile(
    r"^(cantrip|[1-9](?:st|nd|rd|th)(?:-?level| level)?)\s+([A-Za-z ]+(?:spell)?)$",
    re.IGNORECASE,
)
LEVEL_RE = re.compile(r"^(?:Cantrips? \(0 Level\)|([1-9])(?:st|nd|rd|th) Level)$", re.IGNORECASE)


def normalize_ocr_text(value: str) -> str:
    replacements = {
        "W hen": "When", "O n": "On", "M agic": "Magic", "M age": "Mage",
        "M ind": "Mind", "M eteor": "Meteor", "M aterial": "Material",
        "L ife": "Life", "L evel": "Level", "L ustrate": "Lustrate",
        "O smose": "Osmose", "W ater": "Water", "W ord": "Word", "M ake": "Make",
        "W all": "Wall", "W ind": "Wind", "H it": "Hit", "H oly": "Holy",
        "transm utation": "transmutation", "necrom ancy": "necromancy",
        "Enchantm ent": "Enchantment", "Instaneous": "Instantaneous",
    }
    for broken, repaired in replacements.items():
        value = value.replace(broken, repaired)
    value = re.sub(r"\s+", " ", value).strip()
    return value


def repair_name(value: str) -> str:
    value = normalize_ocr_text(value).lstrip("*").strip()
    value = re.sub(r"\b([A-Z])\s+([a-z])", r"\1\2", value)
    return value


def normalized_name(value: str) -> str:
    value = repair_name(value).replace("’", "'").casefold()
    value = re.sub(r"\s+", " ", value)
    return value.strip()


def primary_name(value: str) -> str:
    return re.sub(r"\s*\([^)]*\)\s*$", "", value).strip()


def slug(value: str) -> str:
    normalized = normalized_name(primary_name(value))
    normalized = re.sub(r"[^a-z0-9]+", "-", normalized).strip("-")
    return normalized or "unnamed-spell"


def page_lines(text: str, page: int) -> list[str]:
    return [line.strip() for line in text.splitlines() if line.strip() and line.strip() != str(page)]


def spell_list_lines(text: str, page: int) -> list[str]:
    lines = page_lines(text, page)
    merged: list[str] = []
    index = 0
    while index < len(lines):
        line = lines[index]
        if line.casefold().endswith(" and") and index + 1 < len(lines):
            line = f"{line} {lines[index + 1]}"
            index += 1
        merged.append(line)
        index += 1
    return merged


def parse_header(value: str) -> tuple[int, str] | None:
    value = normalize_ocr_text(value)
    match = HEADER_RE.match(value)
    if not match:
        return None
    raw_level, raw_school = match.groups()
    level = 0 if raw_level.casefold() == "cantrip" else int(raw_level[0])
    school_key = re.sub(r"\s+", "", raw_school.removesuffix(" spell")).casefold()
    school = {
        "abjuration": "Abjuration", "conjuration": "Conjuration", "divination": "Divination",
        "enchantment": "Enchantment", "evocation": "Evocation", "illusion": "Illusion",
        "necromancy": "Necromancy", "transmutation": "Transmutation",
    }.get(school_key, raw_school.removesuffix(" spell").strip().title())
    return level, school


def extract_formula(description: str, context: str) -> str:
    expressions = []
    for match in re.finditer(r"\b\d+d\d+(?:\s*[+-]\s*(?:\d+|your spellcasting ability modifier))?", description, re.IGNORECASE):
        window = description[max(0, match.start() - 50):match.end() + 50].casefold()
        if context in window:
            expressions.append(normalize_ocr_text(match.group(0)))
    unique = list(dict.fromkeys(expressions))
    return unique[0] if len(unique) == 1 else ""


def extract_definitions(pages: dict[int, str]) -> tuple[list[dict], list[dict]]:
    stream: list[tuple[int, str]] = []
    for page in range(184, 201):
        for line in page_lines(pages[page], page):
            if line != "Created Spells":
                stream.append((page, line))

    starts: list[tuple[int, int, int, str]] = []
    for index, (page, line) in enumerate(stream):
        header = parse_header(line)
        if header and index:
            starts.append((index - 1, page, *header))

    definitions: list[dict] = []
    uncertainties: list[dict] = []
    for position, (name_index, page, level, school) in enumerate(starts):
        next_name_index = starts[position + 1][0] if position + 1 < len(starts) else len(stream)
        name = repair_name(stream[name_index][1])
        block = [normalize_ocr_text(line) for _, line in stream[name_index + 2:next_name_index]]
        fields: dict[str, str] = {}
        description_lines: list[str] = []
        for line in block:
            match = re.match(r"^(Casting Time|Range|Components|Duration):\s*(.*)$", line, re.IGNORECASE)
            if match and match.group(1).casefold() not in fields:
                fields[match.group(1).casefold()] = match.group(2).strip()
            else:
                description_lines.append(line)
        combined = " ".join(description_lines).strip()
        higher_match = re.search(r"\bAt Higher Levels?\.?\s*", combined, re.IGNORECASE)
        if higher_match:
            description = combined[:higher_match.start()].strip()
            higher = combined[higher_match.end():].strip()
        else:
            description, higher = combined, ""
        duration = fields.get("duration", "")
        components_text = fields.get("components", "")
        components = [component for component in ("V", "S", "M") if re.search(rf"\b{component}\b", components_text)]
        material_match = re.search(r"M\s*\((.*)\)", components_text, re.IGNORECASE)
        saves = list(dict.fromkeys(re.findall(r"\b(Strength|Dexterity|Constitution|Intelligence|Wisdom|Charisma) saving throw", description, re.IGNORECASE)))
        damage_types = [kind for kind in ("acid", "bludgeoning", "cold", "fire", "force", "lightning", "necrotic", "piercing", "poison", "psychic", "radiant", "slashing", "thunder") if re.search(rf"\b{kind} damage\b", description, re.IGNORECASE)]
        definition = {
            "id": f"{SOURCE_ID}:{slug(name)}",
            "name": name,
            "level": level,
            "school": school,
            "castingTime": fields.get("casting time", ""),
            "range": fields.get("range", ""),
            "components": components,
            "materialDetails": material_match.group(1).strip() if material_match else "",
            "duration": duration,
            "concentration": "concentration" in duration.casefold(),
            "ritual": "ritual" in fields.get("casting time", "").casefold(),
            "damageType": damage_types[0].title() if len(damage_types) == 1 else "",
            "damageFormula": extract_formula(description, "damage"),
            "healingFormula": extract_formula(description, "hit point"),
            "savingThrowType": saves[0][:3].upper() if len(saves) == 1 else "",
            "attackRollRequired": bool(re.search(r"\b(?:ranged|melee)?\s*spell attack\b", description, re.IGNORECASE)),
            "areaOfEffectType": "",
            "areaOfEffectSize": "",
            "statusEffects": "",
            "description": description,
            "higherLevelScaling": higher,
            "definitionStatus": "complete",
            "sourcePage": page,
            "rulesSourceId": SOURCE_ID,
            "sourceVersion": SOURCE_VERSION,
            "homebrew": True,
        }
        missing = [field for field in ("castingTime", "range", "duration", "description") if not definition[field]]
        if not components_text or not components:
            missing.append("components")
        if missing or len(saves) > 1 or len(damage_types) > 1:
            uncertainties.append({
                "name": name,
                "page": page,
                "missingOrAmbiguousFields": missing
                    + (["savingThrowType"] if len(saves) > 1 else [])
                    + (["damageType"] if len(damage_types) > 1 else []),
            })
        definitions.append(definition)
    return definitions, uncertainties


def make_association(name: str, class_name: str, page: int, listed_level: int | None, subclass_name: str = "") -> list[dict]:
    if class_name == "Blue Mage" and not subclass_name:
        return [
            {
                "spellName": repair_name(name), "className": "Blue Mage", "subclassName": calling,
                "sourceClass": f"Blue Mage — {calling}", "castingAbility": ability, "page": page,
                "listedLevel": listed_level,
            }
            for calling, ability in (("Lore Keeper", "int"), ("Fell Guard", "wis"), ("Whalaqee", "cha"))
        ]
    source_class = subclass_name or class_name
    return [{
        "spellName": repair_name(name), "className": class_name, "subclassName": subclass_name,
        "sourceClass": source_class, "castingAbility": CLASS_ABILITIES.get(source_class) or CLASS_ABILITIES.get(class_name),
        "page": page, "listedLevel": listed_level,
    }]


def extract_main_class_lists(pages: dict[int, str]) -> list[dict]:
    associations: list[dict] = []
    current_class = ""
    current_level: int | None = None
    for page in range(170, 184):
        for raw in spell_list_lines(pages[page], page):
            line = repair_name(raw)
            heading_key = re.sub(r"\s+", "", line).casefold()
            if heading_key in MAIN_CLASS_HEADINGS:
                current_class = MAIN_CLASS_HEADINGS[heading_key]
                current_level = None
                continue
            level_match = LEVEL_RE.match(line)
            if level_match:
                current_level = 0 if line.casefold().startswith("cantrip") else int(level_match.group(1))
                continue
            if current_class and current_level is not None:
                associations.extend(make_association(line, current_class, page, current_level))
    return associations


def extract_base_class_lists(pages: dict[int, str]) -> list[dict]:
    associations: list[dict] = []
    current_class = ""
    for page in (201, 202):
        for raw in spell_list_lines(pages[page], page):
            line = repair_name(raw)
            if line in BASE_CLASS_HEADINGS:
                current_class = BASE_CLASS_HEADINGS[line]
                continue
            if not current_class or line in {"D&D Classes Receiving Spells", "Base D&D (PHB)"} or len(line.split()) > 10:
                continue
            associations.extend(make_association(line, current_class, page, None))
    return associations


def subclass_associations() -> list[dict]:
    associations: list[dict] = []
    for page, class_name, subclass_name, levels in SUBCLASS_TABLES:
        for level, spell_names in levels.items():
            for spell_name in spell_names:
                associations.extend(make_association(spell_name, class_name, page, level, subclass_name))
    return associations


def levenshtein(left: str, right: str) -> int:
    previous = list(range(len(right) + 1))
    for left_index, left_char in enumerate(left, 1):
        current = [left_index]
        for right_index, right_char in enumerate(right, 1):
            current.append(min(current[-1] + 1, previous[right_index] + 1, previous[right_index - 1] + (left_char != right_char)))
        previous = current
    return previous[-1]


def build_pack(pages: dict[int, str], srd_path: Path) -> dict:
    srd_spells = json.loads(srd_path.read_text())
    srd_by_name = {normalized_name(spell["name"]): spell for spell in srd_spells}
    full_definitions, parse_uncertainties = extract_definitions(pages)
    full_by_name = {normalized_name(primary_name(definition["name"])): definition for definition in full_definitions}
    raw_associations = extract_main_class_lists(pages) + extract_base_class_lists(pages) + subclass_associations()

    seen_associations: set[tuple] = set()
    associations: list[dict] = []
    incomplete_by_name: dict[str, dict] = {}
    ambiguous: list[dict] = []
    level_conflicts: list[dict] = []

    candidate_names = {**{key: spell["name"] for key, spell in srd_by_name.items()}, **{key: definition["name"] for key, definition in full_by_name.items()}}
    for association in raw_associations:
        normalized = normalized_name(association["spellName"])
        if normalized in srd_by_name:
            target = srd_by_name[normalized]
            association.update({"definitionId": target["id"], "rulesSourceId": "srd-5.2.1", "status": "srd"})
            expected_level = target["level"]
        elif normalized in full_by_name:
            target = full_by_name[normalized]
            association.update({"definitionId": target["id"], "rulesSourceId": SOURCE_ID, "status": "complete"})
            expected_level = target["level"]
        else:
            unavailable = incomplete_by_name.setdefault(normalized, {
                "id": f"{SOURCE_ID}:unavailable:{slug(association['spellName'])}",
                "name": association["spellName"],
                "level": association["listedLevel"],
                "school": "Definition unavailable",
                "castingTime": "",
                "range": "",
                "components": [],
                "materialDetails": "",
                "duration": "",
                "concentration": False,
                "ritual": False,
                "damageType": "",
                "damageFormula": "",
                "healingFormula": "",
                "savingThrowType": "",
                "attackRollRequired": False,
                "areaOfEffectType": "",
                "areaOfEffectSize": "",
                "statusEffects": "",
                "description": "",
                "higherLevelScaling": "",
                "definitionStatus": "unavailable",
                "sourcePage": association["page"],
                "rulesSourceId": SOURCE_ID,
                "sourceVersion": SOURCE_VERSION,
                "homebrew": True,
                "listedLevels": [],
            })
            if association["listedLevel"] is not None and association["listedLevel"] not in unavailable["listedLevels"]:
                unavailable["listedLevels"].append(association["listedLevel"])
            association.update({"definitionId": unavailable["id"], "rulesSourceId": SOURCE_ID, "status": "unavailable"})
            expected_level = None
            distances = sorted((levenshtein(normalized, candidate), name) for candidate, name in candidate_names.items())
            if distances and distances[0][0] <= 2:
                ambiguous.append({"name": association["spellName"], "page": association["page"], "possibleMatch": distances[0][1], "distance": distances[0][0]})

        if association["listedLevel"] is not None and expected_level is not None and association["listedLevel"] != expected_level:
            level_conflicts.append({"name": association["spellName"], "page": association["page"], "listedLevel": association["listedLevel"], "definitionLevel": expected_level})
        association["contentSourceId"] = SOURCE_ID
        key = (association["definitionId"], association["sourceClass"], association["subclassName"], association["page"], association["listedLevel"])
        if key not in seen_associations:
            seen_associations.add(key)
            associations.append(association)

    for unavailable in incomplete_by_name.values():
        levels = unavailable.pop("listedLevels")
        if len(levels) == 1:
            unavailable["level"] = levels[0]
        elif len(levels) > 1:
            unavailable["level"] = None
            level_conflicts.append({"name": unavailable["name"], "listedLevels": sorted(levels), "definitionLevel": None})

    complete_ids = {definition["id"] for definition in full_definitions}
    associated_complete_ids = {association["definitionId"] for association in associations if association["definitionId"] in complete_ids}
    for definition in full_definitions:
        if definition["id"] not in associated_complete_ids:
            parse_uncertainties.append({"name": definition["name"], "page": definition["sourcePage"], "missingOrAmbiguousFields": ["classAssociations"]})

    ambiguity_keys = set()
    unique_ambiguous = []
    for item in ambiguous:
        key = (normalized_name(item["name"]), item["possibleMatch"], item["page"])
        if key not in ambiguity_keys:
            ambiguity_keys.add(key)
            unique_ambiguous.append(item)

    unique_detected = {normalized_name(definition["name"]) for definition in full_definitions}
    unique_detected.update(normalized_name(association["spellName"]) for association in associations)
    review = {
        "pdfPages": 219,
        "spellNamesDetected": len(unique_detected),
        "completeCustomDefinitions": len(full_definitions),
        "srdMatches": len({association["definitionId"] for association in associations if association["status"] == "srd"}),
        "incompleteNamedOnlyEntries": len(incomplete_by_name),
        "ambiguousEntries": len(unique_ambiguous),
        "classListAssociations": len(associations),
        "classesAndSubclasses": sorted({association["sourceClass"] for association in associations}),
        "parseUncertainties": parse_uncertainties,
        "ambiguousOrCloseMatches": unique_ambiguous,
        "levelConflicts": level_conflicts,
    }
    return {
        "source": SOURCE,
        "classAbilities": CLASS_ABILITIES,
        "definitions": sorted(full_definitions + list(incomplete_by_name.values()), key=lambda item: (item["name"].casefold(), item["id"])),
        "associations": sorted(associations, key=lambda item: (item["spellName"].casefold(), item["sourceClass"].casefold(), item["page"])),
        "review": review,
    }


def review_markdown(pack: dict, pdf_path: Path) -> str:
    review = pack["review"]
    lines = [
        "# FFXIV Spell Import Review",
        "",
        f"- Local PDF: `{pdf_path}`",
        f"- Content source: {SOURCE['displayName']} (`{SOURCE_ID}`)",
        f"- Source version: {SOURCE_VERSION}",
        f"- Total unique spell names detected: {review['spellNamesDetected']}",
        f"- Complete custom definitions: {review['completeCustomDefinitions']}",
        f"- Exact SRD 5.2.1 matches: {review['srdMatches']}",
        f"- Incomplete name-only entries: {review['incompleteNamedOnlyEntries']}",
        f"- Ambiguous or close-match entries: {review['ambiguousEntries']}",
        f"- Source-specific class-list associations: {review['classListAssociations']}",
        "",
        "## Classes and subclasses",
        "",
        *[f"- {name}" for name in review["classesAndSubclasses"]],
        "",
        "## Parsing uncertainties",
        "",
    ]
    if review["parseUncertainties"]:
        lines.extend(f"- Page {item['page']}: **{item['name']}** — {', '.join(item['missingOrAmbiguousFields'])}" for item in review["parseUncertainties"])
    else:
        lines.append("- None detected.")
    lines.extend(["", "## Ambiguous or close matches", ""])
    if review["ambiguousOrCloseMatches"]:
        lines.extend(f"- Page {item['page']}: **{item['name']}** may refer to **{item['possibleMatch']}** (edit distance {item['distance']}); left unavailable for manual review." for item in review["ambiguousOrCloseMatches"])
    else:
        lines.append("- None detected.")
    lines.extend(["", "## Level conflicts", ""])
    if review["levelConflicts"]:
        lines.extend(f"- **{item['name']}**: {json.dumps(item, ensure_ascii=False)}" for item in review["levelConflicts"])
    else:
        lines.append("- None detected.")
    lines.extend(["", "No missing rules were fetched or fabricated. Name-only entries remain non-castable until completed manually.", ""])
    return "\n".join(lines)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("pdf", type=Path)
    parser.add_argument("--repo", type=Path, default=Path.cwd())
    args = parser.parse_args()
    if not args.pdf.is_file():
        parser.error(f"PDF not found: {args.pdf}")
    reader = PdfReader(str(args.pdf))
    pages = {index + 1: page.extract_text() or "" for index, page in enumerate(reader.pages)}
    if len(pages) != 219:
        print(f"warning: expected 219 pages, found {len(pages)}", file=sys.stderr)
    pack = build_pack(pages, args.repo / "src/data/srd-spells-5.2.1.data")
    data_path = args.repo / "src/data/ffxiv-companion-dawntrail.data"
    review_json_path = args.repo / "docs/ffxiv-spell-import-review.json"
    review_md_path = args.repo / "docs/ffxiv-spell-import-review.md"
    data_path.parent.mkdir(parents=True, exist_ok=True)
    review_json_path.parent.mkdir(parents=True, exist_ok=True)
    data_path.write_text(json.dumps(pack, ensure_ascii=False, indent=2) + "\n")
    review_json_path.write_text(json.dumps(pack["review"], ensure_ascii=False, indent=2) + "\n")
    review_md_path.write_text(review_markdown(pack, args.pdf))
    print(json.dumps(pack["review"], ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
