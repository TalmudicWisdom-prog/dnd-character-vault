import { describe, expect, it } from "vitest";
import { abilityModifier, proficiencyBonusForLevel } from "../../domain/dndMath";
import { srdClass } from "../../rules/srd";
import { createEmptyCreationDraft } from "../../storage/characterCreation";
import {
  canChooseSkill,
  classSavingThrowRecord,
  guidedReviewWarnings,
  modeLabel,
  selectedSkillCount,
  suggestedMaxHp,
} from "./creationMode";

describe("character creation mode helpers", () => {
  it("labels guided and manual modes clearly", () => {
    expect(modeLabel("guided")).toBe("Guided");
    expect(modeLabel("manual")).toBe("Manual");
  });

  it("counts and limits guided skill choices", () => {
    const selected = { arcana: true, history: true };
    expect(selectedSkillCount(selected)).toBe(2);
    expect(canChooseSkill(selected, "insight", 2, true)).toBe(false);
    expect(canChooseSkill(selected, "insight", 2, false)).toBe(true);
  });

  it("suggests max HP from hit die, level, and constitution", () => {
    expect(abilityModifier(14)).toBe(2);
    expect(suggestedMaxHp(3, 10, 14)).toBe(28);
  });

  it("applies class saving throw suggestions without clearing existing choices", () => {
    const fighter = srdClass("Fighter");
    const saves = classSavingThrowRecord({ dex: true }, fighter);
    expect(saves.dex).toBe(true);
    expect(saves.str).toBe(true);
    expect(saves.con).toBe(true);
  });

  it("surfaces guided review warnings for incomplete or mismatched drafts", () => {
    const draft = createEmptyCreationDraft();
    const warnings = guidedReviewWarnings({
      ...draft,
      character: { ...draft.character, level: 5 },
      sheet: { ...draft.sheet, proficiencyBonus: 2 },
    }, srdClass("Wizard"));

    expect(proficiencyBonusForLevel(5)).toBe(3);
    expect(warnings).toEqual(expect.arrayContaining([
      "Character name is missing.",
      "Class is missing.",
      "Species / ancestry is missing.",
      "Proficiency bonus does not match the character level.",
      "Ability scores still look like default placeholders.",
      "Standard Array has unassigned scores.",
    ]));
  });
});
