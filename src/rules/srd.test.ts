import { describe, expect, it } from "vitest";
import { proficiencyBonusForLevel } from "../domain/dndMath";
import { srdAbilities, srdClass, srdProficiencyBonusByLevel, srdSkill } from "./srd";
import { levelUpPreview } from "./levelUp";

describe("SRD helper foundation", () => {
  it("provides ability and skill helper text", () => {
    expect(srdAbilities.find((ability) => ability.id === "str")?.description).toContain("Physical power");
    expect(srdSkill("perception")).toMatchObject({ ability: "wis", source: "SRD" });
  });

  it("provides class helper data for the character wizard", () => {
    const wizard = srdClass("Wizard");
    expect(wizard?.primaryAbilities).toEqual(["int"]);
    expect(wizard?.description).toContain("spellbook");
    expect(wizard?.source).toBe("SRD");
  });

  it("matches the app proficiency bonus calculation", () => {
    for (const entry of srdProficiencyBonusByLevel) {
      expect(entry.bonus).toBe(proficiencyBonusForLevel(entry.level));
    }
  });

  it("previews level-up changes without automating them", () => {
    const preview = levelUpPreview(4);
    expect(preview.nextLevel).toBe(5);
    expect(preview.proficiencyChanges).toBe(true);
    expect(preview.fields).toContain("Max HP");
    expect(preview.fields).toContain("Ability score improvements / feats");
  });
});
