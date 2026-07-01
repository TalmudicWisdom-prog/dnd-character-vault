import { beforeEach, describe, expect, it } from "vitest";
import { db } from "../../storage/database";
import { createCharacter } from "../../storage/characters";
import { createEmptyCharacterSheet, getOrCreateCharacterSheet, saveCharacterSheet } from "../../storage/characterSheets";
import {
  chooseSheetNavigatorSection,
  closeSheetNavigator,
  defaultSheetLayoutOrder,
  livePlayShortcutSections,
  majorGameplayModuleSections,
  moveSheetLayoutSection,
  normalizeSheetLayoutOrder,
  openSheetNavigator,
  selectSheetNavigatorSection,
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

  it("keeps live play shortcuts focused on valid gameplay sections", () => {
    expect(livePlayShortcutSections.map((section) => section.id)).toEqual([
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
    expect(livePlayShortcutSections.every((section) => defaultSheetLayoutOrder.includes(section.id))).toBe(true);
  });

  it("points shortcut navigation at stable sheet section DOM IDs", () => {
    expect(livePlayShortcutSections.map((section) => section.targetId)).toEqual(
      livePlayShortcutSections.map((section) => sheetSectionDomId(section.id)),
    );
    expect(livePlayShortcutSections.every((section) => section.targetId.startsWith("sheet-section-"))).toBe(true);
  });

  it("defines navigator options for every major live sheet area", () => {
    expect(sheetNavigatorSections.map((section) => section.label)).toEqual([
      "Dashboard",
      "Abilities, Saves, Senses",
      "Skills",
      "Actions",
      "Spells",
      "Inventory",
      "Speed & Defenses",
      "Features & Traits",
      "Proficiencies & Training",
      "Background / Biography",
      "Notes",
      "Dice / Rolls",
      "HP / Combat",
    ]);
    expect(sheetNavigatorSections.every((section) => section.targetId.startsWith("sheet-section-"))).toBe(true);
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
