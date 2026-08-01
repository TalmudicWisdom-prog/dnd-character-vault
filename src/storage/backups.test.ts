import { beforeEach, describe, expect, it } from "vitest";
import { cloneCharacterBackupForImport, createCharacterBackup, createVaultBackup, restoreVaultBackup, validateVaultBackup } from "./backups";
import { db } from "./database";
import { createCharacter } from "./characters";
import { createInventoryItem, ensureDefaultContainers, saveInventoryItem } from "./inventory";
import { createEmptyCharacterSheet, saveCharacterSheet } from "./characterSheets";
import { addReferenceSpell, addSpellFromCatalog, createSpell, saveAndAddReferenceSpell, saveSpell, setSpellPinned } from "./spellbooks";
import { characterSourceClassChoices, findCatalogSpellByName } from "../rules/spellCatalog";

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

  it("imports a character backup as a separate character with remapped child records", async () => {
    const original = await createCharacter({ name: "Twin", characterClass: "Wizard", ancestry: "Elf", level: 4 });
    const spell = await createSpell(original.id, "Mirror Image");
    const backup = await createCharacterBackup(original.id);
    const cloned = await cloneCharacterBackupForImport(backup);
    await restoreVaultBackup(cloned, "merge-skip");

    const imported = cloned.payload.characters[0];
    const importedSpell = cloned.payload.spells[0];
    expect(imported.id).not.toBe(original.id);
    expect(importedSpell.id).not.toBe(spell.id);
    expect(importedSpell.characterId).toBe(imported.id);
    expect(await db.characters.count()).toBe(2);
    expect(await db.spells.get(spell.id)).toMatchObject({ characterId: original.id });
    expect(await db.spells.get(importedSpell.id)).toMatchObject({ characterId: imported.id });
  });

  it("imports an exported character backup into an empty vault with sheet, spells, layout, notes, and inventory", async () => {
    const cloud = await createCharacter({ name: "Cloud", summary: "Storm druid", playerName: "Yitzak", campaign: "Sunday", ancestry: "Human", characterClass: "Druid", portraitDataUrl: "data:image/jpeg;base64,cloud", level: 4 });
    await saveCharacterSheet({
      ...createEmptyCharacterSheet(cloud.id),
      abilityScores: { str: 10, dex: 14, con: 12, int: 15, wis: 20, cha: 10 },
      currentHp: 17,
      maxHp: 31,
      temporaryHp: 4,
      spellSlots: { "1": 4, "3": 2 },
      spellSlotsUsed: { "1": 1, "3": 2 },
      spellSlotRecovery: { "3": { recoverOn: "manual", recoverAmount: "all" } },
      pactMagicSlots: { "2": 2 },
      pactMagicSlotsUsed: { "2": 1 },
      pactMagicRecovery: { "2": { recoverOn: "shortRest", recoverAmount: "all" } },
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
    expect(restoredSheet?.spellSlotsUsed).toMatchObject({ "1": 1, "3": 2 });
    expect(restoredSheet?.spellSlotRecovery["3"]).toMatchObject({ recoverOn: "manual", recoverAmount: "all" });
    expect(restoredSheet?.pactMagicSlotsUsed).toMatchObject({ "2": 1 });
    expect(restoredSheet?.pactMagicRecovery["2"]).toMatchObject({ recoverOn: "shortRest", recoverAmount: "all" });
    expect(restoredSheet?.sheetLayoutOrder).toEqual(["spells", "roll-helper", "health-combat"]);
    expect(restoredSpells).toEqual([expect.objectContaining({ name: "Call Lightning", level: 3, description: "Storm cloud follows Cloud." })]);
    expect(restoredItems).toEqual([expect.objectContaining({ name: "Storm Staff", category: "Arcane focus", effectsAndStats: "+1 spell attack", favorite: true })]);
  });

  it("preserves content-source and class associations in backup and restore", async () => {
    const character = await createCharacter({ name: "FFXIV Caster", summary: "", playerName: "", campaign: "", ancestry: "", characterClass: "Astrologian", level: 3 });
    const aero = findCatalogSpellByName("Aero")!;
    const choice = characterSourceClassChoices("Astrologian", aero).find((candidate) => candidate.sourceClass === "Astrologian")!;
    const spell = await addSpellFromCatalog(character.id, aero, choice);
    const backup = await createCharacterBackup(character.id);

    await db.delete();
    await db.open();
    await restoreVaultBackup(await validateVaultBackup(JSON.parse(JSON.stringify(backup)) as unknown), "new");

    expect(await db.spells.get(spell.id)).toMatchObject({
      definitionId: "ffxiv-companion-dawntrail:aero",
      definitionVersion: "2025-02-18",
      rulesSourceId: "ffxiv-companion-dawntrail",
      contentSourceId: "ffxiv-companion-dawntrail",
      sourceClass: "Astrologian",
      castingAbilityOverride: "wis",
      rulesComplete: true,
    });
  });

  it("preserves a user-completed FFXIV reference definition in backup and restore", async () => {
    const character = await createCharacter({ name: "Reference Caster", summary: "", playerName: "", campaign: "", ancestry: "", characterClass: "Void Mage", level: 3 });
    const arms = findCatalogSpellByName("Arms of Hadar")!;
    const choice = characterSourceClassChoices("Void Mage", arms).find((candidate) => candidate.sourceClass === "Void Mage")!;
    const reference = await addReferenceSpell(character.id, arms, choice);
    const completed = await saveAndAddReferenceSpell({
      ...reference,
      school: "Conjuration",
      castingTime: "1 action",
      actionType: "action",
      range: "10 feet",
      duration: "Instantaneous",
      description: "Local completed rules preserved in a backup.",
      completionReviewed: true,
    });
    const backup = await createCharacterBackup(character.id);

    await db.delete();
    await db.open();
    await restoreVaultBackup(await validateVaultBackup(JSON.parse(JSON.stringify(backup)) as unknown), "new");

    expect(await db.spells.get(completed.id)).toMatchObject({
      referenceDefinitionId: arms.id,
      referenceClasses: expect.arrayContaining(["Void Mage", "Reaper", "Pictomancer"]),
      referenceSourcePages: expect.any(Array),
      sourceClass: "Void Mage",
      rulesComplete: true,
      description: "Local completed rules preserved in a backup.",
    });
  });
});
