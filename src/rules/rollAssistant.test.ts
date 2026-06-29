import { describe, expect, it } from "vitest";
import { createEmptyCharacterSheet } from "../storage/characterSheets";
import { buildRollAssistantRows, initiativeBonus, savingThrowBonus } from "./rollAssistant";

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

  it("calculates initiative from Dexterity and saves from the matching ability only", () => {
    const sheet = createEmptyCharacterSheet(crypto.randomUUID());
    sheet.abilityScores = { str: 10, dex: 14, con: 12, int: 15, wis: 20, cha: 10 };
    sheet.proficiencyBonus = 2;
    sheet.initiative = "125" as unknown as number;
    sheet.savingThrows = { str: false, dex: false, con: false, int: false, wis: true, cha: false };

    const rows = Object.fromEntries(buildRollAssistantRows(sheet).map((row) => [row.id, row]));

    expect(initiativeBonus(sheet)).toBe(2);
    expect(rows.initiative).toMatchObject({ formula: "d20+2", bonus: 2 });
    expect(rows["str-save"]).toMatchObject({ formula: "d20+0", bonus: 0 });
    expect(rows["dex-save"]).toMatchObject({ formula: "d20+2", bonus: 2 });
    expect(rows["con-save"]).toMatchObject({ formula: "d20+1", bonus: 1 });
    expect(rows["int-save"]).toMatchObject({ formula: "d20+2", bonus: 2 });
    expect(rows["wis-save"]).toMatchObject({ formula: "d20+7", bonus: 7 });
    expect(rows["cha-save"]).toMatchObject({ formula: "d20+0", bonus: 0 });
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
