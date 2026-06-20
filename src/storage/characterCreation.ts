import type { CharacterCreationDraft, CreationEquipmentItem } from "../domain/models";
import { characterCreationDraftSchema, characterSheetSchema, inventoryItemSchema } from "../domain/models";
import { proficiencyBonusForLevel } from "../domain/dndMath";
import { createCharacter } from "./characters";
import { db } from "./database";
import { ensureDefaultContainers } from "./inventory";
import { createEmptySpell, getOrCreateSpellbook } from "./spellbooks";
import { abilityIds, createCharacterSheetDraft, skillIds } from "./characterSheets";

const draftId = "new-character" as const;

function now() {
  return new Date().toISOString();
}

export function createEmptyCreationDraft(): CharacterCreationDraft {
  const timestamp = now();
  return characterCreationDraftSchema.parse({
    id: draftId,
    step: 0,
    character: {
      name: "",
      playerName: "",
      campaign: "",
      level: 1,
      characterClass: "",
      ancestry: "",
      background: "",
      summary: "",
      concept: "",
      personalityNotes: "",
      backstory: "",
      goals: "",
      importantRelationships: "",
      roleplayNotes: "",
    },
    sheet: createCharacterSheetDraft(1),
    equipment: [],
    updatedAt: timestamp,
  });
}

export async function getOrCreateCreationDraft() {
  const stored = await db.characterCreationDrafts.get(draftId);
  const parsed = characterCreationDraftSchema.safeParse(stored);
  if (parsed.success) return parsed.data;
  const draft = createEmptyCreationDraft();
  await db.characterCreationDrafts.put(draft);
  return draft;
}

export async function saveCreationDraft(draft: CharacterCreationDraft) {
  const level = Math.max(1, Math.min(20, Math.round(Number(draft.character.level) || 1)));
  const calculatedProficiency = proficiencyBonusForLevel(level);
  const proficiencyBonus = draft.sheet.proficiencyBonus === 2 && calculatedProficiency > 2
    ? calculatedProficiency
    : draft.sheet.proficiencyBonus || calculatedProficiency;
  const normalized = characterCreationDraftSchema.parse({
    ...draft,
    character: {
      ...draft.character,
      level,
    },
    sheet: {
      ...draft.sheet,
      proficiencyBonus,
    },
    updatedAt: now(),
  });
  await db.characterCreationDrafts.put(normalized);
  return normalized;
}

export async function resetCreationDraft() {
  const draft = createEmptyCreationDraft();
  await db.characterCreationDrafts.put(draft);
  return draft;
}

function textLines(value: string) {
  return value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
}

export async function createCharacterFromCreationDraft(draft: CharacterCreationDraft) {
  const parsed = characterCreationDraftSchema.parse(draft);
  if (!parsed.character.name.trim()) throw new Error("Character name is required");
  if (!parsed.character.characterClass.trim()) throw new Error("Class is required");
  if (!parsed.character.ancestry.trim()) throw new Error("Species or ancestry is required");

  const character = await createCharacter({
    ...parsed.character,
    name: parsed.character.name.trim(),
    summary: parsed.character.summary || parsed.character.concept || parsed.character.backstory,
  });

  const sheet = characterSheetSchema.parse({
    ...parsed.sheet,
    characterId: character.id,
    updatedAt: now(),
    proficiencyBonus: parsed.sheet.proficiencyBonus || proficiencyBonusForLevel(parsed.character.level),
    savingThrows: Object.fromEntries(abilityIds.map((ability) => [ability, parsed.sheet.savingThrows[ability] ?? false])),
    skillProficiencies: Object.fromEntries(skillIds.map((skill) => [skill, parsed.sheet.skillProficiencies[skill] ?? false])),
  });
  await db.characterSheets.put(sheet);

  const main = (await ensureDefaultContainers(character.id)).find((container) => container.name === "Main Inventory");
  if (main) {
    const timestamp = now();
    const items = parsed.equipment
      .filter((item: CreationEquipmentItem) => item.name.trim())
      .map((item) => inventoryItemSchema.parse({
        id: crypto.randomUUID(),
        characterId: character.id,
        containerId: main.id,
        name: item.name.trim().slice(0, 200),
        quantity: item.quantity,
        category: "Starting equipment",
        description: item.notes,
        equipped: item.equipped,
        favorite: false,
        customRulesText: "",
        effectsAndStats: "",
        createdAt: timestamp,
        updatedAt: timestamp,
      }));
    if (items.length) await db.inventoryItems.bulkAdd(items);
  }

  await getOrCreateSpellbook(character.id);
  const spellNames = [...textLines(sheet.cantrips), ...textLines(sheet.preparedSpells)];
  if (spellNames.length) {
    await db.spells.bulkAdd(spellNames.map((name) => createEmptySpell(character.id, name)));
  }

  await db.characterCreationDrafts.delete(draftId);
  return character;
}
