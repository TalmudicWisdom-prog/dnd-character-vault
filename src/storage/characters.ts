import type { Character, CharacterDraft } from "../domain/models";
import { characterDraftSchema, characterSchema } from "../domain/models";
import { db } from "./database";
import { copyInventory } from "./inventory";
import { copySoulReaperProgression } from "./soulReaper";
import { copySpellbook } from "./spellbooks";

function now() {
  return new Date().toISOString();
}

export async function createCharacter(draft: CharacterDraft): Promise<Character> {
  const createdAt = now();
  const character = characterSchema.parse({
    ...characterDraftSchema.parse(draft),
    id: crypto.randomUUID(),
    archivedAt: null,
    createdAt,
    updatedAt: createdAt,
  });

  await db.characters.add(character);
  return character;
}

export async function updateCharacter(id: string, draft: CharacterDraft): Promise<Character> {
  const current = await db.characters.get(id);
  if (!current) throw new Error("Character not found");

  const character = characterSchema.parse({
    ...current,
    ...characterDraftSchema.parse({ ...current, ...draft }),
    updatedAt: now(),
  });

  await db.characters.put(character);
  return character;
}

export async function duplicateCharacter(id: string): Promise<Character> {
  const current = await db.characters.get(id);
  if (!current) throw new Error("Character not found");

  const copy = await createCharacter({
    name: `${current.name} Copy`,
    summary: current.summary,
    playerName: current.playerName,
    campaign: current.campaign,
    ancestry: current.ancestry,
    characterClass: current.characterClass,
    background: current.background,
    concept: current.concept,
    portraitDataUrl: current.portraitDataUrl,
    personalityNotes: current.personalityNotes,
    backstory: current.backstory,
    goals: current.goals,
    importantRelationships: current.importantRelationships,
    roleplayNotes: current.roleplayNotes,
    level: current.level,
  });
  const sheet = await db.characterSheets.get(id);
  if (sheet) {
    await db.characterSheets.put({
      ...sheet,
      characterId: copy.id,
      updatedAt: copy.updatedAt,
    });
  }
  await copyInventory(id, copy.id);
  await copySoulReaperProgression(id, copy.id);
  await copySpellbook(id, copy.id);
  return copy;
}

export async function setCharacterArchived(id: string, archived: boolean) {
  const updatedAt = now();
  await db.characters.update(id, {
    archivedAt: archived ? updatedAt : null,
    updatedAt,
  });
}

export async function deleteCharacter(id: string) {
  await db.transaction("rw", [db.characters, db.characterSheets, db.inventoryContainers, db.inventoryItems, db.spellbooks, db.spells, db.soulReaperProgressions, db.pdfDocuments], async () => {
    await db.characters.delete(id);
    await db.characterSheets.delete(id);
    await db.inventoryItems.where("characterId").equals(id).delete();
    await db.inventoryContainers.where("characterId").equals(id).delete();
    await db.spells.where("characterId").equals(id).delete();
    await db.spellbooks.delete(id);
    await db.soulReaperProgressions.delete(id);
    await db.pdfDocuments.where("characterIds").equals(id).modify((document) => {
      document.characterIds = document.characterIds.filter((characterId: string) => characterId !== id);
    });
  });
}
