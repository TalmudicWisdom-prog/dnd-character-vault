import { describe, expect, it } from "vitest";
import { extractCharacterText } from "./extract";

describe("character sheet extraction review", () => {
  it("extracts common character fields and marks missing fields for review", () => {
    const draft = extractCharacterText(`
Character Name: Mira Stone
Player Name: Yitzak
Class & Level: Fighter 7
Species: Human
Background: Soldier
Strength 18
Dexterity 12
Constitution 16
Armor Class: 19
Speed: 30
Inventory
Longsword
Shield
Features & Traits
Second Wind
`, "mira.pdf");

    expect(draft.name.value).toBe("Mira Stone");
    expect(draft.level.value).toBe(7);
    expect(draft.abilityScores.str.value).toBe(18);
    expect(draft.inventory.value).toContain("Longsword");
    expect(draft.currentHp.needsReview).toBe(true);
    expect(draft.currentHp.include).toBe(false);
  });
});
