import { describe, expect, it } from "vitest";
import { srdSpells } from "./srd";
import {
  findSrdSpellByName,
  searchSrdSpells,
  spellcastingAbilityForClass,
  suggestSrdSpells,
  SRD_SPELL_CATALOG_VERSION,
} from "./spellCatalog";

describe("embedded SRD spell catalog", () => {
  it("contains the complete offline SRD 5.2.1 spell set", () => {
    expect(SRD_SPELL_CATALOG_VERSION).toBe("5.2.1");
    expect(srdSpells).toHaveLength(339);
    expect(srdSpells.every((spell) => spell.description.length > 0)).toBe(true);
  });

  it("finds Dispel Magic case-insensitively with surrounding whitespace", () => {
    expect(searchSrdSpells({ query: "  dIsPeL mAgIc  " }).map((spell) => spell.name)).toContain("Dispel Magic");
    expect(findSrdSpellByName(" DISPEL MAGIC ")).toMatchObject({ level: 3, school: "Abjuration" });
  });

  it("searches level, school, classes, and description text while preserving filters", () => {
    expect(searchSrdSpells({ query: "druid", level: "3", school: "Abjuration" }).map((spell) => spell.name)).toContain("Dispel Magic");
    expect(searchSrdSpells({ query: "ongoing spell", concentration: "no", ritual: "no", actionType: "action" }).map((spell) => spell.name)).toContain("Dispel Magic");
  });

  it("maps normal and homebrew caster classes to their expected abilities", () => {
    expect(spellcastingAbilityForClass("Druid")).toBe("wis");
    expect(spellcastingAbilityForClass("Void Mage")).toBe("int");
    expect(spellcastingAbilityForClass("Black Mage")).toBe("int");
  });

  it("suggests close catalog matches before custom creation", () => {
    expect(suggestSrdSpells("Dispel Magc").map((spell) => spell.name)).toContain("Dispel Magic");
  });
});
