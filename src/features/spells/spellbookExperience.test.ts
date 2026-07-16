import { describe, expect, it } from "vitest";
import { FFXIV_CONTENT_SOURCE_ID, SRD_CONTENT_SOURCE_ID } from "../../rules/contentSources";
import { catalogSpells } from "../../rules/spellCatalog";
import {
  buildClassChapters,
  catalogEligibility,
  parseSpellbookPosition,
  requiredClassLevelForSpell,
  spellsForClassChapter,
} from "./spellbookExperience";

describe("spellbook experience", () => {
  it("builds the Table of Classes dynamically from enabled catalog associations", () => {
    const srdOnly = buildClassChapters(catalogSpells, []);
    expect(srdOnly.some((chapter) => chapter.key === `${SRD_CONTENT_SOURCE_ID}::Druid`)).toBe(true);
    expect(srdOnly.some((chapter) => chapter.contentSourceId === FFXIV_CONTENT_SOURCE_ID)).toBe(false);

    const withFfxiv = buildClassChapters(catalogSpells, [FFXIV_CONTENT_SOURCE_ID]);
    expect(withFfxiv.some((chapter) => chapter.name === "Void Mage" && chapter.contentSourceId === FFXIV_CONTENT_SOURCE_ID)).toBe(true);
  });

  it("opens a class chapter at one selected spell level", () => {
    const chapters = buildClassChapters(catalogSpells, [FFXIV_CONTENT_SOURCE_ID]);
    const druid = chapters.find((chapter) => chapter.key === `${SRD_CONTENT_SOURCE_ID}::Druid`);
    expect(druid).toBeDefined();
    const level = druid?.levels.find((candidate) => candidate > 0) ?? 0;
    const spells = spellsForClassChapter(catalogSpells, druid?.key ?? "", level);
    expect(spells.length).toBeGreaterThan(0);
    expect(spells.every((spell) => spell.level === level)).toBe(true);
    expect(spells.every((spell) => spell.associations.some((association) => association.sourceClass === "Druid"))).toBe(true);
  });

  it("uses class progression rather than the character's configured slot pools", () => {
    const druidThirdLevel = catalogSpells.find((spell) => spell.level === 3 && spell.associations.some((association) => association.contentSourceId === SRD_CONTENT_SOURCE_ID && association.sourceClass === "Druid"));
    expect(druidThirdLevel).toBeDefined();
    const choice = druidThirdLevel?.associations.find((association) => association.contentSourceId === SRD_CONTENT_SOURCE_ID && association.sourceClass === "Druid");
    expect(choice && requiredClassLevelForSpell({ ...choice, value: "srd::Druid", label: "Druid" }, 3)).toBe(5);

    const tooLow = catalogEligibility({ characterClass: "Druid", level: 4 }, druidThirdLevel!, [], false);
    expect(tooLow.canAdd).toBe(false);
    expect(tooLow.reason).toBe("Requires Druid level 5");

    const eligible = catalogEligibility({ characterClass: "Druid", level: 5 }, druidThirdLevel!, [], false);
    expect(eligible.canAdd).toBe(true);
    expect(eligible.validChoices).toHaveLength(1);
  });

  it("accounts for Warlock's higher-level Mystic Arcanum access", () => {
    const definition = catalogSpells.find((spell) => spell.level === 6 && spell.associations.some((association) => association.contentSourceId === SRD_CONTENT_SOURCE_ID && association.sourceClass === "Warlock"));
    const choice = definition?.associations.find((association) => association.contentSourceId === SRD_CONTENT_SOURCE_ID && association.sourceClass === "Warlock");
    expect(definition).toBeDefined();
    expect(choice && requiredClassLevelForSpell({ ...choice, value: "srd::Warlock", label: "Warlock" }, 6)).toBe(11);
  });

  it("keeps homebrew classes readable when progression metadata is unavailable", () => {
    const ffxivDefinition = catalogSpells.find((spell) => spell.level !== null && spell.associations.some((association) => association.contentSourceId === FFXIV_CONTENT_SOURCE_ID && association.sourceClass === "Void Mage"));
    expect(ffxivDefinition).toBeDefined();
    const eligibility = catalogEligibility({ characterClass: "Void Mage", level: 20 }, ffxivDefinition!, [FFXIV_CONTENT_SOURCE_ID], false);
    expect(eligibility.canAdd).toBe(false);
    expect(eligibility.reason).toContain("progression is not configured");
  });

  it("does not use total character level when multiclass levels are ambiguous", () => {
    const spell = catalogSpells.find((definition) => definition.name === "Call Lightning");
    expect(spell).toBeDefined();
    const eligibility = catalogEligibility({ characterClass: "Druid 3 / Fighter 4", level: 7 }, spell!, [], false);
    expect(eligibility.canAdd).toBe(false);
    expect(eligibility.reason).toMatch(/individual class levels/i);
  });

  it("restores a safe last book position", () => {
    expect(parseSpellbookPosition('{"page":"chapter","classKey":"srd-5.2.1::Druid","level":3}')).toEqual({ page: "chapter", classKey: "srd-5.2.1::Druid", level: 3 });
    expect(parseSpellbookPosition("not json")).toEqual({ page: "desk", classKey: "", level: 0 });
    expect(parseSpellbookPosition('{"page":"unknown","level":40}')).toEqual({ page: "desk", classKey: "", level: 0 });
  });
});
