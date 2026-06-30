import { beforeEach, describe, expect, it } from "vitest";
import { createCharacterBackup, createVaultBackup, restoreVaultBackup, validateVaultBackup } from "./backups";
import { db } from "./database";
import { createCharacter } from "./characters";
import { createInventoryItem, ensureDefaultContainers, saveInventoryItem } from "./inventory";
import { createEmptyCharacterSheet, saveCharacterSheet } from "./characterSheets";
import { createSpell, saveSpell, setSpellPinned } from "./spellbooks";

describe("manual backup and restore", () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
  });

  it("restores validated records and rejects modified backup payloads", async () => {
    const character = await createCharacter({ name: "Backup Hero", summary: "Local notes", playerName: "", campaign: "", ancestry: "", characterClass: "", level: 3 });
    const spell = await createSpell(character.id, "Backup Ward");
    await setSpellPinned(character.id, spell.id, true);
    const backup = await createVaultBackup(false);
    await db.characters.clear();
    await restoreVaultBackup(backup, "new");
    expect((await db.characters.get(character.id))?.summary).toBe("Local notes");
    expect((await db.spellbooks.get(character.id))?.pinnedSpellIds).toEqual([spell.id]);
    expect((await db.spells.get(spell.id))?.name).toBe("Backup Ward");

    const tampered = structuredClone(backup);
    tampered.payload.characters[0].name = "Changed";
    await expect(validateVaultBackup(tampered)).rejects.toThrow("checksum");
  });

  it("upgrades version 1 backups with an empty spellbook collection", async () => {
    const backup = await createVaultBackup(false);
    const legacyPayload = structuredClone(backup.payload) as Partial<typeof backup.payload>;
    delete legacyPayload.spellbooks;
    delete legacyPayload.spells;
    delete legacyPayload.characterCreationDrafts;
    const bytes = new TextEncoder().encode(JSON.stringify(legacyPayload));
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    const checksum = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
    const upgraded = await validateVaultBackup({ ...backup, formatVersion: 1, payload: legacyPayload, checksum });
    expect(upgraded.formatVersion).toBe(3);
    expect(upgraded.payload.spells).toEqual([]);
  });

  it("upgrades version 2 backups with an empty creation draft collection", async () => {
    const backup = await createVaultBackup(false);
    const legacyPayload = structuredClone(backup.payload) as Partial<typeof backup.payload>;
    delete legacyPayload.characterCreationDrafts;
    const bytes = new TextEncoder().encode(JSON.stringify(legacyPayload));
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    const checksum = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
    const upgraded = await validateVaultBackup({ ...backup, formatVersion: 2, payload: legacyPayload, checksum });
    expect(upgraded.formatVersion).toBe(3);
    expect(upgraded.payload.characterCreationDrafts).toEqual([]);
  });

  it("exports one character without including another character's records", async () => {
    const first = await createCharacter({ name: "Solo Backup", summary: "", playerName: "", campaign: "", ancestry: "", characterClass: "", level: 1 });
    const second = await createCharacter({ name: "Other Hero", summary: "", playerName: "", campaign: "", ancestry: "", characterClass: "", level: 1 });
    const firstSpell = await createSpell(first.id, "Solo Ward");
    await createSpell(second.id, "Other Ward");

    const backup = await createCharacterBackup(first.id);

    expect(backup.payload.characters.map((character) => character.name)).toEqual(["Solo Backup"]);
    expect(backup.payload.spells.map((spell) => spell.id)).toEqual([firstSpell.id]);
    expect(backup.includesPdfs).toBe(false);
  });

  it("imports an exported character backup into an empty vault with sheet, spells, layout, notes, and inventory", async () => {
    const cloud = await createCharacter({ name: "Cloud", summary: "Storm druid", playerName: "Yitzak", campaign: "Sunday", ancestry: "Human", characterClass: "Druid", portraitDataUrl: "data:image/jpeg;base64,cloud", level: 4 });
    await saveCharacterSheet({
      ...createEmptyCharacterSheet(cloud.id),
      abilityScores: { str: 10, dex: 14, con: 12, int: 15, wis: 20, cha: 10 },
      currentHp: 17,
      maxHp: 31,
      temporaryHp: 4,
      notes: "Concentrating on Call Lightning.",
      sheetLayoutOrder: ["spells", "roll-helper", "health-combat"],
    });
    const spell = await createSpell(cloud.id, "Call Lightning");
    await saveSpell({ ...spell, level: 3, school: "Conjuration", description: "Storm cloud follows Cloud." });
    const mainContainer = (await ensureDefaultContainers(cloud.id)).find((container) => container.name === "Main Inventory")!;
    const staff = await createInventoryItem(cloud.id, mainContainer.id, "Storm Staff");
    await saveInventoryItem({ ...staff, quantity: 1, category: "Arcane focus", effectsAndStats: "+1 spell attack", favorite: true });

    const backup = await createCharacterBackup(cloud.id);
    const transferredFileContents = JSON.stringify(backup);

    await db.delete();
    await db.open();
    const imported = await validateVaultBackup(JSON.parse(transferredFileContents) as unknown);
    await restoreVaultBackup(imported, "merge-skip");

    const restoredCharacter = await db.characters.get(cloud.id);
    const restoredSheet = await db.characterSheets.get(cloud.id);
    const restoredSpells = await db.spells.where("characterId").equals(cloud.id).toArray();
    const restoredItems = await db.inventoryItems.where("characterId").equals(cloud.id).toArray();

    expect(restoredCharacter?.name).toBe("Cloud");
    expect(restoredCharacter?.portraitDataUrl).toBe("data:image/jpeg;base64,cloud");
    expect(restoredSheet?.abilityScores).toMatchObject({ str: 10, dex: 14, con: 12, int: 15, wis: 20, cha: 10 });
    expect(restoredSheet).toMatchObject({ currentHp: 17, maxHp: 31, temporaryHp: 4, notes: "Concentrating on Call Lightning." });
    expect(restoredSheet?.sheetLayoutOrder).toEqual(["spells", "roll-helper", "health-combat"]);
    expect(restoredSpells).toEqual([expect.objectContaining({ name: "Call Lightning", level: 3, description: "Storm cloud follows Cloud." })]);
    expect(restoredItems).toEqual([expect.objectContaining({ name: "Storm Staff", category: "Arcane focus", effectsAndStats: "+1 spell attack", favorite: true })]);
  });
});
