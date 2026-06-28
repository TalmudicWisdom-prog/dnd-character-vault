import { describe, expect, it } from "vitest";
import { srdBackgrounds, srdClass, srdSpecies } from "../../rules/srd";
import { createEmptyCreationDraft } from "../../storage/characterCreation";
import { canChooseSkill } from "./creationMode";
import {
  applyGuidedFeatureSuggestions,
  autoApplyClassSavingThrows,
  canSelectSrdSpell,
  combatEmptyStates,
  combatSuggestions,
  equipmentName,
  expandedEquipmentOptions,
  filterSrdSpells,
  guidedFeatureEmptyStateText,
  guidedFeatureSuggestions,
  isPlaceholderEquipment,
  optionMatchesSelection,
  preparedSpellLimit,
  recommendedSkillLabels,
  reviewSummary,
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

  it("auto-applies standard Druid saving throws in guided mode", () => {
    const draft = createEmptyCreationDraft();
    const updated = autoApplyClassSavingThrows({
      ...draft,
      sheet: {
        ...draft.sheet,
        savingThrows: { str: true, dex: true, con: true, int: false, wis: false, cha: true },
      },
    }, srdClass("Druid"));

    expect(updated.sheet.savingThrows).toEqual({
      str: false,
      dex: false,
      con: false,
      int: true,
      wis: true,
      cha: false,
    });
  });

  it("surfaces Druid skill recommendations and preserves guided skill limits", () => {
    const druid = srdClass("Druid");

    expect(recommendedSkillLabels(druid)).toEqual(["Animal Handling", "Nature", "Perception", "Survival"]);
    expect(canChooseSkill({ animalHandling: true, nature: true }, "perception", druid?.skillChoiceCount ?? 0, true)).toBe(false);
    expect(canChooseSkill({ animalHandling: true, nature: true }, "perception", druid?.skillChoiceCount ?? 0, false)).toBe(true);
  });

  it("explains combat empty states before equipment creates attacks or weapons", () => {
    expect(combatEmptyStates.attacks).toBe("No attacks generated yet. Equipment choices come next.");
    expect(combatEmptyStates.weapons).toBe("No weapons selected yet.");
    expect(combatEmptyStates.damageNotes).toBe("Optional combat reminders. Equipment and spells may add notes later.");
  });

  it("expands SRD equipment categories before inventory creation", () => {
    expect(isPlaceholderEquipment("simple-weapon")).toBe(true);
    expect(expandedEquipmentOptions("simple-weapon")).toEqual(expect.arrayContaining(["club", "dagger", "quarterstaff", "spear"]));
    expect(optionMatchesSelection("simple-weapon", "dagger")).toBe(true);
    expect(optionMatchesSelection("simple-weapon", "wooden-shield")).toBe(false);
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

  it("summarizes review choices for a beginner pre-create check", () => {
    const draft = {
      ...createEmptyCreationDraft(),
      equipment: [
        { id: crypto.randomUUID(), name: "Dagger", quantity: 1, notes: "", equipped: false, source: "SRD" as const, sourceId: "druid-equipment-2:dagger" },
        { id: crypto.randomUUID(), name: "Explorer's Pack", quantity: 1, notes: "", equipped: false, source: "SRD" as const, sourceId: "druid-equipment-3:explorers-pack" },
      ],
      sheet: {
        ...createEmptyCreationDraft().sheet,
        savingThrows: { str: false, dex: false, con: false, int: true, wis: true, cha: false },
        skillProficiencies: { ...createEmptyCreationDraft().sheet.skillProficiencies, animalHandling: true, perception: true },
        cantrips: "Guidance",
        preparedSpells: "Cure Wounds",
      },
    };

    expect(reviewSummary(draft)).toEqual(expect.objectContaining({
      savingThrows: ["INT", "WIS"],
      skills: ["Animal Handling", "Perception"],
      equipment: ["Dagger", "Explorer's Pack"],
      weapons: ["Dagger"],
      cantrips: ["Guidance"],
      spells: ["Cure Wounds"],
    }));
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
