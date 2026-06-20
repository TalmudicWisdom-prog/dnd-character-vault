import { describe, expect, it } from "vitest";
import { abilityModifier, proficiencyBonusForLevel } from "./dndMath";

describe("D&D math helpers", () => {
  it("calculates ability modifiers", () => {
    expect(abilityModifier(8)).toBe(-1);
    expect(abilityModifier(10)).toBe(0);
    expect(abilityModifier(13)).toBe(1);
    expect(abilityModifier(18)).toBe(4);
  });

  it("calculates proficiency bonus by level", () => {
    expect(proficiencyBonusForLevel(1)).toBe(2);
    expect(proficiencyBonusForLevel(5)).toBe(3);
    expect(proficiencyBonusForLevel(9)).toBe(4);
    expect(proficiencyBonusForLevel(13)).toBe(5);
    expect(proficiencyBonusForLevel(17)).toBe(6);
  });
});
