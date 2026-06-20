import type { CharacterImportDraft, ImportSaveMode } from "../domain/import";
import { characterSheetSchema, inventoryItemSchema, type CharacterDraft, type CharacterSheet } from "../domain/models";
import { createEmptyCharacterSheet } from "../storage/characterSheets";
import { createCharacter } from "../storage/characters";
import { db } from "../storage/database";
import { ensureDefaultContainers } from "../storage/inventory";

function appendNotes(existing: string, heading: string, value: string) {
  if (!value.trim()) return existing;
  return [existing.trim(), `${heading}\n${value.trim()}`].filter(Boolean).join("\n\n");
}

const clamp = (value: number, minimum: number, maximum: number) => Math.min(maximum, Math.max(minimum, Number.isFinite(value) ? Math.round(value) : minimum));

export async function saveCharacterImport(draft: CharacterImportDraft, mode: ImportSaveMode, existingCharacterId?: string) {
  const existing = mode === "merge" && existingCharacterId ? await db.characters.get(existingCharacterId) : undefined;
  if (mode === "merge" && !existing) throw new Error("Choose an existing character");

  let characterId = existing?.id;
  if (!characterId) {
    const characterDraft: CharacterDraft = {
      name: draft.name.include ? (draft.name.value.trim() || "Imported Character").slice(0, 100) : "Imported Character",
      playerName: draft.playerName.include ? draft.playerName.value.slice(0, 100) : "",
      campaign: "",
      ancestry: draft.ancestry.include ? draft.ancestry.value.slice(0, 100) : "",
      characterClass: draft.characterClass.include ? draft.characterClass.value.slice(0, 100) : "",
      level: draft.level.include ? clamp(draft.level.value, 1, 20) : 1,
      summary: draft.background.include ? `Background: ${draft.background.value}` : "",
    };
    characterId = (await createCharacter(characterDraft)).id;
  } else {
    await db.characters.update(characterId, {
      ...(draft.name.include ? { name: (draft.name.value.trim() || existing!.name).slice(0, 100) } : {}),
      ...(draft.playerName.include ? { playerName: draft.playerName.value.slice(0, 100) } : {}),
      ...(draft.ancestry.include ? { ancestry: draft.ancestry.value.slice(0, 100) } : {}),
      ...(draft.characterClass.include ? { characterClass: draft.characterClass.value.slice(0, 100) } : {}),
      ...(draft.level.include ? { level: clamp(draft.level.value, 1, 20) } : {}),
      ...(draft.background.include ? { summary: appendNotes(existing!.summary, "Background", draft.background.value).slice(0, 20000) } : {}),
      updatedAt: new Date().toISOString(),
    });
  }

  const storedSheet = await db.characterSheets.get(characterId);
  let sheet: CharacterSheet = storedSheet ?? createEmptyCharacterSheet(characterId);
  for (const [ability, value] of Object.entries(draft.abilityScores)) {
    if (value.include) sheet = { ...sheet, abilityScores: { ...sheet.abilityScores, [ability]: clamp(value.value, 1, 30) } };
  }
  for (const [skill, value] of Object.entries(draft.skills)) {
    if (value.include) sheet = { ...sheet, skillProficiencies: { ...sheet.skillProficiencies, [skill]: value.value } };
  }
  for (const [ability, value] of Object.entries(draft.savingThrows)) {
    if (value.include) sheet = { ...sheet, savingThrows: { ...sheet.savingThrows, [ability]: value.value } };
  }
  if (draft.currentHp.include) sheet.currentHp = Math.max(0, Math.round(draft.currentHp.value));
  if (draft.maxHp.include) sheet.maxHp = Math.max(0, Math.round(draft.maxHp.value));
  if (draft.armorClass.include) sheet.armorClass = Math.max(0, Math.round(draft.armorClass.value));
  if (draft.initiative.include) sheet.initiative = Math.round(draft.initiative.value);
  if (draft.speed.include) sheet.speed = Math.max(0, Math.round(draft.speed.value));
  if (draft.features.include) sheet.notes = appendNotes(sheet.notes, "Features / Traits", draft.features.value.join("\n"));
  if (draft.spellsAndNotes.include) sheet.notes = appendNotes(sheet.notes, "Spells / Imported Notes", draft.spellsAndNotes.value);
  sheet.notes = sheet.notes.slice(0, 50000);
  sheet.updatedAt = new Date().toISOString();
  await db.characterSheets.put(characterSheetSchema.parse(sheet));

  if (draft.inventory.include && draft.inventory.value.length) {
    const main = (await ensureDefaultContainers(characterId)).find((container) => container.name === "Main Inventory");
    if (main) {
      const timestamp = new Date().toISOString();
      await db.inventoryItems.bulkAdd(draft.inventory.value.map((name) => name.trim()).filter(Boolean).map((name) => inventoryItemSchema.parse({
        id: crypto.randomUUID(), characterId, containerId: main.id, name: name.slice(0, 200), quantity: 1,
        category: "Imported", description: `Imported from ${draft.sourceName}`, equipped: false, favorite: false,
        customRulesText: "", effectsAndStats: "", source: "Imported PDF", createdAt: timestamp, updatedAt: timestamp,
      })));
    }
  }
  return characterId;
}
