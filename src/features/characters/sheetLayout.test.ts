import { beforeEach, describe, expect, it } from "vitest";
import { db } from "../../storage/database";
import { createCharacter } from "../../storage/characters";
import { createEmptyCharacterSheet, getOrCreateCharacterSheet, saveCharacterSheet } from "../../storage/characterSheets";
import {
  defaultSheetLayoutOrder,
  moveSheetLayoutSection,
  normalizeSheetLayoutOrder,
} from "./sheetLayout";

describe("character sheet layout customization", () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
  });

  it("uses the default layout order when no custom order is saved", () => {
    expect(normalizeSheetLayoutOrder()).toEqual([...defaultSheetLayoutOrder]);
  });

  it("saves custom layout order per character", async () => {
    const character = await createCharacter({ name: "Willow", characterClass: "Druid", ancestry: "Human" });
    const sheet = createEmptyCharacterSheet(character.id);
    const customOrder = moveSheetLayoutSection(sheet.sheetLayoutOrder, "spells", "up");

    await saveCharacterSheet({ ...sheet, sheetLayoutOrder: customOrder });
    const reloaded = await getOrCreateCharacterSheet(character.id);

    expect(normalizeSheetLayoutOrder(reloaded.sheetLayoutOrder).slice(0, 3)).toEqual(["health-combat", "roll-helper", "attacks"]);
    expect(normalizeSheetLayoutOrder(reloaded.sheetLayoutOrder).indexOf("spells")).toBe(defaultSheetLayoutOrder.indexOf("spells") - 1);
  });

  it("reset layout restores the default order for that character", async () => {
    const character = await createCharacter({ name: "Bram", characterClass: "Fighter", ancestry: "Dwarf" });
    const sheet = createEmptyCharacterSheet(character.id);

    await saveCharacterSheet({ ...sheet, sheetLayoutOrder: moveSheetLayoutSection(sheet.sheetLayoutOrder, "health-combat", "up") });
    const reset = await saveCharacterSheet({ ...(await getOrCreateCharacterSheet(character.id)), sheetLayoutOrder: [] });

    expect(normalizeSheetLayoutOrder(reset.sheetLayoutOrder)).toEqual([...defaultSheetLayoutOrder]);
  });

  it("custom layout does not affect another character", async () => {
    const druid = await createCharacter({ name: "Moss", characterClass: "Druid", ancestry: "Elf" });
    const rogue = await createCharacter({ name: "Shade", characterClass: "Rogue", ancestry: "Halfling" });
    const druidSheet = createEmptyCharacterSheet(druid.id);
    const rogueSheet = createEmptyCharacterSheet(rogue.id);

    await saveCharacterSheet({ ...druidSheet, sheetLayoutOrder: moveSheetLayoutSection(druidSheet.sheetLayoutOrder, "spells", "up") });
    await saveCharacterSheet(rogueSheet);

    const savedDruid = await getOrCreateCharacterSheet(druid.id);
    const savedRogue = await getOrCreateCharacterSheet(rogue.id);

    expect(normalizeSheetLayoutOrder(savedDruid.sheetLayoutOrder)).not.toEqual(normalizeSheetLayoutOrder(savedRogue.sheetLayoutOrder));
    expect(normalizeSheetLayoutOrder(savedRogue.sheetLayoutOrder)).toEqual([...defaultSheetLayoutOrder]);
  });
});
