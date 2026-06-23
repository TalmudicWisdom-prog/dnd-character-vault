import type { CharacterCreationDraft, CreationEquipmentItem } from "../domain/models";
import { characterCreationDraftSchema, characterSheetSchema, inventoryItemSchema } from "../domain/models";
import { proficiencyBonusForLevel } from "../domain/dndMath";
import { srdSpell } from "../rules/srd";
import { createCharacter } from "./characters";
import { db } from "./database";
import { ensureDefaultContainers } from "./inventory";
import { createEmptySpell, createSpellFromSrd, getOrCreateSpellbook } from "./spellbooks";
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
    creationMode: "guided",
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
    abilityScoreSetup: {
      mode: "guided",
      guidedMethod: "standardArray",
      standardArrayAssignments: {},
      rolledScores: [],
      rolledAssignments: {},
    },
    srdEquipmentSelections: {},
    srdSelectedCantripIds: [],
    srdSelectedSpellIds: [],
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
  const creationMode = draft.creationMode ?? "guided";
  const proficiencyBonus = creationMode === "guided"
    ? calculatedProficiency
    : draft.sheet.proficiencyBonus || calculatedProficiency;
  const normalized = characterCreationDraftSchema.parse({
    ...draft,
    creationMode,
    character: {
      ...draft.character,
      level,
    },
    sheet: {
      ...draft.sheet,
      proficiencyBonus,
    },
    abilityScoreSetup: draft.abilityScoreSetup ?? {},
    srdEquipmentSelections: draft.srdEquipmentSelections ?? {},
    srdSelectedCantripIds: draft.srdSelectedCantripIds ?? [],
    srdSelectedSpellIds: draft.srdSelectedSpellIds ?? [],
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
        source: item.source ?? "Manual",
        createdAt: timestamp,
        updatedAt: timestamp,
      }));
    if (items.length) await db.inventoryItems.bulkAdd(items);
  }

  await getOrCreateSpellbook(character.id);
  const selectedSrdSpells = [...parsed.srdSelectedCantripIds, ...parsed.srdSelectedSpellIds]
    .map((id) => srdSpell(id))
    .filter((spell): spell is NonNullable<typeof spell> => Boolean(spell));
  const selectedSrdNames = new Set(selectedSrdSpells.map((spell) => spell.name.toLocaleLowerCase()));
  const manualSpellNames = [...textLines(sheet.cantrips), ...textLines(sheet.preparedSpells)]
    .filter((name) => !selectedSrdNames.has(name.toLocaleLowerCase()));
  const spells = [
    ...selectedSrdSpells.map((spell) => createSpellFromSrd(character.id, spell)),
    ...manualSpellNames.map((name) => createEmptySpell(character.id, name)),
  ];
  if (spells.length) {
    await db.spells.bulkAdd(spells);
  }

  await db.characterCreationDrafts.delete(draftId);
  return character;
}
