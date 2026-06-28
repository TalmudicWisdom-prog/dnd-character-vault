import { describe, expect, it } from "vitest";
import { createEmptyCharacterSheet } from "../storage/characterSheets";
import { buildRollAssistantRows, savingThrowBonus } from "./rollAssistant";

describe("what do I roll assistant", () => {
  it("uses stored saving throw proficiencies without class assumptions", () => {
    const sheet = createEmptyCharacterSheet(crypto.randomUUID());
    sheet.abilityScores.wis = 18;
    sheet.proficiencyBonus = 5;
    sheet.savingThrows.wis = true;
    sheet.savingThrows.int = false;

    expect(savingThrowBonus(sheet, "wis")).toBe(9);
    expect(savingThrowBonus(sheet, "int")).toBe(0);
    expect(buildRollAssistantRows(sheet).find((row) => row.id === "wis-save")).toMatchObject({
      label: "Wisdom Save",
      formula: "d20+9",
      bonus: 9,
    });
  });

  it("extracts a weapon d20 formula from character notes when available", () => {
    const sheet = createEmptyCharacterSheet(crypto.randomUUID());
    sheet.attacks = "Gunblade attack d20+7";

    expect(buildRollAssistantRows(sheet).find((row) => row.id === "weapon-attack")).toMatchObject({
      formula: "d20+7",
      bonus: 7,
    });
  });
});
