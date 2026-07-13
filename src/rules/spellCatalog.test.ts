import { describe, expect, it } from "vitest";
import { srdSpells } from "./srd";
import {
  characterSourceClassChoices,
  catalogSpell,
  findCatalogSpellByName,
  findSrdSpellByName,
  searchSrdSpells,
  searchCatalogSpells,
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

  it("selects the sole matching character class and requires a choice when several match", () => {
    const dispelMagic = catalogSpell("dispel-magic")!;

    expect(characterSourceClassChoices("Druid", dispelMagic, []).map((choice) => choice.sourceClass)).toEqual(["Druid"]);
    expect(characterSourceClassChoices("Druid / Wizard", dispelMagic, []).map((choice) => choice.sourceClass)).toEqual(["Druid", "Wizard"]);
  });

  it("suggests close catalog matches before custom creation", () => {
    expect(suggestSrdSpells("Dispel Magc").map((spell) => spell.name)).toContain("Dispel Magic");
  });
});

describe("optional FFXIV companion spell source", () => {
  it("keeps complete FFXIV definitions separate from canonical SRD definitions", () => {
    const aero = findCatalogSpellByName("Aero")!;
    const dispelMagic = catalogSpell("dispel-magic")!;

    expect(aero).toMatchObject({ id: "ffxiv-companion-dawntrail:aero", level: 0, school: "Evocation", rulesSourceId: "ffxiv-companion-dawntrail", definitionStatus: "complete", sourcePage: 184 });
    expect(aero.description).toContain("burst of wind");
    expect(dispelMagic.rulesSourceId).toBe("srd-5.2.1");
    expect(dispelMagic.associations.some((association) => association.contentSourceId === "ffxiv-companion-dawntrail" && association.sourceClass === "White Mage")).toBe(true);
  });

  it("searches the FFXIV source and class associations", () => {
    expect(searchCatalogSpells({ source: "ffxiv-companion-dawntrail", query: "Final Fantasy" }).length).toBeGreaterThan(300);
    expect(searchCatalogSpells({ query: "Void Mage" }).map((spell) => spell.name)).toContain("Hunger of Hadar");
    expect(searchCatalogSpells({ source: "ffxiv-companion-dawntrail", query: "Dispel Magic" }).filter((spell) => spell.name === "Dispel Magic")).toHaveLength(1);
  });

  it("keeps name-only non-SRD spells explicitly unavailable", () => {
    expect(findCatalogSpellByName("Hunger of Hadar")).toMatchObject({ definitionStatus: "unavailable", description: "", rulesSourceId: "ffxiv-companion-dawntrail" });
  });
});
