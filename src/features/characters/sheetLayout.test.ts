import { beforeEach, describe, expect, it } from "vitest";
import { db } from "../../storage/database";
import { createCharacter } from "../../storage/characters";
import { createEmptyCharacterSheet, getOrCreateCharacterSheet, saveCharacterSheet } from "../../storage/characterSheets";
import {
  characterMenuIntent,
  characterMenuItems,
  chooseSheetNavigatorSection,
  closeSheetNavigator,
  defaultSheetLayoutOrder,
  hudModuleIsAvailable,
  majorGameplayModuleSections,
  moveSheetLayoutSection,
  normalizeSheetLayoutOrder,
  normalizeSheetModuleVisibility,
  openSheetNavigator,
  selectSheetNavigatorSection,
  setSheetModuleVisibility,
  sheetModuleDefinitions,
  sheetSectionScrollBehavior,
  sheetNavigatorSections,
  visibleSheetLayoutOrder,
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
    ]);
    expect(sheetNavigatorSections.every((section) => section.targetId.startsWith("sheet-section-"))).toBe(true);
    expect(sheetNavigatorSections.every((section) => section.shortLabel && section.icon)).toBe(true);
    expect(new Set(sheetNavigatorSections.map((section) => section.id)).size).toBe(sheetNavigatorSections.length);
    expect(new Set(sheetNavigatorSections.map((section) => section.targetId)).size).toBe(sheetNavigatorSections.length);
  });

  it("classifies the live-play menu explicitly instead of inferring behavior from labels", () => {
    expect(characterMenuItems.filter((item) => item.kind === "action").map((item) => item.label)).toEqual([
      "Character Identity",
      "Armor Class",
      "Initiative",
      "HP / Combat",
      "Conditions",
      "Heroic Inspiration",
      "Speed, Hit Dice & Death Saves",
      "Ability Scores",
      "Saving Throws",
      "Senses",
      "Skills",
      "Roll Assistant",
      "Actions",
      "Dice Roller",
      "Notes",
      "Features & Traits",
      "Inventory",
      "Soul Reaper",
      "Next Level Preview",
      "Background / Biography",
      "Proficiencies & Training",
      "Export Character",
      "Layout Customizer",
      "Edit Portrait",
    ]);
    expect(characterMenuItems.filter((item) => item.kind === "route").map((item) => item.label)).toEqual([
      "Spellbook",
      "PDF Library",
      "Profile",
    ]);
    expect(new Set(characterMenuItems.map((item) => item.id)).size).toBe(characterMenuItems.length);
  });

  it("derives every customizable HUD module and command-menu destination from one registry", () => {
    expect(defaultSheetLayoutOrder).toEqual(sheetModuleDefinitions.map((module) => module.id));
    expect(sheetModuleDefinitions.every((module) => characterMenuItems.some((item) => item.id === module.menu.id))).toBe(true);
  });

  it("uses registry availability instead of character names for attached modules", () => {
    expect(hudModuleIsAvailable("soul-reaper", { soulReaperAttached: false })).toBe(false);
    expect(hudModuleIsAvailable("soul-reaper", { soulReaperAttached: true })).toBe(true);
    expect(hudModuleIsAvailable("inventory", { soulReaperAttached: false })).toBe(true);
  });

  it("resolves tools directly to overlays, routes, or export without an intermediate scroll", () => {
    const item = (id: string) => characterMenuItems.find((candidate) => candidate.id === id)!;
    const characterId = "character-123";

    expect(characterMenuIntent(item("dice"), characterId)).toEqual({ kind: "overlay", targetId: "dice", enableLayoutEditing: false });
    expect(characterMenuIntent(item("inventory"), characterId)).toEqual({ kind: "overlay", targetId: "inventory", enableLayoutEditing: false });
    expect(characterMenuIntent(item("identity"), characterId)).toEqual({ kind: "overlay", targetId: "identity", enableLayoutEditing: false });
    expect(characterMenuIntent(item("level-preview"), characterId)).toEqual({ kind: "overlay", targetId: "level-preview", enableLayoutEditing: false });
    expect(characterMenuIntent(item("edit-portrait"), characterId)).toEqual({ kind: "overlay", targetId: "portrait", enableLayoutEditing: false });
    expect(characterMenuIntent(item("layout"), characterId)).toEqual({ kind: "overlay", targetId: "layout", enableLayoutEditing: true });
    expect(characterMenuIntent(item("spellbook"), characterId)).toEqual({ kind: "route", hash: "#spellbook/character-123" });
    expect(characterMenuIntent(item("profile"), characterId)).toEqual({ kind: "route", hash: "#character/character-123" });
    expect(characterMenuIntent(item("pdf-library"), characterId)).toEqual({ kind: "route", hash: "#library" });
    expect(characterMenuIntent(item("export"), characterId)).toEqual({ kind: "export" });
    expect(characterMenuItems.filter((candidate) => candidate.kind !== "section").every((candidate) => characterMenuIntent(candidate, characterId).kind !== "section")).toBe(true);
  });

  it("uses the active character id for character-scoped direct routes", () => {
    const spellbook = characterMenuItems.find((item) => item.id === "spellbook")!;
    const profile = characterMenuItems.find((item) => item.id === "profile")!;

    expect(characterMenuIntent(spellbook, "cloud")).toEqual({ kind: "route", hash: "#spellbook/cloud" });
    expect(characterMenuIntent(spellbook, "luna")).toEqual({ kind: "route", hash: "#spellbook/luna" });
    expect(characterMenuIntent(profile, "luna")).toEqual({ kind: "route", hash: "#character/luna" });
  });

  it("opens and closes the sheet navigator modal state", () => {
    const opened = openSheetNavigator({ open: false });
    expect(opened.open).toBe(true);

    const closed = closeSheetNavigator(opened);
    expect(closed.open).toBe(false);
  });

  it("selects a navigator section without changing the character sheet route", () => {
    const currentRoute = "#sheet/character-123";
    const selected = selectSheetNavigatorSection("dashboard", currentRoute);

    expect(selected).toEqual({
      targetId: "sheet-section-dashboard",
      routeHash: currentRoute,
    });
  });

  it("uses immediate section navigation when reduced motion is requested", () => {
    expect(sheetSectionScrollBehavior(false)).toBe("smooth");
    expect(sheetSectionScrollBehavior(true)).toBe("auto");
  });

  it("closes the navigator and returns the intended scroll target when a section is chosen", () => {
    const result = chooseSheetNavigatorSection({ open: true }, "dashboard", "#sheet/character-123");

    expect(result.state.open).toBe(false);
    expect(result.routeHash).toBe("#sheet/character-123");
    expect(result.targetId).toBe("sheet-section-dashboard");
  });

  it("keeps every major gameplay module available in phone layouts", () => {
    const normalized = normalizeSheetLayoutOrder(["spells", "health-combat"]);

    expect(majorGameplayModuleSections).toEqual([
      "identity",
      "health-combat",
      "conditions",
      "abilities",
      "saving-throws",
      "senses",
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

  it("shows, hides, and restores modules without changing their saved order", () => {
    const customOrder = normalizeSheetLayoutOrder(["inventory", "spells", "health-combat"]);
    const hiddenSpells = setSheetModuleVisibility({}, "spells", false);

    expect(normalizeSheetModuleVisibility(hiddenSpells).spells).toBe(false);
    expect(visibleSheetLayoutOrder(customOrder, hiddenSpells)).not.toContain("spells");
    expect(visibleSheetLayoutOrder(customOrder, hiddenSpells)[0]).toBe("inventory");
    expect(normalizeSheetLayoutOrder(customOrder)).toContain("spells");
    expect(normalizeSheetModuleVisibility({}).spells).toBe(true);
  });

  it("includes universal instruments in the draggable order and drops unknown legacy ids", () => {
    const normalized = normalizeSheetLayoutOrder(["abilities", "proficiencies", "spells"]);

    expect(defaultSheetLayoutOrder).toContain("abilities");
    expect(defaultSheetLayoutOrder).toContain("saving-throws");
    expect(defaultSheetLayoutOrder).not.toContain("proficiencies");
    expect(normalized).toContain("abilities");
    expect(normalized).not.toContain("proficiencies");
    expect(normalized[0]).toBe("abilities");
  });

  it("saves custom layout order per character", async () => {
    const character = await createCharacter({ name: "Willow", characterClass: "Druid", ancestry: "Human" });
    const sheet = createEmptyCharacterSheet(character.id);
    const customOrder = moveSheetLayoutSection(sheet.sheetLayoutOrder, "spells", "up");

    await saveCharacterSheet({ ...sheet, sheetLayoutOrder: customOrder });
    const reloaded = await getOrCreateCharacterSheet(character.id);

    expect(normalizeSheetLayoutOrder(reloaded.sheetLayoutOrder).slice(0, 3)).toEqual(["identity", "armor-class", "initiative"]);
    expect(normalizeSheetLayoutOrder(reloaded.sheetLayoutOrder).indexOf("spells")).toBe(defaultSheetLayoutOrder.indexOf("spells") - 1);
  });

  it("persists visibility per character while preserving hidden module data", async () => {
    const cloud = await createCharacter({ name: "Cloud", characterClass: "Soul Reaper", ancestry: "Human" });
    const akiva = await createCharacter({ name: "Akiva", characterClass: "Fighter", ancestry: "Human" });
    const cloudSheet = createEmptyCharacterSheet(cloud.id);
    const akivaSheet = createEmptyCharacterSheet(akiva.id);

    await saveCharacterSheet({
      ...cloudSheet,
      notes: "Cloud's private combat notes remain intact.",
      sheetModuleVisibility: { spells: false, notes: false, "soul-reaper": true },
    });
    await saveCharacterSheet({
      ...akivaSheet,
      sheetModuleVisibility: { spells: true, notes: true, "soul-reaper": false },
    });

    const reloadedCloud = await getOrCreateCharacterSheet(cloud.id);
    const reloadedAkiva = await getOrCreateCharacterSheet(akiva.id);
    expect(normalizeSheetModuleVisibility(reloadedCloud.sheetModuleVisibility)).toMatchObject({ spells: false, notes: false, "soul-reaper": true });
    expect(reloadedCloud.notes).toBe("Cloud's private combat notes remain intact.");
    expect(normalizeSheetModuleVisibility(reloadedAkiva.sheetModuleVisibility)).toMatchObject({ spells: true, notes: true, "soul-reaper": false });
  });

  it("reset layout restores the default order for that character", async () => {
    const character = await createCharacter({ name: "Bram", characterClass: "Fighter", ancestry: "Dwarf" });
    const sheet = createEmptyCharacterSheet(character.id);

    await saveCharacterSheet({ ...sheet, sheetLayoutOrder: moveSheetLayoutSection(sheet.sheetLayoutOrder, "health-combat", "up") });
    const reset = await saveCharacterSheet({ ...(await getOrCreateCharacterSheet(character.id)), sheetLayoutOrder: [], sheetModuleVisibility: {} });

    expect(normalizeSheetLayoutOrder(reset.sheetLayoutOrder)).toEqual([...defaultSheetLayoutOrder]);
    expect(normalizeSheetModuleVisibility(reset.sheetModuleVisibility)).toEqual(normalizeSheetModuleVisibility({}));
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
