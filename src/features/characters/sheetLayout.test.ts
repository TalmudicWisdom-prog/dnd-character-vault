import { beforeEach, describe, expect, it } from "vitest";
import { db } from "../../storage/database";
import { createCharacter } from "../../storage/characters";
import { createEmptyCharacterSheet, getOrCreateCharacterSheet, saveCharacterSheet } from "../../storage/characterSheets";
import {
  chooseSheetNavigatorSection,
  closeSheetNavigator,
  defaultSheetLayoutOrder,
  majorGameplayModuleSections,
  moveSheetLayoutSection,
  normalizeSheetLayoutOrder,
  openSheetNavigator,
  selectSheetNavigatorSection,
  sheetSectionScrollBehavior,
  sheetNavigatorSections,
  sheetSectionDomId,
} from "./sheetLayout";

describe("character sheet layout customization", () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
  });

  it("uses the default layout order when no custom order is saved", () => {
    expect(normalizeSheetLayoutOrder()).toEqual([...defaultSheetLayoutOrder]);
  });

  it("defines navigator options for every major live sheet area", () => {
    expect(sheetNavigatorSections.map((section) => section.label)).toEqual([
      "Dashboard",
      "HP / Combat",
      "Abilities, Saves, Senses",
      "Skills",
      "Speed & Defenses",
      "Rolls",
      "Dice",
      "Actions",
      "Spells",
      "Inventory",
      "Features & Traits",
      "Proficiencies & Training",
      "Background / Biography",
      "Notes",
      "Book / PDF",
      "Layout",
    ]);
    expect(sheetNavigatorSections.every((section) => section.targetId.startsWith("sheet-section-"))).toBe(true);
    expect(sheetNavigatorSections.every((section) => section.shortLabel && section.icon)).toBe(true);
    expect(new Set(sheetNavigatorSections.map((section) => section.id)).size).toBe(sheetNavigatorSections.length);
    expect(new Set(sheetNavigatorSections.map((section) => section.targetId)).size).toBe(sheetNavigatorSections.length);
  });

  it("uses the grid navigator as the only live play shortcut surface", () => {
    const navigatorIds = sheetNavigatorSections.map((section) => section.id);

    expect(majorGameplayModuleSections.every((section) => navigatorIds.includes(section))).toBe(true);
    expect(sheetNavigatorSections.find((section) => section.id === "roll-helper")?.label).toBe("Rolls");
    expect(sheetNavigatorSections.find((section) => section.id === "dice")?.label).toBe("Dice");
  });

  it("opens and closes the sheet navigator modal state", () => {
    const opened = openSheetNavigator({ open: false });
    expect(opened.open).toBe(true);

    const closed = closeSheetNavigator(opened);
    expect(closed.open).toBe(false);
  });

  it("selects a navigator section without changing the character sheet route", () => {
    const currentRoute = "#sheet/character-123";
    const selected = selectSheetNavigatorSection("inventory", currentRoute);

    expect(selected).toEqual({
      targetId: sheetSectionDomId("inventory"),
      routeHash: currentRoute,
    });
  });

  it("uses immediate section navigation when reduced motion is requested", () => {
    expect(sheetSectionScrollBehavior(false)).toBe("smooth");
    expect(sheetSectionScrollBehavior(true)).toBe("auto");
  });

  it("closes the navigator and returns the intended scroll target when a section is chosen", () => {
    const result = chooseSheetNavigatorSection({ open: true }, "skills", "#sheet/character-123");

    expect(result.state.open).toBe(false);
    expect(result.routeHash).toBe("#sheet/character-123");
    expect(result.targetId).toBe("sheet-section-skills");
  });

  it("keeps every major gameplay module available in phone layouts", () => {
    const normalized = normalizeSheetLayoutOrder(["spells", "health-combat"]);

    expect(majorGameplayModuleSections).toEqual([
      "health-combat",
      "roll-helper",
      "dice",
      "attacks",
      "spells",
      "inventory",
      "features",
      "notes",
      "roleplay",
    ]);
    expect(majorGameplayModuleSections.every((section) => normalized.includes(section))).toBe(true);
  });

  it("keeps structural abilities and saves out of the draggable gameplay order", () => {
    const normalized = normalizeSheetLayoutOrder(["abilities", "proficiencies", "spells"]);

    expect(defaultSheetLayoutOrder).not.toContain("abilities");
    expect(defaultSheetLayoutOrder).not.toContain("proficiencies");
    expect(normalized).not.toContain("abilities");
    expect(normalized).not.toContain("proficiencies");
    expect(normalized[0]).toBe("spells");
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
