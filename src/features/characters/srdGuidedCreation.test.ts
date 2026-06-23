import { describe, expect, it } from "vitest";
import { srdBackgrounds, srdClass, srdSpecies } from "../../rules/srd";
import { createEmptyCreationDraft } from "../../storage/characterCreation";
import {
  applyGuidedFeatureSuggestions,
  canSelectSrdSpell,
  combatSuggestions,
  equipmentName,
  filterSrdSpells,
  guidedFeatureEmptyStateText,
  guidedFeatureSuggestions,
  preparedSpellLimit,
  spellcastingCantripLimit,
} from "./srdGuidedCreation";

describe("SRD guided character creation helpers", () => {
  it("calculates combat suggestions from class, species, and ability scores", () => {
    const draft = createEmptyCreationDraft();
    const suggestions = combatSuggestions({
      ...draft,
      character: { ...draft.character, level: 1 },
      sheet: { ...draft.sheet, abilityScores: { ...draft.sheet.abilityScores, dex: 14, con: 16 } },
    }, srdClass("Druid"), srdSpecies.find((species) => species.name === "Human"));

    expect(suggestions).toEqual(expect.objectContaining({
      armorClass: 12,
      initiative: 2,
      speed: 30,
      maxHp: 11,
      hitDice: "1d8",
      hitDie: "d8",
    }));
  });

  it("exposes SRD equipment names for choice groups", () => {
    expect(equipmentName("wooden-shield")).toBe("Wooden Shield");
  });

  it("calculates guided spell selection limits", () => {
    const draft = createEmptyCreationDraft();
    const druid = srdClass("Druid");
    const leveledDraft = {
      ...draft,
      character: { ...draft.character, level: 1 },
      sheet: { ...draft.sheet, abilityScores: { ...draft.sheet.abilityScores, wis: 16 } },
    };

    expect(spellcastingCantripLimit(druid, 1)).toBe(2);
    expect(preparedSpellLimit(leveledDraft, druid)).toBe(4);
  });

  it("prevents selecting more SRD spells than guided limits allow", () => {
    const draft = {
      ...createEmptyCreationDraft(),
      srdSelectedCantripIds: ["guidance", "produce-flame"],
    };
    const shillelagh = filterSrdSpells([], { search: "", level: "all", className: "all", school: "all" }).find((spell) => spell.id === "shillelagh");
    expect(shillelagh).toBeUndefined();
    const spell = { id: "shillelagh", level: 0, name: "Shillelagh", school: "Transmutation", classes: ["Druid"], castingTime: "1 bonus action", range: "Touch", components: ["V", "S", "M"], materialDetails: "", duration: "1 minute", concentration: false, ritual: false, description: "", source: "SRD" as const };
    expect(canSelectSrdSpell(draft, spell, srdClass("Druid"))).toBe(false);
  });

  it("filters and sorts the embedded SRD spell library", () => {
    const spells = filterSrdSpells([
      { id: "b", name: "Thunderwave", level: 1, school: "Evocation", classes: ["Druid"], castingTime: "1 action", range: "Self", components: ["V", "S"], materialDetails: "", duration: "Instantaneous", concentration: false, ritual: false, description: "Thunder damage.", source: "SRD" },
      { id: "a", name: "Guidance", level: 0, school: "Divination", classes: ["Druid"], castingTime: "1 action", range: "Touch", components: ["V", "S"], materialDetails: "", duration: "Concentration", concentration: true, ritual: false, description: "Help a check.", source: "SRD" },
    ], { search: "", level: "all", className: "Druid", school: "all" });

    expect(spells.map((spell) => spell.name)).toEqual(["Guidance", "Thunderwave"]);
  });

  it("populates Druid class features and proficiencies from SRD", () => {
    const suggestions = guidedFeatureSuggestions(srdClass("Druid"));

    expect(suggestions.classFeatures).toEqual(expect.arrayContaining(["Druidic", "Spellcasting"]));
    expect(suggestions.armorProficiencies).toContain("Light Armor");
    expect(suggestions.weaponProficiencies).toContain("Quarterstaffs");
    expect(suggestions.toolProficiencies).toContain("Herbalism Kit");
  });

  it("populates Elf species traits and languages from SRD", () => {
    const suggestions = guidedFeatureSuggestions(undefined, srdSpecies.find((species) => species.name === "Elf"));

    expect(suggestions.speciesTraits).toEqual(expect.arrayContaining(["Darkvision", "Fey Ancestry", "Trance", "Keen Senses"]));
    expect(suggestions.languages).toEqual(expect.arrayContaining(["Common", "Elvish"]));
  });

  it("surfaces the beginner-friendly empty state when SRD data is unavailable", () => {
    const suggestions = guidedFeatureSuggestions(srdClass("Fighter"), srdSpecies.find((species) => species.name === "Human"));

    expect(suggestions.classFeatures).toEqual([]);
    expect(guidedFeatureEmptyStateText).toBe("No SRD data found yet. You can add this manually, skip for now, or edit it later.");
  });

  it("preserves manual entries while adding SRD feature suggestions", () => {
    const draft = createEmptyCreationDraft();
    const updated = applyGuidedFeatureSuggestions({
      ...draft,
      sheet: {
        ...draft.sheet,
        classFeatures: "Circle of Ashes",
        languages: "Primordial",
      },
    }, srdClass("Druid"), srdSpecies.find((species) => species.name === "Elf"), srdBackgrounds.find((background) => background.name === "Sage"));

    expect(updated.sheet.classFeatures).toContain("Circle of Ashes");
    expect(updated.sheet.classFeatures).toContain("Druidic");
    expect(updated.sheet.classFeatures).toContain("Spellcasting");
    expect(updated.sheet.speciesTraits).toContain("Fey Ancestry");
    expect(updated.sheet.toolProficiencies).toContain("Herbalism Kit");
    expect(updated.sheet.toolProficiencies).toContain("Calligrapher's Supplies");
    expect(updated.sheet.languages).toContain("Primordial");
    expect(updated.sheet.languages).toContain("Elvish");
  });
});
