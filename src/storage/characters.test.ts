import { beforeEach, describe, expect, it, vi } from "vitest";
import Dexie from "dexie";
import { activateCharacter, activeCharacterId, rankAvailableCharacters } from "../app/activeCharacter";
import { switcherMode } from "../features/characters/CharacterHud";
import { characterInitials } from "../features/characters/CharacterAvatar";
import { createEmptyCharacterSheet, saveCharacterSheet } from "./characterSheets";
import { createCharacter, deleteCharacter, duplicateCharacter, setCharacterArchived, setCharacterFavorite } from "./characters";
import { db } from "./database";
import { createInventoryItem, ensureDefaultContainers, saveInventoryItem } from "./inventory";
import { createSoulReaperProgression } from "./soulReaper";
import { createSpell, setSpellPinned } from "./spellbooks";

function installBrowserStorage() {
  const values = new Map<string, string>();
  const storage = {
    clear: () => values.clear(),
    getItem: (key: string) => values.get(key) ?? null,
    key: (index: number) => [...values.keys()][index] ?? null,
    get length() { return values.size; },
    removeItem: (key: string) => values.delete(key),
    setItem: (key: string, value: string) => values.set(key, value),
  };
  vi.stubGlobal("window", { localStorage: storage, sessionStorage: storage, dispatchEvent: vi.fn() });
}

const draft = (name: string) => ({ name, ancestry: "Human", characterClass: "Wizard", campaign: "Sunday", level: 5 });

describe("multi-character lifecycle", () => {
  beforeEach(async () => {
    vi.unstubAllGlobals();
    installBrowserStorage();
    await db.delete();
    await db.open();
  });

  it("uses the required quick-switch behavior for 1, 2, 3, 6, 12, and 20 characters", () => {
    expect([1, 2, 3, 6, 12, 20].map(switcherMode)).toEqual(["hidden", "direct", "panel", "panel", "panel", "panel"]);
  });

  it("uses reliable initials when a portrait is unavailable or broken", () => {
    expect(characterInitials("Aster Vale")).toBe("AV");
    expect(characterInitials("Cloud")).toBe("CL");
    expect(characterInitials(" ")).toBe("?");
  });

  it("persists the active character and falls back after archive and delete", async () => {
    const first = await createCharacter(draft("First"));
    const second = await createCharacter(draft("Second"));
    const third = await createCharacter(draft("Third"));
    await activateCharacter(second.id);
    expect(activeCharacterId()).toBe(second.id);
    expect((await db.characters.get(second.id))?.lastOpenedAt).toBeTruthy();

    const afterArchive = await setCharacterArchived(second.id, true);
    expect(afterArchive?.id).not.toBe(second.id);
    expect(activeCharacterId()).toBe(afterArchive?.id);

    const afterDelete = await deleteCharacter(afterArchive!.id);
    expect(afterDelete?.id).toBe([first.id, third.id].find((id) => id !== afterArchive?.id));
    expect(activeCharacterId()).toBe(afterDelete?.id);
  });

  it("orders favorites first and otherwise uses last-opened recency", async () => {
    const old = await createCharacter(draft("Old favorite"));
    const recent = await createCharacter(draft("Recent"));
    await db.characters.update(old.id, { lastOpenedAt: "2026-01-01T00:00:00.000Z" });
    await db.characters.update(recent.id, { lastOpenedAt: "2026-07-01T00:00:00.000Z" });
    await setCharacterFavorite(old.id, true);
    expect(rankAvailableCharacters(await db.characters.toArray()).map((character) => character.id)).toEqual([old.id, recent.id]);
  });

  it("keeps all characters and the active preference after an offline-style database reopen", async () => {
    const characters = await Promise.all(Array.from({ length: 6 }, (_, index) => createCharacter(draft(`Hero ${index + 1}`))));
    await activateCharacter(characters[4].id);
    db.close();
    await db.open();
    expect(await db.characters.count()).toBe(6);
    expect(activeCharacterId()).toBe(characters[4].id);
    expect((await db.characters.get(characters[4].id))?.name).toBe("Hero 5");
  });

  it("migrates the released character schema without losing the existing character or sheet link", async () => {
    await db.delete();
    const legacy = new Dexie("dnd-character-vault");
    legacy.version(19).stores({
      characters: "id, name, updatedAt, createdAt, archivedAt",
      characterSheets: "characterId, updatedAt",
    });
    await legacy.open();
    const characterId = crypto.randomUUID();
    const timestamp = new Date().toISOString();
    await legacy.table("characters").put({ ...draft("Legacy Hero"), id: characterId, summary: "Preserved", playerName: "", background: "", concept: "", portraitDataUrl: "", personalityNotes: "", backstory: "", goals: "", importantRelationships: "", roleplayNotes: "", archivedAt: null, createdAt: timestamp, updatedAt: timestamp });
    await legacy.table("characterSheets").put(createEmptyCharacterSheet(characterId));
    legacy.close();

    await db.open();
    expect(await db.characters.get(characterId)).toMatchObject({
      name: "Legacy Hero",
      summary: "Preserved",
      favorite: false,
      lastOpenedAt: null,
      portraitImageId: "",
      portraitTransform: { mode: "cover", zoom: 1, offsetX: 0, offsetY: 0, naturalWidth: null, naturalHeight: null, version: 1, updatedAt: null },
    });
    expect((await db.characterSheets.get(characterId))?.characterId).toBe(characterId);
  });

  it("duplicates sheet, spells, inventory, module data, and PDF links with independent child IDs", async () => {
    const original = await createCharacter(draft("Complete Hero"));
    await saveCharacterSheet({ ...createEmptyCharacterSheet(original.id), notes: "Private notes", currentHp: 17, maxHp: 30 });
    const spell = await createSpell(original.id, "Moon Ward");
    await setSpellPinned(original.id, spell.id, true);
    const main = (await ensureDefaultContainers(original.id))[0];
    const item = await createInventoryItem(original.id, main.id, "Moon Key");
    await saveInventoryItem({ ...item, favorite: true, quantity: 2 });
    const progression = await createSoulReaperProgression(original.id, 5);
    const timestamp = new Date().toISOString();
    const documentId = crypto.randomUUID();
    await db.pdfDocuments.put({ id: documentId, name: "Guide", fileName: "guide.pdf", size: 100, gameSystem: "D&D", characterIds: [original.id], lastPage: 9, createdAt: timestamp, updatedAt: timestamp });
    await db.soulReaperProgressions.update(original.id, { ...progression, sourcePdfId: documentId });

    const copy = await duplicateCharacter(original.id);
    const copiedSheet = await db.characterSheets.get(copy.id);
    const copiedSpells = await db.spells.where("characterId").equals(copy.id).toArray();
    const copiedItems = await db.inventoryItems.where("characterId").equals(copy.id).toArray();

    expect(copiedSheet).toMatchObject({ notes: "Private notes", currentHp: 17, maxHp: 30 });
    expect(copiedSpells).toEqual([expect.objectContaining({ name: "Moon Ward" })]);
    expect(copiedSpells[0].id).not.toBe(spell.id);
    expect((await db.spellbooks.get(copy.id))?.pinnedSpellIds).toEqual([copiedSpells[0].id]);
    expect(copiedItems).toEqual([expect.objectContaining({ name: "Moon Key", quantity: 2, favorite: true })]);
    expect(copiedItems[0].id).not.toBe(item.id);
    const copiedProgression = await db.soulReaperProgressions.get(copy.id);
    expect(copiedProgression).toMatchObject({ level: 5 });
    expect(copiedProgression?.sourcePdfId).not.toBe(documentId);
    expect((await db.pdfDocuments.get(documentId))?.characterIds).toEqual([original.id]);
    expect((await db.pdfDocuments.get(copiedProgression!.sourcePdfId!))?.characterIds).toEqual([copy.id]);

    await db.spells.update(copiedSpells[0].id, { name: "Changed Copy" });
    expect((await db.spells.get(spell.id))?.name).toBe("Moon Ward");
  });

  it("deleting one character preserves every other character's records", async () => {
    const doomed = await createCharacter(draft("Doomed"));
    const survivor = await createCharacter(draft("Survivor"));
    const survivorSpell = await createSpell(survivor.id, "Safe Spell");
    await createSpell(doomed.id, "Deleted Spell");
    await deleteCharacter(doomed.id);
    expect(await db.characters.get(survivor.id)).toBeTruthy();
    expect(await db.spells.get(survivorSpell.id)).toMatchObject({ name: "Safe Spell", characterId: survivor.id });
  });

  it("preserves independent framing modes and original portrait sources across character switches and reload", async () => {
    const fullImageSource = "data:image/jpeg;base64,complete-tall-artwork";
    const akiva = await createCharacter({
      ...draft("Akiva"),
      portraitDataUrl: fullImageSource,
      portraitImageId: "akiva-tall",
      portraitTransform: { mode: "contain", zoom: 1, offsetX: 0, offsetY: 0, naturalWidth: 900, naturalHeight: 1600, version: 1, updatedAt: null },
    });
    const cloud = await createCharacter({
      ...draft("Cloud"),
      portraitDataUrl: "data:image/jpeg;base64,cloud-wide",
      portraitImageId: "cloud-wide",
      portraitTransform: { mode: "cover", zoom: 1.4, offsetX: -0.1, offsetY: 0, naturalWidth: 1600, naturalHeight: 900, version: 1, updatedAt: null },
    });

    db.close();
    await db.open();

    expect(await db.characters.get(akiva.id)).toMatchObject({ portraitDataUrl: fullImageSource, portraitTransform: { mode: "contain", naturalWidth: 900, naturalHeight: 1600 } });
    expect(await db.characters.get(cloud.id)).toMatchObject({ portraitTransform: { mode: "cover", zoom: 1.4 } });
  });
});
